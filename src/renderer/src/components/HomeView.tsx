import type {ManagementInteraction} from '../../../shared/management'
import {EmployeeDeleteDialog} from './EmployeeDeleteDialog'
import {EmployeeInitialization} from './EmployeeInitialization'
import {CloneEmployeeForm} from './CloneEmployeeForm'
import type {RemoteCheck,RemoteHealth} from '../../../shared/remote'
import { memo, useCallback, useEffect,useRef, useState } from 'react'
import {ALL_TEAM_VIEW,teamSettings,type ActivityPreview,type TeamSettings,type Store,type StoredSession} from '../../../shared/types'
import type {PluginDescriptor} from '../../../shared/plugins'
import {api} from '../api'
import type {ViewState} from '../../../shared/view'
import {SettingsPanel} from './SettingsPanel'
import {DEFAULT_PREFERENCES} from '../../../shared/preferences'
import {PluginDirectory} from './PluginDirectory'
import { initialBounds, planOffice, DEFAULT_VIEW, type Point, type Viewport } from '../../../shared/canvas'
import { OfficeCanvas } from '../office/OfficeCanvas'
import { useDialogFocus } from '../office/useDialogFocus'
import { EmployeeForm, TeamForm } from '../office/OfficeForms'
import { SharedDrawer } from './SharedDrawer'
import { TeamWorkspace } from './TeamWorkspace'
import {TeamViews} from './TeamViews'

type Action = (cmd: string, args?: Record<string, unknown>) => Promise<any>
type HostHealth=RemoteHealth&{checkedAt?:number;error?:string}
export const HomeView=memo(function HomeView({ store, view, busyIds,disconnectedIds,activities,interactions, onOpen, act, onResize }: {interactions:ManagementInteraction[];activities:Record<string,ActivityPreview>;store:Store;view:ViewState;busyIds:Set<string>;disconnectedIds:Set<string>;onOpen:(card:StoredSession)=>void;act:Action;onResize:(width:number|undefined)=>void}) {
  const panel: {kind:'employee';card?:StoredSession}|{kind:'team';name?:string;settings?:TeamSettings}|null=view.kind==='team'?{kind:'team' as const,name:view.name,settings:view.settings}:view.kind==='employee'?{kind:'employee' as const,card:store.sessions.find(c=>c.id===view.employee)}:null
  const initializing=view.kind==='initialization'?store.sessions.find(card=>card.id===view.employee):undefined
  const cloning=view.kind==='clone'?store.sessions.find(c=>c.id===view.employee):undefined
  const workspace=view.kind==='workspace'?view.name??null:null
  const setPanel=(value:typeof panel)=>value?act('view.open',value.kind==='employee'?{kind:'employee',employee:value.card?.id}:value):act('view.close')
  const setWorkspace=(name:string|null)=>name?act('view.open',{kind:'workspace',name}):act('view.close')
  const pluginId=view.pluginId??null
  const selectedView=store.teamViews?.find(item=>item.id===store.activeTeamViewId)
  const visibleGroups=selectedView?store.groups.filter(name=>selectedView.teams.includes(name)):store.groups
  const [editMode,setEditMode]=useState<'employee'|'team'|null>(null),[selected,setSelected]=useState<string[]>([])
  const [removal,setRemoval]=useState<{employees:StoredSession[];teams?:string[]}|null>(null)
  const selectionKey=JSON.stringify([store.activeTeamViewId,visibleGroups])
  useEffect(()=>{setSelected([])},[selectionKey])
  const selectedIds=selected.filter(id=>editMode==='team'?visibleGroups.includes(id):store.sessions.some(card=>card.id===id&&visibleGroups.includes(card.group)))
  const chooseMode=(mode:typeof editMode)=>{setSelected([]);setEditMode(mode)}
  const toggleSelection=(id:string)=>setSelected(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id])
  const deleteSelection=()=>setRemoval({employees:store.sessions.filter(card=>editMode==='team'?selectedIds.includes(card.group):selectedIds.includes(card.id)),...(editMode==='team'?{teams:[...selectedIds]}:{})})
  const [plugins,setPlugins]=useState<PluginDescriptor[]>([])
  useEffect(()=>{const load=()=>void api.call<PluginDescriptor[]>('plugin.list').then(setPlugins).catch(()=>{});load();return api.onEvent(e=>{if(e.channel==='store:changed')load()})},[])
  const [cloudStatus,setCloudStatus]=useState<Record<string,HostHealth>>({})
  const cloudKey=JSON.stringify(visibleGroups.filter(name=>teamSettings(store,name).mode==='cloud').map(name=>[name,teamSettings(store,name).hostId,teamSettings(store,name).remote]))
  const [checkingHosts,setCheckingHosts]=useState(false),checkingHostsRef=useRef(false)
  useEffect(()=>{
    const teams=JSON.parse(cloudKey) as [string,string|undefined,unknown][]
    let active=true
    const update=(id:string,status:HostHealth)=>{if(active)setCloudStatus(previous=>{
      const next={...previous};for(const [name,hostId] of teams)if(hostId===id&&(status.checkedAt??0)>=(previous[name]?.checkedAt??0))next[name]=status
      return next
    })}
    // Read the last saved result only. SSH probes are explicitly requested by the user.
    void api.call<Array<{id:string;status?:HostHealth}>>('host.list').then(hosts=>{for(const host of hosts)if(host.status)update(host.id,host.status)}).catch(()=>{})
    const off=api.onEvent(event=>{if(event.channel==='host:health'){const {id,status}=event.payload as {id:string;status:HostHealth};update(id,status)}})
    return()=>{active=false;off()}
  },[cloudKey])
  const refreshHosts=async()=>{
    if(checkingHostsRef.current)return
    checkingHostsRef.current=true;setCheckingHosts(true)
    const teams=JSON.parse(cloudKey) as [string,string|undefined,unknown][]
    const hosts=new Map(teams.map(team=>[team[1]??team[0],team]))
    try{await Promise.all([...hosts.values()].map(async([name,hostId])=>{
      let status:HostHealth
      try{status=hostId?await api.call<HostHealth>('host.check',{id:hostId}):{connected:true,checkedAt:Date.now(),environment:(await api.call<RemoteCheck>('remote.check',{team:name})).environment}}
      catch(error){status={connected:false,checkedAt:Date.now(),error:(error as Error).message}}
      setCloudStatus(previous=>({...previous,...Object.fromEntries(teams.filter(team=>hostId?team[1]===hostId:team[0]===name).map(([team])=>[team,status]))}))
    }))}finally{checkingHostsRef.current=false;setCheckingHosts(false)}
  }
  const camera=useRef({view:DEFAULT_VIEW,size:{x:1200,y:800}})
  const onView=useCallback((view:Viewport,size:Point)=>{camera.current={view,size}},[])
  useDialogFocus('.office-panel',!!panel||!!cloning||view.kind==='settings')
  const showPanel=(value:NonNullable<typeof panel>)=>setPanel(value)
  const open=useCallback((card:StoredSession)=>onOpen(card),[onOpen])
  const edit=useCallback((name:string)=>{if(name&&store.teamRoots?.[name])setWorkspace(name);else setPanel({kind:'team',name:name||undefined})},[store.teamRoots])
  const fresh=initialBounds(store.groups.length)
  fresh.x=(camera.current.size.x/2-camera.current.view.x)/camera.current.view.zoom-fresh.width/2
  fresh.y=(camera.current.size.y/2-camera.current.view.y)/camera.current.view.zoom-fresh.height/2
  const lastEmployee=store.lastEmployeeTemplate??store.sessions.reduce<StoredSession|undefined>((latest,card)=>!latest||card.createdAt>latest.createdAt?card:latest,undefined)
  const lastTeam=store.groups.at(-1)
  return <div className="home office-home">
    <header className="company-header">
      <div className="company-brand"><span className="brand-symbol" aria-hidden="true"><i/><i/><i/><i/></span><span>Agents Company</span></div>
      <TeamViews store={store} act={act}/>
      <div className="company-actions"><button className="add-team" onClick={()=>void showPanel({kind:'team'})}><span>＋</span> 添加 Team</button><button className="add-employee" onClick={()=>void showPanel({kind:'employee'})}><span>＋</span> 添加员工</button></div>
    </header>
    <div className={`office-layout ${view.shared?'shared-open':''}`}><PluginDirectory editing={editMode!==null} onToggleEdit={()=>chooseMode(editMode?null:'employee')} checkingHosts={checkingHosts} onRefreshHosts={()=>void refreshHosts()} plugins={plugins} active={pluginId} store={store} sharedOpen={!!view.shared} onOpen={id=>void act('plugin.open',{id})} onHome={()=>void act('view.open',{kind:'home'})} onSettings={()=>void act('view.open',{kind:'settings'})} onResize={onResize} act={act}/>{view.shared&&<SharedDrawer onClose={()=>void act('view.shared',{enabled:false})}/>}<OfficeCanvas selection={editMode?{mode:editMode,ids:new Set(selectedIds),toggle:toggleSelection}:undefined} interactions={interactions} key={`${store.activeTeamViewId??ALL_TEAM_VIEW}:${selectedView?JSON.stringify(selectedView.teams):''}`} activities={activities} cloudStatus={cloudStatus} plugins={plugins} store={store} busyIds={busyIds} disconnectedIds={disconnectedIds} act={act} onOpen={open} onEdit={edit} onView={onView}/></div>
    {editMode&&<aside className="canvas-edit-toolbar" role="toolbar" aria-label="画布编辑">
      <div className="canvas-edit-modes"><button aria-pressed={editMode==='employee'} onClick={()=>chooseMode('employee')}>选中员工</button><button aria-pressed={editMode==='team'} onClick={()=>chooseMode('team')}>选中团队</button></div>
      <p>点击画布中的{editMode==='employee'?'员工':'团队'}进行多选。</p>
      <div className="canvas-edit-selection"><span role="status">已选 {selectedIds.length} {editMode==='employee'?'名员工':'个团队'}</span><button disabled={!selectedIds.length} onClick={()=>setSelected([])}>清空选择</button></div>
      <footer><button className="delete-selected" disabled={!selectedIds.length} onClick={deleteSelection}>删除所选</button><button onClick={()=>chooseMode(null)}>退出编辑</button></footer>
    </aside>}
    {removal&&<EmployeeDeleteDialog employees={removal.employees} teams={removal.teams} onCancel={()=>setRemoval(null)} onRemove={async deleteWorkspace=>{
      await api.call(removal.teams?'group.remove':'card.remove',{...(removal.teams?{names:removal.teams}:{ids:removal.employees.map(card=>card.id)}),deleteWorkspace})
      setRemoval(null);setSelected([])
    }}/>}
    {initializing&&<EmployeeInitialization employee={initializing} onClose={()=>void act('view.close')}/>}
    {view.kind==='settings'&&<SettingsPanel value={{...DEFAULT_PREFERENCES,...store.preferences}} onSave={value=>act('settings.set',value)} onClose={()=>void act('view.close')}/>}
    {workspace&&<TeamWorkspace key={workspace} name={workspace} root={store.teamRoots?.[workspace]||''} settings={teamSettings(store,workspace)} onClose={()=>setWorkspace(null)} onSettings={()=>{void setPanel({kind:'team',name:workspace})}}/>}
    {cloning&&<div className="office-panel-wrap" onKeyDown={e=>{if(e.key==='Escape')void act('view.close')}}><div className="panel-backdrop" onClick={()=>void act('view.close')}/><section className="office-panel" role="dialog" aria-modal="true" aria-label="克隆员工"><header className="panel-header"><h2>克隆员工</h2><button className="panel-close" aria-label="关闭面板" onClick={()=>void act('view.close')}>×</button></header><CloneEmployeeForm source={cloning} root={store.teamRoots?.[cloning.group]??''} onCreated={()=>void act('view.close')}/></section></div>}
    {panel&&<div className="office-panel-wrap" onKeyDown={e=>{if(e.key==='Escape')setPanel(null)}}>
      <div className="panel-backdrop" onClick={()=>setPanel(null)}/>
      <section className="office-panel" role="dialog" aria-modal="true" aria-label={panel.kind==='employee'?'员工资料':'编辑 Team'}>
        <header className="panel-header"><div><span className="eyebrow">{panel.kind==='employee'?'A COMPANION WITH A PLACE OF THEIR OWN':'TEAM WORKSPACE'}</span><h2>{panel.kind==='employee'?(panel.card?'配置员工工作空间':'认识你的新伙伴。'):panel.name===undefined?'创建 Team':`${panel.name||'待分配员工'} 的空间`}</h2></div><button className="panel-close" onClick={()=>setPanel(null)} aria-label="关闭面板">×</button></header>
        {panel.kind==='employee'?<><p className="workspace-note">{panel.card?.workspaceError}</p><EmployeeForm employee={panel.card} template={panel.card?undefined:lastEmployee} groups={store.groups} roots={store.teamRoots??{}} settings={store.teamSettings} onSave={async fields=>{
          const {teamRoot,...patch}=fields
          if(teamRoot&&teamRoot!==store.teamRoots?.[fields.group])await api.call('group.root',{name:fields.group,root:teamRoot,create:true})
          const result=panel.card?await api.call('card.update',{id:panel.card.id,patch}):await api.call('card.create',patch)
          if(result)await setPanel(null);return !!result
        }} onBound={card=>void act('view.open',{kind:'conversation',employee:card.id})}/></>:<TeamForm name={panel.name} root={store.teamRoots?.[panel.name??'']} settings={panel.settings??teamSettings(store,panel.name??'')} template={panel.name===undefined?(store.lastTeamTemplate??(lastTeam?{settings:teamSettings(store,lastTeam),design:store.rooms?.[lastTeam]?.design,bounds:planOffice(store).find(room=>room.name===lastTeam)?.bounds}:undefined)):undefined} plugins={plugins} employeeCount={store.sessions.filter(card=>card.group===panel.name).length} index={Math.max(0,panel.name===undefined?store.groups.length:store.groups.indexOf(panel.name))}
          layout={panel.name===undefined?{col:0,row:0,w:1,h:1,bounds:fresh}:{...(store.rooms?.[panel.name]??{col:0,row:0,w:1,h:1}),bounds:planOffice(store).find(room=>room.name===panel.name)?.bounds}}
          onSave={async(name,root,design,bounds,config)=>{
            const target=name===''?'':name.trim()
            if(panel.name!==undefined&&target!==panel.name&&store.groups.includes(target))throw new Error('同名 Team 已存在')
            if(panel.name===undefined) {if(!await act('group.add',{name:target,root,...config}))return false}
            else {
              const before=teamSettings(store,panel.name)
              if(root!==store.teamRoots?.[panel.name]||before.mode!==config.mode||before.pluginId!==config.pluginId||before.hostId!==config.hostId||before.directory!==config.directory)throw new Error('Team 工作方式和工作目录创建后不可更换')
              if(target!==panel.name&&!await act('group.rename',{name:panel.name,nextName:target}))return false
            }
            const geometry=panel.name===undefined?bounds:{width:bounds.width,height:bounds.height,shape:bounds.shape,arrangement:bounds.arrangement,points:bounds.points}
            if(!await act('room.bounds',{name:target,bounds:geometry}))return false
            if(!await act('room.design',{name:target,design}))return false
            setPanel(null);return true
          }} onRemove={panel.name?async()=>{if(await act('group.remove',{name:panel.name}))setPanel(null)}:undefined}/>} 
      </section>
    </div>}
  </div>
})
