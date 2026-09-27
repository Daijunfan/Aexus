import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-transfers-')))
const dirs=Object.fromEntries(['home','shared','local','cloud','outside','bin'].map(n=>[n,path.join(temp,n)]));for(const d of Object.values(dirs))fs.mkdirSync(d)
fs.writeFileSync(path.join(dirs.bin,'ssh'),`#!/usr/bin/env python3\nimport os,sys\nif 'offline' in sys.argv:sys.stderr.write('fixture disconnected');sys.exit(255)\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:dirs.home,AGENTS_COMPANY_SHARED_DIR:dirs.shared,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Modules/Tunnel'),PATH:dirs.bin+':'+process.env.PATH}
const proc=spawn(process.execPath,[path.join(root,'bin/agents'),'serve'],{env,stdio:['ignore','ignore','pipe']});let stderr='';proc.stderr.on('data',x=>stderr+=x)
const done=new Promise(r=>proc.once('exit',r))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:60000})).stdout);assert.ok(r.ok,r.error);return r.data}
const until=async f=>{for(let i=0;i<300;i++){const v=await f();if(v)return v;await new Promise(r=>setTimeout(r,30))}throw Error('Timed out: '+stderr)}
const start=(from,to)=>cli('transfer','start','--from',JSON.stringify(from),'--to',JSON.stringify(to))
const finish=id=>until(async()=>{const j=await cli('transfer','get',id);return ['completed','failed','cancelled'].includes(j.state)&&j})
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
let checks=0;const ok=(v,label)=>{assert.ok(v,label);console.log('PASS '+label);checks++}
try{
 await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 await cli('group','add','Local','--directory-mode','bind','--root',dirs.local)
 const host=await cli('host','create','--data',JSON.stringify({name:'fixture',host:'fixture',os:'linux',defaultDirectory:dirs.cloud}))
 await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',dirs.cloud)
 const info=await cli('shared','info');ok(info.path===dirs.shared,'Shared is a real folder, independent from application state')
 await cli('view','shared','on');await cli('view','open','home');ok((await cli('view','get')).shared,'drawer state survives navigation through Core API')
 await cli('workspace','mkdir','inbox','--shared');await cli('workspace','write','inbox/note.md','--shared','--content','共享文档')
 ok((await cli('workspace','read','inbox/note.md','--shared')).content==='共享文档','shared workspace CRUD uses the existing file API')
 await assert.rejects(()=>cli('workspace','read','../outside','--shared'));await assert.rejects(()=>cli('workspace','list','.','--shared','--team','Local'))
 const file=path.join(dirs.local,'二进制 data.bin');fs.writeFileSync(file,crypto.randomBytes(5*1024*1024+31))
 let j=await finish((await start({team:'Local',path:'二进制 data.bin'},{shared:true,path:'inbox'})).id)
 ok(j.state==='completed'&&j.bytes===fs.statSync(file).size&&hash(file)===hash(path.join(dirs.shared,j.destination)),'binary file over 4 MB copies exactly with CLI progress')
 j=await finish((await start({shared:true,path:'inbox/二进制 data.bin'},{team:'Cloud',path:'.'})).id)
 ok(j.state==='completed'&&hash(file)===hash(path.join(dirs.cloud,'二进制 data.bin')),'shared → SSH workspace uses remote chunk protocol')
 await cli('workspace','mkdir','roundtrip','--shared')
 j=await finish((await start({team:'Cloud',path:'二进制 data.bin'},{shared:true,path:'roundtrip'})).id)
 ok(j.state==='completed'&&hash(file)===hash(path.join(dirs.shared,'roundtrip/二进制 data.bin')),'SSH workspace → shared preserves all binary bytes')
 const readOnly=path.join(dirs.local,'read-only.bin');fs.writeFileSync(readOnly,crypto.randomBytes(700000),{mode:0o444})
 j=await finish((await start({local:true,path:readOnly},{team:'Cloud',path:'.'})).id)
 ok(j.state==='completed'&&hash(readOnly)===hash(path.join(dirs.cloud,'read-only.bin'))&&(fs.statSync(path.join(dirs.cloud,'read-only.bin')).mode&0o777)===0o444,'read-only multi-chunk files copy successfully and restore source mode at completion')
 const folder=path.join(dirs.local,'Folder');fs.mkdirSync(path.join(folder,'子目录'),{recursive:true});fs.writeFileSync(path.join(folder,'子目录','空文件'),'');fs.writeFileSync(path.join(folder,'script.sh'),'#!/bin/sh\n',{mode:0o755});fs.mkdirSync(path.join(folder,'.agents-company'));fs.writeFileSync(path.join(folder,'.agents-company','private'),'managed')
 j=await finish((await start({local:true,path:folder},{team:'Cloud',path:'.'})).id)
 ok(j.state==='completed'&&fs.existsSync(path.join(dirs.cloud,'Folder/子目录/空文件'))&&!fs.existsSync(path.join(dirs.cloud,'Folder/.agents-company'))&&(fs.statSync(path.join(dirs.cloud,'Folder/script.sh')).mode&0o111)!==0,'directory copy preserves empty files and executable bit; host metadata stays out')
 j=await finish((await start({local:true,path:file},{shared:true,path:'inbox'})).id)
 ok(j.state==='failed'&&hash(file)===hash(path.join(dirs.shared,'inbox/二进制 data.bin')),'duplicate destination fails without overwriting either file')
 const removed=await cli('workspace','trash','inbox/二进制 data.bin','--shared')
 ok(!fs.existsSync(path.join(dirs.shared,'inbox/二进制 data.bin'))&&!!removed.id,'trash removes the original destination from the visible shared folder')
 j=await finish((await start({local:true,path:file},{shared:true,path:'inbox'})).id)
 ok(j.state==='completed'&&hash(file)===hash(path.join(dirs.shared,'inbox/二进制 data.bin')),'deleted same-name destination can be transferred again immediately')
 fs.symlinkSync(dirs.outside,path.join(dirs.local,'escape'))
 j=await finish((await start({team:'Local',path:'escape'},{shared:true,path:'.'})).id);ok(j.state==='failed','symlink outside scoped workspace is rejected')
 j=await finish((await start({team:'Local',path:'../outside'},{shared:true,path:'.'})).id);ok(j.state==='failed','transfer cannot read outside Team scope')
 j=await finish((await start({team:'Local',path:'Folder'},{team:'Local',path:'Folder'})).id);ok(j.state==='failed','recursive copy into source is rejected')
 const big=path.join(dirs.local,'cancel.bin');fs.writeFileSync(big,Buffer.alloc(32*1024*1024,42))
 const job=await start({local:true,path:big},{team:'Cloud',path:'.'});await cli('transfer','cancel',job.id);j=await finish(job.id)
 await until(async()=>!fs.readdirSync(dirs.cloud).some(x=>x.startsWith('.agents-transfer-')))
 ok(j.state==='cancelled'&&!fs.existsSync(path.join(dirs.cloud,'cancel.bin'))&&fs.existsSync(big),'cancel cleans staging, leaves no partial destination and preserves source')
 await cli('host','update',host.id,'--data','{"host":"offline"}')
 j=await finish((await start({team:'Cloud',path:'二进制 data.bin'},{shared:true,path:'.'})).id)
 ok(j.state==='failed'&&!fs.existsSync(path.join(dirs.shared,'二进制 data.bin')),'SSH failure never falls back to a same-named local file')
 ok(!(await cli('transfer','list')).some(j=>j.state==='running'),'all transfers reach terminal state')
 console.log(`PASS=${checks} — real CLI, SSH protocol fixture, no inference, no windows`)
}finally{proc.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
