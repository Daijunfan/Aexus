import {nativeFixture} from './native-fixture.mjs'
// Real socket/CLI control flow with deterministic engine fixtures; no Electron or inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const project=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-core-'))),run=promisify(execFile),calls=path.join(temp,'controls.jsonl')
const sdk=path.join(temp,'sdk.mjs'),binary=path.join(temp,'codex')
fs.writeFileSync(sdk,String.raw`import fs from 'node:fs';const record=(method,args)=>fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({method,args})+'\n');
export const deleteSession=async()=>{};export const forkSession=async()=>{throw new Error('Fork is not used by this fixture')};
export function query({prompt,options}){record('start',{cwd:options.cwd,model:options.model,permissionMode:options.permissionMode});return {supportedCommands:async()=>[],supportedModels:async()=>[{value:'fixture-claude',displayName:'Fixture Claude',supportsEffort:true,supportedEffortLevels:['low','medium','high']}],setModel:async value=>record('model',value),setPermissionMode:async value=>record('permission',value),setMaxThinkingTokens:async value=>record('thinking',value),applyFlagSettings:async value=>record('effort',value),interrupt:async()=>record('interrupt',true),close(){},async *[Symbol.asyncIterator](){for await(const item of prompt){yield {type:'assistant',message:{id:'fixture-'+Date.now(),content:[{type:'text',text:'CLAUDE: '+(typeof item.message.content==='string'?item.message.content:item.message.content.map(b=>b.text||'').join('\n'))}]}};yield {type:'result',subtype:'success'}}}}}`)
fs.writeFileSync(binary,String.raw`#!/usr/bin/env node
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(3);
let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'turn.started'})+'\n');if(text==='hold'){setInterval(()=>{},1000);return}process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',id:'reply',text:'CODEX: '+text}})+'\n');process.stdout.write(JSON.stringify({type:'turn.completed'})+'\n')});`,{mode:0o755})
const entry=path.join(temp,'service.cjs');await build({entryPoints:['Infra/src/main/daemon.ts'],bundle:true,platform:'node',format:'cjs',outfile:entry,logLevel:'silent'})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(project,'Infra/src/resources/plugins'),AGENTS_COMPANY_TUNNEL_DIR:path.join(project,'Infra/src/tunnel'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),CODEX_BIN:nativeFixture(binary),SHELL:'/bin/bash',HISTFILE:'/dev/null'}
const service=spawn(process.execPath,[entry],{env,stdio:'ignore'}),done=new Promise(r=>service.once('exit',r))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(project,'Infra/src/cli/agents'),...args,'--json'],{env,timeout:10000})).stdout);assert.ok(r.ok,r.error);return r.data}
const until=async(fn)=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,30))}throw new Error('Condition timed out')}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 await cli('engine','configure','--engine','claude','--data',JSON.stringify({path:binary,sdkPath:sdk}));
 await cli('group','add','Backend');const card=await cli('card','create','--title','Engineer','--group','Backend','--engine','codex')
 let session=await cli('session','open',card.id);await cli('config','model',session.sessionId,'gpt-5.6-luna');await cli('config','effort',session.sessionId,'low');await cli('config','permission',session.sessionId,'acceptEdits');await cli('session','send',session.sessionId,'first conversation')
 await until(async()=>!(await cli('session','snapshot',session.sessionId)).busy)
 ok((await cli('session','transcript',card.id)).items.some(i=>i.role==='user'&&i.text==='first conversation'),'creating employees, engine selection, model/effort and conversation work without a renderer')
 await cli('session','send',session.sessionId,'hold');await assert.rejects(()=>cli('config','engine',card.id,'claude'))
 ok((await cli('session','list')).sessions.find(c=>c.id===card.id).engine==='codex','busy engine switching is rejected without changing employee state')
 await cli('session','interrupt',session.sessionId);await until(async()=>!(await cli('session','snapshot',session.sessionId)).busy)
 const terminal=await cli('terminal','open','--employee',card.id)
 await assert.rejects(()=>cli('config','engine',session.sessionId,'claude'));ok((await cli('terminal','list','--employee',card.id)).some(t=>t.id===terminal.id),'rejected engine switch leaves the live session and terminal intact')
 await cli('card','remove',card.id);ok(!(await cli('terminal','list')).length,'explicit removal closes the old employee terminal')
 const replacement=await cli('card','create','--title','Engineer','--group','Backend','--engine','claude','--directory-mode','bind','--cwd',card.cwd);ok(replacement.id!==card.id&&replacement.engine==='claude','another engine requires a newly created employee')
 session=await cli('session','open',replacement.id);await until(async()=>(await cli('session','snapshot',session.sessionId)).models.length>0)
 await cli('config','model',session.sessionId,'fixture-claude');await cli('config','thinking',session.sessionId,'off');await cli('config','thinking',session.sessionId,'on');await cli('config','effort',session.sessionId,'low');await cli('config','permission',session.sessionId,'acceptEdits')
 const recorded=fs.readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse)
 ok(recorded.some(c=>c.method==='thinking'&&c.args===0)&&recorded.some(c=>c.method==='thinking'&&c.args===null)&&recorded.some(c=>c.method==='model'&&c.args==='fixture-claude')&&recorded.some(c=>c.method==='effort'&&c.args.effortLevel==='low'),'CLI thinking, model, permission and effort settings reach the same engine adapter')
 await cli('session','send',session.sessionId,'second conversation');await until(async()=>!(await cli('session','snapshot',session.sessionId)).busy)
 const transcript=await cli('session','transcript',replacement.id);ok(transcript.items.filter(i=>i.role==='user').length===1&&JSON.stringify(transcript).includes('CLAUDE: second conversation'),'replacement employee has its own conversation')
 await assert.rejects(()=>cli('card','update',replacement.id,'--engine','codex'));ok((await cli('session','list')).sessions.find(c=>c.id===replacement.id).engine==='claude','card.update cannot change an existing engine')
 await cli('card','remove',replacement.id)
 console.log(`PASS=${n} FAIL=0 — no GUI, no model inference`)
}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
