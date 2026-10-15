const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('source-only collector HTTP capability works without the controller URL token, and revokes immediately',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-channel-http-'));
 const child=spawn(process.execPath,[path.join(root,'cli.cjs'),'serve'],{env:{...process.env,CLOUD_HOSTS_HOME:home},
  stdio:['ignore','pipe','pipe']});
 let output='',error='',ready;
 child.stdout.on('data',chunk=>output+=chunk.toString());
 child.stderr.on('data',chunk=>error+=chunk.toString());
 try{
  for(let i=0;i<160;i++){
   const rows=output.split('\n');
   for(const row of rows)try{const parsed=JSON.parse(row);if(parsed.ready&&parsed.url)ready=parsed}catch{}
   if(ready)break;
   if(child.exitCode!==null)throw Error('CloudHosts Core exited: '+error);
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(ready,'Core should boot from verified build: '+error);
  const rpc=async(method,params={})=>{
   const response=await fetch(ready.url+'rpc',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   const body=await response.json();if(body.error)throw Error(body.error.message);return body.result;
  };
  const channel=await rpc('channel.create',{name:'HTTP collector feed',mode:'external'});
  const source=await rpc('channel.source-add',{channelId:channel.id,plugin:'process',locator:'fixture-ingress'});
  const second=await rpc('channel.source-add',{channelId:channel.id,plugin:'process',locator:'other-fixture'});
  const issued=await rpc('channel.collector-add',{name:'Fixture collector',sourceIds:[source.id]});
  assert.match(issued.token,/^news_[a-f0-9]{64}$/);
  assert.equal((await rpc('channel.collectors'))[0].token,undefined);
  const endpoint=new URL(ready.url).origin+'/channel-ingest';
  assert.equal(new URL(ready.url).pathname.includes(issued.token),false,'collector never receives controller route token');
  const ingest=async(token,method,args={},headers={})=>{
   const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',
    authorization:'Bearer '+token,...headers},body:JSON.stringify({method,args})});
   return {status:res.status,body:await res.json()};
  };
  const sourceConfig=await ingest(issued.token,'config');
  assert.equal(sourceConfig.status,200);
  assert.deepEqual(sourceConfig.body.result.sources.map(row=>row.id),[source.id]);
  assert.equal((await ingest(issued.token,'config',{}, {origin:'http://malicious.example'})).status,403);
  assert.equal((await ingest('news_'+'0'.repeat(64),'config')).status,401);
  const article={sourceId:source.id,externalId:'fixture#001',publishedAt:Date.now(),title:'Ingested report',body:'Collector proof'};
  const published=await ingest(issued.token,'publish',article);
  assert.equal(published.status,200);
  assert.equal(published.body.result.status,'created');
  const repeat=await ingest(issued.token,'publish',article);
  assert.equal(repeat.body.result.status,'duplicate');
  assert.equal((await ingest(issued.token,'publish',{...article,sourceId:second.id})).status,403);
  assert.equal((await ingest(issued.token,'channel.create',{name:'Escalate privileges'})).status,403);
  const news=await rpc('channel.timeline',{id:channel.id});
  assert.equal(news.entries.length,1);
  assert.equal(news.entries[0].author.kind,'collector');
  assert.equal(news.entries[0].body,'Collector proof');
  assert.equal((await rpc('channel.read-state',{id:channel.id,entryIds:[news.entries[0].id]})).entries[0].read,false);
  const revoked=await rpc('channel.collector-revoke',{id:issued.collector.id});
  assert.equal(revoked.revoked,true);
  assert.equal((await ingest(issued.token,'config')).status,401);
  assert.equal((await ingest(issued.token,'publish',{...article,externalId:'fixture#002'})).status,401);
  assert.equal((await rpc('channel.timeline',{id:channel.id})).entries.length,1);
 }finally{
  child.kill('SIGTERM');
  await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();
   child.once('exit',resolve);setTimeout(resolve,3000)});
  fs.rmSync(home,{recursive:true,force:true});
 }
});
