import {officeConnectionPlan} from '../shared/office-connections'
import {crossTeamRoutes} from '../shared/cross-team-routing'
import {resolveTeamView} from '../shared/team-views'
import {managementActivity} from './management-activity'
import {planOffice,EMPLOYEE_SIZE,type Point} from '../shared/canvas'
import {managementRoutes} from '../shared/management-layout'
import {managementRelations} from '../shared/management'
import {readStore,writeStore} from './store'
import {authorize,callerEmployee,isGlobal,requestContext,canEditOffice} from './authorization'
import {rerouteTeamConnections} from '../shared/connector'
import {officeQuality} from '../shared/office-quality'
import {arrangeRoomBounds,arrangeTeamEmployees,ARRANGE_PATTERNS,type ArrangePattern,type ArrangeScope} from '../shared/office-arrange'

/** Geometry-only projection; no host credentials, working files or conversations. */
export function officeLayout(team?:string,viewId?:string){
  authorize('office.layout',{team})
  const store=readStore(),context=requestContext(),caller=callerEmployee(context.principal)
  const global=isGlobal(context.principal),selected=team??(global?undefined:caller!.group)
  if(selected!==undefined&&!store.groups.includes(selected))throw Error('Unknown Team')
  const view=viewId===undefined?undefined:resolveTeamView(store,viewId),authorized=planOffice(store).filter(room=>global||room.name===caller!.group)
  const visible=new Set(authorized.filter(room=>(selected===undefined||room.name===selected)&&(!view||view.teams.includes(room.name))).map(room=>room.name))
  const plan=officeConnectionPlan(authorized,managementRelations(store.sessions,store.access?.bindings),managementActivity().interactions.filter(value=>value.highlighted!==false),visible,store.connectorAnchors)
  return {connections:plan.connections,revision:store.revision,...(view?{view:{id:view.id,name:view.name}}:{}),crossTeamConnections:plan.crossTeamConnections,coordinates:{team:'world pixels',employee:'pixels relative to its Team'},quality:officeQuality(plan.connections,plan.crossTeamConnections),rooms:
    authorized.filter(room=>visible.has(room.name)).map(room=>({
      name:room.name,bounds:room.bounds,
      editable:canEditOffice(store,context.principal,room.name),
      connections:plan.roomConnections.get(room.name)??[],
      employees:room.employees.filter(item=>!item.card.deleting).map(({card,position})=>({
        id:card.id,title:card.title,engine:card.engine,kind:card.kind??'worker',
        managementRole:card.managementRole??'employee',shape:'rectangle',position,...EMPLOYEE_SIZE,
        editable:canEditOffice(store,context.principal,room.name,card.id)
      }))
    }))}
}

/** One canonical arrangement mutation: reposition authorized rooms and/or seats, then report quality. */
export function arrangeOffice(args:{team?:string;viewId?:string;pattern?:string;scope?:string;around?:string;avoidCrossings?:boolean;order?:string[]}){
  const pattern=args.pattern as ArrangePattern
  if(!ARRANGE_PATTERNS.includes(pattern))throw Error('pattern must be circle, rectangle or grid')
  const scope=(args.scope??'all') as ArrangeScope
  if(!['teams','employees','all'].includes(scope))throw Error('scope must be teams, employees or all')
  const avoidCrossings=args.avoidCrossings!==false
  const store=readStore(),context=requestContext(),caller=callerEmployee(context.principal)
  const global=isGlobal(context.principal)
  if(args.team!==undefined&&!store.groups.includes(args.team))throw Error('Unknown Team')
  const view=args.viewId===undefined?undefined:resolveTeamView(store,args.viewId)
  const authorized=planOffice(store).filter(room=>global||room.name===caller!.group)
  const teams=authorized.filter(room=>(args.team===undefined||room.name===args.team)&&(!view||view.teams.includes(room.name))).map(room=>room.name)
  if(!teams.length)throw Error('No authorized Teams to arrange')
  for(const name of teams)if(!canEditOffice(store,context.principal,name))throw Error('Forbidden layout: office.arrange')
  authorize('office.arrange',{team:teams[0]})
  if(args.order!==undefined){
    if(!Array.isArray(args.order)||args.order.some(id=>typeof id!=='string'))throw Error('order must be an array of employee IDs')
    for(const id of args.order){
      const card=store.sessions.find(c=>c.id===id)
      if(!card||card.deleting||!teams.includes(card.group))throw Error('order includes an employee outside the target Teams: '+id)
    }
  }
  const aroundCard=args.around!==undefined?store.sessions.find(c=>c.id===args.around&&!c.deleting):undefined
  const aroundTeam=args.around!==undefined&&store.groups.includes(args.around)?args.around:undefined
  if(args.around!==undefined&&!aroundCard&&!aroundTeam)throw Error('around must be an existing employee or Team ID')
  if(aroundCard&&!teams.includes(aroundCard.group))throw Error('around employee is outside the target Teams')
  if(aroundTeam&&!teams.includes(aroundTeam))throw Error('around Team is outside the target Teams')

  store.rooms??={}
  const targetRooms=planOffice(store).filter(room=>teams.includes(room.name))
  if(scope==='teams'||scope==='all'){
    const aroundRoomName=aroundTeam??aroundCard?.group
    const anchorRoom=aroundRoomName?targetRooms.find(room=>room.name===aroundRoomName):undefined
    const center=(room:{bounds:{x:number;y:number;width:number;height:number}})=>({x:room.bounds.x+room.bounds.width/2,y:room.bounds.y+room.bounds.height/2})
    const anchor:Point=anchorRoom?center(anchorRoom):{x:targetRooms.reduce((sum,room)=>sum+room.bounds.x+room.bounds.width/2,0)/targetRooms.length,y:targetRooms.reduce((sum,room)=>sum+room.bounds.y+room.bounds.height/2,0)/targetRooms.length}
    for(const room of arrangeRoomBounds(targetRooms,pattern,anchor,aroundRoomName)){
      store.rooms[room.name]={...(store.rooms[room.name]??{col:0,row:0,w:1,h:1}),bounds:room.bounds}
      store.connectorAnchors=rerouteTeamConnections(store.connectorAnchors,room.name,store.sessions)
    }
  }
  if(scope==='employees'||scope==='all'){
    const plan=planOffice(store)
    for(const name of teams){
      const room=plan.find(r=>r.name===name)!
      const arranged=arrangeTeamEmployees(room,pattern,args.order,aroundCard?.group===name?aroundCard.id:undefined)
      store.rooms[name]={...(store.rooms[name]??{col:0,row:0,w:1,h:1}),bounds:arranged.bounds}
      const positions=new Map(arranged.employees.map(employee=>[employee.card.id,employee.position]))
      store.sessions=store.sessions.map(card=>card.group===name&&positions.has(card.id)?{...card,position:positions.get(card.id)}:card)
    }
  }
  writeStore(store)

  const finalPlan=planOffice(store),targets=new Set(teams),visible=targets
  const plan=officeConnectionPlan(finalPlan.filter(room=>global||room.name===caller!.group),managementRelations(store.sessions,store.access?.bindings),managementActivity().interactions.filter(value=>value.highlighted!==false),visible,store.connectorAnchors)
  const quality=officeQuality(plan.connections,plan.crossTeamConnections)
  const rooms=finalPlan.filter(room=>targets.has(room.name)).map(room=>({
    name:room.name,bounds:room.bounds,
    employees:room.employees.filter(item=>!item.card.deleting).map(({card,position})=>({id:card.id,title:card.title,managementRole:card.managementRole??'employee',position}))
  }))
  const employees=rooms.flatMap(room=>room.employees.map((employee:{id:string;title:string;managementRole:string;position:Point})=>({id:employee.id,team:room.name,title:employee.title,managementRole:employee.managementRole,position:employee.position})))
  return {revision:store.revision,pattern,scope,avoidCrossings,rooms,employees,quality}
}
