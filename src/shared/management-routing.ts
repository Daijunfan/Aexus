import {connectorSetting,type ConnectorAnchor,type ConnectorSetting,type ConnectorSettings} from './connector'
import {roomContainsSegment,roomPolygon} from './room-geometry'
import {EMPLOYEE_SIZE,ROOM_HEADER_HEIGHT,type Point,type PlannedRoom} from './canvas'

export type Box=Point&{width:number;height:number}
export type Port={point:Point;exit:Point;direction:number;cost?:number}
const clearance=9
export const ROUTE_TOP=ROOM_HEADER_HEIGHT+2
export const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
export const crosses=(a:Point,b:Point,box:Box)=>Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.width&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.height
export const inside=(p:Point,box:Box)=>p.x>box.x&&p.x<box.x+box.width&&p.y>box.y&&p.y<box.y+box.height
/** Auto targets dock above the head. Fixed anchors are never silently switched to another side. */
export function employeePorts(box:Box,anchor:ConnectorAnchor,target:boolean):Port[]{
  const choices=anchor.side==='auto'?(target?[.5,.4,.6,.3,.7].map(offset=>({side:'top',offset})):['bottom','left','right'].flatMap(side=>[.5,.35,.65,.2,.8].map(offset=>({side,offset:side==='left'||side==='right'?.66+offset*.3:offset})))):[{side:anchor.side,offset:anchor.offset??.5}]
  return choices.flatMap(({side,offset})=>(target?[24,9]:[18,9]).map(reach=>{
    const inset=0
    if(side==='top')return {point:{x:box.x+box.width*offset,y:box.y-inset},exit:{x:box.x+box.width*offset,y:Math.max(ROUTE_TOP,box.y-reach)},direction:2}
    if(side==='bottom')return {point:{x:box.x+box.width*offset,y:box.y+box.height+inset},exit:{x:box.x+box.width*offset,y:box.y+box.height+reach},direction:2}
    return {point:{x:side==='left'?box.x-inset:box.x+box.width+inset,y:box.y+box.height*offset},exit:{x:side==='left'?box.x-reach:box.x+box.width+reach,y:box.y+box.height*offset},direction:1}
  }))
}
/** Keep a free automatic head centre; allocate a neighbouring head port only when it is occupied. */
export function usableEmployeePorts(box:Box,anchor:ConnectorAnchor,target:boolean,open:(port:Port)=>boolean){
  const ports=employeePorts(box,anchor,target).filter(open)
  if(target&&anchor.side==='auto'){const centre=ports.filter(p=>p.point.x===box.x+box.width/2);if(centre.length)return centre}
  return ports
}
/** A small visibility grid routes around full employee footprints, regardless of their ordering. */
export function routeManagementConnection(room:PlannedRoom,managerId:string,employeeId:string,occupied:Point[][]=[],setting:ConnectorSetting=connectorSetting(undefined,managerId,employeeId),shared:Point[][]=[]):Point[]{
  const source=room.employees.find(item=>item.card.id===managerId)!,target=room.employees.find(item=>item.card.id===employeeId)!
  const boxes=room.employees.map(item=>({...item.position,...EMPLOYEE_SIZE})),a={...source.position,...EMPLOYEE_SIZE},b={...target.position,...EMPLOYEE_SIZE}
  const obstacles=boxes.map(box=>({x:box.x-clearance,y:box.y-clearance,width:box.width+clearance*2,height:box.height+clearance*2}))
  const inRoom=(p:Point)=>p.y>=ROUTE_TOP&&roomContainsSegment(room.bounds,p,p)
  const open=(p:Point)=>inRoom(p)&&!obstacles.some(box=>inside(p,box))
  const stubOpen=(port:Port)=>open(port.exit)&&inRoom(port.point)&&!boxes.some(box=>crosses(port.point,port.exit,box))&&!pathsConflict([port.point,port.exit],occupied)
  const starts=usableEmployeePorts(a,setting.source,false,stubOpen),ends=usableEmployeePorts(b,setting.target,true,stubOpen)
  const waypoints=(roomPolygon(room.bounds)??[]).flatMap(p=>[-12,12].flatMap(x=>[-12,12].map(y=>({x:p.x+x,y:p.y+y}))))
  return orthogonalRoutes({starts,ends,obstacles,limits:{x:4,y:ROUTE_TOP,width:room.bounds.width-8,height:room.bounds.height-4-ROUTE_TOP},contains:inRoom,occupied,shared,avoidOccupied:true,waypoints,segmentAllowed:(p,q)=>roomContainsSegment(room.bounds,p,q)})[0]?.points??[]

}

/** Shared visibility-grid A*. Cross-Team callers use no unsafe fallback when blocked. */
export function orthogonalRoutes({starts,ends,obstacles,limits,contains,segmentAllowed,occupied=[],shared=[],waypoints=[],avoidOccupied=false}:{starts:Port[];ends:Port[];obstacles:Box[];limits:Box;contains:(point:Point)=>boolean;segmentAllowed?:(a:Point,b:Point)=>boolean;occupied?:Point[][];shared?:Point[][];waypoints?:Point[];avoidOccupied?:boolean},all=false){
  if(!starts.length||!ends.length)return []
  occupied=occupied.map(compactRoutingPath)
  waypoints=[...waypoints,...shared.flat()]
  if(avoidOccupied)obstacles=[...obstacles,...lineObstacles(occupied)]
  const open=(p:Point)=>contains(p)&&!obstacles.some(box=>inside(p,box))
  const unique=(values:number[])=>[...new Set(values)].sort((a,b)=>a-b)
  const xs=unique([limits.x,limits.x+limits.width,...obstacles.flatMap(box=>[box.x,box.x+box.width]),...waypoints.map(p=>p.x),...starts.map(p=>p.exit.x),...ends.map(p=>p.exit.x)].filter(x=>x>=limits.x&&x<=limits.x+limits.width))
  const ys=unique([limits.y,limits.y+limits.height,...obstacles.flatMap(box=>[box.y,box.y+box.height]),...waypoints.map(p=>p.y),...starts.map(p=>p.exit.y),...ends.map(p=>p.exit.y)].filter(y=>y>=limits.y&&y<=limits.y+limits.height))
  const node=(p:Point)=>ys.indexOf(p.y)*xs.length+xs.indexOf(p.x),point=(n:number)=>({x:xs[n%xs.length],y:ys[Math.floor(n/xs.length)]})
  const goals=new Map(ends.map(port=>[node(port.exit),port])),origins=new Map<number,Port>(),cost=new Map<number,number>(),previous=new Map<number,number>()
  const valid=new Map<number,boolean>(),segments=new Map<string,boolean>()
  const occupiedSegments=occupied.flatMap(path=>path.slice(1).map((q,index)=>[path[index],q]))
  const reusedSegments=shared.flatMap(path=>path.slice(1).map((q,index)=>[path[index],q]))
  const overlapDistance=(a:Point,b:Point,parts:Point[][])=>parts.reduce((sum,[p,q])=>{
    const overlap=(a:number,b:number,c:number,d:number)=>Math.max(0,Math.min(Math.max(a,b),Math.max(c,d))-Math.max(Math.min(a,b),Math.min(c,d)))
    return sum+(a.x===b.x&&p.x===q.x&&a.x===p.x?overlap(a.y,b.y,p.y,q.y):a.y===b.y&&p.y===q.y&&a.y===p.y?overlap(a.x,b.x,p.x,q.x):0)
  },0)
  const validNode=(n:number)=>{if(!valid.has(n))valid.set(n,open(point(n)));return valid.get(n)!}
  const clearSegment=(from:number,to:number)=>{
    const key=from<to?`${from}:${to}`:`${to}:${from}`
    if(!segments.has(key)){
      const p=point(from),q=point(to)
      let clear=!obstacles.some(box=>crosses(p,q,box))
      if(clear&&segmentAllowed)clear=segmentAllowed(p,q)
      segments.set(key,clear)
    }
    return segments.get(key)!
  }
  // A* with a turn penalty prefers short, uncomplicated right-angle paths.
  const heap:{state:number;cost:number;priority:number}[]=[]
  const push=(state:number,g:number)=>{
    const p=point(Math.floor(state/3)),entry={state,cost:g,priority:g+Math.min(...ends.map(end=>distance(p,end.exit)))}
    let i=heap.length;heap.push(entry)
    while(i>0){const parent=(i-1)>>1;if(heap[parent].priority<=entry.priority)break;heap[i]=heap[parent];i=parent}heap[i]=entry
  }
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[child].priority>=last.priority)break;heap[i]=heap[child];i=child}heap[i]=last}return first}
  for(const start of starts){if(!open(start.exit))continue;const state=node(start.exit)*3+start.direction;cost.set(state,start.cost??0);previous.set(state,-1);origins.set(state,start);push(state,start.cost??0)}
  const results:{points:Point[];start:Port;end:Port;cost:number}[]=[],reached=new Set<Port>()
  while(heap.length&&ends.length){
    const current=pop();if(current.cost!==cost.get(current.state))continue
    const n=Math.floor(current.state/3),direction=current.state%3,p=point(n),goal=goals.get(n)
    if(goal&&!reached.has(goal)){
      const path:Point[]=[];let state=current.state,origin:Port|undefined
      while(state!==-1){path.push(point(Math.floor(state/3)));const parent=previous.get(state)!;if(parent===-1){origin=origins.get(state)!;path.push(origin.point);break}state=parent}
      reached.add(goal);results.push({points:[...path.reverse(),goal.point],start:origin!,end:goal,cost:current.cost+(goal.cost??0)})
      if(!all||reached.size===ends.length)break
    }
    const column=n%xs.length,row=Math.floor(n/xs.length)
    for(const next of [column>0?n-1:-1,column+1<xs.length?n+1:-1,row>0?n-xs.length:-1,row+1<ys.length?n+xs.length:-1]){
      if(next<0||!validNode(next)||!clearSegment(n,next))continue
      const q=point(next),nextDirection=p.x===q.x?2:1,state=next*3+nextDirection,g=current.cost+distance(p,q)+(direction===nextDirection?0:28)+overlapDistance(p,q,occupiedSegments)*3+(reusedSegments.length?Math.max(0,distance(p,q)-overlapDistance(p,q,reusedSegments))*.001:0)
      if(g>=(cost.get(state)??Infinity))continue
      cost.set(state,g);previous.set(state,current.state);push(state,g)
    }
  }
  return results.sort((a,b)=>a.cost-b.cost)
}

export const LINE_GAP=12
/** Remove only redundant, monotonic collinear grid vertices; preserve bends and reversals. */
export function compactRoutingPath(input:Point[]):Point[]{
  const result:Point[]=[]
  for(const point of input){
    const last=result.at(-1)
    if(last&&last.x===point.x&&last.y===point.y)continue
    result.push(point)
    while(result.length>=3){
      const [a,b,c]=result.slice(-3)
      const straight=a.x===b.x&&b.x===c.x&&(b.y-a.y)*(c.y-b.y)>=0||a.y===b.y&&b.y===c.y&&(b.x-a.x)*(c.x-b.x)>=0
      if(!straight)break
      result.splice(result.length-2,1)
    }
  }
  return result
}
export function lineObstacles(paths:Point[][],gap=LINE_GAP):Box[]{
  return paths.flatMap(input=>{const points=compactRoutingPath(input);return points.slice(1).map((b,i)=>{const a=points[i];return {x:Math.min(a.x,b.x)-gap,y:Math.min(a.y,b.y)-gap,width:Math.abs(a.x-b.x)+gap*2,height:Math.abs(a.y-b.y)+gap*2}})})
}
/** Reject crossings, collinear overlaps and visually inseparable near-touches. */
export function pathsConflict(points:Point[],occupied:Point[][],gap=LINE_GAP){
  return lineObstacles(occupied,gap).some(box=>points.slice(1).some((p,i)=>crosses(points[i],p,box)||inside(points[i],box)||inside(p,box)))
}
export function clearManagementPath(room:PlannedRoom,points:Point[]){
  const boxes=room.employees.map(item=>({...item.position,...EMPLOYEE_SIZE}))
  return points.length>1&&points.every(p=>p.y>=ROUTE_TOP)&&points.slice(1).every((p,i)=>roomContainsSegment(room.bounds,points[i],p)&&!boxes.some(box=>crosses(points[i],p,box)))
}
/** Shared badge-side branches when the geometry is clear; obstructed branches reuse the same outlet via A*. */
export function managementBadgeBranches(room:PlannedRoom,managerId:string,employeeIds:string[],settings:ConnectorSettings|undefined,occupied:Point[][]){
 const manager=room.employees.find(item=>item.card.id===managerId)!,a={...manager.position,...EMPLOYEE_SIZE}
 const result=new Map<string,{source:ConnectorAnchor;points?:Point[]}>()
 for(const side of ['left','right'] as const){
  const sign=side==='right'?1:-1,source:ConnectorAnchor={side,offset:.8},start={x:a.x+(sign>0?a.width:0),y:a.y+a.height*.8}
  const targets=employeeIds.flatMap(id=>{const item=room.employees.find(e=>e.card.id===id)!,setting=connectorSetting(settings,managerId,id),b={...item.position,...EMPLOYEE_SIZE}
   if(setting.source.side!=='auto'||setting.target.side!==(sign>0?'left':'right'))return []
   const point={x:b.x+(sign>0?0:b.width),y:b.y+b.height*(setting.target.offset??.5)}
   return sign*(point.x-start.x)>36?[{id,point}]:[]
  })
  if(!targets.length)continue
  const gap=Math.min(...targets.map(t=>sign*(t.point.x-start.x))),bus=start.x+sign*Math.min(40,gap/2)
  for(const target of targets){
   const points=compactRoutingPath([start,{x:bus,y:start.y},{x:bus,y:target.point.y},target.point])
   const clear=clearManagementPath(room,points)&&!pathsConflict(points,occupied)
   result.set(target.id,{source,...(clear?{points}:{})})
  }
 }
 return result
}

/** Two-column families get ordered, separate lanes. No edge shares another edge's source port or trunk. */
export function managementFan(room:PlannedRoom,managerId:string,employeeIds:string[],occupied:Point[][]=[]):Map<string,Point[]>|undefined {
  const manager=room.employees.find(item=>item.card.id===managerId)!,a={...manager.position,...EMPLOYEE_SIZE},centre=a.x+a.width/2
  const targets=employeeIds.map(id=>room.employees.find(item=>item.card.id===id)!)
  if(targets.some(item=>item.position.y<a.y+a.height+36))return
  const left=targets.filter(item=>item.position.x+EMPLOYEE_SIZE.width<centre),right=targets.filter(item=>item.position.x>centre)
  if(left.length+right.length!==targets.length||Math.max(left.length,right.length)>6)return
  const result=new Map<string,Point[]>(),taken=[...occupied]
  for(const [side,items] of [[-1,left],[1,right]] as const){
    items.sort((a,b)=>a.position.y-b.position.y||a.card.id.localeCompare(b.card.id))
    const edge=side<0?Math.max(...items.map(t=>t.position.x+EMPLOYEE_SIZE.width)):Math.min(...items.map(t=>t.position.x))
    for(let i=0;i<items.length;i++){
      const target=items[i],portX=centre+side*(items.length-i)*14,laneX=edge+(-side)*(44+i*24)
      let railY=a.y+a.height+16+i*16
      if(side<0?laneX>portX-24:laneX<portX+24)return
      const end={x:target.position.x+EMPLOYEE_SIZE.width/2,y:target.position.y},approachY=target.position.y-24
      if(Math.abs(approachY-railY)<8)railY=approachY
      if(approachY<railY)return
      const points=[{x:portX,y:a.y+a.height},{x:portX,y:railY},{x:laneX,y:railY},{x:laneX,y:approachY},{x:end.x,y:approachY},end]
      if(!clearManagementPath(room,points)||pathsConflict(points,taken))return
      result.set(target.card.id,points);taken.push(points)
    }
  }
  return result
}
