// Real Core lifecycle with a held deterministic Codex ACK response; no shared build or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-ack-lifecycle-'))),entry=path.join(temp,'daemon.cjs'),out=path.join(root,'artifacts/group-ack-lifecycle')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
const within=async(promise,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error(label+' did not return while ACK was held')),2000))])}finally{clearTimeout(timer)}}
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({AC_CHAT_ACK_MANUAL:'1'},entry)
 const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
 await f.cli('group','add','Studio');const employee=await f.create('Acknowledging worker','Studio'),group=await rpc('chat.create',{name:'ACK lifecycle',members:[employee.id]})
 const file=suffix=>path.join(f.control,employee.id+suffix),read=suffix=>fs.existsSync(file(suffix))?JSON.parse(fs.readFileSync(file(suffix),'utf8')):null,hold=suffix=>fs.writeFileSync(file(suffix),''),release=suffix=>fs.rmSync(file(suffix),{force:true}),answer=value=>fs.writeFileSync(file('.ack-output.txt'),value),tool=text=>fs.writeFileSync(file('.ack-tool.json'),JSON.stringify({text}))
 const history=()=>rpc('chat.history',{id:group.id,limit:100}),message=id=>history().then(value=>value.messages.find(item=>item.id===id)),delivery=id=>message(id).then(value=>value.deliveries[0]),transcript=()=>rpc('session.transcript',{employee:employee.id}),status=async()=> (await rpc('session.status',{employee:employee.id}))[0]
 const waitAck=id=>f.until(()=>{const value=read('-ack.json');return value&&JSON.parse(value.text.split('\n')[1]).messageId===id&&value},'native ACK request')
 const waitDelivery=(id,expected)=>f.until(async()=>{const value=await delivery(id);if(['failed','interrupted'].includes(value.status)&&value.status!==expected)throw Error(JSON.stringify(value));return value.status===expected&&value},'delivery '+expected)
 const send=text=>rpc('chat.send',{id:group.id,text,mentions:[employee.id],clientMessageId:'lifecycle:'+text})

 const publicText='I received the request and will begin after this acknowledgment.';tool(publicText);answer(JSON.stringify({text:'ACK_PRIVATE_DELIBERATION_not_public'}));hold('.hold-ack');hold('.hold-user')
 const start=Date.now(),first=await within(send('HELD_ACK_THEN_WORK'),'chat.send'),sendMilliseconds=Date.now()-start,ackInput=await waitAck(first.id),sessionId=(await status()).sessionId,taskId=(await status()).currentTask.messageId
 assert.equal((await status()).busy,true);assert.equal(read('-work.json'),null);assert.equal(read('-user.json'),null);assert.equal((await delivery(first.id)).readAt,undefined);assert.deepEqual(ackInput.environments,[])
 const rejected=await f.request(null,'session.steer',{id:sessionId,text:'STEER_MUST_NOT_REACH_ACK'});assert.equal(rejected.ok,false);assert.match(rejected.error,/acknowledgment.*queue/i)
 const queued=await within(rpc('session.enqueue',{id:sessionId,text:'QUEUED_AFTER_ACK'}),'session.enqueue');assert.ok((await rpc('session.queue',{id:sessionId})).some(item=>item.id===queued.id));assert.equal(read('-work.json'),null)
 assert.equal((await transcript()).items.filter(item=>item.role==='user'&&item.text===first.text).length,1)
 release('.hold-ack')
 await f.until(()=>read('-work.json')?.text.includes(first.text),'formal work after acknowledgment');const firstWork=read('-work.json'),accepted=await delivery(first.id),published=await message(accepted.ackMessageId)
 assert.equal(published.author.kind,'agent');assert.equal(published.author.employeeId,employee.id);assert.equal(published.text,publicText);assert.equal(read('-discussion-tool.json').input.text,publicText);assert.ok(!(await history()).messages.some(item=>item.text.includes('ACK_PRIVATE_DELIBERATION')));assert.ok(accepted.readAt<=firstWork.at);assert.equal(firstWork.thread,ackInput.thread);assert.equal(firstWork.environments.length,1);assert.equal(firstWork.environments[0].cwd,employee.cwd);assert.equal((await status()).currentTask.messageId,taskId)
 const during=(await transcript()).items;assert.equal(during.filter(item=>item.role==='user'&&item.text===first.text).length,1);assert.ok(!during.some(item=>item.text?.includes('[Agents Company group acknowledgment]')));assert.equal(during.filter(item=>item.role==='user'&&item.text==='QUEUED_AFTER_ACK').length,0)
 release('.hold-user');await waitDelivery(first.id,'completed');await f.until(async()=>read('-work.json')?.text.endsWith('QUEUED_AFTER_ACK')&&!(await status()).busy,'queued follow-up completes');assert.deepEqual(await rpc('session.queue',{id:sessionId}),[])
 assert.equal((await transcript()).items.filter(item=>item.role==='user'&&item.text==='QUEUED_AFTER_ACK').length,1)
 console.log('PASS held ACK returns promptly; steer rejects, queue accepts; authenticated acknowledgment precedes same-task/thread work and one original user record')

 // Every member, including an explicitly addressed one, may acknowledge without publishing.
 tool(null);answer('{"text":"ACK_PRIVATE_NULL_TOOL_STILL_PRIVATE"}');const beforeNull=(await history()).messages.length,nullRequest=await within(send('NULL_ACK_STARTS_ADDRESSED_WORK'),'nullable ACK chat.send');await waitDelivery(nullRequest.id,'completed');assert.equal((await delivery(nullRequest.id)).ackMessageId,undefined);assert.ok((await delivery(nullRequest.id)).readAt);assert.equal((await history()).messages.length,beforeNull+1);assert.ok(read('-work.json').text.includes(nullRequest.text))
 // No form of ordinary model output is a publication or a read confirmation.
 release('.ack-tool.json')
 const outputCases=[['PLAIN_MUST_NOT_RUN','ACK_PRIVATE_PLAIN'],['PROSE_MUST_NOT_RUN','ACK_PRIVATE_PROSE I should decide whether to respond.'],['JSON_TEXT_MUST_NOT_RUN','{"text":"ACK_PRIVATE_JSON"}'],['JSON_NULL_MUST_NOT_RUN','{"text":null}'],['BAD_JSON_MUST_NOT_RUN','not JSON'],['INVALID_ACK_MUST_NOT_RUN','{"text":123}'],['THINKING_MUST_NOT_RUN','']]
 for(const [text,response] of outputCases){
  answer(response);if(text.startsWith('THINKING'))fs.writeFileSync(file('.ack-thinking.txt'),'ACK_PRIVATE_THINKING')
  const workBefore=fs.readFileSync(file('-work.json'),'utf8'),request=await within(send(text),'ordinary ACK output chat.send');await waitAck(request.id);const failed=await waitDelivery(request.id,'failed')
  assert.match(failed.error,/not acknowledged through its tool\/API/);assert.equal(failed.readAt,undefined);assert.equal(failed.ackMessageId,undefined);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),workBefore);assert.equal((await history()).messages.some(item=>item.replyTo===request.id),false);assert.equal((await transcript()).items.filter(item=>item.role==='user'&&item.text===text).length,1);assert.ok(!JSON.stringify((await transcript()).items).includes('ACK_PRIVATE_'));await f.until(async()=>!(await status()).busy,'unconfirmed reading stage idle');release('.ack-thinking.txt')
 }
 // An actual driver failure cannot turn apparently valid final JSON into a read.
 answer('{"text":"ACK_PRIVATE_BEFORE_FAILURE"}');hold('.ack-fail');const beforeFailure=fs.readFileSync(file('-work.json'),'utf8'),nativeFailure=await send('NATIVE_FAILURE_AFTER_JSON');await waitAck(nativeFailure.id);assert.match((await waitDelivery(nativeFailure.id,'failed')).error,/fixture acknowledgment failure/i);assert.equal((await delivery(nativeFailure.id)).readAt,undefined);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),beforeFailure);release('.ack-fail')
 // A real API read is retained even if the native turn subsequently fails; formal work still must not start.
 hold('.hold-ack');hold('.ack-fail');const apiThenFailure=await send('EXPLICIT_API_THEN_NATIVE_FAILURE');await waitAck(apiThenFailure.id)
 const token=await f.token(employee.id),apiRead=await f.request(token,'chat.post',{id:group.id,replyTo:apiThenFailure.id,text:null});assert.ok(apiRead.ok,apiRead.error);assert.ok(apiRead.data.readAt);release('.hold-ack');assert.match((await waitDelivery(apiThenFailure.id,'failed')).error,/fixture acknowledgment failure/i);assert.equal((await delivery(apiThenFailure.id)).readAt,apiRead.data.readAt);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),beforeFailure);release('.ack-fail')
 release('.ack-output.txt');await rpc('session.send',{id:sessionId,text:'PRIVATE_RECOVERY_AFTER_INVALID_ACK'});await f.until(async()=>read('-work.json')?.text.endsWith('PRIVATE_RECOVERY_AFTER_INVALID_ACK')&&!(await status()).busy,'private recovery after rejected ACK');assert.equal(read('-work.json').environments.length,1)
 console.log('PASS explicit null succeeds; prose/JSON/thinking are never public/read; actual API read survives later native failure; private conversation recovers with original environment')

 tool(null);answer('ACK_PRIVATE_INTERRUPTED');hold('.hold-ack')
 const workBeforeStop=fs.readFileSync(file('-work.json'),'utf8'),interrupted=await within(send('INTERRUPTED_ACK_MUST_NOT_RUN'),'interruptible chat.send');await waitAck(interrupted.id)
 await within(rpc('session.enqueue',{id:sessionId,text:'CANCELLED_PENDING_FOLLOWUP'}),'enqueue during interruptible ACK')
 await within(rpc('session.interrupt',{id:sessionId}),'session.interrupt');await waitDelivery(interrupted.id,'interrupted');await f.until(async()=>!(await status()).busy,'interrupted acknowledgment idle')
 assert.equal((await delivery(interrupted.id)).readAt,undefined);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),workBeforeStop);assert.deepEqual(await rpc('session.queue',{id:sessionId}),[])
 release('.hold-ack');release('.ack-output.txt');hold('.hold-user')
 await rpc('session.enqueue',{id:sessionId,text:'PRIVATE_AFTER_STOP'});await f.until(()=>read('-work.json')?.text.endsWith('PRIVATE_AFTER_STOP'),'private work restarts after Stop');await rpc('session.enqueue',{id:sessionId,text:'QUEUE_AFTER_STOP'});release('.hold-user')
 await f.until(async()=>read('-work.json')?.text.endsWith('QUEUE_AFTER_STOP')&&!(await status()).busy,'post-Stop queue recovers')
 const users=(await transcript()).items.filter(item=>item.role==='user').map(item=>item.text);for(const text of [first.text,'QUEUED_AFTER_ACK','NULL_ACK_STARTS_ADDRESSED_WORK',...outputCases.map(([text])=>text),'NATIVE_FAILURE_AFTER_JSON','EXPLICIT_API_THEN_NATIVE_FAILURE','PRIVATE_RECOVERY_AFTER_INVALID_ACK',interrupted.text,'PRIVATE_AFTER_STOP','QUEUE_AFTER_STOP'])assert.equal(users.filter(value=>value===text).length,1,text+' retains one accepted user record')
 assert.ok(!users.includes('STEER_MUST_NOT_REACH_ACK'));assert.ok(!users.includes('CANCELLED_PENDING_FOLLOWUP'));assert.equal(read('-work.json').thread,ackInput.thread);assert.equal(read('-work.json').environments.length,1);assert.equal(fs.existsSync(file('-group-ack.json')),false,'the fixture never auto-published an ACK');assert.deepEqual(await rpc('terminal.list'),[])
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,platform:process.platform,fixture:'source-built Core with deterministic Codex protocol, no model/provider calls',sendMilliseconds,checks:['held ACK does not block request return','ACK steer refused while enqueue remains available','explicit native MCP tool acknowledgment precedes work','one original user record and same CurrentTask/native thread','ACK native environments empty then restored','explicit null succeeds; all ordinary output forms fail without read or work','native error cannot manufacture read; a prior authenticated API read remains true','private recovery after rejected ACK','ACK interrupt remains interrupted and clears pending queue','later private and queued work restore normal operation','no fixture auto-publication']},null,2))
 console.log('PASS ACK interruption prevents work, preserves Stop queue semantics and permits later private/queued work; no production bypass')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
