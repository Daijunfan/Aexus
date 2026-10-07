// Exercise the real SSH transport with an isolated loopback SSH fixture; no live host is modified.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-delete-remote-'))),bin=path.join(temp,'bin'),remote=path.join(temp,'remote'),home=path.join(temp,'state'),run=promisify(execFile)
fs.mkdirSync(bin);fs.mkdirSync(remote)
fs.writeFileSync(path.join(bin,'ssh'),`#!/bin/sh\n[ -e '${temp}/offline' ] && exit 255\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n`,{mode:0o755})
const env={...process.env,PATH:[bin,path.dirname(process.execPath),process.env.PATH].join(':'),AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_TUNNEL_DIR:path.join(root,'Infra/src/tunnel')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
let service,ended
const cli=async(...args)=>{let stdout;try{stdout=(await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:30000})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}const result=JSON.parse(stdout);if(!result.ok)throw Error(result.error);return result.data}
const start=async()=>{service=spawn(process.execPath,[root+'/Infra/src/cli/agents','serve'],{env,stdio:'ignore'});ended=new Promise(resolve=>service.once('exit',resolve));for(let i=0;i<80;i++){try{await cli('status');return}catch{await new Promise(resolve=>setTimeout(resolve,50))}}throw Error('Core did not start')}
const seed=(id,cwd)=>{fs.mkdirSync(path.join(cwd,'nested'),{recursive:true});fs.writeFileSync(path.join(cwd,'nested/file.txt'),'remote data');const file=path.join(home,'sessions.json'),store=JSON.parse(fs.readFileSync(file));store.sessions.push({id,title:id,engine:'codex',kind:'worker',group:'Cloud',cwd,createdAt:Date.now()});fs.writeFileSync(file,JSON.stringify(store));return {id,cwd}}
try{
 await start();const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}));await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const keep=seed('remote_keep',path.join(remote,'keep'));await cli('card','remove',keep.id);assert.ok(fs.existsSync(path.join(keep.cwd,'nested/file.txt')))
 const both=seed('remote_both',path.join(remote,'both'));await cli('card','remove',both.id,'--delete-workspace');assert.ok(!fs.existsSync(both.cwd));assert.ok(fs.existsSync(remote))
 const parent=seed('remote_parent',path.join(remote,'parent')),child=seed('remote_child',path.join(parent.cwd,'child'))
 await assert.rejects(()=>cli('card','remove',parent.id,'--delete-workspace'),/其他员工/);assert.ok(fs.existsSync(child.cwd))
 const rootCard=seed('remote_root',remote);await assert.rejects(()=>cli('card','remove',rootCard.id,'--delete-workspace'));assert.ok(fs.existsSync(remote))
 service.kill('SIGTERM');await ended;fs.writeFileSync(path.join(temp,'offline'),'');await start()
 await assert.rejects(()=>cli('card','remove',parent.id,'--delete-workspace'));assert.ok(fs.existsSync(parent.cwd))
 const stored=JSON.parse(fs.readFileSync(path.join(home,'sessions.json'))).sessions.find(card=>card.id===parent.id);assert.ok(stored&&!stored.deleting)
 console.log('PASS remote CLI routes recursive deletion through SSH, keeps files by default, protects Team/shared directories, and preserves record/data on disconnect')
}finally{service?.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
