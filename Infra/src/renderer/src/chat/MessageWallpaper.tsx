import {memo,useId} from 'react'
import {DEFAULT_MESSAGE_WALLPAPER,type MessageWallpaperSettings} from '../../../shared/message-wallpaper'
import {WALLPAPER_MOTIFS,WALLPAPER_FILLERS,WALLPAPER_TILE_SIZE,wallpaperMarks,wallpaperSpeckles} from './wallpaper-patterns'

const wrappedOffsets=(value:number,margin:number)=>[0,...(value<margin?[WALLPAPER_TILE_SIZE]:[]),...(value+margin>WALLPAPER_TILE_SIZE?[-WALLPAPER_TILE_SIZE]:[])]

/** One small vector tile is repeated by the browser, independent of conversation length. */
export const MessageWallpaper=memo(function MessageWallpaper({settings}:{settings?:Partial<MessageWallpaperSettings>}){
 const {pattern,layout,density,opacity}={...DEFAULT_MESSAGE_WALLPAPER,...settings},id='wallpaper-'+useId().replace(/[^\w-]/g,'')
 const motifs=pattern==='none'?null:WALLPAPER_MOTIFS[pattern],marks=pattern==='none'?[]:wallpaperMarks(pattern,layout),scale=100/density
 return <div className="message-wallpaper" aria-hidden="true" data-wallpaper-pattern={pattern} data-wallpaper-layout={layout} data-wallpaper-density={density} data-wallpaper-opacity={opacity}>
  <div className="message-wallpaper-mesh"/>
  {motifs&&opacity>0&&<svg className="message-wallpaper-pattern" width="100%" height="100%" focusable="false" style={{opacity:opacity/100}}><defs>
   {motifs.map(([name,d],index)=><path key={name} id={id+'-motif-'+index} d={d}/>)}
   <pattern id={id} width={WALLPAPER_TILE_SIZE} height={WALLPAPER_TILE_SIZE} patternUnits="userSpaceOnUse" patternTransform={'scale('+scale+')'}>
    <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
     {marks.flatMap((mark,index)=>{
      const copies=(value:number)=>wrappedOffsets(value,mark.size*.72)
      return copies(mark.x).flatMap(dx=>copies(mark.y).map(dy=><use key={index+':'+dx+':'+dy} href={'#'+id+'-motif-'+mark.motif} transform={`translate(${mark.x+dx} ${mark.y+dy}) rotate(${mark.angle}) scale(${mark.size/24}) translate(-12 -12)`}/>))
     })}
     {pattern!=='none'&&wallpaperSpeckles(pattern,layout).flatMap((point,index)=>wrappedOffsets(point.x,3).flatMap(dx=>wrappedOffsets(point.y,3).map(dy=><path key={`f${index}:${dx}:${dy}`} d={WALLPAPER_FILLERS[layout==='ordered'?2:index%4]} opacity={layout==='ordered'?.52:.72} strokeWidth={index%4===2?1.8:1} transform={`translate(${point.x+dx} ${point.y+dy})`}/>)))}
    </g>
   </pattern>
  </defs><rect width="100%" height="100%" fill={'url(#'+id+')'}/></svg>}
 </div>
})
