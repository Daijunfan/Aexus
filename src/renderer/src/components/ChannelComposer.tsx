import {useMentionPicker} from '../chat/useMentionPicker'
import {useAttachmentUploads,AttachmentTransfers,DraftFiles} from '../chat/MessageAttachments'
import {draftContent} from '../../../shared/message-drafts'
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
const payloadIdentity=(text:string,mentions:string[]|'all',replyTo?:string,images:string[]=[],files:string[]=[])=>draftContent({text,mentions,replyTo,images,files},'channel')
export function ChannelComposer({channel,store,reply,onReply,onReveal,onSent,onAdministrators,hidden=false}:{channel:ChannelView;store:Store;reply:ChannelReply|null;onReply:(reply:ChannelReply|null)=>void;onReveal:(id:string)=>void;onSent:(message:ChannelMessage)=>void;onAdministrators:()=>void;hidden?:boolean}){
 useI18n()
 const messenger=useMessenger()!,conversation='channel:'+channel.id,saved=messenger.getDraft(conversation)
 const [text,setText]=useState(saved?.text??''),[mentions,setMentions]=useState<string[]|'all'>(saved?.mentions??[]),[sending,setSending]=useState(false),[error,setError]=useState(''),[retryId,setRetryId]=useState<string|null>(null)
 const [images,setImages]=useState<string[]>(saved?.images??[]),[files,setFiles]=useState<string[]>(saved?.files??[]),attachments=useRef({images,files}),attachmentInput=useRef<HTMLInputElement>(null);attachments.current={images,files}
 const composer=useRef<HTMLTextAreaElement>(null),inFlight=useRef(false),alive=useRef(true),[restored,setRestored]=useState(false)
 const picker=useMentionPicker(composer,text),menu=picker.open,index=picker.index,setIndex=picker.setIndex
 const request=useRef({id:saved?.clientMessageId??crypto.randomUUID(),payload:payloadIdentity(saved?.text??'',saved?.mentions??[],saved?.replyTo,saved?.images,saved?.files),persisted:!!saved})
 const admins=store.sessions.filter(card=>channel.adminIds.includes(card.id)&&!card.deleting),name=(id:string)=>admins.find(card=>card.id===id)?.title??uiText('Former member')
 useComposerHeight(composer,text,!hidden,channel.id)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const restore=(draft:Omit<MessageDraft,'updatedAt'>|undefined,initial=false)=>{request.current={id:draft?.clientMessageId??crypto.randomUUID(),payload:payloadIdentity(draft?.text??'',draft?.mentions??[],draft?.replyTo,draft?.images,draft?.files),persisted:!!draft};setImages(draft?.images??[]);setFiles(draft?.files??[]);attachments.current={images:draft?.images??[],files:draft?.files??[]};setText(draft?.text??'');setMentions(draft?.mentions??[]);if(!initial||!reply)onReply(draft?.replyTo?{id:draft.replyTo,author:uiText('Original message'),text:''}:null)}
 useLayoutEffect(()=>{if(!messenger.ready||restored)return;restore(messenger.getDraft(conversation),true);setRestored(true)},[messenger.ready,conversation,restored])
 const snapshot=()=>{const payload=payloadIdentity(text,mentions,reply?.id,images,files);if(request.current.payload!==payload)request.current={id:crypto.randomUUID(),payload,persisted:false};return {text,mentions,images,files,replyTo:reply?.id,clientMessageId:request.current.id}}
 useLayoutEffect(()=>{if(!restored)return;const value=snapshot(),latest=messenger.getDraft(conversation);if(!latest&&!hasDraftContent(value))return;if(latest&&latest.text===value.text&&latest.replyTo===value.replyTo&&JSON.stringify(latest.mentions??[])===JSON.stringify(value.mentions)&&latest.clientMessageId===value.clientMessageId&&JSON.stringify(latest.images??[])===JSON.stringify(value.images)&&JSON.stringify(latest.files??[])===JSON.stringify(value.files))return;request.current.persisted=true;messenger.scheduleDraft(conversation,value)},[conversation,text,mentions,reply?.id,images,files,restored])
 // A response from an older mounted composer may clear only this same, unchanged draft.
 useEffect(()=>{if(restored&&!sending&&request.current.persisted&&!messenger.getDraft(conversation))restore(undefined)},[messenger.state,restored,sending])
 const uploads=useAttachmentUploads(conversation,(_conversation,path,kind)=>{const next={...attachments.current,[kind==='image'?'images':'files']:[...attachments.current[kind==='image'?'images':'files'],path]};attachments.current=next;setImages(next.images);setFiles(next.files)},images.length+files.length)
 const attach=(selected:File[])=>{if(inFlight.current)return;try{uploads.add(selected);setError('')}catch(cause){setError((cause as Error).message)}}
 const removeAttachment=(path:string)=>{setImages(value=>value.filter(file=>file!==path));setFiles(value=>value.filter(file=>file!==path))}
 const change=(value:string)=>{setText(value);setError('')}
 const term=picker.query
 const choices=[{id:'all',title:uiText('All administrators')},...admins].filter(card=>card.title.toLowerCase().includes(term))
 const choose=(id:string)=>{setMentions(id==='all'?'all':mentions==='all'?[id]:[...new Set([...mentions,id])]);setText(picker.consume())}
 const send=async()=>{
  if(!restored||!text.trim()&&!images.length&&!files.length||uploads.pending||inFlight.current)return
  if(picker.active){setError(uiText('Choose an administrator from the mention menu before sending.'));return}
  inFlight.current=true;setSending(true);setError('')
  const value=snapshot();let attempted=false
  try{
   try{await messenger.prepareSend(conversation,value)}catch(error){if((error as {code?:string}).code==='DRAFT_CHANGED'&&alive.current)restore(messenger.getDraft(conversation));throw error}
   attempted=true
   const message=await api.call<ChannelMessage>('channel.message-send',{id:channel.id,text:value.text.trim(),images:value.images,files:value.files,mentions:value.mentions,replyTo:value.replyTo,clientMessageId:value.clientMessageId})
   if(alive.current)onSent(message)
   const cleared=await messenger.clearDraft(conversation,value.clientMessageId)
   if(alive.current&&request.current.id===value.clientMessageId)restore(messenger.getDraft(conversation))
   if(alive.current&&!cleared)setError('Message was sent, but its draft could not be cleared.')
  }catch(cause){if(alive.current){setError((cause as Error).message);setRetryId(attempted?value.clientMessageId:null)}}finally{inFlight.current=false;if(alive.current){setSending(false);if(!hidden)composer.current?.focus()}}
 }
 return <div className="group-composer channel-composer" hidden={hidden} onDragOver={event=>{if([...event.dataTransfer.items].some(item=>item.kind==='file')){event.preventDefault();event.dataTransfer.dropEffect='copy'}}} onDrop={event=>{if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();attach([...event.dataTransfer.files])}}}>
  {error&&<p className="group-error" role="alert">{uiText(error)}{retryId===request.current.id&&<><br/><small>{uiText('Retrying the same message will not send it twice.')}</small></>}</p>}
  {reply&&<MotionStrip className="group-replying"><button className="group-reply-source" aria-label={uiText('Go to original message')} onClick={()=>onReveal(reply.id)}><strong>{uiText('Replying to')} {reply.author}</strong><small>{reply.text||uiText('Original message')}</small></button><button aria-label={uiText('Cancel reply')} onClick={()=>{onReply(null);composer.current?.focus()}}><Icon name="close"/></button></MotionStrip>}
  {(mentions==='all'||mentions.length>0)&&<div className="group-recipient-chips" aria-label={uiText('Mentioned administrators')}>{(mentions==='all'?['all']:mentions).map(id=><button key={id} aria-label={uiText('Remove mention {0}',[id==='all'?uiText('All administrators'):name(id)])} onClick={()=>setMentions(mentions==='all'?[]:mentions.filter(value=>value!==id))}>@{id==='all'?uiText('All administrators'):name(id)} <span>×</span></button>)}</div>}
  <DraftFiles conversation={conversation} images={images} files={files} onRemove={removeAttachment}/><AttachmentTransfers uploads={uploads}/>
  <div className="group-compose-box">
   <input ref={attachmentInput} type="file" multiple hidden aria-label={uiText("Choose attachments")} onChange={event=>{attach([...event.target.files??[]]);event.target.value=''}}/><button className="message-attach" aria-label={uiText("Attach files")} disabled={sending||!restored} onClick={()=>attachmentInput.current?.click()}><Icon name="attach"/></button>
   {menu&&<div className="group-mention-menu" role="listbox" aria-label={uiText('Mention channel administrators')}>{choices.map((card,position)=><button role="option" aria-selected={position===index} key={card.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(card.id)}><Icon name={card.id==='all'?'organization':'person'}/><span>{card.title}<small>{uiText(card.id==='all'?'Channel administrators':'Administrator')}</small></span></button>)}{!choices.length&&<p>{uiText('No matching members.')}</p>}</div>}
   <textarea {...picker.inputProps} onPaste={event=>{const selected=[...event.clipboardData.items].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file);if(selected.length){event.preventDefault();attach(selected)}}} ref={composer} aria-label={uiText('Channel message')} placeholder={uiText('Discuss an article · @mention an administrator')} value={text} rows={1} disabled={sending||!restored} onChange={event=>{change(event.currentTarget.value);picker.sync(event.currentTarget)}} onKeyDown={event=>{if(event.nativeEvent.isComposing||event.keyCode===229)return;if(menu&&['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Escape')picker.close();else if((event.key==='Enter'||event.key==='Tab')&&choices[index])choose(choices[index].id);else setIndex(previous=>(previous+(event.key==='ArrowUp'?-1:1)+choices.length)%Math.max(1,choices.length));return}if(event.key==='Escape'&&reply){event.preventDefault();event.stopPropagation();onReply(null);return}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/>
   <button className="group-send" aria-label={uiText('Send channel message')} disabled={sending||!restored||uploads.pending||!text.trim()&&!images.length&&!files.length} onClick={()=>void send()}>{sending?<span className="spinner"/>:<Icon name="arrow-up"/>}</button>
  </div>
  <footer>{!hidden&&<ComposerTools input={composer} value={text} onChange={change} disabled={sending||!restored}/>}<button aria-label={uiText('Mention an administrator')} disabled={sending||!restored||!admins.length} onClick={picker.toggle}>{uiText('@ Mention')}</button>{admins.length?<span>{uiText('All administrators can read · Replies optional')}</span>:<button className="channel-add-admin" onClick={onAdministrators}>{uiText('Add administrators')}<Icon name="add"/></button>}</footer>
 </div>
}
