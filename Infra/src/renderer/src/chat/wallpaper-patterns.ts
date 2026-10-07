import type {MessageWallpaperSettings} from '../../../shared/message-wallpaper'

/** Original 24-unit line drawings; no vendor artwork, fonts, external images or runtime randomness. */
export const WALLPAPER_MOTIFS={
 daydream:[
  ['mug','M5 9h12v7a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5ZM17 10h2a3 3 0 0 1 0 6h-2M8 6c-2-2 2-2 0-4m5 4c-2-2 2-2 0-4'],
  ['cat','M4 10 3 3l6 4a9 9 0 0 1 6 0l6-4-1 7c5 10-21 16-16 0ZM8 12h.1m7.9 0h.1M10 15l2 2 2-2m-2 2v2M3 15l-2-1m2 4-2 1m20-4 2-1m-2 4 2 1'],
  ['plane','M2 10 22 2l-8 20-4-8ZM10 14 22 2M10 14l-1 5 4-2'],
  ['umbrella','M2 12a10 10 0 0 1 20 0c-2-2-3-2-5 0-2-2-3-2-5 0-2-2-3-2-5 0-2-2-3-2-5 0ZM12 2c-4 3-5 6-5 10m5-10c4 3 5 6 5 10m-5 0v7a3 3 0 0 0 6 0M12 2V1'],
  ['camera','M3 7h4l2-3h6l2 3h4v13H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM18 9h1'],
  ['headphones','M4 14v-3a8 8 0 0 1 16 0v3M3 13h4v8H3Zm14 0h4v8h-4M20 21c0 2-4 2-6 2'],
  ['heart','M12 21C-5 11 3-2 12 6c9-8 17 5 0 15ZM6 7c-2 0-2 3-1 4'],
  ['cloud','M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12ZM9 12h.1m5.9 0h.1M10 15q2 2 4 0'],
  ['music','M9 17V5l11-3v13M9 8l11-3M9 18c0 4-7 5-7 1s7-5 7-1Zm11-2c0 4-7 5-7 1s7-5 7-1Z'],
  ['kite','M12 2 21 10 12 16 3 10ZM12 2v14M3 10h18M12 16c-6 5 6 2 2 7M14 19l-2-1 1 3 3-2Z']
 ],
 botanical:[
  ['sprig','M7 22C12 16 9 6 18 2M11 14C1 15 1 5 3 4c6 0 9 4 8 10ZM13 9c-1-7 3-8 6-8 3 5 0 9-6 8Zm-3 9c3-7 9-7 12-6 0 6-6 10-12 6Z'],
  ['flower','M12 14v8m0-3c-6 1-8-2-7-5 4 0 7 2 7 5m0-2c5 1 8-1 7-4-4-1-7 1-7 4M10 6C5-2 0 5 6 9c-7 5 0 10 5 4 6 7 11 0 5-5 7-5 0-10-4-4ZM14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  ['leaf','M3 21C-2 4 7 2 22 2c0 15-4 21-19 19ZM3 21 18 6M9 15l-1-6m5 2 6 1'],
  ['mushroom','M2 13C3-2 21-2 22 13ZM9 13l-1 8q4 2 8 0l-1-8M8 7h.1m7-1h.1m3 4h.1m-13 0h.1'],
  ['butterfly','M12 10C-4-8-2 19 9 14c-11 15 4 7 3-1 0 8 14 16 3 1 11 5 13-22-3-4ZM12 8v9m0-9L9 5m3 3 3-3'],
  ['tulip','M12 14v9M5 3l4 3 3-4 3 4 4-3v6a7 7 0 0 1-14 0ZM12 20c-5 1-9-3-9-6 6-1 8 3 9 6m0 0c5 1 9-3 9-6-6-1-8 3-9 6'],
  ['fern','M12 22V2m0 4L8 2m4 4 4-4m-4 8L5 5m7 5 7-5m-7 9L3 8m9 6 9-6m-9 10-8-5m8 5 8-5'],
  ['pear','M12 5c-5 0-3 5-7 9-9 12 24 12 15 0-4-4-2-9-8-9ZM12 5c-1-2 1-4 3-4m-2 4c6 2 8-1 8-3-4-2-6-1-8 3M7 16q-2 3 1 4'],
  ['mountain','M1 20 9 4l7 16ZM7 8l2 3 2-3M13 13l4-7 6 14h-7M19 2h.1M3 3h.1'],
  ['acorn','M5 11c0 13 14 13 14 0M3 11a9 9 0 0 1 18 0ZM12 2V1M7 7l2 3m1-5 2 4m1-4 2 4m1-3 2 4']
 ],
 cosmos:[
  ['saturn','M18 9a7 7 0 1 0-4 10M7 9c-10 5-7 12 4 8S27 6 17 6M17 6a7 7 0 0 1 1 3M4 14q9 0 16-7'],
  ['rocket','M9 17C6 9 13 3 21 2c0 8-6 16-13 13ZM10 8 4 9l-2 6 6-1m8 0-1 6-6 2 1-6M7 18l-3 3m1-5-3 2m6 2-2 3M16 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  ['moon','M19 17A10 10 0 0 1 8 2a10 10 0 1 0 11 15ZM18 2v6m-3-3h6m-1 6v3m-1.5-1.5h3'],
  ['comet','M13 11 20 2m-4 11 7-7m-9 10 8-3M13 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM5 13c-2 1-2 4 0 5'],
  ['ufo','M6 12c-1-12 13-12 12 0M2 12c3-3 17-3 20 0-3 7-17 7-20 0ZM8 20l-1 3m9-3 1 3m-5-5v3M9 5c-2 0-2 3-2 4'],
  ['constellation','M4 3 17 5 10 12l10 8M10 12 3 18M5 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm13 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-7 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm10 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM3 16v4m-2-2h4'],
  ['telescope','M4 9 18 2l3 6-14 7ZM7 15l-2 1-2-4 2-1m11 0-4 4m0 0L6 23m6-8 6 8m-6-8v8M16 3l3 6'],
  ['satellite','M10 8l6 6-6 6-6-6ZM6 10 1 5l4-4 5 5m4 12 5 5 4-4-5-5M14 10l3-3m-1-5c6-1 7 0 6 6ZM18 6l4-4'],
  ['orbit','M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM4 6c-7-1 1 14 10 16 13 2 6-11-1-16S-1-2 4 6ZM10 9h.1m5 6h.1'],
  ['star','M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1ZM19 2l2-1M3 18l-2 1']
 ],
 studio:[
  ['book','M12 6C9 3 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-7-1-10 2ZM12 6v15M5 8l4 1m-4 3 4 1m7-5 3-1m-3 5 3-1'],
  ['pencil','M4 16 17 3q3-3 5 1l-2 2L7 19l-5 3ZM4 16l3 3m8-14 4 4M2 22l1-4'],
  ['bulb','M8 17C-4 5 8-2 16 3c8 4 4 10 0 14ZM8 20h8m-6 3h4M10 17v-6l2 2 2-2v6'],
  ['laptop','M4 3h16v13H4ZM2 17h20l1 4H1ZM9 9l-2 2 2 2m6-4 2 2-2 2M10 18h4'],
  ['palette','M21 11c0-11-18-12-19 0-2 11 9 13 12 9 2-3-4-5 0-7 2-1 7 3 7-2ZM8 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7-1a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6 13h.1m3 5h.1'],
  ['nib','M12 2 3 13l4 9h10l4-9ZM12 2v11m2 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 22l3-5m7 5-3-5'],
  ['flask','M8 2h8m-6 0v8L3 21q9 3 18 0l-7-11V2M6 17h12m-7-4h.1m3 6h.1'],
  ['ruler','M2 7l5-5 15 15-5 5ZM5 5l3 3m0-6 3 3m0 0 3 3m0 0 3 3m0 0 3 3M8 14l2-2m1 5 2-2m1 5 2-2'],
  ['hourglass','M5 2h14M5 22h14M7 2c0 10 10 10 10 20M17 2C17 12 7 12 7 22M8 7h8m-8 12 4-3 4 3'],
  ['paperclip','M9 10v7a3 3 0 0 0 6 0V6a5 5 0 0 0-10 0v11a7 7 0 0 0 14 0V8']
 ],
 geometric:[
  ['rosette','M12 3c8-7 11 4 3 7 11-1 8 11-1 5 4 10-9 10-5 0-9 6-12-6-1-5-8-3-5-14 4-7ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  ['arches','M3 21V11a9 9 0 0 1 18 0v10M7 21V11a5 5 0 0 1 10 0v10M11 21V11a1 1 0 0 1 2 0v10'],
  ['cube','M12 2 22 7v10l-10 5-10-5V7ZM2 7l10 5 10-5M12 12v10M7 4.5l10 5v5'],
  ['rings','M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm6 6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z'],
  ['wave','M2 6c4-7 8 7 12 0s8 7 8 0M2 12c4-7 8 7 12 0s8 7 8 0M2 18c4-7 8 7 12 0s8 7 8 0'],
  ['diamond','M12 2 22 12 12 22 2 12ZM12 6l6 6-6 6-6-6ZM12 10l2 2-2 2-2-2Z'],
  ['spiral','M12 12c-4-6 7-6 6 0-2 11-16 8-15-1C4-2 24-2 22 14M19 19l-2 2'],
  ['sun','M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2'],
  ['tiles','M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7ZM6.5 6.5h.1m11 0h.1m-11 11h.1m11 0h.1'],
  ['ribbon','M2 8c7-12 13 19 20 7M2 12c7-12 13 19 20 7M2 4c7-12 13 19 20 7']
 ]
} as const
export type WallpaperPattern=Exclude<MessageWallpaperSettings['pattern'],'none'>
export const WALLPAPER_TILE_SIZE=384
export type WallpaperMark={x:number;y:number;size:number;angle:number;motif:number}
const arrangements=new Map<string,WallpaperMark[]>()
function seeded(key:string){let seed=[...key].reduce((hash,char)=>(hash*31+char.charCodeAt(0))>>>0,19);return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>{const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);return Math.hypot(Math.min(dx,384-dx),Math.min(dy,384-dy))}
/** Periodic blue-noise placement removes visible rows; neighbouring tiles use the same clearance. */
export function wallpaperMarks(pattern:WallpaperPattern,layout:MessageWallpaperSettings['layout']):WallpaperMark[]{
 const key=pattern+layout,cached=arrangements.get(key);if(cached)return cached
 const random=seeded(key),marks:WallpaperMark[]=[],scattered=layout==='scattered',count=WALLPAPER_MOTIFS[pattern].length
 for(let index=0;index<36;index++){
  const row=Math.floor(index/6),col=index%6,size=scattered?29+random()*8:30,angle=scattered?Math.round((random()-.5)*76):0
  let point={x:32+col*64,y:32+row*64}
  if(scattered)for(let attempt=0;attempt<5000;attempt++){
   point={x:random()*384,y:random()*384}
   if(marks.every(mark=>distance(mark,point)>=Math.max(46,(mark.size+size)*.63+2)))break
   if(attempt===4999)throw Error('Wallpaper packing failed')
  }
  marks.push({...point,size,angle,motif:(index*7+(scattered?0:row*3))%count})
 }
 arrangements.set(key,marks);return marks
}
const speckles=new Map<string,{x:number;y:number}[]>()
export function wallpaperSpeckles(pattern:WallpaperPattern,layout:MessageWallpaperSettings['layout']){
 const key=pattern+layout,cached=speckles.get(key);if(cached)return cached
 const marks=wallpaperMarks(pattern,layout),random=seeded(key+'speckles'),points:{x:number;y:number}[]=[]
 if(layout==='ordered')points.push(...marks.map(mark=>({x:(mark.x+32)%384,y:(mark.y+32)%384})))
 else for(let attempt=0;points.length<36&&attempt<3000;attempt++){const point={x:4+random()*376,y:4+random()*376};if(marks.every(mark=>distance(mark,point)>mark.size*.63+6)&&points.every(other=>distance(other,point)>16))points.push(point)}
 speckles.set(key,points);return points
}
export const WALLPAPER_FILLERS=['M-2 0h4M0-2v4','M0-2 2 0 0 2-2 0Z','M0 0h.1','M-2 1Q0-2 2 1']
