import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import type {ChannelView} from '../../../shared/channels'
import type {Store} from '../../../shared/types'
import {api} from '../api'
import {translate as uiText,useI18n} from '../i18n'
import {useDialogFocus} from '../office/useDialogFocus'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import {MessageAvatar} from './MessageView'
import {Icon} from './Icon'

/** Channel membership is independent of company roles and engine permissions. */
export function ChannelAdminDialog({channel,store,onClose,onSaved}:{channel:ChannelView;store:Store;onClose:()=>void;onSaved:(channel:ChannelView)=>void}){
 useI18n()
 const surface=useSurfaceMotion<HTMLDivElement>('dialog'),[selected,setSelected]=useState(channel.adminIds),[query,setQuery]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(channel.revision)
 useDialogFocus('.channel-admin-dialog',true)
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing){event.preventDefault();onClose()}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
 const shown=store.sessions.filter(card=>!card.deleting&&[card.title,card.group].join(' ').toLowerCase().includes(query.toLowerCase()))
 const loadLatest=async()=>{setSaving(true);try{const latest=(await api.call<ChannelView[]>('channel.list')).find(value=>value.id===channel.id);if(!latest)throw Error('Unknown news channel');setSelected(latest.adminIds);setRevision(latest.revision);onSaved(latest);setError('')}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
 const save=async()=>{setSaving(true);setError('');try{onSaved(await api.call<ChannelView>('channel.update',{id:channel.id,adminIds:selected,expectedRevision:revision}));onClose()}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
 return createPortal(<div ref={surface} className="group-editor-overlay">
  <div className="group-editor-backdrop" onClick={onClose}/>
  <section className="group-editor channel-admin-dialog" role="dialog" aria-modal="true" aria-label={uiText('Channel administrators')}>
   <header><div><span>{uiText('CHANNEL ADMINISTRATORS')}</span><h2>{channel.name}</h2></div><button aria-label={uiText('Close')} onClick={onClose}><Icon name="close"/></button></header>
   <p className="channel-admin-note">{uiText('Administrators receive new articles quietly. Start a conversation or @mention someone when you want to discuss an article.')}</p>
   <label className="group-member-search"><Icon name="search"/><input aria-label={uiText('Search employees or teams')} placeholder={uiText('Search employees or teams')} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <div className="group-member-heading"><strong>{uiText('Administrators')}</strong><span>{uiText('{0} selected',[selected.length])}</span></div>
   <div className="group-member-options channel-admin-options">{shown.map(card=><label key={card.id}><input type="checkbox" checked={selected.includes(card.id)} disabled={saving} onChange={()=>setSelected(previous=>previous.includes(card.id)?previous.filter(id=>id!==card.id):[...previous,card.id])}/><MessageAvatar employee={card}/><span><strong>{card.title}</strong><small>{card.group}</small></span><em>{uiText('Administrator')}</em></label>)}{!shown.length&&<p>{uiText('No employees match your search.')}</p>}</div>
   <p className="group-editor-note">{uiText('This channel role does not change company roles or permissions. Previous articles are not sent again.')}</p>
   {error&&<p className="group-error" role="alert">{uiText(error)}{error==='Channel changed; reload before saving'&&<button disabled={saving} onClick={()=>void loadLatest()}>{uiText('Load latest')}</button>}</p>}
   <footer><button onClick={onClose}>{uiText('Cancel')}</button><button className="primary" disabled={saving} onClick={()=>void save()}>{uiText(saving?'Saving…':'Save administrators')}</button></footer>
  </section>
 </div>,document.body)
}
