import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {StringDecoder} from 'node:string_decoder'
import spawn from 'cross-spawn'
import {spawnEmployeeProcess} from '../agent-process-isolation'
import {terminateTree} from '../platform'
import {childEnv} from '../exec'
import {engineExecutable} from './executable'
import {engineEnvironment,engineProcessEnvironment} from './configuration'
import type {RemoteLaunch} from '../tunnel'
import {prepareOpenCodeMcpBridge,type OpenCodeMcpBridge} from './opencode-mcp'
import {deepSeekModels} from '../claude-provider'
import type {ModelInfo} from '../../shared/types'

export type OpenCodePermission={sessionId:string;toolCall:{toolCallId:string;title?:string;kind?:string;rawInput?:Record<string,unknown>};options:{optionId:string;kind:string;name?:string}[]}

/** Official DeepSeek provider only; the user's other native providers stay out of Aexus lists. */
export function opencodeModels(session:any):ModelInfo[]{
  const option=(session?.configOptions??[]).find((c:any)=>c.id==='model')
  const all=(option?.options??[]).map((o:any)=>({value:String(o.value),name:String(o.name??o.value)}))
  const official=all.filter((o:any)=>o.value.startsWith('deepseek/'))
  const list=official.length?official:all
  // OpenCode exposes thought_level as an `effort` config option (low/high/max/default),
  // never a binary thinking switch. Report the real controls so the model menu matches.
  // Real per-model capability (single source of truth: claude-provider deepSeekModels) —
  // deepseek-flash is multimodal, deepseek-v4-pro is text-only. Text-only models must not
  // advertise image input; Core rejects image attachments for them at send time.
  const modalityOf=(value:string)=>deepSeekModels.find(model=>value===model.value||value.endsWith('/'+model.value))?.inputModalities??['text']
  return list.map((o:any)=>({value:o.value,displayName:o.name,description:'DeepSeek Official',inputModalities:modalityOf(String(o.value)),supportsEffort:true,supportedEffortLevels:['low','high','max'],supportsAdaptiveThinking:false,supportsFastMode:false,isDefault:o.value==='deepseek/deepseek-v4-pro'}))
}
export const opencodeDefaultModel='deepseek/deepseek-v4-pro'

// Aexus is the enforcement point. This per-process override (OPENCODE_CONFIG_CONTENT,
// never written to the user's global config) makes the native ACP request permission
// for dangerous tools, and the runtime onPermission callback auto-approves for Full or
// prompts for Ask/Plan. The user's global `allow` config is untouched, so the CLI and
// official VSCode integration keep Full access by default.
// Read-only filesystem tools are asked too: local turns treat them as read-only, but a
// cloud workspace must reject native local reads so the model is forced onto the tunnel
// bridge instead of silently reading the Core host.
const ASKED_TOOLS=['read','edit','glob','grep','list','bash','task','external_directory','todowrite','webfetch','websearch'] as const
export const opencodePermissionOverride=()=>{
  const permission=Object.fromEntries(ASKED_TOOLS.map(tool=>[tool,'ask']))
  return JSON.stringify({permission,agent:{build:{permission},plan:{permission},general:{permission},explore:{permission}}})
}

/** Creation-time discovery: initialize + session/new only, no inference. */
export async function discoverOpenCode(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-opencode-discovery-'))
  const client=await opencodeClient({cwd:directory,directory,env:{DEEPSEEK_API_KEY:engineEnvironment('opencode').DEEPSEEK_API_KEY||'discovery-only-no-inference'}})
  try{
    const protocol=await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}})
    if(protocol.protocolVersion!==1)throw Error('Unsupported OpenCode ACP version')
    const session=await client.call('session/new',{cwd:directory,mcpServers:[]})
    const current=session?.configOptions?.find((c:any)=>c.id==='model')?.currentValue
    return {version:protocol.agentInfo?.version,models:opencodeModels(session),model:String(current??opencodeDefaultModel)}
  }finally{await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}

export async function opencodeClient(options:{cwd:string;directory:string;workRoot?:string;employeeId?:string;model?:string;remoteLaunch?:RemoteLaunch;mcpBridge?:OpenCodeMcpBridge;env?:NodeJS.ProcessEnv;onUpdate?:(update:any)=>void;onPermission?:(request:OpenCodePermission)=>Promise<any>}){
  fs.mkdirSync(options.directory,{recursive:true,mode:0o700})
  const compatibility=options.mcpBridge?await prepareOpenCodeMcpBridge(options.directory,options.remoteLaunch,options.mcpBridge):undefined
  const env={...engineProcessEnvironment('opencode',childEnv(options.cwd,options.workRoot)),OPENCODE_CONFIG_CONTENT:opencodePermissionOverride(),...options.env}
  const secrets=Object.entries(env).filter(([name,value])=>/key|token|password/i.test(name)&&value&&value.length>8).map(([,value])=>value!)
  const redact=(text:string)=>secrets.reduce((value,secret)=>value.replaceAll(secret,'[redacted]'),text)
  const args=['acp']
  const processOptions={cwd:options.cwd,env,stdio:['pipe','pipe','pipe'] as ['pipe','pipe','pipe'],windowsHide:true,detached:process.platform!=='win32'}
  let child:ReturnType<typeof spawn>
  try{child=options.employeeId?spawnEmployeeProcess(options.employeeId,engineExecutable('opencode'),args,processOptions):spawn(engineExecutable('opencode'),args,processOptions)}catch(error){await compatibility?.close();throw error}
  let sequence=0,stderr='',closed=false
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer?:ReturnType<typeof setTimeout>}>()
  const fail=(error:Error)=>{for(const value of pending.values()){clearTimeout(value.timer);value.reject(error)}pending.clear()}
  child.stderr?.on('data',data=>stderr=redact(stderr+String(data)).slice(-4096))
  child.once('error',error=>fail(Error(redact(error.message))))
  const exited=new Promise<void>(resolve=>child.once('close',code=>{closed=true;fail(Error('OpenCode exited ('+code+'): '+stderr));void compatibility?.close().catch(()=>{});resolve()}))
  const send=(value:unknown)=>{if(closed||!child.stdin?.writable)throw Error('OpenCode connection is closed');child.stdin.write(JSON.stringify(value)+'\n')}
  const consume=(line:string)=>{
    let message:any
    try{message=JSON.parse(line)}catch{fail(Error('OpenCode emitted invalid ACP JSON'));return}
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
    model:options.model,managedReasoning:true,
    call(method:string,params:Record<string,unknown>={},timeout=30000):Promise<any>{return new Promise((resolve,reject)=>{const id=++sequence,timer=timeout?setTimeout(()=>{pending.delete(id);reject(Error('OpenCode '+method+' timed out'))},timeout):undefined;pending.set(id,{resolve,reject,timer});try{send({jsonrpc:'2.0',id,method,params})}catch(error){pending.delete(id);clearTimeout(timer);reject(error)}})},
    notify(method:string,params:Record<string,unknown>={}){send({jsonrpc:'2.0',method,params})},
    async close(){try{if(!closed){child.stdin?.end();terminateTree(child);const timer=setTimeout(()=>terminateTree(child,true),2000);try{await exited}finally{clearTimeout(timer)}}}finally{await compatibility?.close()}},
    redact,mcpServer:compatibility?.mcpServer
  }
}
