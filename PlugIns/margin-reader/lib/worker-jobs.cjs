'use strict';
const {Worker}=require('node:worker_threads');
const {ReaderError}=require('./safety.cjs');
// A plugin-local pool; closing one workspace never cancels another workspace's work.
function createWorkerJobs(filename,{concurrency=2,timeout=30000,memory=256}={}){
  let closed=false,running=0;const queue=[],active=new Set();
  const stopped=()=>new ReaderError('RUNTIME_CLOSED','The reader closed before the operation completed.');
  function pump(){
    while(!closed&&running<concurrency&&queue.length){
      const job=queue.shift();running++;
      let worker,timer,finished=false;
      const entry={cancel:()=>finish(stopped())};active.add(entry);
      function finish(error,result){
        if(finished)return;finished=true;clearTimeout(timer);active.delete(entry);running--;
        worker?.terminate().catch(()=>{});error?job.reject(error):job.resolve(result);pump();
      }
      try{
        worker=new Worker(filename,{workerData:job.payload,resourceLimits:{maxOldGenerationSizeMb:memory}});
        timer=setTimeout(()=>finish(new ReaderError('PROCESS_TIMEOUT','The bounded media/export worker timed out.')),timeout);timer.unref?.();
        worker.once('message',message=>message.error?finish(new ReaderError(message.error.code||'PROCESS_FAILED',message.error.message||'Worker failed.')):finish(null,message.result));
        worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!finished)finish(new ReaderError('PROCESS_FAILED',`Worker stopped before returning a result (${code}).`));});
      }catch(error){finish(error);}
    }
  }
  return {
    get closed(){return closed;},
    run(payload){if(closed)return Promise.reject(stopped());return new Promise((resolve,reject)=>{queue.push({payload,resolve,reject});pump();});},
    async close(){closed=true;for(const job of queue.splice(0))job.reject(stopped());for(const job of [...active])job.cancel();}
  };
}
module.exports={createWorkerJobs};
