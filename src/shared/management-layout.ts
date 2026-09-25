import type {ManagementRelation} from './management'
import type {Store,StoredSession} from './types'
import {EMPLOYEE_SIZE,EMPLOYEE_TOP,MIN_ROOM_HEIGHT,DEFAULT_POLYGON,planOffice,shapeContains,type Point,type RoomBounds,type PlannedRoom} from './canvas'

type Box=Point&{width:number;height:number}
type Block={width:number;height:number;members:{card:StoredSession;position:Point}[]}
const W=EMPLOYEE_SIZE.width,H=EMPLOYEE_SIZE.height,GAP=44,PADDING=48
const ordered=(cards:StoredSession[])=>[...cards].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))
const intersect=(a:Box,b:Box,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y

/** Connected components preserve shared subordinates without duplicating employees. */
function components(cards:StoredSession[],relations:ManagementRelation[]){
  const byId=new Map(cards.map(card=>[card.id,card])),adjacent=new Map<string,Set<string>>()
  for(const edge of relations)if(edge.state==='active'&&byId.has(edge.managerId)&&byId.has(edge.employeeId)){
    for(const [a,b] of [[edge.managerId,edge.employeeId],[edge.employeeId,edge.managerId]]){if(!adjacent.has(a))adjacent.set(a,new Set());adjacent.get(a)!.add(b)}
  }
  const seen=new Set<string>(),groups:StoredSession[][]=[]
  for(const card of ordered(cards))if(adjacent.has(card.id)&&!seen.has(card.id)){
    const ids=[card.id],group:StoredSession[]=[];seen.add(card.id)
    for(let i=0;i<ids.length;i++){const id=ids[i];group.push(byId.get(id)!);for(const next of adjacent.get(id)??[])if(!seen.has(next)){seen.add(next);ids.push(next)}}
    groups.push(ordered(group))
  }
  return {groups,isolated:ordered(cards.filter(card=>!seen.has(card.id)))}
}

/** A component reserves its routing corridors as well as its full-size employee footprints. */
function componentBlock(cards:StoredSession[]):Block{
  const managers=cards.filter(card=>card.managementRole==='manager'),employees=cards.filter(card=>card.managementRole!=='manager')
  const columns=Math.min(3,Math.max(1,Math.ceil(Math.sqrt(employees.length))))
  const band=44+managers.length*10,rows=Math.max(managers.length,Math.ceil(employees.length/columns)),height=band+rows*(H+band)-band
  const employeeX=W+64+managers.length*12,width=employeeX+columns*W+(columns-1)*GAP
  const members=managers.map((card,index)=>({card,position:{x:0,y:band+index*(H+band)+(rows-managers.length)*(H+band)/2}}))
  employees.forEach((card,index)=>members.push({card,position:{x:employeeX+(index%columns)*(W+GAP),y:band+Math.floor(index/columns)*(H+band)}}))
  return {width,height,members}
}

/** Whole routing block stays inside the actual outline, including concave custom shapes. */
function boxFits(bounds:RoomBounds,box:Box){
  if(box.y<EMPLOYEE_TOP||box.x<18||box.x+box.width>bounds.width-18||box.y+box.height>bounds.height-18)return false
  if(![box,{x:box.x+box.width,y:box.y},{x:box.x,y:box.y+box.height},{x:box.x+box.width,y:box.y+box.height}].every(point=>shapeContains(bounds,point)))return false
  if(bounds.shape!=='custom')return true
  const points=(bounds.points??DEFAULT_POLYGON).map(point=>({x:point.x*bounds.width,y:point.y*bounds.height}))
  return !points.some((a,index)=>{
    const b=points[(index+1)%points.length];let lo=0,hi=1
    for(const [origin,delta,min,max] of [[a.x,b.x-a.x,box.x+.01,box.x+box.width-.01],[a.y,b.y-a.y,box.y+.01,box.y+box.height-.01]]){
      if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return false}
      else{lo=Math.max(lo,Math.min((min-origin)/delta,(max-origin)/delta));hi=Math.min(hi,Math.max((min-origin)/delta,(max-origin)/delta))}
    }
    return lo<=hi
  })
}

/** Bounded deterministic packing, invoked on topology changes, never on streamed tokens. */
export function planManagement(cards:StoredSession[],requested:RoomBounds,relations:ManagementRelation[]){
  const {groups,isolated}=components(cards.filter(card=>!card.deleting),relations)
  const blocks:Block[]=[...groups.map(componentBlock),...isolated.map(card=>({width:W,height:H,members:[{card,position:{x:0,y:0}}]}))]
  let width=Math.max(760,...blocks.map(block=>block.width+PADDING*2)),height=Math.max(MIN_ROOM_HEIGHT,EMPLOYEE_TOP+Math.max(0,...blocks.map(block=>block.height))+PADDING*2)
  for(let attempt=0;attempt<60;attempt++){
    const bounds={...requested,width,height,arrangement:'free' as const,pinned:true},placed:Box[]=[],employees:{card:StoredSession;position:Point}[]=[]
    for(const block of blocks){
      let location:Point|undefined
      for(let y=EMPLOYEE_TOP+PADDING/2;y+block.height<=height-PADDING/2&&!location;y+=24){
        for(let x=PADDING;x+block.width<=width-PADDING;x+=24){
          const box={x,y,width:block.width,height:block.height}
          if(boxFits(bounds,box)&&!placed.some(other=>intersect(box,other,24))){location={x,y};break}
        }
      }
      if(!location)break
      placed.push({...location,width:block.width,height:block.height})
      employees.push(...block.members.map(member=>({card:member.card,position:{x:location!.x+member.position.x,y:location!.y+member.position.y}})))
    }
    if(employees.length===cards.filter(card=>!card.deleting).length){
      const trimmed={...bounds,width:Math.max(760,...placed.map(box=>box.x+box.width+PADDING)),height:Math.max(MIN_ROOM_HEIGHT,...placed.map(box=>box.y+box.height+PADDING))}
      return {bounds:placed.every(box=>boxFits(trimmed,box))?trimmed:bounds,employees}
    }
    // Grow only this Team. Never shrink pets; the office pass separates enlarged rooms.
    if(attempt%3===2)width+=120
    else height+=120
  }
  throw new Error('团队形状无法容纳管理组，请扩大或调整团队外框')
}

export function applyManagementLayout(store:Store,name:string){
  if(!store.groups.includes(name))throw new Error('Unknown Team')
  const planned=planOffice(store),current=planned.find(room=>room.name===name)!
  store.rooms??={}
  for(const item of planned)store.rooms[item.name]={...(store.rooms[item.name]??{col:0,row:0,w:1,h:1}),bounds:{...item.bounds,pinned:true}}
  const room=store.rooms[name],cards=store.sessions.filter(card=>card.group===name&&!card.deleting)
  const result=planManagement(cards,current.bounds,store.access?.relations??[]),positions=new Map(result.employees.map(item=>[item.card.id,item.position]))
  store.sessions=store.sessions.map(card=>positions.has(card.id)?{...card,position:positions.get(card.id)}:card)
  store.rooms={...store.rooms,[name]:{...room,bounds:result.bounds}}
  return result
}

/** Relations and positions are committed together; renames, views and activity do not reflow. */
export function reflowChangedManagement(store:Store,previous?:Store){
  const changed=new Set<string>()
  if(!previous)return changed
  const oldCards=new Map(previous.sessions.map(card=>[card.id,card]))
  const signature=(source:Store,name:string)=>{
    const members=source.sessions.filter(card=>card.group===name&&!card.deleting),ids=new Set(members.map(card=>card.id))
    const edges=(source.access?.relations??[]).filter(edge=>edge.state==='active'&&ids.has(edge.managerId)&&ids.has(edge.employeeId))
    return {hasEdges:edges.length>0,value:JSON.stringify([members.map(card=>card.id).sort(),edges.map(edge=>[edge.id,edge.managerId,edge.employeeId]).sort()])}
  }
  for(const name of store.groups){
    const members=store.sessions.filter(card=>card.group===name),oldName=previous.groups.includes(name)?name:oldCards.get(members[0]?.id)?.group??name
    const before=signature(previous,oldName),after=signature(store,name)
    if(before.value!==after.value){applyManagementLayout(store,name);changed.add(name)}
  }
  return changed
}

/** Axis-aligned polylines with small tangent quarter-corners. The last segment remains straight. */
export function roundedOrthogonalPath(input:Point[],radius=6){
  const points:Point[]=[]
  for(const p of input){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('Invalid connector point')
    const previous=points.at(-1)
    if(previous&&previous.x!==p.x&&previous.y!==p.y)throw new Error('Diagonal management connectors are forbidden')
    if(previous&&previous.x===p.x&&previous.y===p.y)continue
    points.push(p)
    while(points.length>=3){const [a,b,c]=points.slice(-3);if((a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y))points.splice(points.length-2,1);else break}
  }
  if(points.length<2)return ''
  const n=(v:number)=>String(Math.round(v*1000)/1000),line=(a:Point,b:Point)=>a.x===b.x?`V${n(b.y)}`:`H${n(b.x)}`
  let d=`M${n(points[0].x)} ${n(points[0].y)}`,cursor=points[0]
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],distance=(p:Point,q:Point)=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y),r=Math.max(0,Math.min(radius,distance(a,b)/2,distance(b,c)/2))
    const enter={x:b.x-Math.sign(b.x-a.x)*r,y:b.y-Math.sign(b.y-a.y)*r},exit={x:b.x+Math.sign(c.x-b.x)*r,y:b.y+Math.sign(c.y-b.y)*r}
    d+=` ${line(cursor,enter)} Q${n(b.x)} ${n(b.y)} ${n(exit.x)} ${n(exit.y)}`;cursor=exit
  }
  return d+' '+line(cursor,points.at(-1)!)
}

export function managementRoutes(room:PlannedRoom,relations:ManagementRelation[]){
  const positions=new Map(room.employees.map(item=>[item.card.id,item.position])),cards=room.employees.map(item=>item.card),groups=components(cards,relations).groups
  const groupFor=new Map<string,StoredSession[]>();for(const group of groups)for(const card of group)groupFor.set(card.id,group)
  return relations.filter(edge=>edge.state==='active'&&positions.has(edge.managerId)&&positions.has(edge.employeeId)).map(edge=>{
    const a=positions.get(edge.managerId)!,b=positions.get(edge.employeeId)!,group=groupFor.get(edge.managerId)!,managers=group.filter(card=>card.managementRole==='manager'),index=managers.findIndex(card=>card.id===edge.managerId)
    const right=Math.max(...managers.map(card=>positions.get(card.id)!.x+W)),left=Math.min(...group.filter(card=>card.managementRole!=='manager').map(card=>positions.get(card.id)!.x))
    let points:Point[]
    if(right+32<left){
      // The reserved left-side spine and row-top band cannot intersect an auto-placed employee.
      const spine=right+18+index*10,band=b.y-18-index*8
      points=[{x:a.x+W+3,y:a.y+H/2},{x:spine,y:a.y+H/2},{x:spine,y:band},{x:b.x+W/2,y:band},{x:b.x+W/2,y:b.y-8}]
    }else{
      // User-drag preview remains orthogonal too; rebinding/re-layout restores grouped corridors.
      const horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)
      if(horizontal){const direction=b.x>=a.x?1:-1,x1=a.x+(direction>0?W+3:-3),x2=b.x+(direction>0?-8:W+8),mid=(x1+x2)/2;points=[{x:x1,y:a.y+H/2},{x:mid,y:a.y+H/2},{x:mid,y:b.y+H/2},{x:x2,y:b.y+H/2}]}
      else{const direction=b.y>=a.y?1:-1,y1=a.y+(direction>0?H+3:-3),y2=b.y+(direction>0?-8:H+8),mid=(y1+y2)/2;points=[{x:a.x+W/2,y:y1},{x:a.x+W/2,y:mid},{x:b.x+W/2,y:mid},{x:b.x+W/2,y:y2}]}
    }
    return {id:edge.id,points,path:roundedOrthogonalPath(points)}
  })
}
