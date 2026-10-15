const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const project=path.resolve(__dirname,'..'),taskHome=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-folder-live-'));process.env.CLOUD_HOSTS_HOME=taskHome;
fs.copyFileSync(path.join(os.homedir(),'Library/Application Support/Toolbox/CloudHosts/hosts.json'),path.join(taskHome,'hosts.json'));
// Same backend pin as tests/station-live.cjs: the tree cannot serve itself while
// other work is in flight (src/release.cjs fingerprint gate), so an already-built
// backend may be selected with CLOUD_HOSTS_TEST_BACKEND / CLOUD_HOSTS_TEST_NODE.
const cli=process.env.CLOUD_HOSTS_TEST_BACKEND?require(path.join(process.env.CLOUD_HOSTS_TEST_BACKEND,'cli.cjs')):require('../cli.cjs');
const {rpc,state}=cli;
(async()=>{
 const tag='cloud-folder-test-'+crypto.randomUUID(),source=path.join(taskHome,'设计资料');fs.mkdirSync(path.join(source,'子目录','empty'),{recursive:true});fs.writeFileSync(path.join(source,'子目录','notes.txt'),'Folder topology round trip.');fs.writeFileSync(path.join(source,'bytes.bin'),crypto.randomBytes(1024*1024));const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'bytes.bin'))).digest('hex');
 const hosts=await rpc('hosts.list'),created=[],reports=[];let item=await rpc('station.import',{path:source});
 async function finish(job){for(let n=0;n<600&&job.state==='running';n++){await new Promise(r=>setTimeout(r,100));job=(await rpc('station.list')).jobs.find(row=>row.id===job.id)}assert.equal(job.state,'done',job.error);return job.result}
 try{
  for(const name of ['GPU-server','BUPT-Windows','DJF-Windows']){
   const host=hosts.find(h=>h.name===name);assert.ok(host,`Missing test host: ${name}`);const command=host.os==='windows'?`$p=Join-Path $env:TEMP '${tag}';New-Item -ItemType Directory -Path $p -Force|Out-Null;[Console]::WriteLine($p)`:`mkdir -p /home/djf/.cache/${tag};printf '%s' /home/djf/.cache/${tag}`;
   const result=await rpc('hosts.exec',{id:host.id,command});assert.equal(result.exit_code,0,result.stderr);const directory=result.stdout.trim();created.push({host,directory});console.log('Folder transfer',name);
   await finish(await rpc('station.send',{item:item.id,host:host.id,directory}));item=await finish(await rpc('station.fetch',{host:host.id,directory,path:item.name}));
   const values=(await rpc('station.list')).items,leaf=values.find(row=>row.parent===item.id&&row.name==='bytes.bin');assert.equal(leaf.sha256,sha);const nested=values.find(row=>row.parent===item.id&&row.name==='子目录');assert.ok(values.some(row=>row.parent===nested.id&&row.name==='empty'&&row.type==='folder'));reports.push({name,fullFolderRoundTrip:true,binaryChecksum:sha,emptyFolderRetained:true});
  }
  const exported=path.join(taskHome,'exported');await rpc('station.export',{item:item.id,destination:exported});assert.deepEqual(fs.readFileSync(path.join(exported,'bytes.bin')),fs.readFileSync(path.join(source,'bytes.bin')));
  fs.writeFileSync(path.join(project,'artifacts/station-folder-verification.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
 }finally{
  for(const {host,directory}of created){const command=host.os==='windows'?`Remove-Item -LiteralPath '${directory.replace(/'/g,"''")}' -Recurse -Force`:`python3 -c "import shutil;shutil.rmtree('${directory}')"`;try{await rpc('hosts.exec',{id:host.id,command})}catch{}}
  const server=await state();if(server)process.kill(server.pid,'SIGTERM');fs.rmSync(taskHome,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
