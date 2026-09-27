import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
import platform from '../bin/platform.cjs'

const test=await fixtureCore(),{cli,call,raw,token,create,ready,status,until,control,env}=test
let follower
try{
 await cli('group','add','A');await cli('group','add','B')
 const manager=await create('Manager','A','manager'),user=await create('User-created'),outside=await create('Outside','B'),auth=await token(manager.id)
 const child=await call(auth,'card','create','--title','Created','--group','A','--engine','codex','--model','gpt-6-luna','--effort','low');await ready(child.id)
 const activity=async()=>(await cli('management','activity')).interactions
 assert.deepEqual((await cli('management','topology')).edges.map(e=>e.employeeId),[child.id])
 assert.equal((await activity())[0].employeeId,child.id,'create lights the real child')
 await call(auth,'session','transcript','--employee',child.id)
 let current=(await activity())[0];assert.equal(current.managerId,manager.id);assert.equal(current.employeeId,child.id);assert.equal(current.command,'session.transcript');assert.ok(current.expiresAt>current.startedAt)
 await cli('session','info','--employee',outside.id);assert.equal((await activity())[0].employeeId,child.id,'operator queries never replace Agent activity')
 await call(auth,'session','info','--employee',user.id);assert.ok((await activity()).some(i=>i.employeeId===user.id),'Manager may interact without a creation line')
 assert.equal((await call(auth,'management','activity','--team','A')).interactions.length,2,'reading activity preserves both targets')
 assert.equal((await raw(auth,'management','activity','--team','B')).ok,false)
 await call(auth,'office','layout');assert.equal((await activity()).length,2,'unrelated Manager call cannot erase delivery activity')
 assert.equal((await raw(auth,'session','info','--employee',outside.id)).ok,false);assert.ok(!(await activity()).some(i=>i.employeeId===outside.id),'denied calls do not light an edge')
 await call(auth,'card','place',user.id,'--x','450','--y','210','--snap','off');assert.ok((await activity()).some(i=>i.employeeId===user.id))
 const geometry=await call(auth,'office','layout','--team','A');assert.ok(geometry.rooms[0].connections.every(edge=>edge.points.every((p,i)=>!i||p.x===edge.points[i-1].x||p.y===edge.points[i-1].y)))
 await call(auth,'session','info','--employee',child.id);await until(async()=>!(await activity()).length,'short activity expires')
 fs.writeFileSync(path.join(control,user.id+'.hold-user'),'')
 await call(auth,'session','send','--employee',user.id,'--text','Tell me when the review is ready.')
 await until(async()=>(await status(user.id)).busy,'employee running')
 follower=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME))
 await new Promise((resolve,reject)=>{follower.once('error',reject);follower.once('connect',()=>follower.write(JSON.stringify({cmd:'session.follow',args:{employee:user.id},auth})+'\n'));follower.once('data',data=>{assert.ok(JSON.parse(data.toString().split('\n')[0]).ok);resolve()})})
 current=(await activity())[0];assert.equal(current.command,'session.follow');assert.equal(current.expiresAt,undefined)
 await new Promise(resolve=>setTimeout(resolve,1750));assert.equal((await activity())[0].command,'session.follow','live subscription remains active')
 await call(auth,'session','transcript','--employee',child.id);follower.destroy();follower=undefined
 assert.ok((await activity()).some(i=>i.employeeId===child.id),'closing a subscription cannot clear another recipient')
 const schedule=await call(auth,'schedule','create','--name','Later','--employee',user.id,'--prompt','Read the notes','--at',new Date(Date.now()+3600000).toISOString())
 assert.equal((await activity()).find(i=>i.employeeId===user.id).command,'schedule.create')
 await call(auth,'schedule','get',schedule.id);assert.ok((await activity()).some(i=>i.employeeId===user.id))
 const managerSession=await cli('session','open',manager.id)
 fs.writeFileSync(path.join(control,manager.id+'.hold-user'),'')
 await cli('session','send','--employee',manager.id,'--text','Fixture turn that delegates a task')
 await until(async()=>(await status(manager.id)).busy,'manager running')
 await call(auth,'session','send','--employee',child.id,'--text','Reply OK')
 fs.unlinkSync(path.join(control,manager.id+'.hold-user'))
 await until(async()=>!(await status(manager.id)).busy,'manager completes')
 assert.ok((await activity()).some(i=>i.employeeId===child.id&&i.expiresAt>Date.now()),'completing a Manager turn cannot erase its fresh notification')
 await cli('session','close',managerSession.sessionId);assert.equal((await activity()).length,0,'closing the Manager clears its interaction')
 await call(auth,'session','info','--employee',child.id)
 await cli('auth','revoke',manager.id);assert.equal((await activity()).length,0)
 await cli('session','interrupt','--employee',user.id)
 await test.stop();await test.start();assert.equal((await activity()).length,0,'restart does not replay activity')
 console.log('PASS real headless CLI: creator provenance, all same-Team target control, positions, read/send/follow/schedule activity, replacement, expiry, denial, revocation and restart')
}finally{follower?.destroy();await test.close()}
