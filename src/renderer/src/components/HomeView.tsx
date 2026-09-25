import {EmployeeInitialization} from './EmployeeInitialization'
import {CloneEmployeeForm} from './CloneEmployeeForm'
import type {RemoteCheck,RemoteHealth} from '../../../shared/remote'
import { useCallback, useEffect,useRef, useState } from 'react'
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
export function HomeView({ store, view, busyIds,disconnectedIds,activities, onOpen, act, onResize }: {activities:Record<string,ActivityPreview>;store:Store;view:ViewState;busyIds:Set<string>;disconnectedIds:Set<string>;onOpen:(card:StoredSession)=>void;act:Action;onResize:(width:number|undefined)=>void}) {
  const panel: {kind:'employee';card?:StoredSession}|{kind:'team';name?:string;settings?:TeamSettings}|null=view.kind==='team'?{kind:'team' as const,name:view.name,settings:view.settings}:view.kind==='employee'?{kind:'employee' as const,card:store.sessions.find(c=>c.id===view.employee)}:null
  const initializing=view.kind==='initialization'?store.sessions.find(card=>card.id===view.employee):undefined
  const cloning=view.kind==='clone'?store.sessions.find(c=>c.id===view.employee):undefined
  const workspace=view.kind==='workspace'?view.name??null:null
  const setPanel=(value:typeof panel)=>value?act('view.open',value.kind==='employee'?{kind:'employee',employee:value.card?.id}:value):act('view.close')
  const setWorkspace=(name:string|null)=>name?act('view.open',{kind:'workspace',name}):act('view.close')
  const pluginId=view.pluginId??null
  const selectedView=store.teamViews?.find(item=>item.id===store.activeTeamViewId)
  const visibleGroups=selectedView?store.groups.filter(name=>selectedView.teams.includes(name)):store.groups
  const canvasStore=selectedView?{...store,groups:visibleGroups,sessions:store.sessions.filter(card=>visibleGroups.includes(card.group))}:store
  const [plugins,setPlugins]=useState<PluginDescriptor[]>([])
  useEffect(()=>{const load=()=>void api.call<PluginDescriptor[]>('plugin.list').then(setPlugins).catch(()=>{});load();return api.onEvent(e=>{if(e.channel==='store:changed')load()})},[])
  const [cloudStatus,setCloudStatus]=useState<Record<string,HostHealth>>({})
  const cloudKey=JSON.stringify(visibleGroups.filter(name=>teamSettings(store,name).mode==='cloud').map(name=>[name,teamSettings(store,name).hostId,teamSettings(store,name).remote]))
  useEffect(()=>{
    const teams=JSON.parse(cloudKey) as [string,string|undefined,unknown][]
    let active=true,busy=false
    const update=(name:string,status:HostHealth)=>{if(active)setCloudStatus(previous=>status.checkedAt!==(undefined)&&status.checkedAt<(previous[name]?.checkedAt??0)?previous:{...previous,[name]:status})}
    const check=async()=>{
      if(busy)return;busy=true
      await Promise.all(teams.map(async ([name,hostId])=>{
        if(hostId){try{update(name,await api.call<HostHealth>('host.check',{id:hostId}))}catch(error){update(name,{connected:false,checkedAt:Date.now(),error:(error as Error).message})}}
        else try{const result=await api.call<RemoteCheck>('remote.check',{team:name});update(name,{connected:true,checkedAt:Date.now(),environment:result.environment})}
        catch(error){update(name,{connected:false,checkedAt:Date.now(),error:(error as Error).message})}
      }))
      busy=false
    }
    setCloudStatus({});void check();const timer=setInterval(()=>void check(),10000)
    const onFocus=()=>void check()
    const off=api.onEvent(event=>{if(event.channel!=='host:health')return;const {id,status}=event.payload as {id:string;status:HostHealth};for(const [name,hostId] of teams)if(hostId===id)update(name,status)})
    window.addEventListener('focus',onFocus)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',onFocus);off()}
  },[cloudKey])
  const camera=useRef({view:DEFAULT_VIEW,size:{x:1200,y:800}})
  const onView=useCallback((view:Viewport,size:Point)=>{camera.current={view,size}},[])
  useDialogFocus('.office-panel',!!panel||!!cloning||view.kind==='settings')
  const showPanel=(value:NonNullable<typeof panel>)=>setPanel(value)
  const open=useCallback((card:StoredSession)=>onOpen(card),[onOpen])
  const edit=useCallback((name:string)=>{if(name&&store.teamRoots?.[name])setWorkspace(name);else setPanel({kind:'team',name:name||undefined})},[store.teamRoots])
  const fresh=initialBounds(store.groups.length)
  fresh.x=(camera.current.size.x/2-camera.current.view.x)/camera.current.view.zoom-fresh.width/2
  fresh.y=(camera.current.size.y/2-camera.current.view.y)/camera.current.view.zoom-fresh.height/2
  return <div className="home office-home">
    <header className="company-header">
      <div className="company-brand"><span className="brand-symbol" aria-hidden="true"><i/><i/><i/><i/></span><span>Agents Company</span></div>
      <TeamViews store={store} act={act}/>
      <div className="company-actions"><button className="add-team" onClick={()=>void showPanel({kind:'team'})}><span>＋</span> 添加 Team</button><button className="add-employee" onClick={()=>void showPanel({kind:'employee'})}><span>＋</span> 添加员工</button></div>
    </header>
    <div className={`office-layout ${view.shared?'shared-open':''}`}><PluginDirectory plugins={plugins} active={pluginId} store={store} sharedOpen={!!view.shared} onOpen={id=>void act('plugin.open',{id})} onHome={()=>void act('view.open',{kind:'home'})} onSettings={()=>void act('view.open',{kind:'settings'})} onResize={onResize} act={act}/>{view.shared&&<SharedDrawer onClose={()=>void act('view.shared',{enabled:false})}/>}<OfficeCanvas key={`${store.activeTeamViewId??ALL_TEAM_VIEW}:${selectedView?JSON.stringify(selectedView.teams):''}`} activities={activities} cloudStatus={cloudStatus} store={canvasStore} busyIds={busyIds} disconnectedIds={disconnectedIds} act={act} onOpen={open} onEdit={edit} onView={onView}/></div>
    {initializing&&<EmployeeInitialization employee={initializing} onClose={()=>void act('view.close')}/>}
    {view.kind==='settings'&&<SettingsPanel value={{...DEFAULT_PREFERENCES,...store.preferences}} onSave={value=>act('settings.set',value)} onClose={()=>void act('view.close')}/>}
    {workspace&&<TeamWorkspace key={workspace} name={workspace} root={store.teamRoots?.[workspace]||''} settings={teamSettings(store,workspace)} onClose={()=>setWorkspace(null)} onSettings={()=>{void setPanel({kind:'team',name:workspace})}}/>}
    {cloning&&<div className="office-panel-wrap" onKeyDown={e=>{if(e.key==='Escape')void act('view.close')}}><div className="panel-backdrop" onClick={()=>void act('view.close')}/><section className="office-panel" role="dialog" aria-modal="true" aria-label="克隆员工"><header className="panel-header"><h2>克隆员工</h2><button className="panel-close" aria-label="关闭面板" onClick={()=>void act('view.close')}>×</button></header><CloneEmployeeForm source={cloning} root={store.teamRoots?.[cloning.group]??''} onCreated={()=>void act('view.close')}/></section></div>}
    {panel&&<div className="office-panel-wrap" onKeyDown={e=>{if(e.key==='Escape')setPanel(null)}}>
      <div className="panel-backdrop" onClick={()=>setPanel(null)}/>
      <section className="office-panel" role="dialog" aria-modal="true" aria-label={panel.kind==='employee'?'员工资料':'编辑 Team'}>
        <header className="panel-header"><div><span className="eyebrow">{panel.kind==='employee'?'A COMPANION WITH A PLACE OF THEIR OWN':'TEAM WORKSPACE'}</span><h2>{panel.kind==='employee'?(panel.card?'配置员工工作空间':'认识你的新伙伴。'):panel.name===undefined?'创建 Team':`${panel.name||'待分配员工'} 的空间`}</h2></div><button className="panel-close" onClick={()=>setPanel(null)} aria-label="关闭面板">×</button></header>
        {panel.kind==='employee'?<><p className="workspace-note">{panel.card?.workspaceError}</p><EmployeeForm employee={panel.card} groups={store.groups} roots={store.teamRoots??{}} settings={store.teamSettings} onSave={async fields=>{
          const {teamRoot,...patch}=fields
          if(teamRoot&&teamRoot!==store.teamRoots?.[fields.group])await api.call('group.root',{name:fields.group,root:teamRoot,create:true})
          const result=panel.card?await api.call('card.update',{id:panel.card.id,patch}):await api.call('card.create',patch)
          if(result)await setPanel(null);return !!result
        }} onBound={card=>void act('view.open',{kind:'conversation',employee:card.id})}/></>:<TeamForm name={panel.name} root={store.teamRoots?.[panel.name??'']} settings={panel.settings??teamSettings(store,panel.name??'')} plugins={plugins} employeeCount={store.sessions.filter(card=>card.group===panel.name).length} index={Math.max(0,panel.name===undefined?store.groups.length:store.groups.indexOf(panel.name))}
          layout={panel.name===undefined?{col:0,row:0,w:1,h:1,bounds:fresh}:{...(store.rooms?.[panel.name]??{col:0,row:0,w:1,h:1}),bounds:planOffice(store).find(room=>room.name===panel.name)?.bounds}}
          onSave={async(name,root,design,bounds,config)=>{
            const target=name===''?'':name.trim()
            if(panel.name!==undefined&&target!==panel.name&&store.groups.includes(target))throw new Error('同名 Team 已存在')
            if(panel.name===undefined) {if(!await act('group.add',{name:target,root,...config}))return false}
            else {
              const before=teamSettings(store,panel.name)
              if(before.mode!==config.mode||before.pluginId!==config.pluginId||before.hostId!==config.hostId||before.directory!==config.directory||JSON.stringify(before.remote)!==JSON.stringify(config.remote)){if(!await act('group.configure',{name:panel.name,root,...config}))return false}
              else if(config.mode!=='cloud'){
                if(config.directoryMode==='bind'&&(before.directoryMode!=='bind'||root!==store.teamRoots?.[panel.name])){if(!await act('group.root',{name:panel.name,root,directoryMode:'bind'}))return false}
                if(config.directoryMode!=='bind'&&before.directoryMode==='bind')throw new Error('已有绑定目录不会自动搬迁；请保留绑定或新建 Team')
              }
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
}
