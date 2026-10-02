// Real Core plus deterministic ACP/MCP: gateway thoughts remain private and do not bypass ACK authority.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-cline-runtime-provider-')),entry=path.join(temp,'daemon.cjs'),fixture=path.join(temp,'cline.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 let source=fs.readFileSync(path.join(root,'test/fixtures/process-adapter.cjs'),'utf8')
 source=source.replace("const models=()=>({models:{currentModelId:'deepseek-flash',availableModels:[{modelId:'deepseek-flash',name:'DeepSeek Flash'}", "const models=()=>({models:{currentModelId:process.env.CLINE_MODEL||'deepseek-flash',availableModels:[{modelId:process.env.CLINE_MODEL||'deepseek-flash',name:'Configured model'}")
 source=source.replace(" if(text.includes('HOLD_FIXTURE'))return", " if(text.includes('GATEWAY_REASONING_FIXTURE'))update({sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'PRIVATE_GATEWAY_REASONING'}})\n if(text.includes('HOLD_FIXTURE'))return")
 fs.writeFileSync(fixture,source,{mode:0o755})
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({CLINE_BIN:fixture,AC_CHAT_ACK_MANUAL:'1'},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await rpc('engine.configure',{engine:'cline',patch:{apiKey:'fixture-key-not-real',baseUrl:'http://127.0.0.1:9/v1',model:'deepseek-v4-flash'}})
 await f.cli('group','add','Gateway fixtures')
 const create=async title=>{const card=await f.cli('card','create','--title',title,'--group','Gateway fixtures','--engine','cline');await f.ready(card.id);return card}
 const card=await create('Configured Cline'),idle=()=>f.until(async()=>!(await f.status(card.id)).busy,'gateway turn completes')
 assert.equal(card.model,'deepseek-v4-flash')
 await rpc('session.send',{employee:card.id,text:'GATEWAY_REASONING_FIXTURE'});await idle()
 const transcript=await rpc('session.transcript',{employee:card.id}),thinking=transcript.items.flatMap(item=>item.blocks??[]).filter(block=>block.kind==='thinking')
 assert.ok(thinking.some(block=>block.text==='PRIVATE_GATEWAY_REASONING'))
 assert.ok(!JSON.stringify(transcript.items.flatMap(item=>item.blocks??[]).filter(block=>block.kind==='text')).includes('PRIVATE_GATEWAY_REASONING'))
 const snapshot=await rpc('session.snapshot',{id:(await f.status(card.id)).sessionId});assert.ok(!snapshot.error);assert.equal(snapshot.thinkingManaged,true)
 for(const enabled of [false,true]){const result=await f.request(null,'config.thinking',{id:(await f.status(card.id)).sessionId,enabled});assert.equal(result.ok,false);assert.match(result.error,/Reasoning is controlled by this Cline provider/)}
 const group=await rpc('chat.create',{name:'Gateway shared discussion',members:[card.id]}),control=suffix=>path.join(f.control,card.id+suffix)
 fs.writeFileSync(control('.ack-thinking.txt'),'HIDDEN_ACK_GATEWAY_THOUGHT');fs.writeFileSync(control('.ack-output.txt'),'PRIVATE_PLAIN_NOT_A_PUBLIC_POST')
 const send=text=>rpc('chat.send',{id:group.id,text,mentions:[card.id],clientMessageId:text}),history=()=>rpc('chat.history',{id:group.id,limit:100})
 const failed=await send('No implicit publication')
 const failedDelivery=await f.until(async()=>{const message=(await history()).messages.find(message=>message.id===failed.id);return message.deliveries[0].status==='failed'&&message.deliveries[0]},'unconfirmed gateway acknowledgment fails')
 assert.equal(failedDelivery.readAt,undefined);assert.match(failedDelivery.error,/not acknowledged through its tool\/API/)
 assert.equal((await history()).messages.length,1)
 await idle();fs.writeFileSync(control('.ack-tool.json'),JSON.stringify({text:null}))
 const confirmed=await send('ACK_TOOL_FIXTURE explicit native confirmation')
 const delivery=await f.until(async()=>{const message=(await history()).messages.find(message=>message.id===confirmed.id);return message.deliveries[0].status==='completed'&&message.deliveries[0]},'explicit gateway ACK permits formal work')
 assert.ok(delivery.readAt);assert.equal(delivery.ackMessageId,undefined);assert.equal((await history()).messages.length,2)
 assert.equal(JSON.parse(fs.readFileSync(control('-ack-tool-result.json'))).allowed,false)
 assert.ok(!fs.existsSync(path.join(card.cwd,'ack-forbidden.txt')))
 assert.ok(!JSON.stringify((await rpc('session.transcript',{employee:card.id})).items).includes('HIDDEN_ACK_GATEWAY_THOUGHT'))
 console.log('PASS gateway private thinking; hidden ACK remains private, requires its real MCP API and rejects ordinary writes')

 await rpc('engine.configure',{engine:'cline',patch:{baseUrl:'',model:''}})
 const official=await create('Official Cline')
 await rpc('session.send',{employee:official.id,text:'GATEWAY_REASONING_FIXTURE'})
 await f.until(async()=>!(await f.status(official.id)).busy,'official provider strict off')
 const officialSnapshot=await rpc('session.snapshot',{id:(await f.status(official.id)).sessionId});assert.equal(officialSnapshot.thinkingManaged,false);assert.match(officialSnapshot.error,/reasoning despite Thinking off/)
 console.log('PASS official DeepSeek still rejects unexpected reasoning; no real models, requests or user state')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
