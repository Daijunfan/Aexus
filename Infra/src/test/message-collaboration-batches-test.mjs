// Exact 50/100 thresholds, durable counters, busy-peer fairness and credential/role revocation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-post-batches-'))),entry=path.join(temp,'core.cjs'),out=path.join(root,'.aexus/artifacts/message-collaboration')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
const f=await fixtureCore({},process.env.AGENTS_COMPANY_TEST_CORE_ENTRY??entry),checks=[],report={passed:false,checks,paidModelCalls:0,productionDataUsed:false}
const rpc=async(cmd,args={},auth=null)=>{const r=await f.request(auth,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data}
const deny=async(cmd,args,auth)=>{const r=await f.request(auth,cmd,args);assert.equal(r.ok,false,cmd+' should reject')}
const pass=text=>{checks.push(text);console.log('PASS '+text)}
try{
 await rpc('group.add',{name:'Batches'});const a=await f.create('Editor','Batches'),b=await f.create('Reader','Batches'),at=await f.token(a.id),bt=await f.token(b.id)
 const source=await rpc('channel.source-add',{plugin:'telegram',locator:'batch-exact-fixture',name:'Exact batch channel'}),id=source.channelId,conversation='channel:'+id
 let p=await rpc('conversation.policy',{conversation});await rpc('conversation.role',{conversation,employee:a.id,role:'owner',expectedRevision:p.revision});p=await rpc('conversation.policy',{conversation});await rpc('conversation.member',{conversation,employee:b.id,action:'add',expectedRevision:p.revision},at)
 const set=async(employee,everyPosts,prompt,enabled=true)=>{const rules=await rpc('channel.post-trigger-list',{id});return rpc('channel.post-trigger-set',{id,employee,everyPosts,prompt,enabled,expectedRevision:rules.rules.find(r=>r.employeeId===employee)?.revision??0},at)}
 await set(a.id,100,'OWNER_100: read the exact batch.');await set(b.id,50,'READER_50: read this exact batch.')
 await deny('session.send',{employee:a.id,text:'Member may not send upward Company work'},bt);await deny('session.send',{employee:b.id,text:'Conversation Owner has no Company peer authority'},at)
 await deny('channel.post-trigger-set',{id,employee:b.id,everyPosts:50,prompt:'Inject Plan action',enabled:true,expectedRevision:1,action:{type:'agent',employeeId:b.id,prompt:'no'}},at)
 const inputs=Array.from({length:100},(_,i)=>({sourceId:source.id,externalId:'count-'+(i+1),publishedAt:Date.now()-i*1000,title:'Source '+(i+1),body:'The body for source '+(i+1)})),ids=[]
 for(const value of inputs.slice(0,49))ids.push((await rpc('channel.publish',value)).id)
 assert.ok((await rpc('channel.post-trigger-list',{id})).rules.every(r=>r.pendingCount===49));assert.equal((await rpc('channel.post-trigger-history',{id})).total,0);assert.ok((await rpc('session.list',{live:true})).every(s=>!s.busy));for(const employee of [a,b]){assert.equal(fs.existsSync(path.join(f.control,employee.id+'-work.json')),false);assert.equal(fs.existsSync(path.join(f.control,employee.id+'-ack.json')),false);assert.deepEqual((await rpc('session.transcript',{employee:employee.id})).items,[])}
 await f.stop();await f.start();assert.ok((await rpc('channel.post-trigger-list',{id})).rules.every(r=>r.pendingCount===49));assert.equal((await rpc('channel.post-trigger-history',{id})).total,0)
 pass('Counters stop at 49 and survive restart without invoking an employee; a channel office does not grant ordinary Company peer/upward execution.')
 fs.writeFileSync(path.join(f.control,b.id+'.hold-user'),'')
 ids.push((await rpc('channel.publish',inputs[49])).id)
 const history=employee=>rpc('channel.post-trigger-history',{id,employee})
 await f.until(async()=>(await history(b.id)).rows[0]?.state==='running','Reader exact-50 work starts')
 for(const value of inputs.slice(50))ids.push((await rpc('channel.publish',value)).id)
 await f.until(async()=>(await history(a.id)).rows[0]?.state==='completed','independent Editor-100 work completes while Reader is busy')
 const ah=await history(a.id),bh=await history(b.id);assert.equal(ah.total,1);assert.equal(bh.total,2);assert.equal(bh.rows[0].state,'pending');assert.equal(bh.rows[1].state,'running')
 const a1=await rpc('channel.post-trigger-batch',{id,batchId:ah.rows[0].id,limit:50},at),a2=await rpc('channel.post-trigger-batch',{id,batchId:ah.rows[0].id,offset:50,limit:50},at)
 assert.deepEqual([...a1.posts,...a2.posts].map(x=>x.id),ids);assert.ok(a1.hasMore);assert.equal(a2.hasMore,false)
 const b1=await rpc('channel.post-trigger-batch',{id,batchId:bh.rows[1].id,limit:100},bt),b2=await rpc('channel.post-trigger-batch',{id,batchId:bh.rows[0].id,limit:100},bt)
 assert.deepEqual(b1.posts.map(x=>x.id),ids.slice(0,50));assert.deepEqual(b2.posts.map(x=>x.id),ids.slice(50));assert.equal(new Set([...b1.posts,...b2.posts].map(x=>x.id)).size,100)
 await deny('channel.post-trigger-batch',{id,batchId:ah.rows[0].id},bt)
 assert.equal((await rpc('channel.publish',inputs[0])).status,'duplicate');assert.equal((await rpc('channel.publish',{...inputs[0],body:'Updated, not newly accepted'})).status,'updated');assert.ok((await rpc('channel.post-trigger-list',{id})).rules.every(r=>r.pendingCount===0));assert.deepEqual(await rpc('schedule.list'),[]);assert.deepEqual(await rpc('schedule.history'),[])
 pass('Real 50/100 independent thresholds produce exact disjoint/inclusive source batches, retain insertion rather than timestamp order, and do not block a free employee behind a busy one; duplicates/edits never count.')
 await set(b.id,50,'Paused Reader prompt',false);fs.rmSync(path.join(f.control,b.id+'.hold-user'),{force:true});await f.until(async()=>!(await f.status(b.id)).busy,'paused work settles');assert.equal((await history(b.id)).rows[0].state,'cancelled')
 const notice=await rpc('conversation.notice-create',{conversation,clientRequestId:'static-is-not-an-article',spec:{name:'Static text',text:'A fixed announcement.',publisherId:a.id,rule:{kind:'once',at:new Date(Date.now()+2000).toISOString()},enabled:true}},at)
 await f.until(async()=>(await rpc('conversation.notice-history',{conversation,id:notice.id},at)).rows.some(r=>r.status==='published'),'static notice published');assert.equal((await rpc('channel.post-trigger-list',{id})).rules.find(r=>r.employeeId===a.id).pendingCount,0)
 await set(b.id,50,'New grant before credential revocation');await rpc('auth.revoke',{id:a.id});await f.until(async()=>(await rpc('channel.post-trigger-list',{id})).rules.every(r=>!r.enabled),'creator credential revocation disables future count rules')
 p=await rpc('conversation.policy',{conversation});await rpc('conversation.member',{conversation,employee:b.id,action:'remove',expectedRevision:p.revision});const removedRule=(await rpc('channel.post-trigger-list',{id})).rules.find(r=>r.employeeId===b.id);await rpc('channel.post-trigger-remove',{id,employee:b.id,expectedRevision:removedRule.revision});assert.ok(!(await rpc('channel.post-trigger-list',{id})).rules.some(r=>r.employeeId===b.id))
 await f.until(async()=>(await rpc('session.status')).every(s=>!s.busy),'idle before final restart');const count=(await rpc('channel.post-trigger-history',{id})).total;await f.stop();await f.start();assert.equal((await rpc('channel.post-trigger-history',{id})).total,count);assert.deepEqual(await rpc('schedule.list'),[])
 pass('Pause cancels unstarted batches; timed notices stay outside article counts; creator token revocation, removed-member cleanup and restart do not replay work or create Plan records.')
 report.passed=true
}catch(error){report.error=error.stack;throw error}finally{await f.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'batches-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true})}
