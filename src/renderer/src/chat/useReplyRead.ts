import {useEffect,type RefObject} from 'react'
import type {EmployeeReply} from '../../../shared/types'
import {api} from '../api'

type Receipt={key:string;selector:string;command:string;args:Record<string,unknown>}
/** One receipt path for every presentation. Observe late-mounted content and retry foreground races. */
export function useVisibleReceipt(root:RefObject<HTMLDivElement|null>,receipt:Receipt|undefined,enabled:boolean,renderKey?:unknown){
  useEffect(()=>{
    if(!enabled||!receipt||!root.current)return
    const transcript=root.current
    let timer:ReturnType<typeof setTimeout>|undefined,retry:ReturnType<typeof setTimeout>|undefined,sending=false,disposed=false,done=false,frame=0
    const visible=()=>{
      // Native focus is checked afresh by the IPC endpoint. Never latch a stale blur event.
      if(disposed||done||document.visibilityState!=='visible'||!document.hasFocus())return false
      const marker=transcript.querySelector<HTMLElement>(receipt.selector)
      if(!marker?.isConnected||marker.closest('[hidden]'))return false
      const r=marker.getBoundingClientRect(),t=transcript.getBoundingClientRect()
      if(!r.width||!r.height||!t.width||!t.height||r.top<t.top||r.bottom>t.bottom+1||r.bottom>window.innerHeight||r.top<0)return false
      const x=Math.max(t.left+1,Math.min(t.right-1,r.left+r.width/2)),y=r.top+r.height/2
      const hit=document.elementFromPoint(x,y)
      return !!hit&&transcript.contains(hit)
    }
    const check=()=>{
      if(!visible()){clearTimeout(timer);timer=undefined;return}
      if(timer||sending||disposed||done)return
      timer=setTimeout(()=>{
        timer=undefined;if(!visible())return
        sending=true
        void api.call<{acknowledged:boolean}>(receipt.command,receipt.args).then(result=>{done=result.acknowledged}).catch(()=>{}).finally(()=>{
          sending=false
          if(!disposed&&!done)retry=setTimeout(check,250)
        })
      },650)
    }
    // Check after layout/React commits: closing an overlay or loading an image may
    // reveal the receipt without a transcript scroll or a native focus event.
    const scheduleCheck=()=>{if(!frame&&!disposed&&!done)frame=requestAnimationFrame(()=>{frame=0;check()})}
    const off=api.onEvent(event=>{if(event.channel==='desktop:visibility'){check();scheduleCheck()}})
    const mutation=new MutationObserver(scheduleCheck);mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class','open']})
    const resize=new ResizeObserver(scheduleCheck);resize.observe(transcript)
    const intersection=new IntersectionObserver(scheduleCheck,{root:transcript,threshold:[0,1]})
    let observed:Element|null=null
    const observeMarker=()=>{const marker=transcript.querySelector(receipt.selector);if(marker!==observed){if(observed)intersection.unobserve(observed);observed=marker;if(marker)intersection.observe(marker)}}
    const content=new MutationObserver(()=>{observeMarker();scheduleCheck()});content.observe(transcript,{childList:true,subtree:true})
    observeMarker();scheduleCheck()
    transcript.addEventListener('scroll',check,{passive:true})
    window.addEventListener('focus',check);window.addEventListener('blur',check);window.addEventListener('resize',check)
    document.addEventListener('visibilitychange',check);document.addEventListener('focusin',scheduleCheck);document.addEventListener('pointerup',scheduleCheck)
    return()=>{disposed=true;off();clearTimeout(timer);clearTimeout(retry);cancelAnimationFrame(frame);mutation.disconnect();content.disconnect();intersection.disconnect();resize.disconnect();transcript.removeEventListener('scroll',check);window.removeEventListener('focus',check);window.removeEventListener('blur',check);window.removeEventListener('resize',check);document.removeEventListener('visibilitychange',check);document.removeEventListener('focusin',scheduleCheck);document.removeEventListener('pointerup',scheduleCheck)}
  },[receipt?.key,enabled,root,renderKey])
}
export function useReplyRead(root:RefObject<HTMLDivElement|null>,employeeId:string|undefined,reply:EmployeeReply|undefined,enabled:boolean,presentation?:string){
  useVisibleReceipt(root,employeeId&&reply&&!reply.readAt?{key:employeeId+':'+reply.id,selector:`[data-reply-id="${reply.id}"]`,command:'session.acknowledge',args:{employee:employeeId,replyId:reply.id}}:undefined,enabled,presentation)
}
