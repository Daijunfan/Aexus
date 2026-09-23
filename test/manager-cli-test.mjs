// Isolated end-to-end Manager Team control through the real host socket, without inference or UI.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawn,execFile}from 'node:child_process';import{promisify}from 'node:util';import{createRequire}from 'node:module';import{build}from 'esbuild';import assert from 'node:assert/strict'
const run=promisify(execFile),require=createRequire(import.meta.dirname),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-')),env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work')};let manager=path.join(temp,'Agents-Managers');fs.mkdirSync(manager);manager=fs.realpathSync(manager)
const quoted=value=>"'"+value.replaceAll("'","'\\''")+"'"
fs.writeFileSync(path.join(manager,'agents'),`#!/bin/sh\nexec node ${quoted(root+'/bin/agents')} "$@"\n`,{mode:0o755});fs.writeFileSync(path.join(manager,'API.md'),'Manager test guide')
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'env.cjs');await build({stdin:{contents:"export {childEnv} from './src/main/exec'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});const {childEnv}=require(bundle)
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve));let director
const cli=async(cwd,...args)=>{const response=JSON.parse((await run('agents',[...args,'--json'],{cwd,env:{...childEnv(cwd),...env,PATH:childEnv(cwd).PATH},timeout:25000})).stdout);assert.ok(response.ok,response.error);return response.data}
try{
 for(let n=0;n<100;n++){try{if((await cli(manager,'status')).running)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
 assert.equal(childEnv(manager).PATH.split(':')[0],manager)
 await cli(manager,'group','add','Managers','--mode','build','--directory-mode','bind','--root',manager)
 director=await cli(manager,'card','create','--title','Director','--group','Managers','--engine','codex','--model','gpt-6-luna','--effort','low')
 assert.equal(director.permissionMode,'acceptEdits')
 assert.equal(childEnv(director.cwd).PATH.split(':')[0],manager)
 assert.equal((await cli(director.cwd,'status')).running,true)
 const originalPath=process.env.PATH;process.env.PATH='/usr/bin:/bin';const finderEnv=childEnv(director.cwd);process.env.PATH=originalPath
 assert.equal(finderEnv.PATH.split(':')[0],manager)
 assert.ok(finderEnv.PATH.split(':').some(folder=>fs.existsSync(path.join(folder,'node'))),'Finder environment must include Node for the Manager launcher')
 assert.equal(JSON.parse((await run('agents',['status','--json'],{cwd:director.cwd,env:{...finderEnv,...env,PATH:finderEnv.PATH}})).stdout).data.running,true)
 const assistant=await cli(director.cwd,'card','create','--title','Assistant','--group','Managers','--engine','codex')
 assert.equal(assistant.permissionMode,'acceptEdits')
 assert.equal(childEnv(assistant.cwd).PATH.split(':')[0],manager)
 assert.equal((await cli(assistant.cwd,'status')).running,true)
 await cli(director.cwd,'group','add','Demo','--mode','build')
 const worker=await cli(assistant.cwd,'card','create','--title','Worker','--group','Demo','--engine','codex','--model','gpt-6-luna','--effort','low')
 await cli(director.cwd,'card','update',worker.id,'--role','Reviewer','--color','#7089c4')
 const changed=(await cli(assistant.cwd,'session','list')).sessions.find(s=>s.id===worker.id);assert.equal(changed.role,'Reviewer');assert.equal(changed.color,'#7089c4')
 await cli(director.cwd,'room','bounds','Demo','--width','850','--height','640');assert.equal((await cli(assistant.cwd,'room','layout','Demo')).bounds.width,850)
 const when=new Date(Date.now()+86400000).toISOString(),job=await cli(assistant.cwd,'schedule','create','--name','Future check','--employee',worker.id,'--at',when,'--prompt','Read the test workspace only','--model','gpt-6-luna','--effort','low')
 assert.equal((await cli(director.cwd,'schedule','get',job.id)).id,job.id)
 assert.ok((await cli(director.cwd,'schedule','preview',job.id,'--count','1')).times.length>0)
 await cli(assistant.cwd,'schedule','pause',job.id);await cli(assistant.cwd,'schedule','resume',job.id);await cli(director.cwd,'schedule','delete',job.id)
 await cli(assistant.cwd,'card','remove',worker.id);await cli(director.cwd,'group','remove','Demo')
 assert.ok(!(await cli(director.cwd,'session','list')).sessions.some(s=>s.id===worker.id));assert.ok(!(await cli(director.cwd,'group','list')).includes('Demo'))
 console.log('PASS two Manager employees control other Teams, employees and schedule configuration through CLI; no window or model call')
}finally{daemon.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
