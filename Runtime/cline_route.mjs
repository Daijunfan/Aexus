// A native Cline Core/Hub for one routed TUI. Provider settings and history
// remain in Cline's standard profile; the work host runs only native executors.
import {sdk} from './cline_sdk.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url);
const {ClineWorker}=require('../src/agent-cline-worker.cjs');
const role=await new Promise((resolve,reject)=>{
 let text='';
 const receive=chunk=>{text+=chunk;const end=text.indexOf('\n');if(end<0)return;process.stdin.off('data',receive);try{resolve(JSON.parse(text.slice(0,end)))}catch(error){reject(error)}};
 process.stdin.on('data',receive);
});
let worker,opening,hub,core,closed=false,published=false,restoring=false,activeSessionId=role.nativeSessionId,activeHasInput=role.nativeHasInput;
const notifySession=(id,hasInput)=>{
 if(!id||(id===activeSessionId&&hasInput===activeHasInput))return;
 activeSessionId=id;activeHasInput=hasInput;
 if(published)process.stdout.write('__CLOUDHOSTS_NATIVE_ID__'+JSON.stringify({sessionId:id,hasInput})+'\n');
};
async function connect(){
 if(closed)throw Error('Native Cline route is closed');
 if(opening)return opening;
 if(worker&&!worker.closed)return worker;
 opening=(async()=>{
  const next=new ClineWorker(role.targetHostId,role.cwd);
  worker=next;
  try{await next.request('initialize');if(closed)throw Error('Native Cline route is closed');worker=next;return worker}
  catch(error){next.close();throw error}
 })().finally(()=>{opening=undefined});
 return opening;
}
async function close(){
 if(closed)return;closed=true;worker?.close();
 await core?.dispose('native-route-closed');await hub?.close();
 process.exit(0);
}
process.stdin.on('end',()=>void close());process.stdin.resume();
process.on('SIGTERM',()=>void close());process.on('SIGHUP',()=>void close());
try{
 const connected=await connect(),environment=await connected.request('initialize');
 if(!environment.checkpoints)throw Error('The work host Cline SDK does not support native workspace restore');
 const checkpoint=async(operation,args)=>(await connect()).request('checkpoint',[{operation,...args}]);
 const paths=environment.platform==='win32'?path.win32:path.posix;
 const controllers=[role.controlCwd,fs.realpathSync(role.controlCwd)];
 const targetPath=value=>{
  const name=String(value),controller=controllers.find(root=>name===root||name.startsWith(root+path.sep));
  return controller?paths.resolve(role.cwd,path.relative(controller,name)):name;
 };
 const executors=Object.fromEntries(environment.methods.map(name=>[name,async(...args)=>{
  const context=args.pop();
  if(name==='readFile'||name==='editor')args[0]={...args[0],path:targetPath(args[0].path)};
  if(name!=='readFile'&&name!=='webFetch')args[1]=role.cwd;
  return (await connect()).request(name,args,{agentId:context.agentId,iteration:context.iteration,
   sessionId:context.sessionId,conversationId:context.conversationId,toolCallId:context.toolCallId,cwd:role.cwd},context.emitUpdate,context.signal);
 }]));
 const builder=new sdk.DefaultRuntimeBuilder();
 const runtimeBuilder={async build(input){
  // Let Cline compose its own standard prompt from actual workspace facts.
  input.config.systemPrompt=sdk.getClineDefaultSystemPrompt({...input.config.extensionContext?.workspace,
   rootPath:role.cwd,cwd:role.cwd,platform:environment.platform,providerId:input.config.providerId,mode:input.config.mode||'act',metadata:undefined});
  input.config.workspaceMetadata='';
  const runtime=await builder.build(input);
  if(environment.shellDescription)runtime.tools=runtime.tools.map(tool=>tool.name==='run_commands'?{...tool,description:environment.shellDescription}:tool);
  return runtime;
 }};
 const store=new sdk.SqliteSessionStore();store.init();
 const host=new sdk.LocalRuntimeHost({sessionService:new sdk.CoreSessionService(store),runtimeBuilder,capabilities:{toolExecutors:executors}});
 const runTurn=host.runTurn.bind(host);
 host.runTurn=input=>{if(input.sessionId===activeSessionId)notifySession(input.sessionId,true);return runTurn(input)};
 const start=host.startSession.bind(host);
 host.startSession=async input=>{
  const checkpointEnabled=input.localRuntime?.checkpoint?.enabled??input.config.checkpoint?.enabled??true;
  const session=await start({...input,config:{...input.config,cwd:role.controlCwd,workspaceRoot:role.controlCwd},
   localRuntime:{...input.localRuntime,configExtensions:[],checkpoint:{...input.localRuntime?.checkpoint,
    enabled:checkpointEnabled,
    createCheckpoint:context=>checkpoint('create',{sessionId:context.sessionId,runCount:context.runCount})}}});
  const record=await host.getSession(session.sessionId);
  if(!restoring&&!record?.isSubagent&&!record?.parentSessionId&&!record?.parentAgentId)notifySession(session.sessionId,!!input.prompt?.trim()||(await host.readLiveSessionMessages(session.sessionId)).length>0);
  return session;
 };
 // Hub and local runtimes both use this public versioning service. Supply its
 // documented filesystem callbacks in this isolated process; keep the native
 // history trimming, fork creation, validation and recovery orchestration.
 const nativeRestore=sdk.SessionVersioningService.prototype.restoreCheckpoint;
 sdk.SessionVersioningService.prototype.restoreCheckpoint=async function(input){
  restoring=true;
  try{
   const workspace=input.restore?.workspace!==false;
   const result=await nativeRestore.call(this,{...input,
    ...(workspace?{
     applyWorkspaceCheckpoint:(_,entry)=>checkpoint('restore',{sessionId:input.sessionId,checkpoint:entry}),
     beginWorkspaceRestoreTransaction:async()=>{
      const sessionId='restore-'+randomUUID(),backup=await checkpoint('create',{sessionId,runCount:1});
      if(!backup)throw Error('The work host cannot snapshot this workspace before restore');
      return {
       commit:()=>checkpoint('release',{sessionId,runCount:1}),
       rollback:async()=>{await checkpoint('rollback',{sessionId,checkpoint:backup});await checkpoint('release',{sessionId,runCount:1})}
      };
     }
    }:{}),
    retainCheckpointRefs:workspace?(_,sessionId,history)=>checkpoint('retain',{sessionId,history}):async()=>{}
   });
   notifySession(result.sessionId,(await host.readLiveSessionMessages(result.sessionId)).length>0);return result;
  }finally{restoring=false}
 };
 hub=await sdk.startHubWebSocketServer({host:'127.0.0.1',port:0,
  owner:{ownerId:role.id,discoveryPath:process.env.CLINE_HUB_DISCOVERY_PATH},workspaceRoot:role.controlCwd,sessionHost:host,
  runtimeHandlers:sdk.createLocalHubScheduleRuntimeHandlers(),
  scheduleOptions:{dbPath:path.join(role.controlCwd,'schedules.db')},
  taskOptions:{dbPath:path.join(role.controlCwd,'tasks.db'),watchFiles:false,automationEnabled:false},
  sessionSearchOptions:{dbPath:path.join(role.controlCwd,'history-index.db')},eventLog:false,runQueue:false});
 core=await sdk.ClineCore.create({backendMode:'hub',hub:{endpoint:hub.url,authToken:hub.authToken,workspaceRoot:role.controlCwd},automation:{autoStart:false}});
 let sessionId=role.nativeSessionId;
 const existing=sessionId&&await core.get(sessionId);
 if(sessionId&&!existing&&role.nativeHasInput!==false)throw Error('Exact Cline session ID is missing; refusing unrelated recovery.');
 if(!existing){
  const settings=new sdk.ProviderSettingsManager(),provider=settings.read().lastUsedProvider,selection=settings.getProviderSettings(provider);
  if(!selection?.model)throw Error('Configure a provider and model in native Cline first.');
  const session=await core.start({source:sdk.SessionSource.CLI,interactive:true,config:{
   ...(sessionId?{sessionId}:{}),cwd:role.controlCwd,providerId:provider,modelId:selection.model,apiKey:selection.apiKey,baseUrl:selection.baseUrl,providerConfig:selection,
   enableTools:true,enableSpawnAgent:true,enableAgentTeams:true,checkpoint:{enabled:true}}});
  sessionId=session.sessionId;
 }
 activeSessionId=sessionId;activeHasInput=role.nativeHasInput===true||(await host.readLiveSessionMessages(sessionId)).length>0;published=true;
 process.stdout.write('__CLOUDHOSTS_NATIVE_ROUTE__'+JSON.stringify({sessionId,hasInput:activeHasInput})+'\n');
}catch(error){process.stderr.write(error.message+'\n');worker?.close();await core?.dispose('native-route-failed');await hub?.close();process.exit(1)}
