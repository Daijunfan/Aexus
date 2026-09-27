import {useEffect,type RefObject} from 'react'
import type {EmployeeReply} from '../../../shared/types'
import {api} from '../api'

/** A reply is seen only in the foreground, unobscured transcript, after a short dwell. */
export function useReplyRead(root:RefObject<HTMLDivElement|null>,employeeId:string|undefined,reply:EmployeeReply|undefined,enabled:boolean){
  useEffect(()=>{
    if(!enabled||!employeeId||!reply||reply.readAt||!root.current)return
    const transcript=root.current
    const marker=transcript.querySelector<HTMLElement>(`[data-reply-id="${reply.id}"]`)
    if(!marker)return
    let timer:ReturnType<typeof setTimeout>|undefined,sending=false,disposed=false,desktopActive:boolean|undefined
    const visible=()=>{
      if(desktopActive===false||document.visibilityState!=='visible'||!document.hasFocus()||marker.closest('[hidden]'))return false
      const r=marker.getBoundingClientRect(),t=transcript.getBoundingClientRect()
      if(!r.width||!r.height||!t.width||!t.height||r.top<t.top||r.bottom>t.bottom||r.bottom>window.innerHeight||r.top<0)return false
      const x=Math.max(0,Math.min(window.innerWidth-1,r.left+r.width/2)),y=r.top+r.height/2
      const hit=document.elementFromPoint(x,y)
      return !!hit&&transcript.contains(hit)
    }
    const check=()=>{
      if(!visible()){clearTimeout(timer);timer=undefined;return}
      if(timer||sending||disposed)return
      timer=setTimeout(()=>{
        timer=undefined;if(!visible()||disposed)return
        sending=true
        void api.call<{acknowledged:boolean}>('session.acknowledge',{employee:employeeId,replyId:reply.id}).then(result=>{if(!result.acknowledged)sending=false}).catch(()=>{sending=false})
      },650)
    }
    const off=api.onEvent(event=>{if(event.channel==='desktop:visibility'){desktopActive=event.payload.active;check()}})
    const observer=new IntersectionObserver(check,{root:transcript,threshold:1})
    observer.observe(marker)
    const frame=requestAnimationFrame(check)
    transcript.addEventListener('scroll',check,{passive:true})
    window.addEventListener('focus',check);window.addEventListener('blur',check)
    document.addEventListener('visibilitychange',check)
    return()=>{
      disposed=true;off();clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect()
      transcript.removeEventListener('scroll',check)
      window.removeEventListener('focus',check);window.removeEventListener('blur',check)
      document.removeEventListener('visibilitychange',check)
    }
  },[employeeId,reply?.id,reply?.readAt,enabled,root])
}
