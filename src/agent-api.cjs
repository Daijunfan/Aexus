// Aexus-style discovery and invocation bound to a CloudHosts native turn.
// No caller-supplied identity or permission override is ever accepted.
const {createHash}=require('node:crypto');
const contracts=require('./api-contracts.cjs'),plugins=require('./plugins.cjs');
const agents=require('./agent-sessions.cjs'),company=require('./company.cjs');
const groups=require('./collaboration.cjs'),plans=require('./plan-scheduler.cjs');
const sql=()=>require('./collaboration-store.cjs').connection();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function identity(native,proof={}){
 const s=native.toolScope,role=native.role;
 if(!role||native.dead||!native.busy||!s||!s.turnId||s.agentId!==role.id||
  proof.threadId&&proof.threadId!==(native.threadId||role.threadId)||
  proof.turnId&&proof.turnId!==s.turnId)throw Error('An active, authenticated native Agent turn is required');
 if(!['private','message','group','company','plan','delegation'].includes(s.source))throw Error('Unknown TaskContext source');
 const current=agents.sessions().find(x=>x.id===role.id);
 if(!current||current.engine!==role.engine||current.targetHostId!==role.targetHostId||
   current.engineHostId!==role.engineHostId)throw Error('Persistent Agent identity changed');
 const companyRole=company.roster().find(x=>x.id===role.id)?.companyRole||'worker';
 const teams=company.teams().filter(x=>x.memberIds.includes(role.id))
  .map(x=>({id:x.id,memberIds:[...x.memberIds].sort()}));
 const memberships=groups.list({includeArchived:true}).filter(x=>x.memberIds.includes(role.id))
  .map(x=>({id:x.id,ownerId:x.ownerId,adminIds:x.adminIds,muted:x.mutes?.[role.id]||null,archived:x.archived}));
 const channelGrants=require('./channels.cjs').grantSnapshot(role.id);
 const grantVersion=hash([role.id,companyRole,require('./company-policy.cjs').VERSION,teams,memberships,channelGrants,plugins.version(role.id)]);
 return {agentId:role.id,name:current.name||role.name,role:companyRole,grantVersion,
  source:s.source,turnId:s.turnId,taskId:s.taskId||null,groupId:s.groupId||null,messageId:s.messageId||null,
  hostId:current.targetHostId,workspace:current.cwd,engine:current.engine,permission:current.permission==='full'&&role.permission==='full'?'full':'ask'};
}
function documents(native,{operation,command,document,search='',prefix='',agentOnly=false}={},proof={}){
 const who=identity(native,proof);
 if(!['identity','index','search','describe','document'].includes(operation))throw Error('Choose identity, index, search, describe or document');
 if(operation==='identity'){
  const grants=company.teams().filter(x=>x.memberIds.includes(who.agentId)).map(x=>({id:x.id,name:x.name}));
  const actor={kind:'agent',agentId:who.agentId},roster=company.roster();
  const actionTargets=Object.fromEntries(['read','delegate','schedule','configure'].map(action=>
   [action,roster.filter(x=>company.canManage(actor,x.id,action)).map(x=>x.id)]));
  const managed=actionTargets.delegate.filter(id=>id!==who.agentId);
  return {...who,teams:grants,managedAgentIds:managed,management:{scope:require('./company-policy.cjs').policy(who.role).scope,actionTargets},
   plugins:plugins.list({agentId:who.agentId}),api:{...contracts.metadata(),pluginSchemaHash:plugins.version(who.agentId)}};
 }
 if(operation==='index')return {...contracts.document('index'),api:contracts.metadata()};
 if(operation==='search')return {commands:[...contracts.list({prefix,search,agentOnly:agentOnly===true}),
  ...plugins.catalog(who.agentId,{prefix,search,agentOnly:agentOnly===true})],api:contracts.metadata(),pluginSchemaHash:plugins.version(who.agentId)};
 if(operation==='describe')return typeof command==='string'&&command.startsWith('plugin.')?plugins.describe(command,who.agentId):contracts.describe(command);
 if(typeof document==='string'&&document.startsWith('plugin/'))return {...plugins.document(document,who.agentId),api:contracts.metadata()};
 return {...contracts.document(document),api:contracts.metadata()};
}
function groupVisible(agentId,groupId){
 const group=groups.get({id:groupId});
 if(group.archived||!group.memberIds.includes(agentId))throw Error('Group is unavailable to this Agent');
 return group;
}
function subordinate(who,agentId,action='delegate'){
 if(!company.canManage({kind:'agent',agentId:who.agentId},agentId,action))throw Error('Agent target is outside management scope');
}
function groupInvite(who,agentId){
 if(!company.canCollaborate({kind:'agent',agentId:who.agentId},agentId))throw Error('Group invitation is outside shared team scope');
}
function groupManage(who,id){
 const group=groupVisible(who.agentId,id);
 if(group.ownerId!==who.agentId&&!group.adminIds?.includes(who.agentId))throw Error('Group Owner or Admin membership is required');
 return group;
}
function planVisible(who,item){
 return item.createdBy==='agent:'+who.agentId||item.action?.type==='agent'&&item.action.agentId===who.agentId||
  item.action?.groupId&&groups.list().some(x=>x.id===item.action.groupId&&x.memberIds.includes(who.agentId));
}
function planOwner(who,id){
 const item=plans.get({id});
 if(item.createdBy!=='agent:'+who.agentId)throw Error('Plan mutation requires its original Agent creator');
 if(item.action?.type==='agent'&&item.action.agentId)subordinate(who,item.action.agentId,'schedule');
 if(item.action?.groupId)groupVisible(who.agentId,item.action.groupId);
 return item;
}
function authorize(who,command,args){
 if(command.startsWith('messages.')){
  if(['messages.list','messages.create'].includes(command)){
   if(command==='messages.create')for(const id of args.memberIds||[])groupInvite(who,id);
   return;
  }
  const group=command==='messages.update'?groupManage(who,args.id):groupVisible(who.agentId,args.id);
  if(command==='messages.update'){
   if(args.memberIds&&!args.memberIds.includes(who.agentId))throw Error('A group editor cannot remove their own membership');
   if(args.memberIds)for(const id of args.memberIds)if(!group.memberIds.includes(id))groupInvite(who,id);
  }
  if(command==='messages.publish'){
   if(group.mutes?.[who.agentId]===null||typeof group.mutes?.[who.agentId]==='number'&&group.mutes[who.agentId]>Date.now())throw Error('Agent is muted');
  }
  return;
 }
 if(command.startsWith('company.')){
  if(command==='company.createTeam'){
   if(!['manager','coordinator','administrator'].includes(who.role))throw Error('Team creation requires a manager or coordinator grant');
   for(const id of args.memberIds||[])subordinate(who,id);
  }else if(command==='company.updateTeam'){
   const team=company.teams().find(x=>x.id===args.id);
   if(!team||who.role==='manager'&&!team.memberIds.includes(who.agentId)||!['manager','coordinator','administrator'].includes(who.role))
    throw Error('Team management is outside this Agent scope');
   if(args.memberIds){
    if(team.memberIds.includes(who.agentId)&&!args.memberIds.includes(who.agentId))throw Error('Team editor cannot remove their own membership');
    const previous=new Set(team.memberIds),next=new Set(args.memberIds);
    for(const id of new Set([...previous,...next]))if(id!==who.agentId&&previous.has(id)!==next.has(id))
     subordinate(who,id,'teamMembership');
   }
  }else if(command==='company.delegate')subordinate(who,args.agentId);
  else if(command==='company.task'){
   const item=company.task(args);if(item.agentId!==who.agentId&&item.requestedBy!=='agent:'+who.agentId)throw Error('Delegation is private to its participants');
  }else if(command==='company.tasks'&&args.agentId&&args.agentId!==who.agentId)throw Error('Only your own delegation index is visible');
  }
 if(command.startsWith('channel.')){
  require('./channels.cjs').authorize(command,args,{kind:'agent',agentId:who.agentId,role:who.role});return;
 }
 if(command.startsWith('plan.')){
  if(['plan.get','plan.update','plan.archive'].includes(command)){
   if(command==='plan.get'&&!planVisible(who,plans.get({id:args.id})))throw Error('Plan is outside this Agent scope');
   if(command!=='plan.get')planOwner(who,args.id);
  }
  if(command==='plan.create'){
   if(args.action.type!=='agent'||args.action.mode!=='resume')throw Error('Agent Plans require the exact existing session');
   subordinate(who,args.action.agentId,'schedule');
   if(args.action.groupId)groupVisible(who.agentId,args.action.groupId);
  }
  if(command==='plan.update'&&args.patch.action){
   const action=args.patch.action;if(action.type!=='agent'||action.mode!=='resume')throw Error('Agent Plan must resume an exact authorized session');
   subordinate(who,action.agentId,'schedule');
   if(action.groupId)groupVisible(who.agentId,action.groupId);
  }
 }
}
function project(who,command,result,args){
 if(command==='company.roster')return result.filter(x=>company.canManage({kind:'agent',agentId:who.agentId},x.id,'read'))
  .map(x=>({id:x.id,name:x.name,engine:x.engine,targetHostId:x.targetHostId,engineHostId:x.engineHostId,companyRole:x.companyRole,teamIds:x.teamIds}));
 if(command==='company.teams')return result.filter(x=>x.memberIds.includes(who.agentId)||
  ['coordinator','administrator'].includes(who.role)&&x.memberIds.some(id=>company.canManage({kind:'agent',agentId:who.agentId},id,'read')));
 if(command==='company.bindings')return result.filter(x=>x.managerId===who.agentId||x.employeeId===who.agentId);
 if(command==='company.tasks')return company.tasks({agentId:who.agentId,limit:args.limit||100});
 if(command==='messages.list')return result.filter(x=>x.memberIds.includes(who.agentId));
 if(command==='plan.list')return result.filter(x=>planVisible(who,x));
 if(command==='plan.query')return plans.query(args,row=>planVisible(who,row),who.agentId);
 if(command==='plan.history'){const permitted=new Set(plans.list({includeArchived:true}).filter(x=>planVisible(who,x)).map(x=>x.id));return result.filter(x=>permitted.has(x.jobId));}
 return result;
}
function journal(){
 const db=sql();
 db.exec("CREATE TABLE IF NOT EXISTS agent_api_calls (id TEXT PRIMARY KEY,agent_id TEXT NOT NULL,turn_id TEXT NOT NULL,command TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,result_json TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);");
 return db;
}
function claim(who,callId,command,args){
 const db=journal(),key='api_'+hash([who.agentId,who.turnId,callId]),fingerprint=hash([command,args]);
 const row=db.prepare('SELECT * FROM agent_api_calls WHERE id=?').get(key);
 if(row){if(row.fingerprint!==fingerprint)throw Error('Tool call ID reused with different arguments');
  if(row.state==='completed')return {cached:JSON.parse(row.result_json)};
  throw Error('This API call has an uncertain or failed execution; inspect the referenced object before retrying');
 }
 const stamp=new Date().toISOString();
 db.prepare('INSERT INTO agent_api_calls(id,agent_id,turn_id,command,fingerprint,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(key,who.agentId,who.turnId,command,fingerprint,'claimed',stamp,stamp);
 return {key};
}
function complete(key,state,output){
 const db=journal();
 db.prepare('UPDATE agent_api_calls SET state=?,result_json=?,error=?,updated_at=? WHERE id=?')
  .run(state,state==='completed'?JSON.stringify(output):null,state==='completed'?null:String(output).slice(0,1000),new Date().toISOString(),key);
}
async function invoke(native,{command,args={}}={},callId,proof={}){
 const who=identity(native,proof);
 if(typeof command!=='string'||!command||command.length>120||!args||typeof args!=='object'||Array.isArray(args))throw Error('Provide command and object args');
 const method=contracts.resolve(command),pluginMethod=method.startsWith('plugin.');
 const definition=pluginMethod?plugins.describe(method,who.agentId):contracts.lookup(method);
 if(!definition||!definition.agentCallable)throw Error('Command is unavailable to this Agent: '+command);
 contracts.validate(definition.inputSchema,args);
 if(!pluginMethod)authorize(who,method,args);
 const write=definition.effect!=='read';
 if(write&&who.permission!=='full'){
  if(typeof native.approveApi!=='function')throw Error('CloudHosts API write approval is unavailable in this native session');
  await native.approveApi({command:method,args,turnId:who.turnId});
  const latest=identity(native,proof);
  if(latest.agentId!==who.agentId||latest.turnId!==who.turnId)throw Error('Agent turn changed during approval');
  if(latest.grantVersion!==who.grantVersion)throw Error('Agent grants changed during approval; recheck the task before retrying');
  if(pluginMethod)plugins.describe(method,latest.agentId);
  else authorize(latest,method,args);
 }
 const claimed=write?claim(who,callId,method,args):null;
 if(claimed?.cached)return claimed.cached;
 try{
  let result;
  if(pluginMethod){
   result=await plugins.call({command:method,args,agentId:who.agentId});
  }else if(method==='company.delegate'){
   result=company.agentDelegate(who.agentId,{...args,clientTaskId:args.clientTaskId||'api:'+hash([who.agentId,who.turnId,callId]),
    parentTaskId:who.source==='company'?who.taskId||undefined:undefined,
    sourceKind:who.source==='private'?'message':who.source==='delegation'?'company':who.source,
    sourceId:who.messageId||who.taskId||who.turnId});
  }else if(method==='company.createTeam'){
   result=company.createTeam({...args,memberIds:[who.agentId,...(args.memberIds||[]).filter(x=>x!==who.agentId)]});
  }else if(method==='messages.create'){
   result=groups.create({...args,memberIds:[who.agentId,...(args.memberIds||[]).filter(x=>x!==who.agentId)]});
  }else if(method==='messages.publish'){
   result=groups.post({...args,kind:args.kind||'result',clientMessageId:args.clientMessageId||'api:'+hash([who.agentId,who.turnId,callId]),
    mentions:[]},{kind:'agent',id:who.agentId,name:who.name});
  }else if(method==='plan.create'){
   result=plans.create({...args,createdBy:'agent:'+who.agentId,
    clientRequestId:args.clientRequestId||'api_'+hash([who.agentId,who.turnId,callId]).slice(0,36)});
  }else if(['plan.views','plan.view-create','plan.view-update','plan.view-delete'].includes(method)){
   const viewMethods={'plan.views':'list','plan.view-create':'create','plan.view-update':'update','plan.view-delete':'remove'};
   result=require('./plan-views.cjs')[viewMethods[method]](args,{kind:'agent',agentId:who.agentId,role:who.role});
  }else if(method.startsWith('channel.')){
   result=require('./channels.cjs').dispatch(method,args,{kind:'agent',agentId:who.agentId,role:who.role});
  }else if(method==='plan.query'){
   result=project(who,method,null,args);
  }else{
   result=await require('./core.cjs').dispatch(method,args);
   result=project(who,method,result,args);
  }
  contracts.validate(definition.outputSchema,result,'result');
  const output={ok:true,command:method,data:result};
  if(claimed?.key)complete(claimed.key,'completed',output);
  return output;
 }catch(error){
  if(claimed?.key)complete(claimed.key,'failed',error.message);
  throw error;
 }
}
module.exports={identity,documents,invoke,authorize};
