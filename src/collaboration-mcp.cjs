// Scope-bound collaboration tools for existing and new Codex native threads.
// Codex 0.156.1 declares dynamicTools on thread/start only. A per-native-
// connection MCP endpoint works on exact thread/resume without changing IDs.
const http=require('node:http'),{randomBytes,createHash}=require('node:crypto');
const definitions=[
 {name:'cloud_docs',description:'Read your real Agent identity, API index, search results, one command schema or a scenario document. Read-only and valid in private, group, scheduled and delegated turns.',inputSchema:{type:'object',additionalProperties:false,required:['operation'],properties:{operation:{type:'string',enum:['identity','index','search','describe','document']},search:{type:'string'},prefix:{type:'string'},command:{type:'string'},document:{type:'string'},agentOnly:{type:'boolean'}}}},
 {name:'cloud_api',description:'Invoke one documented CloudHosts Core command as this native Agent. Search then describe with cloud_docs; every command is scoped, validated and writes require appropriate approval.',inputSchema:{type:'object',additionalProperties:false,required:['command'],properties:{command:{type:'string',minLength:1},args:{type:'object'}}}},
 {name:'cloud_reply',description:'Publish a public response only to the actual assigned group message in the current turn. Does not accept an impersonated Agent identity.',inputSchema:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string',minLength:1,maxLength:16000}}}},
 {name:'cloud_group_reply',description:'Publish the public response to the currently assigned group message. Does nothing outside an authorized group turn.',inputSchema:{type:'object',additionalProperties:false,required:['messageId','text'],properties:{messageId:{type:'string'},text:{type:'string',minLength:1,maxLength:16000}}}},
 {name:'cloud_delegate',description:'Assign a tracked subtask to an authorized subordinate Agent, preserving the original source and native recipient. Returns a task ID.',inputSchema:{type:'object',additionalProperties:false,required:['agentId','text'],properties:{agentId:{type:'string'},text:{type:'string',minLength:1,maxLength:16000},clientTaskId:{type:'string'}}}},
 {name:'cloud_task_status',description:'Read only a delegation you initiated or one assigned to you, including its native result.',inputSchema:{type:'object',additionalProperties:false,required:['taskId'],properties:{taskId:{type:'string'}}}},
 {name:'cloud_plan_create',description:'Create a verifiable Plan for yourself or an authorized subordinate. Use once/interval/weekly/monthly scheduling. Returns its saved Plan ID.',inputSchema:{type:'object',additionalProperties:false,required:['name','text','rule'],properties:{name:{type:'string'},text:{type:'string'},agentId:{type:'string'},rule:{type:'object'},enabled:{type:'boolean'},clientRequestId:{type:'string'}}}},
];
const allowed=new Map(definitions.map(item=>[item.name,item]));
const fingerprint=(...parts)=>createHash('sha256').update(parts.map(String).join(':')).digest('hex');
async function invoke(native,name,args,callId,proof={}){
 if(!allowed.has(name))throw Error('Unknown collaboration tool');
 if(typeof callId!=='string'||!callId||callId.length>256)throw Error('Collaboration tool call must include a stable ID');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Collaboration tool arguments must be an object');
 const scope=native.toolScope;
 const api=require('./agent-api.cjs');api.identity(native,proof);
 const hasOnly=keys=>Object.keys(args).every(key=>keys.includes(key));
 if(name==='cloud_docs'){if(!hasOnly(['operation','search','prefix','command','document','agentOnly']))throw Error('Unknown documentation argument');return api.documents(native,args,proof)}
 if(name==='cloud_api'){if(!hasOnly(['command','args']))throw Error('Unknown API argument');return api.invoke(native,args,callId,proof)}
 if(name==='cloud_reply'){
  if(!hasOnly(['text'])||scope.source!=='group')throw Error('A public reply requires an assigned group task');
  const item=require('./collaboration.cjs').postFromTool(scope,{replyTo:scope.messageId,text:args.text});
  return {published:true,messageId:item.id};
 }
 if(name==='cloud_group_reply'){
  if(!hasOnly(['messageId','text'])||scope.source!=='group'||args.messageId!==scope.messageId)throw Error('Publication target does not match this group task');
  const item=require('./collaboration.cjs').postFromTool(scope,{replyTo:args.messageId,text:args.text});
  return {published:true,messageId:item.id};
 }
 if(name==='cloud_delegate'){
  if(!hasOnly(['agentId','text','clientTaskId']))throw Error('Invalid delegation fields');
  const task=await api.invoke(native,{command:'company.delegate',args:{agentId:args.agentId,text:args.text,clientTaskId:args.clientTaskId||'tool:'+fingerprint(scope.agentId,scope.turnId,callId)}},callId,proof);
  return {delegationId:task.data.id,status:task.data.status,agentId:task.data.agentId};
 }
 if(name==='cloud_task_status'){
  if(!hasOnly(['taskId']))throw Error('Invalid task query fields');
  const task=await api.invoke(native,{command:'company.task',args:{id:args.taskId}},callId,proof);
  return task.data;
 }
 if(!hasOnly(['name','text','agentId','rule','enabled','clientRequestId']))throw Error('Invalid Plan fields');
 const agentId=args.agentId||scope.agentId;
 const plan=await api.invoke(native,{command:'plan.create',args:{
  name:args.name,action:{type:'agent',mode:'resume',agentId,text:args.text},rule:args.rule,enabled:args.enabled===true,
  clientRequestId:args.clientRequestId||'tool_'+fingerprint(scope.agentId,scope.turnId,callId).slice(0,36),
 }},callId,proof);
 return {planId:plan.data.id,agentId,rule:plan.data.rule,enabled:plan.data.enabled,nextAt:plan.data.nextAt};
}
async function open(native){
 const route='/collaboration/'+randomBytes(32).toString('hex');
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='POST'||req.url!==route||req.headers.origin){
   res.writeHead(403).end();return;
  }
  let payload,bytes=0;
  try{
   const chunks=[];
   for await(const chunk of req){bytes+=chunk.length;if(bytes>64*1024){res.writeHead(413).end();return}chunks.push(chunk)}
   payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(payload.jsonrpc!=='2.0'||typeof payload.method!=='string')throw Error('Invalid MCP JSON-RPC');
   if(payload.method==='notifications/initialized'){res.writeHead(202).end();return}
   let result;
   if(payload.method==='initialize')result={protocolVersion:payload.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'cloudhosts-collaboration',version:'1'}};
   else if(payload.method==='ping')result={};
   else if(payload.method==='tools/list')result={tools:definitions};
   else if(payload.method==='tools/call'){
    try{
     if(payload.id===undefined)throw Error('MCP tool call requires a request ID');
     const value=await invoke(native,payload.params?.name,payload.params?.arguments,String(payload.id));
     result={content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value&&typeof value==='object'?value:{value}};
    }catch(error){result={isError:true,content:[{type:'text',text:error.message}]}};
   }else throw Error('Unknown MCP method');
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({jsonrpc:'2.0',id:payload.id??null,result}));
  }catch(error){
   if(!res.headersSent)res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({jsonrpc:'2.0',id:payload?.id??null,error:{code:-32600,message:error.message}}));
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 let closing;
 return {url:'http://127.0.0.1:'+server.address().port+route,close:()=>closing??=new Promise(resolve=>{server.closeAllConnections();server.close(resolve)})};
}
module.exports={definitions,invoke,open};
