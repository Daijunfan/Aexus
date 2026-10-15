// Original Cline executors only. No model, session, provider or prompt is started.
import {sdk} from './cline_sdk.mjs';
import {checkpointOperation} from './cline_checkpoint.mjs';
import {createInterface} from 'node:readline';
const executors=sdk.createDefaultExecutors(),pending=new Map();
const allowed=new Set(['readFile','search','bash','webFetch','editor','applyPatch']);
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
const lines=createInterface({input:process.stdin});
let closing=false;
process.stdout.on('error',()=>close());
lines.on('line',line=>{
 const request=JSON.parse(line),id=request.id;
 if(request.method==='cancel'){pending.get(id)?.abort();return}
 if(request.method==='initialize'){
  const shell=sdk.createDefaultTools({executors,cwd:process.cwd()}).find(tool=>tool.name==='run_commands');
  send({id,result:{cwd:process.cwd(),platform:process.platform,shellDescription:shell?.description,checkpoints:typeof sdk.SessionVersioningService==='function',methods:[...allowed].filter(name=>typeof executors[name]==='function')}});return;
 }
 const abort=new AbortController();pending.set(id,abort);
 (async()=>{
  try{
   if(request.method==='checkpoint'){send({id,result:await checkpointOperation(sdk,process.cwd(),request.args[0])});return}
   if(!allowed.has(request.method)||typeof executors[request.method]!=='function')throw Error('Unsupported native Cline executor');
   const context={...request.context,signal:abort.signal,emitUpdate:update=>send({id,update})};
   const result=await executors[request.method](...request.args,context);
   send({id,result});
  }catch(error){send({id,error:{message:error.message,name:error.name,exitCode:error.exitCode,output:error.output,signal:error.signal,code:error.code}})}
  finally{pending.delete(id);if(closing&&pending.size===0)process.exit(0)}
 })();
});
const close=()=>{closing=true;for(const abort of pending.values())abort.abort();if(!pending.size)process.exit(0)};
lines.on('close',close);process.on('SIGTERM',close);process.on('SIGHUP',close);
