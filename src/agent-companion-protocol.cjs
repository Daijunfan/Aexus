// Machine-readable CLI transport for Pi RPC, Cline ACP and Claude stream-JSON.
// No PTY keyboard injection, transcript scraping or shell-interpolated prompts.
const {StringDecoder}=require('node:string_decoder');
class JsonLines {
 constructor(child,onEvent){
  this.child=child;this.pending=new Map();this.seq=0;this.buffer='';this.decoder=new StringDecoder('utf8');
  this.failed=null;this.closed=false;this.stderr='';this.onEvent=onEvent;
  child.stdout.on('data',data=>{this.buffer+=this.decoder.write(data);if(this.buffer.length>8*1024*1024){this.fail(Error('Engine JSON stream exceeds 8 MiB'));return}
   for(let end;(end=this.buffer.indexOf('\n'))>=0;){const line=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end+1);
    if(!line)continue;try{this.receive(JSON.parse(line))}catch(error){this.fail(Error('Invalid machine-readable Agent event: '+error.message));return}}
  });
  child.stderr.on('data',data=>{this.stderr=(this.stderr+String(data)).slice(-3000)});
  child.on('error',error=>this.fail(error));
  child.on('close',code=>{this.closed=true;this.fail(Error('Native engine exited ('+code+'): '+this.stderr))});
 }
 fail(error){
  if(this.failed)return;this.failed=error;
  for(const [id,request] of this.pending){clearTimeout(request.timer);request.reject(error)}
  this.pending.clear();this.onEvent?.({type:'transport_error',error:error.message});
 }
 receive(value){
  if(value.type==='response'&&this.pending.has(String(value.id))){
   const {resolve,reject,timer}=this.pending.get(String(value.id));this.pending.delete(String(value.id));clearTimeout(timer);
   value.success?resolve(value.data):reject(Error(String(value.error||'Engine RPC failed')));return;
  }
  if(value.id!==undefined&&!value.method&&this.pending.has(String(value.id))){
   const {resolve,reject,timer}=this.pending.get(String(value.id));this.pending.delete(String(value.id));clearTimeout(timer);
   value.error?reject(Error(value.error.message||JSON.stringify(value.error))):resolve(value.result);return;
  }
  this.onEvent?.(value);
 }
 write(data){
  if(this.closed||this.failed||!this.child.stdin.writable)throw Error('Native Agent JSON stream is unavailable');
  this.child.stdin.write(JSON.stringify(data)+'\n');
 }
 request(method,params={},kind='pi',timeout=30000){
  const id=String(++this.seq),payload=kind==='pi'?{id,type:method,...params}:{jsonrpc:'2.0',id:Number(id),method,params};
  return new Promise((resolve,reject)=>{
   const timer=timeout>0?setTimeout(()=>{this.pending.delete(id);reject(Error(method+' request timed out; it will not be resent'))},timeout):null;
   this.pending.set(id,{resolve,reject,timer});
   try{this.write(payload)}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
  });
 }
 async close(){
  if(this.closed)return;
  this.closed=true;this.child.stdin.end();this.child.kill('SIGTERM');
  this.fail(Error('Native Agent connection closed'));
 }
}
module.exports={JsonLines};
