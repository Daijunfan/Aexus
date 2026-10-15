// Real authenticated Core/CLI, temporary storage and deterministic employee fixtures only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {orderedKeys,mergeOrder} from '../src/shared/messenger-order.ts'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-order-')),entry=path.join(temp,'daemon.cjs'),out=path.join(root,'artifacts/message-order')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
const checks=[]
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 const rpc=async(cmd,args={},token=null)=>{const result=await f.request(token,cmd,args);assert.ok(result.ok,result.error);return result.data},reject=async(args,token=null)=>{const before=await rpc('messenger.state'),result=await f.request(token,'messenger.reorder',args);assert.equal(result.ok,false);assert.deepEqual(await rpc('messenger.state'),before);return result}
 await f.cli('group','add','Ordering');const a=await f.create('Editor','Ordering'),secretary=await f.create('Secretary','Ordering','secretary'),token=await f.token(a.id),secretaryToken=await f.token(secretary.id)
 const group=await rpc('chat.create',{name:'Discussion',members:[a.id,secretary.id]}),sources=[]
 for(const plugin of ['telegram','x','youtube'])sources.push(await rpc('channel.source-add',{plugin,locator:plugin==='youtube'?'@orderfixture':'orderfixture',name:plugin}))
 const refs=['employee:'+a.id,'group:'+group.id,...sources.map(source=>'channel:'+source.channelId)]
 assert.equal((await rpc('messenger.state')).orders,undefined,'old state remains valid without a migration')
 let state=await rpc('messenger.folder-save',{name:'Daily',conversations:refs});const folder=state.folders[0]
 state=await rpc('messenger.folder-save',{name:'Reading',conversations:refs.slice(2)});const other=state.folders[1]
 state=await rpc('messenger.reorder',{scope:'categories',order:[other.id,'all',folder.id],expectedOrder:[]});assert.deepEqual(state.orders.categories,[other.id,'all',folder.id]);assert.equal(state.folders[0].id,folder.id)
 const rowOrder=[refs[4],refs[0],refs[2],refs[1],refs[3]]
 state=await f.cli('messenger','reorder','all','--order',JSON.stringify(rowOrder),'--expected-order','[]');assert.deepEqual(state.orders.all,rowOrder)
 const version=state.revision;state=await rpc('messenger.reorder',{scope:'all',order:rowOrder,expectedOrder:[]});assert.equal(state.revision,version,'lost-response retries do not write again')
 await rpc('messenger.draft',{conversation:refs[0],text:'Do not lose this draft',clientMessageId:'protected-draft'})
 await rpc('messenger.conversation',{conversations:[refs[0],refs[1]],patch:{pinned:true,unread:true,favorite:true,archived:true}})
 const protectedState=await rpc('messenger.state'),subset=[refs[3],refs[4]],merged=mergeOrder(rowOrder,subset)
 state=await rpc('messenger.reorder',{scope:'all',order:subset,expectedOrder:rowOrder});assert.deepEqual(state.orders.all,merged)
 assert.deepEqual(state.drafts,protectedState.drafts);assert.deepEqual(state.conversations,protectedState.conversations);assert.deepEqual(state.messages,protectedState.messages)
 checks.push('Mixed channel/group/employee positions persist, hidden slots survive, unchanged retries are idempotent and unrelated draft/preference changes do not conflict')
 await reject({scope:'all',order:[...rowOrder].reverse(),expectedOrder:rowOrder})
 for(const args of [{scope:'all',order:['employee:missing']},{scope:'categories',order:['missing']},{scope:'all',order:[refs[0],refs[0]]},{scope:'all',order:['__proto__']},{scope:'__proto__',order:[]},{scope:'all',order:{}},{scope:'all',order:null,extra:true},{scope:'all',order:rowOrder,expectedOrder:null},{scope:other.id,order:[refs[0]]}])await reject(args)
 await reject({scope:'all',order:refs},token)
 state=await rpc('messenger.reorder',{scope:folder.id,order:[...refs].reverse(),expectedOrder:[]},secretaryToken);assert.deepEqual(state.orders[folder.id],[...refs].reverse());assert.deepEqual(state.orders.all,merged)
 await rpc('messenger.reorder',{scope:'archive',order:refs.slice(0,2),expectedOrder:[]});await rpc('messenger.reorder',{scope:'favorites',order:refs.slice(0,2).reverse(),expectedOrder:[]})
 checks.push('Scoped optimistic conflicts and invalid/foreign references reject atomically; operator/Secretary organization permissions remain enforced; categories and list scopes are independent')
 const saved=await rpc('messenger.state');await f.stop();await f.start();assert.deepEqual(await rpc('messenger.state'),saved)
 const ordered=await f.cli('messenger','reorder','all','--order','null','--expected-order',JSON.stringify(merged));assert.equal(ordered.orders.all,undefined);assert.deepEqual(ordered.orders[folder.id],[...refs].reverse());assert.deepEqual(ordered.drafts,saved.drafts)
 const resetVersion=ordered.revision;assert.equal((await rpc('messenger.reorder',{scope:'all',order:null})).revision,resetVersion)
 state=await rpc('messenger.folder-delete',{id:folder.id,expectedRevision:folder.revision});assert.equal(state.orders[folder.id],undefined);assert.deepEqual(state.orders.categories,[other.id,'all']);assert.deepEqual(state.conversations,saved.conversations)
 checks.push('Restart and CLI null reset preserve unrelated state; deleting a category cleans only its own ordering references')
 assert.deepEqual(orderedKeys(['new','b','a'],['gone','a','b']),['a','b','new']);assert.deepEqual(mergeOrder(['a','hidden','b','c'],['c','a','b']),['c','hidden','a','b'])
 for(const employee of [a,secretary])assert.deepEqual((await rpc('session.transcript',{employee:employee.id})).items,[])
 assert.deepEqual(await rpc('terminal.list'),[])
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core.json'),JSON.stringify({passed:true,checks,realProviderCalls:0},null,2))
 console.log('PASS Message ordering Core/CLI: '+checks.join('; '))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
