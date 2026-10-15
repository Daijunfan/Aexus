import {nativeFixture} from './native-fixture.mjs'
// Deterministic scheduling + real CLI/socket/engine-adapter tests. No windows or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-sch-'))),exec=promisify(execFile),require=createRequire(import.meta.url)
let passed=0
const ok=(condition,message)=>{assert.ok(condition,message);console.log('PASS '+message);passed++}
const timeEntry=path.join(temp,'time.cjs')
await build({entryPoints:[path.join(root,'src/main/scheduler/time.ts')],bundle:true,platform:'node',format:'cjs',outfile:timeEntry,logLevel:'silent'})
const {preview,inWindow,windowEnd,validateRule,validateWindow}=require(timeEntry)
const weekly={rule:{kind:'weekly',time:'09:30',days:[1,2,3,4,5],timezone:'Asia/Shanghai'}}
assert.deepEqual(preview(weekly,Date.parse('2026-09-18T02:00:00Z'),2),['2026-09-21T01:30:00.000Z','2026-09-22T01:30:00.000Z'])
ok(true,'weekly schedule respects IANA timezones and weekdays')
assert.deepEqual(preview({rule:{kind:'weekly',time:'02:30',days:[7],timezone:'America/New_York'}},Date.parse('2026-03-07T00:00:00Z'),2),['2026-03-08T07:30:00.000Z','2026-03-15T06:30:00.000Z'])
assert.deepEqual(preview({rule:{kind:'weekly',time:'01:30',days:[7],timezone:'America/New_York'}},Date.parse('2026-11-01T05:30:00Z'),1),['2026-11-08T06:30:00.000Z'])
ok(true,'DST skips shift forward and repeated wall times run once')
const night={start:'22:00',end:'02:00',timezone:'Asia/Shanghai',days:[1]}
ok(inWindow(night,Date.parse('2026-09-21T17:30:00Z'))&&!inWindow(night,Date.parse('2026-09-21T18:00:00Z'))&&!inWindow(night,Date.parse('2026-09-22T17:30:00Z')),'overnight windows belong to the starting weekday and exclude their end')
assert.deepEqual(preview({rule:{kind:'interval',anchor:'2026-09-18T00:00:00Z',everySeconds:1},window:{start:'09:00',end:'18:00',days:[1],timezone:'Asia/Shanghai'}},Date.parse('2026-09-18T00:00:00Z'),2),['2026-09-21T01:00:00.000Z','2026-09-21T01:00:01.000Z'])
ok(windowEnd(night,Date.parse('2026-09-21T17:30:00Z'))===Date.parse('2026-09-21T18:00:00Z'),'overnight execution deadline ends on the next calendar day')
ok(preview({...weekly,until:'2026-09-21T01:30:00Z'},Date.parse('2026-09-20T00:00:00Z')).length===0,'interval jumps to an allowed window; schedule end is exclusive')
assert.throws(()=>validateRule({kind:'weekly',time:'25:00',days:[1],timezone:'Asia/Shanghai'}))
assert.throws(()=>validateWindow({start:'09:00',end:'09:00',timezone:'invalid'}))
ok(true,'invalid dates, times and timezones are rejected')
const sdk=path.join(temp,'sdk.mjs'),binary=path.join(temp,'codex'),controls=path.join(temp,'controls.jsonl')
fs.writeFileSync(sdk,String.raw`import fs from 'node:fs';const record=(method,value)=>fs.appendFileSync(${JSON.stringify(controls)},JSON.stringify({method,value})+'\n');
export const createSdkMcpServer=options=>options;export const tool=(name,description,schema,handler)=>({name,handler});
export const deleteSession=async()=>{};export const forkSession=async()=>{throw new Error('Fork is not used by this fixture')};
export function query({prompt,options}){let closed=false;record('start',options.model);return {supportedCommands:async()=>[],supportedModels:async()=>[],setModel:async v=>record('model',v),setPermissionMode:async()=>{},setMaxThinkingTokens:async v=>record('thinking',v),applyFlagSettings:async v=>record('effort',v),interrupt:async()=>{},close(){closed=true},async *[Symbol.asyncIterator](){for await(const item of prompt){if(closed)break;record('prompt',item.message.content);if(String(item.message.content).includes('[Agents Company private initialization]')){const doc=options.mcpServers.agents_company.tools.find(tool=>tool.name==='agents_company_documentation');for(const operation of ['identity','index']){const result=await doc.handler({operation},{requestId:'scheduler-init-'+operation});if(result.isError)throw Error(JSON.stringify(result));}}yield {type:'assistant',message:{id:'fixture',content:[{type:'text',text:'Completed '+item.message.content}]}};yield {type:'result',subtype:'success'}}}}}`)
fs.writeFileSync(binary,String.raw`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(3);
let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{if(text.startsWith('[Agents Company role]\n'))text=text.split('\n\n').slice(1).join('\n\n');if(text.startsWith('[Agents Company message source]\n'))text=text.slice(text.indexOf('[Current message]\n')+'[Current message]\n'.length);fs.appendFileSync(${JSON.stringify(controls)},JSON.stringify({method:'codex',value:args,prompt:text,cwd:process.cwd()})+'\n');console.log(JSON.stringify({type:'turn.started'}));if(text==='hold'){setInterval(()=>{},1000);return}if(text==='fail'){console.log(JSON.stringify({type:'error',message:'fixture failure'}));process.exitCode=1;return}fs.writeFileSync('scheduled-proof.txt',text);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',id:'reply',text:'Executed: '+text}}));console.log(JSON.stringify({type:'turn.completed'}));});`,{mode:0o755})
const entry=path.join(temp,'service.cjs')
await build({entryPoints:[path.join(root,'src/main/daemon.ts')],bundle:true,platform:'node',format:'cjs',outfile:entry,alias:{'@anthropic-ai/claude-agent-sdk':sdk},logLevel:'silent'})
// Extend only this test's legacy native wrapper with real read-only bootstrap tool calls.
const adapter=nativeFixture(binary)
fs.writeFileSync(adapter,fs.readFileSync(adapter,'utf8').replace("if(r.method==='turn/interrupt')", "if(r.method==='thread/read'){emit({id:r.id,result:{thread:{id:thread,cwd:options.cwd,environments:[{environmentId:'local',cwd:options.cwd,runtimeWorkspaceRoots:[options.cwd]}],turns:[]}}});return}\nif(r.method==='thread/backgroundTerminals/list'){emit({id:r.id,result:{data:[],nextCursor:null}});return}\nif(r.method==='turn/interrupt')").replace('const config=[];',`const initialization=(p.input||[]).some(item=>item.text?.includes('[Agents Company private initialization]'));
if(initialization){void(async()=>{const url=options.config?.['mcp_servers.agents_company']?.url;if(!url)throw Error('Missing native documentation transport');for(const operation of ['identity','index']){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'scheduler-init-'+operation,method:'tools/call',params:{name:'agents_company_documentation',arguments:{operation}}})});const reply=await response.json();if(!response.ok||reply.error||reply.result?.isError)throw Error(JSON.stringify(reply));}emit({method:'item/completed',params:{item:{type:'agentMessage',id:'bootstrap',text:'OK'}}});emit({method:'turn/completed',params:{turn:{id:turn,status:'completed'}}});})().catch(error=>emit({method:'turn/completed',params:{turn:{id:turn,status:'failed',error:{message:error.message}}}}));return}
const config=[];`))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),CODEX_HOME:path.join(temp,'codex-home'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),CODEX_BIN:adapter}
let service,done,log=''
const launch=()=>{service=spawn(process.execPath,[entry],{env,stdio:['ignore','ignore','pipe']});service.stderr.on('data',d=>log+=d);done=new Promise(resolve=>service.once('exit',resolve))}
const cli=async(...args)=>{const raw=await exec(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:15000});const result=JSON.parse(raw.stdout);assert.ok(result.ok,result.error);return result.data}
const until=async(fn)=>{for(let i=0;i<150;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,30))}throw new Error('Condition timed out\n'+log)}
const employeeReady=id=>until(async()=>{const state=(await cli('session','status','--employee',id))[0]?.initialization;if(state?.status==='failed')throw Error(state.error);return state?.status==='ready'})
const ready=()=>until(async()=>{try{return (await cli('schedule','status')).running}catch{return false}})
const stop=async(signal='SIGTERM')=>{service.kill(signal);await done}
const history=id=>cli('schedule','history',id)
const finished=async id=>until(async()=>{const r=(await history(id))[0];return r&&r.status!=='running'?r:false})
const create=async(employee,extra={})=>cli('schedule','create','--spec',JSON.stringify({name:'Scheduled work',action:{type:'agent',employeeId:employee.id,prompt:'scheduled command',model:employee.engine==='codex'?'gpt-5.6-luna':'fixture-task',effort:'low'},rule:{kind:'interval',everySeconds:3600,anchor:new Date(Date.now()+3600000).toISOString()},enabled:false,...extra}))
try{
 launch();await ready()
 await cli('engine','configure','--engine','claude','--data',JSON.stringify({sdkPath:sdk}))
 ok((await cli('schedule','schema')).version===1,'scheduler contract is discoverable over CLI without Electron')
 await cli('group','add','Scheduler');const card=await cli('card','create','--title','Worker','--group','Scheduler','--engine','codex','--model','gpt-5.6-luna','--effort','low');await employeeReady(card.id)
 const item=await create(card)
 ok((await cli('schedule','list','--employee',card.id)).length===1&&(await cli('schedule','get',item.id)).action.engine==='codex','creation persists a pinned employee and engine')
 const run=await cli('schedule','run',item.id),result=await finished(item.id)
 if(result.status!=='succeeded')console.error('CODEX_FIXTURE_FAILURE',JSON.stringify(result));ok(result.status==='succeeded'&&fs.readFileSync(path.join(card.cwd,'scheduled-proof.txt'),'utf8')==='scheduled command','manual run executes through the real engine adapter in the employee directory')
 ok((await cli('session','transcript',card.id)).text.includes('Executed: scheduled command'),'scheduled task shares the employee conversation and CLI transcript')
 ok((await cli('schedule','get',item.id)).nextAt===item.nextAt,'manual execution does not consume the calendar occurrence')
 const once=await cli('schedule','create','--name','One shot','--employee',card.id,'--prompt','automatic command','--model','gpt-5.6-luna','--effort','low','--at',new Date(Date.now()+1100).toISOString())
 ok((await finished(once.id)).status==='succeeded'&&(await cli('schedule','get',once.id)).nextAt===null,'timer dispatches a one-shot occurrence once')
 await cli('schedule','pause',item.id);await cli('schedule','resume',item.id)
 ok((await cli('schedule','get',item.id)).enabled&&(await cli('schedule','preview',item.id,'--count','3')).times.length===3,'pause, resume and preview work through CLI')
 await cli('schedule','pause',item.id)
 await cli('schedule','update',item.id,'--patch',JSON.stringify({name:'Updated',source:'future-plugin'}))
 ok((await cli('schedule','list','--source','future-plugin'))[0].name==='Updated','future plugins can label and retrieve host jobs without MiniNotion integration')
 const live=await cli('session','open',card.id);await cli('session','send',live.sessionId,'hold')
 await cli('schedule','run',item.id)
 ok((await finished(item.id)).status==='skipped'&&(await cli('session','snapshot',live.sessionId)).busy,'busy manual work is skipped, never interrupted')
 await cli('session','close',live.sessionId)
 const hold=await create(card,{action:{...item.action,prompt:'hold'},timeoutSeconds:30})
 const holdRun=await cli('schedule','run',hold.id)
 const liveHold=await until(async()=>(await history(hold.id))[0].sessionId)
 await assert.rejects(()=>cli('session','send',liveHold,'steal'))
 await assert.rejects(()=>cli('config','model',liveHold,'gpt-5.6-luna'))
 await assert.rejects(()=>cli('config','engine',card.id,'claude'))
 await assert.rejects(()=>cli('schedule','run',hold.id))
 ok((await cli('session','snapshot',liveHold)).busy,'scheduled runs serialize employee writes while conversation reads remain available')
 ok((await cli('schedule','cancel',holdRun.id)).status==='cancelled','cancelling a run stops its process and releases the employee')
 const timeout=await create(card,{action:{...item.action,prompt:'hold'},timeoutSeconds:1});await cli('schedule','run',timeout.id)
 ok((await finished(timeout.id)).status==='timed_out','timeout terminates a blocked employee turn')
 const deadline=await create(card,{enabled:true,action:{...item.action,prompt:'hold'},rule:{kind:'once',at:new Date(Date.now()+600).toISOString()},until:new Date(Date.now()+1700).toISOString(),timeoutSeconds:30})
 ok((await finished(deadline.id)).status==='timed_out','automatic work stops at the schedule end even before its timeout')
 const paused=await cli('schedule','run',hold.id);await until(async()=>(await history(hold.id))[0].sessionId)
 await cli('schedule','pause',hold.id)
 ok((await history(hold.id))[0].status==='running','pausing affects future occurrences without interrupting current work')
 await cli('schedule','delete',hold.id)
 ok((await history(hold.id))[0].status==='cancelled','deleting an active job awaits cancellation and retains the run')
 const replacement=await create(card,{action:{...item.action,prompt:'hold'},timeoutSeconds:30});hold.id=replacement.id
 const failure=await create(card,{action:{...item.action,prompt:'fail'}});await cli('schedule','run',failure.id)
 ok((await finished(failure.id)).status==='failed','engine failures do not appear as successful runs')
 const claude=await cli('card','create','--title','Claude','--group','Scheduler','--engine','claude','--model','fixture-original');await employeeReady(claude.id)
 const cjob=await create(claude,{action:{type:'agent',employeeId:claude.id,prompt:'Claude task',model:'fixture-task',effort:'low',thinking:false}})
 await cli('schedule','run',cjob.id);const claudeRun=await finished(cjob.id);if(claudeRun.status!=='succeeded')console.error('CLAUDE_FIXTURE_FAILURE',JSON.stringify(claudeRun));ok(claudeRun.status==='succeeded','Claude schedule uses the shared adapter')
 const persisted=(await cli('session','list')).sessions.find(c=>c.id===claude.id),clive=(await cli('session','list','--live')).find(c=>c.cardId===claude.id),calls=fs.readFileSync(controls,'utf8').trim().split('\n').map(JSON.parse)
 ok(persisted.model==='fixture-original'&&clive.model==='fixture-original'&&calls.some(c=>c.method==='thinking'&&c.value===0)&&calls.some(c=>c.method==='model'&&c.value==='fixture-task'),'model/thinking overrides reach the engine and original preferences are restored')
 const crash=await cli('schedule','run',hold.id);await until(async()=>(await history(hold.id))[0].sessionId);await stop('SIGKILL')
 // Stop the deterministic orphan fixture, exactly this test's binary, after simulating a crash.
 const pids=(await exec('/bin/ps',['-axo','pid=,command='])).stdout.split('\n').filter(l=>l.includes(binary)).map(l=>Number(l.trim().split(/\s/)[0]));for(const pid of pids)try{process.kill(pid,'SIGTERM')}catch{}
 launch();await ready();ok((await history(hold.id)).find(r=>r.id===crash.id).status==='interrupted'&&(await cli('schedule','status')).active.length===0,'crash recovery marks claimed runs interrupted and never replays them')
 await stop();const file=path.join(env.AGENTS_COMPANY_HOME,'schedules.json'),saved=JSON.parse(fs.readFileSync(file,'utf8')),late=saved.jobs.find(j=>j.id===item.id)
 late.enabled=true;late.nextAt=new Date(Date.now()-3600000).toISOString();fs.writeFileSync(file,JSON.stringify(saved))
 launch();await ready();ok((await finished(item.id)).status==='skipped'&&Date.parse((await cli('schedule','get',item.id)).nextAt)>Date.now(),'missed occurrences are audited and advanced without a backlog burst')
 const duplicate=spawn(process.execPath,[entry],{env,stdio:'ignore'});const duplicateCode=await new Promise(resolve=>duplicate.once('exit',resolve))
 ok(duplicateCode===1&&(await cli('schedule','status')).running,'a second service cannot start another scheduler on the same socket')
 await cli('schedule','delete',once.id)
 ok((await history(once.id)).length===1&&!(await cli('schedule','list')).some(j=>j.id===once.id),'deleting a job retains its bounded execution audit')
 await cli('card','remove',card.id)
 ok((await cli('schedule','get',item.id)).disabledReason==='employee_removed','removing an employee disables its jobs')
 await cli('group','remove','Scheduler')
 ok((await cli('schedule','get',cjob.id)).disabledReason==='employee_removed','removing a Team disables all its employees jobs')
 await assert.rejects(()=>create(card));await assert.rejects(()=>cli('schedule','resume',item.id))
 ok(true,'deleted employees cannot be scheduled or resumed')
 console.log(`PASS=${passed} FAIL=0 — no GUI, no model inference`)
}catch(error){console.error(log);throw error}
finally{if(service?.exitCode===null)await stop();fs.rmSync(temp,{recursive:true,force:true})}
