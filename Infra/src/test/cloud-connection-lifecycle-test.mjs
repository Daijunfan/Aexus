import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {sshFixture,vncFixture} from './fixtures/cloud-workbench.mjs'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-lifecycle-')),bin=path.join(temp,'bin');sshFixture(bin)
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH}),vnc=await vncFixture();let idle
try{
 const host=await f.cli('host','create','--data',JSON.stringify({name:'Lifecycle',host:'slow-fixture',os:'linux',defaultDirectory:temp,desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port}}))
 const opened=await f.cli('host','desktop-open',host.id),url=new URL(opened.wsUrl)
 idle=net.connect({host:url.hostname,port:Number(url.port)});await new Promise((r,j)=>{idle.once('connect',r);idle.once('error',j)})
 let closed=false;const closing=f.cli('host','desktop-close',host.id,'--session',opened.id).then(r=>{closed=true;return r})
 await new Promise(r=>setTimeout(r,500));const promptly=closed;idle.destroy();await closing
 assert.ok(promptly,'desktop close must not wait for an idle/incomplete HTTP handshake')
 await f.cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port,viaHostId:host.id}}))
 for(let n=0;n<5;n++){
  const connecting=f.request(null,'host.desktop-open',{id:host.id})
  const item=await f.until(async()=>{const items=await f.cli('host','desktop-list',host.id);return items[0]},'pending desktop')
  assert.equal(item.state,'connecting','a pending SSH transport is not ready')
  await f.cli('host','desktop-close',host.id,'--session',item.id)
  const reply=await connecting;assert.equal(reply.ok,false);assert.match(reply.error,/取消|关闭/)
  assert.deepEqual(await f.cli('host','desktop-list',host.id),[])
 }
 const fresh=await f.cli('host','desktop-open',host.id);assert.equal(fresh.state,'ready');assert.ok(fresh.wsUrl)
 await f.cli('host','desktop-close',host.id,'--session',fresh.id)
 await assert.rejects(()=>new Promise((r,j)=>{const s=net.connect({host:new URL(fresh.wsUrl).hostname,port:Number(new URL(fresh.wsUrl).port)});s.once('connect',()=>{s.destroy();r()});s.once('error',j)}))
 console.log('PASS desktop lifecycle: idle HTTP sockets close promptly; connecting state is truthful; five open/cancel cycles reject cleanly; fresh reconnect succeeds and gateway is removed')
}finally{idle?.destroy();await f.close();await vnc.close();fs.rmSync(temp,{recursive:true,force:true})}
