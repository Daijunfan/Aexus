// Real authenticated Core/CLI with disposable native/SSH fixtures; no production state or paid inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-collaboration-'))),entry=path.join(temp,'daemon.cjs'),cloud=path.join(temp,'cloud'),bin=path.join(temp,'bin'),out=path.join(root,'artifacts/message-collaboration')
fs.mkdirSync(cloud);fs.mkdirSync(bin);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
fs.writeFileSync(path.join(bin,'ssh'),"#!/usr/bin/env python3\nimport os,sys\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n",{mode:0o755})
await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
const f=await fixtureCore({PATH:bin+':'+process.env.PATH},entry),report={passed:false,checks:[],paidModelCalls:0,productionDataUsed:false},pass=text=>{report.checks.push(text);console.log('PASS '+text)}
const rpc=async(cmd,args={},token=null)=>{const value=await f.request(token,cmd,args);assert.ok(value.ok,cmd+': '+value.error);return value.data}
const deny=async(cmd,args,token)=>{const value=await f.request(token,cmd,args);assert.equal(value.ok,false,cmd+' should reject');return value.error}
const policy=(conversation,token)=>rpc('conversation.policy',{conversation},token)
const office=async(conversation,employee,role,token)=>rpc('conversation.role',{conversation,employee,role,expectedRevision:(await policy(conversation,token)).revision},token)
const member=async(conversation,employee,action,token)=>rpc('conversation.member',{conversation,employee,action,expectedRevision:(await policy(conversation,token)).revision},token)
try{
 await rpc('group.add',{name:'Editorial'});await rpc('group.add',{name:'Elsewhere'})
 const owner=await f.create('Aster','Editorial'),admin=await f.create('Rowan','Editorial','manager'),secretary=await f.create('Mira','Editorial','secretary'),reader=await f.create('Reader','Editorial'),outside=await f.create('Outside','Elsewhere')
 const ot=await f.token(owner.id),at=await f.token(admin.id),st=await f.token(secretary.id),rt=await f.token(reader.id),xt=await f.token(outside.id)
 const group=await rpc('chat.create',{name:'Reading room',members:[owner.id,admin.id,secretary.id,reader.id],ownerId:owner.id}),g='group:'+group.id
 const source=await rpc('channel.source-add',{plugin:'telegram',targetId:'collaboration-fixture',locator:'periodical-fixture',name:'Periodical library'}),channelId=source.channelId,c='channel:'+channelId
 for(const employee of [owner,admin,secretary,reader])await member(c,employee.id,'add')
 await office(c,owner.id,'owner');await office(c,admin.id,'admin',ot);await office(g,admin.id,'admin',ot)
 assert.equal((await policy(c,st)).actorRole,'member');await deny('conversation.mute',{conversation:c,member:'all',muted:true,expectedRevision:(await policy(c,st)).revision},st)
 await office(c,reader.id,'admin',at);await office(c,reader.id,'member',at);assert.ok((await rpc('channel.list',{},rt)).some(x=>x.id===channelId),'demotion retains membership')
 await deny('conversation.role',{conversation:c,employee:owner.id,role:'member',expectedRevision:(await policy(c,at)).revision},at)
 await deny('conversation.member',{conversation:c,employee:owner.id,action:'remove',expectedRevision:(await policy(c,at)).revision},at)
 await deny('channel.context',{id:channelId},xt);await deny('workspace.catalog',{employee:reader.id},xt)
 const audit=await rpc('conversation.audit',{conversation:c,limit:3},ot);assert.equal(audit.rows.length,3);assert.ok(audit.nextBefore);assert.ok(audit.rows.some(row=>row.actor.kind==='agent'))
 const cat=await rpc('workspace.catalog',{},rt);assert.deepEqual(new Set(cat.workspaces.map(w=>w.id)),new Set(['company:'+reader.id,g,c]));assert.ok(cat.workspaces.every(w=>w.employeeId===reader.id))
 assert.ok((await rpc('channel.get',{id:channelId},rt)).memberIds.includes(reader.id));assert.ok(!(await rpc('channel.get',{id:channelId},rt)).adminIds.includes(reader.id))
 pass('Independent Owner/Admin/Member offices in both conversations, real Admin delegation, Member retention on demotion, Owner protection, scoped audit and all-workspace catalog.')
 const rw=await rpc('conversation.workspace',{conversation:c},rt),sw=await rpc('conversation.workspace',{conversation:c},st)
 await rpc('conversation.file',{conversation:c,operation:'write',path:'original.txt',content:'Original',create:true})
 for(const token of [rt,ot,at])await deny('conversation.file',{conversation:c,operation:'write',path:'original.txt',content:'forbidden'},token)
 await rpc('conversation.file',{conversation:c,operation:'write',path:'original.txt',content:'Secretary revision'},st)
 await deny('conversation.file',{conversation:c,operation:'mkdir',path:'outside-member-tree'},st)
 await rpc('conversation.file',{conversation:c,operation:'mkdir',path:rw.memberDirectory+'/notes'},rt)
 await rpc('conversation.file',{conversation:c,operation:'write',path:rw.memberDirectory+'/notes/result.md',content:'# Result',create:true},rt)
 await deny('conversation.file',{conversation:c,operation:'write',path:rw.memberDirectory+'/notes/result.md',content:'no'},st)
 const trashed=await rpc('conversation.file',{conversation:c,operation:'trash',path:'original.txt'},st);assert.match(trashed.id,/^root:/)
 await deny('conversation.file',{conversation:c,operation:'restore',id:trashed.id},rt)
 await rpc('conversation.file',{conversation:c,operation:'restore',id:trashed.id},st)
 await rpc('conversation.file',{conversation:c,operation:'move',path:'original.txt',to:sw.memberDirectory+'/original.txt'},st)
 await rpc('conversation.file',{conversation:c,operation:'move',path:sw.memberDirectory+'/original.txt',to:'original.txt'},st)
 for(const target of ['../escape.txt',rw.memberDirectory+'/../../escape.txt','/tmp/escape.txt',rw.memberDirectory+'/.agents-company/secret'])await deny('conversation.file',{conversation:c,operation:'write',path:target,content:'no'},rt)
 const l=await rpc('conversation.file',{conversation:c,operation:'list'},st);assert.equal(l.entries.find(e=>e.name==='original.txt').writable,true);assert.equal(l.entries.find(e=>e.name===rw.memberDirectory).writable,false)
 pass('Secretary direct-root file CRUD/trash/restore without peer-folder access; Owner/Admin cannot edit originals; own member subtree CRUD and path-escape denials.')
 const host=await rpc('host.create',{name:'Fixture document host',host:'fixture',os:'linux',defaultDirectory:cloud}),collector=await rpc('channel.collector-add',{name:'Fixture document source',sourceIds:[source.id]})
 await rpc('channel.update',{id:channelId,engine:{kind:'external',location:'remote',name:'Fixture collector',host:'fixture',endpoint:'http://127.0.0.1:5152/api/channels/collector',collectorId:collector.collector.id,fileStorage:{hostId:host.id,directory:cloud}}})
 const bytes=Buffer.concat([Buffer.from('%PDF-1.7\n'),randomBytes(650000)]),sha256=createHash('sha256').update(bytes).digest('hex'),physical=path.join(cloud,sha256.slice(0,2),sha256)
 fs.mkdirSync(path.dirname(physical),{recursive:true});fs.writeFileSync(physical,bytes)
 const doc={id:'magazine',name:'magazine.pdf',mimeType:'application/pdf',bytes:bytes.length,sha256},publishedAt=Date.now(),externalId='complete-post'
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII='
 const {media:image}=await rpc('channel.media-put',{sourceId:source.id,externalId,publishedAt,mediaKey:'cover',name:'cover.png',mimeType:'image/png',data:png})
 const post=await rpc('channel.publish',{sourceId:source.id,externalId,publishedAt,title:'English magazine',body:'Full text and https://example.org/article',url:'https://example.org/issue',mediaIds:[image.id],files:[doc]})
 const full=await rpc('conversation.entry',{conversation:c,id:post.id},rt);assert.equal(full.entry.body,'Full text and https://example.org/article');assert.equal(full.attachments.length,2);assert.equal(full.links.length,2);assert.equal((await rpc('channel.image',{channelId,postId:post.id,mediaId:image.id},rt)).data,png)
 await deny('conversation.entry',{conversation:g,id:post.id},rt)
 const download=async(attachmentId,workspace,key,token=rt,extra={})=>{const job=await rpc('conversation.download',{conversation:c,entryId:post.id,attachmentId,clientRequestId:key,...(workspace?{workspace}:{}),...extra},token);const done=await f.until(async()=>{const s=await rpc('conversation.download-status',{id:job.id},token);return !['running','queued'].includes(s.state)&&s},'attachment copy');assert.equal(done.state,'completed',done.error);return done}
 const copy=await download('document:magazine',undefined,'own-message');assert.equal(copy.workspace,c);assert.ok(copy.absolutePath.startsWith(rw.memberPath+'/'));assert.ok(fs.readFileSync(copy.absolutePath).equals(bytes));assert.ok(!fs.existsSync(path.join(rw.root,doc.name)))
 const company=await download('document:magazine','company:'+reader.id,'own-company');assert.ok(fs.readFileSync(company.absolutePath).equals(bytes));assert.ok(company.absolutePath.startsWith(reader.cwd+'/'))
 const duplicate=await rpc('conversation.download',{conversation:c,entryId:post.id,attachmentId:'document:magazine',clientRequestId:'own-message'},rt);assert.equal(duplicate.id,copy.id)
 await deny('conversation.download-status',{id:copy.id},st);await deny('conversation.download',{conversation:c,entryId:post.id,attachmentId:'document:magazine',clientRequestId:'escape',workspace:'company:'+secretary.id},rt)
 const second=await download('document:magazine',undefined,'second-copy');assert.notEqual(second.absolutePath,copy.absolutePath)
 const picture=await download('image:'+image.id,g,'image-group');assert.equal(fs.readFileSync(picture.absolutePath).toString('base64'),png)
 const changed=Buffer.from(bytes);changed[200]^=1;fs.writeFileSync(physical,changed)
 const bad=await rpc('conversation.download',{conversation:c,entryId:post.id,attachmentId:'document:magazine',clientRequestId:'bad-hash',name:'invalid.pdf'},rt)
 const failure=await f.until(async()=>{const s=await rpc('conversation.download-status',{id:bad.id},rt);return s.state==='failed'&&s},'hash rejection');assert.match(failure.error,/SHA-256/);assert.ok(!fs.existsSync(path.join(rw.memberPath,'invalid.pdf')));fs.writeFileSync(physical,bytes)
 const gm=await rpc('chat.post',{id:group.id,text:'Published member document',files:['@workspace/'+(await rpc('conversation.workspace',{conversation:g},rt)).memberDirectory+'/cover.png'],clientMessageId:'agent-file'},rt)
 assert.equal((await rpc('conversation.entry',{conversation:g,id:gm.id},ot)).attachments.length,1)
 pass('Complete published entry metadata and protected image bytes; real streaming PDF downloads into own Message/Company workspaces, dedup/collision handling, hash rejection and Agent attachment publication.')
 const setRule=async(employee,everyPosts,prompt,enabled=true,token=ot)=>{const list=await rpc('channel.post-trigger-list',{id:channelId},token),old=list.rules.find(rule=>rule.employeeId===employee);return rpc('channel.post-trigger-set',{id:channelId,employee,everyPosts,prompt,enabled,expectedRevision:old?.revision??0},token)}
 const firstRule=await setRule(reader.id,2,'BATCH_READER: summarize the exact source batch.'),secondRule=await setRule(secretary.id,3,'BATCH_MIRA: extract vocabulary from these posts.')
 await deny('channel.post-trigger-set',{id:channelId,employee:reader.id,everyPosts:1,prompt:'Cannot reconfigure',enabled:true,expectedRevision:firstRule.revision},rt)
 assert.equal((await rpc('channel.post-trigger-list',{id:channelId},rt)).rules.length,1)
 const makePost=async i=>rpc('channel.publish',{sourceId:source.id,externalId:'count-'+i,publishedAt:Date.now()-10000+i,title:'Count '+i,body:'Source '+i})
 const posts=[];posts.push(await makePost(1));assert.equal((await rpc('channel.post-trigger-list',{id:channelId},rt)).rules[0].pendingCount,1)
 const raw=await rpc('channel.post',{id:posts[0].id});assert.equal((await rpc('channel.publish',{sourceId:source.id,externalId:raw.externalId,publishedAt:raw.publishedAt,title:raw.title,body:raw.body})).status,'duplicate')
 await rpc('channel.publish',{sourceId:source.id,externalId:raw.externalId,publishedAt:raw.publishedAt,title:raw.title,body:'Edited source'})
 assert.equal((await rpc('channel.post-trigger-list',{id:channelId},rt)).rules[0].pendingCount,1)
 posts.push(await makePost(2));posts.push(await makePost(3))
 const batchFor=employee=>rpc('channel.post-trigger-history',{id:channelId,employee})
 await f.until(async()=>{const x=await batchFor(reader.id),y=await batchFor(secretary.id);return x.rows[0]?.state==='completed'&&y.rows[0]?.state==='completed'},'two count-triggered native work turns')
 const rbatch=(await batchFor(reader.id)).rows[0],sbatch=(await batchFor(secretary.id)).rows[0];assert.equal(rbatch.postCount,2);assert.equal(sbatch.postCount,3)
 const batch=await rpc('channel.post-trigger-batch',{id:channelId,batchId:rbatch.id,limit:1},rt);assert.equal(batch.total,2);assert.ok(batch.hasMore);assert.equal(batch.posts[0].id,posts[0].id);assert.equal(batch.posts[0].post.body,'Edited source')
 await deny('channel.post-trigger-batch',{id:channelId,batchId:sbatch.id},rt)
 const secondPage=await rpc('channel.post-trigger-batch',{id:channelId,batchId:rbatch.id,offset:1,limit:1},rt);assert.equal(secondPage.posts[0].id,posts[1].id)
 const work=JSON.parse(fs.readFileSync(path.join(f.control,reader.id+'-work.json'),'utf8')).text;assert.ok(work.includes('BATCH_READER'));assert.ok(work.includes(rbatch.id));assert.ok(work.includes('channel.post-trigger-batch'))
 const reply=await rpc('channel.message-post',{id:channelId,replyTo:rbatch.messageId,text:'The batch summary is complete.',clientMessageId:'batch-answer'},rt);assert.equal(reply.requestId,rbatch.messageId)
 assert.deepEqual(await rpc('schedule.list'),[]);assert.deepEqual(await rpc('schedule.history'),[])
 const historyBefore=(await batchFor(reader.id)).total;await setRule(reader.id,2,'Paused editable prompt',false);await makePost(4);assert.equal((await batchFor(reader.id)).total,historyBefore);assert.equal((await rpc('channel.post-trigger-list',{id:channelId},rt)).rules[0].pendingCount,0)
 await member(c,secretary.id,'remove',ot);assert.equal((await rpc('channel.post-trigger-list',{id:channelId},ot)).rules.find(rule=>rule.employeeId===secretary.id).enabled,false)
 assert.equal((await rpc('workspace.catalog',{},st)).workspaces.some(w=>w.id===c),false)
 await deny('conversation.file',{conversation:c,operation:'read',path:'original.txt'},st)
 await f.until(async()=>(await rpc('session.status')).every(s=>!s.busy),'fixture idle')
 await f.stop();await f.start();assert.equal((await batchFor(reader.id)).total,historyBefore);assert.equal((await rpc('conversation.download-status',{id:copy.id},rt)).state,'completed');assert.ok(fs.readFileSync(copy.absolutePath).equals(bytes))
 pass('Independent per-Agent thresholds/prompts, exact batch pagination and real fixture work; duplicate/update exclusion, public reply, pause/removal revalidation, restart persistence and zero Plan records.')
 report.passed=true
}catch(error){report.error=error.stack;throw error}finally{await f.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true})}
