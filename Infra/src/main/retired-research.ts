/**
 * One-way cleanup of retired Deep Research workflows.
 * This belongs to Infra: it is intentionally independent of the deleted Engine
 * runtime and never creates employees, sends prompts or deletes employee history.
 *
 * Only a positively identified native turn may be interrupted. If a receipt is
 * uncertain, leave the workflow in controlPending until the owner retries.
 */
type NativeTask={
 status?:string;employeeId?:string;prompt?:string;
 receipt?:{messageId?:string;sent?:boolean};transportUncertain?:boolean;
}
type RetiredState={workers?:{id?:string}[];tasks?:Record<string,NativeTask>;attention?:unknown}
type Call=(command:string,args:Record<string,unknown>)=>Promise<any>
const running=(status:any)=>!!(status?.busy||status?.acknowledging||status?.waitingApproval)
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))
const safeEmployee=(id:unknown):id is string=>typeof id==='string'&&/^[\w-]{3,120}$/.test(id)

export async function stopRetiredResearch(state:RetiredState,call:Call){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Saved research state is invalid; original record preserved')
 const workers=new Set((state.workers??[]).map(item=>item.id).filter(safeEmployee))
 const tasks=Object.values(state.tasks??{}).filter(task=>task&&task.status!=='completed')
 for(const task of tasks){
  if(!safeEmployee(task.employeeId)||!workers.has(task.employeeId))throw Error('Research worker identity cannot be verified; no unrelated Agent was stopped')
  const employee=task.employeeId
  const current=async()=>{const value=await call('session.status',{employee});return Array.isArray(value)?value[0]:undefined}
  let status=await current()
  if(!status){task.status='cancelled';continue} // The original employee no longer exists.
  let messageId=task.receipt?.messageId
  if(!messageId&&typeof task.prompt==='string'&&task.prompt){
   const history=await call('session.transcript',{employee})
   const matches=[...new Set<string>((history?.shown??history?.items??[])
    .filter((item:any)=>item?.role==='user'&&item.text===task.prompt&&typeof item.outbound?.taskId==='string')
    .map((item:any)=>String(item.outbound.taskId)))]
   if(matches.length>1)throw Error('Multiple matching research receipts; review the original native session before retrying')
   if(matches.length===1){messageId=matches[0];task.receipt={sent:true,messageId}}
  }
  // An owned native turn can still be in a queue after the transport accepts
  // its message. Remove only an exact matching queued prompt; never clear the
  // worker's unrelated queue or claim a pending turn has been interrupted.
  if(status.sessionId&&typeof task.prompt==='string'&&task.prompt){
   const queue=await call('session.queue',{id:status.sessionId})
   if(!Array.isArray(queue))throw Error('Cannot inspect the Agent pending queue before stopping')
   const owned=queue.filter((item:any)=>item?.text===task.prompt)
   if(owned.length>1)throw Error('Multiple matching queued research messages; manual reconciliation required')
   if(owned.length===1){
    const queued=owned[0]
    if(typeof queued.id!=='string'||!queued.id)throw Error('Queued research message has no verifiable queue ID')
    await call('session.dequeue',{id:status.sessionId,messageId:queued.id})
    task.status='cancelled';continue
   }
  }
  if(running(status)){
   const active=status.currentTask?.messageId
   if(!messageId||!active){
    // A never-sent queued step cannot own a running turn. Any other missing
    // receipt is ambiguous and must fail closed rather than claim success.
    if(task.status==='queued'&&!task.transportUncertain){task.status='cancelled';continue}
    throw Error('Active research Agent has an uncertain native receipt; retry after checking Infra')
   }
   if(messageId&&active===messageId){
    await call('session.interrupt',{employee,expectedMessageId:messageId})
    const deadline=Date.now()+10000
    while(true){
     status=await current()
     if(!status||!running(status)||status.currentTask?.messageId&&status.currentTask.messageId!==messageId)break
     if(Date.now()>=deadline)throw Error('Research Agent did not confirm that its owned task stopped; retry Stop')
     await pause(150)
    }
   }
  }
  task.status='cancelled'
 }
 // Release idle native Agent processes after all owned turns are resolved. An
 // unrelated current turn, queued message or background process forbids closing
 // that session; its own work must remain intact.
 for(const employee of workers){
  const value=await call('session.status',{employee})
  const status=Array.isArray(value)?value[0]:undefined
  const sessionId=status?.sessionId
  if(!sessionId||running(status))continue
  const queue=await call('session.queue',{id:sessionId})
  const background=await call('session.background',{id:sessionId})
  if(!Array.isArray(queue)||queue.length||!Array.isArray(background?.data)||background.data.length)continue
  const fresh=await call('session.status',{employee})
  const latest=Array.isArray(fresh)?fresh[0]:undefined
  if(latest?.sessionId===sessionId&&!running(latest))await call('session.close',{id:sessionId})
 }
 state.attention=null
 return {checked:tasks.length,stopped:true}
}
