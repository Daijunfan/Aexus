import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react'

export type MentionRange={start:number;end:number;query:string}
/** Match only the text before the caret; the rest of a draft is never part of the query. */
export function mentionAt(value:string,start:number,end=start):MentionRange|null{
 if(start!==end||start<0||start>value.length)return null
 const before=value.slice(0,start),at=Math.max(before.lastIndexOf('@'),before.lastIndexOf('＠'))
 if(at<0)return null
 const query=before.slice(at+1)
 return /[\r\n\t@＠]/.test(query)?null:{start:at,end:start,query}
}

/** Shared by group/channel composers. Mention recipients remain stable-ID chips. */
export function useMentionPicker(input:RefObject<HTMLTextAreaElement|null>,value:string){
 const [range,setRange]=useState<MentionRange|null>(null),[manual,setManual]=useState(false),[index,setIndex]=useState(0)
 const observed=useRef(''),composing=useRef(false),restore=useRef<number|null>(null)
 const signature=(el:HTMLTextAreaElement)=>JSON.stringify([el.value,el.selectionStart,el.selectionEnd])
 const close=()=>{if(input.current)observed.current=signature(input.current);setRange(null);setManual(false);setIndex(0)}
 const sync=(el:HTMLTextAreaElement)=>{
  if(composing.current)return
  const next=signature(el);if(observed.current===next)return
  observed.current=next;setManual(false);setIndex(0)
  setRange(mentionAt(el.value,el.selectionStart,el.selectionEnd))
 }
 useEffect(()=>{
  const el=input.current;if(!el)return
  const selected=()=>{if(document.activeElement===el)sync(el)}
  el.addEventListener('select',selected);document.addEventListener('selectionchange',selected)
  return()=>{el.removeEventListener('select',selected);document.removeEventListener('selectionchange',selected)}
 },[input])
 const consume=()=>{
  const next=range?value.slice(0,range.start)+value.slice(range.end):value
  restore.current=range?.start??input.current?.selectionStart??value.length
  close();return next
 }
 useLayoutEffect(()=>{
  if(restore.current===null||!input.current)return
  const caret=restore.current;restore.current=null;input.current.focus();input.current.setSelectionRange(caret,caret)
  observed.current=signature(input.current)
 },[value,range,manual])
 const toggle=()=>{
  if(range||manual){close();return}
  input.current?.focus();setIndex(0);setRange(null);setManual(true)
  if(input.current)observed.current=signature(input.current)
 }
 return {open:!!range||manual,active:!!range,query:range?.query.toLocaleLowerCase()??'',index,setIndex,close,sync,consume,toggle,
  inputProps:{
   onSelect:(event:{currentTarget:HTMLTextAreaElement})=>sync(event.currentTarget),
   onCompositionStart:()=>{composing.current=true;close()},
   onCompositionEnd:(event:{currentTarget:HTMLTextAreaElement})=>{composing.current=false;observed.current='';sync(event.currentTarget)}
  }
 }
}
