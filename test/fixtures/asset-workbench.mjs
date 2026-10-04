import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {fixtureCore} from './headless-core.mjs'
import {localTunnel} from './local-tunnel.mjs'

export async function assetWorkbenchFixture(application,extra={}){
 const root=path.resolve(import.meta.dirname,'../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'avalon-file-workbench-'))),shared=path.join(temp,'shared'),remote=path.join(temp,'remote')
 fs.mkdirSync(shared);fs.mkdirSync(remote);fs.mkdirSync(path.join(shared,'Documents'));fs.mkdirSync(path.join(shared,'Empty'));fs.writeFileSync(path.join(shared,'Documents','100%_plan.md'),'# Shared plan\nExact UTF-8 原件');fs.writeFileSync(path.join(shared,'.hidden.txt'),'hidden')
 const f=await fixtureCore({AGENTS_COMPANY_SHARED_DIR:shared,AGENTS_COMPANY_TUNNEL_DIR:localTunnel(path.join(temp,'tunnel'),root),...extra},path.join(application,'out/main/daemon.js'))
 const rpc=async(command,args={},token=null)=>{const result=await f.request(token,command,args);assert.ok(result.ok,command+': '+result.error);return result.data}
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{messages:{theme:'white'}}});await f.cli('group','add','Product team');await f.cli('group','add','Research team')
  const a=await f.create('Alex','Product team'),b=await f.create('Alex','Research team')
  await rpc('workspace.write',{team:'Product team',path:'team-overview.md',content:'# Product team originals',create:true})
  await rpc('workspace.write',{employee:a.id,path:'personal.txt',content:'Alex Product personal',create:true});await rpc('workspace.write',{employee:b.id,path:'personal.txt',content:'Alex Research personal',create:true})
  const group=await rpc('chat.create',{name:'项目评审',members:[a.id,b.id]}),conversation='group:'+group.id,workspace=await rpc('conversation.workspace',{conversation}),member=workspace.members.find(x=>x.employeeId===a.id),peer=workspace.members.find(x=>x.employeeId===b.id)
  for(const [file,content] of [['brief.md','Shared group user original'],[member.directory+'/draft.md','Product member draft'],[peer.directory+'/peer.txt','Research member draft']])await rpc('conversation.file',{conversation,operation:'write',path:file,content,create:true})
  const source=await rpc('channel.source-add',{plugin:'telegram',locator:'asset_workspace_fixtures',name:'资料频道'})
  await f.cli('channel','update',source.channelId,'--admins',JSON.stringify([a.id,b.id]))
  const channel='channel:'+source.channelId,channelWorkspace=await rpc('conversation.workspace',{conversation:channel}),channelMember=channelWorkspace.members.find(x=>x.employeeId===a.id)
  await rpc('conversation.file',{conversation:channel,operation:'write',path:'channel-notes.txt',content:'Channel user original',create:true})
  await rpc('conversation.file',{conversation:channel,operation:'write',path:channelMember.directory+'/analysis.ts',content:'export const reviewed = true',create:true})
  const image=fs.readFileSync(path.join(root,'app_icon.png')),externalId='published-image',publishedAt=Date.now(),upload=await rpc('channel.media-put',{sourceId:source.id,externalId,publishedAt,mediaKey:'poster',name:'reference.png',mimeType:'image/png',data:image.toString('base64')})
  const post=await rpc('channel.publish',{sourceId:source.id,externalId,publishedAt,title:'Reference image',body:'Fixture publication',mediaIds:[upload.media.id]})
  const host=await rpc('host.create',{name:'Fixture remote',host:'fixture',os:'linux',defaultDirectory:remote});await f.cli('group','add','Remote team','--mode','cloud','--host-id',host.id,'--remote-dir',remote);fs.writeFileSync(path.join(remote,'remote.txt'),'Remote protocol original')
  const collector=await rpc('channel.collector-add',{name:'Fixture collector',sourceIds:[source.id]});await rpc('channel.update',{id:source.channelId,engine:{kind:'external',location:'remote',name:'Local protocol fixture',host:'fixture',endpoint:'http://127.0.0.1:5152',collectorId:collector.collector.id,fileStorage:{hostId:host.id,directory:remote}}})
  const document=Buffer.from('Original cloud document 原文'),hash=crypto.createHash('sha256').update(document).digest('hex');fs.mkdirSync(path.join(remote,hash.slice(0,2)),{recursive:true});fs.writeFileSync(path.join(remote,hash.slice(0,2),hash),document)
  const cloudPost=await rpc('channel.publish',{sourceId:source.id,externalId:'cloud-document',publishedAt:Date.now(),title:'Source document',body:'File fixture',files:[{id:'doc',name:'cloud-source.txt',mimeType:'text/plain',bytes:document.length,sha256:hash}]})
  await rpc('assets.file',{id:'plan:exports',operation:'write',path:'weekly-review.md',content:'# Plan output',create:true})
  const legacy=path.join(f.env.AGENTS_COMPANY_HOME,'chats','media',group.id);fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'legacy.png'),image)
  const settled=async(args={})=>{await rpc('assets.search',{refresh:true,limit:1});return f.until(async()=>{const page=await rpc('assets.search',{limit:500,...args});return !page.indexing&&page},'asset indexing')}
  return {...f,root,temp,shared,remote,rpc,a,b,group,conversation,workspace,member,peer,source,channel,channelWorkspace,channelMember,post,mediaId:upload.media.id,image,cloudPost,document,settled,close:async()=>{await f.close();fs.rmSync(temp,{recursive:true,force:true})}}
 }catch(error){await f.close();fs.rmSync(temp,{recursive:true,force:true});throw error}
}
