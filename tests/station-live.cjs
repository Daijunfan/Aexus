const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const registryFile=path.join(os.homedir(),'Library/Application Support/Toolbox/CloudHosts/hosts.json');
const taskHome=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-station-live-'));process.env.CLOUD_HOSTS_HOME=taskHome;fs.copyFileSync(registryFile,path.join(taskHome,'hosts.json'));
// The CLI module must match the backend that serves this run. The tree cannot
// serve itself while other work is in flight (src/release.cjs refuses a
// fingerprint mismatch), so the same pin the WebKit runners accept
// (CLOUD_HOSTS_TEST_BACKEND / CLOUD_HOSTS_TEST_NODE, tests/run-hosts-board-webkit.sh)
// selects the already-built backend this suite drives. Without the pin the
// suite drives the working tree, exactly as before.
const cli=process.env.CLOUD_HOSTS_TEST_BACKEND?require(path.join(process.env.CLOUD_HOSTS_TEST_BACKEND,'cli.cjs')):require('../cli.cjs');
const {rpc,state}=cli;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async()=>{
 // Registered host names are matched exactly; the Windows BUPT host is stored as
 // 'BUPT-Windows' in the live registry, not 'BUPT Windows'.
 const hosts=await rpc('hosts.list'),selected=['GPU-server','BUPT-Windows','DJF-Windows'].map(name=>hosts.find(h=>h.name===name)),created=[];
 const filename='中转 测试 '+crypto.randomUUID().slice(0,8)+'.bin',local=path.join(taskHome,filename);fs.writeFileSync(local,crypto.randomBytes(32*1024*1024));const sha=hash(local);
 async function finish(job){const deadline=Date.now()+240000;while(job.state==='running'){assert.ok(Date.now()<deadline,'Transfer timed out');await new Promise(r=>setTimeout(r,300));job=(await rpc('station.list')).jobs.find(j=>j.id===job.id)}assert.equal(job.state,'done',job.error);return job.result}
 const rows=[];
 try{
  let item=await rpc('station.import',{path:local});assert.equal(item.sha256,sha);
  for(const host of selected){
   assert.ok(host,'Missing test host');const tag='cloud-station-test-'+crypto.randomUUID();
   const command=host.os==='windows'?`$p=Join-Path $env:TEMP '${tag}';New-Item -ItemType Directory -Path $p|Out-Null;[Console]::WriteLine($p)`:`mkdir -p /home/djf/.cache/${tag};printf '%s' /home/djf/.cache/${tag}`;
   const prepared=await rpc('hosts.exec',{id:host.id,command});assert.equal(prepared.exit_code,0,prepared.stderr);const directory=prepared.stdout.trim();created.push({host,directory});
   console.log('Testing',host.name,directory);
   const sent=await finish(await rpc('station.send',{item:item.id,host:host.id,directory}));assert.equal(sent.sha256,sha);
   const rejected=await rpc('station.send',{item:item.id,host:host.id,directory});while(rejected.state==='running'){const status=(await rpc('station.list')).jobs.find(j=>j.id===rejected.id);Object.assign(rejected,status);if(rejected.state==='running')await new Promise(r=>setTimeout(r,100))}assert.equal(rejected.state,'failed');assert.match(rejected.error,/同名/);
   item=await finish(await rpc('station.fetch',{host:host.id,directory,path:item.name}));assert.equal(item.sha256,sha);assert.equal(item.bytes,32*1024*1024);
   rows.push({host:host.name,send:true,fetch:true,checksum:sha,existingFileProtected:true});
  }
  const target=path.join(taskHome,'returned.bin');await rpc('station.export',{item:item.id,destination:target});assert.equal(hash(target),sha);
  const report={bytes:32*1024*1024,filename,localSourceRetained:hash(local)===sha,macRoundTrip:true,hosts:rows};fs.writeFileSync(path.join(__dirname,'../artifacts/station-live-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  for(const {host,directory}of created){const escaped=directory.replace(/'/g,"''");const command=host.os==='windows'?`Remove-Item -LiteralPath '${escaped}' -Recurse -Force`:`python3 -c "import shutil;shutil.rmtree('${directory}')"`;try{await rpc('hosts.exec',{id:host.id,command})}catch(e){console.error('Test cleanup',e.message)}}
  const server=await state();if(server)process.kill(server.pid,'SIGTERM');fs.rmSync(taskHome,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1});
