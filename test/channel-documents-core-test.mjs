// Channel document metadata never imports bytes; only an explicit human download does.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),built=await profileApplication(),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-channel-documents-'))),cloud=path.join(temp,'cloud'),bin=path.join(temp,'bin')
fs.mkdirSync(cloud);fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin,'ssh'),"#!/usr/bin/env python3\nimport os,sys\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n",{mode:0o755})
const f=await fixtureCore({PATH:bin+':'+process.env.PATH},path.join(built.directory,'out/main/daemon.js'))
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data},now=Date.now()
let checks=0;const ok=(value,label)=>{assert.ok(value,label);console.log('PASS '+label);checks++}
try{
 const host=await rpc('host.create',{name:'Document fixture',host:'fixture',os:'linux',defaultDirectory:cloud})
 const source=await rpc('channel.source-add',{plugin:'telegram',targetId:'trunkietrunk-fixture',locator:'trunkietrunk',name:'English Trunk'})
 const collector=await rpc('channel.collector-add',{name:'Documents',sourceIds:[source.id]})
 await rpc('channel.update',{id:source.channelId,engine:{kind:'external',location:'remote',name:'Cloud collector',host:'fixture',endpoint:'http://127.0.0.1:5152/api/channels/collector',collectorId:collector.collector.id,fileStorage:{hostId:host.id,directory:cloud}}})
 const documents=[['annual.pdf','application/pdf',Buffer.concat([Buffer.from('%PDF-1.7\n'),crypto.randomBytes(600000)])],['reader.epub','application/epub+zip',Buffer.concat([Buffer.from('PK\x03\x04'),crypto.randomBytes(500000)])],['notes.txt','text/plain',Buffer.from('Original document\n原文\n')]]
 const files=documents.map(([name,mimeType,data],index)=>{const sha256=crypto.createHash('sha256').update(data).digest('hex'),destination=path.join(cloud,sha256.slice(0,2),sha256);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,data);return {id:'file-'+index,name,mimeType,bytes:data.length,sha256}})
 const args={sourceId:source.id,externalId:'23604',publishedAt:now-48*3600000,title:'',body:'Original caption',files}
 const published=await rpc('channel.publish',args),workspace=await rpc('conversation.workspace',{conversation:'channel:'+source.channelId})
 ok((await rpc('conversation.file',{conversation:'channel:'+source.channelId,operation:'list'})).entries.length===0,'publishing document metadata does not copy any cloud bytes to the channel')
 const post=await rpc('channel.post',{id:published.id});ok(post.files.length===3&&post.body===args.body,'PDF, EPUB and other files keep their original metadata and caption')
 ok(post.expiresAt===args.publishedAt+7*86400000,'document channel posts use the same seven-day cloud retention')
 ok((await rpc('channel.collector-config')).targets.find(t=>t.sourceId===source.id).collectFiles===true,'worker configuration explicitly enables document collection')
 ok((await rpc('channel.publish',args)).status==='duplicate','document metadata re-publication is idempotent')
 fs.writeFileSync(path.join(workspace.root,'annual.pdf'),'User-owned original')
 for(const file of files){
  const initial=await rpc('channel.file-download',{postId:post.id,fileId:file.id});assert.ok(['running','queued'].includes(initial.state))
  const result=await f.until(async()=>{const value=await rpc('channel.file-status',{postId:post.id,fileId:file.id});return ['completed','failed'].includes(value.state)&&value},'download '+file.name)
  assert.equal(result.state,'completed',result.error)
  const content=documents.find(item=>item[0]===file.name)[2];ok(fs.readFileSync(path.join(workspace.root,result.path)).equals(content),'explicit '+file.name+' download persists exact bytes in the channel workspace')
  assert.equal((await rpc('channel.file-download',{postId:post.id,fileId:file.id})).state,'completed')
 }
 ok(fs.readFileSync(path.join(workspace.root,'annual.pdf'),'utf8')==='User-owned original','download never overwrites a user file with the same name')
 await f.cli('group','add','Permissions');const employee=await f.create('Reader','Permissions'),token=await f.token(employee.id)
 ok((await f.request(token,'channel.file-download',{postId:post.id,fileId:files[0].id})).ok===false,'an Agent cannot initiate the human download operation')
 assert.equal((await f.request(null,'channel.publish',{...args,externalId:'bad',files:[{...files[0],sha256:'../secrets'}]})).ok,false)
 const damaged={...files[2],id:'damaged',bytes:files[2].bytes+1};const bad=await rpc('channel.publish',{...args,externalId:'bad-size',files:[damaged]})
 await rpc('channel.file-download',{postId:bad.id,fileId:'damaged'});const rejected=await f.until(async()=>{const value=await rpc('channel.file-status',{postId:bad.id,fileId:'damaged'});return value.state==='failed'&&value},'SHA and byte verification')
 ok(rejected.error.includes('SHA-256')&&!fs.existsSync(path.join(workspace.root,'notes ('+damaged.sha256.slice(0,8)+').txt')),'incorrect document metadata leaves no completed local file')
 await f.stop();await f.start();ok((await rpc('channel.file-status',{postId:post.id,fileId:files[0].id})).state==='completed','download completion persists across Core restart')
 await rpc('channel.delete',{id:post.id});ok(fs.readdirSync(workspace.root).some(name=>name.endsWith('.epub')),'local channel documents survive removal of the remote news item')
 await f.stop();await f.start();ok(fs.readdirSync((await rpc('conversation.workspace',{conversation:'channel:'+source.channelId})).root).some(name=>name.endsWith('.epub')),'the channel workspace survives Core restart')
 console.log('PASS '+checks+' channel document checks — isolated CLI/Core and SSH protocol fixture, no models')
}finally{await f.close();built.dispose();fs.rmSync(temp,{recursive:true,force:true})}
