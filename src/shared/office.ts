export const OFFICIAL_AVATARS = ['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal'] as const
export type OfficialAvatar = typeof OFFICIAL_AVATARS[number]
export const isOfficialAvatar=(value?:string):value is OfficialAvatar=>OFFICIAL_AVATARS.some(id=>id===value)
export const COMMUNITY_AVATARS = ['woodi','marmalade','voltcoin','inky','byte','wondercube'] as const
export const SELECTABLE_AVATARS = [...OFFICIAL_AVATARS,...COMMUNITY_AVATARS] as const
export type SpriteAvatar = typeof SELECTABLE_AVATARS[number]
export const isSpriteAvatar=(value?:string):value is SpriteAvatar=>SELECTABLE_AVATARS.some(id=>id===value)
// Legacy character IDs keep existing employees compatible with their new artwork.
export const LEGACY_AVATARS = {cat:'marmalade',fox:'voltcoin',rabbit:'woodi',panda:'inky',penguin:'woodi',robot:'byte',cloud:'wondercube'} as const
export const AVATARS = [...SELECTABLE_AVATARS,'cat','fox','rabbit','panda','penguin','robot','cloud'] as const
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
  woodi:'小水獭',marmalade:'橘猫',voltcoin:'金币兔',inky:'小章鱼',byte:'搭建机器人',wondercube:'魔方',
  cat: '小猫', fox: '狐狸', rabbit: '兔子', panda: '熊猫', penguin: '企鹅', robot: '机器人', cloud: '云朵终端', codex:'Codey',dewey:'Dewey',fireball:'Fireball',rocky:'Rocky',seedy:'Seedy',stacky:'Stacky',bsod:'BSOD','null-signal':'Null Signal'
}
export function employeeDirectoryName(title: string): string {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'employee'
}

export const OFFICIAL_COLORS:Record<OfficialAvatar,string>={codex:'#638df1',dewey:'#29b6ea',fireball:'#f8a52b',rocky:'#b4a075',seedy:'#9ea652',stacky:'#796887',bsod:'#188ada','null-signal':'#bf382f'}
export const SPRITE_COLORS:Record<SpriteAvatar,string>={...OFFICIAL_COLORS,woodi:'#b4753d',marmalade:'#ef9b24',voltcoin:'#f2c63c',inky:'#9274bb',byte:'#c29b6b',wondercube:'#92a3bb'}
/** Rotate the original palette while retaining its shading and transparent edges. */
export function avatarTint(kind:SpriteAvatar,color?:string):string {
  if(!color||color.toLowerCase()===SPRITE_COLORS[kind])return 'none'
  const hsv=(hex:string)=>{const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;return {h:d===0?0:((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60),s:max===0?0:d/max,v:max}}
  const from=hsv(SPRITE_COLORS[kind]),to=hsv(color)
  return `hue-rotate(${Math.round(to.h-from.h)}deg) saturate(${(to.s/from.s).toFixed(3)}) brightness(${Math.max(.2,to.v/from.v).toFixed(3)})`
}
