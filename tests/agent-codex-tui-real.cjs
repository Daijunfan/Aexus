// Isolated real Codex TUI over a private app-server WebSocket bridge.
// No actual provider charges or access to user projects / sessions.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const executable=process.env.AGENT_TEST_CODEX||path.join(os.homedir(),'.npm-global/bin/codex');
if(!fs.existsSync(executable))throw Error('Real Codex executable is missing');
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-codex-native-tui-')));
const targetDir=path.join(temp,'target');fs.mkdirSync(targetDir);fs.mkdirSync(path.join(temp,'codex-home'));
process.env.CLOUD_HOSTS_HOME=path.join(temp,'cloudhosts');process.env.CODEX_HOME=path.join(temp,'codex-home');
for(const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_EXEC_SERVER_URL'])delete process.env[key];
const hosts=require('../src/agent-hosts.cjs'),native=require('../src/agent-native.cjs'),terminals=require('../src/terminals.cjs');
const quote=v=>"'"+String(v).replaceAll("'","'\\''")+"'";
const requests=[];
const model=http.createServer(async(req,res)=>{
 let str='';for await(const part of req)str+=part;
 if(!req.url.endsWith('/responses')){res.writeHead(404).end();return;}
 const body=JSON.parse(str);requests.push(body);
 const item={type:'message',id:'msg-tui-1',role:'assistant',content:[{type:'output_text',text:'TUI_FIXTURE_COMPLETE'}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const e of [{type:'response.created',response:{id:'resp-tui-1',status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp-tui-1',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write('event: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');
 res.end();
});
(async()=>{
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 const flags=['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${model.address().port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0','-c','model_providers.fixture.stream_max_retries=0'];
 const wrapper=path.join(temp,'codex');fs.writeFileSync(wrapper,'#!/bin/sh\nexec '+[executable,...flags].map(quote).join(' ')+' "$@"\n',{mode:0o755});
 process.env.CLOUD_HOSTS_CODEX=wrapper;
 const originalGet=hosts.get;hosts.get=id=>({...originalGet(id),defaultDirectory:targetDir});
 const role={id:'tui-proof',name:'Original Codex TUI',engine:'codex',engineHostId:'local',targetHostId:'local',cwd:targetDir,permission:'full'};
 let client,terminal;const timeout=setTimeout(()=>{console.error('TUI_REAL_TIMEOUT');process.exitCode=1;void client?.close();},65000);
 try{
  const fresh=process.argv.includes('--new');
  client=await native.open(role,()=>{},{deferThread:fresh});
  if(fresh){assert.equal(role.threadId,undefined);assert.equal(role.nativePendingThread,true)}
  else{
   assert.ok(role.threadId);assert.equal(requests.length,0);
   await client.send('Isolated fixture warmup');
   for(let i=0;i<350&&client.busy;i++)await new Promise(r=>setTimeout(r,40));
   assert.equal(client.busy,false);
  }
  const earlier=requests.length;
  const endpoint=await client.tuiEndpoint();
  const args=['--remote',endpoint.url,'--remote-auth-token-env','CLOUD_HOSTS_TUI_AUTH_TOKEN'];
  if(role.threadId)args.push('resume',role.threadId);
  terminal=terminals.openTerminal({id:'host:local',cwd:targetDir},100,30,{kind:'agent',engine:'codex',command:'codex',executable:wrapper,args,tuiToken:endpoint.token});
  let output='';
  for(let i=0;i<100;i++){
   const t=await terminals.read(terminal.id,0);output=t.output||'';
   if(!t.running)throw Error('Native Codex TUI exited early: '+output.slice(-2400));
   if(/Codex|\> |\? for shortcuts|How can I help|Thread ID|Worktree/i.test(output))break;
   await new Promise(r=>setTimeout(r,80));
  }
  if(fresh){
   for(let i=0;i<180&&!role.threadId;i++)await new Promise(r=>setTimeout(r,50));
   assert.ok(role.threadId,'Original TUI did not register its own new thread with CloudHosts');
   assert.equal(role.nativePendingThread,false);
   console.log('REAL_FRESH_TUI_CREATED_AND_BOUND_EXACT_THREAD='+role.threadId);
  }
  assert.ok(output.length>80,'Expected interactive native TUI screen data; got '+JSON.stringify(output.slice(-300)));
  assert.equal(requests.length,earlier,'TUI resume must not send a model turn');
  const still=await terminals.read(terminal.id,0);assert.ok(still.running);
  console.log('REAL_CODEX_TUI_CONNECTED_TO_EXACT_EXISTING_APP_SERVER_THREAD=PASS');
  console.log('REAL_CODEX_TUI_SCREEN_BYTES='+output.length);
  console.log('REAL_CODEX_TUI_NO_MODEL_INPUT_ON_RESUME=PASS');
  if(process.argv.includes('--turn')){
   // Resume has two phases: the title can paint before history is loaded.
   // Wait for the original thread transcript before simulating Enter.
   for(let i=0;i<130;i++){
    if(((await terminals.read(terminal.id,0)).output||'').includes(fresh?'Ask Codex to do anything':'TUI_FIXTURE_COMPLETE'))break;
    await new Promise(r=>setTimeout(r,90));
   }
   await terminals.input(terminal.id,'hello native codex tui');
   await new Promise(r=>setTimeout(r,220));
   await terminals.input(terminal.id,'\r');
   for(let i=0;i<300&&requests.length===earlier;i++)await new Promise(r=>setTimeout(r,70));
   if(requests.length===earlier){const current=await terminals.read(terminal.id,0);console.error('TUI_INPUT_DIAGNOSTIC='+JSON.stringify({running:current.running,exitCode:current.exitCode,lastOutput:(current.output||'').slice(-8000)}));}
   assert.ok(requests.length>earlier,'Native TUI did not submit entered task');
   assert.match(JSON.stringify(requests.at(-1).input),/hello native codex tui/);
   assert.doesNotMatch(JSON.stringify({input:requests.at(-1).input,instructions:requests.at(-1).instructions}),/CODEX_EXEC_SERVER_URL|cloud_hosts|exec-server/i);
   console.log('REAL_NATIVE_TUI_INPUT_REACHES_UNMODIFIED_MODEL_CONTEXT=PASS');
  }
 }finally{
  clearTimeout(timeout);if(terminal)await terminals.close(terminal.id);
  await client?.close();hosts.get=originalGet;
  model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
