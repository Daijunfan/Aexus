import {engineState} from './state'
import { openCodexDiscussion } from './codex-discussion'
import type { EngineStart,EngineDriver,EngineHost } from './contract'
import type { Live } from '../sessions'
import { sandboxFor,codexEffort } from './session-support'
import { readStore,patchSession } from '../store'
import { employeeInstructions } from '../plugins/documents'
import { codexModels,allCodexModels,runCodexTurn } from '../codex'
import { withCodexSessionApi } from '../native-sessions'
import { nativeCodexRequest,hasNativeCodexSession,nativeCodexBusy,closeNativeCodexSession } from '../codex-native'
import { nativeSessionRefs } from '../../shared/types'
import { activeModel,fastTier } from '../../shared/engine-commands'
import { nativeRequestHandler,cancelApprovals } from '../approvals'
export async function openCodex(context:EngineStart){
  const {args,card,kind,engine,cardId,sessionId,cwd,workRoot,permissionRoot,remote,nativeRemote,remoteLaunch,provider,permissionMode,host}=context
  const {register,isOpen,metadata,emit,rememberMeta,rememberTerminalCommands,isPrivateTurn,dispatchQueued}=host

    const state=engineState(context,{nativeOrigin:card?.nativeOrigin,workRoot,permissionRoot,nativeRemote,fastMode:args.fastMode??false,remoteAdmin:args.remoteAdmin??false,effort:args.effort,threadId:args.threadId})
    state.bootstrapInstructions=employeeInstructions(readStore().sessions.find(card=>card.id===cardId)!,readStore())
    state.driver=createCodexDriver(state,sessionId,host)
    register(sessionId, state)
    rememberMeta(sessionId, {
      engine,
      cwd,
      threadId: args.threadId,
      model: args.model,
      thinking: false,
      thinkingSupported: false,
      planMode:args.planMode??false,fastMode:args.fastMode??false,remoteAdmin:args.remoteAdmin??false,
      effort: args.effort,
      permissionMode,
      commands: [],
      models: nativeRemote?[]:codexModels(),
      busy: false
    })
    emit('session:meta', {
      sessionId,
      engine,
      commands: [],
      models: nativeRemote?[]:codexModels(),
      requestedModel: args.model,
      permissionMode,
      thinking: false,
      thinkingSupported: false,
      effort: args.effort
    })
    // Ask the installed CLI for current account/model capabilities without inference.
    void withCodexSessionApi(allCodexModels,nativeRemote?{nativeRemote}:{}).then(models=>{
      if(isOpen(sessionId)&&models.length)rememberMeta(sessionId,{models})
    }).catch(()=>{}) // Offline engines keep the official local cache above.
    return { sessionId, cwd:remote?.directory??cwd, engine }
}

/** Serialize user turns over the employee’s native connection. */
async function pumpCodex(s:Live,sessionId:string,host:EngineHost,discussionUrl:()=>Promise<string>){
  const {isOpen,emit,rememberMeta,isPrivateTurn,dispatchQueued,sessionInfo}=host
  if (s.running) return
  s.running = true
  try {
    while (s.queue.length) {
      const {text,images,taskId} = s.queue.shift()!
      let failure:string|undefined
      const abort = new AbortController()
      s.abort = abort
      rememberMeta(sessionId, { busy: true })
      emit('session:turn-start', { sessionId })
      try{await runCodexTurn({
        employeeId:s.cardId,prompt: text,images,connectionId:sessionId,acknowledging:s.acknowledging,initializing:s.privateInitialization,
        discussionUrl:await discussionUrl(),
        cwd: s.cwd,
        workRoot: s.workRoot,permissionRoot:s.permissionRoot,remote:s.remote,nativeRemote:s.nativeRemote,remoteAdmin:s.remoteAdmin,
        resumeId: s.threadId,planMode:s.planMode,
        model: s.model,
        sandbox: s.sandbox,
        effort: codexEffort(s.effort)??activeModel(sessionInfo(sessionId)?.models??[],s.model)?.defaultEffort,
        serviceTier:s.fastMode?fastTier(activeModel(sessionInfo(sessionId)?.models??[],s.model))?.id:undefined,
        signal: abort.signal,
        approvalPolicy:s.workRoot||s.remote&&!s.nativeRemote||['dontAsk','bypassPermissions'].includes(s.permissionMode)?'never':'on-request',
        onRequest:async(...args)=>{if(isPrivateTurn(sessionId)){emit('session:error',{sessionId,message:'初始化不能申请额外权限或等待用户回答，请检查配置后重试。'});throw Error('Interactive requests are unavailable during initialization')};return nativeRequestHandler(sessionId,()=>emit('session:changed',{sessionId}),!s.workRoot&&(!s.remote||!!s.nativeRemote)&&!s.planMode)(...args)},
        onEvent: (ev) => {
          if(ev.kind==='input-receipt'){if(taskId)emit('session:receipt',{sessionId,taskId,stage:ev.stage});return}
          if(ev.kind==='notice'&&ev.level==='error')failure=ev.text
          if(ev.kind==='notice'&&ev.level==='error'&&s.nativeRemote){emit('session:error',{sessionId,message:ev.text});return}
          if(ev.kind==='child-thread'){const card=readStore().sessions.find(c=>c.id===s.cardId);if(card)patchSession(s.cardId,{nativeSessions:[...nativeSessionRefs(card),{engine:'codex',id:ev.threadId,origin:s.nativeOrigin}]});return}
          if(ev.kind==='background-turn'){if(!isOpen(sessionId))return;s.running=ev.busy;rememberMeta(sessionId,{busy:ev.busy});emit(ev.busy?'session:turn-start':'session:turn-end',{sessionId});if(!ev.busy)dispatchQueued(s,sessionId);return}
          if(ev.kind==='usage'){rememberMeta(sessionId,{usage:ev.usage});return}
          if (ev.kind === 'thread') {
            const prior=readStore().sessions.find(card=>card.id===s.cardId)
            s.threadId = ev.threadId
            patchSession(s.cardId, prior?.nativeOwnership==='external'&&prior.threadId&&prior.threadId!==ev.threadId?{nativeSessions:nativeSessionRefs(prior),threadId:ev.threadId,nativeOwnership:undefined}:{threadId:ev.threadId})
            rememberMeta(sessionId, { threadId: ev.threadId })
            emit('session:resolved', { sessionId, threadId: ev.threadId })
            return
          }
          if (!isOpen(sessionId)) return
          emit('session:codex', { sessionId, event: ev })
        }
      })}catch(error){failure=error instanceof Error?error.message:String(error)}
      if (!isOpen(sessionId)) return
      s.abort = undefined
      rememberMeta(sessionId, { busy: false })
      emit('session:result',{sessionId,success:!failure,error:failure})
      emit('session:turn-end', { sessionId })
    }
  } finally {
    s.running = nativeCodexBusy(sessionId);rememberMeta(sessionId,{busy:s.running});if(!s.running){cancelApprovals(sessionId);dispatchQueued(s,sessionId)}
  }
}


function createCodexDriver(s:Live,id:string,host:EngineHost):EngineDriver{
  let discussion:Awaited<ReturnType<typeof openCodexDiscussion>>|undefined
  const discussionUrl=async()=>{discussion??=await openCodexDiscussion(s);return discussion.url}
  return {
    send(text,images,taskId){s.queue.push({text,images,taskId});s.finished=pumpCodex(s,id,host,discussionUrl)},
    async steer(text){await nativeCodexRequest(id,'turn/steer',{input:[{type:'text',text}]})},
    async interrupt(){
      s.queue.length=0
      if(s.abort)s.abort.abort()
      else if(s.running&&hasNativeCodexSession(id))try{await nativeCodexRequest(id,'turn/interrupt')}catch(error){
        if(!String(error).includes('no active turn to interrupt'))throw error
        s.running=false;host.rememberMeta(id,{busy:false})
      }
    },
    async close(){s.queue.length=0;s.abort?.abort();await s.finished;await closeNativeCodexSession(id);await discussion?.close()},
    async whenIdle(){await s.finished},
    async setModel(){},
    async setFast(){},
    async setEffort(){},
    async setPlan(){if(readStore().sessions.find(card=>card.id===s.cardId)?.accessMode==='isolated')await closeNativeCodexSession(id)},
    async setPermission(mode){if(readStore().sessions.find(card=>card.id===s.cardId)?.accessMode==='isolated')await closeNativeCodexSession(id);s.sandbox=sandboxFor(mode)},
    async setThinking(){throw Error('Codex 使用模型支持的思考强度；请使用 config.effort')},
    async background(processId,stop=false){
      if(!hasNativeCodexSession(id))return {data:[]}
      return nativeCodexRequest(id,stop?processId?'thread/backgroundTerminals/terminate':'thread/backgroundTerminals/clean':'thread/backgroundTerminals/list',processId?{processId}:{})
    }
  }
}
