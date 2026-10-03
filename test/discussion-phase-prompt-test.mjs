// Phase projections over temporary real stores; no engine or provider is started.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-phase-prompts-')),home=path.join(temp,'home'),entry=path.join(temp,'test.cjs'),previous=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=home;fs.mkdirSync(home);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let core
try{
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({sessions:[{id:'reader',title:'Reader',engine:'codex',kind:'worker',group:'Studio',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:'employee'}],groups:['Studio'],rooms:{}}))
 await build({stdin:{contents:"export * from './src/main/chat-groups';export * from './src/main/channels';export {channelTaskPrompt,recordChannelDelivery} from './src/main/channel-discussion';export {run,all} from './src/main/channel-store';export {withCaller,operatorContext} from './src/main/authorization'",resolveDir:root,sourcefile:'phase-prompt-entry.ts'},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=createRequire(import.meta.url)(entry)
 const op=fn=>core.withCaller(core.operatorContext(),fn),delegation={requestedBy:{kind:'operator'},requestId:'fixture'},metadata=prompt=>JSON.parse(prompt.split('\n')[1])
 const group=op(()=>core.createChatGroup({name:'Real group identity',members:['reader']})),file=path.join(home,'chats',group.id+'.json')
 const original={id:'gm_original',sequence:1,createdAt:100,author:{kind:'agent',employeeId:'reader'},authorName:'Reader',text:'Original reply text 中文',kind:'summary',mentions:[],deliveries:[]}
 const request={id:'gm_request',sequence:2,createdAt:200,author:{kind:'operator'},authorName:'You',text:'Stored request',kind:'message',mentions:['reader'],replyTo:original.id,deliveries:[{employeeId:'reader',mode:'work',status:'running'}]}
 fs.writeFileSync(file,JSON.stringify([original,request]));const groupContext={groupId:group.id,messageId:request.id},accepted='Accepted original request',groupReading=op(()=>core.chatTaskPrompt(groupContext,'reader',delegation,accepted,true)),groupWork=op(()=>core.chatTaskPrompt(groupContext,'reader',delegation,accepted))
 assert.deepEqual(metadata(groupReading),metadata(groupWork));assert.equal(metadata(groupReading).reply.text,original.text);assert.deepEqual(metadata(groupReading).author,request.author);assert.equal(metadata(groupReading).createdAt,request.createdAt);assert.equal(metadata(groupReading).acknowledgment.mode,'work');assert.equal(groupReading.split('\n').slice(2).join('\n'),accepted)
 assert.ok(!groupReading.includes('[Group reporting]')&&!groupReading.includes('agents chat context')&&!groupReading.includes('agents chat post'));assert.ok(groupWork.startsWith(groupReading+'\n\n[Group reporting]'));assert.match(groupWork,/agents chat post/)

 const channel=(command,args={})=>op(()=>core.channelRequest('channel.'+command,args)),source=channel('source-add',{plugin:'x',locator:'phase_fixture'}),news=channel('publish',{sourceId:source.id,externalId:'news',publishedAt:Date.now(),title:'Real news title',body:'Complete source text 中文\nTAIL',authorName:'Original author',url:'https://example.test/news'})
 const question=channel('message-post',{id:source.channelId,text:'What does this news say?',kind:'message',replyTo:news.id,clientMessageId:'question'})
 channel('update',{id:source.channelId,adminIds:['reader']})
 for(const [id,kind,mode] of [[news.id,'news','awareness'],[question.id,'message','work']])core.run("INSERT INTO channel_deliveries(channel_id,entry_id,kind,employee_id,mode,status) VALUES(?,?,?,?,?,'running')",source.channelId,id,kind,'reader',mode)
 const before=core.all('SELECT * FROM channel_deliveries')
 for(const [entryId,text,mode] of [[news.id,'[News reference]','awareness'],[question.id,question.text,'work']]){
  const context={channelId:source.channelId,entryId},reading=op(()=>core.channelTaskPrompt(context,'reader',delegation,text,true)),work=op(()=>core.channelTaskPrompt(context,'reader',delegation,text)),readData=metadata(reading),{history,...workData}=metadata(work)
  assert.deepEqual(readData,workData);assert.equal(readData.history,undefined);assert.equal(readData.mode,mode);assert.equal(reading.split('\n').length,2,'ACK accepted content has only its header and authentic context')
  assert.ok(!reading.includes('channel.timeline')&&!reading.includes('agents channel context')&&!reading.includes('agents channel message-post'));assert.equal(history.args.beforeEntry,entryId);assert.match(work,/--kind news --before-entry/);assert.match(work,/--cursor NEXT_CURSOR/)
  const post=entryId===news.id?readData.source:readData.reply.post;assert.equal(post.body,'Complete source text 中文\nTAIL');assert.equal(post.authorName,'Original author');assert.equal(post.url,'https://example.test/news')
 }
 assert.deepEqual(core.all('SELECT * FROM channel_deliveries'),before);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),[original,request])
 const reader=fn=>core.withCaller({principal:{kind:'agent',employeeId:'reader'},requestId:'explicit-receipt'},fn)
 // Simulate the Core's successful native completion, never an Agent null post.
 core.updateChatDelivery('reader',groupContext,{deliveredAt:200,readAt:201});core.recordChannelDelivery('reader',{channelId:source.channelId,entryId:question.id},{deliveredAt:200,readAt:201})
 assert.equal(metadata(op(()=>core.chatTaskPrompt(groupContext,'reader',delegation,accepted))).acknowledgment.acknowledged,true)
 const acknowledged=metadata(op(()=>core.channelTaskPrompt({channelId:source.channelId,entryId:question.id},'reader',delegation,question.text))).acknowledgment
 assert.equal(acknowledged.acknowledged,true);assert.equal(typeof acknowledged.readAt,'number','formal context reflects the explicit receipt rather than inviting a second ACK')
 console.log('PASS group/channel ACK projections preserve authentic context without response/history instructions or writes; formal prompts retain guidance and show acknowledged:true after native completion receipts; no engines')
}finally{core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
