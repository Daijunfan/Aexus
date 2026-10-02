import {connectorSetting,type ConnectorAnchor,type ConnectorSetting,type ConnectorSettings} from './connector'
import {EMPLOYEE_SIZE,ROOM_HEADER_HEIGHT,type PlannedRoom,type Point} from './canvas'
import {roomSections,roomContainsSegment,roomPolygon} from './room-geometry'
import {usableEmployeePorts,pathsConflict,ROUTE_TOP,orthogonalRoutes,crosses,inside,distance,type Box,type Port} from './management-routing'
import {managementRoutes,roundedOrthogonalPath} from './management-layout'
import type {ManagementRelation,ManagementInteraction} from './management'

type Segment={points:Point[];path:string}
type Leg=Segment&{port:Point}
export type CrossTeamRoute={anchors:ConnectorSetting;id:string;managerId:string;employeeId:string;sourceTeam:string;targetTeam:string;sourceName:string;targetName:string;active:boolean;temporary:boolean;command?:string;status:'routed'|'hidden'|'blocked';source?:Leg;external?:Segment;target?:Leg}
type Portal=Port&{outside:Point}
const PAD=24,MIN_Y=ROUTE_TOP
const inflate=(b:Box,pad:number):Box=>({x:b.x-pad,y:b.y-pad,width:b.width+pad*2,height:b.height+pad*2})
const world=(room:PlannedRoom,p:Point)=>({x:room.bounds.x+p.x,y:room.bounds.y+p.y})
const segment=(points:Point[]):Segment=>({points,path:roundedOrthogonalPath(points)})

function portals(room:PlannedRoom,anchor:Point):Portal[]{
  const b=room.bounds,result:Portal[]=[],ys=[anchor.y,Math.max(MIN_Y+PAD,b.height*.55),b.height-60]
  for(const y of [...new Set(ys.map(y=>Math.max(MIN_Y+PAD,Math.min(b.height-44,y))))]){
    const sections=roomSections(b,'x',y);if(!sections.length)continue
    const left=sections[0][0],right=sections.at(-1)![1]
    result.push({point:{x:left,y},exit:{x:left+Math.min(PAD,Math.max(4,(anchor.x-left)/2)),y},outside:{x:-PAD,y},direction:1},
      {point:{x:right,y},exit:{x:right-Math.min(PAD,Math.max(4,(right-anchor.x)/2)),y},outside:{x:b.width+PAD,y},direction:1})
  }
  for(const x of [...new Set([anchor.x,b.width*.5])]){
    const end=roomSections(b,'y',x).at(-1)?.[1];if(end===undefined||end-PAD<MIN_Y)continue
    result.push({point:{x,y:end},exit:{x,y:end-PAD},outside:{x,y:b.height+PAD},direction:2})
  }
  return result.filter(p=>roomContainsSegment(b,p.exit,p.point)&&p.point.y>=MIN_Y)
}

/** Compute all usable exits in a single room search. Employees are never moved for routing. */
function roomLegs(room:PlannedRoom,id:string,target:boolean,others:PlannedRoom[],occupied:Point[][],anchor:ConnectorAnchor){
  const employee=room.employees.find(item=>item.card.id===id)!,b=room.bounds
  const boxes=room.employees.map(item=>({...item.position,...EMPLOYEE_SIZE})),card={...employee.position,...EMPLOYEE_SIZE}
  const foreign=others.filter(other=>other!==room).map(other=>({...other.bounds,x:other.bounds.x-b.x,y:other.bounds.y-b.y}))
  const obstacles=[...boxes.map(box=>inflate(box,9)),...foreign.map(box=>inflate(box,8))]
  const contains=(p:Point)=>p.y>=MIN_Y&&roomContainsSegment(b,p,p)
  const open=(p:Point)=>contains(p)&&!obstacles.some(box=>inside(p,box))
  const validStart=usableEmployeePorts(card,anchor,target,p=>open(p.exit)&&contains(p.point)&&!boxes.concat(foreign).some(box=>crosses(p.point,p.exit,box))&&!pathsConflict([p.point,p.exit],occupied))
  const ends=portals(room,validStart[0]?.point??{x:card.x+card.width/2,y:Math.max(MIN_Y+24,card.y-24)}).filter(p=>open(p.exit)&&!boxes.concat(foreign).some(box=>crosses(p.exit,p.point,box))&&!pathsConflict([p.exit,p.point],occupied))
  // Vertices expose corridors in concave custom contours without a sampling approximation.
  const waypoints=(roomPolygon(b)??[]).flatMap(p=>[-12,12].flatMap(x=>[-12,12].map(y=>({x:p.x+x,y:p.y+y}))))
  return orthogonalRoutes({starts:validStart,ends,obstacles,limits:{x:4,y:MIN_Y,width:b.width-8,height:b.height-MIN_Y-4},contains,segmentAllowed:(a,z)=>roomContainsSegment(b,a,z),waypoints,occupied,avoidOccupied:true},true)
    .map(route=>({...route,portal:route.end as Portal}))
}

/** One logical relation, split at real contour ports. Only the final employee leg has an arrow. */
export function crossTeamRoutes(rooms:PlannedRoom[],relations:ManagementRelation[],interactions:ManagementInteraction[]=[],visibleTeams=new Set(rooms.map(room=>room.name)),settings?:ConnectorSettings,roomPaths?:Map<string,Point[][]>):CrossTeamRoute[]{
  const nodes=new Map(rooms.flatMap(room=>room.employees.map(item=>[item.card.id,{room,...item}] as const)))
  const edges=relations.filter(edge=>edge.state==='active').map(edge=>({...edge,temporary:false}))
  for(const interaction of interactions)if(!edges.some(edge=>edge.managerId===interaction.managerId&&edge.employeeId===interaction.employeeId))edges.push({...interaction,id:`interaction-${interaction.managerId}-${interaction.employeeId}`,state:'active',temporary:true,requestedBy:{kind:'agent',employeeId:interaction.managerId},createdAt:0,updatedAt:0})
  // No cross-Team edges means no portal search or repeated local routing.
  if(!edges.some(edge=>{const a=nodes.get(edge.managerId),b=nodes.get(edge.employeeId);return a&&b&&a.room!==b.room&&(visibleTeams.has(a.room.name)||visibleTeams.has(b.room.name))}))return []
  const shown=rooms.filter(room=>visibleTeams.has(room.name)),outside:{managerId:string;points:Point[]}[]=[],shared=new Map<string,Point[][]>(),internal=new Map<string,Point[][]>(roomPaths)
  for(const room of shown){if(internal.has(room.name))continue;const permanent=managementRoutes(room,relations,[],settings).filter(r=>r.status==='routed').map(r=>r.points),temporary=managementRoutes(room,edges.filter(e=>e.temporary),permanent,settings);internal.set(room.name,[...permanent,...temporary.filter(r=>r.status==='routed').map(r=>r.points)])}
  const result:CrossTeamRoute[]=[]
  for(const edge of edges){
    const a=nodes.get(edge.managerId),z=nodes.get(edge.employeeId)
    if(!a||!z||a.room===z.room||(!visibleTeams.has(a.room.name)&&!visibleTeams.has(z.room.name)))continue
    const activity=interactions.find(value=>value.managerId===edge.managerId&&value.employeeId===edge.employeeId)
    const route:CrossTeamRoute={anchors:connectorSetting(settings,edge.managerId,edge.employeeId),id:edge.id,managerId:edge.managerId,employeeId:edge.employeeId,sourceTeam:a.room.name,targetTeam:z.room.name,sourceName:a.card.title,targetName:z.card.title,active:!!activity,temporary:edge.temporary,command:activity?.command,status:'blocked'}
    result.push(route)
    if(!visibleTeams.has(a.room.name)||!visibleTeams.has(z.room.name)){route.status='hidden';continue}
    const owned=shared.get(edge.managerId)??[],sourcePaths=(internal.get(a.room.name)??[]).filter(p=>!owned.includes(p)),targetPaths=(internal.get(z.room.name)??[]).filter(p=>!owned.includes(p)),externalPaths=outside.filter(p=>p.managerId!==edge.managerId).map(p=>p.points)
    const sources=roomLegs(a.room,edge.managerId,false,shown,sourcePaths,connectorSetting(settings,edge.managerId,edge.employeeId).source),targets=roomLegs(z.room,edge.employeeId,true,shown,targetPaths,connectorSetting(settings,edge.managerId,edge.employeeId).target)
    const externalPort=(room:PlannedRoom,leg:typeof sources[number]):Port=>({point:world(room,leg.portal.point),exit:world(room,leg.portal.outside),direction:leg.portal.direction,cost:leg.cost+distance(leg.portal.point,leg.portal.outside)})
    const startMap=new Map(sources.map(leg=>[externalPort(a.room,leg),leg])),endMap=new Map(targets.map(leg=>[externalPort(z.room,leg),leg]))
    const usable=(port:Port,own:PlannedRoom)=>!pathsConflict([port.point,port.exit],externalPaths)&&!shown.filter(room=>room!==own).some(room=>crosses(port.point,port.exit,inflate(room.bounds,8))||inside(port.point,inflate(room.bounds,8)))
    const starts=[...startMap.keys()].filter(p=>usable(p,a.room)),ends=[...endMap.keys()].filter(p=>usable(p,z.room))
    if(!starts.length||!ends.length)continue
    const minX=Math.min(...shown.map(room=>room.bounds.x))-64,minY=Math.min(...shown.map(room=>room.bounds.y))-64
    const maxX=Math.max(...shown.map(room=>room.bounds.x+room.bounds.width))+64,maxY=Math.max(...shown.map(room=>room.bounds.y+room.bounds.height))+64
    const external=orthogonalRoutes({starts,ends,obstacles:shown.map(room=>inflate(room.bounds,16)),limits:{x:minX,y:minY,width:maxX-minX,height:maxY-minY},contains:()=>true,occupied:externalPaths,avoidOccupied:true},true)[0]
    if(!external)continue
    const source=startMap.get(external.start)!,target=endMap.get(external.end)!
    route.status='routed';route.source={...segment(source.points),port:source.portal.point};route.target={...segment([...target.points].reverse()),port:target.portal.point};route.external=segment(external.points)
    outside.push({managerId:edge.managerId,points:external.points});shared.set(edge.managerId,[...owned,source.points,target.points])
    for(const [name,points] of [[a.room.name,source.points],[z.room.name,target.points]] as const)internal.set(name,[...(internal.get(name)??[]),points])
  }
  return result
}
