// Real installed Codex, deterministic localhost Responses fixture. No paid model or user workspaces.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const executable = process.env.AGENT_TEST_CODEX || path.join(os.homedir(),'.npm-global/bin/codex');
if (!fs.existsSync(executable)) throw Error('Set AGENT_TEST_CODEX to an installed Codex executable');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloud-native-fixture-')));
const targetDir = path.join(temp,'target'),sourceDir = path.join(temp,'source');
fs.mkdirSync(targetDir);fs.mkdirSync(sourceDir);fs.mkdirSync(path.join(temp,'codex-home'));
Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CODEX_HOME:path.join(temp,'codex-home')});
for (const name of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_EXEC_SERVER_URL']) delete process.env[name];
const registry = require('../src/registry.cjs'),hosts = require('../src/agent-hosts.cjs'),native = require('../src/agent-native.cjs');
const target = registry.create({name:'Isolated target',host:'native-fixture.invalid',os:process.platform === 'darwin'?'macos':'linux',defaultDirectory:targetDir});
const requests=[],proof='CLOUD_HOSTS_NATIVE_PROOF',prompt='Verify the current workspace by running the requested test command.';
const model = http.createServer(async(req,res) => {
  let body='';for await (const chunk of req) body+=chunk;
  if (!req.url.endsWith('/responses')) {res.writeHead(404).end();return;}
  let request;try {request=JSON.parse(body);} catch {res.writeHead(400).end();return;}
  requests.push(request);
  const tools=[...(request.tools||[]),...(request.input||[]).filter(item=>item.type==='additional_tools').flatMap(item=>item.tools||[])];
  const names=tools.flatMap(tool=>tool.type==='namespace'?tool.tools.map(item=>item.name):[tool.name]);
  let item;
  if (requests.length===1) {
    const args={cmd:`printf '${proof}' > route-proof.txt; cat route-proof.txt; pwd`,workdir:targetDir,max_output_tokens:500,yield_time_ms:1000};
    if (names.includes('exec_command')) item={type:'function_call',id:'fc_1',call_id:'call_1',name:'exec_command',arguments:JSON.stringify(args)};
    else if (names.includes('exec')) item={type:'custom_tool_call',id:'fc_1',call_id:'call_1',name:'exec',input:`const result=await tools.exec_command(${JSON.stringify(args)});text(result)`};
    else {console.error('Unexpected native tools',names);res.writeHead(500).end();return;}
  } else item={type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'NATIVE_COMPLETE'}]};
  res.writeHead(200,{'content-type':'text/event-stream'});
  for(const event of [{type:'response.created',response:{id:'resp_'+requests.length,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_'+requests.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
});
(async()=>{
  await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const flags=['-c','model="gpt-5.1-codex"','-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${model.address().port}"`,'-c','model_providers.fixture.wire_api="responses"','-c','model_providers.fixture.requires_openai_auth=false','-c','model_providers.fixture.request_max_retries=0','-c','model_providers.fixture.stream_max_retries=0'];
  const wrapper=path.join(temp,'codex');fs.writeFileSync(wrapper,'#!/bin/sh\nexec '+[executable,...flags].map(quote).join(' ')+' "$@"\n',{mode:0o755});process.env.CLOUD_HOSTS_CODEX=wrapper;
  const originalProcess=hosts.processOn,originalDirectory=hosts.checkDirectory,originalGet=hosts.get;
  hosts.get=id=>id==='local'?{...originalGet(id),defaultDirectory:sourceDir}:originalGet(id);
  hosts.processOn=(host,engine,argv,options={})=>host.id===target.id?spawn(executable,argv,{cwd:options.cwd,env:process.env,stdio:['pipe','pipe','pipe']}):originalProcess(host,engine,argv,options);
  hosts.checkDirectory=async(host,cwd)=>{assert.ok(fs.statSync(cwd).isDirectory());};
  const role={id:'native-fixture',name:'No prompt wrapper',engine:'codex',engineHostId:'local',targetHostId:target.id,cwd:targetDir,permission:'full'};
  let client;const timeout=setTimeout(()=>{console.error('Native fixture timed out');void client?.close();model.closeAllConnections();model.close();process.exitCode=1;},60000);
  try {
    client=await native.open(role,()=>{});assert.equal(role.status,'idle');assert.equal(requests.length,0,'Opening a role must not call the model');
    await client.send(prompt);
    for(let n=0;n<500&&client.busy;n++)await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(client.busy,false,'Native turn should finish');
    const events=client.read().events;
    assert.ok(events.some(event=>event.kind==='message'&&event.text==='NATIVE_COMPLETE'),JSON.stringify(events));
    assert.equal(fs.readFileSync(path.join(targetDir,'route-proof.txt'),'utf8'),proof);
    assert.equal(fs.existsSync(path.join(sourceDir,'route-proof.txt')),false);
    assert.ok(requests.length>=2,'Tool result must continue the native conversation');
    const visible=JSON.stringify({instructions:requests[0].instructions,input:requests[0].input,tools:requests[0].tools});
    assert.ok(visible.includes(prompt));
    assert.ok(!visible.includes(sourceDir),'Source cwd leaked into model context');
    assert.doesNotMatch(visible,/CODEX_EXEC_SERVER_URL|exec-server|native-fixture\.invalid|\bssh\b|cloud_hosts|cloud_docs|cloud_api|cloud_reply|No prompt wrapper/i);
    assert.ok(events.some(event=>event.kind==='tool-result'&&event.text.includes(proof)&&event.text.includes(targetDir)));
    console.log('PASS real Codex: no model request on role creation; unmodified native tool executes in target workspace; source workspace untouched; model-visible context contains no route/source metadata.');
    const thread=role.threadId;await client.close();client=await native.open(role,()=>{});assert.equal(role.threadId,thread);assert.equal(requests.length,2);
    console.log('PASS original Codex thread survives explicit stop/restart with no automatic model turn.');
    await client.close();client=undefined;
    // A missing rollout MUST fail without starting an unrelated session.
    const staleId='01a12e0b-ad78-7610-abfc-635b4f0c56fa';
    role.threadId=staleId;
    await assert.rejects(native.open(role,()=>{},{requireResume:true}),/no rollout found for thread id|not found/i);
    assert.equal(role.threadId,staleId,'Exact original thread ID must be retained after a failed resume');
    assert.equal(requests.length,2,'Missing Codex rollout must not contact the model or create another thread');
    console.log('PASS unavailable Codex rollout stays bound to exact original ID; no fresh thread or model messages.');

  } finally {
    clearTimeout(timeout);await client?.close();hosts.processOn=originalProcess;hosts.checkDirectory=originalDirectory;hosts.get=originalGet;
    model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
