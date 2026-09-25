// Opt-in: one authorized bupt208 Linux host, isolated local state and a temporary remote folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-remote-'))),run=promisify(execFile),hostId='legacy-9b8a2a56094b61925f59',remote='/home/djf/.agents-company-management-test-'+crypto.randomUUID()
const state=path.join(temp,'state');fs.mkdirSync(state,{mode:0o700});fs.cpSync(path.join(os.homedir(),'AgentsCompany/cloud-hosts'),path.join(state,'cloud-hosts'),{recursive:true});fs.chmodSync(path.join(state,'cloud-hosts'),0o700)
const env={...process.env,AGENTS_COMPANY_HOME:state,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']}),ended=new Promise(resolve=>service.once('exit',resolve));let log='';service.stderr.on('data',d=>log+=d)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:90000,maxBuffer:4*1024*1024})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const host=command=>cli('host','exec',hostId,'--directory','/home/djf','--command',command)
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'"
let card,worker,localManager
try{
 for(let i=0;i<100;i++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,40))}}
 assert.equal((await cli('host','check',hostId)).connected,true)
 assert.equal((await host('mkdir '+quote(remote))).exit_code,0)
 await cli('group','add','Remote Test','--mode','cloud','--host-id',hostId,'--remote-dir',remote)
 await assert.rejects(()=>cli('card','create','--title','InvalidNativeManager','--group','Remote Test','--kind','cloud-native-worker','--management-role','manager'))
 card=await cli('card','create','--title','Manager','--group','Remote Test','--kind','worker','--management-role','manager','--model','gpt-6-luna','--effort','low')
 const opened=await cli('session','open',card.id)
 const launcher=card.cwd+'/.agents-company/employees/'+card.id+'/bin/agents'
 const result=await host(quote(launcher)+' auth whoami --json');assert.equal(result.exit_code,0,result.stderr);assert.equal(JSON.parse(result.stdout).data.principal.employeeId,card.id)
 const denied=await host(quote(launcher)+' host list --json');assert.notEqual(denied.exit_code,0);assert.match(denied.stdout,/Forbidden/)
 const docs=await host('cat '+quote(card.cwd+'/.agents-company/employees/'+card.id+'/API.md'));assert.equal(docs.exit_code,0);assert.match(docs.stdout,/### card.create/);assert.ok(!docs.stdout.includes('### host.credentials'))
 const created=await host(quote(launcher)+' card create --title CreatedOverTunnel --engine codex --model gpt-6-luna --effort low --json');assert.equal(created.exit_code,0,created.stderr)
 localManager=JSON.parse(created.stdout).data;assert.equal(localManager.createdBy.employeeId,card.id);assert.equal(localManager.managementRole,'employee')
 assert.ok((await cli('management','topology')).edges.some(edge=>edge.managerId===card.id&&edge.employeeId===localManager.id))
 console.log('PASS bupt208: local Manager uses identity-bound SSH return CLI, physical scoped docs, creates a company Employee and obtains active relation; native Manager/global host access refused; no inference')
 if(process.env.AGENTS_COMPANY_LIVE_INFERENCE==='1'){
   worker=await cli('card','create','--title','Worker','--group','Remote Test','--kind','cloud-native-worker','--model','gpt-6-luna','--effort','low')
   const relation=await cli('management','request','--manager',card.id,'--employee',worker.id);await cli('management','decide',relation.id,'approve')
   const prompt=`帮我安排一次小协作。使用你的 CLI ${launcher} 给员工 ${worker.id} 发任务：在他自己的工作目录写一份“协作验证.md”，简单记录当前主机名、操作系统和工作目录。通过 session send --employee 员工ID --text 任务内容发送；之后用 session transcript --employee 员工ID 查看他的回复，确认完成后告诉我结果。你只负责安排和检查，不要替他创建文件。`
   await cli('session','send',opened.sessionId,prompt)
   const deadline=Date.now()+180000;let status
   do{await new Promise(resolve=>setTimeout(resolve,1500));status=(await cli('session','status','--employee',card.id))[0]}while(status.busy&&Date.now()<deadline)
   assert.ok(!status.busy,'Manager turn timed out')
   const workerDeadline=Date.now()+90000
   while((await cli('session','status','--employee',worker.id))[0].busy&&Date.now()<workerDeadline)await new Promise(resolve=>setTimeout(resolve,1000))
   const document=await cli('workspace','read','协作验证.md','--employee',worker.id)
   assert.match(document.content,/Linux|Ubuntu/i);assert.ok(document.content.includes(worker.cwd))
   const snapshot=(await cli('session','list','--live')).find(session=>session.cardId===worker.id)
   assert.equal(snapshot.currentTask.delegation.requestedBy.employeeId,card.id)
   assert.equal(snapshot.currentTask.delegation.relationId,relation.id)
   console.log('PASS GPT-6 Luna low: local Manager delegated through its SSH CLI; remote native Employee wrote the verified document in its own workspace, with preserved Manager/relation task provenance')
 }
}finally{
 try{if(card){const sessions=await cli('session','list','--live');for(const session of sessions)await cli('session','close',session.id);if(worker)await cli('card','remove',worker.id);if(localManager)await cli('card','remove',localManager.id);await cli('card','remove',card.id)}await host('rm -rf -- '+quote(remote))}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
}
