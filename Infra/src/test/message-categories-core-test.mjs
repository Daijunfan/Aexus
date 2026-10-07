// Disposable Core and canonical source IDs; no real subscriptions, hosts or model calls.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {inCategory} from '../shared/message-categories.ts'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/message-categories');fs.mkdirSync(out,{recursive:true})
const app=await profileApplication();let f;const checks=[]
try{
 f=await fixtureCore({},path.join(app.directory,'.aexus/out/main/daemon.js'))
 const rpc=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.ok(r.ok,r.error);return r.data},deny=async(cmd,args,token=null)=>assert.equal((await f.request(token,cmd,args)).ok,false)
 await f.cli('group','add','Product');await f.cli('group','add','Research')
 const a=await f.create('Alex','Product'),b=await f.create('Alex','Research'),secretary=await f.create('Secretary','Product','secretary'),ordinary=await f.token(a.id),admin=await f.token(secretary.id)
 const group=await rpc('chat.create',{name:'Release room',members:[a.id,b.id]})
 const sources=[];for(const [plugin,locator,name] of [['x','@category_a','Same name'],['x','@category_b','Same name'],['youtube','@category_video','Same name'],['telegram','category_news','News desk']])sources.push(await rpc('channel.source-add',{plugin,locator,name}))
 const [x1,x2,youtube,telegram]=sources;assert.equal(x1.channelId,x2.channelId)
 assert.equal((await rpc('api.describe',{command:'messenger.social'})).readOnly,true)
 assert.equal((await rpc('api.describe',{command:'messenger.folder-save'})).readOnly,false)
 const originals={employees:(await rpc('session.list')).sessions.map(s=>[s.id,s.cwd,s.engine,s.threadId]),channels:(await rpc('channel.list')).map(c=>c.id)}
 const publish=async(source,externalId,title='Report')=>rpc('channel.publish',{sourceId:source.id,externalId,publishedAt:Date.now()-2000,title,body:'Evidence for '+source.locator})
 const p1=await publish(x1,'one','Alpha report'),p2=await publish(x2,'two','Beta report');await publish(youtube,'video');await publish(telegram,'news')
 const before=await rpc('messenger.state'),social=await rpc('messenger.social');assert.equal(social.length,4);assert.equal(social.filter(s=>s.name==='Same name').length,3);assert.equal(new Set(social.map(s=>s.key)).size,4)
 assert.equal(social.find(s=>s.id===x1.id).unreadCount,1);assert.equal(social.find(s=>s.id===x1.id).lastPost.title,'Alpha report');assert.equal(social.find(s=>s.id===x2.id).lastPost.title,'Beta report')
 assert.deepEqual(await rpc('messenger.state'),before);assert.deepEqual((await rpc('channel.list')).map(c=>c.id),originals.channels);await deny('messenger.social',{},ordinary);assert.equal((await rpc('messenger.social',{platform:'x'},admin)).length,2)
 checks.push('Telegram/X/YouTube sources are equal independent list identities, including duplicate names; discovery copies no channel/history and acknowledges no news')
 const saved=async(name,include,conversations=[])=>{const state=await rpc('messenger.folder-save',{name,conversations,...(include?{include}:{})});return state.folders.find(c=>c.name===name)}
 let direct=await saved('People','private'),groups=await saved('Teams','groups'),reading=await saved('Reading','x')
 const entries=[...sources.map(s=>({key:'source:'+s.id,kind:'source',platform:s.plugin})),{key:'employee:'+a.id,kind:'employee'},{key:'group:'+group.id,kind:'group'}]
 assert.deepEqual(entries.filter(e=>inCategory(reading,e)).map(e=>e.key),['source:'+x1.id,'source:'+x2.id]);assert.equal(entries.filter(e=>inCategory(direct,e)).length,1);assert.equal(entries.filter(e=>inCategory(groups,e)).length,1)
 await rpc('messenger.reorder',{scope:reading.id,order:['source:'+x2.id,'source:'+x1.id],expectedOrder:[]});await deny('messenger.reorder',{scope:direct.id,order:['source:'+x1.id]})
 await deny('messenger.folder-save',{name:'Unauthorized',conversations:[],include:'private'},ordinary)
 const x3=await rpc('channel.source-add',{plugin:'x',locator:'@newcat_author',name:'New author'});assert.ok(inCategory(reading,{key:'source:'+x3.id,kind:'source',platform:'x'}))
 reading=(await rpc('messenger.folder-save',{id:reading.id,name:reading.name,conversations:[],include:'x',excluded:['source:'+x2.id],expectedRevision:reading.revision})).folders.find(c=>c.id===reading.id)
 assert.equal(inCategory(reading,{key:'source:'+x2.id,kind:'source',platform:'x'}),false);assert.ok(inCategory(reading,{key:'source:'+x3.id,kind:'source',platform:'x'}))
 await deny('messenger.folder-save',{id:reading.id,name:'stale',conversations:[],include:'x',expectedRevision:0})
 const manual=(await f.cli('messenger','folder-save','--id',reading.id,'--name','Curated','--conversations',JSON.stringify(['source:'+x1.id]),'--include','null','--excluded','[]','--expected-revision',String(reading.revision))).folders.find(c=>c.id===reading.id)
 assert.equal(manual.include,undefined);assert.equal(inCategory(manual,{key:'source:'+x3.id,kind:'source',platform:'x'}),false)
 checks.push('Private/group/platform rules, future matching entries, exclusions, manual subsets, guarded ordering and CLI rule removal preserve category revisions')
 await rpc('messenger.draft',{conversation:'employee:'+a.id,text:'Unsent private draft',clientMessageId:'untouched'})
 await rpc('messenger.conversation',{conversations:['employee:'+a.id,'group:'+group.id,'channel:'+youtube.channelId,'source:'+x1.id],patch:{archived:true}})
 const preferences=await rpc('messenger.state');assert.equal(Object.values(preferences.conversations).filter(v=>v.archived).length,4)
 await rpc('channel.acknowledge',{id:x1.channelId,all:true,sourceId:x1.id})
 const after=await rpc('messenger.social');assert.equal(after.find(s=>s.id===x1.id).unreadCount,0);assert.equal(after.find(s=>s.id===x2.id).unreadCount,1)
 await deny('channel.acknowledge',{id:youtube.channelId,all:true,sourceId:x1.id});await deny('channel.acknowledge',{id:x1.channelId,all:true,sourceId:x2.id},admin)
 assert.equal((await rpc('channel.read-state',{id:x1.channelId,entryIds:[p1.id,p2.id]})).entries.find(e=>e.id===p2.id).state,'unread')
 assert.equal((await rpc('messenger.state')).drafts['employee:'+a.id].text,'Unsent private draft')
 checks.push('Source archive preferences and exact-source mark-read do not touch peer posts, private drafts or any other archive state')
 await f.cli('view','load-engine','workspace-audit')
 const selected=await f.cli('view','open','messages','--source',x1.id);assert.equal(selected.sourceId,x1.id);assert.equal(selected.channelId,x1.channelId)
 await deny('view.open',{kind:'messages',channelId:youtube.channelId,sourceId:x1.id});await deny('view.open',{kind:'messages',sourceId:'missing'});await deny('view.open',{kind:'conversation',employee:a.id,sourceId:x1.id})
 const destination=await rpc('channel.create',{name:'Moved research',engine:{kind:'external',location:'local',name:'Fixture collector'}})
 await rpc('channel.source-update',{id:x1.id,patch:{channelId:destination.id,name:'Renamed author'}})
 const moved=await f.cli('view','open','messages','--source',x1.id);assert.equal(moved.channelId,destination.id)
 assert.equal((await rpc('channel.posts',{sourceId:x1.id})).posts[0].id,p1.id);assert.equal((await rpc('messenger.social')).find(s=>s.id===x1.id).unreadCount,0)
 await rpc('channel.source-remove',{id:x1.id});assert.ok(!(await rpc('messenger.social')).some(s=>s.id===x1.id));assert.ok((await rpc('messenger.social',{includeDisabled:true})).some(s=>s.id===x1.id))
 checks.push('Source-only CLI navigation validates parent identity; author renames, rerouting and disabling preserve retained posts and per-post read receipts')
 for(const folder of (await rpc('messenger.state')).folders)await rpc('messenger.folder-delete',{id:folder.id,expectedRevision:folder.revision})
 assert.equal((await rpc('messenger.state')).folders.length,0);assert.deepEqual((await rpc('session.list')).sessions.map(s=>[s.id,s.cwd,s.engine,s.threadId]),originals.employees)
 await f.stop();await f.start();const restored=await rpc('messenger.state');assert.deepEqual(restored.drafts,preferences.drafts);assert.deepEqual(restored.conversations,preferences.conversations);assert.equal(restored.folders.length,0)
 assert.equal((await rpc('channel.posts',{sourceId:x1.id})).posts[0].id,p1.id);await deny('messenger.folder-save',{name:'Bad',conversations:['source:invalid']})
 checks.push('Deleting every category and restarting preserves employees, source histories, preferences and drafts; invalid IDs fail before writes')
 fs.writeFileSync(path.join(out,'core.json'),JSON.stringify({passed:true,checks,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(s=>'PASS '+s).join('\n'))
}finally{await f?.close();app.dispose()}
