import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react'

const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'})
/** Only 1–3 complete emoji graphemes get the expressive bubble treatment. */
export function emojiCount(text:string){
 const parts=[...graphemes.segment(text.trim())].map(part=>part.segment).filter(part=>part.trim())
 return parts.length>0&&parts.length<=3&&parts.every(part=>/[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(part)&&/^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\uFE0F\u20e3\d#*\u{E0020}-\u{E007F}]+$/u.test(part))?parts.length:undefined
}

type Groupable={id:string;author:string;time?:number|null;break?:boolean;breakBefore?:boolean}
export type BubbleGroup='single'|'first'|'middle'|'last'

/** Group only adjacent, visible messages with a known, same-day time interval. */
export function messageGroups(items:Groupable[]):Map<string,BubbleGroup>{
  const joins=(a?:Groupable,b?:Groupable)=>!!a&&!!b&&!a.break&&!b.break&&!b.breakBefore&&a.author===b.author&&!!a.time&&!!b.time&&b.time>=a.time&&b.time-a.time<5*60_000&&new Date(a.time).toDateString()===new Date(b.time).toDateString()
  return new Map(items.map((item,index)=>{
    const previous=joins(items[index-1],item),next=joins(item,items[index+1])
    return [item.id,previous?(next?'middle':'last'):(next?'first':'single')]
  }))
}

type MotionMessage={id:string;outgoing:boolean;text?:string}
type SendOrigin={box:DOMRect;text:string;time:number}

/** Animate actual appends, never initial history, pagination, streaming updates or restores. */
export function useMessageMotion({conversation,ready,items,transcript,composer,following}:{conversation?:string;ready:boolean;items:MotionMessage[];transcript:RefObject<HTMLDivElement|null>;composer:RefObject<HTMLTextAreaElement|null>;following:()=>boolean}){
  const previous=useRef<{conversation?:string;ids:string[]}|null>(null)
  const origin=useRef<SendOrigin|null>(null),running=useRef(new Set<Animation>())
  const reduced=useRef(false)
  const cancel=()=>{for(const animation of running.current)animation.cancel();running.current.clear()}
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)')
    const update=()=>{reduced.current=media.matches;if(reduced.current)cancel()}
    const visibility=()=>{if(document.hidden){origin.current=null;cancel()}}
    update();media.addEventListener('change',update);document.addEventListener('visibilitychange',visibility)
    return()=>{cancel();media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility)}
  },[])
  useLayoutEffect(()=>{
    const last=previous.current,ids=items.map(item=>item.id)
    previous.current=ready?{conversation,ids}:null
    if(!ready||!conversation||last?.conversation!==conversation){origin.current=null;cancel();return}
    const oldEnd=last.ids.at(-1),position=oldEnd?ids.indexOf(oldEnd):-1
    // An empty, loaded conversation can receive its first message. A replaced snapshot cannot.
    if(oldEnd&&position<0)return
    const seen=new Set(last.ids),added=items.slice(position+1).filter(item=>!seen.has(item.id))
    const el=transcript.current
    if(!el||!added.length)return
    if(document.hidden||reduced.current||!following()){origin.current=null;return}
    const bounds=el.getBoundingClientRect(),nodes=new Map([...el.querySelectorAll<HTMLElement>('[data-chat-item]')].map(node=>[node.dataset.chatItem,node]))
    const play=(node:Element,frames:Keyframe[],duration:number)=>{
      const animation=node.animate(frames,{duration,easing:'cubic-bezier(.22,1,.36,1)'})
      running.current.add(animation)
      const cleanup=()=>running.current.delete(animation)
      animation.addEventListener('finish',cleanup,{once:true});animation.addEventListener('cancel',cleanup,{once:true})
    }
    let sent=false
    for(const item of added.slice(-6)){
      const row=nodes.get(item.id),bubble=row?.querySelector<HTMLElement>(':scope > .bubble')??row
      if(!bubble||row?.classList.contains('message-hidden'))continue
      const rect=bubble.getBoundingClientRect()
      if(rect.bottom<=bounds.top||rect.top>=bounds.bottom)continue
      const from=origin.current,isSend=item.outgoing&&from&&Date.now()-from.time<3000&&item.text?.trim()===from.text
      if(isSend){
        origin.current=null;sent=true
        const x=from.box.right-rect.right,y=from.box.bottom-rect.bottom
        play(bubble,[{transform:`translate(${x}px,${y}px) scale(${Math.min(from.box.width/rect.width,1.35)},${Math.max(.65,Math.min(from.box.height/rect.height,1))})`,opacity:.35,transformOrigin:'bottom right'},{transform:'none',opacity:1,transformOrigin:'bottom right'}],380)
        row!.dataset.messageArrival='send'
      }else{
        play(bubble,[{transform:`translateY(12px) scale(.985)`,opacity:0,transformOrigin:item.outgoing?'bottom right':'bottom left'},{transform:'none',opacity:1}],260)
        row!.dataset.messageArrival='incoming'
      }
    }
    // One finite compositor-only wallpaper movement per accepted outgoing message.
    if(sent){const mesh=el.closest('.message-stage')?.querySelector('.message-wallpaper-mesh');if(mesh){for(const animation of mesh.getAnimations())animation.cancel();play(mesh,[{transform:'translate3d(-2%,-1%,0) rotate(-3deg) scale(1.08)'},{transform:'translate3d(2%,1%,0) rotate(3deg) scale(1.08)',offset:.55},{transform:'none'}],1100)}}
  },[conversation,ready,items])
  return (text:string)=>{
    const box=composer.current?.closest('.composer-box,.group-compose-box')?.getBoundingClientRect()
    const pending=box?{box,text:text.trim(),time:Date.now()}:null
    origin.current=pending
    return()=>{if(origin.current===pending)origin.current=null}
  }
}
