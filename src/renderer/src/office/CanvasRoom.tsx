import { useId, type CSSProperties } from 'react'
import { roomDesign, type RoomDesign } from '../../../shared/office'
import { DEFAULT_POLYGON, EMPLOYEE_SIZE, shapeContains, resizeEdge, type ResizeEdge, type PlannedRoom, type RoomBounds } from '../../../shared/canvas'
import type { ActivityPreview,StoredSession } from '../../../shared/types'
import {ActivityBubble} from './ActivityBubble'
import { Employee } from './Employee'
import { Bookshelf, Pendant, Plant, Poster, WindowWall } from './Furniture'
function outline(b:RoomBounds) {
  const w=b.width,h=b.height
  if(b.shape==='ellipse')return `M ${w/2},4 A ${w/2-4},${h/2-4} 0 1 1 ${w/2-.01},4 Z`
  const points=b.shape==='custom'?(b.points??DEFAULT_POLYGON):b.shape==='hexagon'?[{x:.14,y:.01},{x:.86,y:.01},{x:.99,y:.5},{x:.86,y:.99},{x:.14,y:.99},{x:.01,y:.5}]:null
  if(points)return points.map((p,i)=>`${i?'L':'M'} ${p.x*w},${p.y*h}`).join(' ')+' Z'
  return `M 44,4 H ${w-44} Q ${w-4},4 ${w-4},44 V ${h-44} Q ${w-4},${h-4} ${w-44},${h-4} H 44 Q 4,${h-4} 4,${h-44} V 44 Q 4,4 44,4 Z`
}
export function CanvasRoom({room,index,design:custom,root,mode,busyIds,activities,draggingId,visible,onOpen,onEdit,onStart}:{room:PlannedRoom;index:number;design?:Partial<RoomDesign>;root?:string;mode?:'work'|'build'|'cloud';activities:Record<string,ActivityPreview>;busyIds:Set<string>;draggingId?:string;visible:{x:number;y:number;width:number;height:number};onOpen:(card:StoredSession)=>void;onEdit:()=>void;onStart:(kind:'team'|'employee'|'resize',e:React.PointerEvent,id?:string,edge?:ResizeEdge)=>void}) {
  const id=useId().replace(/:/g,''),design=roomDesign(index,custom),b=room.bounds,path=outline(b)
  const edgeAt=(e:React.PointerEvent<SVGPathElement>)=>{const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();return resizeEdge((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height)}
  const color=design.background,light=color?[1,3,5].reduce((sum,i,j)=>sum+parseInt(color.slice(i,i+2),16)*[.2126,.7152,.0722][j],0)>150:undefined
  const surface={ ...(color?{'--sleep-ink':light?'#526bad':'#c5d7ff'}:{}), '--room-floor-top':color||'color-mix(in srgb,var(--room-accent) 16%,var(--floor-top))','--room-floor-bottom':color?`color-mix(in srgb,${color} 88%,var(--bg))`:'color-mix(in srgb,var(--room-accent) 9%,var(--floor-bottom))','--room-ink':color?(light?'#263541':'#f0f4fa'):'var(--fg-dim)'}
  return <section onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();if(shapeContains(b,{x:(e.clientX-r.left)*b.width/r.width,y:(e.clientY-r.top)*b.height/r.height}))onStart('team',e)}} className={`world-room theme-${design.theme}`} data-department={room.name} data-shape={b.shape} data-arrangement={b.arrangement} style={{...surface,left:b.x,top:b.y,width:b.width,height:b.height} as CSSProperties}>
    <svg className="room-outline" width={b.width} height={b.height} aria-hidden="true"><defs>
      <linearGradient id={`${id}-floor`} x2="0" y2="1"><stop stopColor="var(--room-floor-top)"/><stop offset="1" stopColor="var(--room-floor-bottom)"/></linearGradient>
      <pattern id={`${id}-texture`} width={design.pattern==='dots'?24:72} height={design.pattern==='boards'?44:design.pattern==='dots'?24:72} patternUnits="userSpaceOnUse">
        {design.pattern==='dots'?<circle cx="12" cy="12" r="1.5" fill="var(--room-ink)" opacity=".17"/>:design.pattern!=='plain'&&<path d={design.pattern==='boards'?'M0 0V44 M36 0V44 M0 43H72':'M0 0H72V72'} fill="none" stroke="var(--room-ink)" strokeOpacity=".1"/>}
      </pattern>
    </defs><path d={path} fill={`url(#${id}-floor)`} stroke="var(--room-accent)" strokeWidth="3" strokeOpacity=".8"/><path d={path} fill={`url(#${id}-texture)`}/></svg>
    {design.scenery&&<div className="room-scenery" style={{clipPath:`path('${path}')`}} aria-hidden="true"><WindowWall wall={design.wall}/><div className="room-ceiling-glow"/>{design.shelf&&<Bookshelf/>}{design.lamp&&<Pendant/>}{design.art&&<Poster theme={design.theme}/>} {design.plants&&<><Plant className="room-plant plant-left"/><Plant className="room-plant plant-right" variant="fern"/></>}</div>}
    <svg className="room-resize-outline" width={b.width} height={b.height}><path className="room-resize-edge" d={path} fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" aria-label={`拖动 ${room.name} 边缘调整大小`} onPointerMove={e=>{e.currentTarget.style.cursor=`${edgeAt(e)}-resize`}} onPointerDown={e=>onStart('resize',e,undefined,edgeAt(e))}/></svg>
    <button className="team-title" data-team={room.name} onPointerDown={e=>onStart('team',e)} onClick={e=>{if(e.detail===0)onEdit()}} aria-label={`打开 ${room.name||'待分配员工'} Team`} title="点击名称打开工作空间 · 拖动团队内部移动"><strong>{room.name||'待分配员工'}</strong></button>
    <span className={`team-root-label ${root?'':'unbound'}`} title={root??'请绑定外部文件夹'}><span className="team-mode-label">{mode==='cloud'?'CLOUD':mode==='work'?'WORK':'BUILD'}</span>{root ? `⌂ ${root}` : '⌂ 先绑定 Team 外部文件夹'}</span>
    <div className="free-employees">{room.employees.map(({card,position})=>{
      const x=b.x+position.x,y=b.y+position.y
      if(x+EMPLOYEE_SIZE.width<visible.x||y+EMPLOYEE_SIZE.height<visible.y||x>visible.x+visible.width||y>visible.y+visible.height)return null
      return <div className="employee-location" key={card.id} style={{left:position.x,top:position.y,width:EMPLOYEE_SIZE.width,height:EMPLOYEE_SIZE.height}}><Employee employee={card} working={busyIds.has(card.id)} dragging={draggingId===card.id} desk={design.desk} onOpen={onOpen} onStart={e=>onStart('employee',e,card.id)} />{activities[card.id]&&<ActivityBubble activity={activities[card.id]}/>}</div>
    })}</div>
    {!room.employees.length&&<div className="empty-room-note"><span>YOUR NEXT GREAT TEAM</span><p>给好想法，留足空间。</p><small>从一位伙伴开始，随时拖动边缘扩展空间。</small></div>}
    <div className="room-dimension" aria-hidden="true">{Math.round(b.width)} × {Math.round(b.height)} <span>·</span> {room.employees.length} 伙伴</div>

  </section>
}
