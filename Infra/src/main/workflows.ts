import {currentEngineScope,adoptWorkflowResources} from './engine-scope'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {APP_HOME} from '../shared/protocol'
import type {RequestContext} from '../shared/management'
import type {WorkflowView,WorkflowRuntime,WorkflowContext,WorkflowArtifact} from '../../../Contract/workflow'
import {CONTRACT_VERSION,contractError} from '../../../Contract/protocol'
import {atomicJson,readJson} from './atomic-file'
import {authorize,requestContext,withCaller} from './authorization'
import {applicationRoot} from './resources'
import {installedEngines,contractRequest} from './contract'

type RecordEntry=WorkflowView&{owner:RequestContext;state:any;startKey:string;inputHash:string;answers:Record<string,{hash:string;operation:string}>}
const directory=()=>path.join(APP_HOME,'workflows'),entries=new Map<string,RecordEntry>(),loadErrors=new Map<string,string>(),active=new Map<string,{controller:AbortController;done:Promise<void>}>()
let ready=false,invoke:((name:string,args:Record<string,any>)=>Promise<any>)|undefined,emit:((channel:string,payload:any)=>void)=()=>{}
const digest=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex')
const fault=(message:string)=>contractError('WORKFLOW_CONFLICT',message)
const sameOwner=(a:RequestContext,b:RequestContext)=>a.principal.kind===b.principal.kind&&(a.principal.kind==='operator'||b.principal.kind==='agent'&&a.principal.employeeId===b.principal.employeeId)
const validId=(id:unknown)=>{if(typeof id!=='string'||!/^wf_[a-f0-9-]{36}$/.test(id))throw Error('Invalid workflow ID');return id}
const home=(id:string)=>path.join(directory(),validId(id))
const file=(id:string)=>path.join(home(id),'state.json')
const jsonObject=(value:unknown,label:string)=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error(label+' must be a JSON object');if(Buffer.byteLength(JSON.stringify(value))>8*1024*1024)throw Error(label+' exceeds 8 MiB');return value as Record<string,any>}
const requestKey=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>160)throw Error('Provide a stable clientRequestId');return value}
function load(){
 if(!fs.existsSync(directory()))return
 for(const entry of fs.readdirSync(directory(),{withFileTypes:true}))if(entry.isDirectory()&&/^wf_[a-f0-9-]{36}$/.test(entry.name)){
  try{
   const value=readJson<RecordEntry>(file(entry.name),()=>{throw Error('Missing workflow state')})
   if(value.id!==entry.name||!value.owner?.principal||!Number.isSafeInteger(value.revision)||!['running','waiting','paused','completed','failed','cancelled'].includes(value.status))throw Error('Invalid persisted workflow '+entry.name)
   entries.set(entry.name,value)
  }catch(error){loadErrors.set(entry.name,(error as Error).message)}
 }
}
const project=(job:RecordEntry):WorkflowView=>({id:job.id,engineId:job.engineId,engineVersion:job.engineVersion,status:job.status,revision:job.revision,createdAt:job.createdAt,updatedAt:job.updatedAt,summary:job.summary,files:job.status==='completed'?job.files:[],controlPending:!!job.controlPending,...(job.error?{error:job.error}:{})})
function save(job:RecordEntry){job.revision++;job.updatedAt=Date.now();atomicJson(file(job.id),job,true);entries.set(job.id,job);emit('workflow:changed',{id:job.id,engineId:job.engineId,status:job.status,revision:job.revision})}
function own(id:unknown){const key=validId(id);if(loadErrors.has(key)&&requestContext().principal.kind==='operator')throw Error('Workflow state needs repair; original data retained: '+loadErrors.get(key));const job=entries.get(key);if(!job||currentEngineScope()!==undefined&&currentEngineScope()!==job.engineId||!sameOwner(job.owner,requestContext()))throw Error('Workflow not found for this caller');return job}
async function moduleFor(job:Pick<RecordEntry,'engineId'|'engineVersion'>):Promise<{runtime:WorkflowRuntime;commands:Set<string>}>{
 const manifest=installedEngines().engines.find(engine=>engine.id===job.engineId)
 if(!manifest?.runtime)throw Error('This Engine has no background workflow runtime')
 const url=pathToFileURL(path.join(applicationRoot(),'Engine',manifest.directory,manifest.runtime)).href
 const runtime=await import(/* @vite-ignore */ url) as WorkflowRuntime
 if(manifest.version!==job.engineVersion&&!runtime.compatibleVersions?.includes(job.engineVersion))throw Error('Engine version changed; restore '+job.engineVersion+' before resuming this workflow')
 for(const method of ['create','describe','respond','run'] as const)if(typeof runtime[method]!=='function')throw Error('Engine runtime is missing '+method)
 return {runtime,commands:new Set(manifest.requiredCommands)}
}
function contextFor(job:RecordEntry,controller:AbortController,runtime:WorkflowRuntime,commands:Set<string>):WorkflowContext{
 const guarded=async(name:string,args:Record<string,any>={})=>{
  controller.signal.throwIfAborted()
  if(!commands.has(name)||name.startsWith('workflow.'))throw Error('Engine did not declare this runtime capability: '+name)
  return withCaller({...job.owner,engineScope:job.engineId},async()=>{
   authorize('workflow.start')
   const response=await contractRequest('contract.call',{version:CONTRACT_VERSION,command:name,args},(command,input)=>invoke!(command,input)) as {data:any}
   return response.data
  })
 }
 return {id:job.id,signal:controller.signal,client:{invoke:guarded,info:()=>withCaller(job.owner,()=>contractRequest('contract.info',{},invoke!)),describe:command=>withCaller(job.owner,()=>contractRequest('contract.describe',{version:CONTRACT_VERSION,command},invoke!))},checkpoint:async state=>{
  controller.signal.throwIfAborted();if(job.status!=='running')throw fault('Workflow is no longer running')
  job.state=structuredClone(state);job.summary=jsonObject(runtime.describe(state),'Workflow summary');save(job)
 }}
}
function artifactBytes(artifact:WorkflowArtifact){
 if(artifact.encoding!==undefined&&!['utf8','base64'].includes(artifact.encoding))throw Error('Unsupported artifact encoding')
 if(artifact.encoding==='base64'&&(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.content)||!artifact.content.length))throw Error('Invalid artifact base64')
 return Buffer.from(artifact.content,artifact.encoding==='base64'?'base64':'utf8')
}
function publish(job:RecordEntry,artifacts:WorkflowArtifact[]){
 if(!Array.isArray(artifacts)||!artifacts.length||artifacts.length>12)throw Error('A completed workflow needs 1–12 final files')
 const names=new Set<string>();let total=0
 for(const artifact of artifacts){
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(artifact.name)||names.has(artifact.name)||typeof artifact.content!=='string'||!artifact.content.trim()||!artifact.mediaType||!artifact.description)throw Error('Invalid final artifact')
  const bytes=artifactBytes(artifact);if(bytes.length>8*1024*1024)throw Error('One final file exceeds 8 MiB')
  names.add(artifact.name);total+=bytes.length
 }
 if(total>20*1024*1024)throw Error('Final deliverables exceed 20 MiB')
 const stage=path.join(home(job.id),'delivery-staging'),final=path.join(home(job.id),'delivery')
 fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage)
 const manifest=artifacts.map(artifact=>{const {name,mediaType,description,encoding}=artifact,bytes=artifactBytes(artifact);fs.writeFileSync(path.join(stage,name),bytes,{flag:'wx'});return {name,mediaType,description,...(encoding?{encoding}:{}),bytes:bytes.length,sha256:digest(bytes)}})
 if(fs.existsSync(final)){
  if(fs.readdirSync(final).sort().join('\n')!==[...names].sort().join('\n')||manifest.some(item=>digest(fs.readFileSync(path.join(final,item.name)))!==item.sha256))throw Error('An earlier final delivery differs; refusing to overwrite it')
  fs.rmSync(stage,{recursive:true,force:true})
 }else fs.renameSync(stage,final)
 job.files=manifest
}
async function pauseCleanup(job:RecordEntry,loaded:Awaited<ReturnType<typeof moduleFor>>){
 try{
  if(!loaded.runtime.pause)throw Error('This Engine does not support safe pause')
  await loaded.runtime.pause(job.state,contextFor(job,new AbortController(),loaded.runtime,loaded.commands))
  job.summary=jsonObject(loaded.runtime.describe(job.state),'Workflow summary');job.controlPending=false;delete job.error
 }catch(error){job.controlPending=true;job.error='Pause cleanup incomplete; retry pause before resuming: '+(error as Error).message}
 save(job)
}
function launch(job:RecordEntry){
 if(!ready||active.has(job.id)||job.status!=='running')return
 const controller=new AbortController()
 const done=Promise.resolve().then(async()=>{
  let loaded:Awaited<ReturnType<typeof moduleFor>>|undefined
  try{
   loaded=await moduleFor(job)
   const context=contextFor(job,controller,loaded.runtime,loaded.commands),result=await loaded.runtime.run(structuredClone(job.state),context)
   controller.signal.throwIfAborted()
   if(!['waiting','completed'].includes(result.status))throw Error('Engine returned an invalid workflow terminal state')
   job.state=result.state;job.summary=jsonObject(loaded.runtime.describe(job.state),'Workflow summary')
   if(result.status==='completed')publish(job,result.artifacts??[])
   job.status=result.status;delete job.error;save(job)
  }catch(error){
   if(job.status==='paused'){
    if(loaded)await pauseCleanup(job,loaded)
   }else if(job.status==='cancelled'){
    if(loaded?.runtime.cancel)try{await loaded.runtime.cancel(job.state,contextFor(job,new AbortController(),loaded.runtime,loaded.commands))}catch(cause){job.error='Cancelled; some owned tasks could not be interrupted: '+(cause as Error).message;save(job)}
   }else if(!controller.signal.aborted){job.status='failed';job.error=(error as Error).message||String(error);save(job)}
   // Shutdown retains the last checkpoint. Native work is reconciled, never assumed completed.
  }finally{active.delete(job.id)}
 })
 active.set(job.id,{controller,done})
}
export function startWorkflows(dispatch:NonNullable<typeof invoke>,publishEvent:typeof emit){
 invoke=dispatch;emit=publishEvent;load();ready=true
 for(const job of entries.values()){adoptWorkflowResources(job.engineId,job.state);launch(job)}
}
export async function stopWorkflows(){ready=false;for(const run of active.values())run.controller.abort(Error('Core is shutting down'));await Promise.all([...active.values()].map(run=>run.done));entries.clear();loadErrors.clear();emit=()=>{}}

async function workflowRequestInternal(command:string,args:Record<string,any>){
 if(!ready)throw Error('Workflow service is not ready')
 const schemas:Record<string,string[]>={start:['engineId','input','clientRequestId'],list:['engineId'],get:['id'],respond:['id','expectedRevision','answer','clientRequestId'],resume:['id','expectedRevision','clientRequestId'],pause:['id'],amend:['id','expectedRevision','update','clientRequestId'],cancel:['id'],file:['id','name']}
 const op=command.slice('workflow.'.length);if(!schemas[op]||Object.keys(args).some(key=>!schemas[op].includes(key)))throw Error('Unknown workflow request field')
 if(op==='list')return {jobs:[...entries.values()].filter(job=>(currentEngineScope()===undefined||currentEngineScope()===job.engineId)&&sameOwner(job.owner,requestContext())&&(!args.engineId||job.engineId===args.engineId)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,100).map(project),errors:currentEngineScope()===undefined&&requestContext().principal.kind==='operator'?[...loadErrors].map(([id,error])=>({id,error})):[]}
 if(op==='start'){
  const input=jsonObject(args.input,'input'),key=requestKey(args.clientRequestId),owner=requestContext(),hash=digest(JSON.stringify({engineId:args.engineId,input}))
  const previous=[...entries.values()].find(job=>sameOwner(job.owner,owner)&&job.startKey===key)
  if(previous){if(previous.inputHash!==hash)throw fault('clientRequestId already belongs to different input');return project(previous)}
  const manifest=installedEngines().engines.find(engine=>engine.id===args.engineId)
  if(!manifest)throw Error('Engine is not installed')
  const {runtime}=await moduleFor({engineId:manifest.id,engineVersion:manifest.version})
  // Dynamic import can yield; recheck the request key before the first persisted side effect.
  const raced=[...entries.values()].find(job=>sameOwner(job.owner,owner)&&job.startKey===key)
  if(raced){if(raced.inputHash!==hash)throw fault('clientRequestId already belongs to different input');return project(raced)}
  const state=runtime.create(input),now=Date.now(),job:RecordEntry={id:'wf_'+randomUUID(),engineId:manifest.id,engineVersion:manifest.version,owner:{principal:owner.principal,requestId:owner.requestId,...(owner.credentialHash?{credentialHash:owner.credentialHash}:{})},state,summary:jsonObject(runtime.describe(state),'Workflow summary'),status:'running',revision:0,createdAt:now,updatedAt:now,files:[],startKey:key,inputHash:hash,answers:{}}
  fs.mkdirSync(home(job.id),{recursive:true});save(job);launch(job);return project(job)
 }
 const job=own(args.id)
 if(op==='get')return project(job)
 if(op==='file'){
  const artifact=job.status==='completed'&&job.files.find(item=>item.name===args.name)
  if(!artifact)throw Error('Only manifest-listed final files from a completed workflow are available')
  const bytes=fs.readFileSync(path.join(home(job.id),'delivery',artifact.name))
  if(digest(bytes)!==artifact.sha256)throw Error('Final file hash changed; refusing an unverified download')
  return {...artifact,content:bytes.toString(artifact.encoding==='base64'?'base64':'utf8')}
 }
 if(op==='pause'){
  if(['completed','cancelled'].includes(job.status))throw fault('Terminal workflows cannot be paused')
  if(job.status==='paused'&&!job.controlPending)return project(job)
  const loaded=await moduleFor(job)
  if(!loaded.runtime.pause)throw Error('This Engine does not support safe pause')
  if(['completed','cancelled'].includes(job.status))throw fault('Workflow finished before pause')
  job.status='paused';job.controlPending=true;save(job)
  const running=active.get(job.id)
  if(running){running.controller.abort(Error('Workflow paused by its owner'));await running.done}
  else await pauseCleanup(job,loaded)
  return project(job)
 }
 if(op==='cancel'){
  if(['cancelled','completed'].includes(job.status))return project(job)
  job.controlPending=false;job.status='cancelled';save(job);const running=active.get(job.id)
  if(running)running.controller.abort(Error('Workflow cancelled by its owner'))
  else try{const {runtime,commands}=await moduleFor(job);await runtime.cancel?.(job.state,contextFor(job,new AbortController(),runtime,commands))}catch(error){job.error='Cancelled; some owned tasks could not be interrupted: '+(error as Error).message;save(job)}
  return project(job)
 }
 const key=requestKey(args.clientRequestId),answer=op==='respond'?jsonObject(args.answer,'answer'):op==='amend'?jsonObject(args.update,'update'):{},hash=digest(JSON.stringify({op,answer})),prior=job.answers[key]
 if(prior){if(prior.hash!==hash)throw fault('This answer key was already used with different content');return project(job)}
 if(args.expectedRevision!==job.revision)throw fault('Workflow changed; reload before responding')
 if(job.controlPending||active.has(job.id))throw fault('Workflow is still stopping; read its status before changing it')
 if(op==='respond'&&job.status!=='waiting'||op==='resume'&&!['failed','paused'].includes(job.status)||op==='amend'&&job.status!=='paused')throw fault('Workflow is not in a state that accepts '+op)
 const {runtime}=await moduleFor(job)
 if(args.expectedRevision!==job.revision)throw fault('Workflow changed while loading its Engine')
 if(op==='amend'){
  if(!runtime.amend)throw Error('This Engine does not support research revisions')
  job.state=runtime.amend(structuredClone(job.state),answer);job.answers[key]={hash,operation:op};job.summary=jsonObject(runtime.describe(job.state),'Workflow summary');delete job.error;save(job);return project(job)
 }
 if(op==='respond')job.state=runtime.respond(structuredClone(job.state),answer)
 else if(runtime.retry)job.state=runtime.retry(structuredClone(job.state))
 job.answers[key]={hash,operation:op};job.summary=jsonObject(runtime.describe(job.state),'Workflow summary');job.status='running';delete job.error;save(job);launch(job);return project(job)
}

/** Serialize owner mutations across asynchronous Engine hooks. Reads remain non-blocking. */
const mutations=new Map<string,Promise<unknown>>()
export async function workflowRequest(command:string,args:Record<string,any>){
 if(!['workflow.pause','workflow.amend','workflow.respond','workflow.resume','workflow.cancel'].includes(command))return workflowRequestInternal(command,args)
 const id=validId(args.id),previous=mutations.get(id)??Promise.resolve()
 const next=previous.catch(()=>{}).then(()=>workflowRequestInternal(command,args));mutations.set(id,next)
 try{return await next}finally{if(mutations.get(id)===next)mutations.delete(id)}
}
