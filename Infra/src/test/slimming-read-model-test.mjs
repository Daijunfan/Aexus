// Cache integrity and mutable-source semantics. No engine, web request or production state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-slim-model-')),home=path.join(temp,'state'),require=createRequire(import.meta.url)
Object.assign(process.env,{AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PACKAGE_ROOT:root,AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'plugins'),AGENTS_COMPANY_PLUGIN_DIRS:''})
fs.mkdirSync(path.join(home,'transcripts'),{recursive:true})
const cards=[{id:'worker',title:'Original',group:'A',engine:'codex',cwd:temp,kind:'worker',managementRole:'employee',lastReply:{id:'reply1',itemId:'a1',text:'old',createdAt:10000}}, {id:'secretary',title:'Secretary',group:'A',engine:'codex',cwd:temp,kind:'worker',managementRole:'secretary'}]
const store={revision:0,sessions:cards,groups:['A'],rooms:{},teamRoots:{A:temp}},saveStore=()=>fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({...store,revision:++store.revision}))
saveStore()
const source=path.join(home,'transcripts/worker.json'),items=[{id:'u1',role:'user',createdAt:100,text:'needle request',images:['photo.png'],files:[{path:'report.txt',name:'report.txt',bytes:1,mimeType:'text/plain',kind:'file'}],author:{kind:'agent',employeeId:'secretary'}},{id:'a1',role:'assistant',blocks:[{kind:'text',text:'needle original'},{kind:'thinking',text:'PRIVATE_NEVER_PUBLIC',done:true}]}]
fs.writeFileSync(source,JSON.stringify(items))
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'model.cjs')
await build({stdin:{contents:"export {ReadCache,fileVersion} from './Infra/src/main/read-cache'; export {messengerRequest} from './Infra/src/main/messenger'; export {withCaller,operatorContext} from './Infra/src/main/authorization'; export {restoreTranscript,recordUser,recordAgent,forget,deleteTranscript} from './Infra/src/main/transcripts'; export {closeChannelStore} from './Infra/src/main/channel-store';export {closeMessageIndex} from './Infra/src/main/message-index-client'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{'@anthropic-ai/claude-agent-sdk':sdk},external:[sdk,'electron'],logLevel:'silent'})
const core=require(bundle),operator=core.operatorContext(),secretary={principal:{kind:'agent',employeeId:'secretary'},requestId:'test-cache'}
const call=(cmd,args={},caller=operator)=>core.withCaller(caller,()=>core.messengerRequest(cmd,args)),search=(caller=operator)=>call('messenger.search',{conversation:'employee:worker',query:'needle'},caller),checks=[]
try{
 let loads=0;const cache=new core.ReadCache(2,10),get=(key,version=1,size=4)=>cache.get(key,version,()=>++loads,()=>size)
 assert.equal(get('a'),1);assert.equal(get('a'),1);get('b');get('a');get('c');get('b');assert.equal(loads,4)
 get('large',1,20);get('large',1,20);assert.equal(loads,6)
 assert.throws(()=>cache.get('b',2,()=>{throw Error('corrupt')},()=>1),/corrupt/);assert.equal(get('b',2),7)
 const initial=await search(secretary);assert.equal(initial.total,2);assert.ok(initial.messages.every(m=>!m.text.includes('PRIVATE_NEVER_PUBLIC')))
 const user=initial.messages.find(m=>m.id==='u1');user.authorIdentity.employeeId='forged';user.images.push('forged');user.files[0].name='forged'
 const next=await search();assert.equal(next.messages.find(m=>m.id==='u1').authorIdentity.employeeId,'secretary');assert.deepEqual(next.messages.find(m=>m.id==='u1').images,['photo.png']);assert.equal(next.messages.find(m=>m.id==='u1').files[0].name,'report.txt')
 checks.push('bounded cache eviction, error propagation and immutable returned message metadata')
 cards[0].title='Renamed worker';cards[1].title='Renamed sender';saveStore()
 assert.equal((await search()).messages.find(m=>m.id==='a1').author,'Renamed worker');assert.equal((await search()).messages.find(m=>m.id==='u1').author,'Renamed sender')
 call('messenger.message',{conversation:'employee:worker',id:'a1',patch:{hidden:true}});assert.equal((await search()).total,1)
 call('messenger.message',{conversation:'employee:worker',id:'a1',patch:{hidden:false}});assert.equal((await search()).total,2)
 const pendingRead=search();call('messenger.message',{conversation:'employee:worker',id:'a1',patch:{hidden:true}});assert.equal((await pendingRead).total,1,'a hide during worker IO affects the in-flight result');call('messenger.message',{conversation:'employee:worker',id:'a1',patch:{hidden:false}})
 const pendingAuthority=search(secretary);cards[1].managementRole='governor';saveStore();await assert.rejects(pendingAuthority,/Only the user/);assert.throws(()=>search(secretary),/Only the user/)
 cards[1].managementRole='secretary';saveStore();assert.equal((await search(secretary)).total,2)
 assert.equal(cards[0].lastReply.readAt,undefined);assert.equal(JSON.parse(fs.readFileSync(path.join(home,'sessions.json'))).sessions[0].lastReply.readAt,undefined)
 checks.push('current labels, personal visibility, role revocation and user unread state are never cached as authority')
 const stamp=core.fileVersion(source),times=fs.statSync(source),original=fs.readFileSync(source,'utf8')
 fs.writeFileSync(source,original.replace('needle original','needle revised!'));fs.utimesSync(source,times.atime,times.mtime)
 assert.notEqual(core.fileVersion(source),stamp);assert.match((await search()).messages.find(m=>m.id==='a1').text,/revised!/)
 fs.writeFileSync(source,'invalid');await assert.rejects(()=>search(),/corrupt/);fs.writeFileSync(source,original)
 fs.unlinkSync(source);assert.equal((await search()).total,0);fs.writeFileSync(source,original);assert.equal((await search()).total,2)
 checks.push('same-size file edit, unchanged mtime, corruption, removal and recreation invalidate warm data')
 core.restoreTranscript('live1','worker','codex');assert.equal((await search()).total,2)
 core.recordUser('live1','needle live text',[],undefined,{kind:'operator'});assert.equal((await search()).total,3)
 core.recordAgent('live1',{kind:'text',text:'needle response',id:'runtime-answer'});assert.ok((await search()).messages.some(m=>m.text.includes('needle response')))
 core.forget('live1');assert.ok((await search()).messages.some(m=>m.text.includes('needle response')))
 core.deleteTranscript('worker');assert.equal((await search()).total,0)
 cards[0].deleting=true;saveStore();await assert.rejects(()=>search(),/Unknown employee/)
 checks.push('live reducer updates, closed history and employee deletion preserve cache correctness')
 console.log('PASS '+checks.join('; '))
}finally{await core.closeMessageIndex();core.closeChannelStore();fs.rmSync(temp,{recursive:true,force:true})}
