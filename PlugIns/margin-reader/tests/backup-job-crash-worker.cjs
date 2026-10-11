'use strict';
// Test-only worker. It opens only the disposable directory created by its parent.
const path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 const workspace=await fs.realpath(process.argv[2]),tmp=await fs.realpath(os.tmpdir());
 assert(path.dirname(workspace)===tmp&&path.basename(workspace).startsWith('mr-resumable-kill-'),'Crash worker requires a direct disposable test workspace.');
 assert(process.send,'Crash worker must be launched by the test harness with IPC.');
 const S=require('../lib/safety.cjs'),original=S.writeNew;
 let stopped=false;
 S.writeNew=async(file,bytes)=>{
  await original(file,bytes);
  if(!stopped&&file.includes('/package/chunks/')){
   stopped=true;process.send({type:'chunk-durable-before-checkpoint'});
   await new Promise(()=>{});
  }
 };
 const runtime=await require('../runtime.cjs').createPlugin({workspace});
 const reply=await runtime.request({jsonrpc:'2.0',id:randomUUID(),method:'library.backup.job.step',params:{jobId:process.argv[3],password:'disposable crash test passphrase',expectedRevision:Number(process.argv[4]),maxChunks:1}});
 process.send({type:'unexpected-reply',reply});await runtime.close();process.exitCode=1;
})().catch(error=>{process.send?.({type:'error',message:error.message});process.exitCode=1;});
