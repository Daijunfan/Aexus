import {readStore,updateStore} from './store'
import {operatorContext,withCaller} from './authorization'
import {withInitializer,pendingInitialization,readyInitialization} from './initialization-state'
import {initializationPrompt,ensureEmployeeBootstrap} from './plugins/documents'
import {runPrivateInitialization} from './sessions'
import {EFFORT_LEVELS,type EmployeeInitialization,type EffortLevel} from '../shared/types'
import {isSupervisor} from '../shared/roles'

// Small in-process queue: persistence stays in the existing employee record.
const queued=new Set<string>()
const active=new Map<string,{controller:AbortController;done:Promise<void>}>()
const CONCURRENCY=2,TIMEOUT_MS=180000
let started=false,stopping=false
const needsInitialization=(card:ReturnType<typeof readStore>['sessions'][number],store:ReturnType<typeof readStore>)=>isSupervisor(card.managementRole)
function save(id:string,attemptId:string,patch:Partial<EmployeeInitialization>){
  const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
  if(!card||card.initialization?.attemptId!==attemptId)return false
  updateStore(store=>{const current=store.sessions.find(card=>card.id===id)!;current.initialization={...current.initialization!,...patch}})
  return true
}
export function queueEmployeeInitialization(id:string){
  const store=readStore(),card=store.sessions.find(card=>card.id===id&&!card.deleting)
  if(card?.initialization?.status==='pending'&&needsInitialization(card,store))queued.add(id)
  if(started&&!stopping)setImmediate(drain)
}
export function retryEmployeeInitialization(id:string,options:{model?:string;effort?:EffortLevel}={}){
  const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
  if(!card)throw Error('Unknown employee')
  if(!isSupervisor(card.managementRole)){
    if(card.initialization?.status!=='ready')updateStore(store=>{store.sessions.find(value=>value.id===id)!.initialization=readyInitialization()})
    return {id,initialization:readStore().sessions.find(value=>value.id===id)!.initialization}
  }
  if(!card.initialization||card.initialization.status==='ready')return {id,initialization:card.initialization??{status:'ready'}}
  if(options.model!==undefined&&(typeof options.model!=='string'||!options.model.trim()))throw Error('model must be a model ID')
  if(options.effort!==undefined&&!EFFORT_LEVELS.some(level=>level.value===options.effort))throw Error('Invalid effort')
  if(card.initialization.status==='failed')updateStore(store=>{const current=store.sessions.find(card=>card.id===id)!;if(options.model!==undefined)current.model=options.model.trim();if(options.effort!==undefined)current.effort=options.effort;current.initialization=pendingInitialization()})
  queueEmployeeInitialization(id)
  return {id,initialization:readStore().sessions.find(card=>card.id===id)!.initialization}
}
function drain(){
  if(!started||stopping)return
  for(const id of queued){
    if(active.size>=CONCURRENCY)return
    queued.delete(id)
    if(active.has(id))continue
    const store=readStore(),card=store.sessions.find(card=>card.id===id&&!card.deleting)
    if(card?.initialization?.status!=='pending'||!needsInitialization(card,store))continue
    const attempt=card.initialization.attemptId,controller=new AbortController()
    const timer=setTimeout(()=>controller.abort(Error('初始化超时，请检查引擎连接后重试。')),TIMEOUT_MS)
    const done=Promise.resolve().then(()=>withCaller(operatorContext(),()=>withInitializer(id,async()=>{
      if(!save(id,attempt,{status:'running',startedAt:Date.now(),error:undefined}))return
      try{
        const latest=readStore(),employee=latest.sessions.find(card=>card.id===id)!
        ensureEmployeeBootstrap(employee,latest)
        await runPrivateInitialization(id,initializationPrompt(employee,latest),controller.signal)
        controller.signal.throwIfAborted()
        save(id,attempt,{status:'ready',finishedAt:Date.now(),error:undefined})
      }catch(error){
        save(id,attempt,{status:'failed',finishedAt:Date.now(),error:String((error as Error)?.message??error).slice(0,600)})
      }
    }))).catch(error=>console.error('[employee initialization]',id,String(error))).finally(()=>{clearTimeout(timer);active.delete(id);setImmediate(drain)})
    active.set(id,{controller,done})
  }
}
/** Pending jobs never started may resume; interrupted running jobs need an explicit retry. */
export function startInitializations(){
  started=true;stopping=false
  let store=readStore()
  if(store.sessions.some(card=>card.initialization&&!needsInitialization(card,store)&&card.initialization.status!=='ready'))store=updateStore(current=>{for(const card of current.sessions)if(card.initialization&&!needsInitialization(card,current))card.initialization=readyInitialization()})
  for(const card of store.sessions){
    if(card.deleting)continue
    if(card.initialization?.status==='running')save(card.id,card.initialization.attemptId,{status:'failed',finishedAt:Date.now(),error:'上次初始化被应用退出中断，请重试初始化。'})
    else if(card.initialization?.status==='pending'&&needsInitialization(card,store))queued.add(card.id)
  }
  setImmediate(drain)
}
export async function cancelEmployeeInitialization(id:string){
  queued.delete(id)
  const job=active.get(id)
  if(job){job.controller.abort(Error('初始化已取消。'));await job.done}
}
export async function stopInitializations(){
  stopping=true;started=false;queued.clear()
  for(const job of active.values())job.controller.abort(Error('应用已退出，初始化未完成，请重试。'))
  await Promise.allSettled([...active.values()].map(job=>job.done))
}
