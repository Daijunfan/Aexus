import {nativeFixture} from './native-fixture.mjs'
// Exercise the built/packaged headless daemon with a native-process fixture, no inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-sp-'))),exec=promisify(execFile)
const binary=path.join(temp,'codex')
fs.writeFileSync(binary,String.raw`#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2);if(!a.includes('gpt-5.6-luna')||!a.includes('model_reasoning_effort="low"'))process.exit(9);let p='';process.stdin.on('data',s=>p+=s);process.stdin.on('end',()=>{fs.writeFileSync('result.txt',p);console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',id:'1',text:'Packaged execution complete'}}));console.log(JSON.stringify({type:'turn.completed'}))});`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),CODEX_BIN:nativeFixture(binary)}
const command=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(root,'Infra/src/cli/agents')]
const service=spawn(command,[...prefix,'serve'],{env,stdio:['ignore','ignore','pipe']}),done=new Promise(r=>service.once('exit',r));let stderr='';service.stderr.on('data',d=>stderr+=d)
const cli=async(...args)=>{const result=JSON.parse((await exec(command,[...prefix,...args,'--json'],{env,timeout:20000})).stdout);assert.ok(result.ok,result.error);return result.data}
const until=async(fn)=>{for(let i=0;i<100;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,40))}throw new Error('Timed out: '+stderr)}
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)}
try{
 await until(async()=>{try{return (await cli('schedule','status')).running}catch{return false}})
 await cli('group','add','Build');const card=await cli('card','create','--group','Build','--title','Worker','--engine','codex')
 const json=path.join(temp,'schedule.json');fs.writeFileSync(json,JSON.stringify({name:'Packaged daily',action:{type:'agent',employeeId:card.id,prompt:'Run the project CLI',model:'gpt-5.6-luna',effort:'low'},rule:{kind:'weekly',days:[1,2,3,4,5],time:'09:00',timezone:'Asia/Shanghai'},enabled:false}))
 const weekly=await cli('schedule','create','--spec','@'+json)
 ok((await cli('schedule','preview',weekly.id,'--after','2026-09-18T02:00:00Z','--count','1')).times[0]==='2026-09-21T01:00:00.000Z','packaged runtime resolves Temporal dependency and timezone calculations')
 const task=await cli('schedule','create','--name','Package timer','--employee',card.id,'--at',new Date(Date.now()+1200).toISOString(),'--prompt','Scheduled fixture work','--model','gpt-5.6-luna','--effort','low')
 const result=await until(async()=>{const r=(await cli('schedule','history',task.id))[0];return r&&r.status!=='running'?r:false})
 ok(result.status==='succeeded'&&fs.readFileSync(path.join(card.cwd,'result.txt'),'utf8')==='Scheduled fixture work','packaged daemon dispatches an automatic employee task without Electron windows')
 ok((await cli('session','transcript',card.id)).text.includes('Packaged execution complete'),'packaged CLI reads the shared employee transcript')
 await cli('group','remove','Build')
 ok((await cli('schedule','get',weekly.id)).disabledReason==='employee_removed','packaged Team cleanup disables its employee schedules')
 console.log(`PASS=${checks} FAIL=0 — no model inference`)
}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
