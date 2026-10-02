// One Core/native queue for work and awareness; deterministic protocol only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-group-awareness-')),entry=path.join(temp,'daemon.cjs'),codex=path.join(temp,'codex.cjs'),out=path.join(root,'artifacts/group-awareness-runtime')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 const original=fs.readFileSync(path.join(root,'test/fixtures/initialization-codex.cjs'),'utf8')
 const fixture=original.replace(/^const note=.*$/m,"const note=(suffix,value)=>{fs.writeFileSync(path.join(control,employee+'-'+suffix+'.json'),JSON.stringify(value));if(suffix==='ack'||suffix==='work')fs.appendFileSync(path.join(control,employee+'-phases.jsonl'),JSON.stringify({phase:suffix,...value})+'\\n')}")
 assert.notEqual(fixture,original);fs.writeFileSync(codex,fixture,{mode:0o755})
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({CODEX_BIN:codex,AC_CHAT_ACK_MANUAL:'1'},entry)
 const rpc=async(cmd,args={},auth=null)=>{const result=await f.request(auth,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await f.cli('group','add','Awareness studio')
 const a=await f.create('Primary','Awareness studio'),b=await f.create('Observer','Awareness studio'),c=await f.create('Peer','Awareness studio'),people=[a,b,c]
 const group=await rpc('chat.create',{name:'Shared awareness',members:people.map(p=>p.id)}),tokens=new Map(await Promise.all(people.map(async p=>[p.id,await f.token(p.id)])))
 const file=(p,suffix)=>path.join(f.control,p.id+suffix),answer=(p,text)=>{fs.writeFileSync(file(p,'.ack-tool.json'),JSON.stringify({text}));fs.rmSync(file(p,'.ack-output.txt'),{force:true})},hold=p=>fs.writeFileSync(file(p,'.hold-ack'),''),release=p=>fs.rmSync(file(p,'.hold-ack'),{force:true})
 const phases=p=>fs.existsSync(file(p,'-phases.jsonl'))?fs.readFileSync(file(p,'-phases.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
 const work=p=>phases(p).filter(value=>value.phase==='work'),status=p=>f.status(p.id),transcript=p=>rpc('session.transcript',{employee:p.id}),history=()=>rpc('chat.history',{id:group.id,limit:100}),message=async id=>(await history()).messages.find(value=>value.id===id)
 const delivery=async(id,p)=>(await message(id)).deliveries.find(value=>value.employeeId===p.id)
 const waitDone=id=>f.until(async()=>{const item=await message(id);const failed=item.deliveries.find(value=>value.status==='failed'||value.status==='interrupted');if(failed)throw Error(JSON.stringify(failed));return item.deliveries.length&&item.deliveries.every(value=>value.status==='completed')&&item},'all group deliveries complete')
 const waitIdle=()=>f.until(async()=>(await Promise.all(people.map(status))).every(value=>!value.busy),'all native ACK queues idle')
 const post=(p,text,key,replyTo)=>rpc('chat.post',{id:group.id,text,kind:'summary',clientMessageId:key,...(replyTo?{replyTo}:{})},tokens.get(p.id))
 const baseline=new Map()
 for(const p of people){
  await rpc('session.send',{employee:p.id,text:'Private baseline '+p.title});await f.until(async()=>!(await status(p)).busy,'baseline reply')
  baseline.set(p.id,{items:(await transcript(p)).items,lastReply:(await status(p)).lastReply,thread:work(p).at(-1).thread,works:work(p).length})
  answer(p,null)
 }
 const unchanged=async p=>{const previous=baseline.get(p.id);assert.deepEqual((await transcript(p)).items,previous.items);assert.deepEqual((await status(p)).lastReply,previous.lastReply);assert.equal(work(p).length,previous.works)}
 hold(b)
 const targeted=await rpc('chat.send',{id:group.id,text:'A primary task with shared context',mentions:[a.id],clientMessageId:'targeted'})
 assert.deepEqual(targeted.deliveries.map(d=>[d.employeeId,d.mode]).sort(),[[a.id,'work'],[b.id,'awareness'],[c.id,'awareness']].sort())
 await f.until(async()=>{const info=await status(b);return info.acknowledging&&info.currentTask?.chat?.messageId===targeted.id},'held awareness turn')
 assert.deepEqual((await status(b)).currentTask.delegation.groupNotice,{groupId:group.id,messageId:targeted.id,employeeId:b.id})
 await f.until(async()=>(await delivery(targeted.id,b)).deliveredAt,'actual native awareness delivery')
 assert.equal((await delivery(targeted.id,b)).readAt,undefined);await unchanged(b)
 release(b);await waitDone(targeted.id);await waitIdle()
 await unchanged(b);await unchanged(c);assert.equal(work(a).length,baseline.get(a.id).works+1)
 assert.equal((await status(b)).currentTask,undefined);assert.equal((await status(c)).currentTask,undefined)
 for(const p of [b,c]){const ack=phases(p).find(value=>value.phase==='ack'&&value.text.includes(targeted.id));assert.equal(ack.thread,baseline.get(p.id).thread);assert.deepEqual(ack.environments,[])}
 assert.equal((await history()).messages.length,1,'silent ACKs add no public messages')
 console.log('PASS one primary work delivery and real all-member awareness, without private history/old reply pollution')

 const report=await post(a,'A real employee outcome for shared context.','employee-outcome')
 await waitDone(report.id);await waitIdle();assert.ok(report.deliveries.every(value=>value.mode==='awareness'&&value.employeeId!==a.id))
 await unchanged(b);await unchanged(c)
 const reply=await rpc('chat.send',{id:group.id,text:'Please expand your outcome.',replyTo:report.id,clientMessageId:'reply-to-author'})
 await waitDone(reply.id);await waitIdle()
 assert.equal((await delivery(reply.id,a)).mode,'work');assert.equal((await delivery(reply.id,b)).mode,'awareness')
 const replyAck=phases(b).find(value=>value.phase==='ack'&&JSON.parse(value.text.split('\n')[1]).messageId===reply.id)
 assert.ok(replyAck.text.includes(report.id)&&replyAck.text.includes(report.text),'awareness gets full original reply context')
 await unchanged(b);await unchanged(c)
 const slash=await post(a,'/compact is quoted group content, not an engine command.','slash-content')
 await waitDone(slash.id);await waitIdle();await unchanged(b);await unchanged(c)
 console.log('PASS employee posts fan out as awareness, replies target their author, and slash-prefixed awareness remains content')

 // Native planning/JSON output is never promoted to public confirmation, even for awareness.
 for(const p of people){fs.rmSync(file(p,'.ack-tool.json'),{force:true});fs.writeFileSync(file(p,'.ack-output.txt'),JSON.stringify({text:'ACK_PRIVATE_AWARENESS_should_not_publish'}))}
 const before=(await history()).messages.length,note=await post(a,'This note has no explicit recipient confirmation.','no-implicit-confirmations')
 await f.until(async()=>(await message(note.id)).deliveries.every(d=>d.status==='failed'),'ordinary output cannot acknowledge awareness');await waitIdle()
 assert.equal((await history()).messages.length,before+1);for(const d of (await message(note.id)).deliveries){assert.equal(d.readAt,undefined);assert.equal(d.ackMessageId,undefined)}await unchanged(b);await unchanged(c)
 for(const p of people)answer(p,null)
 const cleanStart=(await history()).messages.length,publicNote=await post(a,'Explicit publication remains available through the authenticated API.','explicit-public-note');await waitDone(publicNote.id)
 const explicitB=await post(b,'B publishes this deliberately.','explicit-b',publicNote.id),explicitC=await post(c,'C publishes this deliberately.','explicit-c',publicNote.id)
 await waitDone(explicitB.id);await waitDone(explicitC.id);await waitIdle()
 const chain=(await history()).messages.slice(cleanStart);assert.equal(chain.length,3);assert.deepEqual(chain.map(value=>value.id),[publicNote.id,explicitB.id,explicitC.id]);assert.ok(chain.every(value=>value.acknowledgmentOf===undefined))
 for(const reply of [explicitB,explicitC])for(const d of (await message(reply.id)).deliveries){assert.equal(d.mode,'awareness');assert.ok(d.readAt);assert.equal(d.ackMessageId,undefined)}
 await unchanged(b);await unchanged(c);assert.ok(!(await history()).messages.some(value=>value.text.includes('ACK_PRIVATE_AWARENESS')))
 console.log('PASS ordinary awareness output stays private/unread; explicit API posts remain public with one silent awareness wave')

 for(const p of people)answer(p,null)
 fs.rmSync(file(c,'.ack-tool.json'));fs.writeFileSync(file(c,'.ack-output.txt'),'not valid JSON')
 const failed=await post(a,'This awareness ACK fails visibly in its delivery status.','bad-awareness')
 await f.until(async()=>(await delivery(failed.id,c)).status==='failed','bad awareness rejected')
 await waitIdle();assert.equal((await delivery(failed.id,c)).readAt,undefined);assert.match((await delivery(failed.id,c)).error,/not acknowledged through its tool\/API/)
 await unchanged(c);assert.equal((await rpc('session.snapshot',{id:(await status(c)).sessionId})).error,undefined)
 answer(c,null);hold(b)
 const stopped=await post(a,'This pending shared context will be stopped.','stopped-awareness')
 await f.until(async()=>{const s=await status(b);return s.acknowledging&&s.currentTask?.chat?.messageId===stopped.id},'interruptible awareness')
 const session=(await status(b)).sessionId
 await rpc('session.enqueue',{id:session,text:'Queued private task cancelled by Stop'})
 await rpc('session.interrupt',{id:session})
 await f.until(async()=>(await delivery(stopped.id,b)).status==='interrupted','awareness interruption')
 await f.until(async()=>!(await status(b)).busy,'interrupted awareness idle');assert.deepEqual(await rpc('session.queue',{id:session}),[])
 await unchanged(b);release(b)
 await rpc('session.send',{id:session,text:'A real private task after awareness'})
 await f.until(async()=>!(await status(b)).busy,'normal work recovery')
 assert.equal(work(b).at(-1).thread,baseline.get(b.id).thread);assert.ok(work(b).at(-1).environments.some(env=>env.environmentId==='local'))
 assert.equal((await transcript(b)).items.filter(item=>item.role==='user'&&item.text==='A real private task after awareness').length,1)
 assert.ok(!(await transcript(b)).items.some(item=>item.role==='user'&&item.text==='Queued private task cancelled by Stop'))
 hold(b)
 const queuedNotice=await post(a,'Awareness releases the same queue when complete.','notice-then-private')
 await f.until(async()=>{const s=await status(b);return s.acknowledging&&s.currentTask?.chat?.messageId===queuedNotice.id},'queued awareness')
 await rpc('session.enqueue',{id:session,text:'Private task following awareness'})
 assert.equal(work(b).at(-1).text,'A real private task after awareness')
 release(b);await waitDone(queuedNotice.id)
 await f.until(async()=>work(b).at(-1).text==='Private task following awareness'&&!(await status(b)).busy,'awareness queue continuation')
 assert.ok(work(b).at(-1).at>=(await delivery(queuedNotice.id,b)).readAt)
 assert.equal((await transcript(b)).items.filter(item=>item.role==='user'&&item.text==='Private task following awareness').length,1)
 const beforeClose={items:(await transcript(b)).items,lastReply:(await status(b)).lastReply}
 hold(b);const closing=await post(a,'Closing this held awareness session must finish cleanly.','closed-awareness')
 await f.until(async()=>{const s=await status(b);return s.acknowledging&&s.currentTask?.chat?.messageId===closing.id},'closeable awareness')
 await rpc('session.close',{id:session})
 assert.equal((await delivery(closing.id,b)).status,'interrupted');assert.equal((await delivery(closing.id,b)).readAt,undefined)
 assert.deepEqual((await transcript(b)).items,beforeClose.items);assert.deepEqual((await status(b)).lastReply,beforeClose.lastReply)
 release(b);await rpc('session.send',{employee:b.id,text:'Private task after closing awareness'})
 await f.until(async()=>work(b).at(-1).text==='Private task after closing awareness'&&!(await status(b)).busy,'reopen after awareness close')
 assert.equal(work(b).at(-1).thread,baseline.get(b.id).thread)
 const governor=await f.create('Aware governor','Awareness studio','governor');people.push(governor);answer(governor,null)
 await rpc('chat.update',{id:group.id,members:people.map(p=>p.id)})
 hold(governor);const globalNotice=await post(a,'Shared context does not require a Governor work view.','governor-awareness')
 await f.until(async()=>{const s=await status(governor);return s.acknowledging&&s.currentTask?.chat?.messageId===globalNotice.id},'Governor awareness')
 assert.equal((await status(governor)).currentTask.viewId,undefined)
 assert.equal((await f.request(tokens.get(a.id),'session.send',{employee:governor.id,text:'No control permission was granted'})).ok,false)
 release(governor);await waitDone(globalNotice.id);await waitIdle()
 assert.equal((await transcript(governor)).items.length,0);assert.equal(work(governor).length,0)
 assert.deepEqual(await rpc('terminal.list'),[])
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks:['exact group notice scope','native delivered before authenticated read','no awareness work/user/old reply publication','reply author becomes primary','full shared reply context','employee post awareness without control permissions','slash content inert','ordinary text/JSON never creates public ACKs or read; explicit API publication fans out silently','failed and interrupted awareness stays in delivery status','queue Stop semantics and ordinary native environment recovery','successful queue continuation','close/reopen during ACK without native identity change','Governor awareness needs no work view and grants no control'],providerCalls:0,platform:process.platform},null,2))
 console.log('PASS failed/Stop awareness stays out of private transcript; queue semantics and same-native-thread work recovery are preserved')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
