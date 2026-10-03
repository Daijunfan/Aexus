import {useEffect,useState} from 'react'
import type {ConversationFolder} from '../../../shared/messenger'
import {translate as uiText,useI18n} from '../i18n'
import {Icon} from './Icon'
import {MessageMenu} from './MessageMenu'
import {useMessenger} from './useMessenger'
import {orderedKeys} from '../../../shared/messenger-order'
import {useSortableList} from '../chat/useSortableList'
export {ConversationFolderEditor,type FolderConversation} from './CategoryEditor'

export function ConversationFolders({folders,selectedId,onSelect,onCreate,onEdit}:{folders:ConversationFolder[];selectedId:string|null;onSelect:(id:string|null)=>void;onCreate:()=>void;onEdit:(folder:ConversationFolder)=>void}){
 useI18n()
 const messenger=useMessenger()!,[menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null),[error,setError]=useState(''),[deleting,setDeleting]=useState(false)
 const savedOrder=messenger.state.orders?.categories??[],byId=new Map(folders.map(folder=>[folder.id,folder]))
 const sorting=useSortableList({keys:orderedKeys([...byId.keys()],savedOrder),identity:'categories',axis:'x',disabled:!messenger.ready||!!menu||deleting,label:id=>byId.get(id)?.name??id,save:order=>messenger.reorder('categories',order,savedOrder)}),tabs=sorting.root
 useEffect(()=>{if(!selectedId||sorting.phase==='dragging')return;const frame=requestAnimationFrame(()=>document.getElementById('message-folder-'+selectedId)?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}));return()=>cancelAnimationFrame(frame)},[selectedId,folders.length])
 const current=folders.find(folder=>folder.id===menu?.id)
 const open=(folder:ConversationFolder,button:HTMLElement)=>{const box=button.getBoundingClientRect();setError('');setMenu({id:folder.id,x:box.left,y:box.bottom+6})}
 const remove=async()=>{if(!current||deleting)return;setDeleting(true);setError('');try{await messenger.deleteFolder(current.id,current.revision);setMenu(null);document.getElementById('message-folder-add')?.focus()}catch(cause){setError((cause as Error).message)}finally{setDeleting(false)}}
 const move=(event:React.KeyboardEvent,index:number)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const ids=sorting.keys,next=event.key==='Home'?0:event.key==='End'?ids.length-1:(index+(event.key==='ArrowRight'?1:-1)+ids.length)%ids.length;onSelect(ids[next]);const button=tabs.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next];button?.focus();button?.scrollIntoView({block:'nearest',inline:'nearest'})}
 return <div className="message-category-bar"><div ref={tabs} {...sorting.bindings} className="message-category-tabs message-sortable" role="tablist" aria-label={uiText('Conversation categories')} aria-busy={sorting.phase==='saving'}>
  {sorting.keys.map((id,index)=>{const folder=byId.get(id)!;return <button data-sort-key={id} id={'message-folder-'+folder.id} key={id} role="tab" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" aria-description={uiText('Drag to reorder. On touch screens, hold before dragging.')} aria-selected={selectedId===folder.id} tabIndex={selectedId===folder.id||!selectedId&&index===0?0:-1} aria-haspopup="menu" title={uiText('Category options for {0}',[folder.name])} onClick={event=>{if(selectedId===folder.id)open(folder,event.currentTarget);else onSelect(folder.id)}} onContextMenu={event=>{event.preventDefault();open(folder,event.currentTarget)}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();open(folder,event.currentTarget)}else move(event,index)}}>{folder.include&&<Icon name="sync"/>}<span>{folder.name}</span><Icon name="chevron-down"/></button>})}
  {!folders.length&&<span className="message-category-placeholder">{uiText('Your categories')}</span>}
 </div><span className="message-sort-status" role="status" aria-live="polite">{sorting.announcement}</span><button id="message-folder-add" className="message-category-add" aria-label={uiText('Create category')} title={uiText('Create category')} onClick={onCreate}><Icon name="add"/></button>
 {menu&&current&&<MessageMenu anchor={menu} label={uiText('Category options')} onClose={()=>setMenu(null)}><span className="messenger-menu-label">{current.name}</span><button role="menuitem" disabled={deleting} onClick={()=>{setMenu(null);onEdit(current)}}><Icon name="edit"/>{uiText('Edit category')}</button><button role="menuitem" disabled={deleting} onClick={()=>void remove()}><Icon name="trash"/>{uiText('Delete category')}</button><small className="messenger-menu-note">{uiText('Conversations remain when a category is deleted.')}</small>{error&&<p className="message-folder-error" role="alert">{uiText(error)}</p>}</MessageMenu>}
 </div>
}
