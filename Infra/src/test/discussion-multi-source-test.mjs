import {desktopExecutable} from './fixtures/desktop-app.mjs'
// One employee, several independent group/channel memberships, one native FIFO. No provider calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-discussion-sources-')),out=path.join(root,'.aexus/artifacts/discussion-multi-source')
const application=process.env.AGENTS_COMPANY_TEST_APP,mode=application?(path.resolve(application).startsWith('/Applications/')?'installed':'candidate'):'source',lifecycle=path.join(temp,'bundle-lifecycle.jsonl')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f;const checks=[],evidence={passed:false,mode,checks,providerCalls:0,scope:application?'Real supplied application ASAR Core, authenticated CLI/socket APIs and deterministic native MCP fixture in one disposable home.':'Real temporary source Core, authenticated APIs and deterministic native MCP fixture.'}
try{
 const original=fs.readFileSync(path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),'utf8'),codex=path.join(temp,'codex.cjs')
 const fixture=original.replace(/^const note=.*$/m,"const note=(suffix,value)=>{fs.writeFileSync(path.join(control,employee+'-'+suffix+'.json'),JSON.stringify(value));if(['ack','work','discussion-tool'].includes(suffix))fs.appendFileSync(path.join(control,employee+'-phases.jsonl'),JSON.stringify({phase:suffix,...value})+'\\n')}")
 assert.notEqual(fixture,original);fs.writeFileSync(codex,fixture,{mode:0o755})
 const entry=path.join(temp,'daemon.cjs'),overrides={CODEX_BIN:codex}
 if(application){
  const bundleRoot=application.endsWith('.app')?application:application.slice(0,application.indexOf('.app/')+4),executable=desktopExecutable(application)
  assert.ok(bundleRoot.endsWith('.app'),'AGENTS_COMPANY_TEST_APP must name a macOS app bundle or its executable')
  evidence.application=application;evidence.asarSha256=createHash('sha256').update(fs.readFileSync(path.join(bundleRoot,'Contents/Resources/app.asar'))).digest('hex')
  overrides.AGENTS_COMPANY_HIDDEN='1';overrides.AGENTS_COMPANY_BUILTIN_PLUGINS=path.join(bundleRoot,'Contents/Resources/plugins')
  fs.writeFileSync(entry,`
const fs=require('node:fs'),{_electron:electron}=require('@playwright/test');
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_WEB_URL','AGENTS_COMPANY_WEB','AGENTS_COMPANY_HEADLESS'])delete env[key];
let closing=false;
const record=value=>fs.appendFileSync(${JSON.stringify(lifecycle)},JSON.stringify(value)+'\\n');
const started=electron.launch({executablePath:${JSON.stringify(executable)},args:[],env}).then(async app=>{const hidden=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible()));record({event:'open',pid:app.process().pid,hidden});if(!hidden){await app.close();throw Error('Fixture bundle unexpectedly showed a window')}app.process().once('exit',()=>{if(!closing)process.exit(1)});return app});
const stop=()=>{if(closing)return;closing=true;void started.then(async app=>{const pid=app.process().pid;await app.close();record({event:'closed',pid});process.exit(0)},error=>{console.error(error.message);process.exit(1)})};
process.on('message',message=>{if(message?.type==='agents-company:shutdown')stop()});process.once('SIGTERM',stop);process.once('SIGINT',stop);process.once('disconnect',stop);
void started.catch(error=>{console.error(error.message);process.exit(1)});
`)
 }else await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore(overrides,entry)
 const rpc=async(cmd,args={},token=null)=>{const reply=await f.request(token,cmd,args);assert.ok(reply.ok,reply.error);return reply.data}
 const deny=async(cmd,args,token)=>{const reply=await f.request(token,cmd,args);assert.equal(reply.ok,false,cmd+' unexpectedly accepted a forbidden operation');return reply.error}
 await rpc('group.add',{name:'Multi-source studio'})
 const hub=await f.create('Shared participant','Multi-source studio'),peer=await f.create('Quiet participant','Multi-source studio'),outside=await f.create('Outside','Multi-source studio')
 const hubToken=await f.token(hub.id),peerToken=await f.token(peer.id),outsideToken=await f.token(outside.id)
 const file=(person,suffix)=>path.join(f.control,person.id+suffix),answer=(person,value)=>{fs.rmSync(file(person,'.ack-tool.json'),{force:true});fs.writeFileSync(file(person,'.ack-output.txt'),JSON.stringify(value))},hold=person=>fs.writeFileSync(file(person,'.hold-ack'),''),release=person=>fs.rmSync(file(person,'.hold-ack'),{force:true})
 const phases=person=>fs.existsSync(file(person,'-phases.jsonl'))?fs.readFileSync(file(person,'-phases.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[]
 const work=person=>phases(person).filter(value=>value.phase==='work'),readStarts=person=>phases(person).filter(value=>value.phase==='ack'&&!value.finishedAt)
 const idle=()=>f.until(async()=>(await Promise.all([f.status(hub.id),f.status(peer.id)])).every(status=>!status.busy),'all shared queues idle')
 const identity=async person=>{const card=(await rpc('session.list')).sessions.find(value=>value.id===person.id);return {id:card.id,engine:card.engine,cwd:card.cwd,group:card.group,managementRole:card.managementRole,threadId:card.threadId}}
 const transcript=person=>rpc('session.transcript',{employee:person.id})
 for(const person of [hub,peer]){await rpc('session.send',{employee:person.id,text:'Private baseline for '+person.title});await f.until(async()=>!(await f.status(person.id)).busy,'private baseline');answer(person,{text:null})}
 const baselineHub=await identity(hub),baselinePeer={identity:await identity(peer),transcript:(await transcript(peer)).items,lastReply:(await f.status(peer.id)).lastReply,works:work(peer).length}
 const rooms=[]
 for(const type of ['group','group','channel','channel']){
  const room=await rpc(type==='group'?'chat.create':'channel.create',{name:'Same visible name',...(type==='group'?{members:[hub.id,peer.id]}:{engine:{kind:'external',location:'local',name:'Fixture publisher'}})})
  if(type==='channel')await rpc('channel.update',{id:room.id,adminIds:[hub.id,peer.id],expectedRevision:room.revision})
  rooms.push({type,id:room.id,name:room.name})
 }
 const [g1,g2,c1,c2]=rooms,context=(room,id,token=hubToken)=>rpc(room.type==='group'?'chat.context':'channel.context',{id:room.id,[room.type==='group'?'messageId':'entryId']:id},token)
 const channelFields=['id','name','kind','createdAt','updatedAt','adminIds','revision','engine'].sort()
 const discovered=await rpc('channel.list',{},hubToken);assert.deepEqual(discovered.map(room=>room.id).sort(),[c1.id,c2.id].sort());for(const room of discovered)assert.deepEqual(Object.keys(room).sort(),channelFields)
 assert.deepEqual(await rpc('channel.list',{},outsideToken),[]);await deny('channel.get',{id:c1.id},outsideToken);await deny('channel.get',{id:'ch_unknown'},hubToken)
 assert.ok('savedCount' in (await rpc('channel.list')).find(room=>room.id===c1.id),'operator list retains the full channel view')
 const history=async(room,token=null)=>(await rpc(room.type==='group'?'chat.history':'channel.history',{id:room.id,limit:100},token)).messages
 const get=async(room,id)=>(await history(room)).find(message=>message.id===id)
 const delivery=async(room,id,person)=>(await get(room,id)).deliveries.find(value=>value.employeeId===person.id)
 const send=(room,text,key='same-user-key',extra={})=>rpc(room.type==='group'?'chat.send':'channel.message-send',{id:room.id,text,mentions:[hub.id],clientMessageId:key,...extra})
 const post=(room,id,text,key='same-reply-key',token=hubToken)=>rpc(room.type==='group'?'chat.post':'channel.message-post',{id:room.id,replyTo:id,text,clientMessageId:key},token)
 const done=(room,id)=>f.until(async()=>{const message=await get(room,id);const failed=message.deliveries.find(value=>['failed','interrupted'].includes(value.status));if(failed)throw Error(JSON.stringify(failed));return message.deliveries.every(value=>value.status==='completed')&&message},room.type+' delivery complete')
 const sourceOf=chat=>'groupId' in chat?{type:'group',id:chat.groupId,messageId:chat.messageId}:{type:'channel',id:chat.channelId,messageId:chat.entryId}
 const requests=[];hold(hub)
 for(const [index,room] of rooms.entries()){
  const request=await send(room,'Shared request from source '+index);requests.push(request)
  assert.deepEqual(request.deliveries.map(value=>[value.employeeId,value.mode]),[[hub.id,'work'],[peer.id,'awareness']])
  await f.until(async()=>{const value=await delivery(room,request.id,hub);return index?value.status==='queued':(await f.status(hub.id)).acknowledging},'first read or queued source')
 }
 const status=await f.status(hub.id),queue=await rpc('session.queue',{id:status.sessionId})
 assert.deepEqual(sourceOf(status.currentTask.chat),{type:g1.type,id:g1.id,messageId:requests[0].id},'current source identity')
 assert.deepEqual(queue.map(value=>sourceOf(value.chat)),rooms.slice(1).map((room,index)=>({type:room.type,id:room.id,messageId:requests[index+1].id})))
 for(const [index,room] of rooms.entries()){
  assert.equal((await delivery(room,requests[index].id,hub)).readAt,undefined)
  await f.until(async()=>(await delivery(room,requests[index].id,peer)).status==='completed','observer read')
  const shared=await context(room,requests[index].id,peerToken);assert.equal((room.type==='group'?shared.group:shared.channel).id,room.id)
 }
 assert.equal(work(peer).length,baselinePeer.works);assert.deepEqual((await transcript(peer)).items,baselinePeer.transcript);assert.deepEqual((await f.status(peer.id)).lastReply,baselinePeer.lastReply)
 release(hub);for(const [index,room] of rooms.entries())await done(room,requests[index].id);await idle()
 const readings=readStarts(hub).filter(value=>requests.some(request=>value.text.includes(request.id)))
 assert.equal(readings.length,4)
 for(const [index,room] of rooms.entries()){
  const reading=readings[index],meta=JSON.parse(reading.text.split('\n')[1]),accepted=reading.text.match(/\[(?:Group request|Channel context)\]\n([^\n]+)/)
  assert.deepEqual([meta.conversationType,meta.conversationId,meta.messageId],[room.type,room.id,requests[index].id])
  assert.ok(accepted,'The accepted source context is present');const detail=JSON.parse(accepted[1]);assert.equal(room.type==='group'?detail.groupName:detail.channelName,room.name)
  assert.equal(reading.readingTools,false);assert.equal(reading.documentationTools,false);assert.ok(!phases(hub).some(value=>value.phase==='discussion-tool'&&value.input.messageId===requests[index].id))
  assert.ok((await delivery(room,requests[index].id,hub)).readAt);assert.equal((await history(room)).length,1)
  assert.equal(reading.thread,baselineHub.threadId)
  const formal=work(hub)[index+1],formalContext=JSON.parse(formal.text.match(/\[(?:Group request|Channel context)\]\n([^\n]+)/)[1]);assert.deepEqual([formalContext.conversationType,formalContext.conversationId,formalContext.messageId??formalContext.entryId],[room.type,room.id,requests[index].id]);assert.equal(formal.thread,baselineHub.threadId)
 }
 assert.equal(work(hub).length,5);assert.equal(work(peer).length,baselinePeer.works)
 checks.push('Four same-name sources queue independently on one native identity; source kind/ID/name/message ID and tool-free private reading stay correlated')

 for(const [index,room] of rooms.entries()){
  const count=readStarts(hub).length;assert.equal((await send(room,'Shared request from source '+index)).id,requests[index].id);assert.equal(readStarts(hub).length,count)
  const response=await post(room,requests[index].id,'A deliberate reply for source '+index);await done(room,response.id);assert.equal(response.replyTo,requests[index].id);assert.deepEqual(response.author,{kind:'agent',employeeId:hub.id});assert.equal(response.acknowledgmentOf,undefined);assert.equal((await post(room,requests[index].id,response.text)).id,response.id);assert.equal((await history(room,peerToken)).length,2)
 }
 await idle();assert.equal(work(peer).length,baselinePeer.works);assert.deepEqual((await transcript(peer)).items,baselinePeer.transcript)
 for(const [room,foreign] of [[g1,requests[1]],[g1,requests[2]],[c1,requests[3]],[c1,requests[0]]])for(const text of [null,'MUST_NOT_CROSS_SOURCE'])await deny(room.type==='group'?'chat.post':'channel.message-post',{id:room.id,replyTo:foreign.id,text},hubToken)
 for(const room of rooms){assert.equal((await history(room)).length,2);await deny(room.type==='group'?'chat.context':'channel.context',{id:room.id},outsideToken)}
 await deny('session.send',{employee:peer.id,text:'Membership is not control authority'},hubToken)
 checks.push('Same retry keys are independent across rooms; public API replies reach only the specified room, foreign reply IDs are rejected, observers read without public/private chatter')

 // A native publication attempt during reading is unavailable regardless of destination.
 const unaffected=await Promise.all([g2,c1,c2].map(room=>history(room)))
 hold(hub);fs.writeFileSync(file(hub,'.ack-tool.json'),JSON.stringify({text:'MUST_NOT_PUBLISH',conversationId:g2.id}));const bad=await send(g1,'Reading must not invoke a publisher','reject-reading-tool')
 await f.until(async()=>{const state=await f.status(hub.id);return state.acknowledging&&state.currentTask.chat.messageId===bad.id},'held negative reading')
 fs.writeFileSync(file(hub,'.ack-tool.json'),JSON.stringify({text:'MUST_NOT_PUBLISH',conversationId:g2.id}));const workBefore=work(hub).length;release(hub)
 const failed=await f.until(async()=>{const value=await delivery(g1,bad.id,hub);return value.status==='failed'&&value},'reading publication rejected')
 assert.equal(failed.readAt,undefined);assert.equal(failed.ackMessageId,undefined);assert.equal(work(hub).length,workBefore);await idle();answer(hub,{text:null})
 assert.deepEqual(await Promise.all([g2,c1,c2].map(room=>history(room))),unaffected);assert.ok(!(await history(g1)).some(item=>item.text==='MUST_NOT_PUBLISH'))
 checks.push('Reading cannot publish or cross sources; native failure does not release work or alter another room')

 await rpc('chat.update',{id:g1.id,members:[peer.id]})
 await deny('chat.context',{id:g1.id},hubToken);await context(g2,requests[1].id);await context(c1,requests[2].id);await context(c2,requests[3].id)
 const oldReply=(await history(g1)).find(value=>value.author.kind==='agent'&&value.author.employeeId===hub.id)
 const followup=await send(g1,'Reply after the old author left','departed-author',{mentions:[],replyTo:oldReply.id});assert.deepEqual(followup.deliveries.map(value=>[value.employeeId,value.mode]),[[peer.id,'work']]);await done(g1,followup.id)
 const channel=await rpc('channel.get',{id:c1.id});await rpc('channel.update',{id:c1.id,adminIds:[peer.id],expectedRevision:channel.revision});await deny('channel.context',{id:c1.id},hubToken);await context(c2,requests[3].id);assert.deepEqual((await rpc('channel.list',{},hubToken)).map(room=>room.id),[c2.id]);await deny('channel.get',{id:c1.id},hubToken)
 await rpc('chat.mute',{id:g2.id,member:hub.id,muted:true});await deny('chat.post',{id:g2.id,replyTo:requests[1].id,text:'Muted text'},hubToken)
 await idle();const saved=await Promise.all(rooms.map(room=>history(room))),peerWorks=work(peer).length
 assert.deepEqual(await identity(hub),baselineHub)
 await f.stop();await f.start();assert.deepEqual(await rpc('session.list',{live:true}),[]);assert.deepEqual(await Promise.all(rooms.map(room=>history(room))),saved)
 await deny('chat.context',{id:g1.id},hubToken);await deny('channel.context',{id:c1.id},hubToken);assert.ok((await context(g2,requests[1].id)).acknowledgment.muted);assert.equal((await context(c2,requests[3].id)).acknowledgment.muted,false)
 for(const room of [g2,c2]){const request=await send(room,'Still a member after restart','post-restart');await done(room,request.id);assert.ok((await delivery(room,request.id,hub)).readAt);if(room.type==='channel'){const response=await post(room,request.id,'Channel reply remains permitted','after-restart-reply');await done(room,response.id)}else await deny('chat.post',{id:room.id,replyTo:request.id,text:'Still muted'},hubToken)}
 await idle();assert.equal(work(peer).length,peerWorks);assert.deepEqual(await identity(hub),baselineHub);assert.deepEqual(await identity(peer),baselinePeer.identity);assert.deepEqual(await rpc('terminal.list'),[])
 checks.push('Removing one group/channel membership leaves other memberships and native identity intact; replies to departed authors broadcast to remaining members; restart preserves all histories, read timestamps and room-local mute')
 const manager=await f.create('Channel manager','Multi-source studio','manager'),governor=await f.create('Channel governor','Multi-source studio','governor'),managerToken=await f.token(manager.id),governorToken=await f.token(governor.id)
 assert.deepEqual(await rpc('channel.list',{},managerToken),[]);assert.deepEqual(await rpc('channel.list',{},governorToken),[])
 await rpc('channel.update',{id:c1.id,adminIds:[peer.id,manager.id]});await rpc('channel.update',{id:c2.id,adminIds:[hub.id,peer.id,governor.id]})
 for(const [token,allowed,foreign] of [[hubToken,c2,c1],[managerToken,c1,c2],[governorToken,c2,c1]]){
  const listed=await rpc('channel.list',{},token);assert.deepEqual(listed.map(room=>room.id),[allowed.id]);assert.deepEqual(Object.keys(listed[0]).sort(),channelFields);assert.deepEqual(await rpc('channel.get',{id:allowed.id},token),listed[0]);await deny('channel.get',{id:foreign.id},token);await deny('channel.update',{id:allowed.id,adminIds:[]},token);await deny('channel.settings',{},token)
 }
 assert.deepEqual((await rpc('chat.list',{},hubToken)).map(room=>room.id),[g2.id])
 const protectedIdentities=await Promise.all([hub,manager,governor].map(identity))
 await deny('card.remove',{ids:[manager.id]},hubToken);await deny('card.remove',{ids:[governor.id]},hubToken);await deny('card.remove',{ids:[governor.id]},managerToken)
 assert.deepEqual(await Promise.all([hub,manager,governor].map(identity)),protectedIdentities);assert.equal((await rpc('auth.whoami')).principal.kind,'operator')
 checks.push('Employee cannot remove a Manager/Governor and Manager cannot remove Governor; source identities and operator authority remain intact')
 checks.push('Employee, Manager and Governor discover only their current administrator channels, with public identity metadata only; user channel controls remain forbidden and operator projection is unchanged')
 evidence.passed=true;evidence.rooms=rooms;evidence.employeeId=hub.id;evidence.nativeThreadId=baselineHub.threadId;console.log('PASS '+checks.join('; '))
}catch(error){evidence.error=error.message;throw error}
finally{await f?.close();if(application&&fs.existsSync(lifecycle)){evidence.bundleLifecycle=fs.readFileSync(lifecycle,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));const opened=evidence.bundleLifecycle.filter(value=>value.event==='open'),closed=new Set(evidence.bundleLifecycle.filter(value=>value.event==='closed').map(value=>value.pid));evidence.allTestApplicationsClosed=opened.length===2&&opened.every(value=>value.hidden&&closed.has(value.pid));assert.ok(evidence.allTestApplicationsClosed,'Both hidden bundle processes must close after restart and final cleanup')}fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,mode==='source'?'verification.json':mode+'-verification.json'),JSON.stringify(evidence,null,2));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
