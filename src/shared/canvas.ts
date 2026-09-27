import type { RoomLayout, StoredSession, Store } from './types'

export type Point = { x: number; y: number }
export type Viewport = Point & { zoom: number }
export const ROOM_SHAPES = ['rounded', 'ellipse', 'hexagon', 'custom'] as const
export const ARRANGEMENTS = ['grid', 'circle', 'free'] as const
export type RoomBounds = Point & {
  width: number; height: number; shape: typeof ROOM_SHAPES[number]
  arrangement: typeof ARRANGEMENTS[number]; points?: Point[]
  pinned?: boolean
}
export const ROOM_HEADER_HEIGHT = 170
export const EMPLOYEE_TOP = ROOM_HEADER_HEIGHT + 12
export const MIN_ROOM_HEIGHT = 520
/** Complete rectangular actor footprint, including avatar, badge and native cloud. */
export const EMPLOYEE_SIZE = { width: 190, height: 250 }
export const DEFAULT_VIEW: Viewport = { x: 70, y: 125, zoom: 0.8 }
export const DEFAULT_POLYGON: Point[] = [{x:0.08,y:0},{x:0.92,y:0},{x:1,y:0.25},{x:0.93,y:1},{x:0.08,y:0.96},{x:0,y:0.28}]
export type PlannedRoom = { name: string; bounds: RoomBounds; employees: { card: StoredSession; position: Point }[] }
export type ResizeEdge = 'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw'
export function resizeEdge(x:number,y:number):ResizeEdge {
  const horizontal=x<.25?'w':x>.75?'e':'',vertical=y<.25?'n':y>.75?'s':''
  return (vertical+horizontal || (Math.abs(x-.5)>Math.abs(y-.5)?(x<.5?'w':'e'):(y<.5?'n':'s'))) as ResizeEdge
}
/** Keep the opposite edge anchored, including when a drag reaches the minimum size. */
export function resizeRoom(bounds:RoomBounds,edge:ResizeEdge,delta:Point):RoomBounds {
  const next={...bounds}
  if(edge.includes('e'))next.width=Math.max(360,bounds.width+delta.x)
  if(edge.includes('s'))next.height=Math.max(MIN_ROOM_HEIGHT,bounds.height+delta.y)
  if(edge.includes('w')){next.width=Math.max(360,bounds.width-delta.x);next.x=bounds.x+bounds.width-next.width}
  if(edge.includes('n')){next.height=Math.max(MIN_ROOM_HEIGHT,bounds.height-delta.y);next.y=bounds.y+bounds.height-next.height}
  return next
}
export function roomExtent(room:PlannedRoom) {
  return {...room.bounds,width:Math.max(room.bounds.width,...room.employees.map(p=>p.position.x+EMPLOYEE_SIZE.width)),height:Math.max(room.bounds.height,...room.employees.map(p=>p.position.y+EMPLOYEE_SIZE.height))}
}

export function initialBounds(index: number, room?: RoomLayout): RoomBounds {
  return { x: (room?.col ?? index % 3) * 860, y: (room?.row ?? Math.floor(index / 3)) * 670,
    width: (room?.w ?? 1) * 760, height: (room?.h ?? 1) * MIN_ROOM_HEIGHT,
    shape: 'rounded', arrangement: 'grid', ...room?.bounds }
}
export function pointInPolygon(p: Point, points: Point[]): boolean {
  let inside = false
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i], b=points[j]
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside
  }
  return inside
}
export function shapeContains(bounds: RoomBounds, p: Point): boolean {
  const x=p.x/bounds.width, y=p.y/bounds.height
  if (bounds.shape==='ellipse') return ((x-.5)/.5)**2 + ((y-.5)/.5)**2 <= .94
  if (bounds.shape==='hexagon') return pointInPolygon({x,y},[{x:.14,y:.01},{x:.86,y:.01},{x:.99,y:.5},{x:.86,y:.99},{x:.14,y:.99},{x:.01,y:.5}])
  if (bounds.shape==='custom') return pointInPolygon({x,y},bounds.points ?? DEFAULT_POLYGON)
  // Fixed clearance: enlarging a rectangular room must not push stationary employees inward.
  return p.x>=18 && p.x<=bounds.width-18 && p.y>=18 && p.y<=bounds.height-18
}
const overlaps = (a:Point,b:Point) => Math.abs(a.x-b.x)<EMPLOYEE_SIZE.width+18 && Math.abs(a.y-b.y)<EMPLOYEE_SIZE.height+16
const cornersFit = (b:RoomBounds,p:Point) => [p,{x:p.x+EMPLOYEE_SIZE.width,y:p.y},{x:p.x,y:p.y+EMPLOYEE_SIZE.height},{x:p.x+EMPLOYEE_SIZE.width,y:p.y+EMPLOYEE_SIZE.height}].every(c=>shapeContains(b,c))

/** Full employee footprint must fit, including concave custom-outline notches. */
export function employeeFits(b:RoomBounds,p:Point):boolean {
  if(p.x<18||p.y<EMPLOYEE_TOP||p.x+EMPLOYEE_SIZE.width>b.width-18||p.y+EMPLOYEE_SIZE.height>b.height-18||!cornersFit(b,p))return false
  if(b.shape!=='custom')return true
  const polygon=(b.points??DEFAULT_POLYGON).map(v=>({x:v.x*b.width,y:v.y*b.height}))
  // A polygon boundary entering the rectangle means part of the footprint is outside.
  const left=p.x+.01,right=p.x+EMPLOYEE_SIZE.width-.01,top=p.y+.01,bottom=p.y+EMPLOYEE_SIZE.height-.01
  return !polygon.some((a,i)=>{
    const z=polygon[(i+1)%polygon.length],dx=z.x-a.x,dy=z.y-a.y
    let lo=0,hi=1
    for(const [origin,delta,min,max] of [[a.x,dx,left,right],[a.y,dy,top,bottom]]){
      if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return false}
      else{lo=Math.max(lo,Math.min((min-origin)/delta,(max-origin)/delta));hi=Math.min(hi,Math.max((min-origin)/delta,(max-origin)/delta))}
    }
    return lo<=hi
  })
}
const fits=employeeFits

/** Resize the outline around fixed world-space employee footprints, without rearranging them. */
export function resizeOccupiedRoom(room:PlannedRoom,requested:RoomBounds):PlannedRoom {
  const near=(a:number,b:number)=>Math.abs(a-b)<1e-6
  const anchored=(near(requested.x,room.bounds.x)||near(requested.x+requested.width,room.bounds.x+room.bounds.width))&&(near(requested.y,room.bounds.y)||near(requested.y+requested.height,room.bounds.y+room.bounds.height))
  // A combined CLI placement/size update can move the Team; edge dragging keeps an opposite edge fixed.
  const origin=anchored?room.bounds:requested
  const basis={...room.bounds,x:origin.x,y:origin.y}
  const world=room.employees.map(({position})=>({x:origin.x+position.x,y:origin.y+position.y}))
  if(!world.length)return {...room,bounds:requested}
  const left=Math.min(requested.x,...world.map(p=>p.x-18)),top=Math.min(requested.y,...world.map(p=>p.y-EMPLOYEE_TOP))
  const right=Math.max(requested.x+requested.width,...world.map(p=>p.x+EMPLOYEE_SIZE.width+18))
  const bottom=Math.max(requested.y+requested.height,...world.map(p=>p.y+EMPLOYEE_SIZE.height+18))
  const target={...requested,x:left,y:top,width:right-left,height:bottom-top}
  const contains=(bounds:RoomBounds)=>world.every(p=>employeeFits(bounds,{x:p.x-bounds.x,y:p.y-bounds.y}))
  let bounds=target
  if(!contains(target)){
    const at=(t:number)=>({...target,x:basis.x+(target.x-basis.x)*t,y:basis.y+(target.y-basis.y)*t,width:basis.width+(target.width-basis.width)*t,height:basis.height+(target.height-basis.height)*t})
    let low=0,high=1
    for(let i=0;i<24;i++){const t=(low+high)/2;if(contains(at(t)))low=t;else high=t}
    bounds=at(low)
  }
  return {...room,bounds,employees:room.employees.map((employee,i)=>({...employee,position:{x:world[i].x-bounds.x,y:world[i].y-bounds.y}}))}
}
/** Project a drag onto the legal footprint area; used identically by Core and preview. */
export function constrainEmployee(b:RoomBounds,point:Point,previous?:Point):Point {
  const p={x:Math.max(18,Math.min(b.width-EMPLOYEE_SIZE.width-18,point.x)),y:Math.max(EMPLOYEE_TOP,Math.min(b.height-EMPLOYEE_SIZE.height-18,point.y))}
  if(fits(b,p))return p
  let anchor=previous&&fits(b,previous)?previous:undefined
  if(!anchor){
    let distance=Infinity
    for(let y=0;y<=20;y++)for(let x=0;x<=20;x++){
      const candidate={x:18+(b.width-EMPLOYEE_SIZE.width-36)*x/20,y:EMPLOYEE_TOP+(b.height-EMPLOYEE_SIZE.height-EMPLOYEE_TOP-18)*y/20}
      const d=(candidate.x-p.x)**2+(candidate.y-p.y)**2
      if(d<distance&&fits(b,candidate)){anchor=candidate;distance=d}
    }
  }
  if(!anchor)throw new Error('团队外框无法容纳完整工位，请扩大团队或调整形状')
  let low=0,high=1
  for(let i=0;i<18;i++){const t=(low+high)/2,candidate={x:anchor.x+(p.x-anchor.x)*t,y:anchor.y+(p.y-anchor.y)*t};if(fits(b,candidate))low=t;else high=t}
  return {x:anchor.x+(p.x-anchor.x)*low,y:anchor.y+(p.y-anchor.y)*low}
}

export type SnapGuide = {x?:number;y?:number}
/** Soft attraction to normal seats and existing rows. Distances are screen pixels. */
export function snapEmployee(room:PlannedRoom,id:string,point:Point,zoom=1,previous:SnapGuide={}):{position:Point;guide:SnapGuide} {
  const others=room.employees.filter(item=>item.card.id!==id)
  const choose=(axis:'x'|'y',origin:number,step:number)=>{
    const grid=origin+Math.max(0,Math.round((point[axis]-origin)/step))*step
    const center=axis==='x'?(room.bounds.width-EMPLOYEE_SIZE.width)/2:(room.bounds.height-EMPLOYEE_SIZE.height)/2
    const anchors=[grid,...others.map(item=>item.position[axis]),...(room.employees.length===1?[center]:[])]
    const held=previous[axis]
    if(held!==undefined&&Math.abs(point[axis]-held)*zoom<=22)return held
    const closest=anchors.reduce((a,b)=>Math.abs(b-point[axis])<Math.abs(a-point[axis])?b:a)
    return Math.abs(closest-point[axis])*zoom<=13?closest:undefined
  }
  const x=choose('x',48,225),y=choose('y',EMPLOYEE_TOP,285)
  const bounds=room.bounds
  const options:SnapGuide[]=[{x,y},{x},{y}]
  for(const guide of options){
    if(guide.x===undefined&&guide.y===undefined)continue
    const position={x:guide.x??point.x,y:guide.y??point.y}
    if(fits(bounds,position)&&!others.some(item=>overlaps(position,item.position)))return {position,guide}
  }
  return {position:point,guide:{}}
}

/** New automatic seats may expand a room; manual positions never resize its frame. */
export function planRoom(name: string, cards: StoredSession[], requested: RoomBounds): PlannedRoom {
  const manual=cards.filter(c=>c.position)
  let bounds={...requested, width:Math.max(360,requested.width),height:Math.max(MIN_ROOM_HEIGHT,requested.height)}
  if(manual.length===cards.length)return {name,bounds,employees:cards.map(card=>({card,position:constrainEmployee(bounds,card.position!)}))}
  const count=cards.length
  const columns=Math.max(2,Math.ceil(Math.sqrt(count)))
  if (!manual.length && count>4) bounds.width=Math.max(bounds.width,columns*225+100)
  bounds.height=Math.max(bounds.height,Math.ceil(count/Math.max(1,Math.floor((bounds.width-263)/225)+1))*285+EMPLOYEE_TOP+48)
  if(count===1&&!manual.length) {
    const position={x:(bounds.width-EMPLOYEE_SIZE.width)/2,y:ROOM_HEADER_HEIGHT+(bounds.height-ROOM_HEADER_HEIGHT-EMPLOYEE_SIZE.height)/2}
    if(fits(bounds,position))return {name,bounds,employees:[{card:cards[0],position}]}
  }
  for (let attempt=0; attempt<80; attempt++) {
    const positions=new Map<string,Point>(manual.map(c=>[c.id,constrainEmployee(bounds,c.position!)]))
    const free=cards.filter(c=>!c.position)
    if (bounds.arrangement==='circle' && free.length) {
      const radius=Math.max(220,free.length*(Math.hypot(EMPLOYEE_SIZE.width,EMPLOYEE_SIZE.height)+30)/(2*Math.PI))
      bounds.width=Math.max(bounds.width,radius*2+EMPLOYEE_SIZE.width+220)
      bounds.height=Math.max(bounds.height,radius*2+EMPLOYEE_SIZE.height+220)
      free.forEach((c,i)=>{ const angle=(i/free.length)*Math.PI*2-Math.PI/2; positions.set(c.id,{x:bounds.width/2+Math.cos(angle)*radius-EMPLOYEE_SIZE.width/2,y:bounds.height/2+Math.sin(angle)*radius-EMPLOYEE_SIZE.height/2}) })
      if ([...positions.values()].every(p=>fits(bounds,p))) return {name,bounds,employees:cards.map(card=>({card,position:positions.get(card.id)!}))}
    } else {
      let at=0
      for (let y=EMPLOYEE_TOP; y+EMPLOYEE_SIZE.height<bounds.height-30 && at<free.length; y+=285) {
        for (let x=48; x+EMPLOYEE_SIZE.width<bounds.width-25 && at<free.length; x+=225) {
          const p={x,y}
          if (!fits(bounds,p) || [...positions.values()].some(other=>overlaps(p,other))) continue
          positions.set(free[at++].id,p)
        }
      }
      if (at===free.length) return {name,bounds,employees:cards.map(card=>({card,position:positions.get(card.id)!}))}
    }
    bounds={...bounds,width:bounds.width+120,height:bounds.height+150}
  }
  throw new Error('房间外框太窄，无法容纳员工；请展开外框控制点')
}
export function planOffice(store: Store): PlannedRoom[] {
  const names=[...store.groups]
  if (store.sessions.some(c=>!names.includes(c.group))) names.push('')
  const rooms=names.map((name,index)=>planRoom(name,store.sessions.filter(c=>c.group===name || (!name&&!store.groups.includes(c.group))),initialBounds(index,store.rooms?.[name])))
  const placed=rooms.filter(r=>r.bounds.pinned)
  let x=0,y=0,rowBottom=0,column=0
  for(const room of rooms.filter(r=>!r.bounds.pinned)) {
    const b={...room.bounds,x,y}
    for(;;) {
      const hit=placed.find(r=>b.x<r.bounds.x+r.bounds.width+100 && b.x+b.width+100>r.bounds.x && b.y<r.bounds.y+r.bounds.height+130 && b.y+b.height+130>r.bounds.y)
      if(!hit)break
      b.x=hit.bounds.x+hit.bounds.width+120
    }
    room.bounds=b;placed.push(room);x=b.x+b.width+120;rowBottom=Math.max(rowBottom,b.y+b.height)
    if(++column===3){column=0;x=0;y=rowBottom+170}
  }
  return rooms
}
export function fitViewport(rooms: PlannedRoom[], width: number, height: number): Viewport {
  if (!rooms.length) return DEFAULT_VIEW
  const minX=Math.min(...rooms.map(r=>r.bounds.x)), minY=Math.min(...rooms.map(r=>r.bounds.y))-60
  const maxX=Math.max(...rooms.map(r=>r.bounds.x+roomExtent(r).width)), maxY=Math.max(...rooms.map(r=>r.bounds.y+roomExtent(r).height))
  const zoom=Math.min(1.1,Math.max(.08,Math.min((width-100)/(maxX-minX),(height-130)/(maxY-minY))))
  return {x:(width-(maxX-minX)*zoom)/2-minX*zoom,y:(height-(maxY-minY)*zoom)/2-minY*zoom,zoom}
}
