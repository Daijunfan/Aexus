import {memo,useContext,useEffect,useRef,useState,type CSSProperties} from 'react'
import {currentAvatar,isFateAvatar,type AvatarKind} from '../../../shared/office'
import {EmployeePortrait} from './EmployeePortrait'
import {Mascot} from '../office/Mascot'
import {CanvasMotion} from '../office/motion'
import {motionAllowed} from '../chat/surfaceMotion'
import portraits from '../assets/pets/portraits/manifest.json'

export type MessageAvatarState='idle'|'working'|'responding'|'attention'
const crops=new Map(portraits.map(portrait=>[portrait.id,portrait.crop]))
const visibleAvatars=new Map<Element,(visible:boolean)=>void>()
let observer:IntersectionObserver|undefined
function watchAvatar(element:Element,update:(visible:boolean)=>void){
  observer??=new IntersectionObserver(entries=>{for(const entry of entries)visibleAvatars.get(entry.target)?.(entry.isIntersecting)})
  visibleAvatars.set(element,update);observer.observe(element)
  return()=>{observer?.unobserve(element);visibleAvatars.delete(element);if(!visibleAvatars.size){observer?.disconnect();observer=undefined}}
}

/** One window preference gate for the list; sprite players only run in bounded visible clips. */
export function useMessageAvatarMotion(){
  const [enabled,setEnabled]=useState(motionAllowed)
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setEnabled(motionAllowed());media.addEventListener('change',update);document.addEventListener('visibilitychange',update);return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update)}},[])
  return enabled
}

export const MessageListAvatar=memo(function MessageListAvatar({avatar='fireball',color,state}:{avatar?:AvatarKind;color?:string;state:MessageAvatarState}){
  const allowed=useContext(CanvasMotion),root=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState(false),[engaged,setEngaged]=useState(false),[playing,setPlaying]=useState(false)
  const kind=currentAvatar(avatar),active=state==='working'||state==='responding',crop=crops.get(kind),source=isFateAvatar(kind)?2:1
  const scale=crop?224/Math.max(crop.width,crop.height):1
  const framing=crop?{'--avatar-width':192*source*scale/256*100+'%','--avatar-height':208*source*scale/256*100+'%','--avatar-left':(16+(224-crop.width*scale)/2-crop.left*scale)/256*100+'%','--avatar-top':(16-crop.top*scale)/256*100+'%'} as CSSProperties:undefined
  useEffect(()=>{const element=root.current;if(!element)return;return watchAvatar(element,setVisible)},[])
  useEffect(()=>{const row=root.current?.closest('button');if(!row)return;const enter=()=>setEngaged(true),leave=()=>setEngaged(row.matches(':hover,:focus-visible'));row.addEventListener('pointerenter',enter);row.addEventListener('pointerleave',leave);row.addEventListener('focus',enter);row.addEventListener('blur',leave);return()=>{row.removeEventListener('pointerenter',enter);row.removeEventListener('pointerleave',leave);row.removeEventListener('focus',enter);row.removeEventListener('blur',leave)}},[])
  useEffect(()=>{
    if(!allowed||!visible||state==='attention'||!active&&!engaged){setPlaying(false);return}
    setPlaying(true);const timer=setTimeout(()=>setPlaying(false),active?1800:900)
    return()=>clearTimeout(timer)
  },[allowed,visible,state,active,engaged])
  return <span ref={root} className="message-list-avatar" data-avatar-state={state} data-avatar-playing={playing&&allowed&&visible||undefined} aria-hidden="true"><EmployeePortrait avatar={avatar} color={color}/>{playing&&allowed&&visible&&<span className="message-avatar message-avatar-live" style={framing}><Mascot kind={kind} color={color} working={active} pose={active?(state==='responding'?'wave':'type'):'pickup'} compact={!isFateAvatar(kind)}/></span>}</span>
})
