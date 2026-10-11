import fs from 'node:fs'
import path from 'node:path'
import {StringDecoder} from 'node:string_decoder'
import spawn from 'cross-spawn'
import {spawnEmployeeProcess} from '../agent-process-isolation'
import {terminateTree} from '../platform'
import {childEnv} from '../exec'
import {engineExecutable} from './executable'
import {engineProcessEnvironment,processProvider} from './configuration'
import {atomicJson} from '../atomic-file'
import type {RemoteLaunch} from '../tunnel'
import {preparePiTunnel,type TunnelTool,type TunnelToolCall} from './pi-tunnel'

type CoreTool={tool:{name:string;description:string;inputSchema:Record<string,unknown>};call:(input:unknown,callId:string)=>Promise<unknown>}

export function piClient(options:{discussion?:CoreTool;documentation?:CoreTool;api?:CoreTool;cwd:string;directory:string;workRoot?:string;employeeId?:string;sessionFile?:string;model?:string;remoteLaunch?:RemoteLaunch;tunnelTools?:TunnelTool[];onTunnelCall?:(request:TunnelToolCall)=>Promise<unknown>;env?:NodeJS.ProcessEnv;onEvent?:(event:any)=>void;onPermission?:(request:{toolName:string;toolCallId:string;input:Record<string,unknown>})=>Promise<boolean>}){
  fs.mkdirSync(options.directory,{recursive:true,mode:0o700})
  const provider=processProvider('pi'),modelsFile=path.join(options.directory,'models.json')
  const models=fs.existsSync(modelsFile)?JSON.parse(fs.readFileSync(modelsFile,'utf8')):{}
  if(provider.baseUrl){
    models.providers={...models.providers,[provider.provider]:{baseUrl:provider.baseUrl,api:'openai-completions',apiKey:'$DEEPSEEK_API_KEY',models:[{id:provider.model}]}}
    atomicJson(modelsFile,models,true)
  }else if(models.providers?.['agents-company']){
    delete models.providers['agents-company'];atomicJson(modelsFile,models,true)
  }

  const policy=path.join(options.directory,'company-permissions.mjs')
  fs.writeFileSync(policy,`export default function(pi){pi.on('tool_call',async(event,ctx)=>{const allowed=await ctx.ui.confirm('Agents Company tool permission',JSON.stringify({toolName:event.toolName,toolCallId:event.toolCallId,input:event.input}));if(!allowed)return {block:true,reason:'Declined by Agents Company permission policy'};});}\n`,{mode:0o600})
  const coreTools=[{descriptor:options.discussion,title:'Agents Company discussion'},{descriptor:options.documentation,title:'Agents Company documentation'},{descriptor:options.api,title:'Agents Company API'}].filter((item):item is {descriptor:CoreTool;title:string}=>!!item.descriptor)
  const discussion=path.join(options.directory,'company-discussion.mjs')
  if(coreTools.length)fs.writeFileSync(discussion,`export default function(pi){for(const {tool,title} of ${JSON.stringify(coreTools.map(item=>({tool:item.descriptor.tool,title:item.title})))} ){pi.registerTool({name:tool.name,label:tool.name,description:tool.description,parameters:tool.inputSchema,async execute(toolCallId,input,signal,_update,ctx){if(signal?.aborted)throw Error('Interrupted');const reply=await ctx.ui.input(title,JSON.stringify({toolCallId,input}));if(reply===undefined||signal?.aborted)throw Error('Core tool cancelled');const value=JSON.parse(reply);if(value.isError)throw Error(value.error);return {content:[{type:'text',text:JSON.stringify(value.result)}],details:undefined}}});}}\n`,{mode:0o600})
  const env={...engineProcessEnvironment('pi',childEnv(options.cwd,options.workRoot)),...options.env,PI_CODING_AGENT_DIR:options.directory,PI_OFFLINE:'1'}
  const secrets=Object.entries(env).filter(([k,v])=>/key|token|password/i.test(k)&&v&&v.length>8).map(([,v])=>v!)
  const redact=(text:string)=>secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),text)
  const args=['--mode','rpc','--offline','--provider',provider.provider,'--model',options.model||provider.model,'--thinking','off','--session-dir',path.join(options.directory,'sessions'),'--no-extensions','--no-skills','--no-prompt-templates','--no-themes','--no-approve','--extension',policy,...(coreTools.length?['--extension',discussion]:[]),...(options.remoteLaunch?['--no-builtin-tools','--no-context-files','--system-prompt',options.remoteLaunch.instructions,'--extension',preparePiTunnel(options.directory,options.tunnelTools??[],coreTools.map(item=>item.descriptor.tool.name))]:[]),...(options.sessionFile?['--session',options.sessionFile]:[])]
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
      const coreTool=message.method==='input'?coreTools.find(item=>item.title===message.title)?.descriptor:undefined
      if(coreTool){
        void Promise.resolve().then(()=>{const request=JSON.parse(message.placeholder);if(typeof request.toolCallId!=='string')throw Error('Core tool call ID required');return coreTool.call(request.input,request.toolCallId)}).then(result=>{if(!closed)send({type:'extension_ui_response',id:message.id,value:JSON.stringify({result})})}).catch(error=>{if(!closed)send({type:'extension_ui_response',id:message.id,value:JSON.stringify({isError:true,error:redact(String(error))})})})
      }else if(message.method==='input'&&message.title==='Agents Company Tunnel'){
        void Promise.resolve().then(()=>{if(!options.onTunnelCall)throw Error('Tunnel is unavailable');return options.onTunnelCall(JSON.parse(message.placeholder))}).then(result=>{if(!closed)send({type:'extension_ui_response',id:message.id,value:JSON.stringify(result)})}).catch(error=>{if(!closed)send({type:'extension_ui_response',id:message.id,value:JSON.stringify({isError:true,content:[{type:'text',text:redact(String(error))}]})})})
      }else if(message.method==='confirm'&&message.title==='Agents Company tool permission'){
        let request:any;try{request=JSON.parse(message.message)}catch{send({type:'extension_ui_response',id:message.id,cancelled:true});return}
        void (options.onPermission?.(request)??Promise.resolve(false)).then(confirmed=>{if(!closed)send({type:'extension_ui_response',id:message.id,confirmed})}).catch(()=>{if(!closed)send({type:'extension_ui_response',id:message.id,cancelled:true})})
      }else if(['select','confirm','input','editor'].includes(message.method))send({type:'extension_ui_response',id:message.id,cancelled:true})
    }else options.onEvent?.(message)
  }
  // Pi framing is LF-only; Unicode line/paragraph separators are valid JSON text.
  child.stdout?.on('data',chunk=>{buffer+=decoder.write(chunk);let end:number;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);if(line)consume(line)}})
  return {
    ...provider,
    call(type:string,params:Record<string,unknown>={},timeout=30000):Promise<any>{return new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(Error('Pi '+type+' timed out'))},timeout);pending.set(id,{resolve,reject,timer});try{send({id,type,...params})}catch(error){pending.delete(id);clearTimeout(timer);reject(error)}})},
    // Late tool replies must stop before stdin ends, not after the process exits.
    async close(){if(closed)return;closed=true;child.stdin?.end();const timer=setTimeout(()=>terminateTree(child,true),2000);try{await exited}finally{clearTimeout(timer)}},
    redact
  }
}
