import {translate as uiText,useI18n} from '../i18n'
import {useEffect,useId,useRef,useState,type DragEvent,type KeyboardEvent} from 'react'
import {ALL_TEAM_VIEW,teamSettings,type Store} from '../../../shared/types'
import type {ViewState} from '../../../shared/view'
import {api} from '../api'
import {APP_VIEWS} from '../../../shared/app-views'
import {presentationForView} from '../../../shared/preferences'
import {Icon} from './Icon'
import {useDialogFocus} from '../office/useDialogFocus'

type Action=(cmd:string,args?:Record<string,unknown>)=>Promise<any>
export function TeamViews({store,view,act,groupUnread=0}:{store:Store;view:ViewState;act:Action;groupUnread?:number}){
  useI18n()

  const active=store.activeTeamViewId??ALL_TEAM_VIEW
  const views=[{id:ALL_TEAM_VIEW,name:'All Team',teams:store.groups},...(store.teamViews??[])]
  const current=views.find(item=>item.id===active)??views[0]
  const activeMode=presentationForView(view)
  const [menu,setMenu]=useState(false),[editing,setEditing]=useState<string|null>(null)
  const [name,setName]=useState(''),[teams,setTeams]=useState<string[]>([]),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const [dragging,setDragging]=useState<string|null>(null),[dropTarget,setDropTarget]=useState<{id:string;before:boolean}|null>(null)
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null)
  const menuId=useId()
  useDialogFocus('.team-view-form',!!editing,()=>trigger.current)
  useEffect(()=>{
    if(!menu)return
    const outside=(event:Event)=>{if(!root.current?.contains(event.target as Node))setMenu(false)}
    // The canvas owns bubbling pointer events; dismissal must observe capture.
    document.addEventListener('pointerdown',outside,true)
    document.addEventListener('focusin',outside)
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside)}
  },[menu])
  const open=(id:string)=>{const item=views.find(item=>item.id===id);setMenu(false);setEditing(id);setName(item?.name??'');setTeams(item?.teams??[]);setError('')}
  const choose=async(id:string)=>{try{await api.call('view.select',{id:'company',teamViewId:id});setMenu(false);setError('');trigger.current?.focus()}catch(cause){setError((cause as Error).message)}}
  const save=async()=>{if(!editing)return;setSaving(true);setError('');try{await api.call(editing==='new'?'team-view.create':'team-view.update',editing==='new'?{name,teams}:{id:editing,patch:{name,teams}});setEditing(null)}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
  const remove=async()=>{if(!editing||editing==='new')return;setSaving(true);setError('');try{await api.call('team-view.remove',{id:editing});setEditing(null)}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
  const dragOver=(event:DragEvent<HTMLButtonElement>,id:string)=>{if(!dragging)return;event.preventDefault();event.dataTransfer.dropEffect='move';const box=event.currentTarget.getBoundingClientRect();setDropTarget({id,before:id===ALL_TEAM_VIEW||event.clientY<box.top+box.height/2})}
  const drop=(event:DragEvent<HTMLButtonElement>,id:string)=>{
    if(!dragging)return
    event.preventDefault();setDragging(null);setDropTarget(null)
    if(dragging===id)return
    const remaining=(store.teamViews??[]).filter(item=>item.id!==dragging),box=event.currentTarget.getBoundingClientRect()
    const index=id===ALL_TEAM_VIEW?0:remaining.findIndex(item=>item.id===id)+(event.clientY<box.top+box.height/2?0:1)
    if(index>=0)void act('team-view.update',{id:dragging,patch:{index}})
  }
  const menuKeys=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setMenu(false);trigger.current?.focus();return}
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return
    const choices=[...root.current!.querySelectorAll<HTMLButtonElement>('.company-view-menu button')],at=choices.indexOf(document.activeElement as HTMLButtonElement)
    event.preventDefault();choices[event.key==='Home'?0:event.key==='End'?choices.length-1:(at+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length]?.focus()
  }
  const companyClick=()=>{if(view.kind!=='home'||active!==ALL_TEAM_VIEW){setMenu(false);void act('view.select',{id:'company'})}else setMenu(!menu)}
  const unread=store.sessions.filter(card=>!card.deleting&&card.lastReply&&!card.lastReply.readAt).length+groupUnread
  return <>
    <nav className="company-navigation" aria-label={uiText("Main views")}>
      <div className="company-view-picker" ref={root}>
        <button ref={trigger} className={`app-view-button company-view-trigger ${activeMode==='company'?'active':''}`} title={uiText("Company Views · {0}",[current.id===ALL_TEAM_VIEW?uiText('All Team'):current.name])} aria-label={uiText("Company Views")} aria-pressed={activeMode==='company'} aria-haspopup="menu" aria-expanded={menu} aria-controls={menu?menuId:undefined} onClick={companyClick} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setMenu(true)}}}>
          <Icon name={APP_VIEWS[0].icon}/><span>{uiText(APP_VIEWS[0].label)}</span><Icon name="chevron-down"/>
        </button>
        {menu&&<div id={menuId} className="company-view-menu" role="menu" aria-label={uiText("Company views")} onKeyDown={menuKeys}>
          <div className="view-menu-heading"><span>{uiText("YOUR COMPANY")}</span><small>{views.length}  {uiText("views")}</small></div>
          <div className="company-view-list">{views.map(item=><div className="team-view-tab" key={item.id}>
            <button data-view-choice={item.id} role="menuitemradio" aria-checked={active===item.id} draggable={item.id!==ALL_TEAM_VIEW} className={`company-view-option ${active===item.id?'active':''} ${item.id!==ALL_TEAM_VIEW?'reorderable':''} ${dragging===item.id?'dragging':''} ${dropTarget?.id===item.id?(dropTarget.before?'drop-before':'drop-after'):''}`} onClick={()=>void choose(item.id)} onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.id);setDragging(item.id)}} onDragEnd={()=>{setDragging(null);setDropTarget(null)}} onDragOver={event=>dragOver(event,item.id)} onDrop={event=>drop(event,item.id)}>
              <Icon name={item.id===ALL_TEAM_VIEW?'globe':'layout'}/><span>{item.id===ALL_TEAM_VIEW?uiText('All Team'):item.name}<small>{item.teams.length} {item.teams.length===1?uiText("team"):uiText("teams")}</small></span>{active===item.id&&<Icon name="check"/>}
            </button>{item.id!==ALL_TEAM_VIEW&&<button className="team-view-edit" aria-label={uiText("Edit {0}",[item.name])} title={uiText("Edit {0}",[item.name])} onClick={()=>open(item.id)}><Icon name="edit"/></button>}
          </div>)}</div>
          {error&&<p className="team-view-error" role="alert">{error}</p>}
          <footer><button className="team-view-add" role="menuitem" onClick={()=>open('new')}><Icon name="add"/>  {uiText("New view")}</button><small>{uiText("Drag views to reorder")}</small></footer>
        </div>}
      </div>
      {APP_VIEWS.filter(mode=>mode.id!=='company').map(mode=><button key={mode.id} className={`app-view-button ${mode.id}-view-trigger ${activeMode===mode.id?'active':''}`} aria-label={uiText(mode.label)} aria-pressed={activeMode===mode.id} onClick={()=>{setMenu(false);void act('view.select',{id:mode.id})}}><Icon name={mode.icon}/><span>{uiText(mode.label)}</span>{mode.id==='messages'&&unread>0&&<b className="nav-unread" aria-label={uiText("{0} unread conversations",[unread])}>{unread}</b>}</button>)}
    </nav>
    {editing&&<div className="team-view-modal" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setEditing(null)}}}>
      <div className="team-view-backdrop" onClick={()=>setEditing(null)}/>
      <section role="dialog" aria-modal="true" aria-label={editing==='new'?uiText("New company view"):uiText("Edit company view")} className="team-view-form">
        <header><div><small>{uiText("COMPANY VIEWS")}</small><h2>{editing==='new'?uiText("A new perspective"):uiText("Edit your view")}</h2></div><button aria-label={uiText("Close view editor")} onClick={()=>setEditing(null)}>×</button></header>
        <label className="team-view-name">{uiText("View name")}<input autoFocus maxLength={60} value={name} onChange={event=>setName(event.target.value)} placeholder={uiText("e.g. Product studio")}/></label>
        <div className="team-view-choices"><strong>{uiText("Choose teams from All Team")}</strong><p>{uiText("Only the view changes. Your teams, employees and workspaces stay intact.")}</p>
          <div>{store.groups.map(group=><label key={group}><input type="checkbox" checked={teams.includes(group)} onChange={event=>setTeams(previous=>event.target.checked?[...previous,group]:previous.filter(name=>name!==group))}/><span>{group}</span><small>{teamSettings(store,group).mode==='cloud'?uiText("Cloud"):teamSettings(store,group).mode==='work'?uiText("Plugin"):uiText("Local")}</small></label>)}</div>
          {!store.groups.length&&<p>{uiText("No teams yet. Save this view and add teams later.")}</p>}
        </div>
        {editing!=='new'&&<div className="view-order-actions"><span>{uiText("Position")}</span>{[-1,1].map(offset=><button key={offset} disabled={saving||(store.teamViews??[]).findIndex(item=>item.id===editing)+offset<0||(store.teamViews??[]).findIndex(item=>item.id===editing)+offset>=(store.teamViews?.length??0)} onClick={()=>void act('team-view.update',{id:editing,patch:{index:(store.teamViews??[]).findIndex(item=>item.id===editing)+offset}})}>{offset===-1?uiText("Move up"):uiText("Move down")}</button>)}</div>}
        {error&&<p className="team-view-error" role="alert">{error}</p>}
        <footer>{editing!=='new'&&<button className="team-view-delete" disabled={saving} onClick={()=>void remove()}>{uiText("Delete view")}</button>}<button disabled={saving} onClick={()=>setEditing(null)}>{uiText("Cancel")}</button><button className="team-view-save" disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?uiText("Saving…"):uiText("Save view")}</button></footer>
      </section>
    </div>}
  </>
}
