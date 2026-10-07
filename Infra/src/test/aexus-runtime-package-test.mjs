// Execute the migrated CLI, Core and reference Engine inside ASAR from an unrelated cwd.
// Native dependencies are supplied by a sibling node_modules; full installers have separate validation.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
const require=createRequire(import.meta.url),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-packaged-contract-'))),stage=path.join(temp,'source'),archive=path.join(temp,'app.asar'),cwd=path.join(temp,'unrelated'),home=path.join(temp,'state'),out=path.join(root,'.aexus/artifacts/aexus-architecture/acceptance')
let service,ended,diagnostics=''
try{
 fs.mkdirSync(stage);fs.mkdirSync(cwd);fs.mkdirSync(path.join(temp,'no-plugins'));fs.mkdirSync(out,{recursive:true})
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 for(const name of ['package.json','Contract','Engine','Infra/src/cli','Infra/src/docs','.aexus/out/main']){
  const target=path.join(stage,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.cpSync(path.join(root,name),target,{recursive:true})
 }
 await require('@electron/asar').createPackage(stage,archive)
 const env={...process.env,ELECTRON_RUN_AS_NODE:'1',AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_SHARED_DIR:path.join(temp,'shared'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'no-plugins'),AGENTS_COMPANY_PLUGIN_DIRS:''}
 for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_URL','AGENTS_COMPANY_PORT','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_PACKAGE_ROOT','AEXUS_CLI','AGENTS_COMPANY_WEB','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
 const electron=require('electron'),cliEntry=path.join(archive,'Infra/src/cli/aexus')
 const invoke=async(...args)=>{const r=await run(electron,[cliEntry,...args,'--json'],{cwd,env,timeout:15000,maxBuffer:16e6});const reply=JSON.parse(r.stdout);assert.ok(reply.ok,reply.error);return reply.data}
 service=spawn(electron,[path.join(archive,'.aexus/out/main/daemon.js')],{cwd,env,stdio:['ignore','ignore','pipe','ipc']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>diagnostics=(diagnostics+data).slice(-8000))
 let ready=false
 for(let i=0;i<80;i++){
  if(service.exitCode!==null)throw Error('Packaged Core exited: '+diagnostics)
  try{await invoke('status');ready=true;break}catch{await new Promise(resolve=>setTimeout(resolve,80))}
 }
 assert.ok(ready,'Packaged Core did not become ready: '+diagnostics)
 const info=await invoke('contract','info');assert.equal(info.product,'Aexus');assert.equal(info.contractVersion,'1.0.0')
 const engines=await invoke('contract','engines');assert.ok(engines.engines.some(e=>e.id==='workspace-audit'));assert.deepEqual(engines.errors,[])
 const capability=await invoke('contract','describe','--command','workspace.list');assert.equal(capability.command.name,'workspace.list')
 await invoke('infra','group','add','Packaged Research')
 const script=path.join(archive,'Engine/workspace-audit/cli.mjs'),target=path.join(temp,'audit.json'),args=[script,'--input',JSON.stringify({team:'Packaged Research'}),'--output',target]
 const response=await run(electron,args,{cwd,env,timeout:30000,maxBuffer:16e6}),report=JSON.parse(response.stdout)
 assert.ok(report.ok,report.error);assert.equal(report.data.engineId,'workspace-audit');assert.equal(report.data.workspaces.length,1);assert.ok(report.data.acceptance.passed)
 assert.deepEqual(JSON.parse(fs.readFileSync(target)),report.data)
 const original=fs.readFileSync(target)
 await assert.rejects(run(electron,args,{cwd,env,timeout:30000,maxBuffer:16e6}),error=>error.code===1&&JSON.parse(error.stdout).code==='EEXIST')
 assert.ok(fs.readFileSync(target).equals(original),'An existing report must not be overwritten')
 const old=JSON.parse((await run(electron,[path.join(archive,'Infra/src/cli/agents'),'group','list','--json'],{cwd,env,timeout:15000})).stdout)
 assert.deepEqual(old.data,await invoke('infra','group','list'))
 assert.equal((await invoke('session','list')).sessions.length,0)
 const proof={passed:true,archiveRuntime:'Electron ASAR with installed sibling dependencies',checks:['Resource discovery from unrelated cwd','Aexus and legacy CLI alias target the same temporary Core','Versioned capability discovery and Engine manifest inside the archive','Reference Engine CLI performs real Contract reads and saves matching JSON','Existing delivery file is never overwritten','No employees or model requests created'],installed:false,paidModels:0,productionDataUsed:false}
 fs.writeFileSync(path.join(out,'packaged-contract.json'),JSON.stringify(proof,null,2));console.log('PASS '+proof.checks.join('; '))
}finally{
 if(service&&service.exitCode===null&&service.signalCode===null){let timer;if(service.connected)service.send({type:'agents-company:shutdown'});else service.kill('SIGTERM');await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(()=>{service.kill('SIGKILL');resolve()},10000)})]);clearTimeout(timer);await ended}
 fs.writeFileSync(path.join(out,'packaged-contract-diagnostics.log'),diagnostics)
 fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
