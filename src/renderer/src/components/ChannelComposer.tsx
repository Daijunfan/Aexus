import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {ChannelMessage,ChannelView} from '../../../shared/channels'
import {hasDraftContent,type MessageDraft} from '../../../shared/messenger'
import type {Store} from '../../../shared/types'
import {api} from '../api'
import {translate as uiText,useI18n} from '../i18n'
import {useComposerHeight} from '../chat/useComposerHeight'
import {MotionStrip} from '../chat/MotionStrip'
import {ComposerTools} from './ComposerTools'
import {useMessenger} from './useMessenger'
import {Icon} from './Icon'

export type ChannelReply={id:string;author:string;text:string}
const payloadIdentity=(text:string,mentions:string[]|'all',replyTo?:string)=>JSON.stringify([text.trim(),mentions,replyTo??null])
export function ChannelComposer({channel,store,reply,onReply,onReveal,onSent,onAdministrators,hidden=false}:{channel:ChannelView;store:Store;reply:ChannelReply|null;onReply:(reply:ChannelReply|null)=>void;onReveal:(id:string)=>void;onSent:(message:ChannelMessage)=>void;onAdministrators:()=>void;hidden?:boolean}){
 useI18n()
 const messenger=useMessenger()!,conversation='channel:'+channel.id,saved=messenger.getDraft(conversation)
 const [text,setText]=useState(saved?.text??''),[mentions,setMentions]=useState<string[]|'all'>(saved?.mentions??[]),[menu,setMenu]=useState(false),[index,setIndex]=useState(0),[sending,setSending]=useState(false),[error,setError]=useState(''),[retryId,setRetryId]=useState<string|null>(null)
 const composer=useRef<HTMLTextAreaElement>(null),inFlight=useRef(false),alive=useRef(true),[restored,setRestored]=useState(false)
 const request=useRef({id:saved?.clientMessageId??crypto.randomUUID(),payload:payloadIdentity(saved?.text??'',saved?.mentions??[],saved?.replyTo),persisted:!!saved})
 const admins=store.sessions.filter(card=>channel.adminIds.includes(card.id)&&!card.deleting),name=(id:string)=>admins.find(card=>card.id===id)?.title??uiText('Former member')
 useComposerHeight(composer,text,!hidden,channel.id)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const restore=(draft:Omit<MessageDraft,'updatedAt'>|undefined,initial=false)=>{request.current={id:draft?.clientMessageId??crypto.randomUUID(),payload:payloadIdentity(draft?.text??'',draft?.mentions??[],draft?.replyTo),persisted:!!draft};setText(draft?.text??'');setMentions(draft?.mentions??[]);if(!initial||!reply)onReply(draft?.replyTo?{id:draft.replyTo,author:uiText('Original message'),text:''}:null)}
 useLayoutEffect(()=>{if(!messenger.ready||restored)return;restore(messenger.getDraft(conversation),true);setRestored(true)},[messenger.ready,conversation,restored])
 const snapshot=()=>{const payload=payloadIdentity(text,mentions,reply?.id);if(request.current.payload!==payload)request.current={id:crypto.randomUUID(),payload,persisted:false};return {text,mentions,replyTo:reply?.id,clientMessageId:request.current.id}}
 useLayoutEffect(()=>{if(!restored)return;const value=snapshot(),latest=messenger.getDraft(conversation);if(!latest&&!hasDraftContent(value))return;if(latest&&latest.text===value.text&&latest.replyTo===value.replyTo&&JSON.stringify(latest.mentions??[])===JSON.stringify(value.mentions)&&latest.clientMessageId===value.clientMessageId)return;request.current.persisted=true;messenger.scheduleDraft(conversation,value)},[conversation,text,mentions,reply?.id,restored])
 // A response from an older mounted composer may clear only this same, unchanged draft.
 useEffect(()=>{if(restored&&!sending&&request.current.persisted&&!messenger.getDraft(conversation))restore(undefined)},[messenger.state,restored,sending])
 const change=(value:string)=>{setText(value);setError('');setMenu(/(?:^|\s)@[^\n@]*$/.test(value));setIndex(0)}
 const term=menu?(text.match(/(?:^|\s)@([^\n@]*)$/)?.[1]??'').toLowerCase():''
 const choices=[{id:'all',title:uiText('All administrators')},...admins].filter(card=>card.title.toLowerCase().includes(term))
 const choose=(id:string)=>{setMentions(id==='all'?'all':mentions==='all'?[id]:[...new Set([...mentions,id])]);setText(value=>value.replace(/(^|\s)@[^\n@]*$/,'$1'));setMenu(false);composer.current?.focus()}
 const send=async()=>{
  if(!restored||!text.trim()||inFlight.current)return
  if(menu&&/(?:^|\s)@[^\n@]*$/.test(text)){setError(uiText('Choose an administrator from the mention menu before sending.'));return}
  inFlight.current=true;setSending(true);setError('')
  const value=snapshot();let attempted=false
  try{
   if(!await messenger.draft(conversation,value))throw Error('Your draft could not be saved. Try again before leaving.')
   if(messenger.getDraft(conversation)?.clientMessageId!==value.clientMessageId){if(alive.current)restore(messenger.getDraft(conversation));throw Error('Draft changed before sending. Review it and try again.')}
   attempted=true
   const message=await api.call<ChannelMessage>('channel.message-send',{id:channel.id,text:value.text.trim(),mentions:value.mentions,replyTo:value.replyTo,clientMessageId:value.clientMessageId})
   if(alive.current)onSent(message)
   const cleared=await messenger.clearDraft(conversation,value.clientMessageId)
   if(alive.current&&request.current.id===value.clientMessageId)restore(messenger.getDraft(conversation))
   if(alive.current&&!cleared)setError('Message was sent, but its draft could not be cleared.')
  }catch(cause){if(alive.current){setError((cause as Error).message);setRetryId(attempted?value.clientMessageId:null)}}finally{inFlight.current=false;if(alive.current){setSending(false);if(!hidden)composer.current?.focus()}}
 }
 return <div className="group-composer channel-composer" hidden={hidden}>
  {error&&<p className="group-error" role="alert">{uiText(error)}{retryId===request.current.id&&<><br/><small>{uiText('Retrying the same message will not send it twice.')}</small></>}</p>}
  {reply&&<MotionStrip className="group-replying"><button className="group-reply-source" aria-label={uiText('Go to original message')} onClick={()=>onReveal(reply.id)}><strong>{uiText('Replying to')} {reply.author}</strong><small>{reply.text||uiText('Original message')}</small></button><button aria-label={uiText('Cancel reply')} onClick={()=>{onReply(null);composer.current?.focus()}}><Icon name="close"/></button></MotionStrip>}
  {(mentions==='all'||mentions.length>0)&&<div className="group-recipient-chips" aria-label={uiText('Mentioned administrators')}>{(mentions==='all'?['all']:mentions).map(id=><button key={id} aria-label={uiText('Remove mention {0}',[id==='all'?uiText('All administrators'):name(id)])} onClick={()=>setMentions(mentions==='all'?[]:mentions.filter(value=>value!==id))}>@{id==='all'?uiText('All administrators'):name(id)} <span>×</span></button>)}</div>}
  <div className="group-compose-box">
   {menu&&<div className="group-mention-menu" role="listbox" aria-label={uiText('Mention channel administrators')}>{choices.map((card,position)=><button role="option" aria-selected={position===index} key={card.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(card.id)}><Icon name={card.id==='all'?'organization':'person'}/><span>{card.title}<small>{uiText(card.id==='all'?'Channel administrators':'Administrator')}</small></span></button>)}{!choices.length&&<p>{uiText('No matching members.')}</p>}</div>}
   <textarea ref={composer} aria-label={uiText('Channel message')} placeholder={uiText('Discuss an article · @mention an administrator')} value={text} rows={1} disabled={sending||!restored} onChange={event=>change(event.target.value)} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(menu&&['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Escape')setMenu(false);else if(event.key==='Enter'&&choices[index])choose(choices[index].id);else setIndex(previous=>(previous+(event.key==='ArrowUp'?-1:1)+choices.length)%Math.max(1,choices.length));return}if(event.key==='Escape'&&reply){event.preventDefault();event.stopPropagation();onReply(null);return}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/>
   <button className="group-send" aria-label={uiText('Send channel message')} disabled={sending||!restored||!text.trim()} onClick={()=>void send()}>{sending?<span className="spinner"/>:<Icon name="arrow-up"/>}</button>
  </div>
  <footer>{!hidden&&<ComposerTools input={composer} value={text} onChange={change} disabled={sending||!restored}/>}<button aria-label={uiText('Mention an administrator')} disabled={sending||!restored||!admins.length} onClick={()=>{setMenu(!menu);setIndex(0);composer.current?.focus()}}>{uiText('@ Mention')}</button>{admins.length?<span>{uiText('All administrators can read · Replies optional')}</span>:<button className="channel-add-admin" onClick={onAdministrators}>{uiText('Add administrators')}<Icon name="add"/></button>}</footer>
 </div>
}
