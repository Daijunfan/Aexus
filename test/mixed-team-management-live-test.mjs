// Opt-in real engine acceptance on the explicitly configured SSH host, with isolated company state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mixed-live-'))),run=promisify(execFile),home=path.join(temp,'state'),hostId=process.env.AGENTS_LIVE_HOST_ID,remote=(process.env.AGENTS_LIVE_ROOT||'/home/user')+'/.agents-company-mixed-check-'+crypto.randomUUID()
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
 const ready=async card=>{const start=Date.now();while(Date.now()-start<185000){const status=(await cli('session','status','--employee',card.id))[0];if(status.initialization.status==='failed')throw Error(status.initialization.error);if(status.initialization.status==='ready')return;await new Promise(resolve=>setTimeout(resolve,1000))}throw Error('Initialization timeout')}
 const manager=await cli('card','create','--title','Manager','--group','Remote','--management-role','manager','--work-environment','local','--model','gpt-6-luna','--effort','low');cards.push(manager);await ready(manager)
 assert.ok(manager.cwd.startsWith(env.AGENTS_COMPANY_PROJECTS));assert.equal(manager.remote,null)
 const token=(await cli('auth','agent-token',manager.id)).token
 const managerCall=async(...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,AGENTS_COMPANY_TOKEN:token},timeout:90000,maxBuffer:4e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}const value=JSON.parse(stdout);assert.ok(value.ok,value.error);return value.data}
 const routed=await cli('card','create','--title','Routed','--group','Remote','--kind','worker','--model','gpt-6-luna','--effort','low');cards.push(routed);await ready(routed)
 const native=await managerCall('card','create','--title','Native','--group','Remote','--kind','cloud-native-worker','--model','gpt-6-luna','--effort','low');cards.push(native);await ready(native)
 const edges=(await managerCall('management','topology')).edges;assert.ok(!edges.some(edge=>edge.employeeId===routed.id));assert.ok(edges.some(edge=>edge.managerId===manager.id&&edge.employeeId===native.id))
 for(const card of [routed,native]){
  const sent=await managerCall('session','send','--employee',card.id,'--text','在当前工作目录创建一份“工作说明.md”，通过命令查看并记录主机名、操作系统和当前目录。完成后简短告诉我保存位置，不要修改其他文件。');assert.ok(sent.messageId)
  const start=Date.now();while(Date.now()-start<150000){const status=(await managerCall('session','status','--employee',card.id))[0];if(!status.busy)break;await new Promise(resolve=>setTimeout(resolve,1000))}
  const document=await cli('workspace','read','工作说明.md','--employee',card.id);assert.match(document.content,/Linux|Ubuntu/i);assert.ok(document.content.includes(card.cwd))
  const transcript=await managerCall('session','transcript','--employee',card.id);assert.ok(transcript.items.length>=2)
  console.log(JSON.stringify({passed:true,manager:'Mac local',target:card.kind,model:'gpt-6-luna',effort:'low',api:'session.send / session.status / session.transcript',remoteFileVerified:true,creatorLine:card.id===native.id}))
 }

}finally{
 try{for(const card of [...cards].reverse())await cli('card','remove',card.id);if(created)await host('rm -rf -- '+quote(remote))}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
}
