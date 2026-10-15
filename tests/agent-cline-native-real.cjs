// Actual installed Cline SDK + original TUI, disposable profile and local model fixture.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const temp=fs.mkdtempSync('/tmp/cloudhosts-cline-native-');
Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CLINE_DIR:path.join(temp,'profile'),CLINE_DATA_DIR:path.join(temp,'profile/data')});
const settings=path.join(process.env.CLINE_DATA_DIR,'settings');fs.mkdirSync(settings,{recursive:true});
const requests=[],server=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 if(req.method==='POST'){
  requests.push(JSON.parse(body));res.writeHead(200,{'content-type':'text/event-stream'});
  for(const [delta,finish] of [[{role:'assistant',content:'CLINE_NATIVE_TURN_OK'},null],[{},'stop']])res.write('data: '+JSON.stringify({id:'cline-fixture',object:'chat.completion.chunk',created:1,model:'native-fixture',choices:[{index:0,delta,finish_reason:finish}]})+'\n\n');
  res.end('data: [DONE]\n\n');return;
 }
 res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'native-fixture',object:'model'}]}));
});
const agents=require('../src/agent-sessions.cjs'),terminals=require('../src/terminals.cjs');
async function screen(id){
 const end=Date.now()+20000;let last='';
 while(Date.now()<end){const value=await terminals.read(id,0);last=value.output||'';if(!value.running)throw Error('Native Cline exited: '+last.slice(-400));if(last.includes('Ask anything'))return last;await new Promise(r=>setTimeout(r,100))}
 throw Error('Native Cline input did not render: '+last.slice(-400));
}
(async()=>{let role;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 fs.writeFileSync(path.join(settings,'providers.json'),JSON.stringify({version:1,lastUsedProvider:'openai-compatible',modes:{},providers:{'openai-compatible':{settings:{provider:'openai-compatible',model:'native-fixture',apiKey:'fixture-not-a-real-key',baseUrl:'http://127.0.0.1:'+server.address().port+'/v1'},updatedAt:new Date().toISOString(),tokenSource:'manual'}}}));
 fs.writeFileSync(path.join(settings,'models.json'),JSON.stringify({version:1,providers:{'openai-compatible':{models:{'native-fixture':{id:'native-fixture',name:'Native Fixture'}}}}}));
 role=await agents.open({id:'local',engine:'cline',name:'Native Cline identity QA',directory:temp});
 assert.ok(role.nativeSessionId);await screen(role.terminalId);assert.equal(requests.length,0);
 const emptyId=role.nativeSessionId;await agents.close({id:'local',session:role.id});
 role=await agents.activate({id:'local',session:role.id});await screen(role.terminalId);
 assert.equal(role.nativeSessionId,emptyId);assert.equal(requests.length,0,'An empty native TUI reconnect must not send a prompt');
 await new Promise(r=>setTimeout(r,400));
 await terminals.input(role.terminalId,'Reply exactly CLINE_NATIVE_TURN_OK.');
 await new Promise(r=>setTimeout(r,250));
 await terminals.input(role.terminalId,'\r');
 const end=Date.now()+30000;
 while(Date.now()<end&&requests.length===0)await new Promise(r=>setTimeout(r,100));
 if(!requests.length)fs.writeFileSync('/tmp/cloudhosts-cline-failed-screen.txt',(await terminals.read(role.terminalId,0)).output||'');
 assert.ok(requests.length,'Original native Cline TUI must send its task');
 assert.match(JSON.stringify(requests[0]),/Reply exactly CLINE_NATIVE_TURN_OK/);
 assert.doesNotMatch(JSON.stringify(requests[0]),/cloud_docs|cloud_api|cloud_reply|Aexus Employee/);
 await new Promise(r=>setTimeout(r,1000));
 const sdk=await import(require('node:url').pathToFileURL(path.join(require('node:os').homedir(),'.npm-global/lib/node_modules/cline/node_modules/@cline/core/dist/index.js')).href);
 const store=await sdk.ClineCore.create({backendMode:'local',automation:false});
 const history=await store.listHistory();
 assert.ok(history.some(row=>row.sessionId===role.nativeSessionId),'Real native history must use the exact stored ID: '+JSON.stringify(history.map(row=>row.sessionId)));
 assert.ok((await store.readMessages(role.nativeSessionId)).some(message=>JSON.stringify(message).includes('CLINE_NATIVE_TURN_OK')));
 await store.dispose('verification');
 await agents.close({id:'local',session:role.id});
 const before=requests.length;
 const recovered=await agents.activate({id:'local',session:role.id});
 assert.equal(recovered.nativeSessionId,role.nativeSessionId);assert.equal(recovered.id,role.id);
 assert.notEqual(recovered.terminalId,role.terminalId);await screen(recovered.terminalId);
 assert.equal(requests.length,before,'Recovery must not submit a model prompt');
 console.log('PASS original Cline TUI, persistent native ID, exact reconnect, shared native profile, unchanged native task and history; local model fixture only');
 }finally{
  if(role)await agents.close({id:'local',session:role.id});await agents.shutdown();await terminals.shutdown();
  const {sdk}=await import(require('node:url').pathToFileURL(path.resolve(__dirname,'../Runtime/cline_sdk.mjs')).href);
  const discovery=await sdk.readHubDiscovery(sdk.resolveProductionHubOwnerContext().discoveryPath);
  if(discovery)await sdk.requestHubShutdown(discovery.url,discovery.authToken);
  const log=path.join(process.env.CLINE_DATA_DIR,'logs/hub-daemon.log');if(fs.existsSync(log))fs.copyFileSync(log,'/tmp/cloudhosts-cline-test-hub.log');
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
