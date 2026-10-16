// Real OpenCode + real DeepSeek (small model) through the real Core, on the real
// GPU-server (bupt208 Linux) cloud host. Isolated state; reuses the host-native
// OpenCode auth (never printed) and a copy of the real cloud-hosts registry, so the
// absolute SSH identity still resolves but the daemon cannot touch the user's real
// registry. Billed calls are small: one private-initialization turn plus three
// visible turns on deepseek/deepseek-flash. Requires the GPU-server host to be up.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-opencode-cloud-')))
const entry=path.join(temp,'daemon.cjs')
// Real HOME stays in place so the native OpenCode auth is the single credential source.
const env={...process.env,AGENTS_COMPANY_EMBEDDED:'1',AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key))delete env[key]
fs.mkdirSync(env.AGENTS_COMPANY_HOME,{recursive:true})
fs.mkdirSync(path.join(env.AGENTS_COMPANY_HOME,'cloud-hosts'),{recursive:true})
const sourceHosts=path.join(os.homedir(),'AgentsCompany','cloud-hosts','hosts.json')
assert.ok(fs.existsSync(sourceHosts),'real cloud-hosts registry missing: '+sourceHosts)
fs.copyFileSync(sourceHosts,path.join(env.AGENTS_COMPANY_HOME,'cloud-hosts','hosts.json'))
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const HOST='djf@10.92.35.208',IDENTITY='/Users/djf/.ssh/id_ed25519_bupt208',HOST_ID='legacy-9b8a2a56094b61925f59'
assert.ok(fs.existsSync(IDENTITY),'GPU-server SSH identity missing')
const ssh=async(...args)=>(await run('ssh',['-i',IDENTITY,'-o','ConnectTimeout=12','-o','BatchMode=yes',HOST,...args],{timeout:90000,maxBuffer:16*1024*1024})).stdout
const remoteDir=`/home/djf/develop/aexus-opencode-e2e-${Date.now()}`
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:60000,maxBuffer:16*1024*1024})).stdout);assert.ok(response.ok,response.error);return response.data}
const until=async(check,label,ms=260000)=>{const deadline=Date.now()+ms;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,400))}throw Error('Timeout: '+label)}
const trimTrailing=a=>a.replace(/\/+$/,'')
let service,ended,log=''
try{
  await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  service=spawn(process.execPath,[entry],{env,stdio:['ignore','ignore','pipe']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-24000))
  await until(()=>cli('status').catch(()=>false),'Core ready')
  await ssh('mkdir','-p',remoteDir)
  console.log('→ cloud team on GPU-server; remote root',remoteDir)
  await cli('group','add','OpenCode Cloud E2E','--mode','cloud','--host-id',HOST_ID,'--remote-dir',remoteDir)
  console.log('→ creating real OpenCode cloud employee (deepseek/deepseek-flash, Full by default)')
  const card=await cli('card','create','--title','OpenCode Cloud Worker','--group','OpenCode Cloud E2E','--engine','opencode','--model','deepseek/deepseek-flash','--effort','low')
  console.log('  card',card.id,'remote cwd',card.cwd)
  assert.ok(card.cwd.startsWith(remoteDir+'/'),'card.cwd must be the remote workspace: '+card.cwd)
  assert.ok(!fs.existsSync(card.cwd),'remote workspace must not exist on the local Mac: '+card.cwd)
  await until(async()=>{const s=(await cli('session','status','--employee',card.id))[0];if(s.initialization.status==='failed')throw Error('init failed: '+(s.initialization.error||''));return s.initialization.status==='ready'},'private documentation initialization')
  console.log('✓ initialization ready — real model read identity+index through the Core MCP bridge over the cloud team')
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

  // 1) Full (default bypassPermissions): write + execute land on the cloud host, never on the Mac.
  const full=await runTurn('Full cloud','Using the tunnel MCP tools, create a file named e2e-cloud.txt in the current working directory with the exact content AEXUS-OPC-CLOUD-OK, then run the shell command `cp e2e-cloud.txt e2e-cloud-copied.txt && pwd > e2e-cloud-pwd.txt`. Do not add commentary.')
  assert.equal(full.tools.length,0,'cloud Full: no approval may be requested')
  const txt=(await ssh('cat',path.posix.join(card.cwd,'e2e-cloud.txt'))).trim()
  assert.ok(txt.includes('AEXUS-OPC-CLOUD-OK'),'cloud Full: remote file content wrong: '+txt)
  const listing=await ssh('ls','-1',card.cwd)
  assert.ok(listing.split('\n').includes('e2e-cloud-copied.txt'),'cloud Full: remote cp missing:\n'+listing)
  assert.ok(listing.split('\n').includes('e2e-cloud-pwd.txt'),'cloud Full: remote pwd output missing:\n'+listing)
  const pwdContent=(await ssh('cat',path.posix.join(card.cwd,'e2e-cloud-pwd.txt'))).trim()
  assert.equal(trimTrailing(pwdContent),trimTrailing(card.cwd),'cloud Full: command ran in wrong remote cwd: pwd='+pwdContent+' expected='+card.cwd)
  assert.ok(!fs.existsSync(card.cwd),'cloud Full: files must NOT land on the local Mac')
  console.log('✓ cloud Full: write + execute landed on GPU-server ('+card.cwd+'); no local copy, no approval')

  // 2) Ask (permission=default): the tunnel bridge prompts a REAL approval; deny blocks the remote write.
  await cli('api','call','config.permission','--args',JSON.stringify({id:sid,mode:'default'}))
  const denied=await runTurn('Ask reject','Using the tunnel MCP tools, you MUST create a file named e2e-cloud-denied.txt in the current working directory with the content DENIED.','deny')
  assert.ok(denied.events>0,'cloud Ask reject: a real approval event must fire')
  const deniedMissing=(await ssh('ls','-1',card.cwd)).split('\n')
  assert.ok(!deniedMissing.includes('e2e-cloud-denied.txt'),'cloud Ask reject: remote file must NOT be created')
  console.log('✓ cloud Ask: real approval event ('+denied.tools.join(',')+') denied → remote write blocked')

  // 3) Ask approve: same real approval path, allow completes the remote write.
  const allowed=await runTurn('Ask approve','Using the tunnel MCP tools, you MUST create a file named e2e-cloud-allowed.txt in the current working directory with the content ALLOWED.','allow')
  assert.ok(allowed.events>0,'cloud Ask approve: a real approval event must fire')
  const allowedText=(await ssh('cat',path.posix.join(card.cwd,'e2e-cloud-allowed.txt'))).trim()
  assert.ok(allowedText.includes('ALLOWED'),'cloud Ask approve: remote content wrong: '+allowedText)
  assert.ok(!fs.existsSync(path.join(card.cwd,'e2e-cloud-allowed.txt')),'cloud Ask approve: must not exist locally')
  console.log('✓ cloud Ask: real approval event ('+allowed.tools.join(',')+') allowed → remote write completed')

  console.log('PASS OpenCode real DeepSeek cloud workspace: Full write+execute, Ask reject/approve all landed on GPU-server through the tunnel bridge; nothing on the local Mac')
}catch(error){console.error('SERVICE LOG:\n'+log);throw error}finally{service?.kill('SIGTERM');if(ended)await ended;await ssh('rm','-rf',remoteDir).catch(()=>{});fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
