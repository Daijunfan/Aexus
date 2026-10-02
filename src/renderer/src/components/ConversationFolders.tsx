import {useEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import type {ConversationFolder,MessengerState} from '../../../shared/messenger'
import {api} from '../api'
import {translate as uiText,useI18n} from '../i18n'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import {useDialogFocus} from '../office/useDialogFocus'
import {Icon} from './Icon'
import {MessageMenu} from './MessageMenu'
import {useMessenger} from './useMessenger'

export type FolderConversation={key:string;title:string;description:string;avatar?:ReactNode;archived?:boolean}

export function ConversationFolders({folders,selectedId,onSelect,onCreate,onEdit}:{folders:ConversationFolder[];selectedId:string|null;onSelect:(id:string|null)=>void;onCreate:()=>void;onEdit:(folder:ConversationFolder)=>void}){
  useI18n()
  const messenger=useMessenger()!,tabs=useRef<HTMLDivElement>(null),[menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null),[error,setError]=useState(''),[deleting,setDeleting]=useState(false)
  const current=folders.find(folder=>folder.id===menu?.id)
  const open=(folder:ConversationFolder,button:HTMLElement)=>{const box=button.getBoundingClientRect();setError('');setMenu({id:folder.id,x:box.left,y:box.bottom+6})}
  const remove=async()=>{if(!current||deleting)return;setDeleting(true);setError('');try{await messenger.deleteFolder(current.id,current.revision);setMenu(null);document.getElementById('message-folder-all')?.focus()}catch(cause){setError((cause as Error).message)}finally{setDeleting(false)}}
  const move=(event:React.KeyboardEvent,index:number)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const ids=[null,...folders.map(folder=>folder.id)],next=event.key==='Home'?0:event.key==='End'?ids.length-1:(index+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;onSelect(ids[next]);const button=tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next];button?.focus();button?.scrollIntoView({block:'nearest',inline:'nearest'})}
  return <div className="message-category-bar"><div ref={tabs} className="message-category-tabs" role="tablist" aria-label={uiText('Conversation categories')}>
    <button id="message-folder-all" role="tab" aria-selected={!selectedId} tabIndex={selectedId?-1:0} onClick={()=>onSelect(null)} onKeyDown={event=>move(event,0)}>{uiText('All')}</button>
    {folders.map((folder,index)=><button id={'message-folder-'+folder.id} key={folder.id} role="tab" aria-selected={selectedId===folder.id} tabIndex={selectedId===folder.id?0:-1} aria-haspopup="menu" title={uiText('Category options for {0}',[folder.name])} onClick={event=>{if(selectedId===folder.id)open(folder,event.currentTarget);else onSelect(folder.id)}} onContextMenu={event=>{event.preventDefault();open(folder,event.currentTarget)}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();open(folder,event.currentTarget)}else move(event,index+1)}}><span>{folder.name}</span><Icon name="chevron-down"/></button>)}
  </div><button id="message-folder-add" className="message-category-add" aria-label={uiText('Create category')} title={uiText('Create category')} onClick={onCreate}><Icon name="add"/></button>
    {menu&&current&&<MessageMenu anchor={menu} label={uiText('Category options')} onClose={()=>setMenu(null)}><span className="messenger-menu-label">{current.name}</span><button role="menuitem" disabled={deleting} onClick={()=>{setMenu(null);onEdit(current)}}><Icon name="edit"/>{uiText('Edit category')}</button><button role="menuitem" disabled={deleting} onClick={()=>void remove()}><Icon name="trash"/>{uiText('Delete category')}</button><small className="messenger-menu-note">{uiText('Conversations remain when a category is deleted.')}</small>{error&&<p className="message-folder-error" role="alert">{uiText(error)}</p>}</MessageMenu>}
  </div>
}

export function ConversationFolderEditor({folder,conversations,onClose,onSaved}:{folder?:ConversationFolder;conversations:FolderConversation[];onClose:()=>void;onSaved:(id:string)=>void}){
  useI18n()
  const messenger=useMessenger()!,surface=useSurfaceMotion<HTMLDivElement>('dialog'),alive=useRef(true),busy=useRef(false)
  const [id]=useState(()=>folder?.id??'mf_'+crypto.randomUUID()),[revision,setRevision]=useState(folder?.revision??0),[name,setName]=useState(folder?.name??''),[selected,setSelected]=useState(folder?.conversations??[]),[query,setQuery]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('')
  useDialogFocus('.conversation-folder-editor',true,()=>document.getElementById('message-folder-'+id)??document.getElementById('message-folder-add'))
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopImmediatePropagation();if(!busy.current)onClose()}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[onClose])
  const known=new Set(conversations.map(conversation=>conversation.key)),choices:FolderConversation[]=[...conversations,...selected.filter(key=>!known.has(key)).map(key=>({key,title:uiText('Unavailable conversation'),description:key}))]
  const shown=choices.filter(conversation=>[conversation.title,conversation.description].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const toggle=(key:string)=>setSelected(previous=>previous.includes(key)?previous.filter(value=>value!==key):[...previous,key])
  const save=async()=>{if(busy.current||!name.trim())return;busy.current=true;setSaving(true);setError('');try{await messenger.saveFolder({id,name:name.trim(),conversations:selected,expectedRevision:revision});if(alive.current)onSaved(id)}catch(cause){if(alive.current)setError((cause as Error).message)}finally{busy.current=false;if(alive.current)setSaving(false)}}
  const reload=async()=>{if(busy.current)return;busy.current=true;setSaving(true);try{const state=await api.call<MessengerState>('messenger.state'),current=state.folders?.find(value=>value.id===id);if(!current)throw Error('Unknown conversation folder');if(alive.current){setName(current.name);setSelected(current.conversations);setRevision(current.revision);setError('')}}catch(cause){if(alive.current)setError((cause as Error).message)}finally{busy.current=false;if(alive.current)setSaving(false)}}
  const close=()=>{if(!busy.current)onClose()}
  return createPortal(<div ref={surface} className="group-editor-overlay"><div className="group-editor-backdrop" onClick={close}/><section className="group-editor conversation-folder-editor" role="dialog" aria-modal="true" aria-label={uiText(folder?'Edit category':'Create category')} aria-busy={saving}>
    <header><div><span>{uiText('YOUR CONVERSATIONS')}</span><h2>{uiText(folder?'Edit category':'Create category')}</h2></div><button disabled={saving} aria-label={uiText('Close category editor')} onClick={close}><Icon name="close"/></button></header>
    <label>{uiText('Category name')}<input autoFocus name="conversation-folder-name" value={name} maxLength={80} disabled={saving} placeholder={uiText('e.g. Daily reading')} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();void save()}}}/></label>
    <p className="group-editor-note">{uiText('Mix any conversations in a category. A conversation can belong to more than one.')}</p>
    <label className="group-member-search"><Icon name="search"/><input aria-label={uiText('Search category conversations')} placeholder={uiText('Search conversations…')} value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="group-member-heading"><strong>{uiText('Conversations')}</strong><span>{uiText('{0} selected',[selected.length])}</span><button disabled={saving||!shown.length} onClick={()=>setSelected(previous=>[...new Set([...previous,...shown.map(value=>value.key)])])}>{uiText('Select shown')}</button><button disabled={saving||!selected.length} onClick={()=>setSelected([])}>{uiText('Clear')}</button></div>
    <div className="group-member-options folder-conversation-options">{shown.map(conversation=><label key={conversation.key}><input type="checkbox" disabled={saving} aria-label={uiText('Include {0}',[conversation.title])} checked={selected.includes(conversation.key)} onChange={()=>toggle(conversation.key)}/>{conversation.avatar&&<span className="folder-conversation-avatar">{conversation.avatar}</span>}<span><strong>{conversation.title}</strong><small>{conversation.description}{conversation.archived?' · '+uiText('Archived'):''}</small></span></label>)}{!shown.length&&<p>{uiText('No conversations found')}</p>}</div>
    {error&&<div className="message-folder-error" role="alert">{uiText(error)}{folder&&<button disabled={saving} onClick={()=>void reload()}>{uiText('Load latest')}</button>}</div>}
    <footer><button disabled={saving} onClick={close}>{uiText('Cancel')}</button><button className="primary" disabled={saving||!name.trim()} onClick={()=>void save()}>{uiText(saving?'Saving…':folder?'Save category':'Create category')}</button></footer>
  </section></div>,document.body)
}
