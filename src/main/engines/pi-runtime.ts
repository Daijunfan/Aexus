import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {piClient} from './pi-client'
import type {EngineStart,EngineDriver} from './contract'
import {type Live,sandboxFor} from '../sessions'
import {patchSession} from '../store'
import {APP_HOME} from '../../shared/protocol'
import {isInitializer} from '../initialization-state'
import {approvalHandler,cancelApprovals} from '../approvals'
import {engineEnvironment} from './configuration'
import type {ModelInfo} from '../../shared/types'
const modelsFrom=(models:any[]):ModelInfo[]=>models.filter(m=>m.provider==='deepseek').map(m=>({value:m.id,displayName:m.name??m.id,description:'DeepSeek · Thinking off',inputModalities:['text'],supportsEffort:false,supportedEffortLevels:[],supportsAdaptiveThinking:false,supportsFastMode:false,isDefault:m.id==='deepseek-flash'}))
export async function discoverPi(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-pi-discovery-')),client=piClient({cwd:directory,directory,env:{DEEPSEEK_API_KEY:engineEnvironment('pi').DEEPSEEK_API_KEY||'discovery-only-no-inference'}})
  try{const result=await client.call('get_available_models');return {models:modelsFrom(result.models),version:undefined as string|undefined}}finally{await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
export async function openPi(context:EngineStart){
  const {args,card,cardId,sessionId,cwd,permissionMode,host}=context
  if(context.remote||context.nativeRemote||context.workRoot)throw Error('Pi currently supports a local Build workspace on the Core host; remote and plugin workspaces are not supported')
  if(!engineEnvironment('pi').DEEPSEEK_API_KEY)throw Error('Configure the Pi DeepSeek API key in Coding Agent settings first')
  if(args.planMode||permissionMode==='plan')throw Error('Pi does not support Plan mode')
  const directory=path.join(APP_HOME,'agent-access',cardId,'pi'),{live,rememberMeta,emit,dispatchQueued}=host
  if(card?.piSessionFile&&!path.resolve(card.piSessionFile).startsWith(path.resolve(directory)+path.sep))throw Error('Pi session belongs to a different employee profile')
  const state:Live={cardId,privateInitialization:isInitializer(cardId),kind:context.kind,engine:'pi',driver:null as never,q:null as never,input:null as never,sessionId:null,cwd,model:args.model||'deepseek-flash',thinkingEnabled:false,planMode:false,fastMode:false,sandbox:sandboxFor(permissionMode),permissionMode,running:false,queue:[]}
  const approve=approvalHandler(sessionId,()=>emit('session:changed',{sessionId}))
  let turnId='',message=0,finish:(()=>void)|undefined,failure:string|undefined,textSeen=false
  const client=piClient({cwd,directory,employeeId:cardId,model:state.model,sessionFile:card?.piSessionFile,onPermission:async request=>{
    const readOnly=['read','grep','find','ls'].includes(request.toolName)
    if(state.privateInitialization)return readOnly
    if(state.permissionMode==='bypassPermissions'||readOnly||state.permissionMode==='acceptEdits'&&['edit','write'].includes(request.toolName))return true
    if(state.permissionMode==='dontAsk')return false
    return (await approve(request.toolName,request.input,{signal:state.abort!.signal,toolUseID:request.toolCallId,requestId:request.toolCallId,title:'Pi: '+request.toolName}))?.behavior==='allow'
  },onEvent:event=>{
    if(!state.running||!live.has(sessionId))return
    const send=(e:unknown)=>emit('session:agent',{sessionId,event:e})
    if(event.type==='message_start'&&event.message?.role==='assistant')message++
    const update=event.assistantMessageEvent,id=`${turnId}-${message}-${update?.contentIndex??0}`
    if(event.type==='message_update'&&update?.type==='text_delta'){textSeen=true;send({kind:'text-delta',id,text:update.delta})}
    if(event.type==='message_update'&&update?.type==='text_end'){textSeen=true;send({kind:'text',id,text:update.content})}
    if(event.type==='message_update'&&update?.type==='thinking_delta')failure='Pi returned reasoning despite Thinking off'
    if(event.type==='message_end'&&event.message?.role==='assistant'){
      if(['error','aborted'].includes(event.message.stopReason))failure=client.redact(event.message.errorMessage||event.message.stopReason)
      if(event.message.usage)rememberMeta(sessionId,{usage:event.message.usage})
    }
    if(event.type==='tool_execution_start')send({kind:'tool-start',id:event.toolCallId,name:event.toolName,command:JSON.stringify(event.args)})
    if(event.type==='tool_execution_end')send({kind:'tool-end',id:event.toolCallId,name:event.toolName,output:JSON.stringify(event.result),exitCode:event.isError?1:0})
    if(event.type==='process_error')failure=client.redact(event.error)
    if(event.type==='agent_settled'||event.type==='process_error')finish?.()
  }})
  try{
    const current=await client.call('get_state'),catalog=await client.call('get_available_models')
    await client.call('set_model',{provider:'deepseek',modelId:state.model});await client.call('set_thinking_level',{level:'off'})
    state.sessionId=current.sessionId;patchSession(cardId,{piSessionId:current.sessionId,piSessionFile:current.sessionFile,piConfigRoot:directory,model:state.model,thinking:false,effort:undefined})
    const unsupported=(name:string)=>Promise.reject(Error('Pi adapter does not support '+name))
    state.driver={
      send(text,images){
        if(images.length)throw Error('This Pi adapter supports text input only')
        state.running=true;state.abort=new AbortController();turnId=randomUUID();message=0;failure=undefined;textSeen=false
        const settled=new Promise<void>(resolve=>{finish=resolve});rememberMeta(sessionId,{busy:true});emit('session:turn-start',{sessionId})
        state.finished=(async()=>{
          try{await client.call('prompt',{message:text});await settled;if(!failure&&!textSeen)throw Error('Pi returned no assistant response')}catch(error){failure=client.redact(String((error as Error).message))}
          finally{finish=undefined;state.running=false;state.abort=undefined;cancelApprovals(sessionId);if(failure)emit('session:error',{sessionId,message:failure});rememberMeta(sessionId,{busy:false});emit('session:result',{sessionId,success:!failure,error:failure});emit('session:turn-end',{sessionId});if(live.has(sessionId))dispatchQueued(state,sessionId)}
        })()
      },
      async steer(text){await client.call('steer',{message:text})},
      async interrupt(){if(state.running){failure='Interrupted';state.abort?.abort();await client.call('abort');await state.finished}},
      async close(){state.abort?.abort();finish?.();await client.close();await state.finished},
      async whenIdle(){await state.finished},
      async setModel(model){await client.call('set_model',{provider:'deepseek',modelId:model||'deepseek-flash'});await client.call('set_thinking_level',{level:'off'})},
      setPlan(){return unsupported('Plan mode')},async setPermission(mode){if(mode==='auto')throw Error('This adapter does not provide a permission classifier')},
      async setThinking(enabled){if(enabled)throw Error('Pi uses Thinking off');await client.call('set_thinking_level',{level:'off'})},
      async setEffort(effort){if(effort)throw Error('Pi uses Thinking off')},
      async setFast(enabled){if(enabled)throw Error('Pi does not support Fast mode')},background(){return unsupported('background process control')}
    } satisfies EngineDriver
    live.set(sessionId,state);rememberMeta(sessionId,{engine:'pi',cwd,model:state.model,permissionMode,thinking:false,thinkingSupported:false,planMode:false,fastMode:false,commands:[],models:modelsFrom(catalog.models),piSessionId:state.sessionId!,busy:false})
    return {sessionId,cwd,engine:'pi' as const}
  }catch(error){await client.close();throw error}
}
