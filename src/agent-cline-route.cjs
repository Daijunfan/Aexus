const path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
async function open(role,{controlCwd,save}){
 const environment={CLINE_HUB_DISCOVERY_PATH:path.join(controlCwd,'cline-hub.json'),
  CLINE_HUB_BUILD_ID:'cloudhosts-native-cline-'+role.id,CLINE_SESSION_BACKEND_MODE:'hub',CLINE_HUB_LOG_LEVEL:'error'};
 const child=spawn(process.execPath,[path.join(__dirname,'../Runtime/cline_route.mjs')],
  {cwd:controlCwd,env:{...process.env,...environment},stdio:['pipe','pipe','pipe'],windowsHide:true});
 let closing=false,error,diagnostic='',onExit;
 const done=new Promise(resolve=>child.once('close',resolve));
 child.stderr.on('data',chunk=>diagnostic=(diagnostic+chunk).slice(-2000));child.stdin.on('error',()=>{});
 child.once('close',()=>{if(!closing){error=Error(diagnostic.trim()||'Native Cline Core connection closed');onExit?.(error)}});
 const close=async()=>{if(closing)return done;closing=true;child.stdin.end();const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(timer)};
 try{
  const identity=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(Error('Native Cline Core startup timed out'));child.kill('SIGTERM')},30000);
   const lines=createInterface({input:child.stdout});
   lines.on('line',line=>{
    if(line.startsWith('__CLOUDHOSTS_NATIVE_ROUTE__')){clearTimeout(timer);resolve(JSON.parse(line.slice('__CLOUDHOSTS_NATIVE_ROUTE__'.length)))}
    else if(line.startsWith('__CLOUDHOSTS_NATIVE_ID__')){const state=JSON.parse(line.slice('__CLOUDHOSTS_NATIVE_ID__'.length));role.nativeSessionId=state.sessionId;role.nativeHasInput=state.hasInput;save?.()}
   });
   child.once('error',failure=>{clearTimeout(timer);reject(failure)});
   child.once('close',()=>{clearTimeout(timer);reject(error||Error(diagnostic.trim()||'Native Cline Core failed to start'))});
   child.stdin.write(JSON.stringify({...role,controlCwd})+'\n');
  });
  return {environment,nativeSessionId:identity.sessionId,nativeHasInput:identity.hasInput,close,
   ready:async()=>{if(error)throw error},
   onExit(callback){onExit=callback;if(error)callback(error)}};
 }catch(error){await close();throw error}
}
module.exports={open};
