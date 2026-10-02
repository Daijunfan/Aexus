import {z} from 'zod'
import {DOCUMENTATION_TOOL,invokeDocumentationTool} from '../documentation-tool'
import {DISCUSSION_TOOL,invokeDiscussionTool} from '../discussion-tool'
import {randomUUID} from 'node:crypto'
import type {SDKMessage,SDKUserMessage} from '@anthropic-ai/claude-agent-sdk'
import {loadClaudeSdk} from './claude-sdk'
import type {EngineStart,EngineDriver} from './contract'
import {type Live,AsyncQueue,sandboxFor} from '../sessions'
import {buildOptions} from './claude-options'
import {readStore,patchSession} from '../store'
import {isInitializer} from '../initialization-state'
import {employeeInstructions} from '../plugins/documents'
import {deepSeekModels} from '../claude-provider'
import {cloudToolAllowed} from '../scope'
import {approvalHandler,elicitationHandler,cancelApprovals} from '../approvals'
import {nativeSessionRefs} from '../../shared/types'
export async function openClaude(context:EngineStart){
  const {args,card,kind,engine,cardId,sessionId,cwd,workRoot,permissionRoot,remote,nativeRemote,remoteLaunch,provider,permissionMode,host}=context
  const {live,info,emit,rememberMeta,rememberTerminalCommands,privateTurns,dispatchQueued}=host
  const input = new AsyncQueue<SDKUserMessage>(),inputTasks=new Map<string,string>(),idleWaiters=new Set<()=>void>()
  const state: Live = {
    cardId,privateInitialization:isInitializer(cardId),
    kind,nativeOrigin:card?.nativeOrigin,
    engine,
    provider,
    driver: null as never,
    q: null as never,
    input,
    sessionId: null,
    cwd,
    workRoot,permissionRoot,remote,nativeRemote,remoteLaunch,
    model: args.model,
    thinkingEnabled: args.thinking !== false,
    planMode:args.planMode??false,fastMode:args.fastMode??false,remoteAdmin:args.remoteAdmin??false,
    effort: args.effort,
    sandbox: sandboxFor(permissionMode),
    permissionMode,
    running: false,
    queue: []
  }

  const discussionName='mcp__agents_company__'+DISCUSSION_TOOL.name,documentationName='mcp__agents_company__'+DOCUMENTATION_TOOL.name
  const coreToolAllowed=(name:string)=>state.acknowledging?name===discussionName:name===documentationName
  const normalApproval=approvalHandler(sessionId, () => emit('session:changed', { sessionId }))
  const approve:typeof normalApproval=async(...args)=>{
    if(args[0]===discussionName||args[0]===documentationName)return coreToolAllowed(args[0])?{behavior:'allow',updatedInput:args[1]}:{behavior:'deny',message:state.acknowledging?'Only the bound discussion tool is available during shared reading':state.privateInitialization?'Only the documentation tool is available during initialization':'The discussion tool is available only during its reading stage'}
    if(privateTurns.has(sessionId)||state.privateInitialization){emit('session:error',{sessionId,message:'初始化阅读触发了额外权限请求，请检查文档可读性后重试。'});return {behavior:'deny',message:'Initialization only reads assigned documentation; interactive approvals are disabled'}}
    return normalApproval(...args)
  }
  const {query,createSdkMcpServer,tool}=await loadClaudeSdk()
  const invoke=(handler:typeof invokeDocumentationTool)=>async(input:unknown,extra:unknown)=>{
    try{const context=extra as {requestId?:string|number;signal?:AbortSignal};if(context.requestId===undefined)throw Error('Missing SDK tool call ID');const result=await handler(state,input,String(context.requestId),context.signal);return {content:[{type:'text' as const,text:JSON.stringify(result)}]}}
    catch(error){return {isError:true,content:[{type:'text' as const,text:(error as Error).message}]}}
  }
  const discussion=createSdkMcpServer({name:'agents_company',tools:[
    tool(DISCUSSION_TOOL.name,DISCUSSION_TOOL.description,{conversationType:z.enum(['group','channel']),conversationId:z.string(),messageId:z.string(),text:z.string().nullable()},invoke(invokeDiscussionTool)),
    tool(DOCUMENTATION_TOOL.name,DOCUMENTATION_TOOL.description,{operation:z.enum(['identity','index','document','describe']),document:z.string().optional(),command:z.string().optional()},invoke(invokeDocumentationTool))
  ]})
  const options=buildOptions({ ...args, employeeId:cardId,cwd, workRoot, permissionRoot, remote,nativeRemote,remoteLaunch,permissionMode,isPlanning:()=>state.planMode===true,isAcknowledging:()=>!!state.acknowledging,isInitializing:()=>!!state.privateInitialization, resume: args.claudeSessionId })
  const q = query({ prompt: input, options: {
    ...options,mcpServers:{...options.mcpServers,agents_company:discussion},hooks:remoteLaunch?options.hooks:{...options.hooks,PreToolUse:[{hooks:[async(input:any)=>[discussionName,documentationName].includes(input.tool_name)||state.acknowledging||state.privateInitialization?{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:coreToolAllowed(input.tool_name)?'allow':'deny',permissionDecisionReason:state.acknowledging?'Only the bound discussion tool is available during shared reading':state.privateInitialization?'Only the documentation tool is available during initialization':'Documentation discovery is read-only; the discussion tool requires an active reading stage'}}:{}]}]},
    canUseTool: remote&&!nativeRemote?async(tool,input,context)=>([discussionName,documentationName].includes(tool)||cloudToolAllowed(tool,state.planMode===true))?approve(tool,input,context):{behavior:'deny',message:'云主机员工禁止调用本机工具'}:approve,
    onElicitation:async(...args)=>{if(privateTurns.has(sessionId)){emit('session:error',{sessionId,message:'初始化不能等待用户回答，请检查引擎配置后重试。'});return {action:'decline'}};return elicitationHandler(sessionId,()=>emit('session:changed',{sessionId}))(...args)}
  } })
  state.q = q
  state.driver=createClaudeDriver(state,sessionId,host,inputTasks,idleWaiters)
  state.bootstrapInstructions=employeeInstructions(readStore().sessions.find(card=>card.id===cardId)!,readStore())
  live.set(sessionId, state)
  rememberMeta(sessionId, { engine, cwd, model: args.model, permissionMode,
    thinking: state.thinkingEnabled, thinkingSupported: true, planMode:state.planMode,fastMode:state.fastMode, effort: args.effort,
    claudeSessionId: args.claudeSessionId, busy: false })

  void (async () => {
    try {
      const [commands, nativeModels] = await Promise.all([q.supportedCommands(), q.supportedModels()])
      const models=provider?deepSeekModels:nativeModels
      if(!live.has(sessionId))return
      rememberMeta(sessionId, {
        engine,
        cwd,
        model: state.model,
        thinking: state.thinkingEnabled,
        thinkingSupported: true,
        planMode:state.planMode,fastMode:state.fastMode,
        effort: state.effort,
        permissionMode,
        commands,
        models,
        busy: state.running
      })
      emit('session:meta', {
        sessionId,
        engine,
        commands,
        models,
        requestedModel: state.model,
        permissionMode,
        thinking: state.thinkingEnabled,
        thinkingSupported: true,
        effort: state.effort
      })
    } catch (err) {
      if(live.has(sessionId))emit('session:error', { sessionId, message: String(err) })
    }
  })()

  state.finished = (async () => {
    try {
      for await (const msg of q) {
        if (!state.sessionId && 'session_id' in msg && msg.session_id) {
          state.sessionId = msg.session_id
          patchSession(cardId, { claudeSessionId: msg.session_id })
          rememberMeta(sessionId, { claudeSessionId: msg.session_id })
          emit('session:resolved', { sessionId, claudeSessionId: msg.session_id })
        }
        if (!live.has(sessionId)) continue
        if(!('parent_tool_use_id' in msg&&msg.parent_tool_use_id)){
          const echoed=msg as {user_message_uuid?:string;user_message_uuids?:string[]},ids=echoed.user_message_uuids??(echoed.user_message_uuid?[echoed.user_message_uuid]:[])
          if(msg.type==='user'&&'isReplay' in msg&&msg.isReplay&&msg.uuid){const taskId=inputTasks.get(msg.uuid);if(taskId)emit('session:receipt',{sessionId,taskId,stage:'delivered'})}
          for(const uuid of ids){const taskId=inputTasks.get(uuid);if(!taskId)continue
            emit('session:receipt',{sessionId,taskId,stage:'delivered'})
            if(msg.type==='stream_event'||msg.type==='assistant'&&!msg.error||msg.type==='result'&&!msg.is_error&&msg.subtype==='success'){emit('session:receipt',{sessionId,taskId,stage:'read'});inputTasks.delete(uuid)}
          }
        }
        emit('session:message', { sessionId, message: msg as SDKMessage })
        if (msg.type === 'system' && msg.subtype === 'init') {
          rememberTerminalCommands(sessionId, (msg as any).terminal_slash_commands ?? [])
          rememberMeta(sessionId, { model: provider?state.model:msg.model,commands:[...new Map([...(msg.slash_commands??[]).map(name=>({name,description:'Claude Code 命令',argumentHint:''})),...(info.get(sessionId)?.commands??[])].map(c=>[c.name,c])).values()] })
        }
        if(msg.type==='conversation_reset'){
          const saved=readStore().sessions.find(c=>c.id===cardId)!
          state.sessionId=msg.new_conversation_id
          patchSession(cardId,{nativeSessions:nativeSessionRefs(saved),claudeSessionId:state.sessionId,nativeOwnership:undefined})
          rememberMeta(sessionId,{claudeSessionId:state.sessionId})
          emit('session:resolved',{sessionId,claudeSessionId:state.sessionId})
        }
        if(msg.type==='system'&&msg.subtype==='commands_changed')rememberMeta(sessionId,{commands:msg.commands})
        if(msg.type==='system'&&['task_started','task_progress','task_notification'].includes(msg.subtype)){const task=msg as any;state.nativeTasks??={};if(task.subtype==='task_notification')delete state.nativeTasks[task.task_id];else state.nativeTasks[task.task_id]={processId:task.task_id,command:task.description??task.task_id,cwd:state.cwd,status:'running'};emit('session:changed',{sessionId})}
        if(msg.type==='result')rememberMeta(sessionId,{usage:{...msg.usage,total_cost_usd:msg.total_cost_usd}})
        if('fast_mode_state' in msg)rememberMeta(sessionId,{fastModeState:String(msg.fast_mode_state),fastModeDisabledReason:(msg as any).fast_mode_disabled_reason})
        if (msg.type === 'result') {
          inputTasks.clear();state.running = false;for(const finish of idleWaiters)finish();idleWaiters.clear()
          rememberMeta(sessionId, { busy: false })
          cancelApprovals(sessionId);emit('session:result',{sessionId,success:!msg.is_error&&msg.subtype==='success',error:msg.is_error||msg.subtype!=='success'?(('errors' in msg?msg.errors:[]) as string[]).join('; ')||msg.subtype:undefined});emit('session:turn-end', { sessionId });dispatchQueued(state,sessionId)
        }
      }
      if (live.has(sessionId)) emit('session:end', { sessionId })
    } catch (err) {
      if (live.has(sessionId)) emit('session:error', { sessionId, message: String(err) })
    } finally {
      inputTasks.clear();state.running = false;for(const finish of idleWaiters)finish();idleWaiters.clear()
      if (live.has(sessionId)) rememberMeta(sessionId, { busy: false })
    }
  })()

  return { sessionId, cwd:remote?.directory??cwd, engine }
}

function createClaudeDriver(s:Live,id:string,host:EngineStart['host'],inputTasks:Map<string,string>,idleWaiters:Set<()=>void>):EngineDriver{
  return {
    send(text,images,taskId){
      const uuid=taskId?randomUUID():undefined;if(uuid&&taskId)inputTasks.set(uuid,taskId)
      s.running=true;host.rememberMeta(id,{busy:true});host.emit('session:turn-start',{sessionId:id})
      s.input.push({type:'user',...(uuid?{uuid}:{}),message:{role:'user',content:images.length?[...(text?[{type:'text',text}]:[]),...images.map(image=>({type:'image',source:{type:'base64',media_type:image.mimeType,data:image.data}}))]:text},parent_tool_use_id:null,session_id:s.sessionId??''} as SDKUserMessage)
    },
    async steer(text){s.input.push({type:'user',message:{role:'user',content:text},parent_tool_use_id:null,session_id:s.sessionId??''} as SDKUserMessage)},
    async interrupt(){await s.q.interrupt()},
    async close(){s.input.close();s.q.close();await s.finished},
    async whenIdle(){if(s.running)await new Promise<void>(resolve=>idleWaiters.add(resolve))},
    async setModel(model){await s.q.setModel(model)},
    async setPlan(enabled){await s.q.setPermissionMode(enabled?'plan':s.permissionMode)},
    async setPermission(mode){await s.q.setPermissionMode(s.remoteLaunch?'acceptEdits':mode)},
    async setThinking(enabled){await s.q.setMaxThinkingTokens(enabled?null:0,enabled?'summarized':null)},
    async setEffort(effort){await s.q.applyFlagSettings({effortLevel:effort??(s.provider?'high':null)} as Parameters<typeof s.q.applyFlagSettings>[0])},
    async setFast(enabled){await s.q.applyFlagSettings({fastMode:enabled})},
    async background(processId,stop=false){
      if(stop)for(const task of processId?[processId]:Object.keys(s.nativeTasks??{})){if(!s.nativeTasks?.[task])throw Error('任务不属于当前员工');await s.q.stopTask(task);delete s.nativeTasks[task]}
      return {data:Object.values(s.nativeTasks??{})}
    }
  }
}
