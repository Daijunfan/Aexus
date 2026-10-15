const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-group-exec-'));
process.env.CLOUD_HOSTS_HOME=root;
const agents=require('../src/agent-sessions.cjs');
const original={sessions:agents.sessions,activate:agents.activate,send:agents.send};
const codex={id:'agent-codex',name:'Codex',engine:'codex',transport:'native',threadId:'thread-codex',
 engineHostId:'local',targetHostId:'local',cwd:root,running:true,busy:false};
const cline={id:'agent-cline',name:'Cline',engine:'cline',transport:'pty',
 engineHostId:'local',targetHostId:'local',cwd:root+'/cline',running:true,busy:false};
let active=[codex,cline],submitted=[];
agents.sessions=()=>structuredClone(active);
agents.activate=async args=>{if(args.session===codex.id){codex.running=true;return codex}throw Error('Unsupported')};
agents.send=async args=>{submitted.push(args);return {accepted:true,turnId:'native-'+submitted.length}};
const groups=require('../src/collaboration.cjs');
const store=require('../src/collaboration-store.cjs');
const executor=require('../src/collaboration-execution.cjs');
const occupancy=require('../src/agent-occupancy.cjs');
const journal=require('../src/session-journal.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async check=>{for(let i=0;i<50;i++){if(check())return;await sleep(10)}throw Error('Timeout waiting for recipient')};
after(()=>{executor.stop();Object.assign(agents,original);fs.rmSync(root,{recursive:true,force:true})});
test('send freezes addressed IDs, dispatches exactly one original native session, and publishes scoped reply',async()=>{
 executor.start();
 const group=groups.create({name:'QA',memberIds:[codex.id,cline.id]});
 const message=groups.post({id:group.id,text:'Run tests',mentions:[codex.id],clientMessageId:'retry-key'});
 await wait(()=>store.delivery(message.id,codex.id)?.status==='submitted');
 assert.equal(submitted.length,1);
 assert.equal(submitted[0].session,codex.id);
 assert.equal(submitted[0].scope.messageId,message.id);
 assert.match(submitted[0].text,/\[Group publication\]/);
 assert.equal(groups.post({id:group.id,text:'Run tests',mentions:[codex.id],clientMessageId:'retry-key'}).id,message.id);
 assert.equal(submitted.length,1);
 assert.equal(store.delivery(message.id,cline.id),undefined);
 const reply=groups.postFromTool({...submitted[0].scope,turnId:'native-1'},{text:'Tests passed',replyTo:message.id});
 assert.equal(reply.author.id,codex.id);
 assert.equal(reply.replyTo,message.id);
 assert.equal(groups.messages({id:group.id}).messages.at(-1).id,reply.id);
 assert.equal(store.delivery(message.id,codex.id).status,'replied');
 assert.equal(groups.postFromTool({...submitted[0].scope,turnId:'native-1'},{text:'Tests passed'}).id,reply.id);
 assert.throws(()=>groups.postFromTool({...submitted[0].scope,turnId:'native-bogus'},{text:'Impersonation'}),/unavailable/);
 journal.observe(codex,{method:'turn/completed',params:{threadId:codex.threadId,turn:{id:'native-1',status:'completed'}}});
 assert.equal(store.delivery(message.id,codex.id).status,'replied','late completion must not erase public receipt');
});
test('broadcast, reply routing, notes, durable idempotency and multi-engine recipient receipts',async()=>{
 const group=groups.create({name:'Second',memberIds:[codex.id,cline.id]});
 const broadcast=groups.post({id:group.id,text:'Both review',clientMessageId:'broadcast'});
 await wait(()=>store.delivery(broadcast.id,codex.id)?.status==='submitted'
   &&store.delivery(broadcast.id,cline.id)?.status==='submitted');
 assert.equal(submitted.find(x=>x.session===cline.id&&x.scope.messageId===broadcast.id)?.scope.source,'group');
 const note=groups.post({id:group.id,text:'Minutes',kind:'note',clientMessageId:'note'});
 assert.equal(groups.messages({id:group.id}).messages.find(x=>x.id===note.id).deliveries.length,0);
 const codexScope=submitted.find(x=>x.session===codex.id&&x.scope.messageId===broadcast.id).scope;
 const codexTurn=store.delivery(broadcast.id,codex.id).turn_id;
 const from=groups.postFromTool({...codexScope,turnId:codexTurn},{text:'Agent result',replyTo:broadcast.id});
 journal.observe(codex,{method:'turn/completed',params:{threadId:codex.threadId,turn:{id:codexTurn,status:'completed'}}});
 journal.observe(cline,{method:'turn/completed',params:{threadId:'cline-companion-test',turn:{id:store.delivery(broadcast.id,cline.id).turn_id,status:'completed'}}});
 const follow=groups.post({id:group.id,text:'Continue only the responder',replyTo:from.id,clientMessageId:'reply-follow'});
 assert.deepEqual(follow.recipientIds,[codex.id]);
 assert.equal(store.delivery(follow.id,cline.id),undefined);
 await wait(()=>store.delivery(follow.id,codex.id)?.status==='submitted');
 journal.observe(codex,{method:'turn/completed',params:{threadId:codex.threadId,turn:{id:store.delivery(follow.id,codex.id).turn_id,status:'completed'}}});
 assert.throws(()=>groups.post({id:group.id,text:'Different request',clientMessageId:'broadcast'}),/reused/);
});
test('restart conservatively marks uncertain native submission for human review and never replays',async()=>{
 const group=groups.create({name:'Recovery',memberIds:[codex.id]});
 const msg=groups.post({id:group.id,text:'Keep the first execution identity',mentions:[codex.id]});
 await wait(()=>store.delivery(msg.id,codex.id)?.status==='submitted');
 const n=submitted.length;
 store.recover();
 occupancy.release('group:'+msg.id+':'+codex.id); // a process restart clears volatile reservations
 assert.equal(store.delivery(msg.id,codex.id).status,'needs_review');
 executor.kick();
 await sleep(30);
 assert.equal(submitted.length,n);
 const retry=groups.retry({id:group.id,messageId:msg.id,agentId:codex.id});
 assert.equal(retry.status,'pending');
 await wait(()=>store.delivery(msg.id,codex.id)?.status==='submitted');
 assert.equal(submitted.length,n+1,'explicit retry dispatches only one recipient');
});
test('recipient removed before execution cannot use old group membership as authority',async()=>{
 const group=groups.create({name:'Authorization',memberIds:[codex.id,cline.id]});
 const target=groups.post({id:group.id,text:'Later',mentions:[cline.id]});
 await wait(()=>store.delivery(target.id,cline.id)?.status==='submitted');
 const updated=groups.update({id:group.id,memberIds:[codex.id],expectedRevision:groups.get({id:group.id}).revision});
 assert.equal(updated.memberIds.includes(cline.id),false);
 assert.throws(()=>groups.retry({id:group.id,messageId:target.id,agentId:cline.id}),/unauthorized/);
});

test('native final answer publishes into its assigned group exactly once even without an MCP reply call',async()=>{
 const agent={id:'auto-publish-agent',name:'Reply Agent',engine:'codex',transport:'native',threadId:'thread-auto',engineHostId:'local',
  targetHostId:'local',cwd:root+'/auto-replies',running:true,busy:false};
 active.push(agent);
 const group=groups.create({name:'Auto group reply',memberIds:[agent.id]});
 assert.equal(groups.get({id:group.id}).autoPublishReplies,true);
 const message=groups.post({id:group.id,text:'Summarize build',mentions:[agent.id]});
 await wait(()=>store.delivery(message.id,agent.id)?.status==='submitted');
 const turn=store.delivery(message.id,agent.id).turn_id;
 journal.observe(agent,{method:'item/completed',params:{threadId:agent.threadId,turnId:turn,
  item:{id:'auto-reply-1',type:'agentMessage',text:'Build verified: tests pass.'}}});
 journal.observe(agent,{method:'turn/completed',params:{threadId:agent.threadId,turn:{id:turn,status:'completed'}}});
 assert.equal(store.delivery(message.id,agent.id).status,'replied');
 const replies=groups.messages({id:group.id}).messages.filter(item=>item.replyTo===message.id);
 assert.equal(replies.length,1);
 assert.equal(replies[0].author.id,agent.id);
 assert.equal(replies[0].text,'Build verified: tests pass.');
 executor.settle(journal.history({sessionId:agent.id}).events.findLast(row=>row.kind==='turn'));
 assert.equal(groups.messages({id:group.id}).messages.filter(item=>item.replyTo===message.id).length,1);
});
test('group owner can disable automatic publication without affecting native result receipts',async()=>{
 const agent=active.find(item=>item.id==='auto-publish-agent');
 const group=groups.create({name:'Private native results',memberIds:[agent.id],autoPublishReplies:false});
 assert.equal(groups.get({id:group.id}).autoPublishReplies,false);
 const message=groups.post({id:group.id,text:'Verify private result'});
 await wait(()=>store.delivery(message.id,agent.id)?.status==='submitted');
 const turn=store.delivery(message.id,agent.id).turn_id;
 journal.observe(agent,{method:'item/completed',params:{threadId:agent.threadId,turnId:turn,
  item:{id:'private-result-1',type:'agentMessage',text:'Private structured output'}}});
 journal.observe(agent,{method:'turn/completed',params:{threadId:agent.threadId,turn:{id:turn,status:'completed'}}});
 assert.equal(store.delivery(message.id,agent.id).status,'completed');
 assert.equal(store.delivery(message.id,agent.id).result_text,'Private structured output');
 assert.equal(groups.messages({id:group.id}).messages.filter(item=>item.replyTo===message.id).length,0);
 groups.update({id:group.id,autoPublishReplies:true});
 assert.equal(groups.get({id:group.id}).autoPublishReplies,true);
});
test('MCP group reply may arrive before native turn/start acceptance without losing its exact recipient receipt',async()=>{
 const agent=active.find(item=>item.id==='auto-publish-agent');
 const group=groups.create({name:'Fast native tool reply',memberIds:[agent.id]});
 const originalSend=agents.send;
 let earlyTurn;
 try{
  agents.send=async args=>{
   earlyTurn='fast-tool-turn';
   assert.equal(store.delivery(args.scope.messageId,agent.id).status,'routing');
   groups.postFromTool({...args.scope,turnId:earlyTurn},{text:'Fast structured reply',replyTo:args.scope.messageId});
   return {accepted:true,turnId:earlyTurn};
  };
  const message=groups.post({id:group.id,text:'Reply quickly'});
  await wait(()=>store.delivery(message.id,agent.id)?.status==='replied');
  assert.equal(store.delivery(message.id,agent.id).turn_id,earlyTurn);
  assert.equal(groups.messages({id:group.id}).messages.filter(item=>item.replyTo===message.id).length,1);
  journal.observe(agent,{method:'turn/completed',params:{threadId:agent.threadId,turn:{id:earlyTurn,status:'completed'}}});
  assert.equal(store.delivery(message.id,agent.id).status,'replied');
 }finally{agents.send=originalSend}
});

test('one atomic group edit transfers ownership and removes the former owner',()=>{
 const group=groups.create({name:'Owner rotation',memberIds:[codex.id,cline.id]});
 assert.equal(group.ownerId,codex.id);
 assert.throws(()=>groups.update({id:group.id,memberIds:[cline.id]}),/Transfer group Owner/);
 const next=groups.update({id:group.id,memberIds:[cline.id],ownerId:cline.id,
  expectedRevision:group.revision,autoPublishReplies:false});
 assert.equal(next.ownerId,cline.id);
 assert.deepEqual(next.memberIds,[cline.id]);
 assert.equal(next.autoPublishReplies,false);
 assert.equal(groups.get({id:group.id}).revision,group.revision+1);
 assert.throws(()=>groups.update({id:group.id,ownerId:codex.id}),/Transfer group Owner/);
});

test('restarting Core reconciles already-finished exact native turns without a second model request',()=>{
 const agent=active.find(item=>item.id==='auto-publish-agent');
 executor.stop();
 const group=groups.create({name:'Crash recovery publication',memberIds:[agent.id]});
 const message=groups.post({id:group.id,text:'Previous native work',mentions:[agent.id]});
 const turn='native-finished-before-restart';
 const marked=store.change(message.id,agent.id,['pending'],{status:'submitted',turn_id:turn});
 assert.equal(marked.status,'submitted');
 const count=submitted.length;
 journal.observe(agent,{method:'item/completed',params:{threadId:agent.threadId,turnId:turn,
  item:{id:'offline-result',type:'agentMessage',text:'Safely resumed from recorded result'}}});
 journal.observe(agent,{method:'turn/completed',params:{threadId:agent.threadId,turn:{id:turn,status:'completed'}}});
 assert.equal(store.delivery(message.id,agent.id).status,'submitted','no executor is listening during simulated Core downtime');
 executor.start();
 assert.equal(store.delivery(message.id,agent.id).status,'replied');
 assert.equal(groups.messages({id:group.id}).messages.filter(row=>row.replyTo===message.id).length,1);
 assert.equal(submitted.filter(row=>row.scope?.messageId===message.id).length,0,'never replay original native message');
 assert.equal(submitted.length,count,'no additional model calls');
});
