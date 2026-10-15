const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-messenger-forward-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),original={sessions:agents.sessions,activate:agents.activate,send:agents.send};
const people=[
 {id:'reader',name:'Reader',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-reader',busy:false,running:true,permission:'ask'},
 {id:'writer',name:'Writer',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-writer',busy:false,running:true,permission:'full'},
];
agents.sessions=()=>people.map(row=>({...row}));
let sends=0,sendArgs=[];
agents.send=async args=>{sends++;sendArgs.push({...args});return {turnId:'forward-turn-'+sends}};
agents.activate=async()=>people[1];
const groups=require('../src/collaboration.cjs'),journal=require('../src/session-journal.cjs');
const core=require('../src/core.cjs'),contracts=require('../src/api-contracts.cjs'),forward=require('../src/messenger-forward.cjs');
const roomA=groups.create({name:'From room',memberIds:['reader']});
const roomB=groups.create({name:'Review room',memberIds:['writer']});
const originalNote=groups.post({id:roomA.id,text:'Read the verification memo',kind:'note'}, {kind:'operator',name:'You'});
after(()=>{Object.assign(agents,original);fs.rmSync(home,{recursive:true,force:true})});

test('forwarding to a group is a durable non-triggering note with original source attribution',async()=>{
 const args={messages:[{conversation:'group:'+roomA.id,id:originalNote.id}],to:'group:'+roomB.id,
  comment:'Share the investigation results',clientMessageId:'forward-request-one'};
 const posted=await core.dispatch('messenger.forward',args);
 assert.equal(posted.to,args.to);assert.equal(posted.status,'posted');
 assert.equal(sends,0,'group forwards must never trigger a model');
 const copied=groups.messages({id:roomB.id}).messages;
 assert.equal(copied.length,1);assert.equal(copied[0].id,posted.messageId);
 assert.equal(copied[0].kind,'note');assert.deepEqual(copied[0].recipientIds,[]);
 assert.match(copied[0].text,/Read the verification memo/);
 assert.match(copied[0].text,/From room/);
 assert.equal(groups.messages({id:roomA.id}).messages[0].id,originalNote.id);
 const replay=await core.dispatch('messenger.forward',args);
 assert.equal(replay.messageId,posted.messageId);
 assert.equal(groups.messages({id:roomB.id}).messages.length,1);
 await assert.rejects(core.dispatch('messenger.forward',{...args,comment:'Tampered'}),/reused with different content/);
 const status=await core.dispatch('messenger.forward-status',{clientMessageId:args.clientMessageId});
 assert.equal(status.status,'posted');assert.equal(status.result.messageId,posted.messageId);
 assert.equal(status.retryable,false);
});

test('forwarded native turns require explicit charge opt-in and keep exact session IDs',async()=>{
 const source=journal.append({sessionId:'reader',kind:'assistant',key:'forward-source-1',nativeThreadId:'thread-reader',text:'Original private analysis'});
 const args={messages:[{conversation:'employee:reader',id:source.id}],to:'agent:writer',clientMessageId:'forward-native-one'};
 await assert.rejects(core.dispatch('messenger.forward',args),/execute:true explicitly/);
 assert.equal(sends,0);
 await assert.rejects(core.dispatch('messenger.forward',{...args,textOnly:false,execute:true}),/explicit File Station transfer/);
 const sent=await core.dispatch('messenger.forward',{...args,execute:true});
 assert.equal(sent.status,'submitted');assert.equal(sent.agentId,'writer');
 assert.equal(sent.turnId,'forward-turn-1');
 assert.equal(sends,1);assert.equal(sendArgs[0].scope.source,'private');
 assert.equal(sendArgs[0].session,'writer');assert.match(sendArgs[0].text,/Original private analysis/);
 const repeated=await core.dispatch('messenger.forward',{...args,execute:true});
 assert.equal(repeated.turnId,sent.turnId);assert.equal(sends,1);
 journal.observe(people[1],{method:'item/completed',params:{threadId:'thread-writer',turnId:sent.turnId,item:{id:'reply-1',type:'agentMessage',text:'Task verified'}}});
 journal.observe(people[1],{method:'turn/completed',params:{threadId:'thread-writer',turn:{id:sent.turnId,status:'completed'}}});
 const receipt=await core.dispatch('messenger.forward-status',{clientMessageId:args.clientMessageId});
 assert.equal(receipt.status,'completed');assert.equal(receipt.result.resultText,'Task verified');
 assert.equal(sends,1,'status checks must never reissue a model task');
});

test('uncertain native submission is tracked durably, never blind-retried',async()=>{
 const originalSend=agents.send;
 agents.send=async()=>{sends++;throw Error('Response transport disappeared')};
 const source=groups.post({id:roomA.id,kind:'note',text:'Uncertain delivery',clientMessageId:'another-forward-source'});
 const args={messages:[{conversation:'group:'+roomA.id,id:source.id}],to:'agent:writer',execute:true,clientMessageId:'forward-uncertain-1'};
 try{
  await assert.rejects(core.dispatch('messenger.forward',args),/transport disappeared/);
  assert.equal((await core.dispatch('messenger.forward-status',{clientMessageId:args.clientMessageId})).status,'uncertain');
  const count=sends;
  await assert.rejects(core.dispatch('messenger.forward',args),/result is uncertain/);
  assert.equal(sends,count);
 }finally{agents.send=originalSend}
});

test('historical hidden messages or nonexistent message IDs cannot be forwarded',async()=>{
 const saved=await core.dispatch('messenger.message',{conversation:'group:'+roomA.id,id:originalNote.id,patch:{hidden:true}});
 assert.equal(saved.messages['group:'+roomA.id+':'+originalNote.id].hidden,true);
 const args={messages:[{conversation:'group:'+roomA.id,id:originalNote.id}],to:'group:'+roomB.id,clientMessageId:'forward-hidden-one'};
 await assert.rejects(core.dispatch('messenger.forward',args),/personally hidden/);
 assert.equal((await core.dispatch('messenger.forward-status',{clientMessageId:args.clientMessageId})).status,'not-found');
 const bad={...args,messages:[{conversation:'group:'+roomA.id,id:'gm_does_not_exist'}],clientMessageId:'forward-invalid-one'};
 await assert.rejects(core.dispatch('messenger.forward',bad),/unavailable/);
 assert.equal(contracts.lookup('messenger.forward').agentCallable,false);
 assert.equal(contracts.lookup('messenger.forward-status').agentCallable,false);
});

test('forward receipt remains queryable from a new local Core process',()=>{
 const {spawnSync}=require('node:child_process');
 const file=path.resolve(__dirname,'../src/messenger-forward.cjs');
 const query=spawnSync(process.execPath,['-e',"process.env.CLOUD_HOSTS_HOME=process.argv[1];console.log(JSON.stringify(require(process.argv[2]).lookupStatus({clientMessageId:'forward-request-one'})))",home,file],{encoding:'utf8'});
 assert.equal(query.status,0,query.stderr);
 assert.equal(JSON.parse(query.stdout).status,'posted');
});
