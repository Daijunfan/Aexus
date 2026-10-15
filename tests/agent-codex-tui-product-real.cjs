// Real end-to-end Product API: Core-local source/work host, genuine Codex TUI.
// Uses isolated CODEX_HOME and a deterministic local model; no paid model task.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const executable=process.env.AGENT_TEST_CODEX||path.join(os.homedir(),'.npm-global/bin/codex');
if(!fs.existsSync(executable))throw Error('Real Codex binary missing');
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-product-tui-')));
const work=path.join(temp,'workspace');fs.mkdirSync(work);fs.mkdirSync(path.join(temp,'codex-home'));
Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CODEX_HOME:path.join(temp,'codex-home')});
for(const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_EXEC_SERVER_URL'])delete process.env[key];
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const prompts=[],model=http.createServer(async(req,res)=>{
 let input='';for await(const data of req)input+=data;
 if(!req.url.endsWith('/responses')){res.writeHead(404).end();return}
 prompts.push(JSON.parse(input));
 const item={type:'message',id:'m-tui-product',role:'assistant',content:[{type:'output_text',text:'PRODUCT_NATIVE_TUI_COMPLETE'}]};
 res.writeHead(200,{'content-type':'text/event-stream'});
 for(const event of [{type:'response.created',response:{id:'r-product',status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r-product',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
 res.end();
});
(async()=>{
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 const flags=['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${model.address().port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0'];
 const wrapper=path.join(temp,'codex');fs.writeFileSync(wrapper,'#!/bin/sh\nexec '+[executable,...flags].map(quote).join(' ')+' "$@"\n',{mode:0o755});process.env.CLOUD_HOSTS_CODEX=wrapper;
 const agents=require('../src/agent-sessions.cjs'),terminals=require('../src/terminals.cjs');
 let role;
 const timeout=setTimeout(()=>{console.error('PRODUCT_TUI_TIMEOUT');process.exitCode=1;void agents.shutdown();},95000);
 const read=id=>terminals.read(id,0);
 const wait=async(fn,ms=18000)=>{const until=Date.now()+ms;while(Date.now()<until){if(await fn())return true;await new Promise(resolve=>setTimeout(resolve,110))}return false};
 try{
  role=await agents.open({engineHostId:'local',targetHostId:'local',engine:'codex',name:'Original Product Codex TUI',directory:work,permission:'full'});
  assert.equal(role.transport,'native');assert.equal(role.threadId,undefined);assert.equal(role.nativePendingThread,true);
  assert.equal(prompts.length,0,'Creating a new role must not send a model request');
  const first=await agents.tui({id:'local',session:role.id});
  // Closing 30 view subscriptions does not close the backend PTY. Every
  // attach must return this same instance, even if clicks race on first open.
  const concurrent=await Promise.all(Array.from({length:30},()=>agents.tui({id:'local',session:role.id})));
  assert.ok(concurrent.every(value=>value.terminalId===first.terminalId));
  for(let i=0;i<30;i++){
    const reattached=await agents.tui({id:'local',session:role.id});
    assert.equal(reattached.terminalId,first.terminalId);
  }
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).tuiState,'ready','TUI is ready only with an authenticated WS controller');
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).engineHostState,'online');
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).workHostState,'online');
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).tuiGeneration,1);
  // One-shot TUI credentials must be consumed by the terminal broker. A 30x
  // reattach should never leave a reusable bearer token JSON on disk.
  const brokerFile=path.join(process.env.CLOUD_HOSTS_HOME,'terminal-'+first.terminalId+'.json');
  assert.ok(await wait(()=>!fs.existsSync(brokerFile),5000),'Original TUI config should be unlinked after parsing');
  assert.ok(!fs.readdirSync(process.env.CLOUD_HOSTS_HOME).some(name=>name.startsWith('terminal-')&&name.endsWith('.json')));
  console.log('PRODUCT_TUI_BEARER_CONFIG_REMOVED_AFTER_HANDOFF=PASS');

  console.log('PRODUCT_30_VIEW_CLOSE_REOPEN_AND_FAST_CONCURRENT_ATTACH_REUSE_ONE_TUI=PASS');

  assert.ok(first.terminalId);
  assert.ok(await wait(()=>!!agents.sessions('local').find(item=>item.id===role.id)?.threadId));
  const thread=agents.sessions('local').find(item=>item.id===role.id).threadId;
  assert.match(thread,/^[a-f0-9-]{36}$/);
  assert.equal(prompts.length,0);
  assert.ok(await wait(async()=>((await read(first.terminalId)).output||'').includes('Ask Codex to do anything')));
  const output=await read(first.terminalId);
  assert.equal(output.running,true);assert.match(output.output,/OpenAI Codex/);
  console.log('PRODUCT_NEW_CODEX_ROLES_USE_UNMODIFIED_NATIVE_TUI=PASS');
  await terminals.input(first.terminalId,'Hello from original Codex terminal');
  await new Promise(resolve=>setTimeout(resolve,180));
  await terminals.input(first.terminalId,'\r');
  assert.ok(await wait(()=>prompts.length>0,25000),'Original TUI did not send the user task');
  assert.match(JSON.stringify(prompts[0].input),/Hello from original Codex terminal/);
  assert.doesNotMatch(JSON.stringify({instructions:prompts[0].instructions,input:prompts[0].input}),/CODEX_EXEC_SERVER_URL|exec-server|cloud_hosts/i);
  assert.ok(await wait(async()=>((await read(first.terminalId)).output||'').includes('PRODUCT_NATIVE_TUI_COMPLETE'),12000));
  console.log('PRODUCT_ORIGINAL_TUI_SENDS_UNMODIFIED_TASK=PASS');
  await terminals.close(first.terminalId);
  const afterExit=await Promise.all(Array.from({length:20},()=>agents.tui({id:'local',session:role.id})));
  const second=afterExit[0];
  assert.ok(afterExit.every(value=>value.terminalId===second.terminalId));
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).tuiGeneration,2);

  assert.notEqual(second.terminalId,first.terminalId);
  assert.equal(second.threadId,thread,'Reopening TUI must use exact original ID');
  assert.ok(await wait(async()=>((await read(second.terminalId)).output||'').includes('PRODUCT_NATIVE_TUI_COMPLETE'),18000));
  assert.equal(prompts.length,1,'Reopening original thread must not call model');
  console.log('PRODUCT_TUI_CTRL_C_RECONNECT_RESUMES_EXACT_THREAD_WITH_FULL_HISTORY=PASS');
  await terminals.input(second.terminalId,'/fork');await new Promise(r=>setTimeout(r,250));await terminals.input(second.terminalId,'\r');
  assert.ok(await wait(()=>agents.sessions('local').find(value=>value.id===role.id).threadId!==thread),'Original /fork should select its native fork');
  const fork=agents.sessions('local').find(value=>value.id===role.id).threadId;
  assert.equal(agents.sessions('local').find(value=>value.id===role.id).nativeHasInput,true);
  await terminals.close(second.terminalId);
  const forkTui=await agents.tui({id:'local',session:role.id});assert.equal(forkTui.threadId,fork);
  assert.ok(await wait(async()=>((await read(forkTui.terminalId)).output||'').includes('PRODUCT_NATIVE_TUI_COMPLETE')));
  assert.equal(prompts.length,1);
  console.log('PRODUCT_NATIVE_FORK_PRESERVES_HISTORY=PASS');
  await terminals.input(forkTui.terminalId,'/new');await new Promise(r=>setTimeout(r,250));await terminals.input(forkTui.terminalId,'\r');
  assert.ok(await wait(()=>agents.sessions('local').find(value=>value.id===role.id).threadId!==fork));
  const current=agents.sessions('local').find(value=>value.id===role.id).threadId;
  await terminals.close(forkTui.terminalId);
  assert.equal((await agents.tui({id:'local',session:role.id})).threadId,current);
  assert.equal(prompts.length,1,'Native /new and reattachment do not submit a model prompt');
  console.log('PRODUCT_NATIVE_NEW_SESSION_EXACT_RECONNECT=PASS');
  const empty=await agents.open({engineHostId:'local',targetHostId:'local',engine:'codex',name:'Untouched native session',directory:work});
  await agents.tui({id:'local',session:empty.id});
  assert.ok(await wait(()=>!!agents.sessions('local').find(item=>item.id===empty.id)?.threadId));
  await agents.close({id:'local',session:empty.id});
  await agents.activate({id:'local',session:empty.id});
  const emptyAgain=await agents.tui({id:'local',session:empty.id});
  assert.equal(emptyAgain.id,empty.id);assert.equal(emptyAgain.running,true);assert.equal(prompts.length,1);
  await agents.close({id:'local',session:empty.id});await agents.remove({id:'local',session:empty.id,confirm:true});
  console.log('PRODUCT_EMPTY_ENGINE_RESTART_WITHOUT_A_MODEL_PROMPT=PASS');
 }finally{
  clearTimeout(timeout);
  if(role&&agents.sessions('local').some(item=>item.id===role.id)){
   await agents.close({id:'local',session:role.id});await agents.remove({id:'local',session:role.id,confirm:true});
  }
  await agents.shutdown();await terminals.shutdown();
  model.closeAllConnections();await new Promise(resolve=>model.close(resolve));
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
