// Shared human approval gate for CloudHosts API side effects.
// Uses the existing per-Agent approval UI; a pending write blocks its own tool call.
const {randomUUID}=require('node:crypto');
function changed(client,event){
 if(typeof client.status==='function')client.status(event==='approval'?'approval':client.busy?'busy':'idle');
 else if(typeof client.changed==='function')client.changed();
 require('./core-events.cjs').publish('approval',{agentId:client.role.id,turnId:client.toolScope?.turnId||client.active?.id});
}
function remove(client,id,reason){
 const data=client.apiApprovalCallbacks?.get(id);
 if(!data)return false;
 clearTimeout(data.timer);client.apiApprovalCallbacks.delete(id);client.approvals.delete(id);
 if(typeof client.emit==='function'){
  if(client.role.engine==='codex')client.emit({kind:'approval-resolved',requestId:id});
  else client.emit('approval-resolved','',{turnId:data.turnId,requestId:id});
 }
 changed(client,'resolved');
 if(reason)data.reject(Error(reason));else data.resolve(true);
 return true;
}
function request(client,{command,args,turnId}){
 if(!client.busy||client.dead||client.toolScope?.turnId!==turnId)throw Error('Execution turn is no longer active');
 if(client.role.permission&&!['ask','full'].includes(client.role.permission))throw Error('This native permission mode cannot approve API writes');
 const id='api_approval_'+randomUUID(),request={id,method:'cloud_api/approval',engine:'cloud_api',turnId,
  detail:{title:'CloudHosts API: '+command},params:{title:'CloudHosts API: '+command,command,args,availableDecisions:['accept','decline']}};
 client.apiApprovalCallbacks??=new Map();
 const promise=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>remove(client,id,'CloudHosts API approval expired'),180000);timer.unref?.();
  client.apiApprovalCallbacks.set(id,{resolve,reject,timer,turnId});
 });
 client.approvals.set(id,request);
 if(client.role.engine==='codex')client.emit({kind:'approval',requestId:id,method:request.method,params:request.params});
 else client.emit('approval',JSON.stringify({id,name:command}),{turnId,requestId:id});
 changed(client,'approval');
 return promise;
}
function respond(client,{requestId,decision}){
 const data=client.apiApprovalCallbacks?.get(requestId);
 if(!data)return false;
 if(!['accept','decline','cancel'].includes(decision))throw Error('Choose accept or decline');
 if(!client.busy||client.toolScope?.turnId!==data.turnId){remove(client,requestId,'Native turn changed');throw Error('Approval belongs to a finished native turn')}
 remove(client,requestId,decision==='accept'?null:'User declined the CloudHosts API command');
 return true;
}
function abort(client){
 for(const id of [...client.apiApprovalCallbacks?.keys()||[]])remove(client,id,'Native Agent turn ended before approval');
}
module.exports={request,respond,abort};
