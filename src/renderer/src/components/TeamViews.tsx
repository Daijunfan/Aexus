import {useEffect,useRef,useState,type DragEvent} from 'react'
import {ALL_TEAM_VIEW,teamSettings,type Store} from '../../../shared/types'
import {api} from '../api'

export function TeamViews({store,act}:{store:Store;act:(cmd:string,args?:Record<string,unknown>)=>Promise<any>}){
  const active=store.activeTeamViewId??ALL_TEAM_VIEW
  const views=[{id:ALL_TEAM_VIEW,name:'All Team',teams:store.groups},...(store.teamViews??[])]
  const activeTab=useRef<HTMLSpanElement>(null)
  useEffect(()=>{activeTab.current?.scrollIntoView({block:'nearest',inline:'nearest'})},[active,views.length])
  const [editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[teams,setTeams]=useState<string[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const [dragging,setDragging]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<{id:string;before:boolean}|null>(null)
  const open=(id:string)=>{const current=views.find(view=>view.id===id);setEditing(id);setName(current?.name??'');setTeams(current?.teams??[]);setError('')}
  const save=async()=>{
    if(!editing)return
    setSaving(true);setError('')
    try{
      if(editing==='new')await api.call('team-view.create',{name,teams})
      else await api.call('team-view.update',{id:editing,patch:{name,teams}})
      setEditing(null)
    }catch(cause){setError((cause as Error).message)}finally{setSaving(false)}
  }
  const remove=async()=>{
    if(!editing||editing==='new')return
    setSaving(true);setError('')
    try{await api.call('team-view.remove',{id:editing});setEditing(null)}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}
  }
  const dragOver=(event:DragEvent<HTMLButtonElement>,id:string)=>{
    if(!dragging)return
    event.preventDefault();event.dataTransfer.dropEffect='move'
    const box=event.currentTarget.getBoundingClientRect()
    setDropTarget({id,before:id===ALL_TEAM_VIEW||event.clientX<box.left+box.width/2})
  }
  const drop=(event:DragEvent<HTMLButtonElement>,id:string)=>{
    if(!dragging)return
    event.preventDefault();setDragging(null);setDropTarget(null)
    if(dragging===id)return
    const remaining=(store.teamViews??[]).filter(view=>view.id!==dragging)
    const box=event.currentTarget.getBoundingClientRect()
    const before=event.clientX<box.left+box.width/2
    const target=id===ALL_TEAM_VIEW?0:remaining.findIndex(view=>view.id===id)+(before?0:1)
    if(target<0||target===(store.teamViews??[]).findIndex(view=>view.id===dragging))return
    void act('team-view.update',{id:dragging,patch:{index:target}})
  }
  return <>
    <nav className="team-view-tabs" aria-label="团队视图">
      {views.map(item=><span key={item.id} className="team-view-tab" ref={active===item.id?activeTab:null}><button draggable={item.id!==ALL_TEAM_VIEW} className={[active===item.id?'active':'',item.id!==ALL_TEAM_VIEW?'reorderable':'',dragging===item.id?'dragging':'',dropTarget?.id===item.id?(item.id===ALL_TEAM_VIEW||!dropTarget.before?'drop-after':'drop-before'):''].filter(Boolean).join(' ')} aria-current={active===item.id?'page':undefined} onClick={()=>void act('team-view.select',{id:item.id})} onDragStart={event=>{if(item.id===ALL_TEAM_VIEW)return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);setDragging(item.id)}} onDragEnd={()=>{setDragging(null);setDropTarget(null)}} onDragOver={event=>dragOver(event,item.id)} onDrop={event=>drop(event,item.id)}>{item.name}</button>
        {active===item.id&&item.id!==ALL_TEAM_VIEW&&<button className="team-view-edit" aria-label="编辑当前视图" title={`编辑 ${item.name} · 添加或移出已有团队`} onClick={()=>open(item.id)}><span className="codicon codicon-edit" aria-hidden="true"/></button>}
      </span>)}
      <button className="team-view-add" aria-label="添加视图" title="添加视图" onClick={()=>open('new')}>＋</button>
    </nav>
    {editing&&<div className="team-view-modal" onKeyDown={event=>{if(event.key==='Escape')setEditing(null)}}>
      <div className="team-view-backdrop" onClick={()=>setEditing(null)}/>
      <section role="dialog" aria-modal="true" aria-label={editing==='new'?'添加视图':'编辑视图'} className="team-view-form">
        <header><div><small>TEAM VIEWS</small><h2>{editing==='new'?'添加视图':'编辑视图'}</h2></div><button aria-label="关闭视图编辑" onClick={()=>setEditing(null)}>×</button></header>
        <label className="team-view-name">视图名称<input autoFocus maxLength={60} value={name} onChange={event=>setName(event.target.value)} placeholder="例如 云端项目"/></label>
        <div className="team-view-choices"><strong>从 All Team 选择已有团队</strong><p>勾选加入此视图，取消勾选仅从此视图移出。不会删除团队、员工或工作目录。</p>
          <div>{store.groups.map(group=><label key={group}><input type="checkbox" checked={teams.includes(group)} onChange={event=>setTeams(previous=>event.target.checked?[...previous,group]:previous.filter(name=>name!==group))}/><span>{group}</span><small>{teamSettings(store,group).mode==='cloud'?'Cloud':teamSettings(store,group).mode==='work'?'Plugin':'Local'}</small></label>)}</div>
          {!store.groups.length&&<p>还没有 Team。可以先保存空视图，之后再添加团队。</p>}
        </div>
        {error&&<p className="team-view-error" role="alert">{error}</p>}
        <footer>{editing!=='new'&&<button className="team-view-delete" disabled={saving} onClick={()=>void remove()}>删除视图</button>}<button disabled={saving} onClick={()=>setEditing(null)}>取消</button><button className="team-view-save" disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?'保存中…':'保存视图'}</button></footer>
      </section>
    </div>}
  </>
}
