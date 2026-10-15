const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-agent-api-'));
process.env.CLOUD_HOSTS_HOME=home;
const sessions=require('../src/agent-sessions.cjs');
const original=sessions.sessions;
const members=[
 {id:'lead',name:'Lead',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-lead',permission:'full',running:true},
 {id:'worker',name:'Worker',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-worker',permission:'ask',running:true},
 {id:'outside',name:'Outside',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-outside',permission:'full',running:true}
];
sessions.sessions=()=>members;
const company=require('../src/company.cjs'),groups=require('../src/collaboration.cjs'),plans=require('../src/plan-scheduler.cjs');
const mcp=require('../src/collaboration-mcp.cjs'),contracts=require('../src/api-contracts.cjs'),core=require('../src/core.cjs');
const {NativeAgent}=require('../src/agent-native.cjs');
company.assignRole({agentId:'lead',role:'manager'});
company.createTeam({name:'Existing managed team',memberIds:['lead','worker']});
const fake=(id='lead',source='private')=>{
 const role=members.find(x=>x.id===id);
 return {role,threadId:role.threadId,busy:true,dead:false,toolScope:{source,agentId:id,turnId:'turn-'+id}};
};
const act=(native,command,args={},id='call-'+command)=>mcp.invoke(native,'cloud_api',{command,args},id,{threadId:native.threadId,turnId:native.toolScope.turnId});
after(async()=>{sessions.sessions=original;fs.rmSync(home,{recursive:true,force:true})});
test('canonical catalog exposes supported real commands with version hash, not Guardian or credential mutation to Agents',async()=>{
 const info=contracts.metadata();
 assert.ok(info.commandCount>90);assert.ok(info.agentCommandCount>=20);
 assert.match(info.schemaHash,/^[a-f0-9]{64}$/);
 assert.equal(contracts.resolve('team.create'),'company.createTeam');
 assert.equal(contracts.lookup('hosts.credentials').agentCallable,false);
 assert.equal(contracts.catalog.some(x=>x.name.startsWith('guardian.')),false);
 assert.equal((await core.dispatch('api.info')).schemaHash,info.schemaHash);
 assert.equal((await core.dispatch('api.describe',{command:'schedule.update'})).name,'plan.update');
 assert.equal((await core.dispatch('api.list',{agentOnly:true})).length,info.agentCommandCount);
 assert.ok(contracts.catalog.filter(x=>x.agentCallable).every(x=>x.inputSchema?.type==='object'&&x.outputSchema));
 assert.equal(contracts.lookup('schedule.delete'),undefined,'a destructive legacy delete must not silently alias to an archive');
});
test('private Agent discovers real identity/schema and creates a team without a group-only scope',async()=>{
 const native=fake();
 const identity=await mcp.invoke(native,'cloud_docs',{operation:'identity'},'doc-1');
 assert.equal(identity.agentId,'lead');assert.deepEqual(identity.managedAgentIds,['worker']);
 const list=await mcp.invoke(native,'cloud_docs',{operation:'search',search:'team',agentOnly:true},'doc-2');
 assert.ok(list.commands.some(x=>x.name==='company.createTeam'));
 const schema=await mcp.invoke(native,'cloud_docs',{operation:'describe',command:'company.createTeam'},'doc-3');
 assert.ok(schema.inputSchema.required.includes('name'));
 await assert.rejects(act(fake('worker'),'company.createTeam',{name:'Worker cannot manage company'},'worker-team'),/requires a manager/i);
 const args={name:'Created through Cloud API',memberIds:['lead','worker']};
 const result=await act(native,'company.createTeam',args,'stable-team-id');
 assert.equal(result.data.name,args.name);
 assert.equal(result.data.memberIds.length,2);
 assert.deepEqual(await act(native,'company.createTeam',args,'stable-team-id'),result);
 await assert.rejects(act(native,'company.createTeam',{...args,name:'Tampered'},'stable-team-id'),/reused/i);
 await assert.rejects(act(native,'company.createTeam',{name:'Unauthorized',memberIds:['outside']},'invalid-join'),/outside management scope/i);
});
test('group membership is independent of Company rank and Agent publication never dispatches another Agent task',async()=>{
 const lead=fake(),worker=fake('worker'),outside=fake('outside');
 const made=await act(lead,'messages.create',{name:'Project room',memberIds:['worker']},'group-create');
 assert.equal(made.data.ownerId,'lead');
 const note=await act(lead,'messages.publish',{id:made.data.id,text:'Verification passed'},'group-note');
 assert.equal(note.data.author.kind,'agent');assert.equal(note.data.author.id,'lead');
 assert.deepEqual(note.data.recipientIds,[]);
 assert.equal((await act(worker,'messages.history',{id:made.data.id},'read-room')).data.messages.length>=1,true);
 await assert.rejects(act(outside,'messages.history',{id:made.data.id},'not-member'),/unavailable/);
 await assert.rejects(act(lead,'messages.post',{id:made.data.id,text:'illegal fanout'},'fake-operator'),/unavailable to this Agent/);
 await assert.rejects(act(lead,'hosts.credentials',{id:'local'},'credential'),/unavailable to this Agent/);
 const updated=groups.update({id:made.data.id,memberIds:['worker'],ownerId:'worker'});
 assert.equal(updated.ownerId,'worker');
 await assert.rejects(act(lead,'messages.history',{id:made.data.id},'revoked-read'),/unavailable/);
});
test('Agent Plan records authentic creator and rechecks authority before scheduled execution',async()=>{
 const lead=fake();
 const scheduledAt=new Date(Date.now()+90000).toISOString();
 const args={name:'Weekly verification',
  action:{type:'agent',mode:'resume',agentId:'worker',text:'Check the tests'},
  rule:{kind:'once',at:scheduledAt},enabled:true};
 const forbidden=groups.create({name:'Other-group-only',memberIds:['outside']});
 await assert.rejects(act(lead,'plan.create',{...args,action:{...args.action,groupId:forbidden.id}},'forbidden-plan'),/unavailable/);
 const created=await act(lead,'plan.create',args,'create-weekly');
 assert.equal(created.data.createdBy,'agent:lead');
 assert.equal((await act(lead,'plan.get',{id:created.data.id})).data.id,created.data.id);
 const update=await act(lead,'plan.update',{id:created.data.id,patch:{notes:'Retest and report'},expectedRevision:1},'edit-plan');
 assert.equal(update.data.revision,2);
 const oldSend=sessions.send;let sends=0;
 sessions.send=async()=>{sends++;return {turnId:'should-not-submit'}};
 try{
  for(const team of company.teams().filter(x=>x.memberIds.includes('lead')&&x.memberIds.includes('worker')))
   company.updateTeam({id:team.id,memberIds:['lead'],expectedRevision:team.revision});
  const result=await plans.tick(Date.parse(scheduledAt)+250);
  assert.equal(result.find(x=>x.jobId===created.data.id)?.status,'attention');
  assert.equal(sends,0);
  await assert.rejects(act(lead,'plan.update',{id:created.data.id,patch:{notes:'After revoked'}},'revoked-plan'),/outside management scope/);
 }finally{sessions.send=oldSend;}
});
test('human Ask mode records exact pending API approval and honors decline/accept',async()=>{
 const role={...members[0],permission:'ask'};
 const agent=new NativeAgent(role,()=>{});
 agent.busy=true;agent.toolScope={source:'private',agentId:role.id,turnId:'approval-turn'};
 agent.threadId=role.threadId;
 const args={name:'Approved private group',memberIds:[]};
 const first=act(agent,'messages.create',args,'approval-decline');
 await new Promise(setImmediate);
 const pending=[...agent.approvals.keys()];
 assert.equal(pending.length,1);
 assert.equal(agent.read().approvals[0].params.command,'messages.create');
 await agent.respond({requestId:pending[0],decision:'decline'});
 await assert.rejects(first,/declined/);
 assert.equal(agent.approvals.size,0);
 const second=act(agent,'messages.create',args,'approval-accept');
 await new Promise(setImmediate);
 const ok=[...agent.approvals.keys()][0];
 await agent.respond({requestId:ok,decision:'accept'});
 const result=await second;
 assert.equal(result.data.ownerId,'lead');
 agent.busy=false;agent.toolScope=null;
 await assert.rejects(mcp.invoke(agent,'cloud_api',{command:'messages.list',args:{}},'no-turn'),/active, authenticated/i);
});

test('revoking group permission during human approval invalidates the pending write',async()=>{
 const group=groups.create({name:'Temporary grant',memberIds:['lead','outside']});
 const role={...members[0],permission:'ask'},native=new NativeAgent(role,()=>{});
 native.busy=true;native.toolScope={source:'private',agentId:'lead',turnId:'pending-revoke'};
 const countBefore=groups.messages({id:group.id}).messages.length;
 const pending=act(native,'messages.publish',{id:group.id,text:'Should never publish'},'revoke-during-approval');
 await new Promise(setImmediate);
 const request=[...native.approvals.keys()][0];
 assert.ok(request);
 groups.update({id:group.id,memberIds:['outside'],ownerId:'outside'});
 await native.respond({requestId:request,decision:'accept'});
 await assert.rejects(pending,/grants changed/i);
 assert.equal(groups.messages({id:group.id}).messages.length,countBefore);
});
