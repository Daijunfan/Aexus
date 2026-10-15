import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
import platform from '../bin/platform.cjs'

const test=await fixtureCore(),{cli,call,token,create,ready,status,until,control,env}=test,followers=[]
try{
 await cli('group','add','A');await cli('group','add','B')
 const manager=await create('Manager','A','manager'),auth=await token(manager.id),workers=[await create('User-created'),await create('Another')],outside=await create('Outside','B')
 const child=await call(auth,'card','create','--title','Created','--group','A','--engine','codex','--model','gpt-6-luna','--effort','low');await ready(child.id);workers.push(child)
 const rpc=async(auth,cmd,args={})=>{const result=await test.request(auth,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const activity=async()=>(await rpc(null,'management.activity')).interactions
 const hold=worker=>fs.writeFileSync(path.join(control,worker.id+'.hold-user'),'')
 assert.equal((await cli('management','topology')).edges.length,1)
 assert.deepEqual(await activity(),[],'creation is not collaboration')
 for(const worker of workers)for(const cmd of ['session.info','session.transcript','session.status']){await rpc(auth,cmd,{employee:worker.id});assert.deepEqual(await activity(),[],'read-only queries never invent collaboration')}
 assert.equal((await test.request(auth,'session.send',{employee:outside.id,text:'Forbidden'})).ok,false)
 assert.deepEqual(await activity(),[],'authorization failures never light an edge')
 for(const worker of workers){
  hold(worker);const sent=await rpc(auth,'session.send',{employee:worker.id,text:'Wait for fixture release'})
  await until(async()=>(await status(worker.id)).busy,'real fixture execution')
  const task=(await activity()).find(i=>i.employeeId===worker.id)
  assert.equal(task.kind,'task');assert.equal(task.messageId,sent.messageId);assert.equal(task.messageId,(await status(worker.id)).currentTask.messageId);assert.equal(task.expiresAt,undefined);assert.equal(task.highlighted,true)
 }
 assert.equal((await activity()).length,3,'three real parallel delegated tasks remain visible without open API requests')
 await new Promise(resolve=>setTimeout(resolve,750))
 assert.ok((await activity()).every(task=>task.highlighted===false),'long tasks stop highlighting after 600ms')
 for(const worker of workers)assert.equal((await status(worker.id)).busy,true,'display timeout must not stop execution')
 const follow=async employee=>{
  const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));followers.push(socket)
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('connect',()=>socket.write(JSON.stringify({cmd:'session.follow',args:{employee},auth})+'\n'));socket.once('data',chunk=>{assert.ok(JSON.parse(chunk.toString().split('\n')[0]).ok);resolve()})})
  return socket
 }
 const streams=await Promise.all(workers.map(worker=>follow(worker.id))),duplicate=await follow(workers[0].id)
 assert.equal((await activity()).length,3,'task and same-pair streams share one line')
 assert.ok((await activity()).every(task=>task.highlighted),'new subscriptions relight existing task pairs')
 await new Promise(resolve=>setTimeout(resolve,750))
 assert.ok((await activity()).every(task=>!task.highlighted),'held reply subscriptions cannot prolong green lines')
 await rpc(auth,'session.info',{employee:workers[0].id})
 assert.ok((await activity()).every(task=>!task.highlighted),'read-only queries do not relight expired cues')
 const another=await follow(workers[0].id)
 assert.equal((await activity()).filter(task=>task.highlighted).length,1,'only the newly communicating pair relights')
 another.destroy()
 duplicate.destroy();streams.forEach(socket=>socket.destroy());await rpc(auth,'session.info',{employee:workers[1].id})
 for(let i=0;i<12;i++){const disconnected=await follow(workers[i%workers.length].id);disconnected.destroy();await rpc(auth,'session.enqueue',{employee:workers[i%workers.length].id,text:'Queued during subscriber disconnect'})}
 assert.equal((await rpc(null,'status')).running,true,'disconnecting progress subscribers cannot crash the Core during broadcasts')
 assert.equal((await activity()).length,3,'closing a reply subscription cannot hide actual delegated work')
 fs.rmSync(path.join(control,workers[0].id+'.hold-user'))
 await until(async()=>(await activity()).length===2,'completion clears only its task immediately')
 await rpc(null,'session.interrupt',{employee:workers[1].id});await until(async()=>(await activity()).length===1,'interruption clears its task')
 await cli('session','close',(await status(workers[2].id)).sessionId);await until(async()=>!(await activity()).length,'closing a worker clears its task')
 hold(workers[0]);await rpc(null,'session.send',{employee:workers[0].id,text:'Independent operator task'})
 await until(async()=>(await status(workers[0].id)).busy,'operator task is genuinely running');assert.deepEqual(await activity(),[],'busy alone and creation provenance cannot invent a manager')
 const observed=await follow(workers[0].id);assert.equal((await activity())[0].kind,'request');observed.destroy();await until(async()=>!(await activity()).length,'request-only observation ends with the actual subscription')
 await rpc(null,'session.interrupt',{employee:workers[0].id})
 const governor=await create('Governor','B','governor'),governorAuth=await token(governor.id)
 hold(manager);await rpc(governorAuth,'session.send',{employee:manager.id,text:'Delegated Manager task'})
 await rpc(auth,'session.send',{employee:workers[0].id,text:'Delegated child task'})
 await until(async()=>(await activity()).length===2,'Governor and Manager hierarchy both show real tasks')
 assert.equal((await test.request(auth,'management.activity',{team:'B'})).ok,false)
 await cli('auth','revoke',governor.id);await until(async()=>(await activity()).length===1,'revoked Governor delegation clears without cancelling independent Manager work')
 await cli('auth','revoke',manager.id);await until(async()=>!(await activity()).length,'revocation clears delegated tasks immediately')
 await test.stop();await test.start();assert.equal((await activity()).length,0,'restart does not replay completed tasks')
 console.log('PASS real Core IPC: genuine parallel task lifetimes, exact message IDs, request/task dedup, completion/interruption/close/revoke, independent operator work, Governor hierarchy and restart; fixture only')
}finally{followers.forEach(socket=>socket.destroy());await test.close()}
