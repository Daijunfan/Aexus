import {useLayoutEffect,useRef} from 'react'
import {playMessageMotion} from './surfaceMotion'

/** Keep each existing row visually connected when pinning or incoming activity reorders it. */
export function useConversationListMotion(order:string,attribute='data-conversation-key'){
  const root=useRef<HTMLDivElement>(null),previous=useRef<Map<string,{x:number;y:number}>|null>(null),width=useRef(0)
  useLayoutEffect(()=>{
    const list=root.current;if(!list)return
    const box=list.getBoundingClientRect(),factor=box.width/list.offsetWidth||1,next=new Map<string,{x:number;y:number}>(),old=previous.current
    for(const row of list.querySelectorAll<HTMLElement>(`[${attribute}]`)){
      const active=row.getAnimations(),matrix=active.length?new DOMMatrix(getComputedStyle(row).transform):null
      active.forEach(animation=>animation.cancel())
      const rect=row.getBoundingClientRect(),key=row.getAttribute(attribute)!,point={x:(rect.left-box.left)/factor,y:(rect.top-box.top)/factor+list.scrollTop},before=old?.get(key)
      next.set(key,point)
      if(!old||width.current!==box.width||rect.bottom<box.top||rect.top>box.bottom)continue
      if(before){const x=before.x+(matrix?.m41??0)-point.x,y=before.y+(matrix?.m42??0)-point.y;if(x||y)playMessageMotion(row,[{transform:`translate(${x}px,${y}px)`},{transform:'none'}],220)}
      else playMessageMotion(row,[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}],180)
    }
    previous.current=next;width.current=box.width
  },[order,attribute])
  return root
}
