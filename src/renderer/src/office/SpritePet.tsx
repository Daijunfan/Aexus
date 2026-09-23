import {useEffect,useState} from 'react'
import {avatarTint,type SpriteAvatar} from '../../../shared/office'
import type {PetPose} from './usePetBehavior'
import codex from '../assets/pets/codex.webp'
import dewey from '../assets/pets/dewey.webp'
import fireball from '../assets/pets/fireball.webp'
import rocky from '../assets/pets/rocky.webp'
import seedy from '../assets/pets/seedy.webp'
import stacky from '../assets/pets/stacky.webp'
import bsod from '../assets/pets/bsod.webp'
import nullSignal from '../assets/pets/null-signal.webp'

import woodi from '../assets/pets/woodi.webp'
import marmalade from '../assets/pets/marmalade.webp'
import voltcoin from '../assets/pets/voltcoin.webp'
import inky from '../assets/pets/inky.webp'
import byte from '../assets/pets/byte.webp'
import wondercube from '../assets/pets/wondercube.webp'

const sheets:Record<SpriteAvatar,string>={woodi,marmalade,voltcoin,inky,byte,wondercube,codex,dewey,fireball,rocky,seedy,stacky,bsod,'null-signal':nullSignal}
/** Classic and community skins share 192x208 cells in v1/v2 atlases; host status controls its pose. */
export function SpritePet({kind,pose,working,color,subtle=false}:{kind:SpriteAvatar;pose:PetPose;working:boolean;color?:string;subtle?:boolean}) {
  const [column,setColumn]=useState(0),[hovered,setHovered]=useState(false)
  if(hovered)pose='pickup'
  const sleeping=!working&&pose!=='pickup'&&pose!=='land'
  const rest:Record<SpriteAvatar,[number,number]>={codex:[0,5],dewey:[0,4],fireball:[0,1],rocky:[0,1],seedy:[0,1],stacky:[8,1],bsod:[0,2],'null-signal':[0,1],woodi:[5,6],marmalade:[0,3],voltcoin:[5,3],inky:[8,2],byte:[0,1],wondercube:[5,3]}
  const row=sleeping?rest[kind][0]:pose==='think'?6:pose==='wave'?3:pose==='pickup'||pose==='land'?4:7
  const frames=row===3?4:row===4?5:6
  useEffect(()=>{
    setColumn(0)
    if((subtle&&!hovered)||sleeping||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    let index=0,timer:ReturnType<typeof setTimeout>
    const next=()=>{index=(index+1)%frames;setColumn(index);timer=setTimeout(next,index===frames-1?220:row===6?150:120)}
    timer=setTimeout(next,120)
    return()=>clearTimeout(timer)
  },[sleeping,row,frames,subtle,hovered])
  return <svg onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} className={`mascot official-pet pose-${pose} ${sleeping?'official-napping':''}`} viewBox="0 0 192 208" data-avatar={kind} data-pose={pose} data-frame={`${row}:${sleeping?rest[kind][1]:column}`} aria-hidden="true">
    <svg className="official-frame" style={{filter:avatarTint(kind,color)}} width="192" height="208" viewBox={`${(sleeping?rest[kind][1]:column)*192} ${row*208} 192 208`} overflow="hidden"><image href={sheets[kind]} width="1536" height={[woodi,marmalade,voltcoin,inky,byte,wondercube].includes(sheets[kind])?2288:1872}/></svg>
    {sleeping&&<g className="sleep-marks" fill="#aac3e6" fontFamily="monospace" fontWeight="bold"><text className="sleep-z z-one" x="145" y="69" fontSize="13">Z</text><text className="sleep-z z-two" x="161" y="47" fontSize="18">Z</text><text className="sleep-z z-three" x="177" y="23" fontSize="22">Z</text></g>}
  </svg>
}
