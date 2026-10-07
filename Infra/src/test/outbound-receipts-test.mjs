// Real Core/adapter event paths with deterministic native protocol fixtures only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-outbound-receipts-')),run=promisify(execFile),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 const unit=path.join(temp,'transcript.cjs')
 await build({stdin:{contents:`import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {restoreTranscript,recordUser,recordOutboundReceipt,transcriptItems,saveTranscript} from './Infra/src/main/transcripts';restoreTranscript('live','card','codex');const first=recordUser('live','first',[],undefined,{kind:'operator'},[],'task-first'),legacy=recordUser('live','legacy');saveTranscript('live');const file=path.join(process.env.AGENTS_COMPANY_HOME,'transcripts/card.json');let bytes=fs.readFileSync(file,'utf8');assert.equal(recordOutboundReceipt('live','unmatched','read'),false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(recordOutboundReceipt('live','task-first','delivered'),true);const delivered=transcriptItems('live')[0].outbound;bytes=fs.readFileSync(file,'utf8');assert.equal(recordOutboundReceipt('live','task-first','delivered'),false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(recordOutboundReceipt('live','task-first','read'),true);const read=transcriptItems('live')[0].outbound;assert.equal(read.deliveredAt,delivered.deliveredAt);assert.ok(read.readAt>=read.deliveredAt);bytes=fs.readFileSync(file,'utf8');assert.equal(recordOutboundReceipt('live','task-first','read'),false);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(transcriptItems('live')[1].outbound,undefined);assert.equal(transcriptItems('live')[0].id,first.id);assert.equal(transcriptItems('live')[1].id,legacy.id);restoreTranscript('reopened','card','codex');assert.deepEqual(transcriptItems('reopened')[0].outbound,read);`,resolveDir:root,loader:'ts'},outfile:unit,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'})
 await run(process.execPath,[unit],{env:{...process.env,AGENTS_COMPANY_HOME:path.join(temp,'unit-state')}})

 const codex=path.join(temp,'codex.cjs'),processFixture=path.join(temp,'process.cjs'),claude=path.join(temp,'claude.mjs')
 let codexSource=fs.readFileSync(path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),'utf8')
 codexSource=codexSource.replace("note(hidden?'initializing':'user',{thread,turn,text,cwd,model:p.model})", "note(hidden?'initializing':'user',{thread,turn,text,cwd,model:p.model});if(text.includes('REJECT_RECEIPT')){send({id:request.id,error:{code:-32000,message:'Native rejected input'}});return}")
 codexSource=codexSource.replace("event('turn/started',{threadId:thread,turn:{id:turn}})", "event('turn/started',{threadId:thread,turn:{id:turn}});if(text.includes('WRONG_TURN'))event('item/agentMessage/delta',{threadId:thread,turnId:'unrelated-turn',itemId:'other',delta:'Unrelated native turn'})")
 fs.writeFileSync(codex,codexSource,{mode:0o755})
 let processSource=fs.readFileSync(path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),'utf8')
 processSource=processSource.replace("if(text.includes('HOLD_FIXTURE'))return", "if(text.includes('HOLD_RECEIPT')){timer=setInterval(()=>{if(fs.existsSync(path.join(process.env.AC_INIT_FIXTURE,process.env.AGENTS_COMPANY_EMPLOYEE+'.receipt-release')))finish('Received and processed')},20);return};if(text.includes('HOLD_FIXTURE'))return")
 fs.writeFileSync(processFixture,processSource,{mode:0o755})
 fs.writeFileSync(claude,`import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
 export function query({prompt,options}){
  let closed=false,interrupted=false;const sessionId=randomUUID(),employee=options.env?.AGENTS_COMPANY_EMPLOYEE??'catalog';
  const q=(async function*(){yield {type:'system',subtype:'init',session_id:sessionId,model:'fixture-claude',slash_commands:[]};for await(const input of prompt){if(closed)return;interrupted=false;const text=typeof input.message.content==='string'?input.message.content:input.message.content.map(part=>part.text??'').join(''),uuid=input.uuid;fs.writeFileSync(path.join(process.env.AC_INIT_FIXTURE,employee+'.native-input.json'),JSON.stringify({uuid,text}));yield {type:'user',isReplay:true,uuid,session_id:sessionId,parent_tool_use_id:null,message:input.message};
   if(text.includes('FAIL_RECEIPT')){yield {type:'assistant',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,error:'authentication_failed',message:{content:[{type:'text',text:'Synthetic API error'}]}};yield {type:'result',subtype:'error_during_execution',is_error:true,errors:['Synthetic API error'],session_id:sessionId,user_message_uuid:uuid};continue}
   if(text.includes('WRONG_UUID'))yield {type:'assistant',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:randomUUID(),message:{content:[{type:'text',text:'Unrelated native input'}]}};
   if(text.includes('HOLD_RECEIPT'))while(!closed&&!interrupted&&!fs.existsSync(path.join(process.env.AC_INIT_FIXTURE,employee+'.receipt-release')))await new Promise(resolve=>setTimeout(resolve,20));if(closed)return;
   if(!interrupted){yield {type:'stream_event',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,user_message_uuids:[uuid],event:{type:'message_start',message:{id:randomUUID(),role:'assistant',content:[]}}};yield {type:'assistant',uuid:randomUUID(),session_id:sessionId,parent_tool_use_id:null,user_message_uuid:uuid,message:{content:[{type:'text',text:'Received and processed'}]}}}
   yield {type:'result',subtype:interrupted?'error_during_execution':'success',is_error:interrupted,errors:interrupted?['Interrupted']:[],session_id:sessionId,user_message_uuid:uuid};
  }})();Object.assign(q,{supportedCommands:async()=>[],supportedModels:async()=>[{value:'fixture-claude',displayName:'Fixture'}],close:()=>{closed=true},interrupt:async()=>{interrupted=true},setModel:async()=>{},setPermissionMode:async()=>{},setMaxThinkingTokens:async()=>{},applyFlagSettings:async()=>{}});return q
 }
 `)
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},plugins:[{name:'fixture-claude-sdk',setup(build){build.onLoad({filter:/src\/main\/engines\/claude-sdk\.ts$/},()=>({contents:`export function claudeSdkPath(){return ${JSON.stringify(claude)}};export function exposeClaudeSdk(){};export async function loadClaudeSdk(){return import(${JSON.stringify('file://'+claude)})}`,loader:'ts'}))}}],logLevel:'silent'})
 f=await fixtureCore({CODEX_BIN:codex,CLINE_BIN:processFixture,PI_BIN:processFixture,CLAUDE_BIN:processFixture,ANTHROPIC_API_KEY:'fixture-only-no-network',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CONFIG_DIR:path.join(temp,'claude-profile')},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const item=async(employee,taskId)=>(await rpc('session.transcript',{employee})).items.find(value=>value.role==='user'&&value.outbound?.taskId===taskId)
 const idle=employee=>f.until(async()=>!(await f.status(employee)).busy,'turn completes')
 await f.cli('group','add','Receipt Studio');const saved=[]
 for(const engine of ['codex','cline','pi','claude']){
  if(['cline','pi'].includes(engine))await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  const card=await rpc('card.create',{title:engine,group:'Receipt Studio',engine,model:engine==='codex'?'gpt-6-luna':engine==='claude'?'fixture-claude':'deepseek-flash'}),release=path.join(f.control,card.id+'.receipt-release'),hold=path.join(f.control,card.id+'.hold-user'),stream=path.join(f.control,card.id+'.stream.txt')
  if(engine==='codex')fs.writeFileSync(hold,'')
  const sent=await rpc('session.send',{employee:card.id,text:engine==='codex'?'WRONG_TURN HOLD_RECEIPT':engine==='claude'?'WRONG_UUID HOLD_RECEIPT':'HOLD_RECEIPT'})
  await f.until(async()=>!!await item(card.id,sent.messageId),'outgoing task is persisted')
  if(engine==='cline')assert.equal((await item(card.id,sent.messageId)).outbound.deliveredAt,undefined,'Cline end-of-turn ACP has no early native acceptance')
  else await f.until(async()=>!!(await item(card.id,sent.messageId)).outbound.deliveredAt,'native acceptance')
  assert.equal((await item(card.id,sent.messageId)).outbound.readAt,undefined,engine+' must not claim read from optimistic start or unrelated native output')
  if(engine==='claude'){const input=JSON.parse(fs.readFileSync(path.join(f.control,card.id+'.native-input.json'),'utf8'));assert.match(input.uuid,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);assert.notEqual(input.uuid,sent.messageId)}
  if(engine==='codex')fs.writeFileSync(stream,'First matching native output');else fs.writeFileSync(release,'')
  await f.until(async()=>!!(await item(card.id,sent.messageId)).outbound.readAt,'matching processing evidence')
  const processed=await item(card.id,sent.messageId);assert.ok(processed.outbound.readAt>=processed.outbound.deliveredAt)
  if(engine==='codex')fs.unlinkSync(hold)
  await idle(card.id);assert.deepEqual((await item(card.id,sent.messageId)).outbound,processed.outbound,'later output cannot rewrite receipt timestamps')
  const failed=await rpc('session.send',{employee:card.id,text:engine==='codex'?'REJECT_RECEIPT':engine==='claude'?'FAIL_RECEIPT':'FAIL_FIXTURE'});await idle(card.id)
  const failedItem=await item(card.id,failed.messageId);assert.equal(failedItem.outbound.readAt,undefined,engine+' failure is not proof of reading')
  if(['codex','cline'].includes(engine))assert.equal(failedItem.outbound.deliveredAt,undefined)
  else assert.ok(failedItem.outbound.deliveredAt,'native acceptance may precede a later failure')
  assert.deepEqual((await item(card.id,sent.messageId)).outbound,processed.outbound)
  saved.push({employee:card.id,taskId:sent.messageId,receipt:processed.outbound})
  console.log('PASS '+engine+' exact outgoing receipt correlation and error boundary')
 }
 const codexCard=saved[0].employee,previous=(await f.status(codexCard)).lastReply;assert.ok(previous)
 await rpc('session.acknowledge',{employee:codexCard,replyId:previous.id});const inbound=(await f.status(codexCard)).lastReply
 fs.writeFileSync(path.join(f.control,codexCard+'.hold-user'),'');fs.rmSync(path.join(f.control,codexCard+'.stream.txt'),{force:true})
 const next=await rpc('session.send',{employee:codexCard,text:'Keep inbound read metadata separate'});await f.until(async()=>!!(await item(codexCard,next.messageId)).outbound.deliveredAt,'next delivery');assert.deepEqual((await f.status(codexCard)).lastReply,inbound)
 fs.writeFileSync(path.join(f.control,codexCard+'.stream.txt'),'New matching native output');await f.until(async()=>!!(await item(codexCard,next.messageId)).outbound.readAt,'next processing');assert.deepEqual((await f.status(codexCard)).lastReply,inbound)
 fs.unlinkSync(path.join(f.control,codexCard+'.hold-user'));await idle(codexCard)
 await f.stop();await f.start();for(const snapshot of saved)assert.deepEqual((await item(snapshot.employee,snapshot.taskId)).outbound,snapshot.receipt,'receipts survive Core restart')
 console.log('PASS outgoing receipts: exact task/native correlation, first-write durability, legacy unknown, no startup/error/read fabrication, inbound receipt independence and restart persistence; deterministic fixtures only')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
