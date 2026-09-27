import {memo,useContext,useEffect,useState} from 'react'
import {CanvasMotion} from './motion'
import {avatarTint,type SpriteAvatar} from '../../../shared/office'
import type {PetPose} from './usePetBehavior'

import woodi from '../assets/pets/woodi.webp'
import marmalade from '../assets/pets/marmalade.webp'
import voltcoin from '../assets/pets/voltcoin.webp'
import inky from '../assets/pets/inky.webp'
import byte from '../assets/pets/byte.webp'
import wondercube from '../assets/pets/wondercube.webp'

const sheets:Record<SpriteAvatar,string>={woodi,marmalade,voltcoin,inky,byte,wondercube}
/** Classic and community skins share 192x208 cells in v1/v2 atlases; host status controls its pose. */
export const SpritePet=memo(function SpritePet({kind,pose,working,color,subtle=false}:{kind:SpriteAvatar;pose:PetPose;working:boolean;color?:string;subtle?:boolean}) {
  const animated=useContext(CanvasMotion)
  const [column,setColumn]=useState(0),[hovered,setHovered]=useState(false)
  if(hovered)pose='pickup'
  const sleeping=!working&&pose!=='pickup'&&pose!=='land'
  const rest:Record<SpriteAvatar,[number,number]>={woodi:[5,6],marmalade:[0,3],voltcoin:[5,3],inky:[8,2],byte:[0,1],wondercube:[5,3]}
  const row=sleeping?rest[kind][0]:pose==='think'?6:pose==='wave'?3:pose==='pickup'||pose==='land'?4:7
  const frames=row===3?4:row===4?5:6
  useEffect(()=>{
    setColumn(0)
    if(!animated||(subtle&&!hovered)||sleeping||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    let index=0,timer:ReturnType<typeof setTimeout>
    const next=()=>{index=(index+1)%frames;setColumn(index);timer=setTimeout(next,index===frames-1?220:row===6?150:120)}
    timer=setTimeout(next,120)
    return()=>clearTimeout(timer)
  },[sleeping,row,frames,subtle,hovered,animated])
  const rows=11
  const tint=avatarTint(kind,color)
  // Crop the atlas into one small HTML paint box; move its composited wrapper.
  return <span onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} className={`mascot official-pet pose-${pose} ${sleeping?'official-napping':''}`} data-avatar={kind} data-pose={pose} data-frame={`${row}:${sleeping?rest[kind][1]:column}`} aria-hidden="true">
    <span className="pet-viewport"><span className="official-frame"><span className="pet-cell" style={{backgroundImage:`url(${sheets[kind]})`,backgroundSize:`800% ${rows*100}%`,backgroundPosition:`${(sleeping?rest[kind][1]:column)/7*100}% ${row/(rows-1)*100}%`,filter:`${tint==='none'?'':tint+' '}drop-shadow(1px 6px 3px #16212638)`}}/></span>
    {sleeping&&<span className="sleep-marks"><span className="sleep-z z-one">Z</span><span className="sleep-z z-two">Z</span><span className="sleep-z z-three">Z</span></span>}</span>
  </span>
})
