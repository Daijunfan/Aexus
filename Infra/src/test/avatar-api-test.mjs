import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,create,token,request}=f
const rpc=async(auth,cmd,args={})=>{const r=await request(auth,cmd,args);assert.ok(r.ok,r.error);return r.data}
try{
 await cli('group','add','A');await cli('group','add','B')
 const manager=await create('Fresh Manager','A','manager'),governor=await create('Fresh Governor','A','governor'),employee=await create('Ordinary','A'),outside=await create('Outside','B')
 const m=await token(manager.id),g=await token(governor.id),e=await token(employee.id)
 const catalog=await rpc(m,'avatar.list');assert.equal(catalog.length,57);assert.ok((await rpc(e,'avatar.list')).length===57)
 assert.equal((await rpc(m,'avatar.list',{query:'英雄王',style:'chibi'}))[0].id,'fate-gilgamesh-chibi')
 assert.equal((await rpc(g,'avatar.list',{query:'吉尔伽美什 可爱版'})).length,1)
 assert.equal((await rpc(m,'avatar.list',{all:true})).length,76)
 for(const auth of [m,g]){
  const docs=(await rpc(auth,'api.docs',{document:'core/api'})).markdown;assert.match(docs,/character.*avatarStyle/);assert.match(docs,/profession/);assert.match(docs,/card avatar/)
  const schema=await rpc(auth,'api.describe',{command:'card.create'});assert.ok(schema.inputSchema.properties.character&&schema.inputSchema.properties.profession&&schema.inputSchema.properties.managementRole)
 }
 let created=0
 for(const [auth,supervisor,group] of [[m,manager,'A'],[g,governor,'B']])for(const [index,appearance] of catalog.entries()){
  const card=await rpc(auth,'card.create',{title:supervisor.managementRole+'-'+index,group,...(supervisor.managementRole==='manager'?{character:appearance.characterId,avatarStyle:appearance.style}:{avatar:appearance.id}),profession:'测试职责',managementRole:'employee',engine:'codex',model:'gpt-6-luna',effort:'low'});created++
  assert.equal(card.avatar,appearance.id);assert.equal(card.role,'测试职责');assert.equal(card.createdBy.employeeId,supervisor.id)
  const read=(await rpc(auth,'session.status',{employee:card.id}))[0];assert.equal(read.avatar,appearance.id);assert.equal(read.avatarName,appearance.name);assert.equal(read.profession,'测试职责')
 }
 const hero=await rpc(m,'card.create',{title:'Unrelated display name',group:'A',character:'英雄王',avatarStyle:'chibi',profession:'代码审查',managementRole:'employee',engine:'codex'})
 assert.equal(hero.avatar,'fate-gilgamesh-chibi');assert.equal(hero.title,'Unrelated display name')
 const cliHero=await f.call(m,'card','create','--title','CLI character','--character','吉尔伽美什','--avatar-style','可爱版','--profession','Reviewer','--engine','codex','--management-role','employee','--thinking','off');assert.equal(cliHero.avatar,'fate-gilgamesh-chibi');assert.equal(cliHero.role,'Reviewer');assert.equal(cliHero.thinking,false)
 for(const args of [{thinking:'off'},{character:'not-a-real-character',avatarStyle:'chibi'},{character:'吉尔伽美什'},{avatar:'wrong-id'},{avatar:'fate-saber-anime',character:'英雄王',avatarStyle:'chibi'},{character:'英雄王',avatarStyle:'chibi',profession:'Reviewer',role:'Conflicting description'}]){
  const title='Rejected '+JSON.stringify(args),before=(await cli('session','list')).sessions.length,r=await request(m,'card.create',{title,group:'A',engine:'codex',...args});assert.equal(r.ok,false);assert.equal((await cli('session','list')).sessions.length,before);assert.ok(!fs.existsSync(path.join(f.env.AGENTS_COMPANY_PROJECTS,'A',title)))
 }
 await f.ready(hero.id)
 const before=(await cli('session','list')).sessions.find(c=>c.id===hero.id)
 await f.call(m,'card','avatar',hero.id,'--character','远坂凛','--avatar-style','anime')
 const after=(await cli('session','list')).sessions.find(c=>c.id===hero.id);assert.equal(after.avatar,'fate-rin-anime');for(const key of ['title','engine','cwd','group','position','managementRole','createdBy','role'])assert.deepEqual(after[key],before[key])
 const info=await rpc(m,'session.info',{employee:hero.id});assert.equal(info.character,'远坂凛')
 await rpc(m,'session.open',{employee:hero.id});assert.equal((await rpc(m,'session.info',{employee:hero.id})).avatar,'fate-rin-anime')
 for(const [auth,cmd,args] of [[m,'card.avatar',{id:outside.id,avatar:'fate-saber-chibi'}],[m,'card.avatar',{id:governor.id,avatar:'codex'}],[m,'card.create',{title:'Forbidden Manager',group:'A',managementRole:'manager',engine:'codex'}],[m,'card.create',{title:'Wrong Team',group:'B',avatar:'codex'}],[g,'card.create',{title:'Forbidden Governor',group:'B',managementRole:'governor'}],[e,'card.avatar',{id:employee.id,avatar:'codex'}]])assert.equal((await request(auth,cmd,args)).ok,false)
 await rpc(g,'card.avatar',{id:outside.id,character:'韦伯',avatarStyle:'chibi'})
 const lead=await rpc(g,'card.create',{title:'Cross Team Manager',group:'B',managementRole:'manager',character:'Saber',avatarStyle:'anime',profession:'团队管理',engine:'codex',model:'gpt-6-luna',effort:'low'});await f.ready(lead.id);assert.equal(lead.avatar,'fate-saber-anime');assert.equal(lead.managementRole,'manager')
 const topology=await rpc(g,'management.topology');assert.equal(topology.nodes.find(c=>c.id===outside.id).avatar,'fate-waver-chibi')
 console.log('PASS '+created+' Manager/Governor creations covering every picker appearance; named/style CLI parameters, readback, explicit errors with no workspace side effects, scoped appearance repair and role boundaries; no model calls')
}finally{await f.close()}
