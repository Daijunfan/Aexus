// Real Codex + native execution protocol, a deterministic HTTP model fixture; no inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {spawn,execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-ne-')))
const windows=process.env.AGENTS_COMPANY_LIVE_OS==='windows';
const safety=process.env.AGENTS_COMPANY_NATIVE_SAFETY==='1',sentinel=path.join(temp,'mac-sentinel'),offline=path.join(temp,'offline'),sshPids=path.join(temp,'ssh-pids');
if(safety)fs.writeFileSync(sentinel,'UNCHANGED');
const artifact=path.join(root,safety?'artifacts/cloud-safety/native-negative':windows?'artifacts/native-windows-audit':'artifacts/native-executor-audit');fs.mkdirSync(artifact,{recursive:true})
const native=path.join(os.homedir(),'.npm-global/bin/codex'),remote=process.env.AGENTS_COMPANY_LIVE_ROOT||path.join(temp,'workspace'),host=process.env.AGENTS_COMPANY_LIVE_HOST||'fixture'
if(host==='fixture')fs.mkdirSync(remote)
const model=http.createServer(),requests=[],events=[],proof='NATIVE_ROUTED_'+Date.now(),filename='native-route-proof.txt'
model.on('request',async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk
 if(!req.url?.endsWith('/responses')){res.writeHead(404).end();return}
 let request;try{request=JSON.parse(raw)}catch{res.writeHead(404).end();return}
 if(!JSON.stringify(request.input).includes('查看当前电脑的环境是什么？CPU是什么？GPU是什么？操作系统是什么？')){console.error('Unexpected auxiliary model request');res.writeHead(500).end();return}
 requests.push(request)
 fs.writeFileSync(path.join(artifact,'captured-request.json'),JSON.stringify(request,null,2),{mode:0o600})
 const tools=[...(request.tools??[]),...(request.input??[]).filter(x=>x.type==='additional_tools').flatMap(x=>x.tools||[])]
 const names=tools.flatMap(t=>t.type==='namespace'?t.tools.map(tool=>tool.name):[t.name])
 let item
 if(requests.length===1){
  if(!names.includes('exec_command')&&!names.includes('exec')){console.error('NO TOOLS',req.url,names);res.writeHead(500).end();return}
  const params={cmd:windows?`[IO.File]::WriteAllText((Join-Path (Get-Location) '${filename}'),'${proof}'); Get-Content '${filename}'; (Get-Location).Path`:process.env.AGENTS_COMPANY_CONTEXT_ONLY==='1'?'pwd; uname -s':`printf '${proof}' > ${filename}; cat ${filename}; pwd${host==='fixture'?' ; sleep 30':''}`,workdir:remote,max_output_tokens:500,yield_time_ms:windows?10000:1000};
  item=names.includes('exec_command')?{type:'function_call',id:'fc_1',call_id:'call_1',name:'exec_command',arguments:JSON.stringify(params)}:{type:'custom_tool_call',id:'fc_1',call_id:'call_1',name:'exec',input:`const r=await tools.exec_command(${JSON.stringify(params)});text(r)`}
 }else if(safety&&requests.length===2){
  const params={cmd:`printf ESCAPE > '${sentinel}'; cat '${sentinel}'`,workdir:remote,max_output_tokens:300};
  item=names.includes('exec_command')?{type:'function_call',id:'fc_escape',call_id:'call_escape',name:'exec_command',arguments:JSON.stringify(params)}:{type:'custom_tool_call',id:'fc_escape',call_id:'call_escape',name:'exec',input:`const r=await tools.exec_command(${JSON.stringify(params)});text(r)`};
 }else item={type:'message',id:'msg_1',role:'assistant',content:[{type:'output_text',text:'NATIVE_AUDIT_COMPLETE'}]}
 res.writeHead(200,{'content-type':'text/event-stream'})
 for(const event of [{type:'response.created',response:{id:'resp_'+requests.length,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'resp_'+requests.length,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
 res.end()
})
await new Promise(r=>model.listen(0,'127.0.0.1',r))
const bin=path.join(temp,'bin');fs.mkdirSync(bin)
const retryFirstHandshake=process.env.AGENTS_COMPANY_NATIVE_RETRY==='1',slowMarker=path.join(temp,'slow-ssh-started')
if(retryFirstHandshake)fs.writeFileSync(path.join(bin,'ssh'),`#!/bin/sh
if [ ! -f '${slowMarker}' ]; then
  touch '${slowMarker}'
  sleep 12
fi
exec /usr/bin/ssh "$@"
`,{mode:0o755})
if(host==='fixture'&&!retryFirstHandshake)fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
if(safety){
 assert.ok(host!=='fixture'&&!windows,'Safety test requires a real Linux SSH target');
 fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys
if os.path.exists(${JSON.stringify(offline)}):
 sys.stderr.write('Audit: SSH connection unavailable\\n');sys.exit(255)
with open(${JSON.stringify(sshPids)},'a') as f: f.write(str(os.getpid())+'\\n')
os.execv('/usr/bin/ssh',['ssh']+sys.argv[1:])
`,{mode:0o755})
}
// Executor-side codex is real. The model fixture is only injected into the host-side invocation.
fs.symlinkSync(native,path.join(bin,'codex'))
const wrapper=path.join(bin,'host-codex')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('node:child_process');const args=process.argv.slice(2);
const extras=['-c','model_provider="audit"','-c','model_providers.audit.name="audit"','-c','model_providers.audit.base_url="http://127.0.0.1:${model.address().port}"','-c','model_providers.audit.wire_api="responses"','-c','model_providers.audit.requires_openai_auth=false','-c','model_providers.audit.request_max_retries=0','-c','model_providers.audit.stream_max_retries=0'];
const p=spawn(${JSON.stringify(native)},args[0]==='exec'?['exec',...extras,...args.slice(1)]:[...extras,...args],{stdio:['pipe','pipe','pipe']});process.stdin.pipe(p.stdin);p.stdout.pipe(process.stdout);p.stderr.pipe(process.stderr);p.on('exit',code=>process.exitCode=code??1);process.on('SIGTERM',()=>p.kill('SIGTERM'));
`,{mode:0o755})
fs.mkdirSync(path.join(temp,'codex-home'),{recursive:true})
Object.assign(process.env,{AGENTS_COMPANY_HOME:temp,CODEX_HOME:path.join(temp,'codex-home'),CODEX_BIN:wrapper,AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel'),PATH:bin+':'+process.env.PATH})
const bundle=path.join(temp,'core.cjs');await build({stdin:{contents:"export * from './src/main/codex'; export {deleteNativeSessions,forkEmployeeContext,withCodexSessionApi} from './src/main/native-sessions';export {nativeCodexRequest,closeNativeCodexSession} from './src/main/codex-native'",resolveDir:root,loader:'ts'},bundle:true,alias:{'@anthropic-ai/claude-agent-sdk':require.resolve('@anthropic-ai/claude-agent-sdk')},external:[require.resolve('@anthropic-ai/claude-agent-sdk')],platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'})
const {runCodexTurn}=require(bundle),target={host,directory:remote,os:windows?'windows':host==='fixture'?'macos':'linux'}
const forks=[];const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),60000)
try{
 await runCodexTurn({connectionId:'native-persistent-test',cwd:remote,remote:target,model:'gpt-5.6-luna',effort:'low',serviceTier:'priority',sandbox:'workspace-write',prompt:'查看当前电脑的环境是什么？CPU是什么？GPU是什么？操作系统是什么？',signal:abort.signal,onEvent:event=>events.push(event)})
 fs.writeFileSync(path.join(artifact,'native-protocol-events.json'),JSON.stringify(events,null,2))
 assert.ok(requests.length>=2,'native tool must return a result and continue the conversation')
 assert.ok(requests.every(r=>r.model==='gpt-5.6-luna'&&r.reasoning?.effort==='low'&&r.service_tier==='priority'),'Native Responses requests must use the chosen Luna/low/Fast tier')
 console.log('PASS official Codex puts Luna/low/priority on the actual Responses wire request')
 const request=requests[0],visible=JSON.stringify({instructions:request.instructions,input:request.input,tools:request.tools})
 fs.writeFileSync(path.join(artifact,'model-request.json'),JSON.stringify(request,null,2),{mode:0o600})
 fs.writeFileSync(path.join(artifact,'native-protocol-events.json'),JSON.stringify(events,null,2))
 const forbidden=/(?:tunnel|exec-server|\bssh\b|\/Users\/|\/private\/|\/Applications\/|\/opt\/homebrew)/i
 assert.ok(!forbidden.test(host==='fixture'?visible.replaceAll(remote,'<workspace>'):visible),'Transport or Mac context leaked: '+visible.match(forbidden)?.[0])
 assert.ok((host==='fixture'||windows)&&process.env.AGENTS_COMPANY_CONTEXT_ONLY!=='1'?requests.some(r=>r.input?.some(item=>/call_output$/.test(item.type)&&JSON.stringify(item.output).includes(proof)&&(windows||JSON.stringify(item.output).includes(remote)))):events.some(e=>e.kind==='tool-end'&&e.exitCode===0&&(process.env.AGENTS_COMPANY_CONTEXT_ONLY==='1'||e.output.includes(proof))&&e.output.includes(remote)),JSON.stringify(events))
 if(process.env.AGENTS_COMPANY_CONTEXT_ONLY==='1'){}
 else if(host==='fixture')assert.equal(fs.readFileSync(path.join(remote,filename),'utf8'),proof)
 else if(windows)assert.equal(execFileSync('ssh',['-T','-o','BatchMode=yes',host,`[IO.File]::ReadAllText('${remote}\\${filename}')`],{encoding:'utf8'}).trim(),proof)
 else assert.equal(execFileSync('ssh',['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',host,`cd '${remote}' && cat '${filename}'`],{encoding:'utf8'}),proof)
 assert.ok(!fs.existsSync(path.join(temp,filename)),'Work file leaked to host cwd')
 console.log('PASS native tool definitions and prompt contain no tunnel, exec-server, SSH or Mac paths')
 console.log(process.env.AGENTS_COMPANY_CONTEXT_ONLY==='1'?'PASS ordinary native commands execute in the selected workspace':'PASS ordinary exec_command writes/reads through native execution, verified independently')
 console.log('PASS no model inference; original tool results return to Codex')
 if(host==='fixture'){
  const background=await require(bundle).nativeCodexRequest('native-persistent-test','thread/backgroundTerminals/list');assert.ok(background.data.some(p=>p.command.includes('sleep 30')),'Background terminal must outlive the first model turn')
  const again=[];await runCodexTurn({connectionId:'native-persistent-test',cwd:remote,remote:target,resumeId:events.find(e=>e.kind==='thread').threadId,model:'gpt-5.6-luna',effort:'low',sandbox:'workspace-write',prompt:'Continue without changing files.',signal:abort.signal,onEvent:event=>again.push(event)})
  assert.notEqual(requests.at(-1).service_tier,'priority','Disabling Fast on a persistent connection must stop requesting Priority')
  assert.ok((await require(bundle).nativeCodexRequest('native-persistent-test','thread/backgroundTerminals/list')).data.length>0)
  await require(bundle).nativeCodexRequest('native-persistent-test','thread/backgroundTerminals/clean');assert.equal((await require(bundle).nativeCodexRequest('native-persistent-test','thread/backgroundTerminals/list')).data.length,0)
  console.log('PASS real native connection keeps background terminals alive across turns and stops them through its scoped API')
 }
 const sourceThread=events.find(e=>e.kind==='thread').threadId,branchDirectory=windows?path.win32.join(remote,'branch-'+Date.now()):path.join(remote,'branch');if(host==='fixture')fs.mkdirSync(branchDirectory)
 if(windows){
  execFileSync('ssh',['-T','-o','BatchMode=yes',host,`New-Item -ItemType Directory -Path '${branchDirectory}' | Out-Null`])
  const beforeFork=requests.length,fork=await require(bundle).forkEmployeeContext({engine:'codex',threadId:sourceThread,model:'gpt-5.6-luna',cwd:remote,remote:target},branchDirectory,'Windows branch');forks.push(fork.threadId)
  assert.equal(requests.length,beforeFork);assert.notEqual(fork.threadId,sourceThread)
  const continuation=[];await runCodexTurn({cwd:branchDirectory,remote:{...target,directory:branchDirectory},resumeId:fork.threadId,model:'gpt-5.6-luna',effort:'low',sandbox:'workspace-write',prompt:'Continue without changing files.',signal:abort.signal,onEvent:e=>continuation.push(e)})
  assert.ok(continuation.some(e=>e.kind==='text'&&e.text==='NATIVE_AUDIT_COMPLETE'),JSON.stringify(continuation))
  const input=JSON.stringify(requests.at(-1).input);assert.ok(input.includes(branchDirectory.replaceAll('\\','\\\\')),'Cloned model context must use its Windows directory')
  execFileSync('ssh',['-T','-o','BatchMode=yes',host,`Remove-Item -LiteralPath '${branchDirectory}' -Recurse -Force`])
  console.log('PASS Windows native session cloning and continuation in independent directory')
 }
 if(host==='fixture'){
  const beforeFork=requests.length,fork=await require(bundle).forkEmployeeContext({engine:'codex',threadId:sourceThread,model:'gpt-5.6-luna',cwd:remote,remote:target},branchDirectory,'Independent native branch');forks.push(fork.threadId)
  assert.notEqual(fork.threadId,sourceThread);assert.equal(requests.length,beforeFork,'Fork must not generate a model turn')
  const copy=await require(bundle).withCodexSessionApi(call=>call('thread/read',{threadId:fork.threadId,includeTurns:true}));assert.equal(copy.thread.name,'Independent native branch');assert.ok(JSON.stringify(copy.thread.turns).includes('NATIVE_AUDIT_COMPLETE'))
  const continuation=[];await runCodexTurn({cwd:branchDirectory,remote:{...target,directory:branchDirectory},resumeId:fork.threadId,model:'gpt-5.6-luna',effort:'low',serviceTier:'priority',sandbox:'workspace-write',prompt:'Continue the cloned conversation without changing files.',signal:abort.signal,onEvent:event=>continuation.push(event)})
  assert.ok(continuation.some(e=>e.kind==='thread'&&e.threadId===fork.threadId));assert.ok(continuation.some(e=>e.kind==='text'&&e.text==='NATIVE_AUDIT_COMPLETE'));assert.ok(JSON.stringify(requests.at(-1).input).includes('NATIVE_AUDIT_COMPLETE'))
  const resumedBranch=await require(bundle).withCodexSessionApi(call=>call('thread/read',{threadId:fork.threadId,includeTurns:true}));assert.equal(resumedBranch.thread.cwd,branchDirectory)
  await require(bundle).deleteNativeSessions([{engine:'codex',id:fork.threadId}]);forks.length=0
  const original=await require(bundle).withCodexSessionApi(call=>call('thread/read',{threadId:sourceThread,includeTurns:true}));assert.ok(JSON.stringify(original.thread.turns).includes('NATIVE_AUDIT_COMPLETE'))
  const survivor=await require(bundle).forkEmployeeContext({engine:'codex',threadId:sourceThread,model:'gpt-5.6-luna',cwd:remote,remote:target},branchDirectory,'Surviving branch');forks.push(survivor.threadId)
  await require(bundle).closeNativeCodexSession('native-persistent-test');await require(bundle).deleteNativeSessions([{engine:'codex',id:sourceThread}]);const survived=await require(bundle).withCodexSessionApi(call=>call('thread/read',{threadId:survivor.threadId,includeTurns:true}));assert.ok(JSON.stringify(survived.thread.turns).includes('NATIVE_AUDIT_COMPLETE'))
  console.log('PASS actual Codex forks native context into a new named cloud workspace; deleting the branch preserves its source')
 }
 const count=requests.length,failed=[]
 await runCodexTurn({cwd:remote+'/missing-'+Date.now(),remote:{...target,directory:remote+'/missing-'+Date.now()},model:'gpt-5.6-luna',effort:'low',sandbox:'workspace-write',prompt:'Read this folder.',signal:abort.signal,onEvent:event=>failed.push(event)})
 assert.equal(requests.length,count,'Unavailable execution environment must fail before calling the model')
 assert.ok(failed.some(event=>event.kind==='notice'&&event.level==='error'))
 console.log('PASS unavailable working directory fails before any model request')
 if(retryFirstHandshake){assert.ok(fs.existsSync(slowMarker));assert.ok(requests.length>=2,'Delayed first SSH handshake must recover before the model request');console.log('PASS 12-second first SSH start exceeds the native 10-second handshake, then reconnects before any model turn')}
 if(safety){
  assert.equal(fs.readFileSync(sentinel,'utf8'),'UNCHANGED');
  assert.ok(requests.some(r=>r.input?.some(item=>/call_output$/.test(item.type)&&JSON.stringify(item.output).includes(sentinel))),'forced local-path attempt must have a real tool result');
  await assert.rejects(()=>require(bundle).nativeCodexRequest('native-persistent-test','environment/info',{environmentId:'local'}));
  console.log('PASS forced Mac-path command cannot touch the Mac; native local environment is unavailable');
  fs.writeFileSync(offline,'1');
  for(const pid of fs.readFileSync(sshPids,'utf8').trim().split('\n')){try{process.kill(Number(pid),'SIGTERM')}catch{}}
  const before=requests.length,disconnected=[],timeout=new AbortController(),cutoff=setTimeout(()=>timeout.abort(),40000);
  try{await runCodexTurn({connectionId:'native-persistent-test',cwd:remote,remote:target,resumeId:sourceThread,model:'gpt-5.6-luna',effort:'low',sandbox:'workspace-write',prompt:'Continue after the connection loss.',signal:timeout.signal,onEvent:event=>disconnected.push(event)})}finally{clearTimeout(cutoff)}
  assert.equal(requests.length,before,'SSH failure must not start a local model/tool turn');assert.equal(fs.readFileSync(sentinel,'utf8'),'UNCHANGED');assert.ok(disconnected.some(e=>e.kind==='notice'&&e.level==='error'),'connection failure must be reported');
  fs.writeFileSync(path.join(artifact,'summary.json'),JSON.stringify({success:true,forcedMacPathBlocked:true,localEnvironmentUnavailable:true,missingDirectoryFailsBeforeModel:true,disconnectFailsBeforeModel:true,macSentinelUnchanged:true,disconnected},null,2));
  console.log('PASS forced SSH disconnection fails closed without local fallback');
 }
}finally{await require(bundle).closeNativeCodexSession('native-persistent-test');const ids=[...events.filter(e=>e.kind==='thread').map(e=>({engine:'codex',id:e.threadId})),...forks.map(id=>({engine:'codex',id}))];if(ids.length)await require(bundle).deleteNativeSessions(ids);clearTimeout(timer);await new Promise(r=>model.close(r));fs.rmSync(temp,{recursive:true,force:true})}
