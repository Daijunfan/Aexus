import {randomUUID} from 'node:crypto'
import {assertManagementKind,emptyAccess,managementRelations,type ManagementBinding} from '../shared/management'
import {isSupervisor} from '../shared/roles'
import {employeeSettings} from '../shared/types'
import {authorize,canControl,isGlobal,requestContext} from './authorization'
import {readStore,writeStore} from './store'

type BindingRequest={manager?:unknown;employee?:unknown;id?:unknown}
const identifier=(value:unknown,name:string)=>{
  if(typeof value!=='string'||!value.trim()||value!==value.trim())throw Error('Provide a valid '+name+' ID')
  return value
}

/** Visual membership only: no permission grants, native engine calls or employee re-layout. */
function changeBinding(enabled:boolean,args:BindingRequest){
  const command=enabled?'management.bind':'management.unbind'
  authorize(command,args)
  for(const key of Object.keys(args))if(!['manager','employee',...(enabled?[]:['id'])].includes(key))throw Error('Unknown binding field: '+key)
  const store=readStore(),principal=requestContext().principal
  const edges=managementRelations(store.sessions,store.access?.bindings)
  let managerId:string,employeeId:string
  if(args.id!==undefined){
    if(args.manager!==undefined||args.employee!==undefined)throw Error('Provide a relation ID or manager/employee, not both')
    const id=identifier(args.id,'relation'),edge=edges.find(edge=>edge.id===id)??store.access?.bindings?.find(edge=>edge.id===id)
    if(!edge)throw Error('Unknown management relation')
    managerId=edge.managerId;employeeId=edge.employeeId
  }else{
    managerId=identifier(args.manager===undefined?(principal.kind==='agent'?principal.employeeId:undefined):args.manager,'manager')
    employeeId=identifier(args.employee,'employee')
  }
  if(principal.kind==='agent'&&managerId!==principal.employeeId&&!isGlobal(principal))throw Error('Forbidden: Manager may change only its own outgoing bindings')
  const source=store.sessions.find(card=>card.id===managerId&&!card.deleting),target=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  if(!source||!target||managerId===employeeId)throw Error('Choose two existing, different employees')
  if(!isSupervisor(source.managementRole))throw Error('Binding source must be a Manager or Governor')
  assertManagementKind(source,false,employeeSettings(store,source).mode==='cloud')
  if(enabled&&!canControl({kind:'agent',employeeId:managerId},employeeId))throw Error('Forbidden: binding target is outside the source role scope')
  const samePair=(edge:{managerId:string;employeeId:string})=>edge.managerId===managerId&&edge.employeeId===employeeId
  const before=edges.find(samePair),previous=store.access?.bindings?.find(samePair)
  const creator=target.createdBy?.kind==='agent'&&target.createdBy.employeeId===managerId
  const result=(changed:boolean)=>({managerId,employeeId,bound:enabled,changed,relation:managementRelations(store.sessions,store.access?.bindings).find(samePair)??null,revision:store.revision??0})
  if((enabled&&before)||(!enabled&&(previous?.enabled===false||(!before&&!previous&&!creator))))return result(false)
  const now=Date.now(),binding:ManagementBinding={id:previous?.id??before?.id??'bound-'+randomUUID(),managerId,employeeId,enabled,requestedBy:principal,createdAt:previous?.createdAt??now,updatedAt:now}
  store.access??=emptyAccess()
  store.access.bindings=[...(store.access.bindings??[]).filter(edge=>!samePair(edge)),binding]
  // Keep a disabled override for creator lines, so a later save/restart cannot resurrect them.
  writeStore(store,{reconcileOffice:false})
  return result(true)
}

export const bindManagement=(args:BindingRequest)=>changeBinding(true,args)
export const unbindManagement=(args:BindingRequest)=>changeBinding(false,args)
