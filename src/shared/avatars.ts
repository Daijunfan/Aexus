import {AVATARS,AVATAR_LABELS,SELECTABLE_AVATARS,LEGACY_AVATARS,FATE_CHARACTERS,SPRITE_COLORS,currentAvatar,type AvatarKind} from './office'

export type AvatarStyle='default'|'anime'|'chibi'
export type AvatarSelection={avatar?:string;character?:string;avatarStyle?:string}
const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[\s·._-]+/g,'')
const styleNames={default:['default','默认'],anime:['anime','original','原版','原作','原作风格'],chibi:['chibi','cute','可爱','可爱版','q版']}
function styleValue(value?:string):AvatarStyle|undefined{
  if(value===undefined)return
  if(typeof value!=='string')throw Error('avatarStyle must be default, anime or chibi')
  const found=(Object.keys(styleNames) as AvatarStyle[]).find(style=>styleNames[style].includes(value.toLowerCase()))
  if(!found)throw Error('avatarStyle must be default, anime or chibi')
  return found
}
export const AVATAR_CATALOG=[...new Set(AVATARS.map(currentAvatar))].map(id=>{
  const character=FATE_CHARACTERS.find(c=>id===`fate-${c.id}-anime`||id===`fate-${c.id}-chibi`)
  const style:AvatarStyle=character?(id.endsWith('-chibi')?'chibi':'anime'):'default'
  const aliases=character?.id==='gilgamesh'?['英雄王','金闪闪','Gilgamesh']:id==='marmalade'?['老虎','tiger']:[]
  return {id,name:AVATAR_LABELS[id],characterId:character?.id??id,character:character?.name??AVATAR_LABELS[id],style,aliases,legacyIds:Object.entries(LEGACY_AVATARS).filter(([,target])=>target===id).map(([key])=>key),color:SPRITE_COLORS[id],selectable:SELECTABLE_AVATARS.some(value=>value===id)}
})
export type AvatarDescription=typeof AVATAR_CATALOG[number]
const searchNames=(item:AvatarDescription)=>[item.id,item.name,item.characterId,item.character,...item.aliases,...item.legacyIds].flatMap(name=>[name,...styleNames[item.style].map(style=>name+style)]).map(normalize)
export function listAvatars(options:{query?:string;style?:string;all?:boolean}={}){
  if(options.query!==undefined&&typeof options.query!=='string')throw Error('query must be text')
  const query=normalize(options.query??''),style=styleValue(options.style)
  return AVATAR_CATALOG.filter(item=>(options.all||item.selectable)&&(!style||item.style===style)&&(!query||searchNames(item).some(name=>name.includes(query))))
}
/** Exact known names/aliases only. Ambiguity and unknown characters never become a cat. */
export function resolveAvatar(input:AvatarSelection):AvatarKind|undefined{
  if(input.avatar===undefined&&input.character===undefined&&input.avatarStyle===undefined)return
  const style=styleValue(input.avatarStyle)
  let selected:AvatarKind|undefined
  if(input.avatar!==undefined){
    if(typeof input.avatar!=='string'||!AVATARS.some(id=>id===input.avatar))throw Error('Unknown avatar ID; use agents avatar list --json to choose an exact id, or pass character and avatarStyle')
    selected=input.avatar as AvatarKind
  }
  if(input.character!==undefined){
    if(typeof input.character!=='string'||!input.character.trim())throw Error('character must be a catalog name or characterId')
    const query=normalize(input.character),matches=AVATAR_CATALOG.filter(item=>(!style||item.style===style)&&searchNames(item).includes(query)&&(!selected||item.id===currentAvatar(selected)))
    if(matches.length!==1)throw Error(matches.length?`角色有多个形象，请指定 avatarStyle 或 avatar：${matches.map(item=>item.id).join(', ')}`:'未找到匹配的角色与画风；请用 agents avatar list --query "角色名" --json 查询，不会替换为默认角色')
    selected=selected??matches[0].id
  }
  if(!selected)throw Error('avatarStyle requires character or an exact avatar ID')
  if(style&&avatarDescription(selected).style!==style)throw Error('avatar 与 avatarStyle 不一致，请重新查询角色目录')
  return selected
}
export function avatarDescription(id:AvatarKind){return AVATAR_CATALOG.find(item=>item.id===currentAvatar(id))!}
export function employeeAppearance(card:{avatar?:AvatarKind;engine:string;role?:string}){
  const appearance=avatarDescription(card.avatar??(card.engine==='codex'?'robot':'cat'))
  return {avatar:appearance.id,avatarName:appearance.name,character:appearance.character,avatarStyle:appearance.style,profession:card.role??''}
}
export function professionValue(input:{profession?:unknown;role?:unknown}):string|undefined{
  if(input.profession===undefined)return input.role as string|undefined
  if(typeof input.profession!=='string')throw Error('profession must be text')
  if(input.role!==undefined&&input.role!==input.profession)throw Error('profession 与兼容字段 role 不一致；人物外形请使用 character / avatar')
  return input.profession
}
