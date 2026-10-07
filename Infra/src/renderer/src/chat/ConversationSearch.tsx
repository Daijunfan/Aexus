import {MotionStrip} from './MotionStrip'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import {useMessenger} from '../components/useMessenger'
import {Icon} from '../components/Icon'

/** Searches the conversation already loaded by Core; never fetches other employees' histories. */
export function ConversationSearch({open,onOpen,items,transcript,onNavigate,onReveal,conversation}:{onReveal?:(id:string,signal?:AbortSignal)=>Promise<HTMLElement|null>;conversation?:string;open:boolean;onOpen:(open:boolean)=>void;items:{id:string;text:string}[];transcript:RefObject<HTMLDivElement|null>;onNavigate:(distanceFromEnd:number)=>void}){
  useI18n()

  const messenger=useMessenger()
  const [query,setQuery]=useState(''),[index,setIndex]=useState(0),input=useRef<HTMLInputElement>(null)
  const matches=useMemo(()=>query.trim()?items.filter(item=>item.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())):[],[items,query])
  const current=matches.length?Math.min(index,matches.length-1):0
  const activeId=matches[current]?.id
  const navigate=useRef(onNavigate);navigate.current=onNavigate
  const reveal=useRef(onReveal);reveal.current=onReveal
  const toggle=useRef(onOpen);toggle.current=onOpen
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'&&!document.querySelector('[aria-modal="true"]')){event.preventDefault();toggle.current(true);input.current?.select()}
      if(open&&event.key==='Escape'&&!document.querySelector('.message-image-dialog')){event.preventDefault();event.stopImmediatePropagation();toggle.current(false)}
    }
    window.addEventListener('keydown',key,true)
    return()=>window.removeEventListener('keydown',key,true)
  },[open])
  const wasOpen=useRef(false)
  useEffect(()=>{
    if(open)input.current?.focus()
    else {setQuery('');setIndex(0);if(wasOpen.current)transcript.current?.closest('.message-conversation,.group-conversation')?.querySelector<HTMLButtonElement>('[data-message-search-trigger]')?.focus()}
    wasOpen.current=open
  },[open,transcript])
  useEffect(()=>{
    if(!open||!activeId)return
    const controller=new AbortController();let marked:HTMLElement|null=null
    void (async()=>{
      const el=reveal.current?await reveal.current(activeId,controller.signal):Array.from(transcript.current?.querySelectorAll<HTMLElement>('[data-chat-item]')??[]).find(node=>node.dataset.chatItem===activeId)
      if(controller.signal.aborted||!el)return
      marked=el;el.dataset.searchMatch='true';if(!reveal.current)el.scrollIntoView({block:'center'});const root=transcript.current;if(root)navigate.current(root.scrollHeight-root.clientHeight-root.scrollTop)
    })()
    return()=>{controller.abort();if(marked)delete marked.dataset.searchMatch}
  },[activeId,open,query,transcript])
  if(!open)return null
  const step=(offset:number)=>{if(matches.length)setIndex((current+offset+matches.length)%matches.length)}
  return <MotionStrip className="conversation-search" role="search" aria-label={uiText("Search this conversation")}>
    <Icon name="search"/><input ref={input} value={query} aria-label={uiText("Find in conversation")} placeholder={uiText("Find in this conversation…")} onChange={event=>{setQuery(event.target.value);setIndex(0)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();step(event.shiftKey?-1:1)}}}/>
    {conversation&&<button className="conversation-search-all" title={uiText("Search all history")} aria-label={uiText("Search all history")} onClick={()=>{onOpen(false);messenger?.setLibrary({conversation,query})}}><Icon name="search-fuzzy"/></button>}
    <span role="status">{query.trim()?matches.length?uiText("{0} of {1}",[current+1,matches.length]):uiText("No results"):uiText("Loaded messages")}</span>
    <button aria-label={uiText("Previous match")} title={uiText("Previous match · Shift Enter")} disabled={!matches.length} onClick={()=>step(-1)}><Icon name="chevron-up"/></button><button aria-label={uiText("Next match")} title={uiText("Next match · Enter")} disabled={!matches.length} onClick={()=>step(1)}><Icon name="chevron-down"/></button><button aria-label={uiText("Close conversation search")} onClick={()=>onOpen(false)}><Icon name="close"/></button>
  </MotionStrip>
}
