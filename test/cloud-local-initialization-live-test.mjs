// Opt-in real engine acceptance on the explicitly configured SSH host, with isolated company state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloud-init-live-'))),run=promisify(execFile),home=path.join(temp,'state'),hostId=process.env.AGENTS_LIVE_HOST_ID,remote=(process.env.AGENTS_LIVE_ROOT||'/home/user')+'/.agents-company-init-check-'+crypto.randomUUID()
fs.mkdirSync(home,{mode:0o700});fs.cpSync(path.join(os.homedir(),'AgentsCompany/cloud-hosts'),path.join(home,'cloud-hosts'),{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']}),ended=new Promise(resolve=>service.once('exit',resolve));let log='';service.stderr.on('data',data=>log=(log+data).slice(-6000))
const cli=async(...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:90000,maxBuffer:4e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}const result=JSON.parse(stdout);assert.ok(result.ok,result.error);return result.data}
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'",host=command=>cli('host','exec',hostId,'--directory',process.env.AGENTS_LIVE_ROOT||'/home/user','--command',command)
let created=false;const cards=[]
try{
 for(let n=0;n<100;n++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,50))}}
 assert.equal((await cli('host','check',hostId)).connected,true)
 assert.equal((await host('mkdir '+quote(remote))).exit_code,0);created=true
 await cli('group','add','Remote','--mode','cloud','--host-id',hostId,'--remote-dir',remote)
 for(const [engine,model] of [['codex','gpt-6-luna'],['claude','deepseek-flash']]){
  const start=Date.now(),card=await cli('card','create','--title',engine,'--group','Remote','--kind','worker','--engine',engine,'--model',model,'--effort','low');cards.push(card)
  let status;while(Date.now()-start<185000){status=(await cli('session','status','--employee',card.id))[0];if(['ready','failed'].includes(status.initialization.status))break;await new Promise(resolve=>setTimeout(resolve,1000))}
  assert.equal(status.initialization.status,'ready',status.initialization.error||log)
  assert.equal((await cli('session','transcript',card.id)).items.length,0)
  const launcher=quote(card.cwd+'/.agents-company/employees/'+card.id+'/bin/agents')
  const identity=await host('env PATH=/usr/bin:/bin '+launcher+' auth whoami --json');assert.equal(identity.exit_code,0,identity.stderr);assert.equal(JSON.parse(identity.stdout).data.principal.employeeId,card.id)
  const denied=await host(launcher+' card create --title Forbidden --json');assert.notEqual(denied.exit_code,0);assert.match(denied.stdout,/Forbidden/)
  console.log(JSON.stringify({passed:true,engine,model,effort:'low',seconds:Math.round((Date.now()-start)/100)/10,initialization:'ready',history:'empty',remoteCLI:'works without Node',management:'denied'}))
 }
}finally{
 try{for(const card of cards)await cli('card','remove',card.id);if(created)await host('rm -rf -- '+quote(remote))}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
}
