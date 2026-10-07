// Real isolated Core + deterministic Pi/SSH peers. No provider or remote connection.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-pi-close-')))
const markers=path.join(temp,'markers'),bin=path.join(temp,'bin'),entry=path.join(temp,'daemon.cjs')
fs.mkdirSync(markers);fs.mkdirSync(bin);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 let fixture=fs.readFileSync(path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),'utf8')
 fixture=fixture.replace("title:name==='agents_company_documentation'?'Aexus documentation':'Aexus discussion'","title:name==='agents_company_documentation'?'Aexus documentation':name==='agents_company_api'?'Aexus API':'Aexus discussion'")
 const marker=' const post=control&&employee?workPostArgs(text,control,employee):undefined'
 assert.equal(fixture.split(marker).length,2)
 fixture=fixture.replace(marker,`
 if(text.includes('PI_CLOSE_RACE ')){
  const spec=JSON.parse(text.slice(text.lastIndexOf('PI_CLOSE_RACE ')+'PI_CLOSE_RACE '.length));process.env.PI_RACE_CASE=spec.name;
  await nativeTool('agents_company_api',{command:'host.check',args:{id:spec.hostId}});
  fs.writeFileSync(path.join(process.cwd(),'unexpected-result.txt'),'must not finish after close');
  finish('SHOULD_NOT_SUCCEED_AFTER_CLOSE');return;
 }
 `+marker)
 const end="process.stdin.on('end',()=>process.exit(0))"
 assert.equal(fixture.split(end).length,2)
 fixture=fixture.replace(end,`process.stdin.on('end',()=>{
  const name=process.env.PI_RACE_CASE;if(!name){process.exit(0);return}
  fs.writeFileSync(path.join(process.env.PI_RACE_DIR,name+'.stdin-ended'),'');
  // Keep the process alive after EOF while its pending Core tool finishes.
  setTimeout(()=>{fs.writeFileSync(path.join(process.env.PI_RACE_DIR,name+'.exited'),'');process.exit(0)},1000)
 })`)
 const pi=path.join(temp,'pi-fixture.cjs');fs.writeFileSync(pi,fixture,{mode:0o755})
 fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
if(!process.argv.at(-1).includes('__AGENTS_COMPANY_ALIVE__'))throw Error('Unexpected fixture SSH command');
const dir=process.env.PI_RACE_DIR,name=fs.readFileSync(path.join(dir,'current'),'utf8');
fs.writeFileSync(path.join(dir,name+'.tool-started'),'');
const timer=setInterval(()=>{if(!fs.existsSync(path.join(dir,name+'.stdin-ended')))return;clearInterval(timer);fs.writeFileSync(path.join(dir,name+'.tool-finished'),'');console.log('__AGENTS_COMPANY_ALIVE__')},10);
`,{mode:0o755})
 f=await fixtureCore({PI_BIN:pi,PI_RACE_DIR:markers,PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_SHARED_DIR:path.join(temp,'shared'),AGENTS_COMPANY_WEB:'0',DEEPSEEK_API_KEY:'fixture-only-not-real',NODE_OPTIONS:'--unhandled-rejections=strict'},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await rpc('engine.configure',{engine:'pi',patch:{apiKey:'fixture-only-not-real'}})
 await rpc('group.add',{name:'Pi close regression'})
 const employee=await rpc('card.create',{title:'Pi Secretary',group:'Pi close regression',engine:'pi',managementRole:'secretary',permissionMode:'bypassPermissions'})
 await f.ready(employee.id)
 const host=await rpc('host.create',{name:'Local protocol fixture',host:'pi-close-fixture',os:'linux',defaultDirectory:temp})
 for(const name of ['timeout','cancel']){
  fs.writeFileSync(path.join(markers,'current'),name)
  const job=await rpc('schedule.create',{spec:{name,enabled:false,action:{type:'agent',employeeId:employee.id,prompt:'PI_CLOSE_RACE '+JSON.stringify({name,hostId:host.id})},rule:{kind:'interval',everySeconds:3600},timeoutSeconds:name==='timeout'?1:30}})
  const run=await rpc('schedule.run',{id:job.id})
  await f.until(()=>fs.existsSync(path.join(markers,name+'.tool-started')),'pending Core tool')
  if(name==='cancel')await rpc('schedule.cancel',{id:run.id})
  await f.until(()=>fs.existsSync(path.join(markers,name+'.stdin-ended')),'Pi input closes')
  await f.until(()=>fs.existsSync(path.join(markers,name+'.tool-finished')),'Core tool completes after Pi input closes')
  await f.until(()=>fs.existsSync(path.join(markers,name+'.exited')),'Pi exits after the late response')
  assert.equal((await f.cli('status')).running,true,'late Pi response must not kill Core')
  const history=await rpc('schedule.history',{id:job.id})
  assert.equal(history[0].id,run.id)
  assert.equal(history[0].status,name==='timeout'?'timed_out':'cancelled')
  assert.ok(!fs.existsSync(path.join(employee.cwd,'unexpected-result.txt')))
  assert.ok(!JSON.stringify(await rpc('session.transcript',{employee:employee.id})).includes('SHOULD_NOT_SUCCEED_AFTER_CLOSE'))
  console.log('PASS '+name+': tool finishes after stdin closes; Core stays alive; run is not successful')
 }
 await rpc('session.send',{employee:employee.id,text:'Recovery after close'})
 await f.until(async()=>!(await f.status(employee.id)).busy,'new Pi session completes')
 assert.match((await rpc('session.transcript',{employee:employee.id})).text,/山海皆可平/)
 console.log('PASS a later Pi turn works after both closures; no real models or hosts used')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
