// Same HTTP request IDs must reach current Core receipt/authority checks. Temp fixtures only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-private-send-http-'))),out=path.join(root,'artifacts/private-send-recovery'),checks=[]
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
try{
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));const url='http://127.0.0.1:'+port,entry=path.join(temp,'daemon.cjs')
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_HOST:'127.0.0.1',AGENTS_COMPANY_WEB_PORT:String(port)},entry)
 await f.until(()=>fetch(url+'/api/health').then(response=>response.ok).catch(()=>false),'real HTTP listener')
 const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'content-type':'application/json'},body:JSON.stringify({token:fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()})}),logged=await login.json();assert.ok(logged.ok);const operator={cookie:login.headers.get('set-cookie').split(';')[0],csrf:logged.data.csrf,client:randomUUID()}
 const request=async(identity,cmd,args={},id=randomUUID())=>{const response=await fetch(url+'/api/rpc',{method:'POST',headers:{Origin:url,'content-type':'application/json','x-request-id':id,...(typeof identity==='string'?{authorization:'Bearer '+identity}:{Cookie:identity.cookie,'x-agents-csrf':identity.csrf,'x-agents-client':identity.client})},body:JSON.stringify({cmd,args})});return {status:response.status,body:await response.json()}}
 const call=async(cmd,args={},id,identity=operator)=>{const result=await request(identity,cmd,args,id);assert.equal(result.status,200,result.body.error);assert.ok(result.body.ok,result.body.error);return result.body.data},users=async id=>(await f.cli('session','transcript','--employee',id)).items.filter(item=>item.role==='user'),count=async(id,text)=>(await users(id)).filter(item=>item.text===text).length,hold=id=>fs.writeFileSync(path.join(f.control,id+'.hold-user'),''),release=id=>fs.rmSync(path.join(f.control,id+'.hold-user'),{force:true}),idle=id=>f.until(async()=>!(await f.status(id)).busy,'native idle')
 await call('group.add',{name:'HTTP recovery'});const worker=await f.create('HTTP target','HTTP recovery'),manager=await f.create('HTTP manager','HTTP recovery','manager'),managerToken=await f.token(manager.id)

 const createId=randomUUID(),created=await call('channel.create',{name:'Ordinary cached mutation'},createId),replayed=await call('channel.create',{name:'Ordinary cached mutation'},createId);assert.equal(created.id,replayed.id);assert.equal((await call('channel.list')).length,1);assert.equal((await request(operator,'channel.create',{name:'Different operation payload'},createId)).status,409)
 checks.push('A no-key non-idempotent channel.create still replays the same HTTP mutation result and rejects changed payload under that transport ID')

 hold(worker.id);await call('session.send',{employee:worker.id,text:'HTTP_QUEUE_BLOCKER'});const queuedArgs={employee:worker.id,text:'HTTP_CANCELLED_QUEUE',clientMessageId:'http-queue'},queueHttpId=randomUUID(),queued=await call('session.enqueue',queuedArgs,queueHttpId);assert.equal(queued.status,'queued');await call('session.dequeue',{id:(await f.status(worker.id)).sessionId,messageId:queued.queueId})
 const cancelled=await request(operator,'session.enqueue',queuedArgs,queueHttpId);assert.equal(cancelled.body.ok,false);assert.equal(cancelled.body.code,'PRIVATE_SEND_INTERRUPTED');assert.equal(await count(worker.id,queuedArgs.text),0);assert.deepEqual(await call('session.queue',{id:(await f.status(worker.id)).sessionId}),[])
 checks.push('Reusing the identical HTTP request ID after real dequeue reaches Core again and returns PRIVATE_SEND_INTERRUPTED instead of a cached queued success')

 const source=await call('channel.source-add',{plugin:'x',locator:'http_forward'}),post=await call('channel.publish',{sourceId:source.id,externalId:'source',publishedAt:Date.now(),title:'Forward fixture',body:'This harmless source is copied through the real Core route.'}),forwardArgs={messages:[{conversation:'channel:'+post.channelId,id:post.id}],to:'employee:'+worker.id,clientMessageId:'http-forward'},forwardHttpId=randomUUID(),forwarded=await call('messenger.forward',forwardArgs,forwardHttpId)
 assert.equal(forwarded.status,'queued');const pending=await call('session.queue',{id:(await f.status(worker.id)).sessionId});assert.equal(pending.length,1);await call('session.dequeue',{id:(await f.status(worker.id)).sessionId,messageId:pending[0].id})
 const cancelledForward=await request(operator,'messenger.forward',forwardArgs,forwardHttpId);assert.equal(cancelledForward.body.ok,false);assert.match(cancelledForward.body.error,/interrupted/i);assert.equal((await call('messenger.forward-status',{clientMessageId:forwardArgs.clientMessageId})).status,'interrupted');assert.deepEqual(await call('session.queue',{id:(await f.status(worker.id)).sessionId}),[])
 release(worker.id);await idle(worker.id);assert.equal((await users(worker.id)).filter(item=>item.text.includes('This harmless source is copied')).length,0)
 checks.push('The same HTTP forwarding request ID rechecks the downstream private receipt after cancellation and cannot replay stale sent/queued success')

 const managedArgs={employee:worker.id,text:'HTTP_AUTHORITY_RECHECK',clientMessageId:'http-manager'},managerHttpId=randomUUID(),managed=await call('session.send',managedArgs,managerHttpId,managerToken);assert.equal(managed.status,'accepted');await idle(worker.id);await call('card.management-role',{id:manager.id,role:'employee'})
 const revoked=await request(managerToken,'session.send',managedArgs,managerHttpId);assert.equal(revoked.body.ok,false);assert.match(revoked.body.error,/Forbidden|not authorized/i);assert.equal(await count(worker.id,managedArgs.text),1)
 checks.push('An authenticated Manager retry with the identical HTTP request ID is denied after operator role revocation, without another native turn or cached authority bypass')

 hold(worker.id);const concurrentArgs={employee:worker.id,text:'HTTP_CONCURRENT_EXACTLY_ONE',clientMessageId:'http-concurrent'},concurrentId=randomUUID(),responses=await Promise.all(Array.from({length:5},()=>request(operator,'session.send',concurrentArgs,concurrentId)));assert.ok(responses.every(result=>result.status===200&&result.body.ok));assert.equal(new Set(responses.map(result=>result.body.data.messageId)).size,1);assert.ok(responses.every(result=>result.body.data.status==='accepted'));await f.until(async()=>await count(worker.id,concurrentArgs.text)===1,'one native user item');assert.deepEqual(await call('session.queue',{id:(await f.status(worker.id)).sessionId}),[]);release(worker.id);await idle(worker.id);assert.equal(await count(worker.id,concurrentArgs.text),1)
 const changed=await request(operator,'session.send',{...concurrentArgs,text:'Different private payload'},concurrentId);assert.equal(changed.body.ok,false);assert.match(changed.body.error,/different private message content/);assert.equal(await count(worker.id,'Different private payload'),0)
 checks.push('Five same-ID concurrent HTTP keyed sends coalesce in Core to one native user task; reusing the key for changed content rejects before work')
 assert.deepEqual(await call('terminal.list'),[]);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'http-verification.json'),JSON.stringify({passed:true,checks,providerCalls:0,scope:'Real authenticated HTTP listener and temporary source-built Core, deterministic native protocol; no transport mocks'},null,2));console.log('PASS '+checks.join('; '))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
