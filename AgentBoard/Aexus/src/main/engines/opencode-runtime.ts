import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {engineState} from './state'
import {opencodeClient,opencodeModels,opencodeDefaultModel,type OpenCodePermission} from './opencode-client'
import type {EngineStart,EngineDriver} from './contract'
import {nativeTurnFailure} from './session-support'
import {patchSession} from '../store'
import {APP_HOME} from '../../shared/protocol'
import {approvalHandler,cancelApprovals} from '../approvals'
import {engineEnvironment} from './configuration'
import {openTunnelTools} from '../tunnel'
import {DOCUMENTATION_TOOL,invokeDocumentationTool} from '../documentation-tool'
import {API_TOOL,invokeApiTool} from '../api-tool'
import {DISCUSSION_TOOL,invokeDiscussionTool} from '../discussion-tool'

/** Map Aexus effort to OpenCode's `effort` thought_level option (low/high/max/default). */
const thoughtLevel=(effort?:string|null)=>effort&&['low','high','max'].includes(effort)?effort:'default'

/** OpenCode is a Core-local ACP engine; cloud workspaces use the Core-owned Tunnel bridge. */
export async function openOpenCode(context:EngineStart){
  const {args,card,cardId,sessionId,cwd,permissionMode,host}=context
  if(context.nativeRemote)throw Error('OpenCode requires a Core-local engine; cloud workspaces use Tunnel')
  if(context.remote&&!context.remoteLaunch)throw Error('Missing cloud Tunnel; local execution is disabled')
  // Native OpenCode auth (auth.json deepseek key) is the source of truth in the
  // embedded workbench; engineEnvironment surfaces it as DEEPSEEK_API_KEY without
  // copying or printing the secret. The standalone app still falls back to its
  // own saved key, but never asks the user to paste a second copy of a native key.
  const authEnv=engineEnvironment('opencode')
  if(!authEnv.DEEPSEEK_API_KEY)throw Error('Configure native OpenCode first (opencode auth login)')
  const directory=path.join(APP_HOME,'agent-access',cardId,'opencode'),{register,isOpen,rememberMeta,emit,dispatchQueued}=host
  const state=engineState(context,{model:args.model||opencodeDefaultModel,effort:args.effort})
  let receiptTaskId:string|undefined,receiptRead=false
  const markRead=()=>{if(receiptTaskId&&!receiptRead&&state.running){receiptRead=true;emit('session:receipt',{sessionId,taskId:receiptTaskId,stage:'read'})}}
  let turnId='',textBlock=0,acceptUpdates=false,textSeen=false,reasoningSeen=false,nativeSaved=!!card?.opencodeSessionId
  // ACP session/new is only an in-memory handle. Native history starts with the first turn.
  const rememberNative=()=>{if(!nativeSaved&&state.sessionId){patchSession(cardId,{opencodeSessionId:state.sessionId});nativeSaved=true}}
  const launch=context.remoteLaunch,tunnel=launch?await openTunnelTools(launch):undefined
  const approve=approvalHandler(sessionId,()=>emit('session:changed',{sessionId}))
  // OpenCode exposes MCP tools as either `tunnel__name` or `mcp__tunnel__name`.
  const mcpName=(title?:string)=>(title??'').split(':')[0].replace(/^mcp__/,'')
  const permission=async(request:OpenCodePermission)=>{
    markRead()
    if(state.acknowledging||state.privateInitialization||[DISCUSSION_TOOL.name,DOCUMENTATION_TOOL.name,API_TOOL.name].some(name=>mcpName(request.toolCall.title)==='tunnel__'+name)){
      const allowed=!state.acknowledging&&(mcpName(request.toolCall.title)==='tunnel__'+DOCUMENTATION_TOOL.name||!state.privateInitialization&&(mcpName(request.toolCall.title)==='tunnel__'+API_TOOL.name||!!state.currentTask?.chat&&mcpName(request.toolCall.title)==='tunnel__'+DISCUSSION_TOOL.name))
      const option=request.options.find(option=>option.kind===(allowed?'allow_once':'reject_once'))
      return {outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}
    }
    const tool=request.toolCall,remoteTool=context.remote?mcpName(tool.title).match(/^tunnel__(execute|read_file|write_file|edit_file|list_files)$/)?.[1]:undefined
    const readOnly=context.remote?['read_file','list_files'].includes(remoteTool??''):['read','list','glob','grep','search','think'].includes(tool.kind??'')
    let allow=false
    // Company delegation stays in Core; native spawn/team tools never create company employees.
    const nativeAgent=/^(Agent|Task|spawn_agent|team)(:|$)/i.test(tool.title??'')||/^(task|agent|spawn_agent|team)$/i.test(tool.kind??'')
    if((!context.remote||remoteTool)&&!nativeAgent&&!(state.planMode&&!readOnly)){
      if(state.permissionMode==='bypassPermissions'||readOnly||state.permissionMode==='acceptEdits'&&(context.remote?['write_file','edit_file'].includes(remoteTool??''):tool.kind==='edit'))allow=true
      else if(state.permissionMode!=='dontAsk')allow=(await approve(tool.title??tool.kind??'OpenCode tool',tool.rawInput??{},{signal:state.abort!.signal,toolUseID:tool.toolCallId,requestId:tool.toolCallId,title:tool.title}))?.behavior==='allow'
    }
    const option=request.options.find(o=>o.kind===(allow?'allow_once':'reject_once'))
    return {outcome:option?{outcome:'selected',optionId:option.optionId}:{outcome:'cancelled'}}
  }
  let client:Awaited<ReturnType<typeof opencodeClient>>
  try{client=await opencodeClient({cwd:launch?.cwd??cwd,directory,workRoot:context.workRoot,employeeId:cardId,model:state.model,remoteLaunch:launch,mcpBridge:{tools:[...(tunnel?.tools??[]),DISCUSSION_TOOL,DOCUMENTATION_TOOL,API_TOOL],close:()=>tunnel?.close(),call:async(name,input,signal,callId)=>{
    if((name===DISCUSSION_TOOL.name||name===DOCUMENTATION_TOOL.name||name===API_TOOL.name)){const result=await (name===DISCUSSION_TOOL.name?invokeDiscussionTool:name===API_TOOL.name?invokeApiTool:invokeDocumentationTool)(state,input,String(callId??''),state.abort?AbortSignal.any([state.abort.signal,signal]):signal);return {content:[{type:'text',text:JSON.stringify(result)}]}}
    // OpenCode never sends session/request_permission for MCP tools (they run
    // auto-approved), so tunnel workspace tools are enforced here in Core, not in
    // the onPermission callback. One approval per tool call; Full, read-only and
    // acceptEdits writes pass without a prompt, Plan and dontAsk reject writes.
    const remoteTool=/^(execute|read_file|write_file|edit_file|list_files)$/.test(name)?name:undefined
    if(!remoteTool)throw Error('Unsupported tunnel tool: '+name)
    if(!tunnel)throw Error('Tunnel is unavailable')
    if(!state.running||!state.abort||state.abort.signal.aborted)throw Error('Tunnel operation is outside the active turn')
    const combined=AbortSignal.any([state.abort.signal,signal])
    const readOnly=['read_file','list_files'].includes(remoteTool)
    if(state.planMode&&!readOnly)throw Error('Plan mode is read-only; tunnel writes are disabled')
    let allow=readOnly||state.permissionMode==='bypassPermissions'||(state.permissionMode==='acceptEdits'&&['write_file','edit_file'].includes(remoteTool))
    if(!allow&&state.permissionMode!=='dontAsk')allow=(await approve(remoteTool,input,{signal:combined,toolUseID:String(callId??randomUUID()),requestId:String(callId??randomUUID()),title:'tunnel__'+remoteTool}))?.behavior==='allow'
    if(!allow)throw Error('Tunnel operation denied by execution permissions')
    return tunnel.call(name,input,combined)
  }},onPermission:permission,onUpdate:update=>{
    if(!acceptUpdates||!isOpen(sessionId))return
    if(['agent_message_chunk','agent_thought_chunk','tool_call'].includes(update.sessionUpdate)){rememberNative();if(update.sessionUpdate==='tool_call'||update.content?.text)markRead()}
    const send=(event:unknown)=>emit('session:agent',{sessionId,event})
    if(update.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){textSeen=true;send({kind:'text-delta',id:turnId+'/'+textBlock,text:update.content.text})}
    else if(update.sessionUpdate==='agent_thought_chunk'){reasoningSeen=true;if(client.managedReasoning&&update.content?.type==='text')send({kind:'reasoning-delta',id:turnId+'/'+textBlock,text:update.content.text})}
    else if(update.sessionUpdate==='tool_call'){textBlock++;send({kind:'tool-start',id:update.toolCallId,name:update.title??update.kind,command:JSON.stringify(update.rawInput??{})})}
    else if(update.sessionUpdate==='tool_call_update'&&['completed','failed'].includes(update.status))send({kind:'tool-end',id:update.toolCallId,name:update.title??'OpenCode tool',output:typeof update.rawOutput==='string'?update.rawOutput:JSON.stringify(update.rawOutput??{}),exitCode:update.status==='failed'?1:0})
  }})}catch(error){tunnel?.close();throw error}
  try{
    await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-company',version:'1'},clientCapabilities:{}})
    const session=await client.call(card?.opencodeSessionId?'session/load':'session/new',{...(card?.opencodeSessionId?{sessionId:card.opencodeSessionId}:{}),cwd:launch?.cwd??cwd,mcpServers:client.mcpServer?[{name:'tunnel',command:client.mcpServer.command,args:client.mcpServer.args,env:Object.entries(client.mcpServer.env??{}).map(([name,value])=>({name,value}))}]:[]})
    // OpenCode session/load returns {} on success; the stored ID is the source of truth for resume.
    state.sessionId=card?.opencodeSessionId??session.sessionId
    if(!state.sessionId)throw Error('OpenCode ACP session could not be created')
    patchSession(cardId,{model:state.model,effort:state.effort})
    if(state.planMode)await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'mode',value:'plan'})
    if(state.model)await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:state.model})
    if(state.effort)await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'effort',value:thoughtLevel(state.effort)})
    const unsupported=(name:string)=>Promise.reject(Error('OpenCode ACP does not support '+name))
    state.driver={
      send(text,images,taskId){
        receiptTaskId=taskId;receiptRead=false
        // OpenCode ACP accepts real image blocks; a path-only text fallback would silently
        // drop every attachment while the engine still reports images:true (integration-review N1).
        const prompt:any[]=[{type:'text',text:[launch?.instructions,text].filter(Boolean).join('\n\n')}]
        for(const image of images){
          if(!['image/png','image/jpeg','image/gif','image/webp'].includes(image.mimeType)||typeof image.data!=='string')throw Error('Invalid OpenCode image content')
          prompt.push({type:'image',data:image.data,mimeType:image.mimeType})
        }
        state.running=true;state.abort=new AbortController();turnId=randomUUID();textBlock=0;textSeen=false;reasoningSeen=false;acceptUpdates=true;rememberMeta(sessionId,{busy:true});emit('session:turn-start',{sessionId})
        state.finished=(async()=>{let error:string|undefined
          try{const result=await client.call('session/prompt',{sessionId:state.sessionId,prompt},0);const failure=nativeTurnFailure('opencode',result.stopReason);if(failure)throw failure;if(state.abort?.signal.aborted)throw Error('Interrupted');if(!textSeen&&!state.acknowledging)throw Error('OpenCode returned no assistant response')}catch(cause){error=client.redact(String((cause as Error).message));if(isOpen(sessionId))emit('session:error',{sessionId,message:error})}
          finally{acceptUpdates=false;state.running=false;state.abort=undefined;cancelApprovals(sessionId);rememberMeta(sessionId,{busy:false});emit('session:result',{sessionId,success:!error,error});emit('session:turn-end',{sessionId});if(isOpen(sessionId))dispatchQueued(state,sessionId)}
        })()
      },
      steer(){return unsupported('steering; enqueue the next task instead')},
      async interrupt(){if(state.running){state.abort?.abort();client.notify('session/cancel',{sessionId:state.sessionId});await state.finished}},
      async close(){acceptUpdates=false;state.abort?.abort();tunnel?.close();await client.close();await state.finished},
      async whenIdle(){await state.finished},
      async setModel(model){await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'model',value:model||opencodeDefaultModel})},
      async setPlan(enabled){await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'mode',value:enabled?'plan':'build'})},
      async setPermission(mode){if(mode==='auto')throw Error('This adapter does not provide a permission classifier')},
      async setThinking(){throw Error('OpenCode uses effort (thought_level) to control reasoning; use config.effort')},
      async setEffort(effort){await client.call('session/set_config_option',{sessionId:state.sessionId,configId:'effort',value:thoughtLevel(effort)})},
      async setFast(enabled){if(enabled)throw Error('OpenCode ACP does not support Fast mode')},
      background(){return unsupported('background process control')}
    } satisfies EngineDriver
    register(sessionId,state)
    rememberMeta(sessionId,{engine:'opencode',cwd,model:state.model,permissionMode,thinking:false,thinkingManaged:true,thinkingSupported:false,planMode:state.planMode,fastMode:false,effort:state.effort,commands:[],models:opencodeModels(session),opencodeSessionId:state.sessionId,busy:false})
    return {sessionId,cwd,engine:'opencode' as const}
  }catch(error){tunnel?.close();await client.close();throw error}
}
