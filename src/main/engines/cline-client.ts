import fs from 'node:fs'
import {StringDecoder} from 'node:string_decoder'
import spawn from 'cross-spawn'
import {spawnEmployeeProcess} from '../agent-process-isolation'
import {terminateTree} from '../platform'
import {childEnv} from '../exec'
import {engineExecutable} from './executable'
import {engineEnvironment} from './configuration'

export type AcpPermission={sessionId:string;toolCall:{toolCallId:string;title?:string;kind?:string;rawInput?:Record<string,unknown>};options:{optionId:string;kind:string}[]}
export function clineClient(options:{cwd:string;directory:string;employeeId?:string;model?:string;env?:NodeJS.ProcessEnv;onUpdate?:(update:any)=>void;onPermission?:(request:AcpPermission)=>Promise<any>}){
  fs.mkdirSync(options.directory,{recursive:true,mode:0o700})
  const env={...childEnv(),...engineEnvironment('cline'),...options.env,CLINE_PROVIDER:'deepseek',CLINE_MODEL:options.model||'deepseek-flash',CLINE_LOG_ENABLED:'0'}
  const secrets=Object.entries(env).filter(([name,value])=>/key|token|password/i.test(name)&&value&&value.length>8).map(([,value])=>value!)
  const redact=(text:string)=>secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),text)
  const args=['--acp','--auto-approve','false','--config',options.directory,'--data-dir',options.directory+'/data']
  const processOptions={cwd:options.cwd,env,stdio:['pipe','pipe','pipe'] as ['pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'}
  const child=options.employeeId?spawnEmployeeProcess(options.employeeId,engineExecutable('cline'),args,processOptions):spawn(engineExecutable('cline'),args,processOptions)
  let sequence=0,stderr='',closed=false
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>}>()
  const fail=(error:Error)=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(error)}pending.clear()}
  child.stderr?.on('data',data=>stderr=redact(stderr+String(data)).slice(-4096))
  child.once('error',error=>fail(Error(redact(error.message))))
  const exited=new Promise<void>(resolve=>child.once('close',code=>{closed=true;fail(Error('Cline exited ('+code+'): '+stderr));resolve()}))
  const send=(value:unknown)=>{if(closed||!child.stdin?.writable)throw Error('Cline connection is closed');child.stdin.write(JSON.stringify(value)+'\n')}
  const consume=(line:string)=>{
    let message:any
    try{message=JSON.parse(line)}catch{fail(Error('Cline emitted invalid ACP JSON'));return}
    if(message.method&&message.id!==undefined){
      const reply=message.method==='session/request_permission'&&options.onPermission?options.onPermission(message.params):Promise.resolve({outcome:{outcome:'cancelled'}})
      void reply.then(result=>{if(!closed)send({jsonrpc:'2.0',id:message.id,result})}).catch(error=>{if(!closed)send({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:redact(String(error))}})})
    }else if(message.method==='session/update')options.onUpdate?.(message.params.update)
    else if(pending.has(message.id)){
      const value=pending.get(message.id)!;pending.delete(message.id);clearTimeout(value.timer)
      if(message.error)value.reject(Error(redact(message.error.message??JSON.stringify(message.error))))
      else value.resolve(message.result)
    }
  }
  let buffer='';const decoder=new StringDecoder('utf8')
  child.stdout?.on('data',chunk=>{buffer+=decoder.write(chunk);let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);if(line)consume(line)}})
  return {
    call(method:string,params:Record<string,unknown>={},timeout=30000):Promise<any>{return new Promise((resolve,reject)=>{const id=++sequence,timer=timeout?setTimeout(()=>{pending.delete(id);reject(Error('Cline '+method+' timed out'))},timeout):undefined;pending.set(id,{resolve,reject,timer});try{send({jsonrpc:'2.0',id,method,params})}catch(error){pending.delete(id);clearTimeout(timer);reject(error)}})},
    notify(method:string,params:Record<string,unknown>={}){send({jsonrpc:'2.0',method,params})},
    async close(){if(closed)return;child.stdin?.end();terminateTree(child);const timer=setTimeout(()=>terminateTree(child,true),2000);try{await exited}finally{clearTimeout(timer)}},
    redact
  }
}
