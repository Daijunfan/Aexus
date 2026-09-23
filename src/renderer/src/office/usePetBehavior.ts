import { useEffect, useRef, useState } from 'react'
export type PetPose = 'sleep' | 'blink' | 'look' | 'stretch' | 'yawn' | 'wave' | 'type' | 'think' | 'celebrate' | 'pickup' | 'land'
export function usePetBehavior(seed: string, working: boolean, dragging: boolean, personality: string = 'curious') {
  const [pose,setPose]=useState<PetPose>(working?'type':'sleep')
  const [hovered,setHovered]=useState(false)
  const [gaze,setGaze]=useState({x:0,y:0})
  const previous=useRef({working,dragging,hovered})
  useEffect(()=>{
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
  },[seed,working,dragging,hovered,personality])
  return {pose,gaze,onPointerMove:(e:React.PointerEvent<HTMLElement>)=>{const r=e.currentTarget.getBoundingClientRect();setGaze({x:Math.max(-4,Math.min(4,(e.clientX-r.left-r.width/2)/16)),y:Math.max(-3,Math.min(3,(e.clientY-r.top-r.height/3)/24))})},onPointerEnter:()=>setHovered(true),onPointerLeave:()=>{setHovered(false);setGaze({x:0,y:0})}}
}
