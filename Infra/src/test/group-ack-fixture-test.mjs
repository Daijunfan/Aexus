// Native fixture obeys actual tool catalog: reading never posts, response-stage calls do.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-reading-fixture-')),entry=path.join(temp,'daemon.cjs');fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry);const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio'),group=await rpc('chat.create',{name:'Fixture reading',members:[a.id,b.id]})
 const file=(employee,suffix)=>path.join(f.control,employee+suffix),history=async()=>(await rpc('chat.history',{id:group.id,limit:100})).messages,message=async id=>(await history()).find(m=>m.id===id)
 const finish=id=>f.until(async()=>{const d=(await message(id)).deliveries;const failure=d.find(d=>d.status==='failed');if(failure)throw Error(JSON.stringify(failure));return d.every(d=>d.status==='completed')},'native fixture completion')
 const trace=(employee,id)=>{const ack=JSON.parse(fs.readFileSync(file(employee,'-ack.json'),'utf8')),work=JSON.parse(fs.readFileSync(file(employee,'-work.json'),'utf8'));assert.equal(JSON.parse(ack.text.split('\n')[1]).messageId,id);assert.deepEqual(ack.environments,[]);assert.equal(ack.readingTools,false);assert.equal(ack.documentationTools,false);assert.equal(work.thread,ack.thread);assert.notEqual(work.turn,ack.turn);assert.ok(work.at>=ack.finishedAt);assert.ok(work.environments.some(e=>e.cwd===work.cwd));return {ack,work}}
 await rpc('session.send',{employee:a.id,text:'A genuine private question.'});await f.received(a.id,'A genuine private question.');await f.until(async()=>!(await f.status(a.id)).busy,'private complete');const receipt=(await f.status(a.id)).lastReply
 const broadcast=await rpc('chat.send',{id:group.id,text:'A broadcast fixture request.',clientMessageId:'broadcast'});await finish(broadcast.id)
 assert.equal((await history()).length,1);for(const d of (await message(broadcast.id)).deliveries){assert.ok(d.readAt>=d.deliveredAt);assert.equal(d.ackMessageId,undefined);trace(d.employeeId,broadcast.id);assert.equal(fs.existsSync(file(d.employeeId,'-discussion-tool.json')),false)}
 fs.writeFileSync(file(a.id,'.work-post.json'),JSON.stringify({text:'An intentional response-stage publication.'}));const explicit=await rpc('chat.send',{id:group.id,text:'Reply once when useful.',mentions:[a.id],clientMessageId:'explicit'});await finish(explicit.id)
 const d=(await message(explicit.id)).deliveries[0],published=await message(d.ackMessageId),tool=JSON.parse(fs.readFileSync(file(a.id,'-work-publication.json'),'utf8'))
 assert.equal(published.text,'An intentional response-stage publication.');assert.equal(published.replyTo,explicit.id);assert.equal(published.acknowledgmentOf,undefined);assert.equal(tool.input.messageId,explicit.id);assert.ok(trace(a.id,explicit.id).work.at<=published.createdAt)
 assert.equal((await rpc('chat.send',{id:group.id,text:explicit.text,mentions:[a.id],clientMessageId:'explicit'})).id,explicit.id);assert.equal((await history()).length,3)
 fs.rmSync(file(a.id,'.work-post.json'));await rpc('chat.mute',{id:group.id,member:a.id,muted:true});const muted=await rpc('chat.send',{id:group.id,text:'Muted employee still works privately.',mentions:[a.id],clientMessageId:'muted'});await finish(muted.id);assert.equal((await history()).length,4);assert.ok((await message(muted.id)).deliveries[0].readAt);assert.equal((await message(muted.id)).deliveries[0].ackMessageId,undefined)
 assert.deepEqual((await f.status(a.id)).lastReply,receipt);assert.equal((await f.status(b.id)).lastReply,undefined);assert.deepEqual(await rpc('terminal.list'),[])
 console.log('PASS fixture matches real tool-free reading and explicit response publication; same native environments, no phantom unread, mute and retries preserved')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
