const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {startServer}=require('../dist-cli/server.cjs');
const {BackendClient}=require('../dist-cli/client.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(await check())return;await wait(25)}throw Error('Condition timed out')}
async function fixture(t,options={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mn-lifecycle-')));
 const client=new BackendClient({workspace:root,autoStart:false,clientId:'gui-lifecycle'});
 const server=await startServer(client.directory,root,options);
 t.after(async()=>{await server.close();fs.rmSync(root,{recursive:true,force:true})});
 return {root,client,server};
}

test('opted-in state deltas coexist with legacy snapshots and compact mutation responses',async t=>{
 const {client}=await fixture(t),full=[],deltas=[];
 const stopFull=await client.subscribe(event=>full.push(event));
 const stopDelta=await client.subscribe(event=>deltas.push(event),undefined,{delta:true});
 await until(()=>full.some(e=>e.type==='state')&&deltas.some(e=>e.type==='state'));
 const first=await client.request('page.create',{title:'Rich',color:'white',blocks:[{type:'paragraph',content:'large body '.repeat(15000)}]});
 assert.ok(first.workspace);const page=first.result;
 const second=await client.request('page.create',{title:'Other',color:'white'});
 const reply=await client.request('page.update',{pageId:second.result.id,title:'Only this page'},undefined,'delta');
 assert.equal(reply.workspace,undefined);assert.equal(reply.delta.pages.length,1);
 assert.ok(Buffer.byteLength(JSON.stringify(reply))<Buffer.byteLength(JSON.stringify(first.workspace))/20);
 const compact=await client.request('block.append',{pageId:second.result.id,text:'Small reply'},undefined,'none');
 assert.equal(compact.workspace,undefined);assert.equal(compact.delta,undefined);
 assert.match(JSON.stringify((await client.call('page.get',{pageId:second.result.id})).blocks),/Small reply/);
 await until(()=>deltas.some(e=>e.type==='delta'&&e.delta.pages.some(p=>p.id===page.id)));
 assert.ok(full.every(e=>e.type!=='delta'));
 stopFull();stopDelta();
});

test('multiple subscriptions sharing a GUI identity retain readiness until the final stream closes',async t=>{
 const {client}=await fixture(t);let count=0;
 const a=await client.subscribe(()=>count++),b=await client.subscribe(()=>count++);
 await until(()=>count>=2);await client.call('ui.register');
 a();await wait(40);
 assert.equal((await client.call('status')).guiClients,1);
 assert.equal((await client.call('status')).desktopClients,1);
 b();await until(async()=>(await client.call('status')).desktopClients===0);
 assert.equal((await client.call('status')).guiClients,0);
});

test('closing the runtime client releases every owned subscription and stops its unshared backend',async t=>{
 const {client,server}=await fixture(t);await client.subscribe(()=>{});await client.subscribe(()=>{},undefined,{delta:true});
 await wait(30);await client.call('ui.register');await client.close();
 assert.equal(server.server.listening,false);assert.equal(await client.ping(),false);
});

test('idle reap preserves active subscribers then releases the unused service without a shutdown command',async t=>{
 const {client,server}=await fixture(t,{idleMs:120});const unsubscribe=await client.subscribe(()=>{});
 await wait(300);assert.equal(server.server.listening,true);
 unsubscribe();await until(()=>!server.server.listening);
});

test('a host-owned backend detects owner death and releases its socket and lock',async t=>{
 const owner=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 t.after(()=>{if(owner.exitCode===null)owner.kill('SIGTERM')});
 const {server}=await fixture(t,{ownerPid:owner.pid,idleMs:5000});
 assert.equal(server.server.listening,true);
 owner.kill('SIGTERM');await new Promise(resolve=>owner.once('exit',resolve));
 await until(()=>!server.server.listening);
});

test('draft checkpoints do not wait behind an unrelated busy data queue',async t=>{
 const {client,server}=await fixture(t);let release;
 server.service.queue=new Promise(resolve=>{release=resolve});
 const draft={patches:[{id:'pending',pages:[]}],error:'temporary'};
 await client.call('fs.draft-write',{draft});
 assert.deepEqual(await client.call('fs.draft-read'),draft);
 release();await server.service.idle();
});
