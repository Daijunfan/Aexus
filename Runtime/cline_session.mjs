// Register the TUI's identity in Cline's original shared Hub. A disposable local
// Core cannot do this: it deletes empty records when that Core is disposed.
import {sdk,cliRoot} from './cline_sdk.mjs';
import {spawn as startNativeHub} from 'node:child_process';
import {createInterface as sessionLines} from 'node:readline';
async function nativeSession({sessionId,knownHasInput}){
 const owner=sdk.resolveProductionHubOwnerContext();
 const live=async()=>{
  const record=await sdk.readHubDiscovery(owner.discoveryPath);
  return record&&await sdk.probeHubServer(record.url,{authToken:record.authToken,signal:AbortSignal.timeout(1800)})?record:null;
 };
 let hub=await live();
 if(!hub){
  if(!cliRoot)throw Error('Native Cline launcher is unavailable');
  // This is the same daemon entry used by the installed CLI, so its build
  // identity matches the stock TUI. Its own lock handles concurrent launches.
  const log=path.join(sdk.resolveClineDataDir(),'logs','hub-daemon.log');fs.mkdirSync(path.dirname(log),{recursive:true});
  const fd=fs.openSync(log,'a',0o600);
  try{startNativeHub(process.execPath,[path.join(cliRoot,'bin','cline'),'--cline-hub-daemon','--cwd',process.cwd(),'--port','0'],
   {detached:true,stdio:['ignore',fd,fd],windowsHide:true,env:{...process.env,CLINE_RUN_AS_HUB_DAEMON:'1',CLINE_NO_INTERACTIVE:'1'}}).unref()}
  finally{fs.closeSync(fd)}
  const until=Date.now()+15000;
  while(Date.now()<until&&!hub){await new Promise(r=>setTimeout(r,120));hub=await live()}
  if(!hub)throw Error('The native Cline Hub did not become available');
 }
 const core=await sdk.ClineCore.create({backendMode:'hub',hub:{endpoint:hub.url,authToken:hub.authToken,workspaceRoot:process.cwd()},automation:{autoStart:false}});
 try{
  if(!sessionId||!await core.get(sessionId)){
   if(sessionId&&knownHasInput)throw Error('Exact Cline history is missing; refusing a new conversation');
   const manager=new sdk.ProviderSettingsManager(),provider=manager.read().lastUsedProvider,settings=manager.getProviderSettings(provider);
   if(!settings?.model)throw Error('Configure a provider and model in native Cline first');
   const session=await core.start({source:sdk.SessionSource.CLI,interactive:true,config:{...(sessionId?{sessionId}:{}),
    cwd:process.cwd(),workspaceRoot:process.cwd(),providerId:provider,modelId:settings.model,apiKey:settings.apiKey,baseUrl:settings.baseUrl,providerConfig:settings,
    enableTools:true,enableSpawnAgent:true,enableAgentTeams:true}});
   sessionId=session.sessionId;
  }
  return {sessionId,hasInput:(await core.readMessages(sessionId)).length>0};
 }finally{await core.dispose('native-tui-registered')}
}
sessionLines({input:process.stdin}).on('line',async line=>{
 const request=JSON.parse(line);
 try{process.stdout.write(JSON.stringify({id:request.id,result:await nativeSession(request.args[0]||{})})+'\n')}
 catch(error){process.stdout.write(JSON.stringify({id:request.id,error:{message:error.message}})+'\n')}
});
