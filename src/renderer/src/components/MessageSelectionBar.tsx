import {MotionStrip} from '../chat/MotionStrip'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import {useMessenger} from './useMessenger'
import {Icon} from './Icon'

export function MessageSelectionBar({conversation,messages}:{conversation:string;messages:{id:string;text:string;images?:string[]}[]}){
  useI18n()

 const messenger=useMessenger()!,selection=messenger.selection,[copy,setCopy]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(!copy)return;const timer=setTimeout(()=>setCopy(''),1800);return()=>clearTimeout(timer)},[copy])
 const active=selection?.conversation===conversation
 useEffect(()=>{if(!active)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();messenger.setSelection(null)}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[active,messenger.setSelection])
 if(!active)return null
 const selected=messages.filter(message=>selection.ids.includes(message.id)),text=selected.map(message=>message.text).filter(Boolean).join('\n\n'),images=selected.reduce((total,message)=>total+(message.images?.length??0),0)
 const update=async(patch:{saved?:boolean;hidden?:boolean})=>{setBusy(true);if(await messenger.messages(conversation,selection.ids,patch))messenger.setSelection(null);setBusy(false)}
 return <MotionStrip className="message-selection-bar" role="toolbar" aria-label={uiText("Selected message actions")}><button aria-label={uiText("Cancel message selection")} onClick={()=>messenger.setSelection(null)}><Icon name="close"/></button><strong>{uiText('{0} selected',[selection.ids.length])}</strong><span/>
  <button disabled={busy||!text} aria-label={uiText("Copy selected messages")} title={uiText("Copy selected")} onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopy('Copied')}catch{setCopy('Could not copy')}}}><Icon name="copy"/>{copy?uiText(copy):uiText('Copy')}</button>
  <button disabled={busy||!selected.length} aria-label={uiText("Save selected messages")} title={uiText("Save selected")} onClick={()=>void update({saved:true})}><Icon name="bookmark"/>{uiText("Save")}</button>
  <button disabled={busy||!selected.length||selected.length>50} aria-label={uiText("Forward selected messages")} title={uiText("Forward up to 50 selected messages")} onClick={()=>messenger.setForward({messages:selected.map(message=>({conversation,id:message.id})),text,images})}><Icon name="arrow-right"/>{uiText("Forward")}</button>
  <button disabled={busy||!selected.length} aria-label={uiText("Hide selected messages")} title={uiText("Hide for me; task history stays unchanged")} onClick={()=>void update({hidden:true})}><Icon name="eye-closed"/>{uiText("Hide")}</button>
 </MotionStrip>
}
export function MessageCheckbox({conversation,id}:{conversation?:string;id:string}){
  useI18n()

 const messenger=useMessenger();if(!conversation||messenger?.selection?.conversation!==conversation)return null
 return <input className="message-select-toggle" type="checkbox" aria-label={uiText("Select this message")} checked={messenger.selection.ids.includes(id)} onChange={()=>messenger.toggleSelection(conversation,id)}/>
}
