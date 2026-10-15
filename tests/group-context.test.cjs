const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-context-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),original=agents.sessions;
agents.sessions=()=>[{id:'context-agent',name:'Reviewer',engine:'codex',transport:'native',
 engineHostId:'local',targetHostId:'local',cwd:home,running:false,busy:false}];
const groups=require('../src/collaboration.cjs'),store=require('../src/collaboration-store.cjs');
const executor=require('../src/collaboration-execution.cjs');
after(()=>{agents.sessions=original;fs.rmSync(home,{recursive:true,force:true})});

test('group tasks retain bounded public discussion and never leak other groups or future messages',()=>{
 const team=groups.create({name:'Shared context',memberIds:['context-agent']});
 const other=groups.create({name:'Other project',memberIds:['context-agent']});
 groups.post({id:other.id,text:'OTHER GROUP SECRET',kind:'note'});
 const first=groups.post({id:team.id,text:'Team decision: JSON protocol, no terminal injection',kind:'note'});
 groups.post({id:team.id,text:'Reviewer verified the design',kind:'result'},
  {kind:'agent',id:'context-agent',name:'Reviewer'});
 const current=groups.post({id:team.id,text:'Continue from the shared decision',kind:'note',replyTo:first.id});
 groups.post({id:team.id,text:'A FUTURE MESSAGE',kind:'note'});
 const prior=store.contextBefore(team.id,current.sequence);
 assert.deepEqual(prior.messages.map(item=>item.sequence),[1,2]);
 assert.equal(prior.messages[0].text,first.text);
 assert.equal(prior.messages[1].author.id,'context-agent');
 const prompt=executor.taskContext({groupId:team.id,agentId:'context-agent',message:current},team);
 assert.match(prompt,/Team decision: JSON protocol/);
 assert.match(prompt,/Reviewer verified the design/);
 assert.match(prompt,/Continue from the shared decision/);
 assert.doesNotMatch(prompt,/OTHER GROUP SECRET|A FUTURE MESSAGE/);
 assert.match(prompt,/quotedText/);
 assert.deepEqual(current.replyPreview,{authorName:'You',text:first.text});
 assert.equal(groups.entry({id:team.id,messageId:current.id}).id,current.id);
 assert.throws(()=>groups.entry({id:other.id,messageId:current.id}),/not in this group/);
 groups.archive({id:team.id});
 assert.equal(groups.entry({id:team.id,messageId:current.id}).replyPreview.text,first.text,
  'archiving retains original quoted message and reply context');
 assert.throws(()=>store.contextBefore(team.id,0),/Invalid shared context/);
});
test('long public conversations prefer recent published replies within a finite prompt budget',()=>{
 const team=groups.create({name:'Busy group',memberIds:['context-agent']});
 for(let n=1;n<=62;n++)groups.post({id:team.id,text:'message '+n+' '+('a'.repeat(3500)),kind:'note'});
 const current=groups.post({id:team.id,text:'Final handoff',kind:'note'});
 const prior=store.contextBefore(team.id,current.sequence);
 assert.equal(prior.truncated,true);
 assert.ok(prior.messages.length>0&&prior.messages.length<32);
 assert.match(prior.messages.at(-1).text,/message 62/);
 assert.ok(prior.messages.every(item=>item.sequence<current.sequence));
 assert.ok(JSON.stringify(prior).length<=23000);
 const short=store.contextBefore(team.id,current.sequence,{limit:3,maxChars:15000});
 assert.equal(short.messages.length,3);
 assert.deepEqual(short.messages.map(item=>item.sequence),[60,61,62]);
});
test('only incoming public Agent and Plan posts create unread badges; reading is monotonic',()=>{
 const team=groups.create({name:'Unread',memberIds:['context-agent']});
 groups.post({id:team.id,text:'A user message',kind:'note'});
 assert.equal(groups.get({id:team.id}).unreadCount,0);
 const answer=groups.post({id:team.id,text:'A native reply',kind:'result'},
  {kind:'agent',id:'context-agent',name:'Reviewer'});
 assert.equal(groups.list().find(g=>g.id===team.id).unreadCount,1);
 groups.post({id:team.id,text:'The user continues',kind:'note'});
 const previous=groups.readMessage({id:team.id,sequence:1});
 assert.equal(previous.unreadCount,1);
 const seen=groups.readMessage({id:team.id,sequence:answer.sequence});
 assert.equal(seen.unreadCount,0);
 assert.equal(groups.readMessage({id:team.id,sequence:1}).readSequence,answer.sequence);
 groups.post({id:team.id,text:'Timed notice',kind:'result'},{kind:'core',name:'Plan'});
 assert.equal(groups.get({id:team.id}).unreadCount,1);
 assert.equal(groups.readMessage({id:team.id,sequence:999999}).unreadCount,0);
});
