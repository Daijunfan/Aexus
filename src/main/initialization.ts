import {readStore,updateStore} from './store'
import {operatorContext,withCaller} from './authorization'
import {withInitializer,pendingInitialization} from './initialization-state'
import {initializationPrompt,ensureEmployeeBootstrap} from './plugins/documents'
import {runPrivateInitialization} from './sessions'
import {employeeInitializing,type EmployeeInitialization} from '../shared/types'

// Small in-process queue: persistence stays in the existing employee record.
const queued=new Set<string>()
const active=new Map<string,{controller:AbortController;done:Promise<void>}>()
const CONCURRENCY=2,TIMEOUT_MS=180000
let started=false,stopping=false
function save(id:string,attemptId:string,patch:Partial<EmployeeInitialization>){
  const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
  if(!card||card.initialization?.attemptId!==attemptId)return false
  updateStore(store=>{const current=store.sessions.find(card=>card.id===id)!;current.initialization={...current.initialization!,...patch}})
  return true
}
export function queueEmployeeInitialization(id:string){
  const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
  if(card?.initialization?.status==='pending')queued.add(id)
  if(started&&!stopping)setImmediate(drain)
}
export function retryEmployeeInitialization(id:string){
  const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
  if(!card)throw Error('Unknown employee')
  if(!card.initialization||card.initialization.status==='ready')return {id,initialization:card.initialization??{status:'ready'}}
  if(card.initialization.status==='failed')updateStore(store=>{store.sessions.find(card=>card.id===id)!.initialization=pendingInitialization()})
  queueEmployeeInitialization(id)
  return {id,initialization:readStore().sessions.find(card=>card.id===id)!.initialization}
}
function drain(){
  if(!started||stopping)return
  for(const id of queued){
    if(active.size>=CONCURRENCY)return
    queued.delete(id)
    if(active.has(id))continue
    const card=readStore().sessions.find(card=>card.id===id&&!card.deleting)
    if(card?.initialization?.status!=='pending')continue
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
  const store=readStore()
  for(const card of store.sessions){
    if(card.deleting)continue
    if(card.initialization?.status==='running')save(card.id,card.initialization.attemptId,{status:'failed',finishedAt:Date.now(),error:'上次初始化被应用退出中断，请重试初始化。'})
    else if(card.initialization?.status==='pending')queued.add(card.id)
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
