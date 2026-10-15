import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {x as untar} from 'tar'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-channels-integration-'))),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const settings=await rpc('channel.settings',{patch:{enabled:true,port}});assert.equal(settings.runtime.listening,true)
 const source=await rpc('channel.source-add',{plugin:'x',targetId:'x-fixture',locator:'fixture',name:'Fixture writer'}),second=await rpc('channel.source-add',{plugin:'youtube',targetId:'yt-fixture',locator:'https://www.youtube.com/@Fixture',name:'Video writer'})
 const created=await rpc('channel.collector-add',{name:'Fixture collector',sourceIds:[source.id]}),url='http://127.0.0.1:'+port+'/api/channels/collector'
 const collect=async(cmd,args={},token=created.token)=>{const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({cmd,args})});return {status:response.status,body:await response.json()}}
 const submit=async(cmd,args)=>{const result=await collect(cmd,args);assert.equal(result.status,200,result.body.error);assert.ok(result.body.ok,result.body.error);return result.body.data}
 const config=await submit('channel.collector-config',{});assert.deepEqual(config.targets.map(target=>target.sourceId),[source.id]);assert.ok(!JSON.stringify(config).includes(created.token))
 assert.equal((await collect('session.list')).status,403);assert.equal((await collect('channel.collector-config',{},'invalid')).status,401)
 assert.equal((await f.request(created.token,'session.list',{})).ok,false,'collector token cannot impersonate an operator in the main API')
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),publishedAt=Date.now()-10000,postArgs={sourceId:source.id,externalId:'external-item-1',publishedAt,title:'A useful update',body:'A complete news item with **its original context**.',url:'https://example.test/item/1'}
 const upload={sourceId:source.id,externalId:postArgs.externalId,publishedAt,mediaKey:'picture',name:'Original picture.png',mimeType:'image/png',data:bytes.toString('base64')},asset=await submit('channel.media-put',upload)
 const posted=await submit('channel.publish',{...postArgs,mediaIds:[asset.media.id]});assert.equal(posted.status,'created');assert.equal((await submit('channel.publish',{...postArgs,mediaIds:[asset.media.id]})).status,'duplicate')
 assert.equal((await submit('channel.collector-config',{sinceRevision:config.revision})).changed,false,'news ingestion does not invalidate source configuration')
 assert.equal((await collect('channel.publish',{...postArgs,sourceId:second.id})).status,403,'collector source scope is enforced')
 const post=await rpc('channel.post',{id:posted.id});assert.equal(post.channelId,source.channelId);assert.deepEqual(Buffer.from((await rpc('channel.image',{channelId:post.channelId,postId:post.id,mediaId:asset.media.id})).data,'base64'),bytes)
 const from={channel:post.channelId,path:post.id+'/'+asset.media.id};assert.equal((await rpc('transfer.download-info',{from})).name,'Original picture.png');const download=path.join(temp,'download.png');await rpc('transfer.download-save',{from,path:download});assert.deepEqual(fs.readFileSync(download),bytes)
 const archive=await rpc('channel.export',{id:post.id});assert.match(archive.name,/\.tar\.gz$/);assert.match(archive.markdown,/images\//);const extracted=path.join(temp,'extracted');fs.mkdirSync(extracted);await untar({file:archive.download.path,cwd:extracted});assert.match(fs.readFileSync(path.join(extracted,'story.md'),'utf8'),/original context/);assert.deepEqual(fs.readFileSync(path.join(extracted,'images','01-Original picture.png')),bytes)
 const ties=[];for(const [index,target] of [source,second,source,second].entries()){const value=await rpc('channel.publish',{sourceId:target.id,externalId:'tie-'+index,publishedAt,title:'Same-time fixture',body:'GLOBAL_ORDER_FIXTURE'});ties.push({id:value.id,conversation:'channel:'+value.channelId})}
 const expected=ties.sort((a,b)=>a.conversation.localeCompare(b.conversation)||a.id.localeCompare(b.id)).map(value=>value.id),pages=[]
 for(const offset of [0,2]){const result=await rpc('messenger.search',{query:'GLOBAL_ORDER_FIXTURE',offset,limit:2});assert.equal(result.total,4);pages.push(...result.messages.map(value=>value.id))};assert.deepEqual(pages,expected,'SQL news prefix and global messenger merge use the same tie ordering')
 await f.cli('group','add','Folder Studio');const employee=await f.create('Aster','Folder Studio'),group=await rpc('chat.create',{name:'Planning',members:[employee.id]})
 const refs=['employee:'+employee.id,'group:'+group.id,'channel:'+source.channelId],folderId='mf_'+randomUUID(),args={id:folderId,expectedRevision:0,name:'Morning reading',conversations:refs}
 let state=await rpc('messenger.folder-save',args);assert.deepEqual(state.folders[0].conversations,[...refs].sort());const originalRevision=state.revision;assert.equal((await rpc('messenger.folder-save',args)).revision,originalRevision,'lost-response retry is idempotent')
 await rpc('messenger.draft',{conversation:refs[0],text:'An existing private draft'});state=await rpc('messenger.folder-save',{id:folderId,name:'Reading and planning',conversations:refs,expectedRevision:1});assert.equal(state.folders[0].revision,2,'an unrelated draft change is not a folder conflict');assert.equal(state.drafts[refs[0]].text,'An existing private draft')
 assert.equal((await f.request(null,'messenger.folder-save',{id:folderId,name:'Stale edit',conversations:refs,expectedRevision:1})).ok,false)
 const other=await rpc('messenger.folder-save',{name:'People and news',conversations:[refs[0],refs[2]]});assert.equal(other.folders.length,2,'one conversation can belong to multiple folders')
 await rpc('messenger.conversation',{conversations:[refs[2]],patch:{pinned:true,archived:true}})
 await rpc('channel.save',{id:post.id,saved:true});let saved=await rpc('messenger.search',{filter:'saved'});assert.equal(saved.messages[0].news.id,post.id);assert.equal(saved.messages[0].preferences.saved,true)
 const destination=await rpc('channel.create',{name:'Research',engine:{kind:'external',location:'local',name:'Fixture publisher',collectorId:created.collector.id}});await rpc('channel.source-update',{id:source.id,patch:{channelId:destination.id}});saved=await rpc('messenger.search',{filter:'saved'});assert.equal(saved.messages[0].conversation,'channel:'+destination.id);assert.equal(saved.messages[0].news.id,post.id,'moving an author neither copies the news nor loses its saved state')
 assert.equal((await f.request(null,'channel.image',{channelId:source.channelId,postId:post.id,mediaId:asset.media.id})).ok,false);assert.equal((await rpc('channel.image',{channelId:destination.id,postId:post.id,mediaId:asset.media.id})).mimeType,'image/png')
 await f.cli('view','open','messages','--channel',destination.id);assert.equal((await rpc('view.get')).channelId,destination.id);await rpc('view.open',{kind:'settings'});await rpc('view.close');assert.equal((await rpc('view.get')).channelId,destination.id)
 const agentToken=await f.token(employee.id),unjoined=await f.request(agentToken,'channel.list',{});assert.equal(unjoined.ok,true);assert.deepEqual(unjoined.data,[]);assert.equal((await f.request(agentToken,'channel.get',{id:destination.id})).ok,false)
 for(const cmd of ['channel.sources','messenger.folder-delete'])assert.equal((await f.request(agentToken,cmd,{id:folderId})).ok,false)
 await rpc('channel.delete',{id:post.id});assert.equal((await submit('channel.publish',{...postArgs,mediaIds:[asset.media.id]})).status,'deleted');assert.equal((await rpc('messenger.search',{filter:'saved'})).messages.length,0);assert.equal((await f.request(null,'channel.image',{channelId:destination.id,postId:post.id,mediaId:asset.media.id})).ok,false)
 const remaining=await rpc('messenger.folder-delete',{id:folderId,expectedRevision:2});assert.equal(remaining.folders.length,1);assert.equal((await rpc('chat.get',{id:group.id})).name,'Planning');assert.equal(remaining.drafts[refs[0]].text,'An existing private draft')
 await rpc('channel.settings',{patch:{enabled:false}});assert.equal((await rpc('channel.settings')).runtime.listening,false);await f.stop();await f.start();assert.equal((await rpc('messenger.state')).folders.length,1);assert.equal((await rpc('channel.get',{id:destination.id})).name,'Research')
 assert.deepEqual(await rpc('terminal.list'),[])
 console.log('PASS real Core/CLI/HTTP channels: limited collector capability, media and self-contained export, mixed idempotent folders, source routing and durable favorites, deleted replay, navigation, authority and restart; fixtures only')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
