import {directoryName} from './directory-names.ts'
/** Stable skin IDs; anime and chibi variants stay adjacent in the flat picker. */
export const FATE_CHARACTERS = [
  {id:'saber',name:'Saber',identity:'Saber · 阿尔托莉雅',color:'#315a9c'},
  {id:'archer',name:'Archer',identity:'Archer · 卫宫',color:'#a5323c'},
  {id:'cu-chulainn',name:'库丘林',identity:'Lancer · 库丘林',color:'#2957a7'},
  {id:'medusa',name:'美杜莎',identity:'Rider · 美杜莎',color:'#aa78be'},
  {id:'medea',name:'美狄亚',identity:'Caster · 美狄亚',color:'#665080'},
  {id:'sasaki',name:'佐佐木小次郎',identity:'Assassin · 佐佐木小次郎',color:'#7762a1'},
  {id:'cursed-arm',name:'咒腕哈桑',identity:'真 Assassin · 咒腕哈桑',color:'#a6414b'},
  {id:'heracles',name:'赫拉克勒斯',identity:'Berserker · 赫拉克勒斯',color:'#8a5944'},
  {id:'gilgamesh',name:'吉尔伽美什',identity:'Archer · 吉尔伽美什',color:'#d5a447'},
  {id:'diarmuid',name:'迪卢木多',identity:'Lancer · 迪卢木多',color:'#466648'},
  {id:'iskandar',name:'伊斯坎达尔',identity:'Rider · 伊斯坎达尔',color:'#a13a31'},
  {id:'gilles',name:'吉尔·德·雷',identity:'Caster · 吉尔·德·雷',color:'#3c7376'},
  {id:'hundred-faces',name:'百貌哈桑',identity:'Assassin · 百貌哈桑',color:'#555075'},
  {id:'lancelot',name:'兰斯洛特',identity:'Berserker · 兰斯洛特',color:'#643c61'},
  {id:'shirou',name:'卫宫士郎',identity:'Master · 卫宫士郎',color:'#557db0'},
  {id:'rin',name:'远坂凛',identity:'Master · 远坂凛',color:'#b73c45'},
  {id:'sakura',name:'间桐樱',identity:'Master · 间桐樱',color:'#9575b9'},
  {id:'illya',name:'伊莉雅',identity:'Master · 伊莉雅丝菲尔',color:'#9265af'},
  {id:'kiritsugu',name:'卫宫切嗣',identity:'Master · 卫宫切嗣',color:'#4e5263'},
  {id:'kirei',name:'言峰绮礼',identity:'Master · 言峰绮礼',color:'#594542'},
  {id:'waver',name:'韦伯',identity:'Master · 韦伯·维尔维特',color:'#517052'}
] as const
export type FateAvatar = `fate-${typeof FATE_CHARACTERS[number]['id']}-${'anime'|'chibi'}`
export const FATE_AVATARS:FateAvatar[]=FATE_CHARACTERS.flatMap(c=>[`fate-${c.id}-anime`,`fate-${c.id}-chibi`] as const)
export const isFateAvatar=(id?:string):id is FateAvatar=>FATE_AVATARS.some(value=>value===id)
export const FATE_LABELS=Object.fromEntries(FATE_CHARACTERS.flatMap(c=>[[`fate-${c.id}-anime`,`${c.name} · 原作风格`],[`fate-${c.id}-chibi`,`${c.name} · 可爱版`]])) as Record<FateAvatar,string>
export const FATE_COLORS=Object.fromEntries(FATE_CHARACTERS.flatMap(c=>[[`fate-${c.id}-anime`,c.color],[`fate-${c.id}-chibi`,c.color]])) as Record<FateAvatar,string>
export const OFFICIAL_AVATARS = ['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal','hoots'] as const
export type OfficialAvatar = typeof OFFICIAL_AVATARS[number]
export const isOfficialAvatar=(value?:string):value is OfficialAvatar=>OFFICIAL_AVATARS.some(id=>id===value)
export const COMMUNITY_AVATARS = ['woodi','marmalade','voltcoin','inky','byte','wondercube'] as const
export const CLAUDE_BUDDY_AVATARS = ['claude-axolotl', 'claude-blob', 'claude-cactus', 'claude-capybara', 'claude-cat', 'claude-chonk', 'claude-dragon', 'claude-duck', 'claude-ghost', 'claude-goose', 'claude-mushroom', 'claude-octopus', 'claude-owl', 'claude-penguin', 'claude-rabbit', 'claude-robot', 'claude-snail', 'claude-turtle'] as const
export type ClaudeBuddyAvatar = typeof CLAUDE_BUDDY_AVATARS[number]
export const CLAUDE_AVATARS = ['clawd',...CLAUDE_BUDDY_AVATARS] as const
export type ClaudeAvatar = typeof CLAUDE_AVATARS[number]
export type CommunityAvatar = typeof COMMUNITY_AVATARS[number]
export type AtlasAvatar = OfficialAvatar|CommunityAvatar
export const isAtlasAvatar=(value?:string):value is AtlasAvatar=>[...OFFICIAL_AVATARS,...COMMUNITY_AVATARS].some(id=>id===value)
export const SELECTABLE_AVATARS = [...OFFICIAL_AVATARS,...COMMUNITY_AVATARS,...FATE_AVATARS] as const
// Retired Claude avatar IDs remain valid for saved employees; omit them only from the picker.
export type SpriteAvatar = AtlasAvatar|ClaudeAvatar|FateAvatar
export const isSpriteAvatar=(value?:string):value is SpriteAvatar=>isAtlasAvatar(value)||CLAUDE_AVATARS.some(id=>id===value)||isFateAvatar(value)
// Historical generic IDs resolve to their existing companion; named sprite IDs stay unchanged.
export const LEGACY_AVATARS = {cat:'marmalade',fox:'voltcoin',rabbit:'woodi',panda:'inky',penguin:'woodi',robot:'byte',cloud:'wondercube'} as const
export const AVATARS = [...OFFICIAL_AVATARS,...CLAUDE_AVATARS,...COMMUNITY_AVATARS,...FATE_AVATARS,'cat','fox','rabbit','panda','penguin','robot','cloud'] as const
export type AvatarKind = typeof AVATARS[number]
export const currentAvatar=(kind:AvatarKind):SpriteAvatar=>LEGACY_AVATARS[kind as keyof typeof LEGACY_AVATARS]??kind as SpriteAvatar
export const ACCESSORIES = ['headphones', 'glasses', 'none'] as const
export type Accessory = typeof ACCESSORIES[number]
export const ROOM_THEMES = ['sage', 'ocean', 'rose', 'amber', 'lavender', 'slate'] as const
export const ROOM_PATTERNS = ['boards','grid','dots','plain'] as const
export const WALLS = ['windows', 'panels', 'brick'] as const
export const DESKS = ['walnut', 'oak', 'cloud'] as const
export type RoomDesign = {
  background: string
  pattern: typeof ROOM_PATTERNS[number]
  scenery: boolean
  theme: typeof ROOM_THEMES[number]
  wall: typeof WALLS[number]
  desk: typeof DESKS[number]
  subtitle: string
  plants: boolean
  shelf: boolean
  lamp: boolean
  art: boolean
}
export const DEFAULT_DESIGN: RoomDesign = {
  background:'',pattern:'boards',scenery:true,
  theme: 'sage', wall: 'windows', desk: 'walnut', subtitle: 'Good things are made together.',
  plants: true, shelf: true, lamp: true, art: true
}
export function roomDesign(index: number, saved?: Partial<RoomDesign>): RoomDesign {
  return { ...DEFAULT_DESIGN, theme: ROOM_THEMES[index % ROOM_THEMES.length], ...saved }
}
export const AVATAR_LABELS: Record<AvatarKind, string> = {
  ...FATE_LABELS,
  hoots:'Hoots',clawd:'Clawd','claude-axolotl':'Axolotl','claude-blob':'Blob','claude-cactus':'Cactus','claude-capybara':'Capybara','claude-cat':'Cat','claude-chonk':'Chonk','claude-dragon':'Dragon','claude-duck':'Duck','claude-ghost':'Ghost','claude-goose':'Goose','claude-mushroom':'Mushroom','claude-octopus':'Octopus','claude-owl':'Owl','claude-penguin':'Penguin','claude-rabbit':'Rabbit','claude-robot':'Robot','claude-snail':'Snail','claude-turtle':'Turtle',
  woodi:'小水獭',marmalade:'橘猫',voltcoin:'金币兔',inky:'小章鱼',byte:'搭建机器人',wondercube:'魔方',
  cat: '小猫', fox: '狐狸', rabbit: '兔子', panda: '熊猫', penguin: '企鹅', robot: '机器人', cloud: '云朵终端', codex:'Codey',dewey:'Dewey',fireball:'Fireball',rocky:'Rocky',seedy:'Seedy',stacky:'Stacky',bsod:'BSOD','null-signal':'Null Signal'
}
export function employeeDirectoryName(title: string): string {
  return directoryName(title,'employee')
}

export const OFFICIAL_COLORS:Record<OfficialAvatar,string>={codex:'#638df1',dewey:'#29b6ea',fireball:'#f8a52b',rocky:'#b4a075',seedy:'#9ea652',stacky:'#796887',bsod:'#188ada','null-signal':'#bf382f',hoots:'#a27648'}
export const SPRITE_COLORS:Record<SpriteAvatar,string>={...OFFICIAL_COLORS,...FATE_COLORS,woodi:'#b4753d',marmalade:'#ef9b24',voltcoin:'#f2c63c',inky:'#9274bb',byte:'#c29b6b',wondercube:'#92a3bb',clawd:'#d97757','claude-axolotl':'#d97757','claude-blob':'#d97757','claude-cactus':'#d97757','claude-capybara':'#d97757','claude-cat':'#d97757','claude-chonk':'#d97757','claude-dragon':'#d97757','claude-duck':'#d97757','claude-ghost':'#d97757','claude-goose':'#d97757','claude-mushroom':'#d97757','claude-octopus':'#d97757','claude-owl':'#d97757','claude-penguin':'#d97757','claude-rabbit':'#d97757','claude-robot':'#d97757','claude-snail':'#d97757','claude-turtle':'#d97757'}
/** Rotate the original palette while retaining its shading and transparent edges. */
export function avatarTint(kind:SpriteAvatar,color?:string):string {
  if(!color||color.toLowerCase()===SPRITE_COLORS[kind])return 'none'
  const hsv=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;return {h:d===0?0:((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60),s:max===0?0:d/max,v:max}}
  const from=hsv(SPRITE_COLORS[kind]),to=hsv(color)
  return `hue-rotate(${Math.round(to.h-from.h)}deg) saturate(${(to.s/from.s).toFixed(3)}) brightness(${Math.max(.2,to.v/from.v).toFixed(3)})`
}

/** Atlas sleep frames shared by the player and lossless picker-strip builder. */
export const SPRITE_REST_FRAMES:Record<AtlasAvatar,[number,number]>={codex:[0,5],dewey:[0,4],fireball:[0,1],rocky:[0,1],seedy:[0,1],stacky:[8,1],bsod:[0,2],'null-signal':[0,1],hoots:[0,0],woodi:[5,6],marmalade:[0,3],voltcoin:[5,3],inky:[8,2],byte:[0,1],wondercube:[5,3]}
