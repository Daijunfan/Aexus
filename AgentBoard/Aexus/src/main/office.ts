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
import {officeQuality,type OfficeQuality} from '../shared/office-quality'
import {arrangeRoomBounds,arrangeTeamEmployees,orderedTeamMembers,ARRANGE_PATTERNS,type ArrangePattern,type ArrangeScope} from '../shared/office-arrange'
import type {Store} from '../shared/types'

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
  if(args.avoidCrossings!==undefined&&typeof args.avoidCrossings!=='boolean')throw Error('avoidCrossings must be a boolean')
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
    const ordered=new Set<string>()
    for(const id of args.order){
      if(ordered.has(id))throw Error('order includes a duplicate employee ID: '+id)
      ordered.add(id)
      const card=store.sessions.find(c=>c.id===id)
      if(!card||card.deleting||!teams.includes(card.group))throw Error('order includes an employee outside the target Teams: '+id)
    }
  }
  const aroundCard=args.around!==undefined?store.sessions.find(c=>c.id===args.around&&!c.deleting):undefined
  const aroundTeam=args.around!==undefined&&store.groups.includes(args.around)?args.around:undefined
  if(args.around!==undefined&&!aroundCard&&!aroundTeam)throw Error('around must be an existing employee or Team ID')
  if(aroundCard&&!teams.includes(aroundCard.group))throw Error('around employee is outside the target Teams')
  if(aroundTeam&&!teams.includes(aroundTeam))throw Error('around Team is outside the target Teams')

  const relations=managementRelations(store.sessions,store.access?.bindings)
  const interactions=managementActivity().interactions.filter(value=>value.highlighted!==false)
  const targets=new Set(teams)
  const qualityOf=(next:Store)=>{
    const plan=officeConnectionPlan(planOffice(next).filter(room=>global||room.name===caller!.group),relations,interactions,targets,next.connectorAnchors)
    return officeQuality(plan.connections,plan.crossTeamConnections)
  }
  // A ring candidate may leave a cross-Team leg unroutable; skip it rather than failing the whole arrange.
  const tryQuality=(next:Store):OfficeQuality|undefined=>{try{return qualityOf(next)}catch{return undefined}}
  const basePlan=planOffice(store)
  const seatRingSizes=new Map<string,number>()
  for(const name of teams){
    const room=basePlan.find(r=>r.name===name)!
    const members=orderedTeamMembers(room,args.order,aroundCard?.group===name?aroundCard.id:undefined)
    const centered=pattern!=='grid'&&aroundCard?.group===name&&members.length>1&&members[0].id===aroundCard.id
    seatRingSizes.set(name,Math.max(0,(centered?members.length-1:members.length)))
  }
  const applyArrangement=(base:Store,roomShift:number,seatShifts:Map<string,number>):Store=>{
    const next=structuredClone(base)
    next.rooms??={}
    // Seats first so room placement sees each Team's final grown bounds.
    if(scope==='employees'||scope==='all'){
      const plan=planOffice(next)
      for(const name of teams){
        const room=plan.find(r=>r.name===name)!
        const arranged=arrangeTeamEmployees(room,pattern,args.order,aroundCard?.group===name?aroundCard.id:undefined,seatShifts.get(name)??0)
        next.rooms[name]={...(next.rooms[name]??{col:0,row:0,w:1,h:1}),bounds:arranged.bounds}
        const positions=new Map(arranged.employees.map(employee=>[employee.card.id,employee.position]))
        next.sessions=next.sessions.map(card=>card.group===name&&positions.has(card.id)?{...card,position:positions.get(card.id)}:card)
      }
    }
    if(scope==='teams'||scope==='all'){
      const plan=planOffice(next)
      const targetRooms=plan.filter(room=>teams.includes(room.name))
      const obstacles=plan.filter(room=>!teams.includes(room.name)).map(room=>room.bounds)
      const aroundRoomName=aroundTeam??aroundCard?.group
      const anchorRoom=aroundRoomName?targetRooms.find(room=>room.name===aroundRoomName):undefined
      const center=(room:{bounds:{x:number;y:number;width:number;height:number}})=>({x:room.bounds.x+room.bounds.width/2,y:room.bounds.y+room.bounds.height/2})
      const anchor:Point=anchorRoom?center(anchorRoom):{x:targetRooms.reduce((sum,room)=>sum+center(room).x,0)/targetRooms.length,y:targetRooms.reduce((sum,room)=>sum+center(room).y,0)/targetRooms.length}
      // --around <employee> centers the employee, not its Team's room: subtract
      // the seat's offset from the room center so the employee lands on the anchor.
      if(aroundCard&&anchorRoom){
        const seat=anchorRoom.employees.find(item=>item.card.id===aroundCard.id)
        if(seat){anchor.x-=seat.position.x+EMPLOYEE_SIZE.width/2-anchorRoom.bounds.width/2;anchor.y-=seat.position.y+EMPLOYEE_SIZE.height/2-anchorRoom.bounds.height/2}
      }
      for(const room of arrangeRoomBounds(targetRooms,pattern,anchor,aroundRoomName,obstacles,roomShift)){
        next.rooms[room.name]={...(next.rooms[room.name]??{col:0,row:0,w:1,h:1}),bounds:room.bounds}
        next.connectorAnchors=rerouteTeamConnections(next.connectorAnchors,room.name,next.sessions)
      }
    }
    return next
  }
  const better=(a:OfficeQuality,b:OfficeQuality)=>
    a.crossingCount!==b.crossingCount?a.crossingCount<b.crossingCount:
    a.overlapCount!==b.overlapCount?a.overlapCount<b.overlapCount:
    a.blockedCount<b.blockedCount
  // Crossing-free is not enough: overlapping or blocked legs are equally
  // avoidable by ring rotation, so keep searching until the score is clean.
  const clean=(q:OfficeQuality)=>q.crossingCount===0&&q.overlapCount===0&&q.blockedCount===0
  // An explicit --order is a fixed seat list; rotating the ring would scramble it.
  const seatsRotatable=args.order===undefined

  const seatShifts=new Map<string,number>()
  let roomShift=0
  const render=()=>applyArrangement(store,roomShift,seatShifts)
  let best=render()
  let quality=qualityOf(best)
  if(avoidCrossings&&!clean(quality)&&pattern!=='grid'){
    // Bounded deterministic reduction: rotate each Team's seat ring, then the
    // whole room ring, keeping only strict improvements against the routed
    // quality and stopping as soon as crossings, overlaps and blocks are gone.
    if((scope==='employees'||scope==='all')&&seatsRotatable){
      for(const name of teams){
        if(clean(quality))break
        const ring=seatRingSizes.get(name)!
        if(ring<=1)continue
        let bestShift=0,bestQ=quality,bestCandidate=best
        for(let shift=1;shift<2*ring;shift++){
          seatShifts.set(name,shift)
          const candidate=render()
          const q=tryQuality(candidate)
          if(q&&better(q,bestQ)){bestQ=q;bestShift=shift;bestCandidate=candidate}
        }
        seatShifts.set(name,bestShift)
        if(bestShift!==0){best=bestCandidate;quality=bestQ}
      }
    }
    if((scope==='teams'||scope==='all')&&!clean(quality)){
      const ring=Math.max(0,((aroundTeam??aroundCard?.group)?teams.length-1:teams.length))
      if(ring>1){
        let bestShift=0,bestQ=quality,bestCandidate=best
        for(let shift=1;shift<2*ring;shift++){
          roomShift=shift
          const candidate=render()
          const q=tryQuality(candidate)
          if(q&&better(q,bestQ)){bestQ=q;bestShift=shift;bestCandidate=candidate}
        }
        roomShift=bestShift
        if(bestShift!==0){best=bestCandidate;quality=bestQ}
      }
    }
  }
  writeStore(best,{reconcileOffice:false})

  const finalPlan=planOffice(best)
  const rooms=finalPlan.filter(room=>targets.has(room.name)).map(room=>({
    name:room.name,bounds:room.bounds,
    employees:room.employees.filter(item=>!item.card.deleting).map(({card,position})=>({id:card.id,title:card.title,managementRole:card.managementRole??'employee',position}))
  }))
  const employees=rooms.flatMap(room=>room.employees.map((employee:{id:string;title:string;managementRole:string;position:Point})=>({id:employee.id,team:room.name,title:employee.title,managementRole:employee.managementRole,position:employee.position})))
  return {revision:best.revision,pattern,scope,avoidCrossings,rooms,employees,quality}
}
