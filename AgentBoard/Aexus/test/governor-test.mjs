// Real authenticated CLI, fixture engines only. No production data or model requests.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),{cli,call,raw,request,create,token}=f
let checks=0
const denied=async(auth,cmd,args)=>{const reply=await request(auth,cmd,args);assert.equal(reply.ok,false,cmd+' should be rejected');assert.match(reply.error,/Forbidden|Only the user|Internal field|Use card.management-role/);checks++}
try{
 const folder=path.join(f.temp,'Any existing folder');fs.mkdirSync(folder)
 await cli('group','add','A','--directory-mode','bind','--root',folder)
 for(const team of ['B','Agents-Managers','Disposable'])await cli('group','add',team)
 const governor=await create('Governor','A','governor'),peer=await create('Peer','B','governor'),manager=await create('Manager','A','manager'),remoteManager=await create('OtherManager','B','manager'),employee=await create('Employee'),other=await create('Other','B'),named=await create('NamedFolder','Agents-Managers')
 const g=await token(governor.id),m=await token(manager.id),e=await token(employee.id)
 const roles=await call(e,'management','roles');assert.deepEqual(roles.map(x=>x.value),['employee','manager','governor','secretary']);assert.equal(roles[2].userManaged,false);assert.equal(roles[3].userManaged,true)
 assert.equal((await call(g,'auth','whoami')).managementRole,'governor');assert.ok(governor.cwd.startsWith(folder))
 await call(g,'group','add','CreatedByGovernor');await call(g,'group','remove','CreatedByGovernor')
 const cloudDenied=await raw(null,'card','create','--title','CloudGovernor','--group','B','--kind','cloud-native-worker','--management-role','governor');assert.equal(cloudDenied.ok,false);assert.match(cloudDenied.error,/Cloud Team|云主机|cloud/),assert.ok(!fs.existsSync(path.join(f.env.AGENTS_COMPANY_PROJECTS,'B','CloudGovernor')))
 fs.writeFileSync(path.join(named.cwd,'.agents-company-manager'),'not an authorization')
 assert.equal((await call(await token(named.id),'auth','whoami')).globalManager,false,'folder and Team names confer no rights')
 await cli('group','rename','A','Renamed');assert.equal((await call(g,'auth','whoami')).globalManager,true)
 await call(g,'room','bounds','B','--width','1400','--height','1000')
 for(const card of [governor,peer,remoteManager,other]){await call(g,'card','place',card.id,'--x','350','--y','230','--snap','off');checks++}
 const office=await call(g,'office','layout');assert.ok(office.rooms.every(room=>room.editable&&room.employees.every(card=>card.editable)))
 for(const card of [peer,remoteManager,other]){
   await call(g,'session','send','--employee',card.id,'--text','Please summarize the project status.')
   await f.until(async()=>!(await f.status(card.id)).busy,'reply')
   assert.match((await call(g,'session','transcript','--employee',card.id)).text,/VISIBLE_REPLY/);checks++
 }
 const hired=await call(g,'card','create','--title','NewManager','--group','Disposable','--management-role','manager','--model','gpt-6-luna','--effort','low');await f.ready(hired.id)
 await call(g,'card','management-role',other.id,'manager');await call(g,'card','management-role',other.id,'employee')
 await call(m,'session','send','--employee',employee.id,'--text','Same-Team management still works');await f.until(async()=>!(await f.status(employee.id)).busy,'employee')
 for(const target of [governor,peer,remoteManager,other])await denied(m,'session.send',{employee:target.id,text:'Not authorized'})
 await denied(e,'session.send',{employee:manager.id,text:'Not authorized'})
 const before=(await cli('session','list')).sessions.map(card=>card.id).sort()
 await denied(g,'card.create',{title:'ForbiddenGovernor',group:'B',managementRole:'governor'})
 await denied(g,'session.new',{title:'ForbiddenGovernor2',group:'B',managementRole:'governor'})
 await denied(g,'card.clone',{id:peer.id,title:'ForbiddenClone',managementRole:'governor'})
 await denied(g,'card.update',{id:employee.id,patch:{managementRole:'governor'}})
 for(const target of [governor,peer]){
   await denied(g,'card.remove',{id:target.id});await denied(g,'card.management-role',{id:target.id,role:'employee'});await denied(g,'card.management-role',{id:target.id,role:'manager'})
 }
 await denied(g,'card.management-role',{id:employee.id,role:'governor'})
 await denied(g,'group.remove',{name:'B'});await denied(g,'group.remove',{name:'Renamed'})
 await denied(g,'management.global',{id:employee.id,enabled:true});await denied(g,'auth.agent-token',{id:peer.id});await denied(g,'ui.click',{selector:'.delete-employee'})
 assert.deepEqual((await cli('session','list')).sessions.map(card=>card.id).sort(),before)
 assert.ok(!fs.existsSync(path.join(f.env.AGENTS_COMPANY_PROJECTS,'B','ForbiddenGovernor')))
 const topology=await call(g,'management','topology');assert.ok(topology.nodes.find(c=>c.id===peer.id).allowedActions.includes('message'));assert.ok(!topology.nodes.find(c=>c.id===peer.id).allowedActions.includes('delete'));assert.ok(topology.nodes.find(c=>c.id===employee.id).allowedActions.includes('role'))
 const fresh=await create('FreshGovernor','B');await cli('card','management-role',fresh.id,'governor')
 const clone=await call(g,'card','clone',fresh.id,'--title','OrdinaryClone');assert.equal(clone.managementRole,'employee');assert.equal((await call(await token(clone.id),'auth','whoami')).globalManager,false)
 await call(g,'card','remove',remoteManager.id)
 await call(g,'group','remove','Disposable');assert.ok(!(await cli('session','list')).sessions.some(card=>card.id===hired.id))
 await assert.rejects(()=>cli('management','team','--team','Agents-Managers'),/不再授予/)
 await denied(g,'card.create',{title:'CloudGovernor',group:'B',kind:'cloud-native-worker',managementRole:'governor'})
 await cli('card','management-role',peer.id,'manager');await call(g,'card','remove',peer.id)
 const job=await call(g,'schedule','create','--name','Delegated','--employee',other.id,'--prompt','Check later','--every-seconds','3600','--paused')
 await cli('card','management-role',governor.id,'manager')
 await denied(g,'session.send',{employee:other.id,text:'No stale global rights'})
 assert.equal((await cli('schedule','get',job.id)).disabledReason,'authorization_revoked')
 await cli('card','management-role',governor.id,'governor');await f.stop();await f.start()
 assert.equal((await call(g,'auth','whoami')).managementRole,'governor');assert.equal((await call(g,'auth','whoami')).managerTeam,null)
 const saved=JSON.parse(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')));assert.equal(saved.access.version,2);assert.equal(saved.access.managerTeam,undefined);assert.deepEqual(saved.access.globalManagerIds,[])
 console.log('PASS Governor role matrix,',checks,'checks: arbitrary Team/folder, all layout targets, cross-Team and peer conversations, lifecycle red lines, bulk delete, clone downgrade, no folder grants, revocation and restart')
}finally{await f.close()}
