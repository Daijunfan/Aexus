// Upgrade repair: exact shared-task/answer digest only, never guessed human reading or deleted history.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-shared-reply-')),home=path.join(temp,'home'),entry=path.join(temp,'core.cjs'),previous=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=home;fs.mkdirSync(path.join(home,'transcripts'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let core
const digest=(task,item,text)=>createHash('sha256').update(JSON.stringify([task,item,text])).digest('hex')
try{
 const ids=['group-old','channel-old','private-real','unknown-source','already-read','missing-history'],cards=ids.map(id=>({id,title:id,group:'Studio',engine:'codex',kind:'worker',cwd:path.join(temp,id),createdAt:1,managementRole:'employee',initialization:{status:'ready'},lastReply:{id:digest(id==='private-real'?'private-task':id,'answer-'+id,'Reply '+id),itemId:'answer-'+id,text:'Reply '+id,createdAt:123,...(id==='already-read'?{readAt:124}:{})}}))
 cards.find(c=>c.id==='unknown-source').lastReply.id='unknown-old-receipt'
 for(const card of cards)if(card.id!=='missing-history')fs.writeFileSync(path.join(home,'transcripts',card.id+'.json'),JSON.stringify([{role:'user',id:'user-'+card.id,text:'Original user request',outbound:{taskId:card.id==='private-real'?'private-task':card.id}},{role:'assistant',id:'answer-'+card.id,blocks:[{kind:'text',text:'Reply '+card.id}]}]))
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({revision:1,sessions:cards,groups:['Studio'],rooms:{}}))
 await build({stdin:{contents:"export {repairSharedReplyReceipts} from './Infra/src/main/reply-receipts';export {readStore} from './Infra/src/main/store';export {createChatGroup} from './Infra/src/main/chat-groups';export {channelRequest} from './Infra/src/main/channels';export {run,closeChannelStore} from './Infra/src/main/channel-store';export {operatorContext,withCaller} from './Infra/src/main/authorization'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=createRequire(import.meta.url)(entry);const op=fn=>core.withCaller(core.operatorContext(),fn),group=op(()=>core.createChatGroup({name:'Old shared records',members:ids})),channel=op(()=>core.channelRequest('channel.create',{name:'Old channel',engine:{kind:'employees',employeeIds:['channel-old']}}))
 const groupFile=path.join(home,'chats',group.id+'.json'),message={id:'gm_old',sequence:1,createdAt:120,author:{kind:'operator'},text:'Prior group task',mentions:[],deliveries:ids.filter(id=>id!=='channel-old').map(employeeId=>({employeeId,mode:'work',status:'completed',taskId:employeeId})),kind:'message',clientMessageId:'old',fingerprint:'old'}
 fs.writeFileSync(groupFile,JSON.stringify([message]));core.run("INSERT INTO channel_deliveries(channel_id,entry_id,kind,employee_id,mode,status,task_id) VALUES(?,?,'message','channel-old','work','completed','channel-old')",channel.id,'cm_old')
 const histories=new Map(fs.readdirSync(path.join(home,'transcripts')).map(name=>[name,fs.readFileSync(path.join(home,'transcripts',name),'utf8')])),groupBefore=fs.readFileSync(groupFile,'utf8'),before=core.readStore().sessions
 core.repairSharedReplyReceipts();const repaired=core.readStore().sessions
 for(const id of ['group-old','channel-old'])assert.equal(repaired.find(c=>c.id===id).lastReply,undefined,id)
 for(const id of ['private-real','unknown-source','already-read','missing-history'])assert.deepEqual(repaired.find(c=>c.id===id).lastReply,before.find(c=>c.id===id).lastReply,id)
 for(const [name,text] of histories)assert.equal(fs.readFileSync(path.join(home,'transcripts',name),'utf8'),text)
 assert.equal(fs.readFileSync(groupFile,'utf8'),groupBefore)
 const persisted=fs.readFileSync(path.join(home,'sessions.json'),'utf8');core.repairSharedReplyReceipts();assert.equal(fs.readFileSync(path.join(home,'sessions.json'),'utf8'),persisted,'second recovery performs no write')
 console.log('PASS exact old group/channel false unread repaired; genuine private, already-read, unknown/missing evidence retained; histories unchanged; recovery idempotent')
}finally{core?.closeChannelStore();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
