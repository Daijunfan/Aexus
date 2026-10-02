import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-hidden-init-'))),run=promisify(execFile),control=path.join(temp,'fixture')
fs.mkdirSync(control)
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||key==='AGENTS_COMPANY_EMPLOYEE')delete env[key]
const entry=path.join(temp,'daemon.cjs');fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let service,ended,log=''
const call=async(token,...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:15000,maxBuffer:2e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}return JSON.parse(stdout)}
const cli=async(...args)=>{const result=await call(null,...args);assert.ok(result.ok,result.error);return result.data}
const until=async(check,label)=>{const deadline=Date.now()+15000;while(Date.now()<deadline){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Timed out: '+label+'\n'+log)}
const state=async id=>(await cli('session','status','--employee',id))[0]
const release=id=>fs.writeFileSync(path.join(control,id+'.release'),'')
const ready=id=>until(async()=>{const status=await state(id);if(status.initialization.status==='failed')throw Error(status.initialization.error);return status.initialization.status==='ready'&&status},'ready '+id)
const create=(title,extra=[])=>cli('card','create','--title',title,'--group','Team','--engine','codex','--model','gpt-6-luna','--effort','low',...extra)
const start=async()=>{service=spawn(process.execPath,[process.env.AGENTS_COMPANY_TEST_CORE_ENTRY??entry],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-8000));await until(()=>cli('status').catch(()=>false),'service')}
const stop=async()=>{service.kill('SIGTERM');await ended}
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});await start();await cli('group','add','Team');await cli('group','add','Work','--mode','work','--plugin','mininotion')
 const before=Date.now(),manager=await create('Manager',['--management-role','manager']);assert.ok(Date.now()-before<3000);assert.equal(manager.initialization.status,'pending')
 assert.ok(!fs.existsSync(path.join(manager.cwd,'AGENTS.md')));assert.ok(!fs.existsSync(path.join(manager.cwd,'CLAUDE.md')))
 assert.ok(!fs.existsSync(path.join(manager.cwd,'.agents-company/employees',manager.id,'API.md')),'no duplicated employee handbook')
 await until(()=>fs.existsSync(path.join(control,manager.id+'-initializing.json')),'engine private turn')
 const blocked=[['session','open',manager.id],['session','send','--employee',manager.id,'--text','MUST_NOT_RUN'],['session','enqueue','--employee',manager.id,'--text','MUST_NOT_QUEUE'],['session','steer','--employee',manager.id,'--text','MUST_NOT_STEER'],['session','transcript',manager.id],['session','follow',manager.id,'--raw'],['view','open','conversation','--employee',manager.id]]
 for(const args of blocked){const result=await call(null,...args);assert.equal(result.ok,false,args.join(' '));assert.equal(result.code,'EMPLOYEE_INITIALIZING',args.join(' ')+' '+JSON.stringify(result));assert.equal(result.error,'该人物正在初始化中，请稍等片刻。')}
 const token=(await cli('auth','agent-token',manager.id)).token
 assert.equal((await call(token,'card','create','--title','Unexpected')).code,'EMPLOYEE_INITIALIZING')
 const status=await state(manager.id);assert.equal(status.currentTask,undefined);release(manager.id);await ready(manager.id)
 assert.equal((await cli('session','transcript',manager.id)).items.length,0)
 const opened=await cli('session','open',manager.id);await cli('session','send',opened.sessionId,'HELLO')
 await until(async()=>!(await state(manager.id)).busy,'user turn')
 const transcript=await cli('session','transcript',manager.id);assert.match(transcript.text,/HELLO/);assert.match(transcript.text,/VISIBLE_REPLY/);assert.doesNotMatch(transcript.text,/private initialization|PRIVATE_INIT|OK/)
 const read=JSON.parse(fs.readFileSync(path.join(control,manager.id+'-read.json')));assert.deepEqual(read.operations,['identity','index']);assert.equal(read.identity.principal.employeeId,manager.id);assert.equal(read.identity.managementRole,'manager');assert.equal(read.index.document,'index');assert.equal(read.index.catalogRoot,path.join(env.AGENTS_COMPANY_HOME,'api-docs'));assert.ok(read.bytes.every(value=>value>0));assert.ok(read.index.markdown.length<16000,'initialization reads a short index, not the full API');
 const initial=JSON.parse(fs.readFileSync(path.join(control,manager.id+'-initializing.json'))),user=JSON.parse(fs.readFileSync(path.join(control,manager.id+'-user.json')));assert.equal(initial.thread,user.thread);assert.deepEqual(initial.environments,[]);assert.equal(initial.documentationTools,true);assert.equal(initial.readingTools,false)
 console.log('PASS create-time real private documentation tool calls, shared catalog, blocked UI/API/follow, native context preserved and empty public initialization history')
 const result=await call(token,'card','create','--title','Child','--engine','codex','--model','gpt-6-luna','--effort','low');assert.ok(result.ok,result.error);const child=result.data
 assert.ok((await cli('management','topology')).edges.some(edge=>edge.managerId===manager.id&&edge.employeeId===child.id))
 assert.equal((await call(token,'session','send','--employee',child.id,'--text','EARLY')).code,'EMPLOYEE_INITIALIZING')
 assert.equal((await call(token,'session','enqueue','--employee',child.id,'--text','EARLY')).code,'EMPLOYEE_INITIALIZING')
 release(child.id);await ready(child.id);const childRead=JSON.parse(fs.readFileSync(path.join(control,child.id+'-read.json')));assert.deepEqual(childRead.operations,['identity','index']);assert.equal(childRead.identity.principal.employeeId,child.id);assert.equal(childRead.identity.managementRole,'employee');assert.equal(JSON.parse(fs.readFileSync(path.join(control,child.id+'-initializing.json'))).text,initial.text);assert.equal(JSON.parse(fs.readFileSync(path.join(control,child.id+'-thread-start.json'))).developerInstructions,JSON.parse(fs.readFileSync(path.join(control,manager.id+'-thread-start.json'))).developerInstructions);assert.ok((await call(token,'session','send','--employee',child.id,'--text','AFTER_READY')).ok)
 await until(async()=>!(await state(child.id)).busy,'child user turn')
 console.log('PASS Manager-created Employee is bound immediately but cannot receive messages or queued tasks until ready')
 const failed=await create('Failed',['--model','fixture-alt']);fs.writeFileSync(path.join(control,failed.id+'.fail'),'');release(failed.id)
 await until(async()=>(await state(failed.id)).initialization.status==='failed','failure');assert.equal((await call(null,'session','open',failed.id)).code,'EMPLOYEE_INITIALIZATION_FAILED')
 fs.unlinkSync(path.join(control,failed.id+'.fail'));await cli('card','initialize',failed.id,'--model','gpt-6-luna','--effort','low');await ready(failed.id);assert.equal(JSON.parse(fs.readFileSync(path.join(control,failed.id+'-initializing.json'))).model,'gpt-6-luna');assert.equal((await cli('session','transcript',failed.id)).items.length,0)
 const timestamp=fs.statSync(path.join(control,failed.id+'-initializing.json')).mtimeMs;await cli('card','initialize',failed.id);assert.equal(fs.statSync(path.join(control,failed.id+'-initializing.json')).mtimeMs,timestamp)
 console.log('PASS failure is explicit, retry works, repeated ready initialization does not repeat model work')
 for(const flag of ['.init-skip-docs','.init-identity-only','.init-full-doc']){const invalid=await create('Invalid confirmation '+flag);fs.writeFileSync(path.join(control,invalid.id+flag),'');release(invalid.id);await until(async()=>(await state(invalid.id)).initialization.status==='failed','unverified OK denied');assert.match((await state(invalid.id)).initialization.error,flag==='.init-full-doc'?/Initialization reads only identity and index/:/identity.*index/);assert.equal((await call(null,'session','send','--employee',invalid.id,'--text','MUST_NOT_RUN')).code,'EMPLOYEE_INITIALIZATION_FAILED');fs.rmSync(path.join(control,invalid.id+flag));await cli('card','initialize',invalid.id);await ready(invalid.id);assert.equal((await cli('session','transcript',invalid.id)).items.length,0)}
 const alternate=await create('Alternate confirmation');fs.writeFileSync(path.join(control,alternate.id+'.bad-ok'),'');release(alternate.id);await ready(alternate.id)
 const alternateReads=JSON.parse(fs.readFileSync(path.join(control,alternate.id+'-read.json')));assert.deepEqual(alternateReads.operations,['identity','index']);assert.equal(alternateReads.identity.principal.employeeId,alternate.id)
 assert.equal((await cli('session','transcript',alternate.id)).items.length,0);assert.equal((await state(alternate.id)).lastReply,undefined)
 console.log('PASS actual identity/index reads and engine success determine readiness; alternate confirmation stays hidden; missing reads, forbidden full docs and native failure remain denied')
 const jobs=await Promise.all(['One','Two','Three'].map(title=>create(title)));await until(async()=>{const states=await Promise.all(jobs.map(card=>state(card.id)));return states.filter(s=>s.initialization.status==='running').length===2},'bounded queue')
 const jobStates=await Promise.all(jobs.map(card=>state(card.id))),pending=jobStates.find(card=>card.initialization.status==='pending');assert.ok(pending,JSON.stringify(jobStates))
 await cli('card','remove',pending.id);assert.ok(!(await cli('session','list')).sessions.some(card=>card.id===pending.id))
 await stop();await start()
 for(const card of jobs.filter(card=>card.id!==pending.id))assert.equal((await state(card.id)).initialization.status,'failed')
 assert.equal((await state(manager.id)).initialization.status,'ready');assert.match((await cli('session','transcript',manager.id)).text,/VISIBLE_REPLY/)
 console.log('PASS two-job concurrency, pending deletion, shutdown interruption, restart failure recovery and retained ready history')
 fs.writeFileSync(path.join(root,'artifacts/employee-initialization-core.json'),JSON.stringify({passed:true,manager:manager.id,child:child.id,blocked:blocked.length,concurrency:2},null,2))
}catch(error){console.error(log);throw error}finally{if(service&&!service.killed)await stop();fs.rmSync(temp,{recursive:true,force:true})}
