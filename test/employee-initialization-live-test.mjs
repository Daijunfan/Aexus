// Explicit acceptance run: real model, temporary host/native state, no changes to user employees.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
if(process.env.AGENTS_COMPANY_LIVE_INFERENCE!=='1')throw Error('Set AGENTS_COMPANY_LIVE_INFERENCE=1 for this explicitly billed acceptance test')
const root=path.resolve(import.meta.dirname,'..'),run=promisify(execFile),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-private-init-live-'))),profile=path.join(temp,'codex-home')
fs.mkdirSync(profile,{mode:0o700})
const source=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')
for(const name of ['auth.json','config.toml'])if(fs.existsSync(path.join(source,name))){fs.copyFileSync(path.join(source,name),path.join(profile,name));fs.chmodSync(path.join(profile,name),0o600)}
const wrapper=path.join(temp,'codex-guard'),binary=path.join(os.homedir(),'.npm-global/bin/codex')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('node:child_process'),{createInterface}=require('node:readline');const child=spawn(${JSON.stringify(binary)},['--disable','apps','--disable','plugins','--disable','hooks','--disable','memories',...process.argv.slice(2)],{stdio:['pipe','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);createInterface({input:process.stdin}).on('line',line=>{const message=JSON.parse(line);if(message.method==='turn/start'&&(message.params.model!=='gpt-6-luna'||message.params.effort!=='low')){process.stdout.write(JSON.stringify({id:message.id,error:{code:-32000,message:'Acceptance tests require exactly gpt-6-luna / low'}})+'\\n');return}child.stdin.write(line+'\\n')}).on('close',()=>child.stdin.end());child.on('close',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'));
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_HOME:profile,CODEX_BIN:wrapper}
for(const key of ['AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'])delete env[key]
// Initialize the isolated native profile before two independent catalog/turn connections use SQLite.
await new Promise((resolve,reject)=>{
 const process_=spawn(wrapper,['app-server'],{env,stdio:['pipe','pipe','pipe']});let buffer='',errors=''
 const timer=setTimeout(()=>{process_.kill('SIGTERM');reject(Error('Native profile warmup timed out'))},20000)
 process_.stderr.on('data',value=>errors=(errors+value).slice(-2000))
 process_.stdout.on('data',value=>{buffer+=value;const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){let event;try{event=JSON.parse(line)}catch{continue};if(event.id===1){if(event.error){process_.kill();reject(Error(event.error.message));return};process_.stdin.end()}}})
 process_.once('error',reject);process_.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(errors||'Native profile warmup failed'))})
 process_.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'initialization_test',version:'1'}}})+'\n')
})
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']}),ended=new Promise(resolve=>service.once('exit',resolve));let log=''
service.stderr.on('data',data=>log=(log+data).slice(-10000))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:25000,maxBuffer:16*1024*1024})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 for(let n=0;n<100;n++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,50))}}
 await cli('group','add','Acceptance','--mode','work','--plugin','mininotion')
 const started=Date.now(),manager=await cli('card','create','--title','Lead','--group','Acceptance','--management-role','manager','--engine','codex','--model','gpt-6-luna','--effort','low')
 let state
 const deadline=Date.now()+180000
 do{await new Promise(resolve=>setTimeout(resolve,500));state=(await cli('session','status','--employee',manager.id))[0];if(state.initialization.status==='failed')throw Error(state.initialization.error)}while(state.initialization.status!=='ready'&&Date.now()<deadline)
 assert.equal(state.initialization.status,'ready')
 const hiddenElapsedMs=Date.now()-started
 assert.equal((await cli('session','transcript',manager.id)).items.length,0)
 assert.equal((await cli('session','list')).sessions.length,1)
 const opened=await cli('session','open',manager.id)
 await cli('session','send',opened.sessionId,'请只返回 VISIBLE_READY，不调用任何工具，不修改文件。')
 const visibleDeadline=Date.now()+60000
 do{await new Promise(resolve=>setTimeout(resolve,500));state=(await cli('session','status','--employee',manager.id))[0]}while(state.busy&&Date.now()<visibleDeadline)
 assert.ok(!state.busy)
 const transcript=await cli('session','transcript',manager.id)
 assert.match(transcript.text,/VISIBLE_READY/);assert.doesNotMatch(transcript.text,/private initialization|cat .*API.md|^OK$/m)
 const users=transcript.items.filter(item=>item.role==='user');assert.equal(users.length,1)
 assert.ok(!fs.existsSync(path.join(manager.cwd,'AGENTS.md')))
 fs.writeFileSync(path.join(root,'artifacts/employee-initialization-live.json'),JSON.stringify({passed:true,model:'gpt-6-luna',effort:'low',teamMode:'work',role:'manager',hiddenElapsedMs,visibleUserTurns:users.length,publicTranscript:transcript.items},null,2))
 console.log('PASS live gpt-6-luna / low: Work Manager automatically read hidden guides and confirmed OK; initialization absent from project history; first user conversation contains only VISIBLE_READY; elapsed '+hiddenElapsedMs+' ms')
}catch(error){console.error(log);throw error}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
