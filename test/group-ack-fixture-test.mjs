// Explicit native tool calls are published by Core; ordinary model JSON never publishes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-group-ack-fixture-'))),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({AC_CHAT_ACK_MANUAL:'0'},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio'),group=await rpc('chat.create',{name:'Fixture acknowledgments',members:[a.id,b.id]})
 const history=()=>rpc('chat.history',{id:group.id,limit:100}),message=id=>history().then(value=>value.messages.find(item=>item.id===id))
 const trace=(employee,id,expected)=>{const ack=JSON.parse(fs.readFileSync(path.join(f.control,employee+'-ack.json'),'utf8')),work=JSON.parse(fs.readFileSync(path.join(f.control,employee+'-work.json'),'utf8'));assert.equal(JSON.parse(ack.text.split('\n')[1]).messageId,id);const tool=JSON.parse(fs.readFileSync(path.join(f.control,employee+'-discussion-tool.json'),'utf8'));assert.deepEqual(tool.input,{conversationType:'group',conversationId:group.id,messageId:id,text:expected});assert.equal(tool.result.result.isError,undefined);assert.equal(ack.response,'Fixture acknowledgment stage complete.');assert.deepEqual(ack.environments,[]);assert.equal(work.environments.length,1);assert.equal(work.environments[0].cwd,work.cwd);assert.equal(work.thread,ack.thread);assert.notEqual(work.turn,ack.turn);assert.ok(work.at>=ack.finishedAt);assert.equal(fs.existsSync(path.join(f.control,employee+'-group-ack.json')),false,'ACK phase never uses fixture auto-post');return {ack,work}}
 const finish=id=>f.until(async()=>(await message(id)).deliveries.every(delivery=>delivery.status==='completed'),'acknowledged fixture output')
 await f.cli('session','send','--employee',a.id,'--text','A private fixture turn.');await f.until(async()=>!(await f.status(a.id)).busy,'private output');assert.equal((await history()).messages.length,0);assert.equal(fs.existsSync(path.join(f.control,a.id+'-group-ack.json')),false)
 const broadcast=await rpc('chat.send',{id:group.id,text:'A broadcast fixture request.',clientMessageId:'fixture-broadcast'});await finish(broadcast.id);let record=await message(broadcast.id)
 assert.equal((await history()).messages.length,1,'broadcast acknowledgments do not create public bubbles')
 for(const delivery of record.deliveries){assert.ok(delivery.readAt>=delivery.deliveredAt);assert.equal(delivery.ackMessageId,undefined);const {work}=trace(delivery.employeeId,broadcast.id,null);assert.ok(work.at>=delivery.readAt);assert.ok(work.text.includes(broadcast.text))}
 fs.writeFileSync(path.join(f.control,a.id+'.ack-tool.json'),JSON.stringify({text:'Received. I will handle this request.'}));
 const explicit=await rpc('chat.send',{id:group.id,text:'A visibly acknowledged fixture request.',mentions:[a.id],clientMessageId:'fixture-mentioned'});await finish(explicit.id);record=await message(explicit.id)
 const ack=await message(record.deliveries[0].ackMessageId);assert.equal(ack.author.kind,'agent');assert.equal(ack.author.employeeId,a.id);assert.equal(ack.replyTo,explicit.id);assert.equal(ack.text,'Received. I will handle this request.');assert.ok(ack.createdAt<=(await f.status(a.id)).lastReply.createdAt);assert.equal((await history()).messages.length,3);const explicitTrace=trace(a.id,explicit.id,ack.text);assert.ok(explicitTrace.work.at>=record.deliveries[0].readAt)
 assert.equal((await rpc('chat.send',{id:group.id,text:explicit.text,mentions:[a.id],clientMessageId:'fixture-mentioned'})).id,explicit.id);assert.equal((await history()).messages.length,3,'send retries do not create another acknowledgment')
 fs.rmSync(path.join(f.control,a.id+'.ack-tool.json'));
 await rpc('chat.mute',{id:group.id,member:a.id,muted:true});const muted=await rpc('chat.send',{id:group.id,text:'A muted explicitly mentioned fixture request.',mentions:[a.id],clientMessageId:'fixture-muted'});await finish(muted.id);record=await message(muted.id);assert.ok(record.deliveries[0].readAt);assert.equal(record.deliveries[0].ackMessageId,undefined);assert.equal((await history()).messages.length,4);assert.ok(trace(a.id,muted.id,null).work.at>=record.deliveries[0].readAt)
 assert.equal((await f.status(a.id)).lastReply.readAt,undefined);assert.equal((await f.status(b.id)).lastReply.readAt,undefined);assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS real native MCP tool -> authenticated Core publication -> same-thread formal work: private unchanged, broadcast/muted null, explicit visible, restored environments, stable retries; no final-text-to-publication conversion, no model/provider calls; adversarial tool isolation tested separately')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
