// Durable group outbox: one recipient/one native turn at a time.
// A Core restart marks accepted-but-unconfirmed sends for review, never replay.
const store=require('./collaboration-store.cjs');
const journal=require('./session-journal.cjs');
const groups=require('./collaboration.cjs');
const agents=require('./agent-sessions.cjs');
const occupancy=require('./agent-occupancy.cjs');
const taskService=require('./agent-task-service.cjs');
const inflight=new Set();
let timer=null,unsubscribe=null,draining=false;
function permitted(row){
 const group=groups.get({id:row.groupId});
 if(group.archived||!group.memberIds.includes(row.agentId))throw Error('Recipient was removed or group archived');
 const mute=group.mutes?.[row.agentId];
 if(mute===null||typeof mute==='number'&&mute>Date.now())throw Error('Recipient is muted');
 return group;
}
function taskContext(row,group,staged=[]){
 const item=row.message,quoted=item.replyTo?store.find(row.groupId,item.replyTo):null;
 const context={groupId:row.groupId,groupName:group.name,messageId:item.id,recipientId:row.agentId,
  sender:item.author.name,replyTo:item.replyTo||null,quotedText:quoted?.text?.slice(0,1600)||null,memberIds:group.memberIds,attachments:staged};
 // A reply/mention without prior public discussion would force every recipient
 // to infer the team's shared decisions from one isolated message. Bind the
 // snapshot to the target sequence: do not leak later or private native turns.
 const prior=store.contextBefore(row.groupId,item.sequence);
 return '[CloudHosts group task]\n'+JSON.stringify(context)+
  '\n\n[Prior published group discussion — oldest to newest]\n'+JSON.stringify(prior)+
  '\n\n[Current group message]\n'+item.text+
  '\n\n[Group publication]\nYou can call cloud_group_reply with the original messageId to publish a precise shared result. Otherwise the final native answer is published to the shared group if its Auto-publish setting is enabled. Do not include private credentials in a public group answer.';
}
async function deliver(row){
 const key=row.messageId+':'+row.agentId;
 if(inflight.has(key))return;
 inflight.add(key);
 try{
  let group;
  try{group=permitted(row)}catch(error){store.change(row.messageId,row.agentId,['pending'],{status:'failed',error:error.message});return}
  let role=agents.sessions().find(item=>item.id===row.agentId);
  if(!role){store.change(row.messageId,row.agentId,['pending'],{status:'failed',error:'Agent identity is missing'});return}
  if(!['codex','claude','pi','cline','opencode'].includes(role.engine)||!['native','pty'].includes(role.transport)){
   store.change(row.messageId,row.agentId,['pending'],{status:'failed',error:'No structured native execution protocol for '+role.engine});return;
  }
  if(role.busy||agents.sessions().some(other=>other.id!==role.id&&other.busy&&other.targetHostId===role.targetHostId&&other.cwd===role.cwd))return;
  if(occupancy.occupied({agentId:role.id,hostId:role.targetHostId,directory:role.cwd}))return;
  const owner='group:'+key;
  try{occupancy.acquire({agentId:role.id,hostId:role.targetHostId,directory:role.cwd,owner})}catch{return}
  // Claims are durable before native activation or any model submission.
  if(!store.change(row.messageId,row.agentId,['pending'],{status:'routing'})){occupancy.release(owner);return}
  try{
   const {accepted,agent:current}=await taskService.submit({role,
    scope:{source:'group',groupId:row.groupId,messageId:row.messageId,agentId:role.id},
    authorize:()=>permitted(row),
    prepare:async current=>{
     const staged=await require('./collaboration-attachments.cjs').stage(row.message,current);
     return taskContext(row,permitted(row),staged);
    }
   });
   if(!accepted?.turnId)throw Error('Native turn accepted without a verifiable ID; review before retry');
   store.change(row.messageId,row.agentId,['routing','running'],{status:'submitted',turn_id:accepted.turnId});
   // Native completion may precede the send acknowledgment on a fast test turn.
   const end=taskService.finishedTurn(current.id,accepted.turnId);
   if(end)settle(end);
  }catch(error){store.change(row.messageId,row.agentId,['routing'],{status:'needs_review',error:error.message});occupancy.release(owner)}
 }finally{inflight.delete(key)}
}
async function drain(){
 if(draining)return;
 draining=true;
 try{
  // No global blocking: independently addressed sessions may work in parallel.
  await Promise.all(store.pending(35).map(row=>deliver(row)));
 }finally{draining=false}
}
function kick(){void drain().catch(error=>console.error('Group outbox:',error.message))}
function settle(event){
 if(event.kind!=='turn'||event.status==='running'||!event.turnId)return;
 const rows=store.byTurn(event.sessionId,event.turnId);
 for(const row of rows){
  occupancy.release('group:'+row.message_id+':'+row.agent_id);
  const answer=taskService.finalAnswer(event.sessionId,event.turnId);
  // Existing groups retain their previous private-answer policy until enabled.
  let autoPublish=false;
  try{autoPublish=groups.get({id:row.groupId}).autoPublishReplies===true}catch{}
  const outcome=event.status==='completed'?(autoPublish?'awaiting_reply':'completed'):
   event.status==='interrupted'?'interrupted':'failed';
  // Exact-turn completion never overwrites a prior explicit tool publication.
  const updated=store.change(row.message_id,row.agent_id,['submitted','running','awaiting_reply','needs_review'],{
   status:outcome,result_text:answer.slice(0,16000),error:event.status==='completed'?null:event.text||'Native turn failed',
   completed_at:event.time});
  if(updated?.status==='awaiting_reply'&&answer.trim()&&autoPublish){
   try{groups.postFromTool({groupId:row.groupId,messageId:row.message_id,agentId:row.agent_id,turnId:event.turnId},
    {replyTo:row.message_id,text:answer.trim().slice(0,16000)});
   }catch(error){store.change(row.message_id,row.agent_id,['awaiting_reply'],{
    error:'Native answer could not be posted to the group: '+error.message});}
  }
 }
 kick();
}
function start(){
 if(timer)return;
 const unfinished=store.active().filter(row=>row.turn_id&&
  ['routing','submitted','running','awaiting_reply'].includes(row.status));
 store.recover();unsubscribe=journal.subscribe(settle);
 timer=setInterval(kick,1500);timer.unref?.();
 // Reconcile only proven terminal native events; never repeat a model prompt.
 for(const row of unfinished){
  try{
   const terminal=taskService.finishedTurn(row.agent_id,row.turn_id);
   if(terminal)settle(terminal);
  }catch(error){console.error('CloudHosts exact-turn reconciliation:',error.message)}
 }
 kick();
}
function stop(){clearInterval(timer);timer=null;unsubscribe?.();unsubscribe=null}
module.exports={start,stop,kick,settle,taskContext};
