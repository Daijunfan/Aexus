// Client navigation over real Core handlers; no model or production state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-view-')),home=path.join(temp,'state'),previous=process.env.AGENTS_COMPANY_HOME,require=createRequire(import.meta.url)
process.env.AGENTS_COMPANY_HOME=home;fs.mkdirSync(home);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({groups:['Studio'],rooms:{},sessions:[{id:'worker',title:'Worker',engine:'codex',kind:'worker',group:'Studio',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:'employee'}]}))
let core,restored
try{
 const compile=async name=>{const entry=path.join(temp,name+'.cjs');await build({stdin:{contents:"export {handleRequest} from './Infra/src/main/server';export {getView} from './Infra/src/main/presentation';export {operatorContext,withCaller} from './Infra/src/main/authorization';export {closeChannels} from './Infra/src/main/channels'",resolveDir:root,sourcefile:'view-memory.ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});return require(entry)}
 core=await compile('first');const call=(cmd,args={},client='A',api=core)=>api.handleRequest({cmd,args},{...api.operatorContext(),clientId:client})
 for(const client of ['A','B','C']){assert.equal((await call('view.get',{},client)).layer,'launcher');await call('view.load-engine',{engineId:'workspace-audit'},client)}
 const channel=await call('channel.create',{name:'Reading',engine:{kind:'external',location:'local',name:'Fixture'}}),group=await call('chat.create',{name:'Review',members:['worker']})
 await call('view.open',{kind:'messages',channelId:channel.id});await call('view.select',{id:'company'});assert.equal((await call('view.select',{id:'messages'})).channelId,channel.id)
 await call('view.select',{id:'plan'});assert.equal((await call('view.select',{id:'messages'})).channelId,channel.id);assert.equal((await call('view.select',{id:'messages'})).channelId,channel.id)
 await call('view.open',{kind:'messages',chatId:group.id},'B');await call('view.select',{id:'company'},'B');assert.equal((await call('view.select',{id:'messages'},'B')).chatId,group.id);assert.equal((await call('view.select',{id:'messages'},'A')).channelId,channel.id)
 await call('view.open',{kind:'messages',employee:'worker'},'C');await call('view.select',{id:'plan'},'C');assert.equal((await call('view.select',{id:'messages'},'C')).employee,'worker')
 restored=await compile('restarted');for(const client of ['A','B']){assert.equal((await call('view.get',{},client,restored)).layer,'launcher');await call('view.load-engine',{engineId:'workspace-audit'},client,restored)}assert.equal((await call('view.select',{id:'messages'},'A',restored)).channelId,channel.id);assert.equal((await call('view.select',{id:'messages'},'B',restored)).chatId,group.id)
 await call('chat.delete',{id:group.id},'B',restored);const cleared=await call('view.select',{id:'messages'},'B',restored);assert.equal(cleared.kind,'messages');assert.equal(cleared.chatId,undefined)
 await call('view.close',{},'A',restored);assert.equal((await call('view.select',{id:'messages'},'A',restored)).channelId,undefined,'explicit Back remembers the list')
 console.log('PASS channel/group/employee memory, repeated Messages click, independent clients, restarted Core and deleted destinations; no models')
}finally{core?.closeChannels();restored?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
