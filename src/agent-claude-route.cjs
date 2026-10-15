const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomBytes,timingSafeEqual,createHash}=require('node:crypto'),ssh=require('./ssh.cjs');
const {ClaudeWorker}=require('./agent-claude-worker.cjs');
async function open(role,{controlCwd,save}){
 const token=randomBytes(32).toString('hex'),controllers=[controlCwd,fs.realpathSync(controlCwd)];
 const attachmentRoot=path.join(fs.realpathSync(controlCwd),'native-attachments'),attachmentIndex=path.join(attachmentRoot,'paths.json');
 const attachments=fs.existsSync(attachmentIndex)?JSON.parse(fs.readFileSync(attachmentIndex,'utf8')):{};
 let worker,connecting,environment,closed=false,attached=false,attachedResolve;
 const attachment=new Promise(resolve=>attachedResolve=resolve);
 async function connect(){
  if(closed)throw Error('Native execution connection closed');
  if(connecting)return connecting;
  if(worker&&!worker.closed)return worker;
  connecting=(async()=>{
   worker=new ClaudeWorker(role.targetHostId,role.nativeWorkCwd||role.cwd);
   try{environment={...await worker.request('initialize'),controllers,attachments};return worker}
   catch(error){worker.close();throw error}
  })().finally(()=>connecting=undefined);
  return connecting;
 }
 await connect();
 const plugin=path.join(controlCwd,'native-execution');
 fs.mkdirSync(path.join(plugin,'.claude-plugin'),{recursive:true,mode:0o700});fs.mkdirSync(path.join(plugin,'hooks'),{recursive:true});
 fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'native-execution',version:'1.0.0'}));
 fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.js']}));
 fs.copyFileSync(path.join(__dirname,'../Runtime/claude_route.mjs'),path.join(plugin,'hooks/register.js'));
 const shellLauncher=path.join(controlCwd,'native-shell');
 fs.writeFileSync(shellLauncher,'#!/bin/sh\nexec '+ssh.quote(process.execPath)+' '+ssh.quote(path.join(__dirname,'../Runtime/native_call.mjs'))+' --shell "$1"\n',{mode:0o700});
 const server=http.createServer(async(req,res)=>{
  const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(closed||req.method!=='POST'||req.headers.origin||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){res.writeHead(403).end();return}
  const abort=new AbortController();res.on('close',()=>abort.abort());
  try{
   let body='';for await(const chunk of req)body+=chunk;
   const {operation,args={}}=JSON.parse(body);let result;
   if(operation==='attached'){attached=true;attachedResolve();result={attached:true}}
   else if(operation==='environment')result=environment;
   else if(operation==='mention'){
    const current=await connect(),paths=environment.platform==='win32'?path.win32:path.posix;
    const mentioned=args.mention.replace(/#L\d+(?:-L?\d+)?$/,'');
    const target=/^~(?:[/\\]|$)/.test(mentioned)?paths.resolve(environment.home,mentioned.slice(2)):paths.resolve(environment.cwd,mentioned);
    const reply=await current.request('call',[{tool:'Read',file_path:target,...(args.offset?{offset:args.offset}:{}),...(args.limit?{limit:args.limit}:{})}],{},undefined,abort.signal);
    if(reply.deny||reply.isError)throw Error(reply.deny||reply.text||'The native file read failed');
    const value=await ssh.files(role.targetHostId,'native_io',{operation:'read',args:{path:target}},environment.cwd);
    const local=path.join(attachmentRoot,createHash('sha256').update(target).digest('hex').slice(0,16),paths.basename(target));
    fs.mkdirSync(path.dirname(local),{recursive:true,mode:0o700});fs.writeFileSync(local,Buffer.from(value.data,'base64'),{mode:0o600});
    attachments[local]=target;fs.writeFileSync(attachmentIndex,JSON.stringify(attachments),{mode:0o600});
    result={path:local,target,environment};
   }
   else if(operation==='call'){
    const current=await connect(),reply=await current.request('call',[args.tool],{},undefined,abort.signal);
    environment={...environment,...current.environment};result={reply,environment};
    if(environment.cwd!==role.nativeWorkCwd){role.nativeWorkCwd=environment.cwd;save?.()}
   }else throw Error('Unsupported native operation');
   if(!res.destroyed)res.end(JSON.stringify({result}));
  }catch(error){if(!res.destroyed){res.writeHead(400);res.end(JSON.stringify({error:error.message}))}}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {args:['--plugin-dir',plugin,'--permission-mode','default',...(role.permission==='full'?['--allowedTools',environment.tools.map(tool=>tool.name).join(',')]:[])],environment:{CLOUD_HOSTS_ROUTE_URL:'http://127.0.0.1:'+server.address().port,CLOUD_HOSTS_ROUTE_TOKEN:token,
  CLOUD_HOSTS_NODE:process.execPath,CLOUD_HOSTS_NATIVE_CALL:path.join(__dirname,'../Runtime/native_call.mjs'),CLAUDE_CODE_SHELL_PREFIX:shellLauncher},
  async ready(timeout=12000){if(attached)return;let timer;try{await Promise.race([attachment,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Native execution adapter did not attach')),timeout)})])}finally{clearTimeout(timer)}},
  async close(){if(closed)return;closed=true;worker?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
}
module.exports={open};
