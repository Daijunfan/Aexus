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
  const input = new AsyncQueue<SDKUserMessage>()
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

  const normalApproval=approvalHandler(sessionId, () => emit('session:changed', { sessionId }))
  const approve:typeof normalApproval=async(...args)=>{
    if(privateTurns.has(sessionId)){emit('session:error',{sessionId,message:'初始化阅读触发了额外权限请求，请检查文档可读性后重试。'});return {behavior:'deny',message:'Initialization only reads assigned documentation; interactive approvals are disabled'}}
    return normalApproval(...args)
  }
  const {query}=await loadClaudeSdk()
  const q = query({ prompt: input, options: {
    ...buildOptions({ ...args, employeeId:cardId,cwd, workRoot, permissionRoot, remote,nativeRemote,remoteLaunch,permissionMode,isPlanning:()=>state.planMode===true, resume: args.claudeSessionId }),
    canUseTool: remote&&!nativeRemote?async(tool,input,context)=>cloudToolAllowed(tool,state.planMode===true)?approve(tool,input,context):{behavior:'deny',message:'云主机员工禁止调用本机工具'}:approve,
    onElicitation:async(...args)=>{if(privateTurns.has(sessionId)){emit('session:error',{sessionId,message:'初始化不能等待用户回答，请检查引擎配置后重试。'});return {action:'decline'}};return elicitationHandler(sessionId,()=>emit('session:changed',{sessionId}))(...args)}
  } })
  state.q = q
  state.driver=createClaudeDriver(state,sessionId,host)
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
          state.running = false
          rememberMeta(sessionId, { busy: false })
          cancelApprovals(sessionId);emit('session:result',{sessionId,success:!msg.is_error&&msg.subtype==='success',error:msg.is_error||msg.subtype!=='success'?(('errors' in msg?msg.errors:[]) as string[]).join('; ')||msg.subtype:undefined});emit('session:turn-end', { sessionId });dispatchQueued(state,sessionId)
        }
      }
      if (live.has(sessionId)) emit('session:end', { sessionId })
    } catch (err) {
      if (live.has(sessionId)) emit('session:error', { sessionId, message: String(err) })
    } finally {
      state.running = false
      if (live.has(sessionId)) rememberMeta(sessionId, { busy: false })
    }
  })()

  return { sessionId, cwd:remote?.directory??cwd, engine }
}

function createClaudeDriver(s:Live,id:string,host:EngineStart['host']):EngineDriver{
  return {
    send(text,images){
      s.running=true;host.rememberMeta(id,{busy:true});host.emit('session:turn-start',{sessionId:id})
      s.input.push({type:'user',message:{role:'user',content:images.length?[...(text?[{type:'text',text}]:[]),...images.map(image=>({type:'image',source:{type:'base64',media_type:image.mimeType,data:image.data}}))]:text},parent_tool_use_id:null,session_id:s.sessionId??''} as SDKUserMessage)
    },
    async steer(text){s.input.push({type:'user',message:{role:'user',content:text},parent_tool_use_id:null,session_id:s.sessionId??''} as SDKUserMessage)},
    async interrupt(){await s.q.interrupt()},
    async close(){s.input.close();s.q.close();await s.finished},
    async whenIdle(){},
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
