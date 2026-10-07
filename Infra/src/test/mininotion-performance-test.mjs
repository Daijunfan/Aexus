// Isolated Core + real plugin backend. No model task and no production workspace.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{build}from'esbuild';import{fixtureCore}from'./fixtures/headless-core.mjs';
const f=await fixtureCore(),{root,temp,cli}=f,require=createRequire(import.meta.url);let checks=0;
const pass=label=>{checks++;console.log('PASS '+label)};
try{
 const bundled=path.join(temp,'journal.cjs');await build({entryPoints:[path.join(root,'Infra/src/main/plugins/event-journal.ts')],outfile:bundled,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
 const {PluginEventJournal}=require(bundled),journal=new PluginEventJournal(1000,4);
 journal.append({text:'x'.repeat(2000)});assert.equal(journal.length,1);
 for(let i=0;i<100;i++)journal.append({text:'y'.repeat(100)});
 assert.ok(journal.retainedBytes<=1000);assert.ok(journal.length<=4);
 const state=JSON.parse(journal.serialize());assert.equal(state.sequence,101);assert.ok(state.firstSequence>1);
 pass('event journals have independent byte and entry bounds and expose sequence gaps');
 await cli('group','add','Performance','--mode','work','--plugin','mininotion');
 const employee=await f.create('Writer','Performance');
 const api=(method,params={},scope=['--employee',employee.id])=>cli('plugin','call','mininotion',method,...scope,'--params',JSON.stringify(params));
 await cli('session','open',employee.id);
 const mailbox=path.join(employee.cwd,'.agents-company/ipc/mininotion',employee.id);
 assert.ok(fs.existsSync(path.join(mailbox,'host.json')));
 const first=await api('page.create',{title:'Large',color:'white',blocks:[{type:'paragraph',content:'Text '.repeat(40000)}]});
 const small=await api('page.create',{title:'Small',color:'white'});
 const other=await api('page.create',{title:'Second large',color:'white',blocks:[{type:'paragraph',content:'Body '.repeat(40000)}]});
 for(let i=0;i<24;i++)await api('page.update',{pageId:first.id,title:'Large '+i});
 await f.until(()=>fs.existsSync(path.join(mailbox,'events.json')),'mailbox events');
 const packets=JSON.parse(fs.readFileSync(path.join(mailbox,'events.json'),'utf8'));
 assert.ok(packets.events.some(item=>item.data.type==='delta'));
 assert.ok(fs.statSync(path.join(mailbox,'events.json')).size<2*1024*1024+1000);
 assert.equal((await api('page.get',{pageId:first.id})).title,'Large 23');
 assert.equal((await api('page.get',{pageId:other.id})).title,'Second large');
 pass('real employee mailbox carries bounded deltas without losing independent page content');
 const before=Date.now();
 const pids=[(await api('status')).pid,(await api('status',{},[])).pid];
 await f.stop();
 await f.until(()=>pids.every(pid=>{try{process.kill(pid,0);return false}catch(e){return e.code==='ESRCH'}}),'owned backend exit');
 assert.ok(Date.now()-before<5000);
 pass('Core shutdown releases every owned plugin process and mailbox within five seconds');
 console.log(`PASS=${checks} FAIL=0`);
}finally{await f.close()}
