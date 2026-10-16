const company=require('./company.cjs'),agents=require('./agent-sessions.cjs');
const journal=require('./session-journal.cjs'),occupancy=require('./agent-occupancy.cjs');
const taskService=require('./agent-task-service.cjs');
const inflight=new Set();
let timer=null,unsubscribe=null,draining=false;
async function deliver(task){
 if(inflight.has(task.id))return;
 const role=agents.sessions().find(item=>item.id===task.agentId);
 if(!role){company.change(task.id,['pending'],{status:'failed',error:'Delegated Agent identity no longer exists'});return}
 if(task.requestedBy.startsWith('agent:')&&!company.canDelegate({kind:'agent',agentId:task.requestedBy.slice(6)},task.agentId)){
  company.change(task.id,['pending'],{status:'failed',error:'Delegation permission revoked'});return;
 }
 if(!['codex','claude','cline','pi','opencode'].includes(role.engine)||!['native','pty'].includes(role.transport)){
  company.change(task.id,['pending'],{status:'failed',error:'No structured native execution protocol for '+role.engine});return;
 }
 if(role.busy||occupancy.occupied({agentId:role.id,hostId:role.targetHostId,directory:role.cwd}))return;
 const owner='company:'+task.id;
 try{occupancy.acquire({agentId:role.id,hostId:role.targetHostId,directory:role.cwd,owner})}catch{return}
 inflight.add(task.id);
 try{
  if(!company.change(task.id,['pending'],{status:'routing',started_at:new Date().toISOString()}))return;
  const context={taskId:task.id,requestedBy:task.requestedBy,parentTaskId:task.parentTaskId,
   sourceKind:task.sourceKind,sourceId:task.sourceId,agentId:task.agentId};
  const prompt='[CloudHosts delegated task]\n'+JSON.stringify(context)+'\n\n'+task.text+
   '\n\n[Delegation result]\nNative task output is recorded in Company. To delegate downstream work, use cloud_api within your management scope.';
  const {accepted,agent:current}=await taskService.submit({role,
   scope:{source:'company',taskId:task.id,agentId:role.id},prepare:()=>prompt,
   authorize:()=>{if(task.requestedBy.startsWith('agent:')&&
    !company.canDelegate({kind:'agent',agentId:task.requestedBy.slice(6)},task.agentId))
    throw Error('Delegation permission revoked while preparing')}
  });
  if(!accepted?.turnId)throw Error('Native Agent accepted work without an exact turn ID');
  company.change(task.id,['routing'],{status:'submitted',turn_id:accepted.turnId});
  const ending=taskService.finishedTurn(current.id,accepted.turnId);
  if(ending)settle(ending);
 }catch(error){
  company.change(task.id,['routing'],{status:'needs_review',error:error.message});
  occupancy.release(owner);
 }finally{inflight.delete(task.id);if(company.task({id:task.id}).status!=='submitted')occupancy.release(owner)}
}
async function drain(){
 if(draining)return;
 draining=true;
 try{await Promise.all(company.pending(30).map(deliver))}
 finally{draining=false}
}
function settle(event){
 if(event.kind!=='turn'||event.status==='running'||!event.turnId)return;
 for(const task of company.byTurn(event.sessionId,event.turnId)){
  occupancy.release('company:'+task.id);
  if(task.status!=='submitted'&&task.status!=='running')continue;
  const last=taskService.finalAnswer(event.sessionId,event.turnId);
  company.change(task.id,['submitted','running'],{
   status:event.status==='completed'?'completed':event.status==='interrupted'?'interrupted':'failed',
   finished_at:event.time,result_text:last.slice(0,16000),
   error:event.status==='completed'?null:event.text||'Native turn failed'});
 }
 kick();
}
function kick(){void drain().catch(error=>console.error('Company dispatcher:',error.message))}
function start(){if(timer)return;company.recover();unsubscribe=journal.subscribe(settle);timer=setInterval(kick,2000);timer.unref?.();kick()}
function stop(){clearInterval(timer);timer=null;unsubscribe?.();unsubscribe=null}
module.exports={start,stop,kick,settle};
