import {isSupervisor} from '../shared/roles'
import {type ManagementActivity,type ManagementInteraction,type RequestContext} from '../shared/management'
import {readStore} from './store'
import {canControl,callerEmployee,isGlobal,requestContext} from './authorization'
import {connectorKey} from '../shared/connector'

const current=new Map<string,{interaction:ManagementInteraction;token:number;timer?:ReturnType<typeof setTimeout>}>()
let revision=0,sequence=0,emit:(snapshot:ManagementActivity)=>void=()=>{}
const snapshot=():ManagementActivity=>({revision,interactions:[...current.values()].map(value=>value.interaction)})
const changed=()=>{revision++;emit(snapshot())}
export function setManagementActivityEmitter(handler:typeof emit){emit=handler}
export function clearManagementInteraction(managerId:string){
  let removed=false
  for(const [key,value] of current)if(value.interaction.managerId===managerId){clearTimeout(value.timer);current.delete(key);removed=true}
  if(removed)changed()
}
export function resetManagementActivity(){for(const value of current.values())clearTimeout(value.timer);current.clear();revision=0;emit=()=>{}}
export function pruneManagementActivity(){
  const store=readStore()
  for(const [key,value] of current){
    const id=value.interaction.managerId
    const manager=store.sessions.find(card=>card.id===id&&!card.deleting)
    if(!manager||!isSupervisor(manager.managementRole)||!canControl({kind:'agent',employeeId:id},value.interaction.employeeId)){clearTimeout(value.timer);current.delete(key);changed()}
  }
}
export function managementActivity(team?:string):ManagementActivity{
  const context=requestContext(),global=isGlobal(context.principal),caller=callerEmployee(context.principal),store=readStore()
  if(!global&&team&&team!==caller!.group)throw Error('Forbidden Team')
  if(team&&!store.groups.includes(team))throw Error('Unknown Team')
  const cards=new Map(store.sessions.filter(card=>!card.deleting).map(card=>[card.id,card]))
  return {revision,interactions:snapshot().interactions.filter(value=>{
    const from=cards.get(value.managerId),to=cards.get(value.employeeId)
    if(!from||!to||team&&(from.group!==team||to.group!==team))return false
    return global||from.group===caller!.group&&to.group===caller!.group&&(isSupervisor(caller!.managementRole)||to.id===caller!.id)
  })}
}

/** Called only after API authorization. An Agent cannot set or impersonate these indicators. */
export function beginManagementInteraction(command:string,employeeId:string|undefined,context:RequestContext):()=>void{
  if(context.principal.kind!=='agent'||command==='management.activity')return ()=>{}
  const managerId=context.principal.employeeId,store=readStore(),manager=store.sessions.find(card=>card.id===managerId)
  if(!manager||!isSupervisor(manager.managementRole))return ()=>{}
  if(!employeeId||employeeId===managerId||!canControl(context.principal,employeeId))return ()=>{}
  const key=connectorKey(managerId,employeeId)
  clearTimeout(current.get(key)?.timer)
  const token=++sequence,interaction:ManagementInteraction={managerId,employeeId,command,requestId:context.requestId,startedAt:Date.now()}
  current.set(key,{interaction,token});changed()
  return ()=>{
    const entry=current.get(key);if(!entry||entry.token!==token||entry.timer)return
    // Every recipient keeps its own short delivery pulse, including rapid fan-out.
    const duration=command==='session.send'||command==='session.enqueue'?2400:1600
    entry.interaction={...entry.interaction,expiresAt:Date.now()+duration}
    entry.timer=setTimeout(()=>{if(current.get(key)?.token===token){current.delete(key);changed()}},duration);entry.timer.unref();changed()
  }
}
