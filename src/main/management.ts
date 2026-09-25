import {applyManagementLayout} from '../shared/management-layout'
import {randomUUID} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {assertManagementKind,emptyAccess,type ManagementRole,type PrincipalRef} from '../shared/management'
import {readStore,updateStore} from './store'
import {authorize,callerEmployee,isGlobal,publicEmployee,canControl,requestContext} from './authorization'
import {managerCliRoot} from './exec'
import {ensureEmployeeBootstrap} from './plugins/documents'

export function initializeManagement(){
  const previous=readStore(),invalid=previous.sessions.filter(card=>card.kind==='cloud-native-worker'&&(card.managementRole==='manager'||previous.access?.globalManagerIds.includes(card.id)))
  if(previous.access&&!invalid.length)return
  if(invalid.length){mkdirSync(join(APP_HOME,'backups'),{recursive:true});writeFileSync(join(APP_HOME,'backups',`before-local-manager-only-${Date.now()}.json`),JSON.stringify(previous,null,2),{mode:0o600})}
  updateStore(store=>{
    const legacy=!store.access;store.access??=emptyAccess()
    for(const card of store.sessions){
      card.managementRole??='employee';card.accessMode??='trusted'
      if(card.kind==='cloud-native-worker'){
        card.managementRole='employee';store.access.globalManagerIds=store.access.globalManagerIds.filter(id=>id!==card.id)
        if(store.access.globalGrants)delete store.access.globalGrants[card.id]
      }else if(legacy&&managerCliRoot(card.cwd)){store.access.globalManagerIds.push(card.id);(store.access.globalGrants??={})[card.id]=randomUUID();card.managementRole='manager'}
    }
  })
}
export function managementTopology(team?:string){
  const store=readStore(),principal=requestContext().principal,global=isGlobal(principal),caller=callerEmployee(principal),access=store.access??emptyAccess()
  if(!global&&team&&team!==caller!.group)throw Error('Forbidden Team')
  const nodes=store.sessions.filter(c=>!c.deleting&&(!team||c.group===team)&&(global||c.group===caller!.group)).map(card=>({...publicEmployee(card),globalManager:access.globalManagerIds.includes(card.id),allowedActions:global?['read','message','configure','delete','role']:canControl(principal,card.id)?['read','message','configure',...(card.createdBy?.kind==='agent'&&card.createdBy.employeeId===caller!.id?['delete']:[])]:card.id===caller!.id?['read']:[]}))
  const ids=new Set(nodes.map(node=>node.id)),relations=access.relations.filter(r=>ids.has(r.managerId)&&ids.has(r.employeeId)&&(global||r.managerId===caller!.id||r.employeeId===caller!.id))
  return {revision:access.revision,team,nodes,edges:relations.filter(r=>r.state==='active'),pending:relations.filter(r=>r.state==='pending')}
}
export function requestManagement(employeeId:string,managerId?:string){
  const principal=requestContext().principal,global=isGlobal(principal),manager=global?managerId??(principal.kind==='agent'?principal.employeeId:undefined):callerEmployee(principal)!.id
  if(!manager)throw Error('Select a Manager')
  let result:any
  updateStore(store=>{
    const source=store.sessions.find(c=>c.id===manager&&!c.deleting),target=store.sessions.find(c=>c.id===employeeId&&!c.deleting)
    if(!source||!target||source.kind==='cloud-native-worker'||source.managementRole!=='manager'||(target.managementRole??'employee')!=='employee'||source.group!==target.group||source.id===target.id||store.access?.globalManagerIds.includes(target.id))throw Error('A relation requires a Manager and Employee in the same Team')
    const access=store.access??=emptyAccess();if(access.relations.some(r=>r.managerId===manager&&r.employeeId===employeeId))throw Error('Relation already exists')
    result={id:randomUUID(),managerId:manager,employeeId,state:'pending' as const,requestedBy:principal,createdAt:Date.now(),updatedAt:Date.now()};access.relations.push(result)
  });return result
}
export function decideManagement(id:string,decision:string){
  const principal=requestContext().principal;if(!isGlobal(principal))throw Error('Only user or Agents Manager can decide relations')
  if(!['approve','deny'].includes(decision))throw Error('Use approve or deny')
  updateStore(store=>{const access=store.access??=emptyAccess(),relation=access.relations.find(r=>r.id===id);if(!relation||relation.state!=='pending')throw Error('Pending relation not found');if(decision==='deny')access.relations=access.relations.filter(r=>r!==relation);else Object.assign(relation,{state:'active',approvedBy:principal,updatedAt:Date.now()})});return {id,decision}
}
export function unbindManagement(id:string){
  const principal=requestContext().principal
  updateStore(store=>{const access=store.access??=emptyAccess(),relation=access.relations.find(r=>r.id===id);if(!relation)throw Error('Relation not found');if(!isGlobal(principal)&&(principal.kind!=='agent'||relation.managerId!==principal.employeeId))throw Error('Cannot remove another Manager relation');access.relations=access.relations.filter(r=>r.id!==id)});return {removed:true,id}
}
export function setManagementRole(id:string,role:ManagementRole){
  if(!isGlobal(requestContext().principal))throw Error('Role assignment requires user or Agents Manager')
  if(!['employee','manager'].includes(role))throw Error('Use employee or manager')
  updateStore(store=>{const card=store.sessions.find(c=>c.id===id&&!c.deleting);if(!card)throw Error('Unknown employee');assertManagementKind({...card,managementRole:role},!!store.access?.globalManagerIds.includes(id));card.managementRole=role;ensureEmployeeBootstrap(card,store)});return {id,managementRole:role}
}
export function setGlobalManager(id:string,enabled:boolean){
  if(requestContext().principal.kind!=='operator')throw Error('Only the user can grant global authority')
  updateStore(store=>{const card=store.sessions.find(c=>c.id===id&&!c.deleting);if(!card)throw Error('Unknown employee');assertManagementKind(card,enabled);const access=store.access??=emptyAccess();access.globalGrants??={};const existed=access.globalManagerIds.includes(id);access.globalManagerIds=access.globalManagerIds.filter(value=>value!==id);if(enabled){access.globalManagerIds.push(id);if(!existed)access.globalGrants[id]=randomUUID()}else delete access.globalGrants[id];ensureEmployeeBootstrap(card,store)});return {id,globalManager:enabled}
}
export function creationAuthority(principal:PrincipalRef){return {managementRole:'employee' as const,createdBy:principal}}

export function relayoutManagement(team:string){
  authorize('management.relayout',{team})
  const store=updateStore(value=>{applyManagementLayout(value,team)})
  return {team,bounds:store.rooms?.[team]?.bounds,revision:store.revision}
}
