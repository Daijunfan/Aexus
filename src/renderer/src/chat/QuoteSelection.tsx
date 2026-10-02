import {useSurfaceMotion} from './surfaceMotion'
import {useEffect,useRef,useState,type RefObject} from 'react'
import {createPortal} from 'react-dom'
import {quoteText,type MessageQuote} from '../../../shared/message-quotes'
import {translate as uiText,useI18n} from '../i18n'
import {Icon} from '../components/Icon'
import {selectedQuote} from './quoteTextRange'

export function QuoteSelection({container,messages,onQuote,identity,enabled=true}:{container:RefObject<HTMLDivElement|null>;messages:{id:string;source:string|string[]}[];onQuote:(id:string,quote:MessageQuote)=>void;identity?:string;enabled?:boolean}){
  useI18n()
  const data=useRef(messages),callback=useRef(onQuote);data.current=messages;callback.current=onQuote
  const cache=useRef<{source:string;text:string}|null>(null)
  const [value,setValue]=useState<{id:string;quote:MessageQuote;x:number;y:number}|null>(null)
  useEffect(()=>{
    setValue(null);cache.current=null;if(!enabled)return
    let frame=0
    const read=()=>{
      if(document.activeElement?.closest('.message-quote-selection'))return
      const selection=getSelection(),el=container.current
      if(!el||!selection||selection.isCollapsed||selection.rangeCount!==1){setValue(null);return}
      const range=selection.getRangeAt(0),start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer as Element:range.startContainer.parentElement,end=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer as Element:range.endContainer.parentElement
      const row=start?.closest<HTMLElement>('[data-chat-item]')
      if(!row||!el.contains(row)||row!==end?.closest('[data-chat-item]')||row.dataset.selecting==='true'){setValue(null);return}
      const message=data.current.find(message=>message.id===row.dataset.chatItem)
      if(!message){setValue(null);return}
      const source=JSON.stringify(message.source);if(cache.current?.source!==source)cache.current={source,text:quoteText(message.source)}
      const quote=selectedQuote(row,message.source,range,cache.current.text)
      if(!quote){setValue(null);return}
      const rect=range.getBoundingClientRect(),bounds=el.getBoundingClientRect();if(rect.bottom<bounds.top||rect.top>bounds.bottom){setValue(null);return}
      setValue({id:message!.id,quote,x:Math.max(8,Math.min(innerWidth-190,rect.left+rect.width/2-90)),y:Math.max(bounds.top+5,rect.top-43)})
    }
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(read)}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(document.activeElement?.closest('.message-quote-selection')||!getSelection()?.isCollapsed&&container.current?.contains(getSelection()?.anchorNode??null))){event.preventDefault();event.stopImmediatePropagation();getSelection()?.removeAllRanges();setValue(null);container.current?.focus({preventScroll:true})}}
    document.addEventListener('selectionchange',update);container.current?.addEventListener('scroll',update);window.addEventListener('resize',update);window.addEventListener('keydown',key,true)
    const root=container.current
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('selectionchange',update);root?.removeEventListener('scroll',update);window.removeEventListener('resize',update);window.removeEventListener('keydown',key,true)}
  },[container,identity,enabled])
  if(!value)return null
  return createPortal(<SelectionToolbar x={value.x} y={value.y} onQuote={()=>{callback.current(value.id,value.quote);getSelection()?.removeAllRanges();setValue(null)}}/>,document.body)
}
function SelectionToolbar({x,y,onQuote}:{x:number;y:number;onQuote:()=>void}){
  useI18n();const root=useSurfaceMotion<HTMLDivElement>('menu')
  return <div ref={root} className="message-quote-selection" style={{left:x,top:y}} role="toolbar" aria-label={uiText('Selected text actions')} onPointerDown={event=>event.preventDefault()}><button onClick={onQuote} aria-label={uiText('Quote selected text')}><Icon name="quote"/>{uiText('Quote selection')}<Icon name="reply"/></button></div>
}
