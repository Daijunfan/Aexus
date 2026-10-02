import {useSurfaceMotion} from '../chat/surfaceMotion'
import {translate as uiText,useI18n} from '../i18n'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {Store} from '../../../shared/types'
import {employeeReady} from '../../../shared/types'
import type {ChatGroupView} from '../../../shared/chat-groups'
import {conversationKey,plainMessagePreview,type ForwardDraftInput,type ForwardResult,type ForwardStatus} from '../../../shared/messenger'
import {useMessenger} from './useMessenger'
import {useDialogFocus} from '../office/useDialogFocus'
import {onPluginFlush} from '../plugins'
import {EmployeePortrait} from './EmployeePortrait'
import {Icon} from './Icon'
import {api} from '../api'

export function ForwardMessageDialog({store,groups}:{store:Store;groups:ChatGroupView[]}){
 useI18n()
 const surface=useSurfaceMotion<HTMLDivElement>('dialog'),messenger=useMessenger()!,reply=messenger.replyTarget
 const requested=useRef(messenger.forward),saved=reply?undefined:messenger.state.pendingForward
 const [draft,setDraft]=useState<ForwardDraftInput>(()=>saved?(({updatedAt:_,...value})=>value)(saved):{clientMessageId:crypto.randomUUID(),messages:reply?[{conversation:reply.conversation,id:reply.id}]:messenger.forward!.messages,comment:'',textOnly:false,preview:{text:Array.from(reply?.quote?.text??reply?.text??messenger.forward!.text).slice(0,1200).join(''),images:reply?.images??messenger.forward!.images},attempted:false})
 const [query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState<ForwardStatus|null>(null)
 const latest=useRef(draft),dirty=useRef(!reply&&!saved),writing=useRef<Promise<void>|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),alive=useRef(true)
 const flush=useCallback(async()=>{
  if(reply)return
  clearTimeout(timer.current)
  while(dirty.current||writing.current){
   const work=writing.current??(writing.current=(async()=>{while(dirty.current){const value=latest.current;const retained=await messenger.saveForward(value);if(retained?.clientMessageId!==value.clientMessageId)throw Error('The forwarding setup changed in another window');if(latest.current===value)dirty.current=false}})())
   try{await work}finally{if(writing.current===work)writing.current=null}
  }
 },[messenger.saveForward,reply])
 const update=(patch:Partial<ForwardDraftInput>)=>{const value={...latest.current,...patch};latest.current=value;setDraft(value);setError('');if(!reply){dirty.current=true;clearTimeout(timer.current);timer.current=setTimeout(()=>void flush().catch(cause=>{if(alive.current)setError((cause as Error).message)}),300)}}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearTimeout(timer.current);void flush().catch(()=>{})}},[flush])
 useEffect(()=>onPluginFlush(flush),[flush])
 useDialogFocus('.message-forward-dialog',true)
 const check=useCallback(async()=>{const value=await api.call<ForwardStatus>('messenger.forward-status',{clientMessageId:latest.current.clientMessageId});if(alive.current)setStatus(value);return value},[])
 useEffect(()=>{if(!reply&&draft.attempted)void check().catch(cause=>{if(alive.current)setError((cause as Error).message)})},[check,reply])
 const target=draft.to??'',locked=!reply&&draft.attempted,images=draft.preview.images
 const people=store.sessions.filter(card=>!card.deleting&&employeeReady(card)&&(!reply||conversationKey('employee',card.id)!==reply.conversation)&&[card.title,card.group].join(' ').toLowerCase().includes(query.toLowerCase())),matchingGroups=groups.filter(group=>(!reply||conversationKey('group',group.id)!==reply.conversation)&&group.name.toLowerCase().includes(query.toLowerCase()))
 const targetName=target.startsWith('group:')?groups.find(group=>target==='group:'+group.id)?.name:store.sessions.find(card=>target==='employee:'+card.id)?.title
 const sourceName=reply?reply.conversation.startsWith('employee:')?store.sessions.find(card=>card.id===reply.conversation.slice(9))?.title:groups.find(group=>group.id===reply.conversation.slice(6))?.name:undefined
 const differentSelection=!!saved&&!!requested.current&&JSON.stringify(saved.messages)!==JSON.stringify(requested.current.messages)
 const dismiss=()=>{if(reply)messenger.setReplyTarget(null);else messenger.setForward(null)}
 const close=async()=>{if(reply&&busy)return;try{await flush();dismiss()}catch(cause){if(alive.current)setError((cause as Error).message)}}
 const discard=async()=>{setBusy(true);try{await flush();await messenger.saveForward(null,latest.current.clientMessageId);dirty.current=false;dismiss()}catch(cause){setError((cause as Error).message)}finally{if(alive.current)setBusy(false)}}
 const open=async(result?:ForwardResult)=>{const destination=result?.to??target;if(!destination)return;const [kind,id]=destination.split(':');try{await api.call('view.open',{kind:'messages',...(kind==='group'?{chatId:id}:{employee:id})})}catch(cause){if(alive.current)setError(result?uiText('Forwarded, but the destination could not be opened. Try Open destination again.'):(cause as Error).message);return}try{if(result)await messenger.saveForward(null,latest.current.clientMessageId);if(alive.current)dismiss()}catch{if(alive.current)setError(uiText('Forwarded, but its saved setup could not be cleared.'))}}
 const send=async()=>{
  if(busy||!target||locked&&(!status?.retryable||status.active))return
  setBusy(true);setError('')
  try{
   if(reply){await messenger.prepareReply(target,reply,draft.textOnly);messenger.setReplyTarget(null);return}
   const value={...latest.current,attempted:true};latest.current=value;setDraft(value);dirty.current=true
   await flush()
   const retained=await api.call<{pendingForward?:ForwardDraftInput}>('messenger.state')
   if(retained.pendingForward?.clientMessageId!==value.clientMessageId)throw Error('The forwarding setup changed in another window')
   const result=await api.call<ForwardResult>('messenger.forward',{messages:value.messages,to:value.to,comment:value.comment,textOnly:value.textOnly,clientMessageId:value.clientMessageId,retry:true})
   if(alive.current){setStatus({clientMessageId:value.clientMessageId,status:'sent',active:false,retryable:false,result});await open(result)}
  }catch(cause){if(alive.current){setError((cause as Error).message);if(!reply)await check().catch(()=>{})}}
  finally{if(alive.current)setBusy(false)}
 }
 const statusText=status?.status==='sent'?uiText('Forwarded successfully.'):status?.status==='interrupted'?uiText('The queued forward was interrupted. It will not be sent again automatically.'):status?.status==='uncertain'?uiText('Delivery is not confirmed. Check the result or destination; this attempt will not be sent again.'):status?.active?uiText('Forwarding is still in progress. You can close this window and check later.'):locked&&status?.retryable?uiText('Nothing was dispatched by this attempt. You can retry it safely.'):locked?uiText('Checking the forwarding result…'):null
 return <div ref={surface} className="group-editor-overlay" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void close()}}}>
  <div className="group-editor-backdrop" onClick={()=>void close()}/>
  <section className="message-forward-dialog" role="dialog" aria-modal="true" aria-label={reply?uiText('Reply in another conversation'):uiText('Forward messages')}>
   <header><div><span>{uiText('SHARE THE CONTEXT')}</span><h2>{reply?uiText('Choose where to reply'):<>{uiText('Forward')} {draft.messages.length===1?uiText('a message'):uiText('{0} messages',[draft.messages.length])}</>}</h2></div><button disabled={!!reply&&busy} aria-label={reply?uiText('Close reply destination'):uiText('Close forwarding')} onClick={()=>void close()}><Icon name="close"/></button></header>
   {differentSelection&&<p className="message-forward-note">{uiText('Your saved forwarding attempt is open. Discard it before choosing other messages.')}</p>}
   <div className="message-forward-preview"><Icon name="arrow-right"/><p>{sourceName&&<strong className="message-forward-source">{uiText('From {0}',[sourceName])}</strong>}{plainMessagePreview(draft.preview.text)||uiText('Attachments')}{images>0&&<small>{uiText('{0} attachments',[images])}</small>}</p></div>
   {locked?<div className="message-forward-result"><strong>{uiText('Destination')}: {targetName??target}</strong><p role="status">{statusText}</p></div>:<>
    <label className="message-library-search"><Icon name="search"/><input value={query} aria-label={reply?uiText('Find reply destination'):uiText('Find forwarding destination')} placeholder={uiText('Find a person or group…')} onChange={event=>setQuery(event.target.value)} autoFocus disabled={busy}/></label>
    <div className="message-forward-contacts" role="group" aria-label={reply?uiText('Reply destination'):uiText('Forwarding destination')}>
     {people.map(card=><button key={card.id} disabled={busy} aria-pressed={target===conversationKey('employee',card.id)} onClick={()=>update({to:conversationKey('employee',card.id)})}><EmployeePortrait avatar={card.avatar} color={card.color}/><span><strong>{card.title}</strong><small>{card.group} {uiText('· Existing conversation')}</small></span><Icon name={target===conversationKey('employee',card.id)?'pass-filled':'circle-outline'}/></button>)}
     {matchingGroups.map(group=><button key={group.id} disabled={busy||!!reply&&images>0&&!draft.textOnly&&!reply.quote} aria-pressed={target===conversationKey('group',group.id)} onClick={()=>update({to:conversationKey('group',group.id)})}><span className="group-avatar"><Icon name="organization"/></span><span><strong>{group.name}</strong><small>{reply&&images>0&&!draft.textOnly&&!reply.quote?uiText('Choose a text-only quote'):uiText(group.members.length===1?'{0} member · Review recipients before sending':'{0} members · Review recipients before sending',[group.members.length])}</small></span><Icon name={target===conversationKey('group',group.id)?'pass-filled':'circle-outline'}/></button>)}
     {!people.length&&!matchingGroups.length&&<div className="message-destination-empty"><Icon name="search"/><strong>{uiText('No matching conversations')}</strong><small>{uiText('Try another name or clear the search.')}</small></div>}
    </div>
   </>}
   {images>0&&!reply?.quote&&<label className="forward-text-only"><input type="checkbox" checked={draft.textOnly} disabled={busy||locked} onChange={event=>update({textOnly:event.target.checked})}/>{uiText(reply?'Quote text only; attachments stay in the original conversation':'Forward text without attachments')}</label>}
   {!reply&&<textarea value={draft.comment} disabled={busy||locked} maxLength={16000} rows={2} aria-label={uiText('Forwarding note')} placeholder={uiText('Add a note (optional)…')} onChange={event=>update({comment:event.target.value})}/>}
   {!locked&&<p className="message-forward-note">{reply?uiText(target.startsWith('group:')?'Your reply and quoted text will be visible in this group. Review the kept draft before sending.':'Your destination draft is kept. Nothing is sent until you review it and press Send.'):target.startsWith('group:')?uiText('This sends the selected content to every current group member.'):uiText('This sends the selected content to the employee’s existing conversation. Busy employees receive it in their queue.')}</p>}
   {!reply&&<p className="message-forward-note">{uiText('Closing keeps this setup. Discarding does not cancel messages or work already sent.')}</p>}
   {error&&<p role="alert" className="group-error">{uiText(error)}</p>}
   <footer>
    {!reply&&<button disabled={busy} onClick={()=>void discard()}>{uiText('Discard setup')}</button>}
    <button disabled={!!reply&&busy} onClick={()=>void close()}>{uiText(reply?'Cancel':'Close')}</button>
    {locked&&status?.status!=='sent'&&<button disabled={busy} onClick={()=>{setBusy(true);setError('');void check().catch(cause=>setError((cause as Error).message)).finally(()=>setBusy(false))}}>{uiText('Check result')}</button>}
    {locked&&!status?.retryable?<button className="primary" disabled={busy||!target} onClick={()=>void open(status?.result)}>{uiText('Open destination')}</button>:<button className="primary" disabled={!target||busy||!!reply&&images>0&&!draft.textOnly&&!reply.quote} onClick={()=>void send()}><Icon name="arrow-right"/>{reply?(busy?uiText('Opening conversation…'):uiText('Continue reply')):busy?uiText('Forwarding…'):locked?uiText('Retry forwarding'):uiText('Forward')}</button>}
   </footer>
  </section>
 </div>
}
