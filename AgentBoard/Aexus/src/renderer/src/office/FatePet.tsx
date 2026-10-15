import {memo,useContext,useEffect,useState} from 'react'
import {avatarTint,type FateAvatar} from '../../../shared/office'
import {CanvasMotion} from './motion'
import type {PetPose} from './usePetBehavior'

const sheets=import.meta.glob<string>('../assets/pets/fate/*.webp',{eager:true,query:'?url',import:'default'})
const previews=import.meta.glob<string>('../assets/pets/fate/previews/*.webp',{eager:true,query:'?url',import:'default'})
const firstFrame={idle:0,work:2,greet:4,sleep:6}

/** Eight authored frames per skin; real employee state selects the animation pair. */
export const FatePet=memo(function FatePet({kind,pose,working,color,compact=false,subtle=false}:{kind:FateAvatar;pose:PetPose;working:boolean;color?:string;compact?:boolean;subtle?:boolean}){
  const animated=useContext(CanvasMotion),[hovered,setHovered]=useState(false),[tick,setTick]=useState(0)
  if(hovered)pose='pickup'
  const sleeping=!working&&pose!=='pickup'&&pose!=='land'
  const state=sleeping?'sleep':pose==='pickup'||pose==='land'||pose==='wave'?'greet':pose==='think'?'idle':'work'
  useEffect(()=>{
    setTick(0)
    if(!animated||((compact||subtle)&&!hovered)||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const timer=setInterval(()=>setTick(value=>1-value),state==='sleep'?1200:state==='idle'?1600:state==='work'?260:220)
    return()=>clearInterval(timer)
  },[kind,state,animated,compact,subtle,hovered])
  const frame=firstFrame[state]+tick,url=compact?previews[`../assets/pets/fate/previews/${kind}.webp`]:sheets[`../assets/pets/fate/${kind}.webp`]
  const tint=avatarTint(kind,color)
  return <span className={`mascot official-pet fate-pet pose-${pose} ${sleeping?'official-napping':''}`} data-avatar={kind} data-pose={pose} data-frame={`${state}:${frame}`} aria-hidden="true" onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)}>
    <span className="pet-viewport"><span className="official-frame"><span className="pet-cell" style={{backgroundImage:`url(${url})`,backgroundSize:'800% 100%',backgroundPosition:`${frame/7*100}% 0%`,filter:`${tint==='none'?'':tint+' '}drop-shadow(1px 4px 2px #16212628)`}}/></span>
      {sleeping&&<span className="sleep-marks"><span className="sleep-z z-one">Z</span><span className="sleep-z z-two">Z</span><span className="sleep-z z-three">Z</span></span>}
    </span>
  </span>
})
