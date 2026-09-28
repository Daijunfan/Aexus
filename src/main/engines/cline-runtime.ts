import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {openTunnelTools} from '../tunnel'
import {clineClient,type AcpPermission} from './cline-client'
import type {EngineStart,EngineDriver} from './contract'
import {type Live,sandboxFor} from '../sessions'
import {readStore,patchSession} from '../store'
import {APP_HOME} from '../../shared/protocol'
import {isInitializer} from '../initialization-state'
import {approvalHandler,cancelApprovals} from '../approvals'
import {engineEnvironment} from './configuration'
import {deepSeekModels} from '../claude-provider'
import type {ModelInfo} from '../../shared/types'

const modelsFrom=(result:any):ModelInfo[]=>(result.models?.availableModels??[]).map((m:any)=>({value:m.modelId,displayName:m.name??m.modelId,description:'DeepSeek · Thinking off',inputModalities:deepSeekModels.find(model=>model.value===m.modelId)?.inputModalities??['text'],supportsEffort:false,supportedEffortLevels:[],supportsAdaptiveThinking:false,supportsFastMode:false,isDefault:m.modelId==='deepseek-flash'}))
export async function discoverCline(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'agents-cline-discovery-'))
  const client=await clineClient({cwd:directory,directory,env:{CLINE_API_KEY:engineEnvironment('cline').CLINE_API_KEY||'discovery-only-no-inference'}})
  try{const protocol=await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}});if(protocol.protocolVersion!==1)throw Error('Unsupported Cline ACP version');const session=await client.call('session/new',{cwd:directory,mcpServers:[]});return {version:protocol.agentInfo?.version,models:modelsFrom(session)}}finally{await client.close();fs.rmSync(directory,{recursive:true,force:true})}
}
export async function openCline(context:EngineStart){
  const {args,card,cardId,sessionId,cwd,permissionMode,host}=context
  if(context.nativeRemote||context.workRoot)throw Error('Cline supports Core-local Build and Tunnel cloud workspaces only')
  if(context.remote&&!context.remoteLaunch)throw Error('Missing cloud Tunnel; local execution is disabled')
  if(!engineEnvironment('cline').CLINE_API_KEY)throw Error('Configure the Cline DeepSeek API key in Coding Agent settings first')
  const directory=path.join(APP_HOME,'agent-access',cardId,'cline'),{live,rememberMeta,emit,dispatchQueued}=host
  const state:Live={cardId,privateInitialization:isInitializer(cardId),kind:context.kind,engine:'cline',driver:null as never,q:null as never,input:null as never,sessionId:null,cwd,remote:context.remote,remoteLaunch:context.remoteLaunch,model:args.model||'deepseek-flash',thinkingEnabled:false,planMode:args.planMode??false,fastMode:false,sandbox:sandboxFor(permissionMode),permissionMode,running:false,queue:[]}
  let turnId='',textBlock=0,acceptUpdates=false,textSeen=false,reasoningSeen=false,nativeSaved=!!card?.clineSessionId
  // ACP session/new is only an in-memory handle. Native history starts with the first turn.
  const rememberNative=()=>{if(!nativeSaved&&state.sessionId){patchSession(cardId,{clineSessionId:state.sessionId});nativeSaved=true}}
  const launch=context.remoteLaunch,tunnel=launch?await openTunnelTools(launch):undefined,approved=new Map<string,number>()
  const signature=(name:string,input:Record<string,unknown>)=>JSON.stringify([name,Object.entries(input).sort(([a],[b])=>a.localeCompare(b))])
  const approve=approvalHandler(sessionId,()=>emit('session:changed',{sessionId}))
  const permission=async(request:AcpPermission)=>{
    const tool=request.toolCall,name=(tool.title??'').split(':')[0],remoteTool=context.remote?name.match(/^tunnel__(execute|read_file|write_file|edit_file|list_files)$/)?.[1]:undefined
    const readOnly=context.remote?['read_file','list_files'].includes(remoteTool??''):['read','search','think'].includes(tool.kind??'')
    let allow=false
    // Company delegation stays in Core; native spawn/team tools never create company employees.
    const nativeAgent=/^(Agent|Task|spawn_agent|team)(:|$)/i.test(tool.title??'')
    if((!context.remote||remoteTool)&&!nativeAgent&&!(state.planMode&&!readOnly)){
      if(state.privateInitialization)allow=readOnly
      else if(state.permissionMode==='bypassPermissions'||readOnly||state.permissionMode==='acceptEdits'&&(context.remote?['write_file','edit_file'].includes(remoteTool??''):tool.kind==='edit'))allow=true
      else if(state.permissionMode!=='dontAsk')allow=(await approve(tool.title??tool.kind??'Cline tool',tool.rawInput??{},{signal:state.abort!.signal,toolUseID:tool.toolCallId,requestId:tool.toolCallId,title:tool.title}))?.behavior==='allow'
    }
    const option=request.options.find(o=>o.kind===(allow?'allow_once':'reject_once'))
    if(allow&&option&&remoteTool){const key=signature(remoteTool,tool.rawInput??{});approved.set(key,(approved.get(key)??0)+1)}
    return {outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}
  }
  let client:Awaited<ReturnType<typeof clineClient>>
  try{client=await clineClient({cwd:launch?.cwd??cwd,remoteLaunch:launch,mcpBridge:tunnel?{tools:tunnel.tools,close:tunnel.close,call:async(name,input,signal)=>{
    const key=signature(name,input),count=approved.get(key)??0
    if(!state.running||!state.abort||state.abort.signal.aborted||!count)throw Error('Tunnel operation has no matching Core approval')
    if(count===1)approved.delete(key);else approved.set(key,count-1)
    return tunnel.call(name,input,AbortSignal.any([state.abort.signal,signal]))
  }}:undefined,directory,employeeId:cardId,model:state.model,onPermission:permission,onUpdate:update=>{
    if(!acceptUpdates||!live.has(sessionId))return
    if(['agent_message_chunk','agent_thought_chunk','tool_call'].includes(update.sessionUpdate))rememberNative()
    const send=(event:unknown)=>emit('session:agent',{sessionId,event})
    if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){textSeen=true;send({kind:'text-delta',id:turnId+'/'+textBlock,text:update.content.text})}
    else if(update.sessionUpdate==='agent_thought_chunk')reasoningSeen=true
    else if(update.sessionUpdate==='tool_call'){textBlock++;send({kind:'tool-start',id:update.toolCallId,name:update.title??update.kind,command:JSON.stringify(update.rawInput??{})})}
    else if(update.sessionUpdate==='tool_call_update'&&['completed','failed'].includes(update.status))send({kind:'tool-end',id:update.toolCallId,name:update.title??'Cline tool',output:typeof update.rawOutput==='string'?update.rawOutput:JSON.stringify(update.rawOutput??{}),exitCode:update.status==='failed'?1:0})
  }})}catch(error){tunnel?.close();throw error}
  try{
    await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}})
    const session=await client.call(card?.clineSessionId?'session/load':'session/new',{...(card?.clineSessionId?{sessionId:card.clineSessionId}:{}),cwd:launch?.cwd??cwd,mcpServers:client.mcpServer?[{name:'tunnel',...client.mcpServer,env:[]}]:[]})
    state.sessionId=card?.clineSessionId??session.sessionId
    patchSession(cardId,{clineConfigRoot:directory,model:state.model,thinking:false,effort:undefined})
    if(state.planMode)await client.call('session/set_mode',{sessionId:state.sessionId,modeId:'plan'})
    if(state.model)await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:state.model})
    const unsupported=(name:string)=>Promise.reject(Error('Cline ACP does not support '+name))
    state.driver={
      send(text,images){
        const attachment=client.stageImages(images)
        const prompt=[launch?.instructions,text,attachment?.marker].filter(Boolean).join('\n\n')
        state.running=true;state.abort=new AbortController();turnId=randomUUID();textBlock=0;textSeen=false;reasoningSeen=false;acceptUpdates=true;rememberMeta(sessionId,{busy:true});emit('session:turn-start',{sessionId})
        state.finished=(async()=>{let error:string|undefined
          try{const result=await client.call('session/prompt',{sessionId:state.sessionId,prompt:[{type:'text',text:prompt}]},0);if(result.stopReason!=='cancelled')attachment?.verify();if(reasoningSeen)throw Error('Cline returned reasoning despite Thinking off');if(result.stopReason!=='cancelled'&&!textSeen)throw Error('Cline returned no assistant response');if(result.stopReason==='cancelled')throw Error('Interrupted')}catch(cause){error=client.redact(String((cause as Error).message));if(live.has(sessionId))emit('session:error',{sessionId,message:error})}
          finally{approved.clear();acceptUpdates=false;state.running=false;state.abort=undefined;cancelApprovals(sessionId);rememberMeta(sessionId,{busy:false});emit('session:result',{sessionId,success:!error,error});emit('session:turn-end',{sessionId});if(live.has(sessionId))dispatchQueued(state,sessionId)}
        })()
      },
      steer(){return unsupported('steering; enqueue the next task instead')},
      async interrupt(){if(state.running){state.abort?.abort();client.notify('session/cancel',{sessionId:state.sessionId});await state.finished}},
      async close(){acceptUpdates=false;state.abort?.abort();tunnel?.close();await client.close();await state.finished},
      async whenIdle(){await state.finished},
      async setModel(model){await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:model||'deepseek-flash'})},
      async setPlan(enabled){await client.call('session/set_mode',{sessionId:state.sessionId,modeId:enabled?'plan':'act'})},
      async setPermission(mode){if(mode==='auto')throw Error('This adapter does not provide a permission classifier')},
      async setThinking(enabled){if(enabled)throw Error('Cline ACP runs with Thinking off')},
      async setEffort(effort){if(effort)throw Error('Cline ACP runs with Thinking off')},
      async setFast(enabled){if(enabled)throw Error('Cline ACP does not support Fast mode')},
      background(){return unsupported('background process control')}
    } satisfies EngineDriver
    live.set(sessionId,state)
    rememberMeta(sessionId,{engine:'cline',cwd,model:state.model,permissionMode,thinking:false,thinkingSupported:false,planMode:state.planMode,fastMode:false,commands:[],models:modelsFrom(session),clineSessionId:state.sessionId!,busy:false})
    return {sessionId,cwd,engine:'cline' as const}
  }catch(error){tunnel?.close();await client.close();throw error}
}
