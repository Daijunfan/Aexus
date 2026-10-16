// Real OpenCode + real DeepSeek (small model) through the real Core, in isolated state.
// Reuses the host-native OpenCode profile (auth.json deepseek key) — the key is only read
// by the native binary and is never printed. Billed calls are intentional and small:
// one private-initialization turn plus four visible turns on deepseek/deepseek-flash.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-opencode-real-')))
const entry=path.join(temp,'daemon.cjs')
// Real HOME stays in place so the native OpenCode auth/config is the single credential source.
const env={...process.env,AGENTS_COMPANY_EMBEDDED:'1',AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key))delete env[key]
fs.mkdirSync(env.AGENTS_COMPANY_HOME,{recursive:true})
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:30000,maxBuffer:16*1024*1024})).stdout);assert.ok(response.ok,response.error);return response.data}
const until=async(check,label,ms=220000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,300))}throw Error('Timeout: '+label)}
const samePath=(a,b)=>{try{return fs.realpathSync(a)===fs.realpathSync(b)}catch{return a===b}}
let service,ended,log=''
try{
  await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  service=spawn(process.execPath,[entry],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-24000))
  await until(()=>cli('status').catch(()=>false),'Core ready')
  await cli('group','add','OpenCode E2E','--mode','build')
  console.log('→ creating real OpenCode employee (deepseek/deepseek-flash, Full by default)')
  const card=await cli('card','create','--title','OpenCode Real E2E','--group','OpenCode E2E','--engine','opencode','--model','deepseek/deepseek-flash','--effort','low')
  console.log('  card',card.id,'cwd',card.cwd)
  await until(async()=>{const s=(await cli('session','status','--employee',card.id))[0];if(s.initialization.status==='failed')throw Error('init failed: '+(s.initialization.error||''));return s.initialization.status==='ready'},'private documentation initialization')
  console.log('✓ initialization ready — real model read identity+index through the Core MCP bridge')
  const sid=(await cli('session','open',card.id)).sessionId
  const statusOf=async()=>((await cli('session','status','--employee',card.id)).find(s=>s.sessionId===sid))
  const approvals=async()=>cli('api','call','approval.list','--args',JSON.stringify({id:sid}))
  const runTurn=async(label,prompt,mode='none')=>{
    console.log('  ['+label+'] send: '+prompt)
    await cli('session','send',sid,prompt)
    const tools=new Set(),events={count:0}
    await until(async()=>{
      const status=await statusOf()
      if(!status)return false
      if(status.busy){
        const list=await approvals()
        if(mode!=='none'){for(const a of list){tools.add(String(a.tool));events.count++;await cli('approval','respond',sid,a.id,mode)}}
        else if(list.length)throw Error('['+label+'] unexpected approval: '+list.map(a=>a.tool).join(','))
        return false
      }
      return true
    },'['+label+'] turn')
    assert.equal((await approvals()).length,0,'['+label+'] must not leave pending approvals')
    return {tools:[...tools],events:events.count}
  }

  // 1) Full (default bypassPermissions): write + execute must land with no approval.
  const full=await runTurn('Full','Create a file named e2e-full.txt in the current working directory with the exact content AEXUS-OPC-FULL-OK, then run the shell command `cp e2e-full.txt e2e-full-copied.txt && pwd > e2e-full-pwd.txt`. Do not add commentary.')
  assert.equal(full.tools.length,0,'Full: no approval may be requested')
  const fullTxt=path.join(card.cwd,'e2e-full.txt'),fullCopy=path.join(card.cwd,'e2e-full-copied.txt'),fullPwd=path.join(card.cwd,'e2e-full-pwd.txt')
  assert.ok(fs.existsSync(fullTxt),'Full: e2e-full.txt missing')
  assert.ok(fs.readFileSync(fullTxt,'utf8').includes('AEXUS-OPC-FULL-OK'),'Full: written content wrong: '+fs.readFileSync(fullTxt,'utf8'))
  assert.ok(fs.existsSync(fullCopy),'Full: cp produced no copy → bash command did not execute')
  assert.ok(fs.existsSync(fullPwd),'Full: pwd produced no output file')
  const pwdContent=fs.readFileSync(fullPwd,'utf8').trim()
  assert.ok(samePath(pwdContent,card.cwd),'Full: command ran in wrong cwd: pwd='+pwdContent+' expected='+card.cwd)
  console.log('✓ Full: write + execute landed in the employee workspace; no approval requested')

  // 2) Ask (permission=default): a real approval fires; deny blocks the write.
  await cli('api','call','config.permission','--args',JSON.stringify({id:sid,mode:'default'}))
  const denied=await runTurn('Ask reject','You MUST create a file named e2e-ask-denied.txt in the current working directory with the content DENIED.','deny')
  assert.ok(denied.events>0,'Ask reject: a real approval event must fire')
  assert.ok(!fs.existsSync(path.join(card.cwd,'e2e-ask-denied.txt')),'Ask reject: file must NOT be created')
  console.log('✓ Ask: real approval event ('+denied.tools.join(',')+') denied → write blocked')

  // 3) Ask approve: same real approval path, allow completes the write.
  const allowed=await runTurn('Ask approve','You MUST create a file named e2e-ask-allowed.txt in the current working directory with the content ALLOWED.','allow')
  assert.ok(allowed.events>0,'Ask approve: a real approval event must fire')
  const allowedFile=path.join(card.cwd,'e2e-ask-allowed.txt')
  assert.ok(fs.existsSync(allowedFile),'Ask approve: file missing')
  assert.ok(fs.readFileSync(allowedFile,'utf8').includes('ALLOWED'),'Ask approve: content wrong: '+fs.readFileSync(allowedFile,'utf8'))
  console.log('✓ Ask: real approval event ('+allowed.tools.join(',')+') allowed → write completed')

  // 4) Plan: read-only, no write even for an imperative instruction.
  await cli('config','plan',sid,'on')
  await runTurn('Plan','You MUST create a file named e2e-plan.txt in the current working directory with the content PLAN-WRITE.')
  assert.ok(!fs.existsSync(path.join(card.cwd,'e2e-plan.txt')),'Plan: file must NOT be created')
  console.log('✓ Plan: stayed read-only; no write executed')

  const transcript=await cli('session','transcript',card.id)
  const transcriptText=typeof transcript==='string'?transcript:(transcript&&transcript.text)||''
  console.log('PASS OpenCode real DeepSeek: Full write+execute (no approval), Ask real reject/approve, Plan read-only — all through the real Core and host-native auth; transcript chars',transcriptText.length)
}catch(error){console.error('SERVICE LOG:\n'+log);try{const cards=(await cli('session','list')).sessions||[];console.error('sessions:',cards.map(c=>c.id+' '+c.engine).join(','))}catch{};throw error}finally{service?.kill('SIGTERM');if(ended)await ended;fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
