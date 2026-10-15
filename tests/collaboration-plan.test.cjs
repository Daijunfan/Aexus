const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-collaboration-test-'));
process.env.CLOUD_HOSTS_HOME=temp;
const agents=require('../src/agent-sessions.cjs');
const original={sessions:agents.sessions,activate:agents.activate,send:agents.send,executionIdentity:agents.executionIdentity};
const nativeRole={id:'native-test',name:'Existing native Codex',engine:'codex',transport:'native',engineHostId:'local',targetHostId:'local',threadId:'codex-thread-1',running:true,busy:false,status:'idle'};
const piRole={id:'pi-test',name:'Existing Pi',engine:'pi',transport:'pty',engineHostId:'local',targetHostId:'local',running:true,busy:false};
let roles=[nativeRole,piRole],sent=[];
agents.sessions=()=>structuredClone(roles);
agents.activate=async()=>{nativeRole.running=true;return nativeRole};
agents.send=async args=>{sent.push(args);return {accepted:true,turnId:'test-turn-1'}};
agents.executionIdentity=({session})=>({collaborationSessionId:'companion-'+session});
const groups=require('../src/collaboration.cjs'),plans=require('../src/plan-scheduler.cjs');
after(async()=>{await plans.stop();Object.assign(agents,original);fs.rmSync(temp,{recursive:true,force:true})});

test('Messages groups use stable native session IDs, never Aexus employee identities or preprompts',()=>{
 const group=groups.create({name:'Design review',memberIds:[nativeRole.id,piRole.id],description:'Review APIs'});
 assert.deepEqual(group.memberIds,['native-test','pi-test']);
 assert.deepEqual(group.members.map(x=>x.engine),['codex','pi']);
 assert.equal(groups.list().length,1);
 assert.throws(()=>groups.create({name:'Unknown',memberIds:['fake-id']}),/Unknown native Agent/);
 const a=groups.post({id:group.id,text:'Please review the JSON-RPC design',clientMessageId:'post-1'});
 assert.equal(groups.post({id:group.id,text:a.text,clientMessageId:'post-1'}).id,a.id);
 assert.throws(()=>groups.post({id:group.id,text:'A different task',clientMessageId:'post-1'}),/reused/);
 assert.equal(groups.messages({id:group.id}).messages[0].author.kind,'operator');
 assert.deepEqual(sent,[],'posting group messages must never send model input');
 const response=groups.post({id:group.id,text:'Agreed on protocol isolation',replyTo:a.id});
 assert.equal(response.replyTo,a.id);
 assert.equal(groups.messages({id:group.id,limit:1}).nextBefore,2);
 assert.equal(groups.readMessage({id:group.id,sequence:1}).readSequence,1);
 const edited=groups.update({id:group.id,name:'Design',memberIds:[nativeRole.id],expectedRevision:3});
 assert.equal(edited.memberIds.length,1);
 assert.throws(()=>groups.update({id:group.id,name:'Stale',expectedRevision:1}),/changed/);
 assert.deepEqual(groups.archive({id:group.id}).archived,true);
 assert.equal(groups.list().length,0);
 assert.equal(groups.messages({id:group.id}).messages.length,2,'archiving must retain group history');
});

test('Plan notice posts an out-of-band message with exact one-off/interval dispatch journal',async()=>{
 const group=groups.create({name:'Nightly checks',memberIds:[nativeRole.id]});
 const future=new Date(Date.now()+90_000).toISOString();
 const job=plans.create({name:'Remind QA',action:{type:'notice',groupId:group.id,text:'Review results tomorrow'},rule:{kind:'once',at:future},enabled:true});
 assert.equal(job.enabled,true);
 assert.equal(plans.list().some(x=>x.id===job.id),true);
 let runs=await plans.tick(Date.parse(future)+1);
 assert.equal(runs.length,1);assert.equal(runs[0].status,'notified');
 assert.equal(groups.messages({id:group.id}).messages[0].text,'Review results tomorrow');
 assert.equal(groups.messages({id:group.id}).messages[0].author.kind,'core');
 assert.deepEqual(sent,[]);
 assert.deepEqual(await plans.tick(Date.parse(future)+2),[],'once occurrence cannot rerun');
 const repeated=plans.create({name:'Recurring reminder',action:{type:'notice',text:'Keep workspace tidy'},rule:{kind:'interval',everySeconds:60,anchor:future},enabled:true});
 const first=await plans.tick(Date.parse(future)+2);
 assert.equal(first.length,1);assert.equal(first[0].jobId,repeated.id);
 assert.ok(Date.parse(plans.get({id:repeated.id}).nextAt)>Date.parse(future));
 assert.equal((await plans.tick(Date.parse(future)+2)).length,0);
 const paused=plans.update({id:repeated.id,patch:{enabled:false},expectedRevision:plans.get({id:repeated.id}).revision});
 assert.equal(paused.enabled,false);
 assert.equal((await plans.tick(Date.parse(future)+99999999)).length,0);
});

test('Plan native agent dispatch sends ONLY user text to an exact existing Codex thread, once',async()=>{
 const start=new Date(Date.now()+110_000).toISOString();
 const prompt='Check project tests and report failures. This is the ENTIRE user instruction.';
 const item=plans.create({name:'CI test',action:{type:'agent',text:prompt,agentId:nativeRole.id},rule:{kind:'once',at:start},enabled:true});
 assert.equal(item.action.threadId,nativeRole.threadId);
 const result=await plans.tick(Date.parse(start)+100);
 assert.equal(result.length,1);assert.equal(result[0].status,'submitted');
 assert.equal(result[0].turnId,'test-turn-1');
 assert.equal(sent.length,1);assert.equal(sent[0].id,'local');assert.equal(sent[0].session,nativeRole.id);
 assert.equal(sent[0].text,prompt,'native prompt text remains untouched');
 assert.equal(sent[0].scope.source,'plan');assert.equal(sent[0].scope.agentId,nativeRole.id);
 assert.equal(sent[0].scope.planId,item.id);assert.equal(sent[0].scope.runId,result[0].id);
 assert.equal((await plans.tick(Date.parse(start)+101)).length,0);
 assert.equal(plans.history({id:item.id}).length,1);
 const piPlan=plans.create({name:'Pi companion',action:{type:'agent',text:'Task',agentId:piRole.id},rule:{kind:'once',at:start}});
 assert.equal(piPlan.action.engine,'pi');assert.equal(piPlan.action.threadId,'companion-'+piRole.id);
});

test('Plan busy/identity failure marks attention and never resubmits or silently changes thread',async()=>{
 const start=new Date(Date.now()+145_000).toISOString();
 const item=plans.create({name:'No duplicate',action:{type:'agent',text:'Original task only',agentId:nativeRole.id},rule:{kind:'once',at:start},enabled:true});
 roles=[{...nativeRole,busy:true},piRole];
 const result=await plans.tick(Date.parse(start)+1);
 assert.equal(result[0].status,'attention');assert.match(result[0].message,/busy/);
 const before=sent.length;
 roles=[{...nativeRole,threadId:'some-other-thread'},piRole];
 assert.deepEqual(await plans.tick(Date.parse(start)+2),[]);
 assert.equal(sent.length,before);
 assert.ok(plans.history({id:item.id})[0].status==='attention');
});

test('Plan rejects malformed rules and does not silently enable automation',()=>{
 const later=new Date(Date.now()+600000).toISOString();
 const job=plans.create({name:'Off by default',action:{type:'notice',text:'No auto model requests'},rule:{kind:'once',at:later}});
 assert.equal(job.enabled,false);
 assert.throws(()=>plans.create({name:'Bad interval',action:{type:'notice',text:'Invalid'},rule:{kind:'interval',everySeconds:5}}),/60 seconds/);
 assert.throws(()=>plans.create({name:'Bad time',action:{type:'notice',text:'Invalid'},rule:{kind:'once',at:'bad-date'}}),/ISO/);
});

test('Plans skip missed sleep/wakeup occurrences beyond the configured grace and never replay',async()=>{
 const at=new Date(Date.now()+180000).toISOString();
 const job=plans.create({name:'Missed due to sleep',action:{type:'agent',agentId:nativeRole.id,text:'Do not send after wakeup'},rule:{kind:'once',at},enabled:true,graceSeconds:5});
 const old=sent.length;
 const first=await plans.tick(Date.parse(at)+15000);
 assert.equal(first.length,1);
 assert.equal(first[0].status,'missed');
 assert.equal(sent.length,old);
 assert.equal(plans.get({id:job.id}).enabled,false);
 assert.deepEqual(await plans.tick(Date.parse(at)+15500),[]);
});

test('Plan revisions safeguard edits to target action and timing',()=>{
 const at=new Date(Date.now()+290000).toISOString();
 const item=plans.create({name:'Editable',action:{type:'notice',text:'Original'},rule:{kind:'once',at}});
 const updated=plans.update({id:item.id,expectedRevision:item.revision,patch:{name:'Updated name',action:{type:'notice',text:'Updated text'},rule:{kind:'interval',everySeconds:600}}});
 assert.equal(updated.action.text,'Updated text');
 assert.equal(updated.rule.kind,'interval');
 assert.equal(updated.enabled,false);
 assert.throws(()=>plans.update({id:item.id,expectedRevision:item.revision,patch:{name:'Stale'}}),/changed/);
 assert.throws(()=>plans.update({id:item.id,patch:{graceSeconds:3601}}),/graceSeconds/);
});


test('Scheduled native Agent work cannot switch its engine source or Codex data-directory identity',async()=>{
 const original=structuredClone(nativeRole);
 const at=new Date(Date.now()+320000).toISOString();
 const job=plans.create({name:'Bound native identity',action:{type:'agent',agentId:nativeRole.id,text:'Run only on the authorized source'},rule:{kind:'once',at},enabled:true});
 assert.equal(job.action.engineHostId,'local');
 const before=sent.length;
 roles=[{...nativeRole,engineHostId:'another-host'},piRole];
 const runs=await plans.tick(Date.parse(at)+1);
 assert.equal(runs.length,1);assert.equal(runs[0].status,'attention');
 assert.match(runs[0].message,/identity changed/);
 assert.equal(sent.length,before);
 roles=[original,piRole];
});
