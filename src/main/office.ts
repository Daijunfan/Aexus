import {planOffice,EMPLOYEE_SIZE} from '../shared/canvas'
import {readStore,writeStore} from './store'
import {roomsOverlap,reconcileOfficeLayout} from '../shared/office-layout'
import {authorize,callerEmployee,isGlobal,requestContext,canEditOffice} from './authorization'

/** Geometry-only projection; no host credentials, working files or conversations. */
export function officeLayout(team?:string){
  authorize('office.layout',{team})
  const store=readStore(),context=requestContext(),caller=callerEmployee(context.principal)
  const global=isGlobal(context.principal),selected=team??(global?undefined:caller!.group)
  if(selected!==undefined&&!store.groups.includes(selected))throw Error('Unknown Team')
  return {revision:store.revision,coordinates:{team:'world pixels',employee:'pixels relative to its Team'},rooms:
    planOffice(store).filter(room=>selected===undefined||room.name===selected).map(room=>({
      name:room.name,bounds:room.bounds,
      editable:canEditOffice(store,context.principal,room.name),
      employees:room.employees.filter(item=>!item.card.deleting).map(({card,position})=>({
        id:card.id,title:card.title,engine:card.engine,kind:card.kind??'worker',
        managementRole:card.managementRole??'employee',position,...EMPLOYEE_SIZE,
        editable:canEditOffice(store,context.principal,room.name,card.id)
      }))
    }))}
}

/** Upgrade old overlapping pinned layouts once; keep files, employees and cameras unchanged. */
export function repairOfficeLayout(){
  const store=readStore(),rooms=planOffice(store)
  if(!rooms.some((room,i)=>rooms.slice(i+1).some(other=>roomsOverlap(room.bounds,other.bounds,0))))return false
  reconcileOfficeLayout(store,structuredClone(store),true)
  writeStore(store)
  return true
}
