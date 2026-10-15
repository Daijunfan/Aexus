const path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
class LocalWorker{
 constructor(cwd){
  const root=path.resolve(__dirname,'../../Runtime');
  this.child=spawn('python3',['-u','-c',`import sys,runpy;sys.path.insert(0,${JSON.stringify(root)});runpy.run_path(${JSON.stringify(path.join(root,'remote.py'))},run_name='__main__',init_globals={'CONFIG':${JSON.stringify({directory:cwd,os:'macos'})}})`],{stdio:['pipe','pipe','pipe']});
  this.pending=new Map();this.sequence=0;this.error='';
  this.lines=createInterface({input:this.child.stdout});
  this.lines.on('line',line=>{const reply=JSON.parse(line);if(reply.method==='native/output'){this.onOutput?.(reply.params);return}const task=this.pending.get(reply.id);if(!task)return;this.pending.delete(reply.id);clearTimeout(task.timer);reply.error?task.reject(Error(reply.error.message)):task.resolve(reply.result)});
  this.child.stderr.on('data',b=>this.error+=b);this.child.stdin.on('error',()=>{});
  this.child.on('close',()=>{for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error(this.error||'Worker closed'))}this.pending.clear()});
 }
 request(method,params,timeout=40000){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=timeout?setTimeout(()=>reject(Error('Worker timeout')),timeout):undefined;this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})}
 async call(name,args){const r=await this.request('tools/call',{name,arguments:args}),value=JSON.parse(r.content[0].text);if(r.isError)throw Error(value.error);return value}
 close(){this.child.stdin.end();this.child.kill('SIGTERM');this.lines.close()}
}
module.exports={LocalWorker};
