const {spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const fs=require('node:fs'),path=require('node:path');
const registry=require('./registry.cjs'),ssh=require('./ssh.cjs');

// Private line-delimited native executor RPC over the existing SSH connection.
class NativeExecutor{
 constructor(id,cwd,script){
  const target=id==='local'?null:registry.target(id,cwd);
  const bootstrap=fs.readFileSync(path.join(__dirname,'../Runtime/native_bootstrap.mjs'),'utf8');
  const command=target?.os==='windows'?'& node --input-type=module -e '+ssh.psquote(bootstrap):
   'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"; exec node --input-type=module -e '+ssh.quote(bootstrap);
  this.child=target?spawn(ssh.sshExecutable(),[...ssh.args(target),ssh.command(target,command)],{env:ssh.env(target),stdio:['pipe','pipe','pipe'],windowsHide:true}):
   spawn(process.execPath,['--input-type=module','-e',bootstrap],{cwd,env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  this.pending=new Map();this.sequence=0;this.stderr='';this.closed=false;
  this.child.stderr.on('data',data=>this.stderr=(this.stderr+data).slice(-3000));
  this.child.stdin.on('error',()=>{});
  this.lines=createInterface({input:this.child.stdout});
  this.lines.on('line',line=>{
   let reply;try{reply=JSON.parse(line)}catch{return}
   const call=this.pending.get(reply.id);if(!call)return;
   if(reply.environment)this.environment=reply.environment;
   if(Object.hasOwn(reply,'update')){call.onUpdate?.(reply.update);return}
   this.pending.delete(reply.id);call.cleanup();
   if(reply.error){const error=Object.assign(Error(reply.error.message),reply.error);call.reject(error)}else call.resolve(reply.result);
  });
  this.child.on('error',error=>this.fail(error));
  this.child.on('close',()=>{this.closed=true;this.fail(Error(this.stderr.trim()||'Native execution connection closed'))});
  this.child.stdin.write(Buffer.from(script).toString('base64')+'\n');
 }
 fail(error){for(const call of this.pending.values()){call.cleanup();call.reject(error)}this.pending.clear()}
 request(method,args=[],context={},onUpdate,signal){
  if(this.closed)return Promise.reject(Error('Native execution connection closed'));
  signal?.throwIfAborted();
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const cancel=()=>this.child.stdin.write(JSON.stringify({id,method:'cancel'})+'\n');
   signal?.addEventListener('abort',cancel,{once:true});
   this.pending.set(id,{resolve,reject,onUpdate,cleanup:()=>signal?.removeEventListener('abort',cancel)});
   this.child.stdin.write(JSON.stringify({id,method,args,context})+'\n');
  });
 }
 close(){this.closed=true;this.child.stdin.end();this.child.kill('SIGTERM');this.fail(Error('Native execution connection closed'))}
}
module.exports={NativeExecutor};
