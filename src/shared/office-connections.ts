import {EMPLOYEE_SIZE,type PlannedRoom,type Point} from './canvas'
import {connectorSetting,type ConnectorSettings,type ConnectorAnchor} from './connector'
import {managementRoutes,roundedOrthogonalPath} from './management-layout'
import {crossTeamRoutes} from './cross-team-routing'
import {employeePorts,orthogonalRoutes,inside,type Box,type Port} from './management-routing'
import {attachPath,directPath,simplifyPath} from './connector-path'
import type {ManagementRelation,ManagementInteraction} from './management'
export type OfficeConnection={status:'routed';anchors:{source:ConnectorAnchor;target:ConnectorAnchor};id:string;managerId:string;employeeId:string;sourceTeam:string;targetTeam:string;sourceName:string;targetName:string;origin:Point;points:Point[];path:string;active:boolean;temporary:boolean;manual:boolean;warning?:string}
export type ConnectionNode={room:PlannedRoom;position:Point;box:Box;title:string}
export const connectionNodes=(rooms:PlannedRoom[])=>new Map(rooms.flatMap(room=>room.employees.map(({card,position})=>[card.id,{room,position,box:{x:room.bounds.x+position.x,y:room.bounds.y+position.y,...EMPLOYEE_SIZE},title:card.title}] as const)))
export function nodePorts(node:ConnectionNode,anchor:ConnectorAnchor,target:boolean):Array<Port&{bounds:Box}>{return employeePorts({...node.position,...EMPLOYEE_SIZE},anchor,target).map(port=>({...port,bounds:node.box,point:{x:node.room.bounds.x+port.point.x,y:node.room.bounds.y+port.point.y},exit:{x:node.room.bounds.x+port.exit.x,y:node.room.bounds.y+port.exit.y}}))}
const translate=(points:Point[],origin:Point)=>points.map(p=>({x:p.x+origin.x,y:p.y+origin.y}))
/** Visibility always wins over ideal avoidance: never drop an existing edge after a drag. */
function recoverRoute(source:ConnectionNode,target:ConnectionNode,nodes:Map<string,ConnectionNode>,a:ConnectorAnchor,b:ConnectorAnchor){
 const starts=nodePorts(source,a,false),ends=nodePorts(target,b,true),boxes=[...nodes.values()].map(n=>({x:n.box.x-8,y:n.box.y-8,width:n.box.width+16,height:n.box.height+16})),rooms=[...new Set([...nodes.values()].map(n=>n.room))]
 const obstacles=[...boxes,...rooms.map(r=>({...r.bounds,height:170}))],open=(p:Point)=>!obstacles.some(box=>inside(p,box)),xs=obstacles.flatMap(b=>[b.x,b.x+b.width]),ys=obstacles.flatMap(b=>[b.y,b.y+b.height])
 const limits={x:Math.min(...xs)-100,y:Math.min(...ys)-100,width:Math.max(...xs)-Math.min(...xs)+200,height:Math.max(...ys)-Math.min(...ys)+200}
 const dockOpen=(p:Point)=>![...nodes.values()].some(n=>inside(p,n.box))&&!rooms.some(r=>inside(p,{...r.bounds,height:170}))
 const routed=orthogonalRoutes({starts:starts.filter(p=>open(p.exit)&&dockOpen(p.point)),ends:ends.filter(p=>open(p.exit)&&dockOpen(p.point)),obstacles,limits,contains:()=>true})[0]?.points
 return {points:routed??directPath(starts[0],ends[0]),warning:routed?undefined:'当前位置拥挤，可拖动线段调整走线'}
}
/** Canonical display path shared by Core, CLI and the single foreground SVG layer. */
export function officeConnectionPlan(rooms:PlannedRoom[],relations:ManagementRelation[],interactions:ManagementInteraction[]=[],visible=new Set(rooms.map(r=>r.name)),settings?:ConnectorSettings){
 const nodes=connectionNodes(rooms),result:OfficeConnection[]=[],roomConnections=new Map<string,ReturnType<typeof managementRoutes>>(),roomPaths=new Map<string,Point[][]>()
 const temporary=interactions.filter(i=>!relations.some(r=>r.managerId===i.managerId&&r.employeeId===i.employeeId)).map(i=>({id:`interaction-${i.managerId}-${i.employeeId}`,managerId:i.managerId,employeeId:i.employeeId,state:'active' as const,requestedBy:{kind:'agent' as const,employeeId:i.managerId},createdAt:0,updatedAt:0}))
 const raw=new Map<string,Point[]>()
 for(const room of rooms){
  if(!visible.has(room.name))continue
  const permanent=managementRoutes(room,relations,[],settings),transient=managementRoutes(room,temporary,permanent.map(r=>r.points),settings)
  roomConnections.set(room.name,permanent)
  roomPaths.set(room.name,[...permanent,...transient].filter(r=>r.status==='routed').map(r=>r.points))
  for(const r of [...permanent,...transient])raw.set(r.id,translate(r.points,room.bounds))
 }
 const cross=crossTeamRoutes(rooms,relations,interactions,visible,settings,roomPaths)
 for(const r of cross)if(r.status==='routed')raw.set(r.id,[...translate(r.source!.points,nodes.get(r.managerId)!.room.bounds),...r.external!.points,...translate(r.target!.points,nodes.get(r.employeeId)!.room.bounds)])
 for(const edge of [...relations,...temporary]){
  const s=nodes.get(edge.managerId),t=nodes.get(edge.employeeId);if(edge.state!=='active'||!s||!t||!visible.has(s.room.name)||!visible.has(t.room.name))continue
  const setting=connectorSetting(settings,edge.managerId,edge.employeeId),origin={x:s.room.bounds.x,y:s.room.bounds.y}
  let points=raw.get(edge.id)??[],warning:string|undefined
  if(setting.route?.length){points=attachPath(translate(setting.route,origin),nodePorts(s,setting.source,false)[0],nodePorts(t,setting.target,true)[0])}
  else if(points.length<2){const route=recoverRoute(s,t,nodes,setting.source,setting.target);points=route.points;warning=route.warning}
  points=simplifyPath(points)
  result.push({status:'routed',anchors:{source:setting.source,target:setting.target},id:edge.id,managerId:edge.managerId,employeeId:edge.employeeId,sourceTeam:s.room.name,targetTeam:t.room.name,sourceName:s.title,targetName:t.title,origin,points,path:roundedOrthogonalPath(points),active:interactions.some(i=>i.managerId===edge.managerId&&i.employeeId===edge.employeeId),temporary:temporary.some(t=>t.id===edge.id),manual:!!setting.route?.length,warning})
 }
 return {connections:result,crossTeamConnections:cross,roomConnections}
}

/** Existing consumers keep the same result shape; the desktop/Core reuse the whole plan. */
export function officeConnections(...args:Parameters<typeof officeConnectionPlan>):OfficeConnection[]{return officeConnectionPlan(...args).connections}

/** A compact geometry key excludes token content, receipts, camera and activity timestamps. */
export function connectionGeometryKey(rooms:PlannedRoom[],relations:ManagementRelation[],interactions:ManagementInteraction[],visible:Set<string>,settings?:ConnectorSettings){
 return JSON.stringify([
  rooms.map(r=>[r.name,r.bounds,r.employees.map(e=>[e.card.id,e.card.title,e.position])]),
  relations.map(r=>[r.id,r.managerId,r.employeeId,r.state]),
  interactions.filter(i=>!relations.some(r=>r.managerId===i.managerId&&r.employeeId===i.employeeId)).map(i=>[i.managerId,i.employeeId]),
  [...visible],settings
 ])
}
