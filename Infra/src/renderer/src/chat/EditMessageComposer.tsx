import {useEffect,useRef,useState} from 'react'
import type {ChatHistory,ChatMessage} from '../../../shared/chat-groups'
import {api} from '../api'
import {translate as uiText,useI18n} from '../i18n'
import {ComposerTools} from '../components/ComposerTools'
import {Icon} from '../components/Icon'
import {MotionStrip} from './MotionStrip'
import {useComposerHeight} from './useComposerHeight'

const conflictError='Message changed; reload before saving'

/** Editing has its own buffer; the conversation's unsent draft never enters this component. */
export function EditMessageComposer({groupId,message,onSaved,onCancel}:{groupId:string;message:ChatMessage;onSaved:(message:ChatMessage)=>void;onCancel:()=>void}){
  useI18n()
  const [base,setBase]=useState(message),[text,setText]=useState(message.text),[error,setError]=useState(''),[latest,setLatest]=useState<ChatMessage|null>(null),[saving,setSaving]=useState(false)
  const input=useRef<HTMLTextAreaElement>(null),alive=useRef(true),busy=useRef(false)
  const conflict=error===conflictError,label=conflict?'Save my version':error?'Retry save':'Save changes'
  useComposerHeight(input,text,true,message.id)
  useEffect(()=>{alive.current=true;input.current?.focus();input.current?.setSelectionRange(message.text.length,message.text.length);return()=>{alive.current=false}},[])
  const readLatest=async()=>{const page=await api.call<ChatHistory>('chat.history',{id:groupId,around:message.id,limit:1}),current=page.messages.find(item=>item.id===message.id);if(!current)throw Error('Original message unavailable');return current}
  const save=async()=>{
    if(busy.current||!text.trim()&&!message.attachments?.length||conflict&&!latest)return
    busy.current=true;setSaving(true)
    const expected=conflict&&latest?latest:base;setBase(expected);setError('');setLatest(null)
    try{const updated=await api.call<ChatMessage>('chat.edit',{id:groupId,messageId:message.id,text:text.trim(),expectedRevision:expected.editRevision??0});if(alive.current)onSaved(updated)}
    catch(cause){if(!alive.current)return;const note=(cause as Error).message;setError(note);if(note===conflictError){try{const current=await readLatest();if(alive.current)setLatest(current)}catch(readError){if(alive.current)setError((readError as Error).message)}}}
    finally{busy.current=false;if(alive.current)setSaving(false)}
  }
  const loadLatest=async()=>{
    if(busy.current)return;busy.current=true;setSaving(true)
    try{const current=await readLatest();if(!alive.current)return;setBase(current);setText(current.text);setError('');setLatest(null);requestAnimationFrame(()=>{if(alive.current){input.current?.focus();input.current?.setSelectionRange(current.text.length,current.text.length)}})}
    catch(cause){if(alive.current)setError((cause as Error).message)}finally{busy.current=false;if(alive.current)setSaving(false)}
  }
  return <section className="message-edit-composer" aria-label={uiText('Edit message')} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();if(!busy.current)onCancel()}}}>
    <MotionStrip className="message-edit-heading"><Icon name="edit"/><div><strong>{uiText('Editing message')}</strong><small>{base.text}</small></div><button aria-label={uiText('Cancel editing')} disabled={saving} onClick={onCancel}><Icon name="close"/>{uiText('Cancel')}</button></MotionStrip>
    {error&&<div className="message-edit-error" role="alert"><p>{uiText(conflict?'Message changed elsewhere. Your edit is kept. Load the latest text, or choose Save my version.':error)}</p>{conflict&&latest&&<blockquote><strong>{uiText('Latest version')}</strong><p>{latest.text}</p></blockquote>}{conflict&&<button disabled={saving} onClick={()=>void loadLatest()}>{uiText('Load latest')}</button>}</div>}
    <div className="group-compose-box message-edit-box"><textarea ref={input} aria-label={uiText('Edit message text')} rows={1} value={text} disabled={saving} onChange={event=>setText(event.target.value)} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void save()}}}/><button className="group-send" aria-label={uiText(label)} title={uiText(label)} disabled={saving||!text.trim()&&!message.attachments?.length||conflict&&!latest} onClick={()=>void save()}>{saving?<span className="spinner"/>:<Icon name="check"/>}</button></div>
    <footer><ComposerTools input={input} value={text} onChange={setText} disabled={saving}/><span>{uiText('Enter to save · Esc to cancel')}</span></footer>
    {!!message.deliveries.length&&<p className="message-edit-routing"><Icon name="info"/>{uiText('Editing this shared message does not change or rerun tasks already delivered.')}</p>}
  </section>
}
