import {useId} from 'react'

// Original contour-loom engraving for Agents Company: nested cells, woven lines and stippled paper.
// Geometry is calculated once, then repeated by native SVG patterns; no assets or animation.
function cell(cx:number,cy:number,rx:number,ry:number,rotation:number,rings:number){
 const cos=Math.cos(rotation),sin=Math.sin(rotation)
 return Array.from({length:rings},(_,ring)=>{
  const scale=.26+ring*.145
  return Array.from({length:65},(_,step)=>{const angle=step*Math.PI/32,wave=1+.13*Math.sin(angle*3+.4)+.055*Math.cos(angle*5),x=Math.cos(angle)*rx*wave*scale,y=Math.sin(angle)*ry*wave*scale;return (step?'L':'M')+(cx+x*cos-y*sin).toFixed(1)+','+(cy+x*sin+y*cos).toFixed(1)}).join('')+'Z'
 }).join(' ')
}
const contours=[cell(94,86,69,48,-.35,6),cell(284,65,35,43,.52,5),cell(94,268,39,25,.3,5)].join(' ')
const weave=Array.from({length:7},(_,i)=>{const y=i*5.5;return `M18 ${200+y}C60 ${151+y} 98 ${149+y} 139 ${184+y}S213 ${231+y} 252 ${188+y}S316 ${149+y} 346 ${177+y}`}).join(' ')
const stitches='M182 35l6 3m-6 6 6 3m-6 6 6 3m-6 6 6 3M207 285l6-3m-6-6 6-3m-6-6 6-3M25 98l-4 4m4 5-4 4m4 5-4 4M303 273l4 5m6-7 4 5m6-7 4 5'
export function MessageWallpaper(){
 const id='contour-loom-'+useId().replaceAll(':',''),grain=id+'-grain'
 return <div className="message-wallpaper" aria-hidden="true"><div className="message-wallpaper-mesh"/><svg className="message-wallpaper-pattern" width="100%" height="100%" focusable="false"><defs>
  <pattern id={grain} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M4 6h.1M18 21h.1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".34"/><path d="m23 4 1.2 1.2" stroke="currentColor" strokeWidth=".5" opacity=".2"/></pattern>
  <pattern id={id} width="360" height="320" patternUnits="userSpaceOnUse" patternTransform="scale(.86) rotate(-7)"><g fill="none" stroke="currentColor" strokeWidth=".85" strokeLinecap="round" strokeLinejoin="round">
   <path d={contours} opacity=".94"/><path d={weave} opacity=".78"/><path d={stitches} strokeWidth="1.1" opacity=".64"/>
   <path d="M172 92c13-16 36-13 39 2s-13 28-28 23-13-13-6-21 21-5 23 4-9 17-15 10M263 283c10-11 26-7 25 5s-16 18-22 8 5-17 12-11" opacity=".68"/>
   <path d="M177 144h12m-6-6v12M25 266h8m-4-4v8M335 47h8m-4-4v8M151 296h7m-3.5-3.5v7" opacity=".46"/>
   <path d="M49 34h.1M215 30h.1M334 113h.1M28 157h.1M157 77h.1M222 133h.1M175 258h.1M322 237h.1M229 307h.1" strokeWidth="2.1" opacity=".66"/>
  </g><path d={weave} fill="none" stroke="var(--bg-elev)" strokeWidth=".65" opacity=".2" transform="translate(0 1.65)"/></pattern>
 </defs><rect width="100%" height="100%" fill={`url(#${grain})`}/><rect width="100%" height="100%" fill={`url(#${id})`}/></svg></div>
}
