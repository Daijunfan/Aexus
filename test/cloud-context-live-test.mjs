// Opt-in live acceptance of clean context and ordinary native commands, Luna low only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const host=process.env.AGENTS_COMPANY_LIVE_HOST,workspace=process.env.AGENTS_COMPANY_LIVE_ROOT
if(!host||!workspace)throw new Error('Set authorized AGENTS_COMPANY_LIVE_HOST and AGENTS_COMPANY_LIVE_ROOT')
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-live-'))),run=promisify(execFile)
const artifact=path.join(root,'artifacts/cloud-clean-context');fs.mkdirSync(artifact,{recursive:true})
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(root,'bin/agents')]
const native=path.join(os.homedir(),'.npm-global/bin/codex'),wrapper=path.join(temp,'codex'),trace=path.join(artifact,'native-events.jsonl');fs.writeFileSync(trace,'')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const fs=require('node:fs'),{spawn}=require('node:child_process'),args=process.argv.slice(2);const p=spawn(${JSON.stringify(native)},args,{stdio:['pipe','pipe','inherit']});process.stdin.pipe(p.stdin);p.stdout.on('data',data=>{fs.appendFileSync(${JSON.stringify(trace)},data);process.stdout.write(data)});p.on('exit',code=>process.exitCode=code??1);process.on('SIGTERM',()=>p.kill('SIGTERM'));`,{mode:0o755})
const env={...process.env,CODEX_BIN:wrapper,AGENTS_COMPANY_HOME:temp,AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel')}
const daemon=spawn(executable,[...prefix,'serve'],{env,stdio:['ignore','ignore','pipe']}),done=new Promise(r=>daemon.once('exit',r));let log='';daemon.stderr.on('data',d=>log+=d)
const cli=async(...args)=>{const data=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:40000})).stdout);assert.ok(data.ok,data.error);return data.data}
const until=async(fn)=>{const end=Date.now()+180000;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,600))}throw new Error('Timed out')}
const prompt='查看当前电脑的环境是什么？CPU是什么？GPU是什么？操作系统是什么？'
let card,session
try{
 await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 await cli('group','add','Native context acceptance','--mode','cloud','--remote-host',host,'--remote-dir',workspace)
 card=await cli('card','create','--title','Environment reader','--group','Native context acceptance','--engine','codex','--model','gpt-5.6-luna','--effort','low','--directory-mode','bind','--cwd','.')
 session=await cli('session','open',card.id)
 await cli('session','send',session.sessionId,prompt)
 console.log('Sent unchanged prompt using gpt-5.6-luna / low')
 await until(async()=>!(await cli('session','snapshot',session.sessionId)).busy)
 const snapshot=await cli('session','snapshot',session.sessionId),transcript=await cli('session','transcript',card.id)
 fs.writeFileSync(path.join(artifact,'transcript.json'),JSON.stringify(transcript,null,2))
 assert.equal(snapshot.model,'gpt-5.6-luna');assert.equal(snapshot.effort,'low')
 const blocks=transcript.items.filter(i=>i.role==='assistant').flatMap(i=>i.blocks),texts=blocks.filter(b=>b.kind==='text').map(b=>b.text).join('\n'),calls=blocks.filter(b=>b.kind==='tool')
 const result={prompt,model:snapshot.model,effort:snapshot.effort,assistant:texts,commands:calls.map(c=>({command:c.input,result:c.result,isError:c.isError})),contextClean:true,nativeExecution:true,threadId:snapshot.threadId}
 fs.writeFileSync(path.join(artifact,'result.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(artifact,'reply.md'),texts)
 assert.ok(calls.length>0&&calls.some(c=>c.result?.includes('gpubupt208')),JSON.stringify(snapshot))
 assert.ok(!/(tunnel|exec-server|隧道|转发|\bssh\b)/i.test(texts),texts)
 assert.ok(texts.includes('4316')&&texts.includes('A100')&&texts.includes('Ubuntu'),texts)
 console.log(JSON.stringify(result,null,2))
}finally{
 if(session)try{await cli('session','close',session.sessionId)}catch(e){console.error(e.message)}
 if(card)try{await cli('card','remove',card.id)}catch(e){console.error(e.message)}
 daemon.kill('SIGTERM');await done;fs.writeFileSync(path.join(artifact,'daemon.log'),log);fs.rmSync(temp,{recursive:true,force:true})
}
