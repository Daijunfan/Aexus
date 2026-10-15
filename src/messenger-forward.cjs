// Adapted from Aexus message-forwarding.ts: typed, durable forward receipts.
// Sources remain canonical CloudHosts published groups/native journals. A user
// must explicitly opt into a new model turn when forwarding to a native Agent.
const {createHash}=require('node:crypto');
const store=require('./collaboration-store.cjs'),groups=require('./collaboration.cjs');
const journals=require('./session-journal.cjs'),agents=require('./agent-sessions.cjs');
const preferences=require('./messenger-state.cjs');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function db(){
 const sql=store.connection();
 sql.exec("CREATE TABLE IF NOT EXISTS messenger_forward_receipts (client_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, destination TEXT NOT NULL, destination_key TEXT NOT NULL, source_count INTEGER NOT NULL, state TEXT NOT NULL, result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);");
 return sql;
}
const stamp=()=>new Date().toISOString();
function validate(args){
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid forwarding arguments');
 const fields=['to','messages','comment','textOnly','execute','clientMessageId'];
 if(Object.keys(args).some(key=>!fields.includes(key)))throw Error('Unknown forwarding argument');
 if(!Array.isArray(args.messages)||!args.messages.length||args.messages.length>50)throw Error('Choose 1–50 source messages');
 if(typeof args.to!=='string'||!/^(group|agent|employee):[a-zA-Z0-9_-]{1,180}$/.test(args.to))throw Error('Choose a real group or native Agent destination');
 if(typeof args.clientMessageId!=='string'||!/^[a-zA-Z0-9_:-]{6,160}$/.test(args.clientMessageId))throw Error('Provide a stable forwarding request ID');
 if(args.comment!==undefined&&(typeof args.comment!=='string'||args.comment.length>16000))throw Error('Forward comment must be at most 16000 characters');
 if(args.textOnly!==undefined&&typeof args.textOnly!=='boolean'||args.execute!==undefined&&typeof args.execute!=='boolean')throw Error('Invalid forwarding options');
 for(const ref of args.messages)if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(key=>!['conversation','id'].includes(key))||
  typeof ref.id!=='string'||!ref.id)throw Error('Invalid source message reference');
 const to=preferences.normalize(args.to);
 if(to.startsWith('group:')){
  const group=groups.get({id:to.slice(6)});
  if(group.archived)throw Error('Destination group is archived');
  if(args.execute===true)throw Error('A group forward is a non-triggering note; execute is reserved for a native Agent');
 }else if(args.execute!==true)throw Error('Forwarding to a native Agent runs a new model turn; set execute:true explicitly');
 if(to.startsWith('agent:')&&args.textOnly===false)throw Error('Forwarded attachments to native Agents require an explicit File Station transfer');
 return to;
}
function receipt(key){return db().prepare('SELECT * FROM messenger_forward_receipts WHERE client_key=?').get(key)}
function update(key,state,result,error){
 db().prepare('UPDATE messenger_forward_receipts SET state=?,result_json=?,error=?,updated_at=? WHERE client_key=?')
  .run(state,result?JSON.stringify(result):null,error||null,stamp(),key);
}
function lookupStatus({clientMessageId}={}){
 if(typeof clientMessageId!=='string'||!/^[a-zA-Z0-9_:-]{6,160}$/.test(clientMessageId))throw Error('Invalid forwarding request ID');
 const saved=receipt(clientMessageId);
 if(!saved)return {clientMessageId,status:'not-found',retryable:true};
 let state=saved.state,result=saved.result_json?JSON.parse(saved.result_json):null,error=saved.error||null;
 const destination=saved.destination;
 if(destination.startsWith('group:')&&state!=='posted'){
  // This read-only reconciliation never calls a send operation.
  const row=db().prepare('SELECT id FROM messages WHERE group_id=? AND author_key=? AND client_key=?')
   .get(destination.slice(6),'operator',saved.destination_key);
  if(row){
   state='posted';result={to:destination,count:saved.source_count,status:'posted',messageId:row.id,clientMessageId};
   error=null;update(clientMessageId,state,result,null);
  }
 }
 if(destination.startsWith('agent:')&&state==='submitted'&&result?.turnId){
  const settled=require('./agent-task-service.cjs').finishedTurn(result.agentId,result.turnId);
  if(settled){
   state=settled.status==='completed'?'completed':settled.status==='interrupted'?'interrupted':'failed';
   result={...result,status:state,resultText:require('./agent-task-service.cjs').finalAnswer(result.agentId,result.turnId)};
   error=state==='completed'?null:settled.text||'Native task did not finish';
   update(clientMessageId,state,result,error);
  }
 }
 return {clientMessageId,status:state,retryable:false,
  ...(result?{result}:{}),...(error?{error}:{})};
}
async function forward(args={}){
 const to=validate(args),fingerprint=hash([to,args.messages,args.comment||'',args.textOnly!==false,args.execute===true]);
 const old=receipt(args.clientMessageId);
 if(old){if(old.fingerprint!==fingerprint)throw Error('Forward request ID reused with different content');
  const resolved=lookupStatus({clientMessageId:args.clientMessageId});
  if(['posted','submitted','completed','failed','interrupted'].includes(resolved.status)&&resolved.result)return resolved.result;
  throw Error('Forward result is uncertain. Inspect the original destination before making another request');
 }
 const selected=sources(args.messages);
 const text=[args.comment?.trim(),...selected.map(item=>'Forwarded from '+item.author+' · '+item.title+'\n'+item.text)]
  .filter(Boolean).join('\n\n——\n\n');
 if(!text||text.length>16000)throw Error('Forward content exceeds 16000 characters; select fewer messages');
 const attachments=args.textOnly===false?
  [...new Set(selected.flatMap(item=>item.attachments.map(file=>file.stationId).filter(Boolean)))]:[];
 if(attachments.length>8)throw Error('A forwarded group note supports at most eight Station attachments');
 const destAgent=to.startsWith('agent:')?agents.sessions().find(row=>row.id===to.slice(6)):null;
 if(destAgent){
  if(destAgent.busy||require('./agent-occupancy.cjs').occupied({agentId:destAgent.id,hostId:destAgent.targetHostId,directory:destAgent.cwd}))
   throw Error('Native Agent session or workspace is busy');
  if(!['codex','claude','pi','cline'].includes(destAgent.engine)||!['native','pty'].includes(destAgent.transport))
   throw Error('Native destination cannot accept a structured task');
 }
 const downstream='forward:'+hash(args.clientMessageId);
 const now=stamp();
 db().prepare('INSERT INTO messenger_forward_receipts(client_key,fingerprint,destination,destination_key,source_count,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(args.clientMessageId,fingerprint,to,downstream,selected.length,'preparing',now,now);
 try{
  if(to.startsWith('group:')){
   const sent=groups.post({id:to.slice(6),text,kind:'note',mentions:[],
    files:attachments,clientMessageId:downstream});
   const result={to,count:selected.length,status:'posted',messageId:sent.id,clientMessageId:args.clientMessageId,
    attachments:sent.attachments?.length||0};
   update(args.clientMessageId,'posted',result,null);return result;
  }
  const agentId=to.slice(6);
  let role=destAgent;
  if(role.transport==='native'&&!role.running){await agents.activate({id:role.targetHostId,session:role.id});
   role=agents.sessions().find(row=>row.id===agentId);
  }
  if(!role||role.id!==destAgent.id||role.engine!==destAgent.engine||role.targetHostId!==destAgent.targetHostId||
   role.engineHostId!==destAgent.engineHostId||role.cwd!==destAgent.cwd||role.busy)
   throw Error('Exact destination Agent changed during forwarding');
  const accepted=await agents.send({id:role.targetHostId,session:role.id,text,scope:{source:'private',agentId:role.id}});
  if(!accepted?.turnId)throw Error('Native forwarding lacks an exact turn receipt');
  const result={to,count:selected.length,status:'submitted',agentId:role.id,
   turnId:accepted.turnId,sessionId:role.id,clientMessageId:args.clientMessageId};
  update(args.clientMessageId,'submitted',result,null);return result;
 }catch(error){
  update(args.clientMessageId,'uncertain',null,error.message);
  throw error;
 }
}
module.exports={forward,lookupStatus};

function sources(refs){
 const settings=preferences.state().messages;
 return refs.map(ref=>{
  const conversation=preferences.normalize(ref.conversation);
  const source=conversation.startsWith('group:')?store.find(conversation.slice(6),ref.id):
   journals.entry({sessionId:conversation.slice(6),id:ref.id});
  if(!source||conversation.startsWith('agent:')&&!['user','assistant'].includes(source.kind)||settings[conversation+':'+ref.id]?.hidden)
   throw Error('Forwarding source message is unavailable or personally hidden');
  const agent=conversation.startsWith('agent:')?agents.sessions().find(row=>row.id===conversation.slice(6)):null;
  const title=conversation.startsWith('group:')?groups.get({id:conversation.slice(6)}).name:agent?.name||'Archived native Agent';
  return {conversation,id:ref.id,title,author:conversation.startsWith('group:')?source.author.name:
   source.kind==='user'?'You':agent?.name||'Agent',
   text:source.text,attachments:conversation.startsWith('group:')?source.attachments||[]:[]};
 });
}
