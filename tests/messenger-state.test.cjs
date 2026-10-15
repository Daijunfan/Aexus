const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-messenger-aexus-'));
process.env.CLOUD_HOSTS_HOME=home;
const sessions=require('../src/agent-sessions.cjs'),prior=sessions.sessions;
const people=[
 {id:'alpha',name:'Alpha native',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,permission:'full',threadId:'tid-alpha'},
 {id:'beta',name:'Beta native',engine:'claude',transport:'pty',targetHostId:'local',engineHostId:'local',cwd:home,permission:'ask'},
];
sessions.sessions=()=>people;
const groups=require('../src/collaboration.cjs'),journal=require('../src/session-journal.cjs');
const core=require('../src/core.cjs'),messenger=require('../src/messenger-state.cjs'),contracts=require('../src/api-contracts.cjs');
const alpha=people[0],room=groups.create({name:'Engineering',memberIds:['alpha','beta']});
const message=groups.post({id:room.id,text:'Release checklist',kind:'note'}, {kind:'operator',name:'You'});
const privateMessage=journal.append({sessionId:'alpha',nativeThreadId:'tid-alpha',kind:'assistant',key:'answer-one',text:'Native integration verified'});
after(()=>{sessions.sessions=prior;fs.rmSync(home,{recursive:true,force:true})});

test('Aexus Messenger favorites, pins, archives are source-backed metadata, not second chat store',async()=>{
 const state=await core.dispatch('messenger.state');
 assert.equal(state.revision,0);assert.deepEqual(state.messages,{});
 const changed=await core.dispatch('messenger.conversation',{conversations:['employee:alpha','group:'+room.id],
  patch:{favorite:true,pinned:true}});
 assert.equal(changed.revision,1);
 assert.equal(changed.conversations['agent:alpha'].pinned,true);
 assert.equal(changed.conversations['group:'+room.id].favorite,true);
 const directory=await core.dispatch('messenger.directory',{type:'favorites'});
 assert.equal(directory.total,2);
 assert.deepEqual(new Set(directory.entries.map(row=>row.key)),new Set(['agent:alpha','group:'+room.id]));
 const oldCount=groups.messages({id:room.id}).messages.length;
 await core.dispatch('messenger.conversation',{conversations:['group:'+room.id],patch:{archived:true}});
 assert.equal((await core.dispatch('messenger.directory',{type:'group'})).total,0);
 assert.equal((await core.dispatch('messenger.directory',{type:'group',archived:'only'})).total,1);
 assert.equal(groups.messages({id:room.id}).messages.length,oldCount,'archiving personal view cannot archive or delete original group');
 assert.equal(groups.get({id:room.id}).archived,false);
});

test('drafts persist across a new Core process and stale expected key never removes another draft',async()=>{
 const saved=await core.dispatch('messenger.draft',{conversation:'group:'+room.id,text:'@Alpha: review the docs',
  mentions:['alpha'],replyTo:message.id,clientMessageId:'draft-case-001'});
 assert.equal(saved.drafts['group:'+room.id].replyTo,message.id);
 assert.equal(saved.drafts['group:'+room.id].mentions[0],'alpha');
 const {spawnSync}=require('node:child_process');
 const other=spawnSync(process.execPath,['-e',"process.env.CLOUD_HOSTS_HOME=process.argv[1];const state=require(process.argv[2]).state();console.log(JSON.stringify(state.drafts))",home,path.resolve(__dirname,'../src/messenger-state.cjs')],{encoding:'utf8'});
 assert.equal(other.status,0,other.stderr);
 assert.equal(JSON.parse(other.stdout)['group:'+room.id].text,'@Alpha: review the docs');
 const stale=await core.dispatch('messenger.draft',{conversation:'group:'+room.id,text:'',
  expectedClientMessageId:'wrong-draft-key'});
 assert.equal(stale.drafts['group:'+room.id].text,'@Alpha: review the docs');
 const removed=await core.dispatch('messenger.draft',{conversation:'group:'+room.id,text:'',
  expectedClientMessageId:'draft-case-001'});
 assert.equal(removed.drafts['group:'+room.id],undefined);
 assert.equal(groups.messages({id:room.id}).messages.length,1,'draft save/clear cannot post a message');
});

test('saved message preferences require actual published or native text messages',async()=>{
 await assert.rejects(core.dispatch('messenger.message',{conversation:'group:'+room.id,id:'gm_imaginary',patch:{saved:true}}),/Unknown published group message/);
 await assert.rejects(core.dispatch('messenger.message',{conversation:'agent:alpha',id:'ne_other',patch:{saved:true}}),/Unknown real native message/);
 const prefs=await core.dispatch('messenger.message',{conversation:'group:'+room.id,id:message.id,patch:{saved:true,pinned:true}});
 assert.equal(prefs.messages['group:'+room.id+':'+message.id].saved,true);
 await core.dispatch('messenger.message',{conversation:'agent:alpha',id:privateMessage.id,patch:{saved:true,reaction:'heart'}});
 const saved=await core.dispatch('messenger.search',{filter:'saved'});
 assert.equal(saved.total,2);assert.equal(saved.readOnly,true);
 assert.ok(saved.messages.some(row=>row.id===privateMessage.id&&row.conversation==='agent:alpha'));
 assert.ok(saved.messages.some(row=>row.id===message.id&&row.conversation==='group:'+room.id));
 assert.equal((await core.dispatch('messenger.search',{query:'RELEASE',conversation:'group:'+room.id})).total,1);
 const hide=await core.dispatch('messenger.message',{conversation:'group:'+room.id,id:message.id,patch:{hidden:true}});
 assert.equal(hide.messages['group:'+room.id+':'+message.id].hidden,true);
 assert.equal((await core.dispatch('messenger.search',{query:'release'})).total,0);
 assert.equal(groups.messages({id:room.id}).messages[0].id,message.id,'private hidden preference does not alter publication');
});

test('personal folders and reorder survive edits without deleting messages or sessions',async()=>{
 const first=await core.dispatch('messenger.folder-save',{name:'Release favorites',conversations:['employee:alpha'],
  include:'favorites'});
 assert.match(first.id,/^mf_/);
 assert.equal(first.revision,1);
 const rows=await core.dispatch('messenger.directory',{folder:first.id,archived:'include'});
 assert.equal(rows.entries.some(row=>row.key==='agent:alpha'),true);
 assert.equal(rows.entries.some(row=>row.key==='group:'+room.id),true);
 await assert.rejects(core.dispatch('messenger.folder-save',{id:first.id,name:'Stale',expectedRevision:0}),/Folder revision changed/);
 const second=await core.dispatch('messenger.folder-save',{id:first.id,name:'Updated',conversations:['employee:alpha'],include:'explicit',expectedRevision:1});
 assert.equal(second.revision,2);
 await core.dispatch('messenger.reorder',{scope:'all',order:['group:'+room.id,'agent:alpha']});
 assert.equal((await core.dispatch('messenger.state')).orders.all[0],'group:'+room.id);
 assert.deepEqual(await core.dispatch('messenger.folder-delete',{id:first.id,expectedRevision:2}),{deleted:true,id:first.id});
 assert.equal((await core.dispatch('messenger.directory',{type:'all',archived:'include'})).total,3);
 assert.equal(groups.messages({id:room.id}).messages.length,1);
});

test('Agent cloud_api cannot call user-only Messenger preferences or index',async()=>{
 for(const name of ['messenger.state','messenger.directory','messenger.search','messenger.conversation','messenger.draft']){
  assert.equal(contracts.lookup(name).agentCallable,false);
  assert.equal(contracts.lookup(name).contractStatus,'strict');
 }
 const api=require('../src/collaboration-mcp.cjs');
 const native={role:{...alpha},threadId:'tid-alpha',busy:true,dead:false,toolScope:{source:'private',agentId:'alpha',turnId:'turn-x'}};
 await assert.rejects(api.invoke(native,'cloud_api',{command:'messenger.state',args:{}},'forbidden-user-state'),/unavailable to this Agent/);
});
