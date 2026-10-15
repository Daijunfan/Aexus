import {ClaudePet} from './ClaudePet'
import {FatePet} from './FatePet'
import {SpritePet} from './SpritePet'
import {currentAvatar,isAtlasAvatar,isFateAvatar,type AvatarKind,type Accessory} from '../../../shared/office'
import type {PetPose} from './usePetBehavior'
type Props={compact?:boolean;kind?:AvatarKind;accessory?:Accessory;color?:string;working?:boolean;pose?:PetPose;gaze?:{x:number;y:number};subtle?:boolean}
/** All characters use replaceable, attributed artwork and the same animation player. */
export function Mascot({kind='fireball',color,working=false,pose=working?'type':'sleep',subtle=false,compact=false}:Props){
 const avatar=currentAvatar(kind)
 if(isFateAvatar(avatar))return <FatePet compact={compact} kind={avatar} pose={pose} working={working} color={color} subtle={subtle}/>
 return isAtlasAvatar(avatar)?<SpritePet compact={compact} kind={avatar} pose={pose} working={working} color={color} subtle={subtle}/>:<ClaudePet kind={avatar} pose={pose} working={working} color={color} subtle={subtle}/>
}
