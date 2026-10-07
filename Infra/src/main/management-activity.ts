import {isSupervisor} from '../shared/roles'
import {type CurrentTask,type ManagementActivity,type ManagementInteraction,type RequestContext} from '../shared/management'
import {readStore} from './store'
import {canControl,callerEmployee,isGlobal,requestContext,validateDelegation} from './authorization'
import {connectorKey} from '../shared/connector'

const current=new Map<number,ManagementInteraction>()
const tasks=new Map<string,{task:CurrentTask;interaction:ManagementInteraction}>()
const communicationCommands=new Set(['session.send','session.enqueue','session.steer','session.interrupt','session.follow'])
let revision=0,sequence=0,emit:(snapshot:ManagementActivity)=>void=()=>{}
const snapshot=():ManagementActivity=>({revision,interactions:[...new Map([...current.values(),...Array.from(tasks.values(),value=>value.interaction)].map(value=>[connectorKey(value.managerId,value.employeeId),value])).values()].map(value=>({...value,highlighted:(highlights.get(connectorKey(value.managerId,value.employeeId))??0)>performance.now()}))})
// A short communication highlight is independent of the real task/subscription lifetime.
const HIGHLIGHT_MS=600,highlights=new Map<string,number>()
let highlightTimer:ReturnType<typeof setTimeout>|undefined
const highlight=(managerId:string,employeeId:string)=>highlights.set(connectorKey(managerId,employeeId),performance.now()+HIGHLIGHT_MS)
function changed(){
  clearTimeout(highlightTimer);highlightTimer=undefined
  const active=new Set([...current.values(),...Array.from(tasks.values(),value=>value.interaction)].map(value=>connectorKey(value.managerId,value.employeeId))),now=performance.now()
  for(const [key,until] of highlights)if(!active.has(key)||until<=now)highlights.delete(key)
  // One deadline timer, no per-frame polling or persistent state writes.
  if(highlights.size)highlightTimer=setTimeout(changed,Math.max(1,Math.min(...highlights.values())-now)).unref()
  revision++;emit(snapshot())
}
export function setManagementActivityEmitter(handler:typeof emit){emit=handler}
/** Exact engine turn lifetime and original delegation; never infer work from a creation line. */
export function setManagementTask(employeeId:string,task?:CurrentTask){
  const principal=task?.delegation.requestedBy
  if(task&&principal?.kind==='agent'&&principal.employeeId!==employeeId){
    const manager=readStore().sessions.find(card=>card.id===principal.employeeId)
    if(manager&&isSupervisor(manager.managementRole)&&canControl(principal,employeeId)){
      try{
        validateDelegation(task.delegation,employeeId)
        if(tasks.get(employeeId)?.task.messageId===task.messageId)return
        tasks.set(employeeId,{task,interaction:{managerId:principal.employeeId,employeeId,command:'session.send',kind:'task',messageId:task.messageId,requestId:task.delegation.requestId,startedAt:task.startedAt}});highlight(principal.employeeId,employeeId);changed();return
      }catch{/* Revoked delegation must not remain a visible collaboration. */}
    }
  }
  if(tasks.delete(employeeId))changed()
}
export function clearManagementInteraction(managerId:string){
  let removed=false
  for(const [key,value] of current)if(value.managerId===managerId){current.delete(key);removed=true}
  if(removed)changed()
}
export function resetManagementActivity(){clearTimeout(highlightTimer);highlightTimer=undefined;highlights.clear();current.clear();tasks.clear();revision=0;emit=()=>{}}
export function pruneManagementActivity(){
  const store=readStore()
  let removed=false
  for(const [key,value] of current){
    const id=value.managerId,manager=store.sessions.find(card=>card.id===id&&!card.deleting)
    if(!manager||!isSupervisor(manager.managementRole)||!canControl({kind:'agent',employeeId:id},value.employeeId)){current.delete(key);removed=true}
  }
  for(const [employeeId,value] of tasks){
    try{validateDelegation(value.task.delegation,employeeId)}catch{tasks.delete(employeeId);removed=true}
  }
  if(removed)changed()
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

/** Actual message/control requests and live reply subscriptions, without completed-call persistence. */
export function beginManagementInteraction(command:string,employeeId:string|undefined,context:RequestContext):()=>void{
  if(context.principal.kind!=='agent'||!communicationCommands.has(command))return ()=>{}
  const managerId=context.principal.employeeId,store=readStore(),manager=store.sessions.find(card=>card.id===managerId)
  if(!manager||!isSupervisor(manager.managementRole))return ()=>{}
  if(!employeeId||employeeId===managerId||!canControl(context.principal,employeeId))return ()=>{}
  const token=++sequence
  current.set(token,{managerId,employeeId,command,kind:'request',requestId:context.requestId,startedAt:Date.now()});highlight(managerId,employeeId);changed()
  return ()=>{if(current.delete(token))changed()}
}
