export const WALLPAPER_PATTERNS=['daydream','botanical','cosmos','studio','geometric','none'] as const
export const WALLPAPER_LAYOUTS=['scattered','ordered'] as const
export type MessageWallpaperSettings={pattern:typeof WALLPAPER_PATTERNS[number];layout:typeof WALLPAPER_LAYOUTS[number];density:number;opacity:number}
export const DEFAULT_MESSAGE_WALLPAPER:MessageWallpaperSettings={pattern:'daydream',layout:'scattered',density:115,opacity:16}
export const MESSAGE_WALLPAPER_SCHEMA={type:'object',additionalProperties:false,properties:{pattern:{enum:WALLPAPER_PATTERNS},layout:{enum:WALLPAPER_LAYOUTS},density:{type:'number',minimum:70,maximum:160},opacity:{type:'number',minimum:0,maximum:45}},description:'Messages-only decoration. Partial fields merge; density 70–160%, ink opacity 0–45%. No files, messages or execution are changed.'}
export function validateMessageWallpaper(patch:unknown):asserts patch is Partial<MessageWallpaperSettings>{
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('messageWallpaper must be an object')
 for(const [key,value] of Object.entries(patch)){
  if(key==='pattern'?(WALLPAPER_PATTERNS as readonly unknown[]).includes(value):key==='layout'?(WALLPAPER_LAYOUTS as readonly unknown[]).includes(value):key==='density'?typeof value==='number'&&Number.isFinite(value)&&value>=70&&value<=160:key==='opacity'?typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=45:false)continue
  throw Error('Invalid messageWallpaper '+key)
 }
}
