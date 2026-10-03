import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-slim-domains-'))
process.env.AGENTS_COMPANY_HOME=temp
const entry=path.join(temp,'domains.cjs');await build({stdin:{contents:"export * from './src/main/delivery';export * from './src/main/single-flight';export * from './src/shared/store-changes';export * from './src/shared/message-drafts';export * from './src/renderer/src/snapshot'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'})
fs.symlinkSync(root+'/node_modules',temp+'/node_modules','dir')
const {SingleFlight,nextDelivery,storeChanges,affectsMembers,affectsInbox,reuseDraft,draftContent,createRefreshQueue}=createRequire(import.meta.url)(entry),checks=[]
try{
 const f=new SingleFlight(),calls=[];let release
 const a=f.run('same',async()=>{calls.push('first');await new Promise(resolve=>release=resolve);return 7}),b=f.run('same',async()=>{calls.push('duplicate');return 9})
 await Promise.resolve();assert.equal(a,b);assert.equal(f.has('same'),true);release();assert.equal(await b,7);await Promise.resolve();assert.equal(f.has('same'),false);await assert.rejects(()=>f.run('failed',async()=>{throw Error('expected')}),/expected/);assert.equal(await f.run('failed',async()=>11),11);assert.deepEqual(calls,['first'])
 checks.push('Concurrent retries execute once, rejected work releases its key, independent later requests remain usable')
 const initial={employeeId:'reader',status:'running',deliveredAt:5,readAt:8,ackMessageId:'ack'}
 assert.equal(nextDelivery(initial,{status:'queued'},true),null)
 const completed=nextDelivery(initial,{status:'completed',deliveredAt:9,readAt:12,ackMessageId:'replacement'});assert.deepEqual(completed,{...initial,status:'completed'})
 for(const status of ['completed','failed','interrupted'])for(const next of ['pending','routing','queued','running','completed','failed','interrupted']){
  assert.equal(nextDelivery({...initial,status},{status:next}),null)
  assert.deepEqual(nextDelivery({employeeId:'reader',status},{status:next,deliveredAt:10}),{employeeId:'reader',status,deliveredAt:10,readAt:undefined,ackMessageId:undefined})
 }
 checks.push('Queue races and late events cannot undo terminal status or first receipt evidence; failed and completed are distinct')
 const original={revision:1,sessions:[{id:'reader',title:'Reader',group:'A',engine:'codex',kind:'worker',cwd:'/workspace',managementRole:'employee',permissionMode:'default',createdAt:1}],groups:['A'],rooms:{},teamRoots:{A:'/workspace'},access:{version:2,globalManagerIds:[],relations:[],revision:1}}
 for(const property of ['title','role','avatar','accessory','desk','seat','position','lastReply']){const next=structuredClone(original);next.sessions[0][property]=property==='position'?{x:12,y:15}:property==='lastReply'?{id:'reply',readAt:1}:'changed';const changes=storeChanges(original,next);assert.equal(changes.authority,false,property);assert.deepEqual(changes.employeeIds,['reader'])}
 for(const property of ['permissionMode','managementRole','cwd','group','threadId','nativeConfigRoot','deleting','futureExecutionCapability']){const next=structuredClone(original);next.sessions[0][property]='changed';assert.equal(storeChanges(original,next).authority,true,property)}
 const next=structuredClone(original);next.preferences={theme:'black'};next.rooms={A:{x:2,y:3}};const appearance=storeChanges(original,next);assert.equal(appearance.authority,false);assert.equal(affectsMembers({changes:appearance}),false);assert.equal(affectsInbox({changes:appearance}),false)
 next.sessions[0].lastReply={id:'new'};assert.equal(affectsInbox({changes:storeChanges(original,next)}),true);assert.equal(affectsMembers({}),true);assert.equal(storeChanges(original,{...original,sessions:[]}).authority,true)
 checks.push('Appearance and exact-reply reading do not trigger authority work; role, team, native binding, deletion and unknown future execution fields always do')
 for(const kind of ['employee','group','channel']){const old={text:'Actual task',clientMessageId:'accepted',viewId:'view-a',mentions:['reader']};const retry=reuseDraft({...old,text:' Actual task  '},old,kind);assert.equal(retry.clientMessageId,'accepted');assert.equal(retry.viewId,'view-a');assert.notEqual(reuseDraft({...old,text:'New task'},old,kind).clientMessageId,'accepted');assert.equal(draftContent(old,kind),draftContent({...old,updatedAt:999,clientMessageId:'irrelevant'},kind))}
 const cycles=[];let gate;const refresh=createRefreshQueue(async(...flags)=>{cycles.push(flags);if(cycles.length===1)await new Promise(resolve=>gate=resolve)})
 const pending=refresh(true,false,false);await Promise.resolve();refresh(false,false,false);refresh(false,true,true);gate();await pending;assert.deepEqual(cycles,[[true,false,false],[false,true,true]])
 checks.push('All composers preserve accepted request identity and view on whitespace retries; refresh coalescing separately tracks configuration, detail and execution state')
 const out=root+'/artifacts/slimming-final';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/domain-contracts.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS '+checks.join('; '))
}finally{fs.rmSync(temp,{recursive:true,force:true})}
