// Private native execution backend. No model tools, prompts or Role Board API.
const http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const ssh=require('./ssh.cjs'),hosts=require('./agent-hosts.cjs');

async function open(role,{controlCwd,createWorker=(id,cwd)=>new ssh.Workspace(id,cwd)}={}){
 const controlPaths=controlCwd?[controlCwd,fs.realpathSync(controlCwd)]:[];
 const target=hosts.get(role.targetHostId),paths=target.os==='windows'?path.win32:path.posix;
 const token=randomBytes(32).toString('hex'),commands=new Set();
 let closed=false,fileWorker,opening,environment,attached=false,confirmAttached;
 const attachment=new Promise(resolve=>{confirmAttached=resolve});
 const toTarget=value=>{
  let name=String(value||role.cwd);
  if(name==='~'||/^~[\\/]/.test(name))name=paths.join(environment.home,name.slice(2));
  const controller=controlPaths.find(folder=>name===folder||name.startsWith(folder+path.sep));
  if(controller)name=path.relative(controller,name)||'.';
  return paths.resolve(role.cwd,name);
 };
 async function connect(){
  if(closed)throw Error('Native work connection is closed');
  if(fileWorker)return fileWorker;
  if(opening)return opening;
  opening=(async()=>{
   const worker=createWorker(target.id,role.cwd);
   worker.child.once('close',()=>{if(fileWorker===worker)fileWorker=null});
   try{
    const ready=await worker.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'native-execution',version:'1'}});
    if(closed)throw Error('Native work connection is closed');
    environment=ready.environment;fileWorker=worker;
    return worker;
   }catch(error){worker.close();throw error}
  })().finally(()=>{opening=null});
  return opening;
 }
 await connect();
 async function invoke(operation,args,signal,onOutput){
  if(operation==='attached'){attached=true;confirmAttached();return {attached:true}}
  if(operation==='environment')return {os:target.os,cwd:environment.cwd,home:environment.home,hostname:environment.hostname};
  if(operation==='execute'){
   // Each shell call owns its cancellation and working directory, including
   // parallel calls. A lost connection is never replayed automatically.
   const command=createWorker(target.id,toTarget(args.cwd||role.cwd));commands.add(command);command.onOutput=onOutput;
   const cancel=()=>command.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{}})+'\n');
   signal.addEventListener('abort',cancel,{once:true});
   try{
    const timeout=args.timeout===undefined?null:Number(args.timeout);
    const reply=await command.request('tools/call',{name:'execute',arguments:{command:args.command,timeout,stream:true}},timeout===null?0:(timeout+20)*1000);
    const result=JSON.parse(reply.content[0].text);if(result.error)throw Error(result.error);return result;
   }finally{signal.removeEventListener('abort',cancel);commands.delete(command);command.close()}
  }
  if(!['stat','access','read','write','mkdir','readdir','find','grep','spill'].includes(operation))throw Error('Unsupported native operation');
  return (await connect()).call('native_io',{operation,args:{...args,path:toTarget(args.path)}});
 }
 const server=http.createServer(async(req,res)=>{
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(closed||req.method!=='POST'||req.headers.origin||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){res.writeHead(403).end();return}
  const abort=new AbortController();res.on('close',()=>abort.abort());
  try{
   let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32*1024*1024)throw Error('Native request exceeds 32 MiB');body+=chunk}
   const request=JSON.parse(body);
   const streaming=request.operation==='execute';
   res.setHeader('content-type',streaming?'application/x-ndjson':'application/json');
   const result=await invoke(request.operation,request.args||{},abort.signal,output=>{if(!res.destroyed)res.write(JSON.stringify({output})+'\n')});
   if(!res.destroyed)res.end(JSON.stringify({result})+(streaming?'\n':''));
  }catch(error){if(!res.destroyed){if(!res.headersSent)res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message})+'\n')}}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {environment:{CLOUD_HOSTS_ROUTE_URL:'http://127.0.0.1:'+server.address().port,CLOUD_HOSTS_ROUTE_TOKEN:token},
  async ready(timeout=12000){
   if(attached)return;
   let timer;
   try{await Promise.race([attachment,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Native execution adapter did not attach')),timeout)})])}
   finally{clearTimeout(timer)}
  },
  async close(){
   if(closed)return;closed=true;
   for(const command of commands)command.close();fileWorker?.close();
   server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }};
}
module.exports={open};
