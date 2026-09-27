import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),project=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-')))
const home=path.join(temp,'state'),work=path.join(temp,'work'),projects=path.join(temp,'projects'),external=path.join(temp,'Existing Project'),plugin=path.join(work,'mini-notion-workspace'),sub=path.join(plugin,'Scoped Work')
for(const folder of [home,projects,external,sub])fs.mkdirSync(folder,{recursive:true})
fs.writeFileSync(path.join(external,'keep.md'),'existing work')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_PROJECTS:projects}
const capture=path.join(temp,'capture.json'),fixture=path.join(temp,'codex-fixture')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const fs=require('fs'),args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args,root:process.env.AGENTS_TEAM_ROOT}));process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n')});
`,{mode:0o755});env.CODEX_BIN=nativeFixture(fixture)
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'bin/agents')]
let service,done
const cli=async(...args)=>{const reply=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const start=async()=>{service=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'});done=new Promise(r=>service.once('exit',r));for(let i=0;i<100;i++){try{await cli('status');return}catch{await new Promise(r=>setTimeout(r,30))}}throw new Error('Service unavailable')}
const stop=async()=>{service.kill('SIGTERM');await done}
const state=()=>cli('session','list'),add=(name,root,mode='build')=>mode==='work'?cli('group','add',name,'--mode','work','--plugin','mininotion'):cli('group','add',name,'--mode','build','--directory-mode','bind','--root',root)
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await start();await add('Bound Build',external)
 ok((await state()).teamRoots['Bound Build']===external&&!fs.existsSync(path.join(projects,'Bound Build')),'Build binding reuses the chosen directory without creating a managed project')
 const member=await cli('card','create','--title','开发 Alice','--group','Bound Build')
 await cli('group','rename','Bound Build','Renamed Build')
 const renamed=await state()
 ok(!renamed.groups.includes('Bound Build')&&renamed.teamRoots['Renamed Build']===external&&renamed.sessions.find(c=>c.id===member.id).group==='Renamed Build'&&renamed.sessions.find(c=>c.id===member.id).cwd===member.cwd&&fs.readFileSync(path.join(external,'keep.md'),'utf8')==='existing work','bound Team rename changes membership but preserves its directory and files')
 await cli('group','rename','Renamed Build','Bound Build')
 await add('Shared Build',external);await assert.rejects(()=>cli('group','rename','Bound Build','Shared Build'))
 await cli('group','remove','Bound Build')
 ok((await state()).groups.includes('Shared Build')&&!(await state()).sessions.some(c=>c.id===member.id)&&fs.existsSync(member.cwd),'deleting a populated bound Team preserves shared directories and other Teams')
 await add('Scoped Work',sub,'work')
 const worker=await cli('card','create','--title','Writer','--group','Scoped Work')
 ok(worker.cwd===path.join(sub,'Writer')&&fs.existsSync(path.join(worker.cwd,'AGENTS.md')),'Work Team uses its fixed plugin folder; employee defaults and docs use that root')
 const live=await cli('session','open',worker.id);await cli('session','send',live.sessionId,'capture policy only')
 for(let i=0;i<250&&!fs.existsSync(capture);i++)await new Promise(r=>setTimeout(r,20))
 assert.ok(fs.existsSync(capture),JSON.stringify(await cli('session','snapshot',live.sessionId)))
 const invocation=JSON.parse(fs.readFileSync(capture));await cli('session','close',live.sessionId)
 ok(invocation.root===sub&&invocation.args.some(arg=>arg.includes(JSON.stringify(plugin)+'="deny"')&&arg.includes(JSON.stringify(worker.cwd)+'="write"')),'bound Work keeps its Team environment while denying native access to the entire plugin parent scope')
 const beforeRename=(await state()).sessions.find(c=>c.id===worker.id)
 await cli('group','rename','Scoped Work','Planning Team')
 const workRenamed=await state(),afterRename=workRenamed.sessions.find(c=>c.id===worker.id)
 ok(workRenamed.teamRoots['Planning Team']===sub&&afterRename.group==='Planning Team'&&afterRename.cwd===worker.cwd&&afterRename.threadId===beforeRename.threadId&&(await cli('workspace','suggest','--team','Planning Team')).path===sub,'Work Team rename preserves its plugin folder and native employee context')
 await assert.rejects(()=>cli('group','add','Scoped Work','--mode','work','--plugin','mininotion'))
 await cli('group','rename','Planning Team','Scoped Work')
 await assert.rejects(()=>cli('card','create','--title','Outside','--group','Scoped Work','--directory-mode','bind','--cwd',plugin))
 fs.symlinkSync(external,path.join(sub,'escape'))
 await assert.rejects(()=>cli('card','create','--title','Link','--group','Scoped Work','--directory-mode','bind','--cwd',path.join(sub,'escape')))
 await assert.rejects(()=>cli('group','add','Invalid Work','--mode','work','--plugin','mininotion','--directory-mode','bind','--root',external))
 await assert.rejects(()=>cli('group','add','Invalid Work','--mode','work','--plugin','mininotion','--root',external))
 await assert.rejects(()=>add('Missing Build',path.join(temp,'missing')))
 await assert.rejects(()=>add('App data',home))
 ok(!(await state()).groups.includes('Invalid Work'),'bindings reject app data and Work Team overrides before writing')
 await add('Plugin Root',plugin,'work')
 ok((await state()).teamRoots['Plugin Root']===path.join(plugin,'Plugin Root'),'another Work Team receives its own fixed plugin folder')
 await cli('group','root','Scoped Work',worker.cwd,'--directory-mode','bind').then(()=>assert.fail('employee would own Team root'),()=>{})
 ok((await state()).teamRoots['Scoped Work']===sub,'rebind rejects invalid employee ownership without changing the Team')
 await cli('group','add','Default Build')
 await cli('group','root','Default Build',external,'--directory-mode','bind')
 await cli('group','rename','Default Build','Now Bound')
 ok((await state()).teamRoots['Now Bound']===external&&(await cli('workspace','suggest','--team','Now Bound')).path===external&&fs.existsSync(path.join(projects,'Default Build')),'renaming a Build Team preserves its registered folder and prior workfiles')
 await cli('group','rename','Now Bound','Default Build')
 await cli('group','add','Change mode')
 await cli('group','configure','Change mode','--mode','work','--plugin','mininotion')
 ok((await state()).teamRoots['Change mode']===path.join(plugin,'Change mode'),'empty Team mode change selects the fixed plugin folder')
 await stop();await start()
 ok((await state()).teamRoots['Scoped Work']===sub&&(await cli('workspace','suggest','--team','Scoped Work')).path===sub,'fixed Work folder and employee suggestions survive service restart')
 // References shared with an employee outside the deleted Team must be retained.
 const a=await cli('card','create','--title','A','--group','Shared Build'),b=await cli('card','create','--title','B','--group','Default Build')
 const stored=await state();for(const id of [a.id,b.id])stored.sessions.find(c=>c.id===id).threadId='11111111-1111-4111-8111-111111111111'
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(stored))
 await assert.rejects(()=>cli('group','remove','Shared Build'))
 ok((await state()).groups.includes('Shared Build')&&(await state()).sessions.some(c=>c.id===a.id),'cascade refuses native references shared outside the Team without dropping employee records')
 console.log(`PASS=${n} FAIL=0 — no model calls`)
}finally{if(service?.exitCode===null)await stop();fs.rmSync(temp,{recursive:true,force:true})}
