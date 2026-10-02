'use strict';
// Real bytes in a disposable workspace. It does not import or change a personal library.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),S=require('../lib/safety.cjs'),Source=require('../lib/backup-stream-source.cjs');
(async()=>{
 const output=process.env.MR_AUDIT_OUTPUT||await fs.readFile(path.join(root,'artifacts/interaction-current.txt'),'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts/backup-job-large'));
 assert(path.resolve(output).startsWith(path.join(root,'artifacts')+path.sep));await fs.mkdir(output,{recursive:true});
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'mr-large-job-'));
 const report={passed:false,node:process.version,platform:process.platform,arch:process.arch,sourceBytes:3*384*1024*1024,files:[],calls:[],peakRssBytes:0,modelCalls:0};let runtime,timer;
 try{
  const space=await fs.statfs(workspace,{bigint:true});assert(space.bavail*space.bsize>BigInt(5*1024**3),'This isolated workload needs 5 GiB free.');
  const buffer=crypto.randomBytes(4*1024*1024);
  for(let i=0;i<3;i++){
   const name='part-'+i+'.bin',handle=await fs.open(path.join(workspace,name),'wx'),hash=crypto.createHash('sha256');
   try{for(let n=0;n<96;n++){buffer.writeUInt32LE(i*96+n,0);hash.update(buffer);await handle.writeFile(buffer);}await handle.sync();}finally{await handle.close();}
   report.files.push({name,bytes:384*1024*1024,sha256:hash.digest('hex')});
  }
  runtime=await require('../runtime.cjs').createPlugin({workspace});
  const sample=()=>report.peakRssBytes=Math.max(report.peakRssBytes,process.memoryUsage().rss);sample();timer=setInterval(sample,20);
  const api=async(method,params)=>{const time=performance.now(),r=await runtime.request({jsonrpc:'2.0',id:crypto.randomUUID(),method,params});assert(!r.error,JSON.stringify(r.error));sample();report.calls.push({method,phase:r.result.phase||null,ms:+(performance.now()-time).toFixed(2)});return r.result;};
  const auth={jobId:crypto.randomUUID(),password:'large resumable benchmark passphrase'};
  let job=await api('library.backup.job.create',{...auth,path:'large.mrbackup'});
  job=await api('library.backup.job.step',{...auth,expectedRevision:job.revision,maxChunks:8});report.progressBeforeRestart=job.copiedBytes;
  await runtime.close();runtime=await require('../runtime.cjs').createPlugin({workspace});job=await api('library.backup.job.get',auth);assert.equal(job.copiedBytes,report.progressBeforeRestart);
  const start=performance.now();
  for(let n=0;job.phase!=='ready';n++){assert(n<50);job=await api('library.backup.job.step',{...auth,expectedRevision:job.revision,maxChunks:32,maxFiles:1});}
  report.resumeToReadyMs=+(performance.now()-start).toFixed(2);
  report.published=await api('library.backup.job.publish',{...auth,expectedRevision:job.revision});
  await api('library.backup.inspect',{path:'large.mrbackup',password:auth.password});report.restored=await api('library.backup.restore',{path:'large.mrbackup',password:auth.password,folder:'Recovered'});
  for(const file of report.files){const dest=path.join(workspace,'Recovered',file.name),stat=await fs.stat(dest);assert.equal(stat.size,file.bytes);assert.equal(await Source.hashFile(dest,{version:S.version(stat)}),file.sha256);const original=path.join(workspace,file.name),originalStat=await fs.stat(original);assert.equal(await Source.hashFile(original,{version:S.version(originalStat)}),file.sha256);}
  sample();assert(report.peakRssBytes<768*1024*1024,'Resumable backup exceeded the 768 MiB sampled RSS budget.');
  report.passed=true;console.log('PASS 1.125 GiB actual encrypted data: committed progress survives runtime restart, complete verification and restore match every original SHA-256');
  console.log(JSON.stringify({peakRssMiB:report.peakRssBytes/1048576,progressBeforeRestart:report.progressBeforeRestart,resumeToReadyMs:report.resumeToReadyMs,calls:report.calls},null,2));
 }catch(error){report.error=error.stack;throw error;}
 finally{clearInterval(timer);await runtime?.close();await fs.rm(workspace,{recursive:true,force:true});await fs.writeFile(path.join(output,'backup-job-large.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
