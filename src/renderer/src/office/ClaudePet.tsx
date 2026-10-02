import {memo,useContext,useEffect,useState} from 'react'
import {CanvasMotion} from './motion'
import {avatarTint,type ClaudeAvatar} from '../../../shared/office'
import type {PetPose} from './usePetBehavior'
import buddies from '../assets/pets/claude-buddies.json'
import clawd from '../assets/pets/clawd.svg'

/** Anthropic's original Buddy frames and Clawd artwork, driven by actual app state. */
export const ClaudePet=memo(function ClaudePet({kind,pose,working,color,subtle=false}:{kind:ClaudeAvatar;pose:PetPose;working:boolean;color?:string;subtle?:boolean}){
  const animated=useContext(CanvasMotion),[hovered,setHovered]=useState(false),[tick,setTick]=useState(0)
  if(hovered)pose='pickup'
  const sleeping=!working&&pose!=='pickup'&&pose!=='land'
  const state=sleeping?'sleep':pose==='pickup'||pose==='land'?'heart':pose==='wave'?'idle':'busy'
  const clip=kind==='clawd'?null:buddies[kind][state],ms=clip?.ms??500
  useEffect(()=>{
    setTick(0)
    if(!animated||(subtle&&!hovered)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const timer=setInterval(()=>setTick(t=>t+1),ms)
    return()=>clearInterval(timer)
  },[kind,state,ms,animated,subtle,hovered])
  const frame=clip?clip.sequence[tick%clip.sequence.length]:tick%2
  return <span onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} className={`mascot official-pet claude-pet pose-${pose} ${sleeping?'official-napping':''}`} data-avatar={kind} data-pose={pose} data-frame={`${state}:${frame}`} aria-hidden="true">
    <span className="pet-viewport"><span className="official-frame" style={{filter:avatarTint(kind,color)}}>
      {clip?<span className="buddy-body" style={{color:'#d97757'}}>{clip.frames[frame].join('\n')}</span>:<img className={`clawd-body ${sleeping?'':'clawd-awake'}`} src={clawd} alt="" draggable={false}/>}
    </span>{sleeping&&<span className="sleep-marks"><span className="sleep-z z-one">Z</span><span className="sleep-z z-two">Z</span><span className="sleep-z z-three">Z</span></span>}</span>
  </span>
})
