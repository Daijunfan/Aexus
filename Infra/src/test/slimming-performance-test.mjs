// Repeatable read-path baseline: actual Core modules, disposable data, no engine or network.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {performance} from 'node:perf_hooks'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url)
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-slim-read-')),home=path.join(temp,'state')
const phase=process.env.SLIMMING_PHASE??'after',out=path.join(root,'.aexus/artifacts/slimming')
fs.mkdirSync(home,{recursive:true});fs.mkdirSync(out,{recursive:true})
Object.assign(process.env,{AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PACKAGE_ROOT:root,AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'Infra/src/resources/plugins'),AGENTS_COMPANY_PLUGIN_DIRS:''})
const cards=Array.from({length:6},(_,i)=>({id:'s_read_'+i,title:'Reviewer '+i,group:'Review',engine:'codex',kind:'worker',cwd:path.join(temp,'work',String(i)),managementRole:'employee',createdAt:Date.now()}))
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({revision:1,sessions:cards,groups:['Review'],rooms:{},teamRoots:{Review:path.join(temp,'work')}}))
fs.mkdirSync(path.join(home,'transcripts'))
for(const card of cards){
 const items=Array.from({length:1000},(_,i)=>({id:card.id+'_m_'+i,role:'assistant',createdAt:Date.now()-100000+i,blocks:[{kind:'text',text:`Review ${i}: ${i%10===0?'needle evidence':'routine check'}; `+'source facts and bounded next steps. '.repeat(5)},{kind:'thinking',text:'INTERNAL_NOT_PUBLIC',done:true}]}))
 fs.writeFileSync(path.join(home,'transcripts',card.id+'.json'),JSON.stringify(items))
}
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'core.cjs')
await build({stdin:{contents:"export {readApiDocument} from './Infra/src/main/api-documents'; export {messengerRequest} from './Infra/src/main/messenger'; export {operatorContext,withCaller} from './Infra/src/main/authorization'; export {closeMessageIndex} from './Infra/src/main/message-index-client'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,alias:{'@anthropic-ai/claude-agent-sdk':sdk},external:[sdk,'electron'],logLevel:'silent'})
const core=require(bundle),api=(cmd,args={})=>core.withCaller(core.operatorContext(),()=>core.messengerRequest(cmd,args))
const originals={readFileSync:fs.readFileSync,writeFileSync:fs.writeFileSync,fsyncSync:fs.fsyncSync}
let reads=0,writes=0,bytes=0
const measure=async(name,run,count=20)=>{
 await run();reads=0;writes=0;bytes=0
 fs.readFileSync=function(...args){reads++;const result=originals.readFileSync(...args);bytes+=typeof result==='string'?Buffer.byteLength(result):result.byteLength;return result}
 fs.writeFileSync=function(...args){writes++;return originals.writeFileSync(...args)}
 const times=[]
 try{for(let i=0;i<count;i++){const before=performance.now();await run();times.push(performance.now()-before)}}finally{Object.assign(fs,originals)}
 times.sort((a,b)=>a-b)
 return {name,iterations:count,medianMs:times[Math.floor(count/2)],p95Ms:times[Math.min(count-1,Math.floor(count*.95))],mainThreadFileReads:reads,mainThreadReadBytes:bytes,mainThreadFileWrites:writes}
}
try{
 const documents=await measure('shared documentation index',()=>assert.equal(core.readApiDocument().document,'index'))
 const search=await measure('search 6000 private messages',async()=>{const data=await api('messenger.search',{query:'needle',limit:50});assert.equal(data.total,600);assert.equal(data.messages.length,50);assert.ok(data.messages.every(m=>!m.text.includes('INTERNAL_NOT_PUBLIC')))})
 const first=(await api('messenger.search',{query:'needle',limit:1})).messages[0]
 api('messenger.message',{conversation:first.conversation,id:first.id,patch:{hidden:true}})
 assert.equal((await api('messenger.search',{query:'needle'})).total,599)
 api('messenger.message',{conversation:first.conversation,id:first.id,patch:{hidden:false}})
 assert.equal((await api('messenger.search',{query:'needle'})).total,600)
 const file=path.join(home,'transcripts',cards[0].id+'.json'),items=JSON.parse(fs.readFileSync(file,'utf8'))
 items.push({id:'newest',role:'user',createdAt:Date.now(),text:'needle external append',author:{kind:'operator'}})
 fs.writeFileSync(file+'.new',JSON.stringify(items));fs.renameSync(file+'.new',file)
 assert.equal((await api('messenger.search',{query:'needle'})).total,601)
 const record={phase,workload:{employees:6,privateMessages:6000},documents,search,checks:['public-text-only','hide/unhide visible immediately','atomic external append visible immediately'],modelCalls:0}
 fs.writeFileSync(path.join(out,phase+'-performance.json'),JSON.stringify(record,null,2))
 console.log(JSON.stringify(record,null,2))
}finally{Object.assign(fs,originals);await core.closeMessageIndex();fs.rmSync(temp,{recursive:true,force:true})}
