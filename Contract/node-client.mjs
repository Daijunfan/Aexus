import {execFile,spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
export const CONTRACT_VERSION='1.0.0'
const failure=(code,message,cause)=>Object.assign(new Error(message),{code,...(cause?{cause}:{})})
/** No shell, no identity substitution, and no implicit retry of a mutation. */
export function createNodeClient({cli=process.env.AEXUS_CLI??fileURLToPath(new URL('../Infra/src/cli/aexus',import.meta.url)),env=process.env,engineId=env.AEXUS_ENGINE_ID,timeout=30000,maxBuffer=16*1024*1024,launcher}={}){
 env={...env,...(engineId!==undefined?{AEXUS_ENGINE_ID:engineId}:{})}
 const program=launcher??[process.execPath,cli]
 if(!Array.isArray(program)||!program.length||program.some(value=>typeof value!=='string'||!value))throw failure('CONTRACT_REQUEST_INVALID','launcher must be a nonempty executable-and-arguments array')
 const executable=[...program]
 const request=(command,args={})=>{
  let input
  try{input=JSON.stringify(args)}catch(error){return Promise.reject(failure('CONTRACT_REQUEST_INVALID','Arguments must be JSON serializable',error))}
  return new Promise((resolve,reject)=>{
   const child=execFile(executable[0],[...executable.slice(1),'api','call',command,'--args','@-','--json'],{env,timeout,maxBuffer,windowsHide:true},(error,stdout,stderr)=>{
    let reply
    try{reply=JSON.parse(stdout)}catch{reject(failure('CONTRACT_TRANSPORT_ERROR',error?.killed?'Transport timed out; the operation outcome may be unknown':stderr.trim()||error?.message||'Invalid CLI response',error));return}
    if(!reply||typeof reply!=='object'||Array.isArray(reply)||typeof reply.ok!=='boolean'){reject(failure('CONTRACT_TRANSPORT_ERROR','Invalid CLI response envelope'));return}
    if(!reply.ok){reject(failure(reply.code??'INFRA_ERROR',typeof reply.error==='string'?reply.error:'Infra rejected the request'));return}
    if(error){reject(failure('CONTRACT_TRANSPORT_ERROR',error.message,error));return}
    resolve(reply.data)
   })
   // execFile owns process/transport failure; a closed pipe must not crash the Engine process.
   child.stdin?.on('error',()=>{})
   child.stdin?.end(input)
  })
 }
 return {
  async invoke(command,args={}){
   const r=await request('contract.call',{version:CONTRACT_VERSION,command,args})
   if(!r||r.contractVersion!==CONTRACT_VERSION||r.command!==command)throw failure('CONTRACT_RESPONSE_INVALID','Contract response did not match the request')
   return r.data
  },
  describe:command=>request('contract.describe',{version:CONTRACT_VERSION,...(command?{command}:{})}),
  info:()=>request('contract.info'),
  engines:()=>request('contract.engines'),
  async *follow(employee,{signal,raw=false}={}){
   signal?.throwIfAborted()
   const exported=await request('contract.describe',{version:CONTRACT_VERSION,command:'session.follow'})
   if(exported.command?.transport!=='stream')throw failure('CONTRACT_STREAM_REQUIRED','Infra does not provide session following')
   signal?.throwIfAborted()
   const child=spawn(executable[0],[...executable.slice(1),'session','follow','--employee',employee,'--json',...(raw?['--raw']:[])],{env,signal,stdio:['ignore','pipe','pipe'],windowsHide:true})
   let stderr='',processError
   child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8192)})
   const ended=new Promise(resolve=>{child.once('error',error=>{processError=error;resolve(-1)});child.once('close',resolve)})
   const lines=createInterface({input:child.stdout,crlfDelay:Infinity})
   try{
    for await(const line of lines){
     if(!line.trim())continue
     let value;try{value=JSON.parse(line)}catch(error){throw failure('CONTRACT_TRANSPORT_ERROR','Invalid JSON session event',error)}
     if(value?.ok===false)throw failure(value.code??'INFRA_ERROR',value.error??'Session stream rejected')
     yield value
    }
    const code=await ended
    if(code!==0&&!signal?.aborted)throw failure('CONTRACT_TRANSPORT_ERROR',processError?.message||stderr||'Session stream closed unexpectedly',processError)
   }finally{lines.close();if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await ended}
  }
 }
}
