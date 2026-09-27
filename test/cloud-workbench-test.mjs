import {fixtureCore} from './fixtures/headless-core.mjs'
import {sshFixture,vncFixture} from './fixtures/cloud-workbench.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {WebSocket} from 'ws'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-workbench-')),bin=path.join(temp,'bin');sshFixture(bin)
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH}),{cli,until}=f,vnc=await vncFixture()
try{
 const host=await cli('host','create','--data',JSON.stringify({name:'Ubuntu Studio',host:'fixture',os:'linux',defaultDirectory:temp})),other=await cli('host','create','--data',JSON.stringify({name:'Other',host:'offline',os:'linux',defaultDirectory:temp}))
 const terminal=await cli('host','terminal-open',host.id,'--cols','100','--rows','28')
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','mkdir -p session; cd session; export CLOUD_MARK="保留 ✓"','--enter')
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','printf "%s" "$CLOUD_MARK" > marker.txt','--enter')
 await until(()=>fs.existsSync(path.join(temp,'session/marker.txt')),'persistent shell')
 assert.equal(fs.readFileSync(path.join(temp,'session/marker.txt'),'utf8'),'保留 ✓')
 await cli('host','terminal-resize',host.id,'--terminal',terminal.id,'--cols','111','--rows','31')
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','stty size > size.txt','--enter')
 await until(()=>fs.existsSync(path.join(temp,'session/size.txt'))&&fs.readFileSync(path.join(temp,'session/size.txt'),'utf8').trim(),'resize');assert.equal(fs.readFileSync(path.join(temp,'session/size.txt'),'utf8').trim(),'31 111')
 const read=await cli('host','terminal-read',host.id,'--terminal',terminal.id);assert.ok(read.cursor>0)
 await assert.rejects(()=>cli('host','terminal-input',other.id,'--terminal',terminal.id,'--data','wrong'))
 await assert.rejects(()=>cli('host','update',host.id,'--data','{"name":"Busy"}'))
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','sleep 30','--enter')
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','\x03')
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','printf interrupted > stop.txt','--enter')
 await until(()=>fs.existsSync(path.join(temp,'session/stop.txt')),'Ctrl+C')
 // A quiet reader waits server-side; input wakes it without a polling interval.
 await new Promise(r=>setTimeout(r,150));const cursor=(await cli('host','terminal-read',host.id,'--terminal',terminal.id)).cursor
 let returned=false;const waiting=f.request(null,'host.terminal-read',{id:host.id,terminal:terminal.id,cursor,waitMs:3000}).then(r=>{returned=true;return r})
 await new Promise(r=>setTimeout(r,80));assert.equal(returned,false)
 await cli('host','terminal-input',host.id,'--terminal',terminal.id,'--data','printf wake','--enter');const update=await waiting;assert.equal(update.ok,true);assert.ok(update.data.cursor>cursor)
 await assert.rejects(()=>cli('host','terminal-read',host.id,'--terminal',terminal.id,'--wait-ms','15001'))
 await cli('host','terminal-close',host.id,'--terminal',terminal.id);assert.equal((await cli('host','terminal-list',host.id)).length,0)
 const closed=await cli('host','terminal-open',other.id);await until(async()=>!(await cli('host','terminal-read',other.id,'--terminal',closed.id)).running,'offline exit');await cli('host','terminal-close',other.id,'--terminal',closed.id)
 await cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port,viaHostId:host.id}}))
 const [a,b]=await Promise.all([cli('host','desktop-open',host.id),cli('host','desktop-open',host.id)]);assert.equal(a.id,b.id);assert.match(a.wsUrl,/^ws:\/\/127.0.0.1:/)
 const received=await new Promise((resolve,reject)=>{const ws=new WebSocket(a.wsUrl,{origin:'http://127.0.0.1:1234'});ws.on('error',reject);ws.on('message',data=>{resolve(data.toString());ws.close()})});assert.equal(received,'RFB 003.008\n')
 await assert.rejects(()=>new Promise((resolve,reject)=>{const ws=new WebSocket(a.wsUrl,{origin:'https://untrusted.example'});ws.on('open',()=>{ws.close();resolve()});ws.on('error',reject)}))
 await assert.rejects(()=>cli('host','desktop-close',other.id,'--session',a.id));await assert.rejects(()=>cli('host','remove',host.id))
 await cli('host','desktop-close',host.id,'--session',a.id)
 await cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'rdp',address:'127.0.0.1',port:vnc.port,username:'desktop-user'}}))
 const rdp=await cli('host','desktop-open',host.id);assert.match(rdp.profile,/enablecredsspsupport:i:1/);assert.match(rdp.profile,/authentication level:i:2/);assert.ok(!rdp.profile.includes('password'));assert.equal(rdp.wsUrl,undefined)
 await cli('host','desktop-close',host.id,'--session',rdp.id)
 await assert.rejects(()=>cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'rdp',address:'localhost\nmalicious',port:3389}})))
 await cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port,viaHostId:other.id}}))
 await assert.rejects(()=>cli('host','desktop-open',host.id));assert.deepEqual(await cli('host','desktop-list',host.id),[])
 const plugin=JSON.parse((await promisify(execFile)(process.execPath,[path.join(f.root,'PlugIns/cloud-hosts/cli.cjs'),'--workspace',temp,'hosts.terminal-list','--data',JSON.stringify({id:host.id})],{env:f.env})).stdout);assert.deepEqual(plugin.result,[])
 await cli('group','add','Permission fixture');const employee=await f.create('Employee','Permission fixture'),token=await f.token(employee.id)
 assert.equal((await f.raw(token,'host','terminal-open',host.id)).ok,false);assert.equal((await f.raw(token,'host','desktop-open',host.id)).ok,false)
 console.log('PASS Cloud workbench: real PTY state/resize/Unicode/Ctrl+C, offline rejection, host ownership, active guards, concurrent SSH forward reuse, WebSocket RFB bytes and Origin rejection, RDP profile/NLA, transport cleanup, plugin CLI parity, employee authorization. SSH and desktop endpoints are local protocol fixtures; no native desktop login claimed.')
}finally{await f.close();await vnc.close();fs.rmSync(temp,{recursive:true,force:true})}
