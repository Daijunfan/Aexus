// Authenticated Core regression with protocol fixtures only; no model inference.
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore()
try{
 for(const team of ['A','B'])await f.cli('group','add',team)
 const manager=await f.create('Manager','A','manager'),worker=await f.create('User Created'),peer=await f.create('Other Manager','A','manager'),outside=await f.create('Outside','B'),token=await f.token(manager.id),other=await f.token(peer.id),employee=await f.token(worker.id)
 assert.equal((await f.cli('management','topology')).edges.length,0)
 assert.equal((await f.request(token,'card.create',{title:'Forged',group:'A',createdBy:{kind:'operator'}})).ok,false)
 await assert.rejects(()=>f.call(employee,'session','send','--employee',manager.id,'--text','No escalation'))
 assert.ok(Array.isArray(await f.call(token,'host','list')));await assert.rejects(()=>f.call(token,'host','credentials','unbound-host'));await assert.rejects(()=>f.call(token,'management','global',manager.id,'on'))
 for(const target of [peer,outside])await assert.rejects(()=>f.call(token,'session','send','--employee',target.id,'--text','Denied'))
 await f.call(token,'session','send','--employee',worker.id,'--text','Hello without a line');await f.until(async()=>!(await f.status(worker.id)).busy,'answer')
 assert.match((await f.call(other,'session','transcript','--employee',worker.id)).text,/VISIBLE_REPLY/)
 for(const command of ['/permissions bypassPermissions','/fork escape'])await assert.rejects(()=>f.call(token,'session','send','--employee',worker.id,'--text',command))
 assert.ok(!(await f.call(token,'api','list')).some(command=>['management.request','management.decide','config.permission'].includes(command.name)))
 const child=await f.call(token,'card','create','--title','Manager Created','--group','A','--model','gpt-6-luna');await f.ready(child.id)
 assert.deepEqual(child.createdBy,{kind:'agent',employeeId:manager.id})
 const line=(await f.cli('management','topology')).edges.find(edge=>edge.employeeId===child.id);assert.equal(line.managerId,manager.id)
 await assert.rejects(()=>f.cli('management','request','--manager',peer.id,'--employee',worker.id),/创建来源/)
 await f.call(other,'card','remove',child.id);assert.ok(fs.existsSync(child.cwd))
 const schedule=await f.call(token,'schedule','create','--name','Delegated','--employee',worker.id,'--prompt','Later','--every-seconds','3600','--paused')
 const hold=path.join(f.control,worker.id+'.hold-user');fs.writeFileSync(hold,'')
 await f.call(token,'session','send','--employee',worker.id,'--text','Held turn')
 await f.call(token,'session','enqueue','--employee',worker.id,'--text','Must be cancelled')
 await f.cli('session','enqueue','--employee',worker.id,'--text','User survives')
 const follow=spawn(process.execPath,[f.root+'/bin/agents','session','follow','--employee',worker.id,'--raw','--json'],{env:{...f.env,AGENTS_COMPANY_TOKEN:token},stdio:['ignore','pipe','pipe']});let events='';follow.stdout.on('data',part=>events+=part);const closed=new Promise(resolve=>follow.once('exit',resolve));await f.until(()=>events.includes('snapshot'),'subscription')
 await f.cli('card','management-role',manager.id,'employee');await closed;fs.unlinkSync(hold)
 await f.until(async()=>!(await f.status(worker.id)).busy,'revoked turn')
 await assert.rejects(()=>f.call(token,'session','transcript','--employee',worker.id))
 assert.equal((await f.cli('schedule','get',schedule.id)).disabledReason,'authorization_revoked')
 await f.until(async()=>(await f.cli('session','transcript',worker.id)).text.includes('User survives'),'user queue')
 assert.ok(!(await f.cli('session','transcript',worker.id)).text.includes('Must be cancelled'));assert.ok(!events.includes('store:changed'))
 await f.call(other,'card','remove',worker.id);assert.ok(fs.existsSync(worker.cwd))
 await f.cli('auth','revoke',peer.id);await assert.rejects(()=>f.call(other,'auth','whoami'))
 console.log('PASS no-line same-Team control and deletion across creators, creator provenance, peer/foreign/slash/forged-identity denial, queue/schedule/subscription revocation and preserved user tasks')
}finally{await f.close()}
