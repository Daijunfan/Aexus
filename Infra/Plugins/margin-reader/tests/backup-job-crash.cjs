'use strict';
// Opt-in fault injection: terminate only the worker spawned here, never a host process.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{fork}=require('node:child_process');
const root=path.resolve(__dirname,'..'),S=require('../lib/safety.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const output=process.env.MR_AUDIT_OUTPUT||await fs.readFile(path.join(root,'artifacts/interaction-current.txt'),'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts/backup-crash'));
 assert(path.resolve(output).startsWith(path.join(root,'artifacts')+path.sep));await fs.mkdir(output,{recursive:true});
 const workspace=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-resumable-kill-')));
 let runtime,child;const report={passed:false,platform:process.platform,modelCalls:0,processKilled:'only-this-test-child',physicalPowerLossTested:false};
 try{
  const source=randomBytes(12*1024*1024+19);await fs.writeFile(path.join(workspace,'source.bin'),source);
  report.sourceSha256=createHash('sha256').update(source).digest('hex');
  runtime=await require('../runtime.cjs').createPlugin({workspace});
  const raw=(method,params)=>runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});
  const api=async(method,params)=>{const r=await raw(method,params);assert(!r.error,JSON.stringify(r.error));return r.result;};
  const auth={jobId:randomUUID(),password:'disposable crash test passphrase'};
  let job=await api('library.backup.job.create',{...auth,path:'complete.mrbackup'});
  job=await api('library.backup.job.step',{...auth,expectedRevision:job.revision,maxChunks:1});assert.equal(job.copiedBytes,4*1024*1024);const committed=job;
  child=fork(path.join(__dirname,'backup-job-crash-worker.cjs'),[workspace,auth.jobId,String(job.revision)],{silent:true});
  let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
  const closed=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Crash worker did not reach the checkpoint boundary. '+stderr)),15000);
   child.on('message',message=>{clearTimeout(timer);if(message.type==='chunk-durable-before-checkpoint')resolve();else reject(Error(JSON.stringify(message)));});
   child.once('error',reject);
  });
  child.kill('SIGKILL');report.exit=await closed;assert.equal(report.exit.signal,'SIGKILL');
  job=await api('library.backup.job.get',auth);assert.equal(job.revision,committed.revision);assert.equal(job.copiedBytes,committed.copiedBytes);
  assert.equal(await S.exists(path.join(workspace,'complete.mrbackup')),null);
  console.log('PASS Worker terminated after a durable chunk and before its checkpoint; prior progress remains valid and nothing incomplete is published');
  const start=Date.now();let attempts=0;
  while(true){
   const reply=await raw('library.backup.job.step',{...auth,expectedRevision:job.revision,maxChunks:2});attempts++;
   if(reply.result){job=reply.result;break;}
   assert.equal(reply.error.data.code,'BUSY',JSON.stringify(reply.error));
   assert(Date.now()-start<150000,'Abandoned checkpoint lock did not expire within the documented safety window.');
   await wait(1000);
  }
  report.lockWaitMs=Date.now()-start;report.resumeAttempts=attempts;
  for(let n=0;job.phase!=='ready';n++){assert(n<10);job=await api('library.backup.job.step',{...auth,expectedRevision:job.revision,maxChunks:8,maxFiles:2});}
  await api('library.backup.job.publish',{...auth,expectedRevision:job.revision});await api('library.backup.inspect',{path:'complete.mrbackup',password:auth.password});
  await api('library.backup.restore',{path:'complete.mrbackup',password:auth.password,folder:'Restored'});
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(workspace,'Restored/source.bin'))).digest('hex'),report.sourceSha256);
  assert.deepEqual(await fs.readFile(path.join(workspace,'source.bin')),source);
  report.passed=true;console.log('PASS Expired worker lease is recovered without bypassing locks; resume reuses the orphan chunk, verifies, publishes and restores identical original bytes');
 }catch(error){report.error=error.stack;throw error;}
 finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await runtime?.close();await fs.rm(workspace,{recursive:true,force:true});await fs.writeFile(path.join(output,'backup-job-crash.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
