import {Mascot} from '../office/Mascot'
import {CanvasMotion} from '../office/motion'
import {memo} from 'react'
import {currentAvatar,avatarTint,type AvatarKind} from '../../../shared/office'
const portraits=import.meta.glob<string>('../assets/pets/portraits/*.webp',{eager:true,query:'?url',import:'default'})
/** Static face/silhouette crops have their own framing, independent of canvas animation boxes. */
export const EmployeePortrait=memo(function EmployeePortrait({avatar,color,large=false}:{avatar?:AvatarKind;color?:string;large?:boolean}){
 const id=currentAvatar(avatar??'fireball'),url=portraits[`../assets/pets/portraits/${id}.webp`]
 return <span className={`message-avatar ${large?'large':''}`} data-portrait={id}>{url?<img src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" style={{filter:avatarTint(id,color)}}/>:<CanvasMotion.Provider value={false}><Mascot compact kind={id} color={color} pose="pickup"/></CanvasMotion.Provider>}</span>
})
