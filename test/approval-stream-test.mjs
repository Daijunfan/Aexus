import {build} from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-input-stream-'))
try{
 await build({entryPoints:['src/main/approvals.ts','src/shared/transcript.ts','src/main/external.ts'],outdir:temp,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const a=require(path.join(temp,'main/approvals.js')),t=require(path.join(temp,'shared/transcript.js')),external=require(path.join(temp,'main/external.js')),signal=new AbortController(),handler=a.nativeRequestHandler('employee',()=>{},true)
 let pending=handler('tool/requestUserInput',{questions:[{id:'q',question:'Choose',options:[{label:'A'},{label:'B'}]}]},signal.signal),row=a.approvalsFor('employee')[0]
 assert.throws(()=>a.answerApproval('other',row.id,true,{q:['A']}));assert.throws(()=>a.answerApproval('employee',row.id,true,{}));a.answerApproval('employee',row.id,true,{q:['A']});assert.deepEqual(await pending,{answers:{q:{answers:['A']}}})
 pending=handler('mcpServer/elicitation/request',{serverName:'fixture',mode:'form',message:'Details',requestedSchema:{type:'object',required:['name'],properties:{name:{type:'string'}}}},signal.signal);row=a.approvalsFor('employee')[0];assert.throws(()=>a.answerApproval('employee',row.id,true,{},{}));a.answerApproval('employee',row.id,true,{}, {name:'value'});assert.equal((await pending).content.name,'value')
 assert.deepEqual(await a.nativeRequestHandler('scoped',()=>{},false)('item/permissions/requestApproval',{permissions:{network:{enabled:true}}},signal.signal),{permissions:{},scope:'turn'})
 pending=handler('tool/requestUserInput',{questions:[{id:'q',question:'Cancelled'}]},signal.signal);signal.abort();assert.deepEqual(await pending,{answers:{}});assert.equal(a.approvalsFor('employee').length,0)
 const sdk=a.approvalHandler('claude',()=>{}),controller=new AbortController();const answer=sdk('AskUserQuestion',{questions:[{question:'Pick one',options:[{label:'A'}]}]},{signal:controller.signal,toolUseID:'tool'});row=a.approvalsFor('claude')[0];a.answerApproval('claude',row.id,true,{'Pick one':['A']});assert.equal((await answer).updatedInput.answers['Pick one'],'A')
 let state={items:[]};state=t.applyCodex(state,{kind:'text-delta',id:'turn:message',text:'one '});state=t.applyCodex(state,{kind:'text-delta',id:'turn:message',text:'two'});state=t.applyCodex(state,{kind:'text',id:'turn:message',text:'one two'});assert.equal(state.items[0].blocks.length,1);assert.equal(state.items[0].blocks[0].text,'one two')
 const markdown='## Claude summary\n\n- **ready**\n\n```sh\npwd\n```',claude=t.apply({items:[]},{type:'assistant',message:{content:[{type:'text',text:markdown}]}});assert.equal(claude.items[0].blocks[0].text,markdown)
 state=t.applyCodex(state,{kind:'tool-start',id:'turn:command',command:'long process'});state.items.push({role:'user',id:'next',text:'next turn'});state=t.applyCodex(state,{kind:'tool-delta',id:'turn:command',output:'late output'});assert.equal(state.items.at(-1).role,'user');assert.equal(state.items[0].blocks[1].result,'late output')
 assert.equal((await external.openExternalUrl('https://example.com')).opened,false);await assert.rejects(()=>external.openExternalUrl('javascript:alert(1)'))
 console.log('PASS scoped native/SDK answers, MCP forms, cancellation, streamed final deduplication, late tool output routing and headless URLs')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
