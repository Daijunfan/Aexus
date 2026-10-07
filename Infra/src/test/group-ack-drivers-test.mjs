// Source Core plus all four real adapter protocols; only deterministic model/SDK fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-reading-drivers-')),entry=path.join(temp,'daemon.cjs'),claude=path.join(root,'Infra/src/test/fixtures/discussion-claude-sdk.mjs'),processFixture=path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),out=path.join(root,'.aexus/artifacts/group-ack-drivers')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
const allEngines=['codex','cline','pi','claude'],flag=process.argv.indexOf('--engines'),engines=flag<0?allEngines:process.argv[flag+1]?.split(','),evidence=[]
assert.ok(engines?.length&&engines.every(engine=>allEngines.includes(engine)))
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},plugins:[{name:'fixture-sdk',setup(build){build.onLoad({filter:/src\/main\/engines\/claude-sdk\.ts$/},()=>({contents:'export function claudeSdkPath(){return '+JSON.stringify(claude)+'};export function exposeClaudeSdk(){};export async function loadClaudeSdk(){return import('+JSON.stringify('file://'+claude)+')}',loader:'ts'}))}}],logLevel:'silent'})
 f=await fixtureCore({CLINE_BIN:processFixture,PI_BIN:processFixture,CLAUDE_BIN:processFixture,ANTHROPIC_API_KEY:'fixture-only-no-network',ANTHROPIC_AUTH_TOKEN:'',CLAUDE_CONFIG_DIR:path.join(temp,'claude-profile')},entry)
 const rpc=async(cmd,args={},auth=null)=>{const reply=await f.request(auth,cmd,args);assert.ok(reply.ok,reply.error);return reply.data}
 await f.cli('group','add','Reading studio')
 for(const engine of engines){
  if(['cline','pi'].includes(engine))await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  const card=await rpc('card.create',{title:engine,group:'Reading studio',engine,model:engine==='codex'?'gpt-6-luna':engine==='claude'?'fixture-claude':'deepseek-flash',permissionMode:'bypassPermissions'});await f.ready(card.id)
  const group=await rpc('chat.create',{name:engine+' publication',members:[card.id]}),token=await f.token(card.id),checks=[]
  const file=suffix=>path.join(f.control,card.id+suffix),read=kind=>JSON.parse(fs.readFileSync(file('-'+kind+'.json'),'utf8')),put=(suffix,text)=>fs.writeFileSync(file(suffix),text),remove=suffix=>fs.rmSync(file(suffix),{force:true})
  const history=async()=>(await rpc('chat.history',{id:group.id,limit:100})).messages,delivery=async id=>(await history()).find(message=>message.id===id).deliveries[0],transcript=()=>rpc('session.transcript',{employee:card.id})
  const done=(id,expected='completed')=>f.until(async()=>{const d=await delivery(id);if(['failed','interrupted'].includes(d.status)&&d.status!==expected)throw Error(engine+': '+JSON.stringify(d));return d.status===expected&&d},engine+' '+expected)
  const idle=()=>f.until(async()=>!(await f.status(card.id)).busy&&!((await f.status(card.id)).pendingMessages?.length),engine+' idle')
  const send=(text,key)=>rpc('chat.send',{id:group.id,text,mentions:[card.id],clientMessageId:engine+'-'+key})
  await rpc('session.send',{employee:card.id,text:'A private question before group work.'});await f.received(card.id,'A private question before group work.');await idle()
  const privateReply=(await f.status(card.id)).lastReply;assert.ok(privateReply&&!privateReply.readAt)
  const native=engine==='codex'?read('work').thread:read('work').sessionId
  // Plain reading has no publisher and cannot use workspace tools, even with Full access.
  put('.ack-output.txt','{"text":null}');put('.hold-ack','');put('.work-post.json',JSON.stringify({text:'A useful response from '+engine}))
  const first=await send('ACK_TOOL_FIXTURE WRITE_FIXTURE','explicit')
  await f.until(()=>fs.existsSync(file('-ack.json')),'reading starts');assert.equal((await delivery(first.id)).readAt,undefined)
  if(engine==='codex'){assert.deepEqual(read('ack').environments,[]);assert.equal(read('ack').readingTools,false);assert.equal(read('ack').documentationTools,false)}
  else{await f.until(()=>fs.existsSync(file('-ack-tool-result.json')),'reading workspace denial');assert.equal(read('ack-tool-result').allowed,false);assert.ok(!fs.existsSync(path.join(card.cwd,'ack-forbidden.txt')))}
  remove('.hold-ack');const received=await done(first.id);await idle()
  const published=(await history()).filter(item=>item.author.kind==='agent');assert.equal(published.length,1);assert.equal(published[0].text,'A useful response from '+engine);assert.equal(published[0].replyTo,first.id);assert.equal(published[0].acknowledgmentOf,undefined)
  assert.ok(received.readAt&&read('work').at>=received.readAt);assert.equal(engine==='codex'?read('work').thread:read('work').sessionId,native)
  if(engine==='codex')assert.ok(read('work').environments.some(value=>value.environmentId==='local'))
  else assert.equal(fs.readFileSync(path.join(card.cwd,'approval.txt'),'utf8'),'approved')
  assert.deepEqual((await f.status(card.id)).lastReply,privateReply);remove('.work-post.json')
  checks.push('Reading has no publisher/workspace access; response-stage tool posts once in the same native identity; original private unread is unchanged')
  for(const [label,text] of [['plain','PRIVATE_READING_NOTE'],['null','null'],['json-null','{"text":null}'],['json-text','{"text":"PRIVATE_READING_JSON"}'],['empty','']]){
   put('.ack-output.txt',text);const before=(await history()).length,request=await send('READ_FORMAT_'+label,label);const d=await done(request.id);await idle()
   assert.ok(d.readAt);assert.equal(d.ackMessageId,undefined);assert.equal((await history()).length,before+1);assert.ok(!(await transcript()).text.includes('PRIVATE_READING_'));assert.deepEqual((await f.status(card.id)).lastReply,privateReply)
  }
  checks.push('Plain, null, JSON and empty final notes finish reading without any public confirmation or private unread')
  // A forced tool attempt in reading fails; it cannot turn into a hidden publication.
  put('.ack-tool.json',JSON.stringify({text:'FORBIDDEN_READING_POST'}));const previous=fs.readFileSync(file('-work.json'),'utf8'),bad=await send('FORCED_READING_PUBLICATION','bad-tool');await done(bad.id,'failed');await idle()
  assert.equal((await delivery(bad.id)).readAt,undefined);assert.equal(fs.readFileSync(file('-work.json'),'utf8'),previous);assert.ok(!(await history()).some(item=>item.text==='FORBIDDEN_READING_POST'));remove('.ack-tool.json')
  put('.ack-fail','');const failure=await send('NATIVE_READING_FAILURE','failure');await done(failure.id,'failed');await idle();assert.equal((await delivery(failure.id)).readAt,undefined);remove('.ack-fail')
  put('.hold-ack','');const stopped=await send('STOP_DURING_READING','stop');await f.until(async()=>(await f.status(card.id)).acknowledging,'held reading');await rpc('session.interrupt',{employee:card.id});await done(stopped.id,'interrupted');await idle();assert.equal((await delivery(stopped.id)).readAt,undefined);remove('.hold-ack')
  checks.push('Forced reading publications, native errors and Stop cannot publish or release the work task')
  await rpc('chat.mute',{id:group.id,member:card.id,muted:true});const muted=await send('MUTED_PRIVATE_WORK','muted');await done(muted.id);await idle();assert.equal((await f.request(token,'chat.post',{id:group.id,text:'Muted public reply'})).ok,false);await rpc('chat.mute',{id:group.id,member:card.id,muted:false})
  for(const text of [null,'',' ','null','undefined','None'])assert.equal((await f.request(token,'chat.post',{id:group.id,text})).ok,false)
  await rpc('session.send',{employee:card.id,text:'Private conversation after shared work'});await f.received(card.id,'Private conversation after shared work');await idle();assert.notEqual((await f.status(card.id)).lastReply.id,privateReply.id)
  const latest=(await f.status(card.id)).lastReply;assert.equal(latest.readAt,undefined)
  checks.push('Muted employees still read/work privately; all sentinel publications fail; later private work produces normal unread')
  const channel=await rpc('channel.create',{name:engine+' news',engine:{kind:'external',location:'local',name:'Fixture publisher'}}),source=await rpc('channel.source-add',{plugin:'x',locator:'reader_'+engine,channelId:channel.id});await rpc('channel.update',{id:channel.id,adminIds:[card.id]})
  const priorTranscript=(await transcript()).items,priorWork=fs.readFileSync(file('-work.json'),'utf8'),news=await rpc('channel.publish',{sourceId:source.id,externalId:'news',publishedAt:Date.now(),title:'Actual retained article',body:'A reference, not a request to publish.'})
  await f.until(async()=>{const d=(await rpc('channel.context',{id:channel.id,entryId:news.id})).deliveries[0];if(d?.status==='failed')throw Error(JSON.stringify(d));return d?.status==='completed'&&d.readAt},'news reading');await idle()
  assert.equal(fs.readFileSync(file('-work.json'),'utf8'),priorWork);assert.deepEqual((await transcript()).items,priorTranscript);assert.equal((await rpc('channel.history',{id:channel.id})).messages.length,0)
  put('.work-post.json',JSON.stringify({text:'Channel result from '+engine}));const question=await rpc('channel.message-send',{id:channel.id,text:'Explain the article.',replyTo:news.id,clientMessageId:'question-'+engine})
  await f.until(async()=>{const d=(await rpc('channel.history',{id:channel.id,around:question.id})).messages[0].deliveries[0];if(d.status==='failed')throw Error(JSON.stringify(d));return d.status==='completed'},'channel response');await idle()
  const posts=(await rpc('channel.history',{id:channel.id})).messages;assert.equal(posts.length,2);assert.equal(posts[1].text,'Channel result from '+engine);assert.equal(posts[1].acknowledgmentOf,undefined);assert.deepEqual((await f.status(card.id)).lastReply,latest)
  checks.push('Channel news remains tool-free context; a real discussion publishes deliberately and leaves private unread untouched')
  await rpc('session.close',{employee:card.id});evidence.push({engine,checks});console.log('PASS '+engine+': '+checks.length+' shared-reading/publication/isolation scenarios')
 }
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,engines.length===4?'verification.json':'subset-'+engines.join('-')+'.json'),JSON.stringify({passed:true,evidence,providerCalls:0,scope:'Real Core and four adapter protocols; deterministic native/SDK fixtures'},null,2))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
