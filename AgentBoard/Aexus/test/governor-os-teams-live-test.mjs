// Opt-in real Claude Code / DeepSeek Flash, real SSH, isolated company and remote folders.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fixtureCore} from './fixtures/headless-core.mjs'
if(process.env.AGENTS_COMPANY_LIVE_ACCEPTANCE!=='1')throw Error('Set AGENTS_COMPANY_LIVE_ACCEPTANCE=1')
const root=path.resolve(import.meta.dirname,'..'),profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-os-claude-'))),run=promisify(execFile)
const saved=JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'settings.json'),'utf8'))
const provider=Object.fromEntries(Object.entries({...saved.env,...process.env}).filter(([key,value])=>typeof value==='string'&&(key.startsWith('ANTHROPIC_')||['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'].includes(key))))
assert.match(provider.ANTHROPIC_BASE_URL??'',/api\.deepseek\.com/)
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({env:provider,model:'deepseek-flash',alwaysThinkingEnabled:false}),{mode:0o600})
const f=await fixtureCore({CLAUDE_CONFIG_DIR:profile}),artifact=path.join(root,'artifacts/governor-os-teams-live.json'),report={isolated:true,model:'deepseek-flash',turns:[],teams:[],employees:[]},prepared=[]
const write=()=>fs.writeFileSync(artifact,JSON.stringify(report,null,2)+'\n')
const cli=async(...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:f.env,timeout:90000,maxBuffer:12e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}const result=JSON.parse(stdout);assert.ok(result.ok,result.error);return result.data}
const status=async id=>(await cli('session','status','--employee',id))[0]
const waitFor=async(check,label,timeout=240000)=>{const end=Date.now()+timeout;let last=Date.now();while(Date.now()<end){const result=await check();if(result)return result;if(Date.now()-last>20000){console.log('Waiting: '+label);last=Date.now()}await new Promise(r=>setTimeout(r,1200))}throw Error('Timeout: '+label)}
const ready=card=>waitFor(async()=>{const s=await status(card.id);if(s.initialization?.status==='failed')throw Error(s.initialization.error);return s.initialization?.status==='ready'},'initialization '+card.title)
const turn=async(card,prompt)=>{
 const sent=await cli('session','send','--employee',card.id,'--text',prompt)
 await waitFor(async()=>{const s=await status(card.id);assert.ok(!s.waitingApproval,'Unexpected clarification: '+card.title);return !s.busy},card.title,480000)
 const transcript=await cli('session','transcript',card.id),items=transcript.items.slice(transcript.items.findLastIndex(i=>i.role==='user'))
 report.turns.push({employee:card.title,id:card.id,prompt,messageId:sent.messageId,items});write();return items
}
const q=s=>"'"+s.replaceAll("'","'\\''")+"'",ps=s=>"'"+s.replaceAll("'","''")+"'"
try{
 const registry=path.join(f.env.AGENTS_COMPANY_HOME,'cloud-hosts');fs.cpSync(path.join(os.homedir(),'AgentsCompany/cloud-hosts'),registry,{recursive:true})
 const all=JSON.parse(fs.readFileSync(path.join(registry,'hosts.json'),'utf8'))
 const selected=['Linux-server','kali-Linux1','Windows-target1'].map(name=>{const host=all.find(h=>h.name===name);assert.ok(host,'Missing authorized host '+name);return host})
 fs.writeFileSync(path.join(registry,'hosts.json'),JSON.stringify(selected),{mode:0o600})
 const tag='.agents-company-os-check-'+crypto.randomUUID()
 for(const host of selected){
  assert.equal((await cli('host','check',host.id)).connected,true,'Live SSH '+host.name)
  const directory=(host.os==='windows'?path.win32:path.posix).join(host.defaultDirectory,tag)
  const command=host.os==='windows'?`New-Item -ItemType Directory -Path ${ps(directory)} -ErrorAction Stop | Out-Null`:`mkdir -- ${q(directory)}`
  const result=await cli('host','exec',host.id,'--command',command);assert.equal(result.exit_code,0,result.stderr)
  prepared.push({host,directory});await cli('host','update',host.id,'--data',JSON.stringify({defaultDirectory:directory}));console.log('Prepared isolated SSH workspace: '+host.name)
 }
 await cli('group','add','Team-Managers')
 const governor=await cli('card','create','--title','Fresh OS Governor','--group','Team-Managers','--management-role','governor','--engine','claude','--model','deepseek-flash','--effort','low');await ready(governor)
 report.governor={id:governor.id,initialization:(await status(governor.id)).initialization};write()
 await turn(governor,'现在创建四个不同操作系统的团队：Mac、Ubuntu、Kali、Windows，包括云端主机上的团队。每个团队里有一名 Manager，以及3名员工。每团队里的员工必须由 Manager 自己创建，你只负责创建团队和 Manager，然后发消息告诉他，让 Manager 来创建自己团队的员工。所有人都使用 Claude Code 的 deepseek-flash 模型。任务仅是建队、招人和核验真实环境，不要给员工安排复杂工作。不要删除或修改现有团队。')
 await waitFor(async()=>{const cards=(await cli('session','list')).sessions;return cards.filter(c=>c.managementRole==='employee').length===12&&!(await cli('session','status')).some(c=>c.busy||c.initialization?.status==='running')},'four Managers finish hiring',480000)
 const topology=await cli('management','topology'),cards=(await cli('session','list')).sessions,teams=topology.teams.filter(t=>t.name!=='Team-Managers')
 assert.equal(teams.length,4);assert.deepEqual(teams.map(t=>t.distribution||t.os).sort(),['kali','macos','ubuntu','windows']);assert.equal(teams.filter(t=>t.mode==='cloud').length,3)
 report.teams=teams
 for(const team of teams){
  const members=cards.filter(c=>c.group===team.name),managers=members.filter(c=>c.managementRole==='manager'),workers=members.filter(c=>c.managementRole==='employee')
  assert.equal(managers.length,1);assert.equal(workers.length,3)
  const manager=managers[0];assert.equal(manager.createdBy.employeeId,governor.id);assert.equal(manager.engine,'claude');assert.equal(manager.model,'deepseek-flash')
  assert.equal(topology.nodes.find(c=>c.id===manager.id).workspace.location,'local')
  for(const worker of workers){const node=topology.nodes.find(c=>c.id===worker.id);assert.equal(worker.createdBy.employeeId,manager.id);assert.equal(worker.engine,'claude');assert.equal(worker.model,'deepseek-flash');assert.equal(node.workspace.location,team.mode==='cloud'?'cloud':'local');assert.equal(node.workspace.os,team.os);assert.equal(node.workspace.hostId,team.hostId);assert.equal(worker.kind??'worker','worker')}
  // Real Manager-to-Employee API delegation, then independently inspect actual filesystem output.
  await turn(manager,'请给本团队3名 Employee 各发送一个简单任务：在自己当前工作目录新建 proof.txt，使用实际命令把操作系统、主机名和当前工作目录写入文件，最后追加“连接已验证”五个字。Linux 请读 /etc/os-release，Windows 请用 PowerShell 查询系统信息。除了这个文件不要修改其他内容。等待他们完成后通过 session transcript 核对执行结果并报告，不要自己代写文件。')
  await waitFor(async()=>!(await cli('session','status')).some(c=>c.group===team.name&&c.busy),'worker proofs '+team.name)
  for(const worker of workers){
   const proof=await cli('workspace','read','proof.txt','--employee',worker.id);assert.match(proof.content,/连接已验证/)
   assert.ok(proof.content.toLowerCase().replaceAll('\\','/').includes(worker.cwd.toLowerCase().replaceAll('\\','/')),'actual cwd in proof')
   assert.match(proof.content,team.os==='windows'?/Windows|Win32NT/i:team.os==='macos'?/Darwin|macOS/i:team.distribution==='ubuntu'?/Ubuntu/i:/Kali/i)
   const transcript=await cli('session','transcript',worker.id);assert.ok(transcript.items.some(i=>i.blocks?.some(b=>b.kind==='tool'&&!b.isError)))
   report.employees.push({id:worker.id,title:worker.title,team:team.name,createdBy:worker.createdBy,workspace:topology.nodes.find(n=>n.id===worker.id).workspace,proof:proof.content});write()
  }
  console.log('PASS real Manager hiring and 3 Employee proofs: '+team.name+' / '+team.os)
 }
 const models=[];for(const file of fs.globSync(path.join(profile,'projects','*','*.jsonl')))for(const line of fs.readFileSync(file,'utf8').split('\n').filter(Boolean)){const item=JSON.parse(line);if(item.type==='assistant'&&item.message?.model&&item.message.model!=='<synthetic>')models.push(item.message.model)}
 assert.deepEqual([...new Set(models)],['deepseek-flash']);report.nativeResponseModels=[...new Set(models)];report.passed=true;write();console.log('PASS fresh real Flash Governor, 4 OS Teams, 4 Managers, 12 Manager-created Employees, 12 verified environment files')
}catch(error){report.passed=false;report.error=error.message;try{report.failureTopology=await cli('management','topology');for(const card of (await cli('session','list')).sessions)report.turns.push({employee:card.title,id:card.id,transcript:(await cli('session','transcript',card.id)).text})}catch{}write();throw error}
finally{
 // Stop all test sessions before removing only this run's unique remote folders.
 try{for(const card of (await cli('session','status')).filter(c=>c.busy&&c.currentTask?.messageId))await cli('session','interrupt','--employee',card.id,'--expected-message-id',card.currentTask.messageId)
  for(const {host,directory} of prepared){const command=host.os==='windows'?`Remove-Item -LiteralPath ${ps(directory)} -Recurse -Force -ErrorAction Stop`:`python3 -c ${q('import shutil; shutil.rmtree('+JSON.stringify(directory)+')')}`;const result=await cli('host','exec',host.id,'--directory',host.defaultDirectory,'--command',command);assert.equal(result.exit_code,0,result.stderr)}
 }finally{await f.close();fs.rmSync(profile,{recursive:true,force:true})}
}
