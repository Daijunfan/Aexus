import {useCallback,useLayoutEffect,type RefObject} from 'react'

/** Text can wrap after resizing or opening a panel even when the draft did not change. */
export function useComposerHeight(input:RefObject<HTMLTextAreaElement|null>,value:string,enabled=true,identity?:string){
  const resize=useCallback(()=>{const el=input.current;if(enabled&&el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,180)+'px'}},[input,enabled])
  useLayoutEffect(resize,[value,identity,resize])
  useLayoutEffect(()=>{
    const el=input.current;if(!enabled||!el)return
    let width=el.clientWidth
    const observer=new ResizeObserver(()=>{if(el.clientWidth!==width){width=el.clientWidth;resize()}})
    observer.observe(el);return()=>observer.disconnect()
  },[input,enabled,identity,resize])
}
