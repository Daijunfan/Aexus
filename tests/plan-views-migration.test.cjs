const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-plan-views-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),previous=agents.sessions;
const roles=['alice','bob','admin'].map(id=>({id,name:id,engine:'codex',transport:'native',threadId:'thread-'+id,
 engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'}));
agents.sessions=()=>roles;
const company=require('../src/company.cjs'),api=require('../src/collaboration-mcp.cjs'),core=require('../src/core.cjs');
const saved=require('../src/plan-views.cjs');
company.assignRole({agentId:'admin',role:'administrator'});
const fake=id=>({role:roles.find(row=>row.id===id),threadId:'thread-'+id,busy:true,dead:false,
 toolScope:{source:'private',agentId:id,turnId:'active-'+id}});
const call=(id,command,args={},requestId='call-'+command)=>api.invoke(fake(id),'cloud_api',{command,args},requestId);
after(()=>{agents.sessions=previous;fs.rmSync(home,{recursive:true,force:true})});

test('port ten Aexus layout IDs into real built-in Plan views, without a second jobs store',async()=>{
 const result=await core.dispatch('plan.schema');
 assert.deepEqual(result.layouts,['table','board','timeline','calendar','plan','list','gallery','chart','feed','form']);
 const list=await core.dispatch('plan.views');
 assert.equal(list.length,10);
 assert.ok(list.every(row=>row.builtin&&row.revision===1));
 const schema=await call('alice','plan.schema');
 assert.equal(schema.data.version,1);
 const search=await api.invoke(fake('alice'),'cloud_docs',{operation:'search',search:'plan.view',agentOnly:true},'search-plan');
 assert.equal(search.commands.filter(row=>row.name.startsWith('plan.view')).length,4);
});

test('agent-created saved views are permissioned, versioned, durable, and cannot mutate schedules',async()=>{
 const raw={name:'My verification board',layout:'board',filter:{employee:'self',states:['scheduled']},
  groupBy:'status',sort:'name',direction:'asc'};
 const result=await call('alice','plan.view-create',{spec:raw},'create-alice-view');
 assert.match(result.data.id,/^pv_/);
 assert.deepEqual(result.data.owner,{kind:'agent',agentId:'alice'});
 assert.equal(result.data.filter.employee,'alice');
 assert.equal((await call('alice','plan.views')).data.length,11);
 assert.equal((await call('bob','plan.views')).data.length,10);
 assert.equal((await call('admin','plan.views')).data.length,11,'Administrator can administer saved view metadata');
 await assert.rejects(call('bob','plan.view-update',{id:result.data.id,patch:{name:'Unauthorized'}},'bob-edit'),/unauthorized/i);
 const same=await call('alice','plan.view-create',{spec:raw},'create-alice-view');
 assert.equal(same.data.id,result.data.id,'durable Core API idempotency prevents duplicates');
 const updated=await call('alice','plan.view-update',{id:result.data.id,patch:{name:'Verified'},expectedRevision:1},'edit-once');
 assert.equal(updated.data.revision,2);
 await assert.rejects(call('alice','plan.view-update',{id:result.data.id,patch:{name:'stale'},expectedRevision:1},'stale'),/changed/i);
 assert.equal(saved.list({}, {kind:'agent',agentId:'alice'})[10].name,'Verified');
 assert.equal(fs.existsSync(path.join(home,'plans.json')),false,'views must not create/edit native schedules');
 await assert.rejects(call('alice','plan.view-delete',{id:'board'},'delete-builtin'),/Built-in/i);
 const removed=await call('alice','plan.view-delete',{id:result.data.id,expectedRevision:2},'delete-view');
 assert.equal(removed.data.deleted,true);
 assert.equal((await call('alice','plan.views')).data.length,10);
 assert.equal(fs.existsSync(path.join(home,'plans.json')),false);
});

test('Aexus-compatible schema rejects unsafe fields and malformed layout options',async()=>{
 assert.throws(()=>saved.create({spec:{name:'Unknown',layout:'guardian'}}),/Invalid Plan layout/);
 assert.throws(()=>saved.create({spec:{name:'Invalid',layout:'table',options:{timezone:'No_Such/Zone'}}}),/time zone|timezone|invalid/i);
 assert.throws(()=>saved.create({spec:{name:'Invalid',layout:'table',options:{hiddenAdmin:true}}}),/Unknown Plan view field/);
 assert.throws(()=>saved.create({spec:{name:'Invalid',layout:'table',filter:{states:['arbitrary']}}}),/Invalid states/);
 assert.throws(()=>saved.create({spec:{name:'Invalid',layout:'table',filter:{employee:'self'}}}),/authenticated Agent/);
 const operator=await core.dispatch('plan.view-create',{spec:{name:'Shared',layout:'list'}});
 assert.deepEqual(operator.owner,{kind:'operator'});
 await assert.rejects(call('alice','plan.view-delete',{id:operator.id},'alice-user-view'),/unauthorized/i);
 assert.equal((await core.dispatch('plan.view-delete',{id:operator.id})).deleted,true);
});
