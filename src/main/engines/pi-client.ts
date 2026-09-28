import fs from 'node:fs'
import path from 'node:path'
import {StringDecoder} from 'node:string_decoder'
import spawn from 'cross-spawn'
import {spawnEmployeeProcess} from '../agent-process-isolation'
import {terminateTree} from '../platform'
import {childEnv} from '../exec'
import {engineExecutable} from './executable'
import {engineEnvironment} from './configuration'

export function piClient(options:{cwd:string;directory:string;employeeId?:string;sessionFile?:string;model?:string;env?:NodeJS.ProcessEnv;onEvent?:(event:any)=>void;onPermission?:(request:{toolName:string;toolCallId:string;input:Record<string,unknown>})=>Promise<boolean>}){
  fs.mkdirSync(options.directory,{recursive:true,mode:0o700})
  const policy=path.join(options.directory,'company-permissions.mjs')
  fs.writeFileSync(policy,`export default function(pi){pi.on('tool_call',async(event,ctx)=>{const allowed=await ctx.ui.confirm('Agents Company tool permission',JSON.stringify({toolName:event.toolName,toolCallId:event.toolCallId,input:event.input}));if(!allowed)return {block:true,reason:'Declined by Agents Company permission policy'};});}\n`,{mode:0o600})
  const env={...childEnv(),...engineEnvironment('pi'),...options.env,PI_CODING_AGENT_DIR:options.directory,PI_OFFLINE:'1'}
  const secrets=Object.entries(env).filter(([k,v])=>/key|token|password/i.test(k)&&v&&v.length>8).map(([,v])=>v!)
  const redact=(text:string)=>secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),text)
  const args=['--mode','rpc','--offline','--provider','deepseek','--model',options.model||'deepseek-flash','--thinking','off','--session-dir',path.join(options.directory,'sessions'),'--no-extensions','--no-skills','--no-prompt-templates','--no-themes','--no-approve','--extension',policy,...(options.sessionFile?['--session',options.sessionFile]:[])]
  const processOptions={cwd:options.cwd,env,stdio:['pipe','pipe','pipe'] as ['pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'}
  const child=options.employeeId?spawnEmployeeProcess(options.employeeId,engineExecutable('pi'),args,processOptions):spawn(engineExecutable('pi'),args,processOptions)
  let sequence=0,stderr='',closed=false,buffer='';const decoder=new StringDecoder('utf8')
  const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
  const fail=(error:Error)=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(error)}pending.clear()}
  child.stderr?.on('data',data=>stderr=redact(stderr+String(data)).slice(-4096))
  child.once('error',error=>fail(Error(redact(error.message))))
  const exited=new Promise<void>(resolve=>child.once('close',code=>{closed=true;const error='Pi exited ('+code+'): '+stderr;fail(Error(error));options.onEvent?.({type:'process_error',error});resolve()}))
  const send=(value:unknown)=>{if(closed||!child.stdin?.writable)throw Error('Pi connection is closed');child.stdin.write(JSON.stringify(value)+'\n')}
  const consume=(line:string)=>{
    let message:any
    try{message=JSON.parse(line)}catch{fail(Error('Pi emitted invalid RPC JSON'));return}
    if(message.type==='response'&&pending.has(message.id)){
      const value=pending.get(message.id)!;pending.delete(message.id);clearTimeout(value.timer)
      message.success?value.resolve(message.data):value.reject(Error(redact(message.error??'Pi request failed')))
    }else if(message.type==='extension_ui_request'){
      if(message.method==='confirm'&&message.title==='Agents Company tool permission'){
        let request:any;try{request=JSON.parse(message.message)}catch{send({type:'extension_ui_response',id:message.id,cancelled:true});return}
        void (options.onPermission?.(request)??Promise.resolve(false)).then(confirmed=>{if(!closed)send({type:'extension_ui_response',id:message.id,confirmed})}).catch(()=>{if(!closed)send({type:'extension_ui_response',id:message.id,cancelled:true})})
      }else if(['select','confirm','input','editor'].includes(message.method))send({type:'extension_ui_response',id:message.id,cancelled:true})
    }else options.onEvent?.(message)
  }
  // Pi framing is LF-only; Unicode line/paragraph separators are valid JSON text.
  child.stdout?.on('data',chunk=>{buffer+=decoder.write(chunk);let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);if(line)consume(line)}})
  return {
    call(type:string,params:Record<string,unknown>={},timeout=30000):Promise<any>{return new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('Pi '+type+' timed out'))},timeout);pending.set(id,{resolve,reject,timer});try{send({id,type,...params})}catch(error){pending.delete(id);clearTimeout(timer);reject(error)}})},
    async close(){if(closed)return;child.stdin?.end();const timer=setTimeout(()=>terminateTree(child,true),2000);try{await exited}finally{clearTimeout(timer)}},
    redact
  }
}
