import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'engine-probe-test-')),script=path.join(temp,'engine.cjs'),trace=path.join(temp,'calls.jsonl'),profile=path.join(temp,'claude')
fs.mkdirSync(profile)
fs.writeFileSync(script,`#!/usr/bin/env node
const fs=require('fs'),args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(trace)},JSON.stringify({args,cwd:process.cwd(),companyHome:process.env.AGENTS_COMPANY_HOME,hasCompanyToken:!!process.env.AGENTS_COMPANY_TOKEN})+'\\n');
if(args.includes('fail')){console.error(process.env.OPENAI_API_KEY);process.exit(3)}
console.log(JSON.stringify(args[0]==='exec'?{type:'item.completed',item:{type:'agent_message',text:'OK'}}:{type:'result',result:'OK',is_error:false}));
`,{mode:0o755})
const binary=process.platform==='win32'?path.join(temp,'engine.cmd'):script
if(process.platform==='win32')fs.writeFileSync(binary,`@echo off\r\n"${process.execPath}" "${script}" %*\r\n`)
const f=await fixtureCore({CODEX_BIN:binary,CLAUDE_BIN:binary,CLAUDE_CONFIG_DIR:profile})
try{
 assert.equal((await f.raw(null,'engine','probe','--engine','codex')).ok,false)
 assert.equal(fs.existsSync(trace),false,'no subprocess/inference before explicit confirmation')
 for(const engine of ['codex','claude']){
  const before=(await f.cli('session','list')).sessions.length
  const result=await f.cli('engine','probe','--engine',engine,'--model','test-model','--confirm')
  assert.equal(result.engine,engine);assert.equal(result.model,'test-model');assert.equal(result.text,'OK');assert.equal((await f.cli('session','list')).sessions.length,before)
 }
 const calls=fs.readFileSync(trace,'utf8').trim().split('\n').map(JSON.parse)
 assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.hasCompanyToken&&!fs.existsSync(c.cwd)&&c.companyHome.startsWith(c.cwd+path.sep)),'temporary workspace cleaned and operator token absent')
 assert.ok(calls[0].args.includes('--ephemeral')&&calls[0].args.includes('read-only'))
 assert.ok(calls[1].args.includes('--no-session-persistence'));assert.equal(calls[1].args[calls[1].args.indexOf('--tools')+1],'')
 await f.cli('engine','configure','--engine','codex','--data','{"apiKey":"probe-test-sensitive"}')
 const failed=await f.raw(null,'engine','probe','--engine','codex','--model','fail','--confirm')
 assert.equal(failed.ok,false);assert.ok(!failed.error.includes('probe-test-sensitive'));assert.match(failed.error,/redacted/)
 await f.cli('group','add','A');const card=await f.cli('card','create','--title','Employee','--group','A','--model','gpt-6-luna'),token=await f.token(card.id)
 assert.equal((await f.raw(token,'engine','probe','--engine','codex','--confirm')).ok,false)
 console.log('PASS explicit engine probe: confirmation, real response protocol, target process, cleanup, permission, no employee side effects and credential redaction; fixture only')
}finally{await f.close();fs.rmSync(temp,{recursive:true,force:true})}
