import {DOCUMENTATION_TOOL,invokeDocumentationTool} from '../documentation-tool'
import {DISCUSSION_TOOL,invokeDiscussionTool} from '../discussion-tool'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {openTunnelTools} from '../tunnel'
import {piClient} from './pi-client'
import type {EngineStart,EngineDriver} from './contract'
import {type Live,sandboxFor} from '../sessions'
import {patchSession} from '../store'
import {APP_HOME} from '../../shared/protocol'
import {isInitializer} from '../initialization-state'
import {approvalHandler,cancelApprovals} from '../approvals'
import {engineEnvironment,processProvider} from './configuration'
import type {ModelInfo} from '../../shared/types'
const modelsFrom=(models:any[],provider:ReturnType<typeof processProvider>):ModelInfo[]=>models.filter(m=>m.provider===provider.provider).map(m=>({value:m.id,displayName:m.name??m.id,description:provider.managedReasoning?'OpenAI-compatible · Provider-controlled reasoning':'DeepSeek · Thinking off',inputModalities:['text'],supportsEffort:false,supportedEffortLevels:[],supportsAdaptiveThinking:false,supportsFastMode:false,isDefault:m.id===provider.model}))
export async function discoverPi(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-pi-discovery-')),client=piClient({cwd:directory,directory,env:{DEEPSEEK_API_KEY:engineEnvironment('pi').DEEPSEEK_API_KEY||'discovery-only-no-inference'}})
  try{const result=await client.call('get_available_models');return {models:modelsFrom(result.models,client),version:undefined as string|undefined}}finally{await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
export async function openPi(context:EngineStart){
  const {args,card,cardId,sessionId,cwd,permissionMode,host}=context
  if(context.nativeRemote||context.workRoot)throw Error('Pi supports Core-local Build and Tunnel cloud workspaces only')
  if(context.remote&&!context.remoteLaunch)throw Error('Missing cloud Tunnel; local execution is disabled')
  if(!engineEnvironment('pi').DEEPSEEK_API_KEY)throw Error('Configure the Pi API key in Coding Agent settings first')
  if(args.planMode||permissionMode==='plan')throw Error('Pi does not support Plan mode')
  const provider=processProvider('pi')
  const directory=path.join(APP_HOME,'agent-access',cardId,'pi'),{live,rememberMeta,emit,dispatchQueued}=host
  if(card?.piSessionFile&&!path.resolve(card.piSessionFile).startsWith(path.resolve(directory)+path.sep))throw Error('Pi session belongs to a different employee profile')
  const state:Live={cardId,privateInitialization:isInitializer(cardId),kind:context.kind,engine:'pi',driver:null as never,q:null as never,input:null as never,sessionId:null,cwd,remote:context.remote,remoteLaunch:context.remoteLaunch,model:args.model||provider.model,thinkingEnabled:false,planMode:false,fastMode:false,sandbox:sandboxFor(permissionMode),permissionMode,running:false,queue:[]}
  const approve=approvalHandler(sessionId,()=>emit('session:changed',{sessionId}))
  let receiptTaskId:string|undefined,receiptRead=false
  const markRead=()=>{if(receiptTaskId&&!receiptRead&&state.running){receiptRead=true;emit('session:receipt',{sessionId,taskId:receiptTaskId,stage:'read'})}}
  let turnId='',message=0,finish:(()=>void)|undefined,failure:string|undefined,textSeen=false
  const tunnel=context.remoteLaunch?await openTunnelTools(context.remoteLaunch):undefined
  const approved=new Map<string,string>()
  const client=piClient({documentation:{tool:DOCUMENTATION_TOOL,call:(input,callId)=>invokeDocumentationTool(state,input,callId,state.abort?.signal)},discussion:{tool:DISCUSSION_TOOL,call:(input,callId)=>invokeDiscussionTool(state,input,callId,state.abort?.signal)},cwd:context.remoteLaunch?.cwd??cwd,remoteLaunch:context.remoteLaunch,tunnelTools:tunnel?.tools,onTunnelCall:async request=>{
    const signature=JSON.stringify([request.toolName,request.input]);if(!state.running||state.abort?.signal.aborted||!tunnel||approved.get(request.toolCallId)!==signature)throw Error('Tunnel operation has no matching Core approval')
    approved.delete(request.toolCallId);return tunnel.call(request.toolName.slice('tunnel__'.length),request.input,state.abort?.signal)
  },directory,employeeId:cardId,model:state.model,sessionFile:card?.piSessionFile,onPermission:async request=>{
    markRead()
    if(request.toolName===DISCUSSION_TOOL.name)return !!state.acknowledging
    if(state.acknowledging)return false
    if(request.toolName===DOCUMENTATION_TOOL.name)return true
    const remoteTool=context.remote?request.toolName.match(/^tunnel__(execute|read_file|write_file|edit_file|list_files)$/)?.[1]:undefined
    if(context.remote&&!remoteTool)return false
    const readOnly=context.remote?['read_file','list_files'].includes(remoteTool??''):['read','grep','find','ls'].includes(request.toolName)
    const allow=()=>{if(tunnel)approved.set(request.toolCallId,JSON.stringify([request.toolName,request.input]));return true}
    if(state.privateInitialization)return false
    if(state.permissionMode==='bypassPermissions'||readOnly||state.permissionMode==='acceptEdits'&&(context.remote?['write_file','edit_file'].includes(remoteTool??''):['edit','write'].includes(request.toolName)))return allow()
    if(state.permissionMode==='dontAsk')return false
    return (await approve(request.toolName,request.input,{signal:state.abort!.signal,toolUseID:request.toolCallId,requestId:request.toolCallId,title:'Pi: '+request.toolName}))?.behavior==='allow'?allow():false
  },onEvent:event=>{
    if(!state.running||!live.has(sessionId))return
    const send=(e:unknown)=>emit('session:agent',{sessionId,event:e})
    if(event.type==='message_start'&&event.message?.role==='assistant')message++
    const update=event.assistantMessageEvent,id=`${turnId}-${message}-${update?.contentIndex??0}`
    if(event.type==='message_update'&&update?.type==='text_delta'){if(update.delta)markRead();textSeen=true;send({kind:'text-delta',id,text:update.delta})}
    if(event.type==='message_update'&&update?.type==='text_end'){if(update.content)markRead();textSeen=true;send({kind:'text',id,text:update.content})}
    if(event.type==='message_update'&&['thinking_delta','thinking_end'].includes(update?.type)){
      if(!client.managedReasoning)failure='Pi returned reasoning despite Thinking off'
      else{const text=update.type==='thinking_delta'?update.delta:update.content;if(text){markRead();send({kind:update.type==='thinking_delta'?'reasoning-delta':'reasoning',id,text})}}
    }
    if(event.type==='message_end'&&event.message?.role==='assistant'){
      if(['error','aborted'].includes(event.message.stopReason))failure=client.redact(event.message.errorMessage||event.message.stopReason)
      if(event.message.usage)rememberMeta(sessionId,{usage:event.message.usage})
    }
    if(event.type==='tool_execution_start'){markRead();send({kind:'tool-start',id:event.toolCallId,name:event.toolName,command:JSON.stringify(event.args)})}
    if(event.type==='tool_execution_end')send({kind:'tool-end',id:event.toolCallId,name:event.toolName,output:JSON.stringify(event.result),exitCode:event.isError?1:0})
    if(event.type==='process_error'){state.abort?.abort();tunnel?.close();failure=client.redact(event.error)}
    if(event.type==='agent_settled'||event.type==='process_error')finish?.()
  }})
  try{
    const current=await client.call('get_state'),catalog=await client.call('get_available_models')
    await client.call('set_model',{provider:client.provider,modelId:state.model});await client.call('set_thinking_level',{level:'off'})
    state.sessionId=current.sessionId;patchSession(cardId,{piSessionId:current.sessionId,piSessionFile:current.sessionFile,piConfigRoot:directory,model:state.model,thinking:false,effort:undefined})
    const unsupported=(name:string)=>Promise.reject(Error('Pi adapter does not support '+name))
    state.driver={
      send(text,images,taskId){
        receiptTaskId=taskId;receiptRead=false
        if(images.length)throw Error('This Pi adapter supports text input only')
        state.running=true;state.abort=new AbortController();turnId=randomUUID();message=0;failure=undefined;textSeen=false
        const settled=new Promise<void>(resolve=>{finish=resolve});rememberMeta(sessionId,{busy:true});emit('session:turn-start',{sessionId})
        state.finished=(async()=>{
          try{await client.call('prompt',{message:text});if(taskId)emit('session:receipt',{sessionId,taskId,stage:'delivered'});await settled;if(!failure&&!textSeen&&!state.acknowledging)throw Error('Pi returned no assistant response')}catch(error){failure=client.redact(String((error as Error).message))}
          finally{approved.clear();finish=undefined;state.running=false;state.abort=undefined;cancelApprovals(sessionId);if(failure)emit('session:error',{sessionId,message:failure});rememberMeta(sessionId,{busy:false});emit('session:result',{sessionId,success:!failure,error:failure});emit('session:turn-end',{sessionId});if(live.has(sessionId))dispatchQueued(state,sessionId)}
        })()
      },
      async steer(text){await client.call('steer',{message:text})},
      async interrupt(){if(state.running){failure='Interrupted';state.abort?.abort();await client.call('abort');await state.finished}},
      async close(){state.abort?.abort();tunnel?.close();finish?.();await client.close();await state.finished},
      async whenIdle(){await state.finished},
      async setModel(model){await client.call('set_model',{provider:client.provider,modelId:model||client.model});await client.call('set_thinking_level',{level:'off'})},
      setPlan(){return unsupported('Plan mode')},async setPermission(mode){if(mode==='auto')throw Error('This adapter does not provide a permission classifier')},
      async setThinking(enabled){if(client.managedReasoning)throw Error('Reasoning is controlled by this Pi provider and cannot be toggled by the adapter');if(enabled)throw Error('Pi uses Thinking off');await client.call('set_thinking_level',{level:'off'})},
      async setEffort(effort){if(effort)throw Error('Pi uses Thinking off')},
      async setFast(enabled){if(enabled)throw Error('Pi does not support Fast mode')},background(){return unsupported('background process control')}
    } satisfies EngineDriver
    live.set(sessionId,state);rememberMeta(sessionId,{engine:'pi',cwd,model:state.model,permissionMode,thinking:false,thinkingSupported:false,thinkingManaged:client.managedReasoning,planMode:false,fastMode:false,commands:[],models:modelsFrom(catalog.models,client),piSessionId:state.sessionId!,busy:false})
    return {sessionId,cwd,engine:'pi' as const}
  }catch(error){tunnel?.close();await client.close();throw error}
}
