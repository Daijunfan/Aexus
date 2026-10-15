// External-service-only plugin bridge. Never starts a second MiniNotion/MarginReader
// backend, imports user data, or shares Aexus's original storage directory.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const registry=require('./registry.cjs');
const contracts=require('./api-contracts.cjs');
const config=()=>path.join(registry.home,'plugin-connections.json');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function state(){
 if(!fs.existsSync(config()))return {schemaVersion:1,connections:[]};
 const data=JSON.parse(fs.readFileSync(config(),'utf8'));
 if(data.schemaVersion!==1||!Array.isArray(data.connections))throw Error('Unknown plugin connection store version');
 return data;
}
function save(data){
 fs.mkdirSync(path.dirname(config()),{recursive:true,mode:0o700});
 if(fs.existsSync(config())&&fs.lstatSync(config()).isSymbolicLink())throw Error('Plugin registry symlink is not allowed');
 const tmp=config()+'.'+process.pid+'.'+randomUUID()+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});
 fs.renameSync(tmp,config());fs.chmodSync(config(),0o600);
}
function endpoint(value){
 if(typeof value!=='string'||value.length>300)throw Error('Choose an existing plugin service endpoint');
 const url=new URL(value);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||
    !url.port||!/^\/[a-zA-Z0-9_\-/]+\/$/.test(url.pathname))throw Error('Plugin endpoint must be a token-scoped 127.0.0.1 HTTP URL');
 return url.toString();
}
function pluginId(value){if(typeof value!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(value))throw Error('Invalid plugin ID');return value}
function schemaInput(schema){
 if(!schema||typeof schema!=='object'||Array.isArray(schema)||schema.schemaVersion!==1||
  typeof schema.version!=='string'||!Array.isArray(schema.commands)||!schema.commands.length||schema.commands.length>500||
  schema.commands.some(c=>!c||typeof c.method!=='string'||!/^[-.a-z0-9]{1,120}$/.test(c.method)||typeof c.description!=='string')||
  new Set(schema.commands.map(c=>c.method)).size!==schema.commands.length)
  throw Error('Invalid plugin command schema');
 pluginId(schema.pluginId);
 for(const c of schema.commands){
  if(c.agentAccess!==undefined&&!['workspace','operator'].includes(c.agentAccess))throw Error('Invalid plugin command access');
  if(!c.options||typeof c.options!=='object'||Array.isArray(c.options))throw Error('Plugin command options are required');
  for(const [name,rule] of Object.entries(c.options)){
   if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)||!rule||!['string','number','boolean','array','object'].includes(rule.type))
    throw Error('Unsupported plugin option: '+name);
  }
 }
 return schema;
}
function toSchema(command){
 const properties=Object.fromEntries(Object.entries(command.options||{}).map(([name,rule])=>{
  const out={type:rule.type};
  for(const attr of ['description','enum','minimum','maximum','minLength','maxLength'])if(rule[attr]!==undefined)out[attr]=rule[attr];
  if(rule.integer&&rule.type==='number')out.type='integer';
  if(rule.type==='array')out.items={}; // The provider enforces any nested array detail.
  return [name,out];
 }));
 return {type:'object',additionalProperties:false,properties,
  required:Object.entries(command.options||{}).filter(([,rule])=>rule.required).map(([name])=>name)};
}
function publicRow(row){
 return {id:row.id,name:row.name,version:row.schema.version,
  workspaceLabel:row.workspaceLabel,agentIds:[...row.agentIds],
  commands:row.schema.commands.length,endpointConfigured:true,
  schemaHash:digest(row.schema),connectionRevision:row.revision};
}
function list({agentId}={}){
 return state().connections.filter(row=>!agentId||row.agentIds.includes(agentId)).map(publicRow);
}
function localFile(dirname){
 if(typeof dirname!=='string'||!path.isAbsolute(dirname))throw Error('Specify an existing absolute plugin workspace path');
 const real=fs.realpathSync(dirname);
 if(!fs.statSync(real).isDirectory())throw Error('Plugin workspace must be a real directory');
 return real;
}
async function request(row,method,params={},timeoutMs=10000){
 let res;
 try{res=await fetch(new URL('rpc',row.endpoint),{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:'cloud_'+randomUUID(),method,params}),
  signal:AbortSignal.timeout(timeoutMs)});}
 catch(error){throw Error('Plugin service is unavailable: '+error.message)}
 if(!res.ok)throw Error('Plugin service refused RPC ('+res.status+')');
 const data=await res.json();
 if(data?.error)throw Error('Plugin '+row.id+': '+data.error.message);
 if(!Object.hasOwn(data||{},'result'))throw Error('Plugin returned no JSON-RPC result');
 return data.result;
}
async function verify(row){
 const info=await request(row,'system.info',{},8000);
 if(info?.plugin!==row.id||info?.version!==row.schema.version||info?.workspace!==row.workspace)
  throw Error('Plugin endpoint identity, version or workspace mismatch; the connection must be reattached');
 return info;
}
async function attach({id,name,url,schema,workspace,workspaceLabel}={}){
 pluginId(id);schemaInput(schema);
 if(id!==schema.pluginId)throw Error('Plugin identity and schema.pluginId do not match');
 const exists=state().connections.some(x=>x.id===id);if(exists)throw Error('Plugin already attached; detach it explicitly before replacing');
 const root=localFile(workspace),bound={id,name:String(name||id).slice(0,100),endpoint:endpoint(url),schema,
  workspace:root,workspaceLabel:String(workspaceLabel||id).slice(0,100),agentIds:[],revision:1};
 await verify(bound);
 const data=state();if(data.connections.some(x=>x.id===id))throw Error('Plugin connection changed while attaching');
 data.connections.push(bound);save(data);
 return publicRow(bound);
}
function detach({id}={}){
 const data=state(),row=data.connections.find(x=>x.id===id);
 if(!row)throw Error('Unknown plugin connection');
 data.connections=data.connections.filter(x=>x.id!==id);save(data);
 return {id,detached:true};
}
function grant({id,agentId,allowed=true}={}){
 if(typeof agentId!=='string'||!agentId)throw Error('Choose a persistent Agent identity');
 if(typeof allowed!=='boolean')throw Error('Choose allowed true/false');
 if(!require('./agent-sessions.cjs').sessions().some(x=>x.id===agentId))throw Error('Unknown Agent identity');
 const data=state(),row=data.connections.find(x=>x.id===id);if(!row)throw Error('Unknown plugin connection');
 const next=new Set(row.agentIds);
 if(allowed)next.add(agentId);else next.delete(agentId);
 row.agentIds=[...next].sort();row.revision++;save(data);
 return {...publicRow(row),allowed:row.agentIds.includes(agentId)};
}
function fullName(id,method){return 'plugin.'+id+'.'+method}
function getCommand(full,agentId){
 if(typeof full!=='string'||!full.startsWith('plugin.'))return null;
 const first=full.indexOf('.',7);if(first<0)throw Error('Plugin method ID must be plugin.ID.METHOD');
 const id=full.slice(7,first),method=full.slice(first+1);
 const row=state().connections.find(x=>x.id===id);
 if(!row||agentId&&!row.agentIds.includes(agentId))throw Error('Plugin connection is not authorized for this Agent');
 const command=row.schema.commands.find(x=>x.method===method);
 if(!command)throw Error('Unknown plugin command: '+full);
 if(agentId&&command.agentAccess!=='workspace')throw Error('Plugin command is restricted to the human operator');
 return {row,command,method};
}
function describe(full,agentId){
 const found=getCommand(full,agentId);if(!found)throw Error('Unknown plugin method');
 const {row,command}=found;
 return {name:full,summary:command.description,effect:command.mutates===false||command.readOnly===true?'read':'write',
  inputSchema:toSchema(command),outputSchema:{},agentCallable:command.agentAccess==='workspace',
  contractStatus:'provider-output-untyped',pluginId:row.id,workspaceLabel:row.workspaceLabel,
  apiVersion:contracts.metadata().apiVersion,pluginSchemaHash:digest(row.schema)};
}
function catalog(agentId,{prefix='',search='',agentOnly=false}={}){
 const q=String(search).toLowerCase();
 const result=[];
 for(const row of state().connections){
  if(agentOnly&&(!agentId||!row.agentIds.includes(agentId)))continue;
  for(const command of row.schema.commands){
   const name=fullName(row.id,command.method);
   if(agentId&&(!row.agentIds.includes(agentId)||command.agentAccess!=='workspace'))continue;
   if(agentOnly&&command.agentAccess!=='workspace')continue;
   if(!name.startsWith(prefix)||q&&!(name+' '+command.description).toLowerCase().includes(q))continue;
   result.push({name,summary:command.description,effect:command.mutates===false||command.readOnly===true?'read':'write',
     agentCallable:command.agentAccess==='workspace',contractStatus:'provider-output-untyped',pluginId:row.id});
  }
 }
 return result;
}
async function call({command,args={},agentId}={}){
 const found=getCommand(command,agentId),meta=describe(command,agentId);
 contracts.validate(meta.inputSchema,args);
 const {row,method}=found;
 await verify(row); // Reject a stale or redirected service, even for read operations.
 // Re-read grants after the network boundary; never rely on a previous snapshot.
 getCommand(command,agentId);
 return request(row,method,args,60000);
}
function version(agentId){
 return digest(list({agentId}).map(x=>({id:x.id,revision:x.connectionRevision,schemaHash:x.schemaHash})));
}
function document(document,agentId){
 const parts=String(document||'').split('/');
 if(parts[0]!=='plugin'||!parts[1])throw Error('Invalid plugin document identifier');
 const row=state().connections.find(x=>x.id===parts[1]);
 if(!row||agentId&&!row.agentIds.includes(agentId))throw Error('Plugin document is not available to this Agent');
 if(parts.length===3&&parts[2]==='index'){
  const entries=catalog(agentId,{prefix:fullName(row.id,'')});
  return {document,pluginId:row.id,pluginSchemaHash:digest(row.schema),
   markdown:'# '+row.name+' API ('+row.schema.version+')\nWorkspace: '+row.workspaceLabel+'\n'+entries.map(x=>'- '+x.name+' — '+x.summary).join('\n')};
 }
 if(parts.length>=4&&parts[2]==='command'){
  const command=parts.slice(3).join('/');if(command.includes('/'))throw Error('Invalid plugin command document');
  return {document,...describe(fullName(row.id,command),agentId)};
 }
 throw Error('Unknown plugin document: '+document);
}
module.exports={attach,detach,grant,list,catalog,describe,call,version,document,request};
