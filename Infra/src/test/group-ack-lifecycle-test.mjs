// One native queue: successful private reading releases work, errors/Stop do not.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-reading-lifecycle-')),entry=path.join(temp,'daemon.cjs'),out=path.join(root,'.aexus/artifacts/group-ack-lifecycle');fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
const within=async(promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' blocked on reading')),2500))])}finally{clearTimeout(timer)}}
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry);const checks=[],rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
 await f.cli('group','add','Studio');const employee=await f.create('Reading worker','Studio'),group=await rpc('chat.create',{name:'Reading lifecycle',members:[employee.id]})
 const file=suffix=>path.join(f.control,employee.id+suffix),read=suffix=>fs.existsSync(file(suffix))?JSON.parse(fs.readFileSync(file(suffix),'utf8')):null,hold=suffix=>fs.writeFileSync(file(suffix),''),release=suffix=>fs.rmSync(file(suffix),{force:true})
 const history=async()=>(await rpc('chat.history',{id:group.id,limit:100})).messages,delivery=async id=>(await history()).find(m=>m.id===id).deliveries[0],status=()=>f.status(employee.id),transcript=()=>rpc('session.transcript',{employee:employee.id})
 const waitAck=id=>f.until(()=>{const a=read('-ack.json');return a&&JSON.parse(a.text.split('\n')[1]).messageId===id&&a},'matching private reading')
 const wait=(id,expected='completed')=>f.until(async()=>{const d=await delivery(id);if(['failed','interrupted'].includes(d.status)&&d.status!==expected)throw Error(JSON.stringify(d));return d.status===expected&&d},expected)
 const send=text=>rpc('chat.send',{id:group.id,text,mentions:[employee.id],clientMessageId:'life-'+text})
 fs.writeFileSync(file('.ack-output.txt'),'{"text":"PRIVATE_READING_NOTE"}');hold('.hold-ack');hold('.hold-user')
 const first=await within(send('HELD_READING_THEN_WORK'),'chat.send'),ack=await waitAck(first.id),sid=(await status()).sessionId,taskId=(await status()).currentTask.messageId
 assert.equal((await delivery(first.id)).readAt,undefined);assert.equal(read('-work.json'),null);assert.deepEqual(ack.environments,[]);assert.equal(ack.readingTools,false)
 const rejected=await f.request(null,'session.steer',{id:sid,text:'DO_NOT_STEER_READING'});assert.equal(rejected.ok,false)
 const queued=await within(rpc('session.enqueue',{id:sid,text:'PRIVATE_AFTER_READING'}),'enqueue');assert.ok((await rpc('session.queue',{id:sid})).some(m=>m.id===queued.id))
 release('.hold-ack');await f.until(()=>read('-work.json')?.text.includes(first.text),'work after native completion');const work=read('-work.json'),d=await delivery(first.id)
 assert.ok(d.readAt&&d.readAt<=work.at);assert.equal(work.thread,ack.thread);assert.ok(work.environments.some(e=>e.cwd===employee.cwd));assert.equal((await status()).currentTask.messageId,taskId)
 assert.equal((await history()).length,1);assert.equal((await status()).lastReply,undefined);assert.ok(!(await transcript()).text.includes('PRIVATE_READING_NOTE'))
 release('.hold-user');await wait(first.id);await f.until(async()=>read('-work.json')?.text.endsWith('PRIVATE_AFTER_READING')&&!(await status()).busy,'queued private completion')
 const privateReply=(await status()).lastReply;assert.ok(privateReply&&!privateReply.readAt);assert.deepEqual(await rpc('session.queue',{id:sid}),[])
 checks.push('Held reading returns promptly, rejects Steer, permits queueing; native success precedes same-thread work and queued private reply')
 for(const note of ['null','{"text":null}','Any ordinary private note.','']){
  fs.writeFileSync(file('.ack-output.txt'),note);const n=(await history()).length,req=await send('NOTE_'+n);await wait(req.id);await f.until(async()=>!(await status()).busy,'note idle');assert.equal((await history()).length,n+1);assert.ok((await delivery(req.id)).readAt);assert.deepEqual((await status()).lastReply,privateReply)
 }
 checks.push('No special response format or publication call is required to complete reading; private unread is retained')
 const before=fs.readFileSync(file('-work.json'),'utf8');hold('.ack-fail');const failed=await send('NATIVE_READING_FAILED');assert.match((await wait(failed.id,'failed')).error,/fixture acknowledgment failure/i);assert.equal((await delivery(failed.id)).readAt,undefined);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),before);release('.ack-fail')
 hold('.hold-ack');const stopped=await within(send('STOP_READING'),'send');await waitAck(stopped.id);await rpc('session.enqueue',{id:sid,text:'CANCELLED_QUEUED_TASK'});await within(rpc('session.interrupt',{id:sid}),'Stop');await wait(stopped.id,'interrupted');release('.hold-ack');await f.until(async()=>!(await status()).busy,'stopped idle')
 assert.equal((await delivery(stopped.id)).readAt,undefined);assert.deepEqual(await rpc('session.queue',{id:sid}),[]);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),before)
 checks.push('Native failure and Stop do not record read or dispatch work; Stop cancels its pending queue')
 await rpc('session.send',{employee:employee.id,text:'PRIVATE_AFTER_STOP'});await f.received(employee.id,'PRIVATE_AFTER_STOP');await f.until(async()=>!(await status()).busy,'private recovery');assert.equal(read('-work.json').thread,ack.thread);assert.ok(read('-work.json').environments.some(e=>e.cwd===employee.cwd));assert.notEqual((await status()).lastReply.id,privateReply.id)
 hold('.hold-ack');const closing=await send('CLOSE_READING');await waitAck(closing.id);await rpc('session.close',{id:sid});await wait(closing.id,'interrupted');release('.hold-ack')
 await rpc('session.send',{employee:employee.id,text:'PRIVATE_AFTER_CLOSE'});await f.received(employee.id,'PRIVATE_AFTER_CLOSE');await f.until(async()=>!(await status()).busy,'reopened private');assert.equal(read('-work.json').thread,ack.thread)
 const users=(await transcript()).items.filter(i=>i.role==='user').map(i=>i.text);assert.ok(!users.includes('CANCELLED_QUEUED_TASK'));for(const text of ['PRIVATE_AFTER_READING','PRIVATE_AFTER_STOP','PRIVATE_AFTER_CLOSE'])assert.equal(users.filter(t=>t===text).length,1)
 assert.deepEqual(await rpc('terminal.list'),[]);checks.push('Later private work and close/reopen preserve original native identity, restored tools and exactly-once user history')
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,providerCalls:0},null,2));console.log('PASS '+checks.join('; '))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
