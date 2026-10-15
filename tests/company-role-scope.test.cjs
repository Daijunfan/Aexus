const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-action-policy-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),original=agents.sessions;
const members=[
 {id:'lead',name:'Lead',engine:'codex',transport:'native',threadId:'thread-lead',engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'},
 {id:'peer',name:'Peer Manager',engine:'codex',transport:'native',threadId:'thread-peer',engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'},
 {id:'worker',name:'Worker',engine:'codex',transport:'native',threadId:'thread-worker',engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'},
 {id:'outside',name:'Outside',engine:'codex',transport:'native',threadId:'thread-outside',engineHostId:'remote',targetHostId:'remote',cwd:'/srv/work',permission:'full'},
 {id:'coordinator',name:'Coordinator',engine:'codex',transport:'native',threadId:'thread-coordinator',engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'},
 {id:'administrator',name:'Admin',engine:'codex',transport:'native',threadId:'thread-admin',engineHostId:'local',targetHostId:'local',cwd:home,permission:'full'},
];
agents.sessions=()=>members;
const company=require('../src/company.cjs'),groups=require('../src/collaboration.cjs');
const mcp=require('../src/collaboration-mcp.cjs');
after(()=>{agents.sessions=original;fs.rmSync(home,{recursive:true,force:true})});
const actor=id=>({kind:'agent',agentId:id});
const native=id=>({role:members.find(row=>row.id===id),threadId:'thread-'+id,busy:true,dead:false,
 toolScope:{source:'private',agentId:id,turnId:'turn-'+id}});
const api=(id,command,args,key)=>mcp.invoke(native(id),'cloud_api',{command,args},key);
const team=company.createTeam({name:'Shared project',memberIds:['lead','peer','worker']});
company.createTeam({name:'External project',memberIds:['outside']});
company.assignRole({agentId:'lead',role:'manager'});
company.assignRole({agentId:'peer',role:'manager'});
company.assignRole({agentId:'coordinator',role:'coordinator'});
company.assignRole({agentId:'administrator',role:'administrator'});

test('Aexus-style role matrix separates read, delegation, scheduling, configuration and scope',()=>{
 const can=(id,target,action)=>company.canManage(actor(id),target,action);
 assert.equal(can('lead','peer','read'),true,'manager can inspect peer metadata in same Team');
 for(const action of ['delegate','schedule','configure','teamMembership'])
  assert.equal(can('lead','peer',action),false,'reading a peer cannot grant '+action);
 assert.equal(can('lead','worker','delegate'),true);
 assert.equal(can('lead','worker','configure'),true);
 assert.equal(can('lead','outside','read'),false);
 assert.equal(can('worker','worker','schedule'),true);
 assert.equal(can('worker','worker','configure'),false);
 assert.equal(can('coordinator','lead','delegate'),true);
 assert.equal(can('coordinator','coordinator','configure'),false);
 assert.equal(can('coordinator','administrator','read'),false);
 assert.equal(can('administrator','coordinator','configure'),true);
 assert.equal(can('administrator','outside','read'),true);
 assert.throws(()=>can('lead','worker','random-action'),/Unknown Company management action/);
});

test('a peer can join group collaboration without gaining Company authority',async()=>{
 assert.equal(company.canCollaborate(actor('worker'),'peer'),true);
 assert.equal(company.canCollaborate(actor('worker'),'outside'),false);
 const identity=await mcp.invoke(native('worker'),'cloud_docs',{operation:'identity'},'identity-worker');
 assert.deepEqual(identity.managedAgentIds,[]);
 assert.equal(identity.management.scope,'self');
 const made=await api('worker','messages.create',{name:'Peer dialogue',memberIds:['peer']},'create-peer-chat');
 assert.deepEqual(new Set(made.data.memberIds),new Set(['worker','peer']));
 assert.equal(company.canDelegate(actor('worker'),'peer'),false);
 await assert.rejects(api('worker','messages.create',{name:'Unauthorized join',memberIds:['outside']},'create-external-chat'),/outside shared team scope/);
 const note=await api('worker','messages.publish',{id:made.data.id,text:'Peer review request'},'worker-peer-note');
 assert.equal(note.data.recipientIds.length,0,'public notes must not fan out new native tasks');
});

test('Company team edits cannot silently revoke another manager or remove own membership',async()=>{
 await assert.rejects(api('lead','company.updateTeam',{id:team.id,memberIds:['lead','worker']},'remove-peer'),/outside management scope/);
 await assert.rejects(api('lead','company.updateTeam',{id:team.id,memberIds:['peer','worker']},'remove-self'),/cannot remove their own membership/);
 assert.equal(company.teams().find(row=>row.id===team.id).memberIds.length,3);
 const updated=await api('lead','company.updateTeam',{id:team.id,memberIds:['lead','peer']},'remove-worker');
 assert.ok(updated.data.revision>team.revision);
 assert.equal(company.canDelegate(actor('lead'),'worker'),false,'removal revokes management scope');
 assert.equal(company.canCollaborate(actor('lead'),'worker'),false,'removal revokes peer chat invitations');
});

test('retained external group members do not block a valid name edit by the Owner',async()=>{
 const old=groups.create({name:'Cross-team',memberIds:['worker','outside']});
 groups.update({id:old.id,ownerId:'worker'});
 const renamed=await api('worker','messages.update',{id:old.id,name:'Cross-team reviewed',memberIds:['worker','outside']},'keep-cross-team');
 assert.equal(renamed.data.name,'Cross-team reviewed');
});
