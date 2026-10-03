import {useSurfaceMotion} from '../chat/surfaceMotion'
import {translate as uiText,useI18n} from '../i18n'
import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {ConversationControls} from './ConversationControls'
import {groupRole,CONVERSATION_ROLE_LABELS} from '../../../shared/conversation-controls'
import type {Store} from '../../../shared/types'
import type {ChatGroupView} from '../../../shared/chat-groups'
import {api} from '../api'
import {Icon} from './Icon'
import {useDialogFocus} from '../office/useDialogFocus'

export function GroupEditor({store,group,onClose,onSaved}:{store:Store;group?:ChatGroupView;onClose:()=>void;onSaved:(group:ChatGroupView)=>void}){
  useI18n()
  const surface=useSurfaceMotion<HTMLDivElement>('dialog')

 const [ownerId,setOwnerId]=useState(group?.ownerId??'')
 const [base]=useState(group),[confirmed,setConfirmed]=useState(group)
 const current=group&&confirmed&&confirmed.revision>group.revision?confirmed:group
 const baseRevision=current&&base&&current.name===base.name&&JSON.stringify(current.memberIds)===JSON.stringify(base.memberIds)?current.revision:base?.revision
 const [name,setName]=useState(group?.name??''),[selected,setSelected]=useState(group?.memberIds??[]),[query,setQuery]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[muting,setMuting]=useState(false),[confirmDelete,setConfirmDelete]=useState(false)
 useDialogFocus('.group-editor',true)
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing){event.preventDefault();onClose()}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
 const cards=store.sessions.filter(card=>!card.deleting),shown=cards.filter(card=>[card.title,card.group].join(' ').toLowerCase().includes(query.toLowerCase()))
 const toggle=(id:string)=>setSelected(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id])
 const importTeam=(team:string)=>{if(!team)return;setSelected(previous=>[...new Set([...previous,...cards.filter(card=>card.group===team).map(card=>card.id)])]);if(!name.trim())setName(team)}
 const save=async()=>{setSaving(true);setError('');try{
  const values={name:name.trim(),members:selected,...(!group?{ownerId:selected.includes(ownerId)?ownerId:selected[0]}:{})}
  if(!group){onSaved(await api.call<ChatGroupView>('chat.create',values));return}
  let value:ChatGroupView
  try{value=await api.call<ChatGroupView>('chat.update',{id:group.id,expectedRevision:baseRevision,...values})}
  catch(cause){
   if((cause as Error).message!=='Group changed; reload before saving')throw cause
   const latest=await api.call<ChatGroupView>('chat.get',{id:group.id})
   if(!base||latest.name!==base.name||JSON.stringify(latest.memberIds)!==JSON.stringify(base.memberIds))throw cause
   value=await api.call<ChatGroupView>('chat.update',{id:group.id,expectedRevision:latest.revision,...values})
  }
  onSaved(value)
 }catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
 const remove=async()=>{if(!group)return;setSaving(true);try{await api.call('chat.delete',{id:group.id});onClose()}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
 return createPortal(<div ref={surface} className="group-editor-overlay">
  <div className="group-editor-backdrop" onClick={onClose}/>
  <section className="group-editor" aria-hidden={muting||undefined} role="dialog" aria-modal="true" aria-label={group?uiText("Edit group"):uiText("New group")}>
   <header><div><span>{uiText("GROUP CONVERSATION")}</span><h2>{group?uiText("Your group, your people"):uiText("Bring your team together")}</h2></div><button aria-label={uiText("Close group editor")} onClick={onClose}><Icon name="close"/></button></header>
   <label>{uiText("Group name")}<input autoFocus name="chat-name" value={name} maxLength={80} placeholder={uiText("e.g. Product launch")} onChange={event=>setName(event.target.value)}/></label>
   <label>{uiText("Add a Team")}<select name="chat-team" defaultValue="" onChange={event=>{importTeam(event.target.value);event.target.value=''}}><option value="">{uiText("Choose a Team to add its members")}</option>{store.groups.map(team=><option key={team}>{team}</option>)}</select></label>
   <p className="group-editor-note">{uiText("A Team fills the selection. Add people from other teams or uncheck anyone. Their original teams and conversations stay unchanged.")}</p>
   <label className="group-member-search"><Icon name="search"/><input aria-label={uiText("Search group members")} placeholder={uiText("Search employees or teams")} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <div className="group-member-heading"><strong>{uiText("Members")}</strong><span>{uiText('{0} selected',[selected.length])}</span><button onClick={()=>setSelected(current?.ownerId?[current.ownerId]:[])} disabled={saving||muting||!selected.length}>{uiText("Clear")}</button></div>
   <div className="group-member-options">{shown.map(card=><label key={card.id}><input type="checkbox" checked={selected.includes(card.id)} disabled={card.id===current?.ownerId} onChange={()=>toggle(card.id)}/><span><strong>{card.title}</strong><small>{card.group} · {CONVERSATION_ROLE_LABELS[current?groupRole(current,card.id)??'member':(selected.includes(ownerId)?ownerId:selected[0])===card.id?'owner':'member']}</small></span></label>)}{!shown.length&&<p>{uiText("No employees match your search.")}</p>}</div>
   {!current&&selected.length>0&&<label>Owner<select name="chat-owner" value={selected.includes(ownerId)?ownerId:selected[0]} onChange={event=>setOwnerId(event.target.value)}>{cards.filter(card=>selected.includes(card.id)).map(card=><option key={card.id} value={card.id}>{card.title}</option>)}</select></label>}
   {current&&<button className="conversation-control-open" disabled={saving||muting} onClick={()=>setMuting(true)}><Icon name="shield"/>{uiText('Roles, moderation & notifications')}</button>}
   {error&&<p className="group-error" role="alert">{uiText(error)}</p>}
   {confirmDelete&&<div className="group-delete-confirm" role="alert"><p>{uiText("Remove this group? Employees, their work, and private conversations will be kept.")}</p><button disabled={saving||muting} onClick={()=>void remove()}>{uiText("Confirm removal")}</button><button onClick={()=>setConfirmDelete(false)}>{uiText("Keep group")}</button></div>}
   <footer>{group&&<button className="group-delete" disabled={saving||muting} onClick={()=>setConfirmDelete(true)}>{uiText("Delete group")}</button>}<button onClick={onClose}>{uiText("Cancel")}</button><button className="primary" disabled={saving||muting||!name.trim()||!group&&!selected.length} onClick={()=>void save()}>{saving?uiText("Saving…"):group?uiText("Save group"):uiText("Create group")}</button></footer>
  </section>
  {current&&muting&&<ConversationControls conversation={'group:'+current.id} store={store} onClose={()=>setMuting(false)} onChanged={()=>void api.call<ChatGroupView>('chat.get',{id:current.id}).then(setConfirmed).catch(()=>onClose())}/>}
 </div>,document.body)
}
