import { useContext, useEffect, useRef, useState } from 'react'
import {CanvasMotion} from './motion'
export type PetPose = 'sleep' | 'blink' | 'look' | 'stretch' | 'yawn' | 'wave' | 'type' | 'think' | 'celebrate' | 'pickup' | 'land'
export function usePetBehavior(seed: string, working: boolean, dragging: boolean, personality: string = 'curious') {
  const [pose,setPose]=useState<PetPose>(working?'type':'sleep')
  const [hovered,setHovered]=useState(false)
  const animated=useContext(CanvasMotion)
  const previous=useRef({working,dragging,hovered})
  useEffect(()=>{
    if(!animated)return
    if(dragging||hovered) { setPose('pickup'); previous.current={working,dragging,hovered}; return }
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if(reduced) { setPose(working?'type':'sleep'); previous.current={working,dragging,hovered}; return }
    let step=[...seed].reduce((n,c)=>n+c.charCodeAt(0),0)%13
    const idle: PetPose[]=personality==='playful'?['sleep','sleep','yawn','sleep','sleep']:['sleep','sleep','sleep','yawn','sleep','sleep']
    const durations: Record<PetPose,number>={sleep:7000,blink:850,look:2700,stretch:2200,yawn:2600,wave:1400,type:3200,think:2400,celebrate:1600,pickup:1000,land:700}
    let timer: ReturnType<typeof setTimeout>
    const play=(next:PetPose)=>{setPose(next);timer=setTimeout(()=>play(working?(step++%4===2?'think':'type'):idle[step++%idle.length]),durations[next]+(step%3)*160)}
    const before=previous.current
    play(before.dragging||before.hovered?'land':before.working&&!working?'yawn':!before.working&&working?'land':hovered&&working?'wave':working?'type':'sleep')
    previous.current={working,dragging,hovered}
    return()=>clearTimeout(timer)
  },[seed,working,dragging,hovered,personality,animated])
  return {pose,onPointerEnter:()=>setHovered(true),onPointerLeave:()=>setHovered(false)}
}
