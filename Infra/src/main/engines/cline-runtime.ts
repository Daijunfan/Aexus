import {engineState} from './state'
import { DOCUMENTATION_TOOL,invokeDocumentationTool } from '../documentation-tool'
import {API_TOOL,invokeApiTool} from '../api-tool'
import { DISCUSSION_TOOL,invokeDiscussionTool } from '../discussion-tool'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { openTunnelTools } from '../tunnel'
import { clineClient,type AcpPermission } from './cline-client'
import type { EngineStart,EngineDriver } from './contract'
import type { Live } from '../sessions'
import { sandboxFor } from './session-support'
import { patchSession } from '../store'
import { APP_HOME } from '../../shared/protocol'
import { approvalHandler,cancelApprovals } from '../approvals'
import { engineEnvironment,processProvider } from './configuration'
import { deepSeekModels } from '../claude-provider'
import type { ModelInfo } from '../../shared/types'

const modelsFrom=(result:any,provider:ReturnType<typeof processProvider>):ModelInfo[]=>(provider.managedReasoning?[{modelId:provider.model,name:provider.model}]:(result.models?.availableModels??[])).map((m:any)=>({value:m.modelId,displayName:m.name??m.modelId,description:provider.managedReasoning?'Custom gateway · Provider-managed reasoning':'DeepSeek · Thinking off',inputModalities:deepSeekModels.find(model=>model.value===m.modelId)?.inputModalities??['text'],supportsEffort:false,supportedEffortLevels:[],supportsAdaptiveThinking:false,supportsFastMode:false,isDefault:m.modelId===provider.model}))
export async function discoverCline(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-cline-discovery-'))
  const client=await clineClient({cwd:directory,directory,env:{CLINE_API_KEY:engineEnvironment('cline').CLINE_API_KEY||'discovery-only-no-inference'}})
  try{const protocol=await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}});if(protocol.protocolVersion!==1)throw Error('Unsupported Cline ACP version');const session=await client.call('session/new',{cwd:directory,mcpServers:[]});return {version:protocol.agentInfo?.version,models:modelsFrom(session,client),provider:client.provider,model:client.model,managedReasoning:client.managedReasoning}}finally{await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
export async function openCline(context:EngineStart){
  const {args,card,cardId,sessionId,cwd,permissionMode,host}=context
  if(context.nativeRemote)throw Error('Cline requires a Core-local engine; cloud workspaces use Tunnel')
  if(context.remote&&!context.remoteLaunch)throw Error('Missing cloud Tunnel; local execution is disabled')
  if(!engineEnvironment('cline').CLINE_API_KEY)throw Error('Configure the Cline API key in Coding Agent settings first')
  const directory=path.join(APP_HOME,'agent-access',cardId,'cline'),{register,isOpen,rememberMeta,emit,dispatchQueued}=host
  const state=engineState(context,{model:args.model||processProvider('cline').model})
  let receiptTaskId:string|undefined,receiptRead=false
  const markRead=()=>{if(receiptTaskId&&!receiptRead&&state.running){receiptRead=true;emit('session:receipt',{sessionId,taskId:receiptTaskId,stage:'read'})}}
  let turnId='',textBlock=0,acceptUpdates=false,textSeen=false,reasoningSeen=false,nativeSaved=!!card?.clineSessionId
  // ACP session/new is only an in-memory handle. Native history starts with the first turn.
  const rememberNative=()=>{if(!nativeSaved&&state.sessionId){patchSession(cardId,{clineSessionId:state.sessionId});nativeSaved=true}}
  const launch=context.remoteLaunch,tunnel=launch?await openTunnelTools(launch):undefined,approved=new Map<string,number>()
  const signature=(name:string,input:Record<string,unknown>)=>JSON.stringify([name,Object.entries(input).sort(([a],[b])=>a.localeCompare(b))])
  const approve=approvalHandler(sessionId,()=>emit('session:changed',{sessionId}))
  const permission=async(request:AcpPermission)=>{
    markRead()
    if(state.acknowledging||state.privateInitialization||[DISCUSSION_TOOL.name,DOCUMENTATION_TOOL.name,API_TOOL.name].some(name=>(request.toolCall.title??'').split(':')[0]==='tunnel__'+name)){const allowed=!state.acknowledging&&((request.toolCall.title??'').split(':')[0]==='tunnel__'+DOCUMENTATION_TOOL.name||!state.privateInitialization&&((request.toolCall.title??'').split(':')[0]==='tunnel__'+API_TOOL.name||!!state.currentTask?.chat&&(request.toolCall.title??'').split(':')[0]==='tunnel__'+DISCUSSION_TOOL.name)),option=request.options.find(option=>option.kind===(allowed?'allow_once':'reject_once'));return {outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}}
    const tool=request.toolCall,name=(tool.title??'').split(':')[0],remoteTool=context.remote?name.match(/^tunnel__(execute|read_file|write_file|edit_file|list_files)$/)?.[1]:undefined
    const readOnly=context.remote?['read_file','list_files'].includes(remoteTool??''):['read','search','think'].includes(tool.kind??'')
    let allow=false
    // Company delegation stays in Core; native spawn/team tools never create company employees.
    const nativeAgent=/^(Agent|Task|spawn_agent|team)(:|$)/i.test(tool.title??'')
    if((!context.remote||remoteTool)&&!nativeAgent&&!(state.planMode&&!readOnly)){
      if(state.permissionMode==='bypassPermissions'||readOnly||state.permissionMode==='acceptEdits'&&(context.remote?['write_file','edit_file'].includes(remoteTool??''):tool.kind==='edit'))allow=true
      else if(state.permissionMode!=='dontAsk')allow=(await approve(tool.title??tool.kind??'Cline tool',tool.rawInput??{},{signal:state.abort!.signal,toolUseID:tool.toolCallId,requestId:tool.toolCallId,title:tool.title}))?.behavior==='allow'
    }
    const option=request.options.find(o=>o.kind===(allow?'allow_once':'reject_once'))
    if(allow&&option&&remoteTool){const key=signature(remoteTool,tool.rawInput??{});approved.set(key,(approved.get(key)??0)+1)}
    return {outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}
  }
  let client:Awaited<ReturnType<typeof clineClient>>
  try{client=await clineClient({cwd:launch?.cwd??cwd,remoteLaunch:launch,mcpBridge:{tools:[...(tunnel?.tools??[]),DISCUSSION_TOOL,DOCUMENTATION_TOOL,API_TOOL],close:()=>tunnel?.close(),call:async(name,input,signal,callId)=>{
    if((name===DISCUSSION_TOOL.name||name===DOCUMENTATION_TOOL.name||name===API_TOOL.name)){const result=await (name===DISCUSSION_TOOL.name?invokeDiscussionTool:name===API_TOOL.name?invokeApiTool:invokeDocumentationTool)(state,input,String(callId??''),state.abort?AbortSignal.any([state.abort.signal,signal]):signal);return {content:[{type:'text',text:JSON.stringify(result)}]}}
    const key=signature(name,input),count=approved.get(key)??0
    if(!state.running||!state.abort||state.abort.signal.aborted||!count)throw Error('Tunnel operation has no matching Core approval')
    if(count===1)approved.delete(key);else approved.set(key,count-1)
    if(!tunnel)throw Error('Tunnel is unavailable');return tunnel.call(name,input,AbortSignal.any([state.abort.signal,signal]))
  }},directory,workRoot:context.workRoot,employeeId:cardId,model:state.model,onPermission:permission,onUpdate:update=>{
    if(!acceptUpdates||!isOpen(sessionId))return
    if(['agent_message_chunk','agent_thought_chunk','tool_call'].includes(update.sessionUpdate)){rememberNative();if(update.sessionUpdate==='tool_call'||update.content?.text)markRead()}
    const send=(event:unknown)=>emit('session:agent',{sessionId,event})
    if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){textSeen=true;send({kind:'text-delta',id:turnId+'/'+textBlock,text:update.content.text})}
    else if(update.sessionUpdate==='agent_thought_chunk'){reasoningSeen=true;if(client.managedReasoning&&update.content?.type==='text')send({kind:'reasoning-delta',id:turnId+'/'+textBlock,text:update.content.text})}
    else if(update.sessionUpdate==='tool_call'){textBlock++;send({kind:'tool-start',id:update.toolCallId,name:update.title??update.kind,command:JSON.stringify(update.rawInput??{})})}
    else if(update.sessionUpdate==='tool_call_update'&&['completed','failed'].includes(update.status))send({kind:'tool-end',id:update.toolCallId,name:update.title??'Cline tool',output:typeof update.rawOutput==='string'?update.rawOutput:JSON.stringify(update.rawOutput??{}),exitCode:update.status==='failed'?1:0})
  }})}catch(error){tunnel?.close();throw error}
  try{
    await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}})
    const session=await client.call(card?.clineSessionId?'session/load':'session/new',{...(card?.clineSessionId?{sessionId:card.clineSessionId}:{}),cwd:launch?.cwd??cwd,mcpServers:client.mcpServer?[{name:'tunnel',...client.mcpServer,env:Object.entries(client.mcpServer.env??{}).map(([name,value])=>({name,value}))}]:[]})
    state.sessionId=card?.clineSessionId??session.sessionId
    patchSession(cardId,{clineConfigRoot:directory,model:state.model,thinking:false,effort:undefined})
    if(state.planMode)await client.call('session/set_mode',{sessionId:state.sessionId,modeId:'plan'})
    if(state.model)await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:state.model})
    const unsupported=(name:string)=>Promise.reject(Error('Cline ACP does not support '+name))
    state.driver={
      send(text,images,taskId){
        receiptTaskId=taskId;receiptRead=false
        const attachment=client.stageImages(images)
        const prompt=[launch?.instructions,text,attachment?.marker].filter(Boolean).join('\n\n')
        state.running=true;state.abort=new AbortController();turnId=randomUUID();textBlock=0;textSeen=false;reasoningSeen=false;acceptUpdates=true;rememberMeta(sessionId,{busy:true});emit('session:turn-start',{sessionId})
        state.finished=(async()=>{let error:string|undefined
          try{const result=await client.call('session/prompt',{sessionId:state.sessionId,prompt:[{type:'text',text:prompt}]},0);if(result.stopReason!=='cancelled')attachment?.verify();if(reasoningSeen&&!client.managedReasoning)throw Error('Cline returned reasoning despite Thinking off');if(result.stopReason!=='cancelled'&&!textSeen&&!state.acknowledging)throw Error('Cline returned no assistant response');if(result.stopReason==='cancelled')throw Error('Interrupted')}catch(cause){error=client.redact(String((cause as Error).message));if(isOpen(sessionId))emit('session:error',{sessionId,message:error})}
          finally{approved.clear();acceptUpdates=false;state.running=false;state.abort=undefined;cancelApprovals(sessionId);rememberMeta(sessionId,{busy:false});emit('session:result',{sessionId,success:!error,error});emit('session:turn-end',{sessionId});if(isOpen(sessionId))dispatchQueued(state,sessionId)}
        })()
      },
      steer(){return unsupported('steering; enqueue the next task instead')},
      async interrupt(){if(state.running){state.abort?.abort();client.notify('session/cancel',{sessionId:state.sessionId});await state.finished}},
      async close(){acceptUpdates=false;state.abort?.abort();tunnel?.close();await client.close();await state.finished},
      async whenIdle(){await state.finished},
      async setModel(model){await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:model||processProvider('cline').model})},
      async setPlan(enabled){await client.call('session/set_mode',{sessionId:state.sessionId,modeId:enabled?'plan':'act'})},
      async setPermission(mode){if(mode==='auto')throw Error('This adapter does not provide a permission classifier')},
      async setThinking(enabled){if(client.managedReasoning)throw Error('Reasoning is controlled by this Cline provider and cannot be toggled by the adapter');if(enabled)throw Error('Cline ACP runs with Thinking off')},
      async setEffort(effort){if(effort)throw Error('Cline ACP runs with Thinking off')},
      async setFast(enabled){if(enabled)throw Error('Cline ACP does not support Fast mode')},
      background(){return unsupported('background process control')}
    } satisfies EngineDriver
    register(sessionId,state)
    rememberMeta(sessionId,{engine:'cline',cwd,model:state.model,permissionMode,thinking:false,thinkingManaged:client.managedReasoning,thinkingSupported:false,planMode:state.planMode,fastMode:false,commands:[],models:modelsFrom(session,client),clineSessionId:state.sessionId!,busy:false})
    return {sessionId,cwd,engine:'cline' as const}
  }catch(error){tunnel?.close();await client.close();throw error}
}
