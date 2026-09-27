import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),bin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-mixed-host-'))
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const args=process.argv.slice(2);if(require('fs').existsSync(${JSON.stringify(path.join(bin,'offline'))}))process.exit(255);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`,{mode:0o755})
fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex fixture');process.exit(0)}if(process.argv[2]==='login'){console.log('Logged in');process.exit(0)}require('fs').appendFileSync(${JSON.stringify(path.join(bin,'native-starts'))},process.cwd()+String.fromCharCode(10));try{const dir=require('path').join(process.cwd(),'.agents-company/employees'),ids=require('fs').readdirSync(dir);if(ids.length===1)process.env.AGENTS_COMPANY_EMPLOYEE=ids[0]}catch{}require(${JSON.stringify(path.join(root,'test/fixtures/initialization-codex.cjs'))})
`,{mode:0o755})
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH})
const create=async(title,extra=[],token)=>{const card=await f.call(token,'card','create','--title',title,'--group','Mixed','--model','gpt-6-luna','--effort','low',...extra);await f.ready(card.id);return (await f.cli('session','list')).sessions.find(c=>c.id===card.id)}
try{
 const remote=path.join(f.temp,'remote');fs.mkdirSync(remote);const host=await f.cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}));await f.cli('group','add','Mixed','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const first=await create('First',['--management-role','manager','--work-environment','local']),second=await create('Second',['--management-role','manager','--work-environment','local']),a=await f.token(first.id),b=await f.token(second.id)
 assert.ok(first.cwd.startsWith(f.env.AGENTS_COMPANY_PROJECTS));assert.equal(first.remote,null)
 await f.call(a,'workspace','write','local.txt','--employee',first.id,'--content','Mac workspace');assert.ok(fs.existsSync(path.join(first.cwd,'local.txt')));assert.ok(!fs.existsSync(path.join(remote,'First')))
 const terminal=await f.cli('terminal','open','--employee',first.id);assert.equal(terminal.host,undefined);assert.equal(terminal.cwd,first.cwd);await f.cli('terminal','close',terminal.id)
 await f.cli('group','add','BoundCloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote);const boundPath=path.join(f.temp,'bound');fs.mkdirSync(boundPath);const bound=await f.cli('card','create','--title','Bound Manager','--group','BoundCloud','--management-role','manager','--work-environment','local','--directory-mode','bind','--cwd',boundPath,'--model','gpt-6-luna');await f.ready(bound.id);await f.cli('workspace','write','bound.txt','--employee',bound.id,'--content','bound works');assert.ok(fs.existsSync(path.join(boundPath,'bound.txt')));assert.ok(!fs.existsSync(path.join(f.env.AGENTS_COMPANY_PROJECTS,'BoundCloud')))
 const local=await create('Local',['--work-environment','local']),routed=await create('Routed'),native=await create('Native',['--kind','cloud-native-worker'])
 assert.equal(local.remote,null);assert.equal(routed.remote.directory,routed.cwd);assert.equal(native.remote.directory,native.cwd)
 assert.equal((await f.cli('management','topology','--team','Mixed')).edges.length,0,'user-created employees have no lines')
 for(const token of [a,b])for(const card of [local,routed,native]){
  const sent=await f.call(token,'session','send','--employee',card.id,'--text','Inspect your workspace');assert.ok(sent.messageId)
  await f.until(async()=>!(await f.status(card.id)).busy,'complete');assert.match((await f.call(token,'session','transcript','--employee',card.id)).text,/VISIBLE_REPLY/)
  if(card.id===native.id)assert.ok(fs.readFileSync(path.join(bin,'native-starts'),'utf8').includes(native.cwd))
  const opened=await f.call(token,'session','open','--employee',card.id);await f.call(token,'config','model',opened.sessionId,'gpt-6-luna');await f.call(token,'config','effort',opened.sessionId,'low')
  const hold=path.join(f.control,card.id+'.hold-user');fs.writeFileSync(hold,'');await f.call(token,'session','send','--employee',card.id,'--text','Wait for interruption');await f.until(async()=>(await f.status(card.id)).busy,'held')
  const queued=await f.call(token,'session','enqueue','--employee',card.id,'--text','queued task');assert.ok((await f.call(token,'session','queue','--employee',card.id)).some(item=>item.id===queued.id));await f.call(token,'session','dequeue','--employee',card.id,'--message-id',queued.id);await f.call(token,'session','interrupt','--employee',card.id);await f.until(async()=>!(await f.status(card.id)).busy,'interrupted');fs.unlinkSync(hold)
  const schedule=await f.call(token,'schedule','create','--name','Shared task','--employee',card.id,'--prompt','Scheduled check','--every-seconds','3600','--paused');const run=await f.call(token,'schedule','run',schedule.id)
  await f.until(async()=>(await f.cli('schedule','history',schedule.id)).some(item=>item.id===run.id&&['succeeded','completed'].includes(item.status)),'schedule');await f.call(token,'schedule','delete',schedule.id)
 }
 const child=await create('Created A',[],a),otherChild=await create('Created B',['--kind','cloud-native-worker'],b),edges=(await f.cli('management','topology')).edges
 assert.deepEqual(edges.map(edge=>[edge.managerId,edge.employeeId]).sort(),[[first.id,child.id],[second.id,otherChild.id]].sort())
 await f.call(b,'session','send','--employee',child.id,'--text','Second manager can manage the first manager child');await f.until(async()=>!(await f.status(child.id)).busy,'cross creator')
 await assert.rejects(()=>f.call(a,'session','send','--employee',second.id,'--text','Manager peer is not Employee'))
 await f.cli('group','add','Outside');const outside=await f.create('Outside','Outside');await assert.rejects(()=>f.call(a,'session','send','--employee',outside.id,'--text','outside'))
 await f.cli('group','rename','Mixed','Renamed');const saved=(await f.cli('session','list')).sessions.find(c=>c.id===first.id);assert.equal(saved.cwd,first.cwd);assert.equal(saved.localWorkspaceRoot,first.localWorkspaceRoot)
 await f.call(a,'session','send','--employee',local.id,'--text','After rename');await f.until(async()=>!(await f.status(local.id)).busy,'rename')
 await f.stop();await f.start();await f.call(a,'session','send','--employee',routed.id,'--text','After restart');await f.until(async()=>!(await f.status(routed.id)).busy,'restart')
 const revived=(await f.cli('session','list')).sessions.find(c=>c.id===first.id);assert.equal(revived.managementRole,'manager');assert.equal(revived.cwd,first.cwd)
 await f.call(b,'card','remove',child.id);await f.call(a,'card','remove',native.id);assert.ok(fs.existsSync(native.cwd),'Manager deletion keeps work files')
 await f.cli('card','management-role',first.id,'employee');await assert.rejects(()=>f.call(a,'session','send','--employee',local.id,'--text','Denied after demotion'));await f.call(b,'session','send','--employee',local.id,'--text','Other manager remains allowed')
 console.log('PASS same-Team Mac Managers control local, routed-cloud and native-cloud Employees through identical message/history/model/effort/schedule/delete APIs; creator-only lines, no peer/outside escalation, local files/terminal, rename and restart')
}finally{await f.close();fs.rmSync(bin,{recursive:true,force:true})}
