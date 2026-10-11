// Source-built CLI/Core integration with isolated storage; no model calls or shared output.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-channels-api-')),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 const rpc=async(cmd,args={})=>{const response=await f.request(null,cmd,args);assert.ok(response.ok,response.error);return response.data}
 assert.deepEqual(await f.cli('channel','list'),[])
 const settings=await f.cli('channel','settings');assert.equal(settings.enabled,false);assert.equal(settings.host,'127.0.0.1')
 const src=await f.cli('channel','source-add','--data',JSON.stringify({plugin:'x',targetId:'cli-example',locator:'@example',name:'Example'})),custom=await f.cli('channel','create','--name','Custom feed','--engine',JSON.stringify({kind:'external',location:'local',name:'CLI process'}))
 assert.equal((await f.cli('channel','get',src.channelId)).kind,'x');assert.equal((await f.cli('channel','sources','--plugin','x')).length,1)
 const publishedAt=Date.now()-1000,data={sourceId:src.id,externalId:'cli-post',publishedAt,title:'CLI news',body:'Durable article',authorName:'Example',url:'https://example.test/post'},article=path.join(f.temp,'article.json');fs.writeFileSync(article,JSON.stringify(data))
 const post=await f.cli('channel','publish','--data','@'+article);assert.equal(post.status,'created');assert.equal((await f.cli('channel','publish','--data','@'+article)).status,'duplicate')
 assert.equal((await f.cli('channel','posts','--source',src.id,'--query','Durable','--limit','1')).posts[0].id,post.id)
 await f.cli('channel','save',post.id,'on');await f.cli('channel','source-update',src.id,'--patch',JSON.stringify({channelId:custom.id}));assert.equal((await f.cli('channel','posts','--channel',custom.id,'--saved')).total,1)
 const exportResult=await f.cli('channel','export',post.id);assert.ok(exportResult.download?.local);assert.ok(fs.existsSync(exportResult.download.path))
 const issued=await f.cli('channel','collector-add','--name','CLI collector','--sources',JSON.stringify([src.id]));assert.ok(issued.token);assert.equal((await f.request(issued.token,'channel.collector-config',{})).ok,false,'collector token never authenticates into general Core')
 assert.equal((await f.cli('channel','collectors')).some(value=>'token' in value||'token_hash' in value),false)
 const config=await f.cli('channel','collector-config');assert.equal((await f.cli('channel','collector-config','--since-revision',String(config.revision))).changed,false)
 await f.stop();await f.start();assert.equal((await f.cli('channel','post',post.id)).saved,true);assert.equal((await f.cli('channel','post',post.id)).channelId,custom.id)
 await f.cli('channel','source-remove',src.id);assert.deepEqual(await f.cli('channel','sources','--plugin','x'),[]);assert.equal((await f.cli('channel','sources','--include-disabled')).find(value=>value.id===src.id).enabled,false)
 const reenabled=await f.cli('channel','source-add','--data',JSON.stringify({plugin:'x',locator:'https://twitter.com/EXAMPLE/'}));assert.equal(reenabled.id,src.id);assert.equal(reenabled.targetId,'cli-example')
 await f.cli('channel','collector-revoke',issued.collector.id);assert.ok((await f.cli('channel','collectors')).find(value=>value.id===issued.collector.id).revokedAt)
 await f.cli('channel','delete',post.id);assert.equal((await f.cli('channel','publish','--data','@'+article)).status,'deleted');assert.equal((await f.cli('channel','posts')).total,0)
 assert.equal((await rpc('api.describe',{command:'channel.publish'})).name,'channel.publish')
 console.log('PASS authenticated source-built CLI/registry, file publication, saved route persistence across restart, self-contained export, collector/general-token separation and terminal deletion retry')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
