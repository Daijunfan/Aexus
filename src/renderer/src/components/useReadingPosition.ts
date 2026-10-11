import {useCallback,useLayoutEffect,useRef,type RefObject} from 'react'

/** Retain a visible card, including when the browser already applied scroll anchoring. */
export function useReadingPosition(root:RefObject<HTMLElement|null>,content:unknown){
 const pending=useRef<{element:HTMLElement;top:number}[]>([])
 useLayoutEffect(()=>{const area=root.current,anchor=pending.current.find(item=>item.element.isConnected&&area?.contains(item.element));pending.current=[];if(area&&anchor)area.scrollTop+=anchor.element.getBoundingClientRect().top-anchor.top},[content,root])
 return useCallback(()=>{const area=root.current;if(!area||area.scrollTop<1){pending.current=[];return}const top=area.getBoundingClientRect().top;pending.current=[...area.querySelectorAll<HTMLElement>('[data-news-id],[data-message-key]')].map(element=>({element,box:element.getBoundingClientRect()})).filter(item=>item.box.bottom>top).slice(0,3).map(({element,box})=>({element,top:box.top}))},[root])
}
