import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const bin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-process-cloud-')),fixture=path.resolve('Infra/src/test/fixtures/process-adapter.cjs')
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('node:child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`,{mode:0o755})
const f=await fixtureCore({CLINE_BIN:fixture,PI_BIN:fixture,PATH:bin+path.delimiter+process.env.PATH})
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
const send=async(card,text)=>{await rpc('session.send',{employee:card.id,text});await f.until(async()=>!(await f.status(card.id)).busy,'turn done');return JSON.stringify(await f.cli('session','transcript','--employee',card.id))}
try{
 const remote=path.join(f.temp,'cloud');fs.mkdirSync(remote);const h=await f.cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}));await f.cli('group','add','Cloud','--mode','cloud','--host-id',h.id,'--remote-dir',remote)
 for(const engine of ['cline','pi']){
  await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  const manager=await f.cli('card','create','--title',engine+' Manager','--group','Cloud','--engine',engine,'--management-role','manager','--work-environment','local');await f.ready(manager.id)
  const governor=await f.cli('card','create','--title',engine+' Governor','--group','Cloud','--engine',engine,'--management-role','governor','--work-environment','local');await f.ready(governor.id)
  const token=await f.token(manager.id),capability=await f.call(token,'engine','capabilities','--engine',engine)
  assert.deepEqual(capability.workspaceModes,['build','cloud','work']);assert.deepEqual(capability.employeeKinds,['worker'])
  assert.ok((await f.call(await f.token(governor.id),'engine','capabilities','--engine',engine)).capabilities)
  const card=await f.call(token,'card','create','--title',engine+' Remote','--engine',engine,'--kind','worker')
  assert.equal(card.group,'Cloud');assert.equal(card.createdBy.employeeId,manager.id);assert.ok(card.cwd.startsWith(remote));await f.ready(card.id);assert.equal((await f.status(card.id)).initialization.status,'ready')
  const opened=await f.cli('session','open',card.id);assert.equal(opened.cwd,card.cwd)
  assert.equal((await f.cli('engine','inspect',opened.sessionId,'mcp')).data[0].name,'tunnel')
  assert.equal((await f.cli('engine','inspect',opened.sessionId,'capabilities')).engine,engine)
  await f.cli('config','permission',opened.sessionId,'bypassPermissions')
  assert.ok((await send(card,'WRITE_FIXTURE')).includes('denied'),'local write is rejected even in Full access')
  const localLaunch=path.join(f.env.AGENTS_COMPANY_HOME,'tunnel',card.id);assert.ok(!fs.existsSync(path.join(localLaunch,'approval.txt')));assert.ok(!fs.existsSync(path.join(card.cwd,'approval.txt')))
  const invalid=await f.request(null,'card.create',{title:'Invalid '+engine,group:'Cloud',engine,kind:'cloud-native-worker'});assert.equal(invalid.ok,false);assert.ok(!fs.existsSync(path.join(remote,'Invalid '+engine)))
  assert.equal((await f.request(token,'card.create',{title:'Forbidden Manager',group:'Cloud',engine,managementRole:'manager',workEnvironment:'local'})).ok,false)
  if(engine==='pi'){
   assert.ok((await send(card,'UNAPPROVED_TUNNEL_FIXTURE')).includes('no matching Core approval'))
   const tool=async(name,input)=>send(card,'TUNNEL_FIXTURE '+JSON.stringify({toolName:'tunnel__'+name,input}))
   await tool('write_file',{path:'remote.txt',content:'Tunnel bytes'});assert.equal(fs.readFileSync(path.join(card.cwd,'remote.txt'),'utf8'),'Tunnel bytes')
   assert.ok((await tool('read_file',{path:'remote.txt'})).includes('Tunnel bytes'))
   await rpc('session.send',{employee:card.id,text:'TUNNEL_FIXTURE '+JSON.stringify({toolName:'tunnel__execute',input:{command:'sleep 2; printf bad > cancelled.txt'}})});await new Promise(r=>setTimeout(r,150));await rpc('session.interrupt',{employee:card.id});await f.until(async()=>!(await f.status(card.id)).busy,'cancel remote command');await new Promise(r=>setTimeout(r,2200));assert.ok(!fs.existsSync(path.join(card.cwd,'cancelled.txt')))
   fs.renameSync(card.cwd,card.cwd+'.away');assert.ok((await tool('read_file',{path:'remote.txt'})).includes('isError'));fs.renameSync(card.cwd+'.away',card.cwd)
  }
 }
 console.log('PASS Cline/Pi: Manager/Governor capability discovery and hiring, cloud identity, no local execution in Full access, native-cloud rejection; Pi MCP read/write, approval-bound RPC, cancellation and disconnected target')
}finally{await f.close();fs.rmSync(bin,{recursive:true,force:true})}
