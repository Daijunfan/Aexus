// Explicit opt-in live check. Only isolated CLI state and uniquely named remote test folders.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
if(process.env.AGENTS_COMPANY_LIVE_TRANSFER!=='1')throw Error('Set AGENTS_COMPANY_LIVE_TRANSFER=1 to run authorized live SSH tests')
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),id=crypto.randomUUID(),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-transfer-live-')))
const linuxDir='/home/djf/.ac-transfer-'+id,windowsDir=String.raw`C:\Users\lab\AgentsCompany\.ac-transfer-${id}`
const hosts=JSON.parse(fs.readFileSync(path.join(os.homedir(),'AgentsCompany/cloud-hosts/hosts.json'),'utf8')),win=hosts.find(x=>x.name==='Windows-target2')
assert.ok(win?.identityFile&&win.knownHosts)
const linuxSSH=['-o','BatchMode=yes','-o','ConnectTimeout=10',process.env.AGENTS_LIVE_LINUX_HOST]
const windowsSSH=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes','-o','UserKnownHostsFile='+win.knownHosts,'-i',win.identityFile,'-J',win.jump,'-p',String(win.port),win.host]
const q=s=>"'"+s.replaceAll("'","'\\''")+"'"
const shell=async(args,command)=>run('ssh',[...args,command],{timeout:60000,maxBuffer:1024*1024})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_SHARED_DIR:path.join(temp,'shared'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel')}
let proc,ended
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:60000})).stdout);assert.ok(r.ok,r.error);return r.data}
const until=async f=>{for(let n=0;n<600;n++){const x=await f();if(x)return x;await new Promise(r=>setTimeout(r,100))}throw Error('Timed out')}
const copy=async(from,to)=>{const start=await cli('transfer','start','--from',JSON.stringify(from),'--to',JSON.stringify(to));const job=await until(async()=>{const j=await cli('transfer','get',start.id);return !['queued','running'].includes(j.state)&&j});assert.equal(job.state,'completed',JSON.stringify(job));return job}
try{
 await shell(linuxSSH,'mkdir '+q(linuxDir));await shell(windowsSSH,`$ErrorActionPreference='Stop'; [IO.Directory]::CreateDirectory('${windowsDir}') | Out-Null`)
 proc=spawn(process.execPath,[path.join(root,'bin/agents'),'serve'],{env,stdio:'ignore'});ended=new Promise(r=>proc.once('exit',r))
 await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 const a=await cli('host','create','--data',JSON.stringify({name:'Live Linux',host:process.env.AGENTS_LIVE_LINUX_HOST,os:'linux',defaultDirectory:linuxDir}))
 const b=await cli('host','create','--data',JSON.stringify({name:'Live Windows',host:win.host,os:'windows',port:win.port,jump:win.jump,identityFile:win.identityFile,knownHosts:win.knownHosts,defaultDirectory:windowsDir}))
 await cli('group','add','Linux','--mode','cloud','--host-id',a.id,'--remote-dir',linuxDir);await cli('group','add','Windows','--mode','cloud','--host-id',b.id,'--remote-dir',windowsDir)
 const source=path.join(temp,'dataset'),output=path.join(temp,'output');fs.mkdirSync(path.join(source,'中文 子目录'),{recursive:true});fs.mkdirSync(output)
 const binary=crypto.randomBytes(5*1024*1024+37);fs.writeFileSync(path.join(source,'跨主机.bin'),binary);fs.writeFileSync(path.join(source,'中文 子目录','empty'),'');fs.writeFileSync(path.join(source,'中文 子目录','说明.txt'),'跨主机真实文件测试\n');fs.writeFileSync(path.join(source,'run.sh'),'#!/bin/sh\necho transfer\n',{mode:0o755})
 const results=[]
 results.push(await copy({local:true,path:source},{team:'Linux',path:'.'}));console.log('PASS Mac → Linux folder')
 results.push(await copy({team:'Linux',path:'dataset'},{shared:true,path:'.'}));console.log('PASS Linux → Shared folder')
 results.push(await copy({shared:true,path:'dataset'},{team:'Windows',path:'.'}));console.log('PASS Shared → Windows folder')
 results.push(await copy({team:'Windows',path:'dataset'},{local:true,path:output}));console.log('PASS Windows → Mac folder')
 assert.deepEqual(fs.readFileSync(path.join(output,'dataset/跨主机.bin')),binary);assert.equal(fs.readFileSync(path.join(output,'dataset/中文 子目录/说明.txt'),'utf8'),'跨主机真实文件测试\n');assert.equal(fs.statSync(path.join(output,'dataset/中文 子目录/empty')).size,0)
 assert.equal(fs.statSync(path.join(output,'dataset/跨主机.bin')).mode&0o777,0o644)
 results.push(await copy({team:'Windows',path:'dataset/跨主机.bin'},{team:'Linux',path:'.'}))
 const expected=crypto.createHash('sha256').update(binary).digest('hex'),actual=(await shell(linuxSSH,'sha256sum '+q(linuxDir+'/跨主机.bin'))).stdout.split(' ')[0];assert.equal(actual,expected)
 console.log('PASS direct Windows → Linux binary, SHA-256 '+actual)
 fs.writeFileSync(path.join(root,'artifacts/transfers-live.json'),JSON.stringify({verifiedAt:new Date().toISOString(),sha256:actual,bytes:binary.length,routes:results.map(x=>({from:x.from,to:x.to,bytes:x.bytes,files:x.files,state:x.state}))},null,2)+'\n')
}finally{
 if(proc){proc.kill('SIGTERM');await ended}
 await shell(linuxSSH,'python3 -c '+q(`import shutil; shutil.rmtree(${JSON.stringify(linuxDir)}, ignore_errors=True)`))
 await shell(windowsSSH,`if(Test-Path -LiteralPath '${windowsDir}'){Remove-Item -LiteralPath '${windowsDir}' -Recurse -Force}`)
 fs.rmSync(temp,{recursive:true,force:true})
}
