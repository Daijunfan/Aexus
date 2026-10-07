import {memo,useContext,useEffect,useState} from 'react'
import {CanvasMotion} from './motion'
import {avatarTint,SPRITE_REST_FRAMES,type AtlasAvatar} from '../../../shared/office'
import type {PetPose} from './usePetBehavior'

import woodi from '../assets/pets/woodi.webp'
import marmalade from '../assets/pets/marmalade.webp'
import voltcoin from '../assets/pets/voltcoin.webp'
import inky from '../assets/pets/inky.webp'
import byte from '../assets/pets/byte.webp'
import wondercube from '../assets/pets/wondercube.webp'
import hoots from '../assets/pets/hoots.webp'
import bsod from '../assets/pets/bsod.webp'
import codex from '../assets/pets/codex.webp'
import dewey from '../assets/pets/dewey.webp'
import fireball from '../assets/pets/fireball.webp'
import null_signal from '../assets/pets/null-signal.webp'
import rocky from '../assets/pets/rocky.webp'
import seedy from '../assets/pets/seedy.webp'
import stacky from '../assets/pets/stacky.webp'

import codexPreview from '../assets/pets/previews/codex.webp'
import deweyPreview from '../assets/pets/previews/dewey.webp'
import fireballPreview from '../assets/pets/previews/fireball.webp'
import rockyPreview from '../assets/pets/previews/rocky.webp'
import seedyPreview from '../assets/pets/previews/seedy.webp'
import stackyPreview from '../assets/pets/previews/stacky.webp'
import bsodPreview from '../assets/pets/previews/bsod.webp'
import null_signalPreview from '../assets/pets/previews/null-signal.webp'
import hootsPreview from '../assets/pets/previews/hoots.webp'
import woodiPreview from '../assets/pets/previews/woodi.webp'
import marmaladePreview from '../assets/pets/previews/marmalade.webp'
import voltcoinPreview from '../assets/pets/previews/voltcoin.webp'
import inkyPreview from '../assets/pets/previews/inky.webp'
import bytePreview from '../assets/pets/previews/byte.webp'
import wondercubePreview from '../assets/pets/previews/wondercube.webp'

const sheets:Record<AtlasAvatar,string>={codex,dewey,fireball,rocky,seedy,stacky,bsod,'null-signal':null_signal,hoots,woodi,marmalade,voltcoin,inky,byte,wondercube}
const previews:Record<AtlasAvatar,string>={'codex':codexPreview,'dewey':deweyPreview,'fireball':fireballPreview,'rocky':rockyPreview,'seedy':seedyPreview,'stacky':stackyPreview,'bsod':bsodPreview,'null-signal':null_signalPreview,'hoots':hootsPreview,'woodi':woodiPreview,'marmalade':marmaladePreview,'voltcoin':voltcoinPreview,'inky':inkyPreview,'byte':bytePreview,'wondercube':wondercubePreview}
/** Classic and community skins share 192x208 cells in v1/v2 atlases; host status controls its pose. */
export const SpritePet=memo(function SpritePet({kind,pose,working,color,subtle=false,compact=false}:{kind:AtlasAvatar;pose:PetPose;working:boolean;color?:string;subtle?:boolean;compact?:boolean}) {
  const animated=useContext(CanvasMotion)
  const [column,setColumn]=useState(0),[hovered,setHovered]=useState(false)
  if(hovered)pose='pickup'
  const sleeping=!working&&pose!=='pickup'&&pose!=='land'
  const rest=SPRITE_REST_FRAMES
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
  const rows=['hoots','woodi','marmalade','voltcoin','inky','byte','wondercube'].includes(kind)?11:9
  const preview=compact&&(sleeping||pose==='pickup'||pose==='land')
  const tint=avatarTint(kind,color)
  // Crop the atlas into one small HTML paint box; move its composited wrapper.
  return <span onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} className={`mascot official-pet pose-${pose} ${sleeping?'official-napping':''}`} data-avatar={kind} data-pose={pose} data-frame={`${row}:${sleeping?rest[kind][1]:column}`} aria-hidden="true">
    <span className="pet-viewport"><span className="official-frame"><span className="pet-cell" style={{backgroundImage:`url(${preview?previews[kind]:sheets[kind]})`,backgroundSize:preview?'600% 100%':`800% ${rows*100}%`,backgroundPosition:preview?`${(sleeping?0:column+1)/5*100}% 0%`:`${(sleeping?rest[kind][1]:column)/7*100}% ${row/(rows-1)*100}%`,filter:`${tint==='none'?'':tint+' '}drop-shadow(1px 6px 3px #16212638)`}}/></span>
    {sleeping&&<span className="sleep-marks"><span className="sleep-z z-one">Z</span><span className="sleep-z z-two">Z</span><span className="sleep-z z-three">Z</span></span>}</span>
  </span>
})
