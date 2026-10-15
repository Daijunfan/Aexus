const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-channel-agent-'));
process.env.CLOUD_HOSTS_HOME=home;
const sessions=require('../src/agent-sessions.cjs'),old=sessions.sessions;
const people=['publisher','reader','outsider'].map(id=>({id,name:id+' agent',engine:'codex',
 transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'thread-'+id,permission:'full',running:true,busy:false}));
sessions.sessions=()=>people;
const channels=require('../src/channels.cjs'),core=require('../src/core.cjs');
const contracts=require('../src/api-contracts.cjs'),mcp=require('../src/collaboration-mcp.cjs');
const room=channels.dispatch('channel.create',{name:'Release channel',memberIds:['publisher','reader'],
 publisherIds:['publisher'],ownerId:'publisher'});
const other=channels.dispatch('channel.create',{name:'Private room',memberIds:['outsider'],publisherIds:[]});
const native=(id='publisher',source='private')=>({role:people.find(row=>row.id===id),threadId:'thread-'+id,
 busy:true,dead:false,toolScope:{source,agentId:id,turnId:'turn-'+id}});
let sequence=0;
const api=(id,method,args={},source='private')=>mcp.invoke(native(id,source),'cloud_api',
 {command:method,args},'channel-call-'+(++sequence));
after(()=>{sessions.sessions=old;fs.rmSync(home,{recursive:true,force:true})});

test('channel Core exposes machine schemas and an executable Agent discovery chain',async()=>{
 const index=contracts.list({prefix:'channel.',agentOnly:true});
 assert.equal(index.length,8);
 const metadata=contracts.metadata();assert.equal(metadata.apiVersion,'1.1.0');
 const docs=await mcp.invoke(native(),'cloud_docs',{operation:'search',search:'channel',agentOnly:true},'discover');
 assert.ok(docs.commands.some(row=>row.name==='channel.publish'));
 const details=await mcp.invoke(native(),'cloud_docs',{operation:'describe',command:'channel.publish'},'describe');
 assert.equal(details.effect,'publish');assert.ok(details.inputSchema.required.includes('externalId'));
 assert.equal((await api('publisher','channel.list')).data[0].id,room.id);
 assert.deepEqual((await api('outsider','channel.list')).data.map(row=>row.id),[other.id]);
 assert.equal((await core.dispatch('channel.get',{id:room.id})).id,room.id);
 const publish=await api('publisher','channel.publish',{channelId:room.id,externalId:'agent-announcement',title:'Build verified',
  body:'Tests green',publishedAt:Date.now()});
 assert.equal(publish.data.status,'created');const article=publish.data.id;
 const detail=(await api('reader','channel.post',{id:article})).data;
 assert.equal(detail.author.id,'publisher');
 await assert.rejects(api('reader','channel.publish',{channelId:room.id,externalId:'unauthorized',title:'Cannot',body:'Forbidden'}),/publishing permission/);
 await assert.rejects(api('outsider','channel.get',{id:room.id}),/membership/);
 await assert.rejects(api('publisher','channel.create',{name:'illegal'}),/unavailable to this Agent/);
 const reply=await api('reader','channel.message-post',{id:room.id,text:'Follow up review',replyTo:article},'plan');
 assert.equal(reply.data.replyTo,article);assert.equal(reply.data.author.id,'reader');
 assert.equal((await api('publisher','channel.timeline',{id:room.id})).data.entries.length,2);
 assert.equal((await core.dispatch('channel.read-state',{id:room.id,entryIds:[article]})).entries[0].read,false);
 await core.dispatch('channel.acknowledge',{id:room.id,entryIds:[article]});
 assert.equal((await core.dispatch('channel.read-state',{id:room.id,entryIds:[article]})).entries[0].read,true);
});

test('Ask approval cannot outlive removal of a Channel publisher grant',async()=>{
 const fake=native('publisher');
 fake.role={...fake.role,permission:'ask'};
 let asked=0;
 const previous=channels.dispatch('channel.timeline',{id:room.id}).entries.length;
 fake.approveApi=async()=>{asked++;
  channels.dispatch('channel.update',{id:room.id,expectedRevision:1,publisherIds:[]});
 };
 await assert.rejects(mcp.invoke(fake,'cloud_api',{command:'channel.publish',args:{
  channelId:room.id,externalId:'after-revoke',title:'Do not publish',body:'Permission revoked',
  publishedAt:Date.now()}},'approval-revoked'),/grants changed/);
 assert.equal(asked,1);
 assert.equal(channels.dispatch('channel.timeline',{id:room.id}).entries.length,previous);
 await assert.rejects(api('publisher','channel.publish',{channelId:room.id,externalId:'after-revoke-2',
  title:'Forbidden',body:'Forbidden'}),/publishing permission/);
 assert.equal(channels.dispatch('channel.get',{id:room.id}).publisherIds.length,0);
});

test('API does not expose controller credentials, collector bearer token or another Channel source to Agent',async()=>{
 const ext=await core.dispatch('channel.create',{name:'Collector channel',mode:'external',memberIds:['reader']});
 const source=await core.dispatch('channel.source-add',{channelId:ext.id,plugin:'process',locator:'local news collector'});
 const issued=await core.dispatch('channel.collector-add',{name:'collector',sourceIds:[source.id]});
 assert.ok(issued.token.startsWith('news_'));
 assert.equal((await core.dispatch('channel.collectors'))[0].token,undefined);
 await assert.rejects(api('reader','channel.collectors'),/unavailable to this Agent/);
 await assert.rejects(api('reader','channel.publish',{sourceId:source.id,externalId:'spoof',title:'fake',body:'fake'}),/unauthorized|publisher|source IDs/);
 await assert.rejects(api('publisher','channel.posts',{channelId:ext.id}),/membership/);
 assert.equal((await core.dispatch('channel.sources',{channelId:ext.id})).length,1);
 const ingest=channels.ingest(issued.token,{method:'publish',args:{sourceId:source.id,externalId:'external-42',
  title:'External article',body:'Ingested',publishedAt:Date.now()}});
 assert.equal(ingest.status,'created');
 assert.equal((await api('reader','channel.timeline',{id:ext.id})).data.entries.length,1);
 assert.equal((await api('publisher','channel.posts')).data.posts.some(row=>row.id===ingest.id),false);
});
