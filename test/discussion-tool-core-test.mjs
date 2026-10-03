// Scoped public intent only: temporary stores and real handlers/MCP, no model process.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-post-tool-')),home=path.join(temp,'home'),entry=path.join(temp,'test.cjs'),previous=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=home;fs.mkdirSync(home);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let core,transport
try{
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({sessions:[{id:'peer',title:'Peer',engine:'codex',kind:'worker',group:'Studio',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:'employee'},{id:'reader',title:'Reader',engine:'codex',kind:'worker',group:'Studio',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:'employee'}],groups:['Studio'],rooms:{}}))
 await build({stdin:{contents:"export * from './src/main/discussion-tool';export * from './src/main/discussion-mcp';export * from './src/main/chat-groups';export * from './src/main/channels';export {run} from './src/main/channel-store';export {revokeAgentCredential} from './src/main/agent-access';export {withCaller,operatorContext} from './src/main/authorization'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=createRequire(import.meta.url)(entry);const op=fn=>core.withCaller(core.operatorContext(),fn),group=op(()=>core.createChatGroup({name:'Scoped response',members:['reader','peer'],ownerId:'peer'})),file=path.join(home,'chats',group.id+'.json')
 const base=index=>({id:'gm_fixture_'+index,sequence:index,createdAt:Date.now(),author:{kind:'operator'},authorName:'You',text:'User request '+index,kind:'message',mentions:['reader'],deliveries:[{employeeId:'reader',mode:'work',status:'running',deliveredAt:100,readAt:101}],clientMessageId:'user-'+index,fingerprint:'fixture'})
 fs.writeFileSync(file,JSON.stringify(Array.from({length:12},(_,i)=>base(i+1))))
 const history=()=>op(()=>core.chatHistory({id:group.id,limit:100})),state={cardId:'reader',acknowledging:false,running:true},context=index=>({groupId:group.id,messageId:'gm_fixture_'+index})
 const bind=(ctx,index)=>{state.currentTask={messageId:'task-'+index,startedAt:Date.now(),chat:ctx,delegation:{requestedBy:{kind:'operator'},requestId:'request-'+index}};return core.openDiscussionTool(state,ctx)}
 const input=(index,text)=>({conversationType:'group',conversationId:group.id,messageId:'gm_fixture_'+index,text}),call=(index,text,id='tool-'+index)=>core.invokeDiscussionTool(state,input(index,text),id),record=index=>history().messages.find(m=>m.id==='gm_fixture_'+index).deliveries[0]
 let close=bind(context(1),1)
 for(const text of [null,undefined,'',' ','null','None','undefined'])await assert.rejects(call(1,text),/nonempty/)
 await assert.rejects(call(2,'Wrong destination'),/target does not match/);await assert.rejects(core.invokeDiscussionTool(state,{...input(1,'Hi'),command:'session.send'},'extra'),/Provide conversationType/)
 assert.equal(history().messages.length,12);assert.equal(record(1).ackMessageId,undefined)
 const published=await call(1,'A deliberate response.');assert.equal(published.author.employeeId,'reader');assert.equal(published.acknowledgmentOf,undefined);assert.equal(published.text,'A deliberate response.');assert.equal(history().messages.length,13)
 assert.deepEqual(await call(1,'A deliberate response.','retry'),published);await assert.rejects(call(1,'Another tool response'),/already posted/);assert.equal(history().messages.length,13);close();await assert.rejects(call(1,'Late'),/outside the active/)
 close=bind(context(2),2);state.acknowledging=true;await assert.rejects(call(2,'Reading cannot publish'),/outside the active/);state.acknowledging=false
 state.privateInitialization=true;await assert.rejects(call(2,'Initialization cannot publish'),/outside the active/);state.privateInitialization=false
 state.running=false;await assert.rejects(call(2,'Idle cannot publish'),/outside the active/);state.running=true
 state.currentTask.messageId='new-task';await assert.rejects(call(2,'Old task'),/outside the active/);close()
 close=bind(context(3),3);const abort=new AbortController();abort.abort();await assert.rejects(core.invokeDiscussionTool(state,input(3,'Cancelled'),'cancel',abort.signal),/aborted/);assert.equal(record(3).ackMessageId,undefined);close()
 close=bind(context(4),4);core.revokeAgentCredential('reader');await assert.rejects(call(4,'Revoked'),/revoked Agent credential/);assert.equal(fs.existsSync(path.join(home,'agent-access/reader/token')),false);close()
 close=bind(context(5),5);op(()=>core.muteChatMember({id:group.id,member:'reader',muted:true}));await assert.rejects(call(5,'Muted'),/muted/);assert.equal(record(5).ackMessageId,undefined);op(()=>core.muteChatMember({id:group.id,member:'reader',muted:false}));close()
 close=bind(context(6),6);op(()=>core.updateChatGroup({id:group.id,members:['peer']}));await assert.rejects(call(6,'No member'),/membership|routing/i);op(()=>core.updateChatGroup({id:group.id,members:['reader','peer']}));close()
 close=bind(context(7),7);transport=await core.openDiscussionMcp(state)
 const rpc=async(method,params={},id=1)=>{const response=await fetch(transport.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});assert.equal(response.status,200);return response.json()}
 assert.equal((await fetch(transport.url)).status,403);assert.equal((await fetch(transport.url,{method:'POST',headers:{origin:'https://untrusted.test'},body:'{}'})).status,403);assert.equal((await fetch(transport.url+'wrong',{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(transport.url,{method:'POST',body:'x'.repeat(17000)})).status,413)
 assert.equal((await rpc('initialize',{protocolVersion:'2025-06-18'})).result.protocolVersion,'2025-06-18')
 state.acknowledging=true;assert.deepEqual((await rpc('tools/list')).result.tools,[]);assert.equal((await rpc('tools/call',{name:core.DISCUSSION_TOOL.name,arguments:input(7,'Cannot post reading')})).result.isError,true);state.acknowledging=false
 state.privateInitialization=true;assert.deepEqual((await rpc('tools/list')).result.tools.map(t=>t.name),['agents_company_documentation']);state.privateInitialization=false
 assert.equal((await rpc('tools/list')).result.tools.find(t=>t.name===core.DISCUSSION_TOOL.name).inputSchema.properties.text.type,'string');assert.ok((await rpc('session.send')).error)
 assert.equal((await rpc('tools/call',{name:'chat.post',arguments:{text:'Not an unrestricted gateway'}})).result.isError,true)
 const posted=await rpc('tools/call',{name:core.DISCUSSION_TOOL.name,arguments:input(7,'Native response.')},'native');assert.equal(posted.result.isError,undefined);assert.equal(JSON.parse(posted.result.content[0].text).text,'Native response.');close();await transport.close();transport=undefined
 const channel=(name,args={})=>op(()=>core.channelRequest('channel.'+name,args)),src=channel('source-add',{plugin:'x',locator:'tool_fixture'}),news=channel('publish',{sourceId:src.id,externalId:'news',publishedAt:Date.now(),title:'Original',body:'News-only context.'});channel('update',{id:src.channelId,adminIds:['reader']})
 core.run("INSERT INTO channel_deliveries(channel_id,entry_id,kind,employee_id,mode,status,read_at) VALUES(?,?,'news','reader','awareness','running',101)",src.channelId,news.id)
 const ctx={channelId:src.channelId,entryId:news.id};close=bind(ctx,'news');state.currentTask.delegation.channelNotice={...ctx,employeeId:'reader'}
 await assert.rejects(core.invokeDiscussionTool(state,{conversationType:'channel',conversationId:src.channelId,messageId:news.id,text:'Unsolicited news reply'},'news'),/Context-only/);assert.equal(channel('history',{id:src.channelId}).messages.length,0);close()
 assert.equal(history().messages.filter(m=>m.author.kind==='agent').length,2)
 console.log('PASS nonempty scoped publication only; target/task/credential/mute/abort guards, retry identity, no reading tools and no news-triggered reply')
}finally{await transport?.close();core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;await new Promise(r=>setImmediate(r));fs.rmSync(temp,{recursive:true,force:true})}
