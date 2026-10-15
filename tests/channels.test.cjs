const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-channels-'));
process.env.CLOUD_HOSTS_HOME=home;
const sessions=require('../src/agent-sessions.cjs'),old=sessions.sessions;
const people=[
 {id:'editor',name:'Editor',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'editor-thread',permission:'full'},
 {id:'member',name:'Member',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'member-thread',permission:'full'},
 {id:'other',name:'Other',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'other-thread',permission:'full'},
];
sessions.sessions=()=>people;
const channels=require('../src/channels.cjs'),act={kind:'agent',agentId:'editor'},viewer={kind:'agent',agentId:'member'},outsider={kind:'agent',agentId:'other'};
const call=(method,args={},actor={kind:'operator'})=>channels.dispatch('channel.'+method,args,actor);
const managed=call('create',{name:'Engineering bulletin',mode:'agents',memberIds:['editor','member'],publisherIds:['editor'],ownerId:'editor'});
const external=call('create',{name:'External news',mode:'external',memberIds:['member']});
after(()=>{sessions.sessions=old;fs.rmSync(home,{recursive:true,force:true})});

test('channel identity and membership persist in the single SQLite business store',()=>{
 assert.ok(managed.id.startsWith('nc_'));
 assert.equal(managed.ownerId,'editor');
 assert.deepEqual(managed.publisherIds,['editor']);
 assert.deepEqual(call('list',{},viewer).map(row=>row.id).sort(),[managed.id,external.id].sort());
 assert.deepEqual(call('list',{},act).map(row=>row.id),[managed.id]);
 assert.deepEqual(call('list',{},outsider),[]);
 assert.throws(()=>call('get',{id:managed.id},outsider),/membership/);
 assert.throws(()=>call('create',{name:'Bad'},act),/operator/);
 assert.throws(()=>call('update',{id:managed.id,name:'Bad'},act),/operator/);
 assert.throws(()=>call('create',{name:'Invalid members',memberIds:['imaginary']}),/Unknown Agent/);
 assert.throws(()=>call('update',{id:managed.id,memberIds:['member']}),
  /Owner/, 'removing Owner requires explicit handoff');
 const saved=call('update',{id:managed.id,memberIds:['editor','member'],publisherIds:['editor'],expectedRevision:1});
 assert.equal(saved.revision,2);
 assert.throws(()=>call('update',{id:managed.id,name:'Stale',expectedRevision:1}),/changed/);
});

test('real news IDs, deduplication, paged history, exact replies and protected publications',()=>{
 const payload={channelId:managed.id,externalId:'announcement-01',title:'Week 42 ship',body:'Release notes',publishedAt:Date.now()};
 const added=call('publish',payload,act);
 assert.equal(added.status,'created');
 assert.equal(call('publish',payload,act).status,'duplicate');
 assert.throws(()=>call('publish',{...payload,body:'Tamper'},act),/reused/);
 assert.throws(()=>call('publish',{...payload,externalId:'deny-member'},viewer),/publishing permission/);
 assert.throws(()=>call('publish',{...payload,externalId:'deny-other'},outsider),/membership/);
 const news=call('post',{id:added.id},viewer);
 assert.equal(news.title,'Week 42 ship');
 const reply=call('message-post',{id:managed.id,replyTo:added.id,text:'Reviewer note',kind:'decision',
  clientMessageId:'channel-reply-001'},viewer);
 assert.equal(reply.kind,'message');assert.equal(reply.replyTo,added.id);
 assert.equal(reply.replyPreview.title,'Week 42 ship');
 assert.equal(call('message-post',{id:managed.id,replyTo:added.id,text:'Reviewer note',kind:'decision',
  clientMessageId:'channel-reply-001'},viewer).id,reply.id);
 assert.throws(()=>call('message-post',{id:managed.id,replyTo:added.id,text:'Other',
  clientMessageId:'channel-reply-001'},viewer),/reused/);
 const full=call('timeline',{id:managed.id},act);
 assert.deepEqual(full.entries.map(x=>x.id),[added.id,reply.id]);
 assert.equal(call('history',{id:managed.id},act).entries.length,1);
 assert.equal(call('timeline',{id:managed.id,kind:'news'},viewer).entries.length,1);
 assert.throws(()=>call('timeline',{id:managed.id},outsider),/membership/);
 const first=call('timeline',{id:managed.id,limit:1},act);
 assert.equal(first.entries.length,1);assert.equal(first.entries[0].id,reply.id);assert.ok(first.nextCursor);
 const older=call('timeline',{id:managed.id,limit:1,cursor:first.nextCursor},act);
 assert.equal(older.entries[0].id,added.id);
 assert.throws(()=>call('timeline',{id:external.id,cursor:first.nextCursor},viewer),/cursor belongs/);
});

test('user read receipts are separate from publication, and saved news is retained until explicit deletion',()=>{
 const before=call('timeline',{id:managed.id});
 const ids=before.entries.map(row=>row.id);
 assert.ok(before.unreadCount>=2,'reading timeline must not acknowledge anything');
 const state=call('read-state',{id:managed.id,entryIds:ids});
 assert.ok(state.entries.every(row=>!row.read));
 const receipt=call('acknowledge',{id:managed.id,entryIds:[ids[0]]});
 assert.equal(receipt.acknowledged,1);
 assert.equal(call('acknowledge',{id:managed.id,entryIds:[ids[0]]}).acknowledged,0);
 assert.equal(call('read-state',{id:managed.id,entryIds:[ids[0]]}).entries[0].read,true);
 assert.throws(()=>call('acknowledge',{id:external.id,entryIds:[ids[0]]}),/another channel/);
 assert.throws(()=>call('acknowledge',{id:managed.id,entryIds:[ids[0]]},act),/operator/);
 const news=before.entries.find(row=>row.kind==='news');
 assert.equal(call('save',{id:news.id,saved:true}).saved,true);
 assert.ok(call('posts',{channelId:managed.id,saved:true}).posts.some(item=>item.id===news.id));
 assert.equal(call('acknowledge',{id:managed.id,all:true}).unreadCount,0);
 assert.equal(call('save',{id:news.id,saved:false}).saved,false);
 assert.equal(call('delete',{id:news.id}).deleted,true);
 assert.throws(()=>call('post',{id:news.id}),/unavailable/);
 assert.throws(()=>call('save',{id:news.id,saved:true}),/no longer/);
 assert.equal(call('timeline',{id:managed.id,kind:'news'}).entries.length,0);
});

test('collector capability may ingest only assigned sources and cannot impersonate Agent or Core',()=>{
 const x=call('source-add',{channelId:external.id,plugin:'x',locator:'@OpenAI',name:'OpenAI posts'});
 const yt=call('source-add',{channelId:external.id,plugin:'youtube',locator:'@ExampleChannel',name:'Example videos'});
 assert.equal(x.locator,'openai');
 assert.equal(call('sources',{channelId:external.id}).length,2);
 assert.throws(()=>call('source-add',{channelId:managed.id,plugin:'x',locator:'@other'}),/external/);
 assert.throws(()=>call('source-add',{channelId:external.id,plugin:'x',locator:'https:\/\/evil.example\/openai'}),/profile handle/);
 const issued=call('collector-add',{name:'news collector',sourceIds:[x.id]});
 assert.match(issued.token,/^news_[a-f0-9]{64}$/);
 assert.equal(call('collectors')[0].token,undefined);
 assert.equal(channels.ingest(issued.token,{method:'config'}).sources.length,1);
 const published=channels.ingest(issued.token,{method:'publish',args:{sourceId:x.id,externalId:'news#one',
  publishedAt:Date.now(),title:'Article',body:'Body from collector',authorName:'Forgery attempt'}});
 assert.equal(published.status,'created');
 assert.equal(call('post',{id:published.id}).authorName,'OpenAI posts');
 assert.equal(call('post',{id:published.id}).author.kind,'collector');
 assert.throws(()=>channels.ingest(issued.token,{method:'publish',args:{sourceId:yt.id,externalId:'unauthorized',
  title:'Stolen',body:'Bad'}}),/unauthorized/);
 assert.throws(()=>channels.ingest(issued.token,{method:'publish',args:{channelId:external.id,
  externalId:'forge',title:'Bad',body:'Bad'}}),/unauthorized/);
 assert.throws(()=>channels.ingest(issued.token,{method:'channel.update',args:{id:external.id}}),/only read|only.*publish/);
 assert.equal(call('collector-revoke',{id:issued.collector.id}).revoked,true);
 assert.throws(()=>channels.ingest(issued.token,{method:'config'}),/revoked/);
 assert.throws(()=>call('source-update',{id:x.id,patch:{locator:'@changed'}}),/unknown Channel fields/i);
});

test('news search, source filters and expiry have real backend behavior with tombstones',()=>{
 const x=call('sources',{channelId:external.id}).find(row=>row.plugin==='x');
 const y=call('sources',{channelId:external.id}).find(row=>row.plugin==='youtube');
 const first=call('publish',{sourceId:x.id,externalId:'manual-01',title:'Alpha headline',body:'Facts',publishedAt:Date.now()});
 const second=call('publish',{sourceId:y.id,externalId:'manual-02',title:'Beta headline',body:'Facts',publishedAt:Date.now()});
 assert.deepEqual(new Set(call('posts',{channelId:external.id,query:'headline'}).posts.map(row=>row.id)),
  new Set([first.id,second.id]));
 assert.equal(call('posts',{sourceId:y.id}).posts.length,1);
 assert.equal(call('posts',{sourceId:y.id},viewer).posts.length,1);
 assert.throws(()=>call('posts',{sourceId:y.id},act),/membership/);
 const oldTime=Date.now()-9*86400000;
 const expired=call('publish',{sourceId:y.id,externalId:'very-old',title:'Stale',body:'Expired',
  publishedAt:oldTime});
 assert.equal(expired.status,'expired');
 assert.throws(()=>call('post',{id:expired.id}),/expired|unavailable/);
 assert.equal(call('publish',{sourceId:y.id,externalId:'very-old',title:'Stale',body:'Expired',
  publishedAt:oldTime}).status,'expired');
});
