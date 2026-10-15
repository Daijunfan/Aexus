// Explicit acceptance run: real model, temporary host/native state, no changes to user employees.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),run=promisify(execFile),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-acceptance-'))),profile=path.join(temp,'codex-home')
fs.mkdirSync(profile,{mode:0o700})
const source=process.env.CODEX_HOME||path.join(os.homedir(),'.codex')
for(const name of ['auth.json','config.toml'])if(fs.existsSync(path.join(source,name))){fs.copyFileSync(path.join(source,name),path.join(profile,name));fs.chmodSync(path.join(profile,name),0o600)}
const wrapper=path.join(temp,'codex-guard'),binary=path.join(os.homedir(),'.npm-global/bin/codex')
fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('node:child_process'),{createInterface}=require('node:readline');const child=spawn(${JSON.stringify(binary)},['--disable','apps','--disable','plugins','--disable','hooks','--disable','memories',...process.argv.slice(2)],{stdio:['pipe','pipe','pipe']});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);createInterface({input:process.stdin}).on('line',line=>{const message=JSON.parse(line);if(message.method==='turn/start'&&(message.params.model!=='gpt-6-luna'||message.params.effort!=='low')){process.stdout.write(JSON.stringify({id:message.id,error:{code:-32000,message:'Acceptance tests require exactly gpt-6-luna / low'}})+'\\n');return}child.stdin.write(line+'\\n')}).on('close',()=>child.stdin.end());child.on('close',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'));
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),CODEX_HOME:profile,CODEX_BIN:wrapper}
for(const key of ['AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'])delete env[key]
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']}),ended=new Promise(resolve=>service.once('exit',resolve));let log=''
service.stderr.on('data',data=>log=(log+data).slice(-10000))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:25000,maxBuffer:16*1024*1024})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 for(let n=0;n<100;n++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,50))}}
 await cli('group','add','Acceptance')
 const manager=await cli('card','create','--title','Lead','--group','Acceptance','--kind','worker','--management-role','manager','--engine','codex','--model','gpt-6-luna','--effort','low')
 const opened=await cli('session','open',manager.id)
 await cli('session','send',opened.sessionId,'请创建一名属于你所在 Team 的普通 Employee，命名为 AcceptanceWorker，运行方式为本地，使用 Codex，模型 gpt-6-luna，思考强度 low。让它仅回复 BOOTSTRAP_CHILD_OK，不修改任何项目文件。等它完成，读取其回复并报告员工 ID。请实际执行，不要只讲步骤。')
 const deadline=Date.now()+180000
 while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1000));const status=(await cli('session','status','--employee',manager.id))[0];if(status.waitingApproval)throw Error('Unexpected approval in Manager CLI flow');if(!status.busy)break}
 const cards=(await cli('session','list')).sessions,child=cards.find(card=>card.title==='AcceptanceWorker'),parentTranscript=await cli('session','transcript',opened.sessionId)
 assert.ok(child,'Manager did not create an actual company Employee: '+parentTranscript.text.slice(-10000))
 assert.equal(child.createdBy.employeeId,manager.id);assert.equal(child.managementRole,'employee');assert.equal(child.kind,'worker');assert.equal(child.model,'gpt-6-luna');assert.equal(child.effort,'low')
 const childTranscript=await cli('session','transcript',child.id);assert.match(childTranscript.text,/BOOTSTRAP_CHILD_OK/)
 const topology=await cli('management','topology'),relation=topology.edges.find(edge=>edge.managerId===manager.id&&edge.employeeId===child.id);assert.ok(relation)
 const live=(await cli('session','list','--live')).find(session=>session.cardId===child.id);assert.equal(live.currentTask.delegation.requestedBy.employeeId,manager.id);assert.equal(live.currentTask.delegation.relationId,relation.id)
 const report={passed:true,model:'gpt-6-luna',effort:'low',managerId:manager.id,employeeId:child.id,relationId:relation.id,parent:parentTranscript.items,child:childTranscript.items}
 fs.writeFileSync(path.join(root,'artifacts/manager-live-acceptance.json'),JSON.stringify(report,null,2))
 console.log('PASS live gpt-6-luna / low: ordinary Manager autonomously discovered company API, created an Employee, obtained active relation, delegated work and read the real child reply; isolated state and native history')
}catch(error){console.error(log);throw error}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
