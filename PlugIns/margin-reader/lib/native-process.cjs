"use strict";
const {spawn}=require('node:child_process');
const {ReaderError}=require('./safety.cjs');
// Private bounded subprocess adapter. No command string, shell, executable path
// or environment variable can be supplied through the plugin's public API.
function createNativeProcess(){
 let closed=false;const active=new Set(),pending=new Set();
 function run(file,args,{input='',timeout=30000,maxOutput=2*1024*1024}={}){
  if(closed)return Promise.reject(new ReaderError('RUNTIME_CLOSED','Reader has closed.'));
  if(active.size>=2)return Promise.reject(new ReaderError('BUSY','Two native reading jobs are already running. Try again after one finishes.'));
  const work=new Promise((resolve,reject)=>{
   let child,settled=false,size=0,output=[],errors=[],timer,stopping;
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);active.delete(entry);error?reject(error):resolve(result);};
   const stop=error=>{if(settled)return;stopping=error;if(child&&!child.killed)child.kill('SIGKILL');else if(!child)finish(error);};
   const entry={stop,promise:null};active.add(entry);
   try{
    child=spawn(file,args,{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
    const append=(target,bytes)=>{size+=bytes.length;if(size>maxOutput)stop(new ReaderError('TOO_LARGE','Native reading result exceeded its memory limit.'));else target.push(bytes);};
    child.stdout.on('data',b=>append(output,b));child.stderr.on('data',b=>append(errors,b));
    child.once('error',e=>finish(new ReaderError(e.code==='ENOENT'?'NATIVE_UNAVAILABLE':'NATIVE_FAILED','The local reading service could not start.')));
    child.once('close',code=>{if(stopping){finish(stopping);return;}if(code===0)finish(null,{stdout:Buffer.concat(output).toString('utf8'),stderr:Buffer.concat(errors).toString('utf8')});else finish(new ReaderError('NATIVE_FAILED','The installed local reading service returned an error.'));});
    timer=setTimeout(()=>stop(new ReaderError('NATIVE_TIMEOUT','The local reading service timed out.')),timeout);timer.unref?.();
    child.stdin.on('error',()=>{});child.stdin.end(input);
   }catch(e){finish(e);}
  });
  pending.add(work);work.then(()=>pending.delete(work),()=>pending.delete(work));return work;
 }
 return {run,async close(){closed=true;for(const entry of [...active])entry.stop(new ReaderError('RUNTIME_CLOSED','Reader closed during a local reading job.'));await Promise.allSettled([...pending]);}};
}
module.exports={createNativeProcess};
