import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {randomUUID} from 'node:crypto'
import http from 'node:http'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-life-')))
const cascade=process.argv.includes('--teams')
const home=path.join(temp,'app'),codexHome=path.join(temp,'codex'),claudeHome=path.join(temp,'claude'),work=path.join(temp,'work'),projects=path.join(temp,'projects')
for(const p of [home,codexHome,claudeHome,work,projects])fs.mkdirSync(p)
const env={...process.env,AGENTS_COMPANY_HOME:home,CODEX_HOME:codexHome,CLAUDE_CONFIG_DIR:claudeHome,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_PROJECTS:projects}
Object.assign(process.env,env)
await build({entryPoints:['src/main/native-sessions.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'native.cjs'),alias:{'@anthropic-ai/claude-agent-sdk':require.resolve('@anthropic-ai/claude-agent-sdk')},external:[require.resolve('@anthropic-ai/claude-agent-sdk')],logLevel:'silent'})
const {withCodexSessionApi}=require(path.join(temp,'native.cjs'))
await build({entryPoints:['src/main/exec.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'exec.cjs'),logLevel:'silent'})
const nativeBinary=require(path.join(temp,'exec.cjs')).resolveBinary('codex',process.env.CODEX_BIN)
const model=http.createServer(async(req,res)=>{
 let raw='';for await(const part of req)raw+=part
 if(!req.url?.endsWith('/responses')){res.writeHead(404).end();return}
 const body=JSON.parse(raw);assert.equal(body.model,'gpt-6-luna');assert.equal(body.reasoning?.effort,'low')
 const item={type:'message',id:'msg_'+randomUUID(),role:'assistant',content:[{type:'output_text',text:'Fixture context persisted.'}]}
 res.writeHead(200,{'content-type':'text/event-stream'})
 for(const event of [{type:'response.created',response:{id:'r_'+randomUUID(),status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r_'+randomUUID(),status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
 res.end()
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve))
const wrapper=path.join(temp,'codex-model-fixture.cjs')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('node:child_process'),args=process.argv.slice(2),extras=['-c','model_provider="lifecycle_fixture"','-c','model_providers.lifecycle_fixture.name="lifecycle_fixture"','-c','model_providers.lifecycle_fixture.base_url="http://127.0.0.1:${model.address().port}"','-c','model_providers.lifecycle_fixture.wire_api="responses"','-c','model_providers.lifecycle_fixture.requires_openai_auth=false','-c','model_providers.lifecycle_fixture.request_max_retries=0','-c','model_providers.lifecycle_fixture.stream_max_retries=0'];const child=spawn(${JSON.stringify(nativeBinary)},[...extras,...args],{stdio:['pipe','pipe','pipe']});process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('exit',code=>process.exitCode=code??1);process.on('SIGTERM',()=>child.kill('SIGTERM'));
`,{mode:0o755})
env.CODEX_BIN=wrapper;process.env.CODEX_BIN=wrapper
const {getSessionInfo,listSessions,renameSession}=await import('@anthropic-ai/claude-agent-sdk')
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'bin/agents')]
let daemon,done;const cli=async(...args)=>{const response=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:35000})).stdout);assert.ok(response.ok,response.error);return response.data}
const start=async()=>{daemon=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'});done=new Promise(r=>daemon.once('exit',r));for(let i=0;i<100;i++){try{await cli('status');return}catch{await new Promise(r=>setTimeout(r,30))}}throw new Error('Service unavailable')}
const stop=async()=>{daemon.kill('SIGTERM');await done}
const stateFile=path.join(home,'sessions.json'),setCard=(id,patch)=>{const state=JSON.parse(fs.readFileSync(stateFile));Object.assign(state.sessions.find(c=>c.id===id),patch);fs.writeFileSync(stateFile,JSON.stringify(state))}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await start();await cli('group','add','Planning','--mode','work','--plugin','mininotion');await cli('group','add','Build')
 const code=await cli('card','create','--title','开发 A','--group','Planning','--directory-mode','default')
 const claude=await cli('card','create','--title','Claude Writer','--engine','claude','--group','Planning','--directory-mode','default')
 ok(code.cwd===path.join(work,'mini-notion-workspace','开发 A')&&claude.cwd.endsWith('/Claude Writer'),'default directories exactly preserve employee names, spaces and case')
 fs.writeFileSync(path.join(code.cwd,'keep.md'),'working files stay')
 const outside=path.join(temp,'Physical Folder');fs.mkdirSync(outside)
 await assert.rejects(()=>cli('card','create','--title','Escape','--group','Planning','--directory-mode','bind','--cwd',outside))
 const builder=await cli('card','create','--title','Builder','--group','Build','--directory-mode','bind','--cwd',outside)
 ok(builder.cwd===outside,'Build can bind a physical folder outside the Team project; Work cannot')
 await assert.rejects(()=>cli('card','create','--title','Override','--group','Planning','--directory-mode','default','--cwd','arbitrary'))
 await assert.rejects(()=>cli('card','create','--title','Bad/name','--group','Planning','--directory-mode','default'))
 await assert.rejects(()=>cli('card','create','--title','Missing','--group','Planning','--directory-mode','bind','--cwd','missing'))
 ok(!fs.existsSync(path.join(work,'mini-notion-workspace/missing')),'default mode rejects path overrides and bind mode never creates a missing folder')
 await assert.rejects(()=>cli('card','rename',code.id,'改过的会话名'));ok((await cli('session','list')).sessions.find(c=>c.id===code.id).cwd===code.cwd,'employee renaming is rejected without moving its directory')
 const persist=async(call,cwd)=>{const r=await call('thread/start',{model:'gpt-6-luna',config:{model_reasoning_effort:'low'},cwd,approvalPolicy:'never',sandbox:'read-only'});assert.equal(r.model,'gpt-6-luna');assert.equal(r.reasoningEffort,'low');await call('turn/start',{threadId:r.thread.id,input:[{type:'text',text:'Persist a fixture context.'}],cwd,model:'gpt-6-luna',effort:'low',approvalPolicy:'never',sandboxPolicy:{type:'readOnly'}});for(let i=0;i<100;i++){try{const read=await call('thread/read',{threadId:r.thread.id,includeTurns:true});if(read.thread.turns?.length)return read.thread}catch{}await new Promise(resolve=>setTimeout(resolve,50))}throw new Error('Fixture thread was not persisted')}
 const native=await withCodexSessionApi(async call=>{const ids=[];for(const name of ['old-context','current-context','unrelated-control']){const thread=await persist(call,code.cwd);await call('thread/name/set',{threadId:thread.id,name});if(name==='old-context')await call('thread/archive',{threadId:thread.id});ids.push(thread.id)}return ids})
 setCard(code.id,{threadId:native[0]})
 const moved=path.join(work,'mini-notion-workspace','Rebound');fs.mkdirSync(moved)
 await cli('card','update',code.id,'--directory-mode','bind','--cwd',moved)
 let changed=(await cli('session','list')).sessions.find(c=>c.id===code.id)
 ok(!changed.threadId&&changed.nativeSessions.some(s=>s.id===native[0]),'workspace changes retain the prior native session association')
 setCard(code.id,{threadId:native[1]})
 fs.mkdirSync(path.join(home,'backups'));fs.writeFileSync(path.join(home,'backups','before-upgrade.json'),JSON.stringify({sessions:[{...code,threadId:native[0]}]}))
 setCard(code.id,{nativeSessions:[]})
 const sdkId=randomUUID(),otherId=randomUUID(),projectDir=path.join(claudeHome,'projects',claude.cwd.replace(/[^a-z0-9]/gi,'-'));fs.mkdirSync(projectDir,{recursive:true})
 for(const [id,text] of [[sdkId,'delete Claude conversation'],[otherId,'keep Claude conversation']]){
  fs.writeFileSync(path.join(projectDir,id+'.jsonl'),JSON.stringify({type:'user',sessionId:id,uuid:randomUUID(),timestamp:new Date().toISOString(),cwd:claude.cwd,message:{role:'user',content:text}})+'\n')
  await renameSession(id,text)
 }
 fs.mkdirSync(path.join(projectDir,sdkId,'subagents'),{recursive:true});fs.writeFileSync(path.join(projectDir,sdkId,'subagents','child.jsonl'),'associated child')
 assert.ok(await getSessionInfo(sdkId));setCard(claude.id,{claudeSessionId:sdkId})
 fs.writeFileSync(path.join(codexHome,'session_index.jsonl'),native.map(id=>JSON.stringify({id,thread_name:id})).join('\n')+'\n')
 fs.writeFileSync(path.join(codexHome,'history.jsonl'),native.map(id=>JSON.stringify({session_id:id,text:id})).join('\n')+'\n')
 fs.writeFileSync(path.join(claudeHome,'history.jsonl'),[sdkId,otherId].map(sessionId=>JSON.stringify({sessionId,display:sessionId})).join('\n')+'\n')
 fs.writeFileSync(path.join(projectDir,'sessions-index.json'),JSON.stringify({version:1,entries:[{sessionId:sdkId,summary:'delete'},{sessionId:otherId,summary:'keep'}]}))
 fs.mkdirSync(path.join(home,'transcripts'));for(const card of [code,claude])fs.writeFileSync(path.join(home,'transcripts',card.id+'.json'),'[{"role":"user","id":"u","text":"private transcript"}]')
 if(cascade){
  // Shared references among employees being removed must be deduplicated, not rejected.
  setCard(claude.id,{nativeSessions:[{engine:'codex',id:native[1]}]})
  await cli('room','bounds','Planning','--width','700','--height','700')
  await cli('view','open','team','--name','Planning')
  await cli('group','remove','Planning')
  const state=await cli('session','list')
  ok(!state.groups.includes('Planning')&&!state.teamRoots.Planning&&!state.teamSettings.Planning&&!state.rooms.Planning&&(await cli('view','get')).kind==='home','Team cascade removes settings, canvas room and active Team view together')
 }else await cli('card','remove',code.id)
 const visible=await withCodexSessionApi(async call=>{for(const threadId of native.slice(0,2))await assert.rejects(()=>call('thread/read',{threadId}));return await call('thread/read',{threadId:native[2]})})
 ok(visible.thread.id===native[2],'native Codex API no longer finds both the backed-up old context and current context; an unrelated thread survives')
 const index=fs.readFileSync(path.join(codexHome,'session_index.jsonl'),'utf8'),history=fs.readFileSync(path.join(codexHome,'history.jsonl'),'utf8')
 ok(!index.includes(native[0])&&!index.includes(native[1])&&index.includes(native[2])&&!history.includes(native[0])&&history.includes(native[2]),'Codex name cache and history remove only exact associated IDs')
 if(!cascade)await cli('card','remove',claude.id)
 ok(!(await getSessionInfo(sdkId))&&(await getSessionInfo(otherId))&&!(await listSessions()).some(s=>s.sessionId===sdkId),'Claude SDK lookup and resume list cannot find the removed employee')
 ok(!fs.existsSync(path.join(projectDir,sdkId))&&fs.existsSync(path.join(projectDir,otherId+'.jsonl')),'Claude subagent transcripts are removed without touching unrelated sessions')
 ok(!fs.readFileSync(path.join(claudeHome,'history.jsonl'),'utf8').includes(sdkId)&&JSON.parse(fs.readFileSync(path.join(projectDir,'sessions-index.json'))).entries.length===1,'Claude name/history indexes are cleaned by session ID')
 ok(!fs.existsSync(path.join(home,'transcripts',code.id+'.json'))&&!fs.existsSync(path.join(home,'transcripts',claude.id+'.json'))&&fs.readFileSync(path.join(code.cwd,'keep.md'),'utf8')==='working files stay','host transcripts are deleted and actual work files remain')
 await stop();await start();ok((await cli('session','list')).sessions.length===1,'deleted employees and sessions remain deleted after restarting')
 // A native writer can publish its ID during shutdown; removal waits for it.
 const busyCard=await cli('card','create','--title','Late native ID','--group','Build')
 const busyThread=await withCodexSessionApi(async call=>{const thread=await persist(call,busyCard.cwd);await call('thread/name/set',{threadId:thread.id,name:'late-writer'});return thread})
 const originalRollout=fs.readFileSync(busyThread.path,'utf8'),started=path.join(temp,'writer-started'),finished=path.join(temp,'writer-finished'),wrapper=path.join(temp,'codex-wrapper.cjs')
 fs.writeFileSync(wrapper,`#!/usr/bin/env node
const fs=require('fs'),{spawn}=require('child_process'),readline=require('readline'),args=process.argv.slice(2);let writer=false,stopping=false;
const child=spawn(${JSON.stringify(nativeBinary)},args,{stdio:['pipe','pipe','pipe'],env:process.env});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('exit',code=>{if(!writer)process.exit(code||0)});
readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line);if(request.method==='thread/start'){writer=true;fs.writeFileSync(${JSON.stringify(started)},'ready');return}if(request.method==='turn/start')throw new Error('Inference is forbidden in this fixture');child.stdin.write(line+'\\n')});
process.stdin.on('end',()=>{if(!writer)child.stdin.end()});process.on('SIGTERM',()=>{if(stopping)return;stopping=true;if(!writer){child.kill('SIGTERM');return}setTimeout(()=>{process.stdout.write(JSON.stringify({method:'thread/started',params:{thread:{id:${JSON.stringify(busyThread.id)}}}})+'\\n');setTimeout(()=>{fs.writeFileSync(${JSON.stringify(busyThread.path)},${JSON.stringify(originalRollout)});fs.writeFileSync(${JSON.stringify(finished)},'closed');child.kill('SIGTERM');process.exit(0)},80)},80)});
`,{mode:0o755})
 await stop();env.CODEX_BIN=wrapper;await start()
 const live=await cli('session','open',busyCard.id);await cli('session','send',live.sessionId,'fixture only')
 for(let i=0;i<100&&!fs.existsSync(started);i++)await new Promise(r=>setTimeout(r,20))
 assert.ok(fs.existsSync(started));const deletion=cascade?cli('group','remove','Build'):cli('card','remove',busyCard.id)
 for(let i=0;i<50&&(await cli('session','list','--live')).some(s=>s.cardId===busyCard.id);i++)await new Promise(r=>setTimeout(r,10))
 await assert.rejects(()=>cli('session','open',busyCard.id))
 if(cascade)await assert.rejects(()=>cli('card','create','--title','Racing hire','--group','Build'))
 await deletion
 ok(fs.existsSync(finished)&&!fs.existsSync(busyThread.path)&&!(await cli('session','list')).sessions.some(c=>c.id===busyCard.id),'removal waits for the native writer and captures late IDs without resurrecting the employee')
 await withCodexSessionApi(async call=>{await assert.rejects(()=>call('thread/read',{threadId:busyThread.id}))})
 // Failure is visible and retains the employee for retry.
 if(cascade)await cli('group','add','Build')
 const retry=await cli('card','create','--title','Retry','--group','Build');setCard(retry.id,{threadId:native[2]})
 const retryPeer=cascade?await cli('card','create','--title','Retry peer','--group','Build'):undefined
 await stop();env.CODEX_BIN='/usr/bin/false';await start()
 await assert.rejects(()=>cascade?cli('group','remove','Build'):cli('card','remove',retry.id))
 ok((await cli('session','list')).sessions.some(c=>c.id===retry.id),'native API failure retains the employee and native references instead of reporting success')
 if(cascade){
  const failed=await cli('session','list');ok(failed.groups.includes('Build')&&failed.sessions.some(c=>c.id===retryPeer.id),'failed cascade retains Team and every employee so it can be retried')
  await stop();env.CODEX_BIN=nativeBinary;await start()
  await cli('group','remove','Build')
  ok(!(await cli('session','list')).sessions.length&&fs.existsSync(retry.cwd),'cascade retry clears all employees and preserves all workspaces')
 }
 console.log(`PASS=${n} FAIL=0 — native metadata APIs, no inference turns`)
}finally{if(daemon?.exitCode===null)await stop();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
