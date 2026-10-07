import {DEFAULT_POLYGON,type Point,type RoomBounds} from './canvas'

export function roomPolygon(b:RoomBounds):Point[]|null {
  const points=b.shape==='custom'?(b.points??DEFAULT_POLYGON):b.shape==='hexagon'?[{x:.14,y:.01},{x:.86,y:.01},{x:.99,y:.5},{x:.86,y:.99},{x:.14,y:.99},{x:.01,y:.5}]:null
  return points?.map(p=>({x:p.x*b.width,y:p.y*b.height}))??null
}
/** The exact same contour drives the SVG, docking ports and line containment. */
export function roomOutline(b:RoomBounds){
  const w=b.width,h=b.height,points=roomPolygon(b)
  if(b.shape==='ellipse')return `M ${w/2},4 A ${w/2-4},${h/2-4} 0 1 1 ${w/2},${h-4} A ${w/2-4},${h/2-4} 0 1 1 ${w/2},4 Z`
  if(points)return points.map((p,i)=>`${i?'L':'M'} ${p.x},${p.y}`).join(' ')+' Z'
  return `M 44,4 H ${w-44} Q ${w-4},4 ${w-4},44 V ${h-44} Q ${w-4},${h-4} ${w-44},${h-4} H 44 Q 4,${h-4} 4,${h-44} V 44 Q 4,4 44,4 Z`
}
/** Intervals inside the drawn contour along a horizontal (x) or vertical (y) scan. */
export function roomSections(b:RoomBounds,axis:'x'|'y',fixed:number):[number,number][]{
  const length=axis==='x'?b.width:b.height,cross=axis==='x'?b.height:b.width
  const polygon=roomPolygon(b)
  if(polygon){
    const cuts:number[]=[]
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],z=polygon[(i+1)%polygon.length],u=axis==='x'?a.y:a.x,v=axis==='x'?z.y:z.x
      if((u>fixed)===(v>fixed))continue
      cuts.push((axis==='x'?a.x:a.y)+(fixed-u)/(v-u)*((axis==='x'?z.x:z.y)-(axis==='x'?a.x:a.y)))
    }
    cuts.sort((a,b)=>a-b);return cuts.flatMap((n,i)=>i%2===0&&cuts[i+1]!==undefined?[[n,cuts[i+1]] as [number,number]]:[])
  }
  if(fixed<4||fixed>cross-4)return []
  if(b.shape==='ellipse'){
    const radius=(length/2-4)*Math.sqrt(Math.max(0,1-((fixed-cross/2)/(cross/2-4))**2))
    return [[length/2-radius,length/2+radius]]
  }
  const edge=Math.min(fixed-4,cross-4-fixed),inset=edge<40?4+40*(1-Math.sqrt(edge/40))**2:4
  return [[inset,length-inset]]
}
export function roomContainsSegment(b:RoomBounds,a:Point,z:Point){
  if(a.x!==z.x&&a.y!==z.y)return false
  const horizontal=a.y===z.y,min=Math.min(horizontal?a.x:a.y,horizontal?z.x:z.y),max=Math.max(horizontal?a.x:a.y,horizontal?z.x:z.y)
  return roomSections(b,horizontal?'x':'y',horizontal?a.y:a.x).some(([lo,hi])=>min>=lo-1e-6&&max<=hi+1e-6)
}
