import {activityPreview} from '../shared/activity'
import {dirname} from 'node:path'
import {closeNativeCodexSession,nativeCodexBusy,nativeCodexRequest,hasNativeCodexSession} from './codex-native'
import {workspaceFiles} from './files'
import {remoteTarget,type RemoteTarget} from '../shared/remote'
import {checkRemote,prepareRemote,resolveEmployeeWorkspace,remoteFiles,type RemoteLaunch} from './tunnel'
// The session registry and every operation that can be performed on a live
// session. Both frontends drive this: the Electron main process (IPC) and the
// local socket server (CLI). Emitting is injected so neither frontend is baked in.

import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  Options,
  PermissionMode,
  Query,
  SDKMessage,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import {activeModel,modelEfforts,fastTier,supportsFast,mergeCommands,engineCommands} from '../shared/engine-commands'
import type {EffortLevel,ModelInfo,SlashCommand,ImageInput} from '../shared/types'
import {withCodexSessionApi} from './native-sessions'
import { codexModels, allCodexModels, runCodexTurn, type SandboxMode } from './codex'
import {deepSeekProvider,deepSeekModels,deepSeekModel,deepSeekEffort,deepSeekPicker,type DeepSeekProvider} from './claude-provider'
import { childEnv, managerCliRoot, resolveBinary } from './exec'
import { prepareWorkspacePlugins } from './plugins/runtime'
import { patchSession, readStore } from './store'
import { conversation, forget, restoreTranscript, saveTranscript } from './transcripts'
import { approvalHandler,nativeRequestHandler,elicitationHandler, approvalsFor, cancelApprovals } from './approvals'
import {teamSettings,nativeSessionRefs,type Session} from '../shared/types'
import {CLOUD_TOOLS,cloudToolAllowed,cloudClaudeSettings,workClaudeOptions} from './scope'
import { employeeWorkspace, executionEmployee, chooseEmployeeWorkspace, workspaceName } from './workspaces'
import { provisionEmployee } from './plugins/documents'

const removingEmployees=new Set<string>(),removingTeams=new Set<string>()
export function assertTeamAvailable(name?:string){if(name&&removingTeams.has(name))throw new Error('Team 正在删除中，暂时不能创建或调整员工')}
export function beginTeamRemoval(name:string){assertTeamAvailable(name);removingTeams.add(name)}
export function endTeamRemoval(name:string){removingTeams.delete(name)}
export function beginEmployeeRemoval(id:string){if(removingEmployees.has(id))throw new Error('员工正在移除中');removingEmployees.add(id)}
export function endEmployeeRemoval(id:string){removingEmployees.delete(id)}
export function assertNotRemoving(id?:string){if(id&&removingEmployees.has(id))throw new Error('员工正在移除中，无法打开会话')}

const CLAUDE_BIN = resolveBinary('claude', process.env.CLAUDE_BIN)

export type Engine = 'claude' | 'codex'

export type Live = {
  cardId: string
  engine: Engine
  q: Query
  input: AsyncQueue<SDKUserMessage>
  sessionId: string | null
  /** Codex thread id, used to resume; Claude does not need it. */
  threadId?: string
  cwd: string
  workRoot?: string
  permissionRoot?: string
  remote?:RemoteTarget|null
  remoteLaunch?:RemoteLaunch
  provider?:DeepSeekProvider
  model?: string
  thinkingEnabled: boolean
  planMode?: boolean
  fastMode?: boolean
  effort?: EffortLevel
  sandbox: SandboxMode
  /** Environment applied when the session started, reused for stored cards. */
  permissionMode: PermissionMode
  /** Codex runs one child process per turn, so turns are queued rather than pushed. */
  running: boolean
  nativeTasks?:Record<string,{processId:string;command:string;cwd:string;status:string}>
  pendingMessages?: {id:string;text:string;images?:string[]}[]
  queue: {text:string;images?:ImageInput[]}[]
  abort?: AbortController
  finished?: Promise<void>
}

export class AsyncQueue<T> {
  private items: T[] = []
  private waiter: ((v: IteratorResult<T>) => void) | null = null
  private closed = false

  push(item: T) {
    if (this.closed) return
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: item, done: false })
    } else {
      this.items.push(item)
    }
  }

  close() {
    this.closed = true
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w({ value: undefined as never, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false })
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true })
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiter = resolve
        })
      }
    }
  }
}

/** Broadcast an event to whoever is listening (GUI windows, CLI clients). */
export type Emitter = (channel: string, payload: unknown) => void

let broadcast: Emitter = () => {}
const observers = new Set<Emitter>()
const emit: Emitter = (channel, payload) => {
  broadcast(channel, payload)
  for (const listener of observers) listener(channel, payload)
}
export function onSessionEvent(listener: Emitter) { observers.add(listener); return () => { observers.delete(listener) } }
const taskOwners = new Map<string, string>()
export function assertEmployeeControl(cardId: string, owner?: string) {
  if (taskOwners.has(cardId) && taskOwners.get(cardId) !== owner) throw new Error('Employee is reserved by a scheduled task; cancel that run first')
}
export function reserveEmployee(cardId: string, owner: string) {
  assertNotRemoving(cardId)
  assertEmployeeControl(cardId)
  const card = readStore().sessions.find(c => c.id === cardId)
  if (!card) throw new Error('Unknown employee')
  assertTeamAvailable(card.group)
  if ([...live].some(([id,s]) => s.cardId === cardId && (s.running||s.pendingMessages?.length||approvalsFor(id).length))) throw new Error('Employee is busy')
  taskOwners.set(cardId, owner)
  return () => { if (taskOwners.get(cardId) === owner) taskOwners.delete(cardId) }
}
export function setEmitter(fn: Emitter): void {
  broadcast = fn
}

const live = new Map<string, Live>()

export function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function getLive(id: string): Live | undefined {
  return live.get(id)
}

export function listLive(): { id: string; engine: Engine; cwd: string }[] {
  return [...live.entries()].map(([id, s]) => ({ id, engine: s.engine, cwd: s.cwd }))
}

/** Codex expresses permissions as a sandbox policy rather than a prompt mode. */
export function sandboxFor(mode: PermissionMode): SandboxMode {
  if (mode === 'bypassPermissions') return 'danger-full-access'
  if (mode === 'acceptEdits' || mode === 'auto') return 'workspace-write'
  return 'read-only'
}

/** Preserve the effort advertised by the native model catalog. */
export function codexEffort(effort?: EffortLevel): string | undefined {
  return effort
}

export function buildOptions(args: {
  cwd: string
  workRoot?: string
  permissionRoot?: string
  remote?:RemoteTarget|null
  remoteLaunch?:RemoteLaunch
  model?: string
  resume?: string
  permissionMode?: PermissionMode
  thinking?: boolean
  planMode?: boolean
  isPlanning?:()=>boolean
  fastMode?: boolean
  effort?: EffortLevel
}): Options {
  const env=childEnv(args.cwd,args.workRoot)
  const opts: Options = {
    cwd: args.cwd,
    // Packaged apps get a minimal PATH, so point the SDK at the real CLI
    // explicitly rather than letting it resolve (and fail) on its own.
    pathToClaudeCodeExecutable: CLAUDE_BIN,
    env,
    permissionMode: args.planMode?'plan':args.permissionMode ?? 'default',
    includePartialMessages: true,
    thinking:
      args.thinking === false ? { type: 'disabled' } : { type: 'adaptive', display: 'summarized' },
    model: args.model,
    effort: args.effort as Options['effort'],
    resume: args.resume,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settingSources: ['user', 'project', 'local'],
    stderr: (data) => console.error('[claude]', data)
  }
  // The permission mode is switchable mid-session from the toolbar, so the
  // capability must be present from the start — otherwise selecting "Bypass"
  // on an already-running session would be refused by the engine.
  opts.allowDangerouslySkipPermissions = !args.workRoot
  if(args.workRoot)Object.assign(opts,workClaudeOptions(args.cwd,args.permissionRoot??args.workRoot))
  if(managerCliRoot(args.cwd,args.workRoot)&&!args.remoteLaunch)opts.allowedTools=['Bash(agents *)']
  if(args.remoteLaunch){
    const launch=args.remoteLaunch,cloudSettings=cloudClaudeSettings()
    Object.assign(opts,{cwd:launch.cwd,tools:[],mcpServers:{tunnel:launch.server},strictMcpConfig:true,allowedTools:CLOUD_TOOLS,settingSources:[],env:{...cloudSettings.env,...env},settings:{permissions:cloudSettings.permissions},
      disallowedTools:['Bash','PowerShell','Read','Write','Edit','Glob','Grep','NotebookEdit','Agent','Task','Skill','WebFetch','WebSearch','EnterWorktree','ExitWorktree'],
      systemPrompt:{type:'preset',preset:'claude_code',append:launch.instructions},allowDangerouslySkipPermissions:false,
      hooks:{PreToolUse:[{hooks:[async(input:any)=>{
        const planning=args.isPlanning?.()??args.planMode
        const allowed=cloudToolAllowed(input.tool_name,planning)
        return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:allowed?'allow':'deny',permissionDecisionReason:planning?'计划模式只允许读取文件；请切换到执行模式后修改。':'云主机模式仅允许 Tunnel 远端工具'}}
      }]}]}})
  }
  opts.settings={...(typeof opts.settings==='object'?opts.settings:{}),fastMode:args.fastMode??false}
  const provider=deepSeekProvider(args.remote?undefined:args.cwd)
  if(provider){
    // The installed system CLI may predate custom model capabilities. Use the SDK's paired runtime.
    opts.pathToClaudeCodeExecutable=__filename.includes('.asar/')
      ?require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/${process.platform==='win32'?'claude.exe':'claude'}`).replace('.asar/','.asar.unpacked/')
      :undefined
    opts.model=deepSeekModel(provider,args.model)
    opts.effort=(deepSeekEffort(args.effort)??'high') as Options['effort']
    opts.settings={...opts.settings,...deepSeekPicker,fastMode:false}
  }
  return opts
}

export type StartArgs = {
  cardId?: string
  remote?:RemoteTarget|null
  title?: string
  directoryMode?: string
  group?: string
  seat?: string
  engine?: Engine
  cwd?: string
  model?: string
  permissionMode?: PermissionMode
  thinking?: boolean
  planMode?: boolean
  fastMode?: boolean
  effort?: EffortLevel
  claudeSessionId?: string
  threadId?: string
}

export async function startSession(args: StartArgs = {}, owner?: string): Promise<{ sessionId: string; cwd: string; engine: Engine }> {
  assertNotRemoving(args.cardId)
  let card = args.cardId ? readStore().sessions.find((c) => c.id === args.cardId) : undefined
  assertTeamAvailable(card?.group??args.group)
  if (args.cardId && !card) throw new Error(`no such card ${args.cardId}`)
  if (card && card.engine === 'codex' && teamSettings(readStore(),card.group).mode === 'cloud' && card.codexExecution !== 'native-v1') {
    // Old MCP instructions/tools are already in native history. Start a clean context,
    // retaining the original native ID for deletion and the host's visible transcript.
    const next=patchSession(card.id,{nativeSessions:nativeSessionRefs(card),threadId:undefined,codexExecution:'native-v1'})
    card=next.sessions.find(c=>c.id===card!.id)!
  }
  if (card) {
    employeeWorkspace(readStore(),card.group,card.cwd,card.id)
    const existing = [...live.entries()].find(([, s]) => s.cardId === card.id)
    if(existing){if(existing[1].engine===card.engine&&JSON.stringify(existing[1].remote??null)===JSON.stringify(executionEmployee(readStore(),card).remote))return {sessionId:existing[0],cwd:existing[1].remote?.directory??existing[1].cwd,engine:existing[1].engine};await closeSession(existing[0])}
    assertEmployeeControl(card.id, owner)
    args = { ...card, cardId: card.id }
  }
  const sessionId = newSessionId()
  const config=teamSettings(readStore(),args.group??''),root=readStore().teamRoots?.[args.group??'']
  if(args.remote!==undefined&&args.remote!==null)throw new Error('云主机连接由 Team 统一配置')
  const cwd = card?employeeWorkspace(readStore(),card.group,card.cwd,card.id):await resolveEmployeeWorkspace(readStore(),args.group??'',args.title||`New ${args.engine==='codex'?'Codex':'Claude'} session`,args.cwd,args.directoryMode)
  const remote=config.mode==='cloud'?{...config.remote!,directory:cwd}:null
  if(!remote)provisionEmployee(cwd,root!,config)
  const workRoot=config.mode==='work'?root:undefined,permissionRoot=workRoot?dirname(workRoot):undefined
  if(workRoot)await prepareWorkspacePlugins(cwd,config.pluginId!)
  const remoteLaunch=remote?(await checkRemote(remote),(args.engine??'claude')==='claude'?await prepareRemote(card?.id??sessionId,'claude',remote):undefined):undefined
  assertTeamAvailable(args.group)
  const latest=readStore(),latestConfig=teamSettings(latest,args.group??'')
  if(latest.teamRoots?.[args.group??'']!==root||latestConfig.mode!==config.mode||latestConfig.pluginId!==config.pluginId||JSON.stringify(latestConfig.remote)!==JSON.stringify(config.remote))throw new Error('Team 配置已变更，请重新打开会话')
  if(card&&!latest.sessions.some(c=>c.id===card.id&&c.cwd===card.cwd&&c.group===card.group&&c.engine===card.engine&&JSON.stringify(executionEmployee(latest,c).remote)===JSON.stringify(remote)))throw new Error('员工已被移除或调整目录，请重新打开会话')
  if(card){const existing=[...live.entries()].find(([,s])=>s.cardId===card.id);if(existing)return {sessionId:existing[0],cwd:existing[1].remote?.directory??existing[1].cwd,engine:existing[1].engine}}
  assertNotRemoving(card?.id)
  if(!remote)employeeWorkspace(readStore(),args.group??'',cwd,card?.id,false)
  const engine: Engine = args.engine ?? 'claude'
  if (engine !== 'claude' && engine !== 'codex') throw new Error(`Unknown engine: ${engine}`)
  if (engine === 'codex') args = { ...args, model: args.model || 'gpt-5.6-luna', effort: card?args.effort:(args.effort??'low') }
  const provider=engine==='claude'?deepSeekProvider(remote?undefined:cwd):undefined
  if(provider)args={...args,model:deepSeekModel(provider,args.model),effort:deepSeekEffort(args.effort),fastMode:false}
  const permissionMode = managerCliRoot(cwd)&&!remote&&!workRoot?'acceptEdits':args.permissionMode ?? (workRoot||remote?'acceptEdits':'default')
  if(remote&&permissionMode!=='acceptEdits')throw new Error('云主机模式使用 SSH 用户的远端权限')
  if(workRoot&&permissionMode!=='acceptEdits')throw new Error('Work 模式按员工目录授权，必须使用 Workspace write 权限')
  const cardId = card?.id ?? sessionId
  patchSession(cardId, {
    ...card, engine, cwd, remote:undefined, group: args.group ?? '', seat: args.seat,
    threadId:args.threadId,claudeSessionId:args.claudeSessionId,
    title: args.title || `New ${engine === 'codex' ? 'Codex' : 'Claude'} session`,
    createdAt: card?.createdAt ?? Date.now(), model: args.model, effort: args.effort,
    permissionMode, planMode:args.planMode??false,fastMode:args.fastMode??false, thinking: engine === 'claude' && args.thinking !== false
  })
  restoreTranscript(sessionId, cardId, engine)

  if (engine === 'codex') {
    const state: Live = {
      cardId,
      engine,
      q: null as never,
      input: null as never,
      sessionId: null,
      threadId: args.threadId,
      cwd,
      workRoot,permissionRoot,remote,remoteLaunch,
      model: args.model,
      thinkingEnabled: false,
      planMode:args.planMode??false,fastMode:args.fastMode??false,
      effort: args.effort,
      sandbox: sandboxFor(permissionMode),
      permissionMode,
      running: false,
      queue: []
    }
    live.set(sessionId, state)
    rememberMeta(sessionId, {
      engine,
      cwd,
      threadId: args.threadId,
      model: args.model,
      thinking: false,
      thinkingSupported: false,
      planMode:args.planMode??false,fastMode:args.fastMode??false,
      effort: args.effort,
      permissionMode,
      commands: [],
      models: codexModels(),
      busy: false
    })
    emit('session:meta', {
      sessionId,
      engine,
      commands: [],
      models: codexModels(),
      requestedModel: args.model,
      permissionMode,
      thinking: false,
      thinkingSupported: false,
      effort: args.effort
    })
    // Ask the installed CLI for current account/model capabilities without inference.
    void withCodexSessionApi(allCodexModels).then(models=>{
      if(live.has(sessionId)&&models.length)rememberMeta(sessionId,{models})
    }).catch(()=>{}) // Offline engines keep the official local cache above.
    return { sessionId, cwd:remote?.directory??cwd, engine }
  }

  const input = new AsyncQueue<SDKUserMessage>()
  const state: Live = {
    cardId,
    engine,
    provider,
    q: null as never,
    input,
    sessionId: null,
    cwd,
    workRoot,permissionRoot,remote,remoteLaunch,
    model: args.model,
    thinkingEnabled: args.thinking !== false,
    planMode:args.planMode??false,fastMode:args.fastMode??false,
    effort: args.effort,
    sandbox: sandboxFor(permissionMode),
    permissionMode,
    running: false,
    queue: []
  }

  const approve=approvalHandler(sessionId, () => emit('session:changed', { sessionId }))
  const q = query({ prompt: input, options: {
    ...buildOptions({ ...args, cwd, workRoot, permissionRoot, remote,remoteLaunch,permissionMode,isPlanning:()=>state.planMode===true, resume: args.claudeSessionId }),
    canUseTool: remote?async(tool,input,context)=>cloudToolAllowed(tool,state.planMode===true)?approve(tool,input,context):{behavior:'deny',message:'云主机员工禁止调用本机工具'}:approve,
    onElicitation:elicitationHandler(sessionId,()=>emit('session:changed',{sessionId}))
  } })
  state.q = q
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
          patchSession(cardId,{nativeSessions:nativeSessionRefs(saved),claudeSessionId:state.sessionId})
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
          cancelApprovals(sessionId);emit('session:turn-end', { sessionId });dispatchQueued(state,sessionId)
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

/** Serialize user turns over the employee’s native connection. */
async function pumpCodex(s: Live, sessionId: string) {
  if (s.running) return
  s.running = true
  try {
    while (s.queue.length) {
      const {text,images} = s.queue.shift()!
      const abort = new AbortController()
      s.abort = abort
      rememberMeta(sessionId, { busy: true })
      emit('session:turn-start', { sessionId })
      await runCodexTurn({
        prompt: text,images,connectionId:sessionId,
        cwd: s.cwd,
        workRoot: s.workRoot,permissionRoot:s.permissionRoot,remote:s.remote,
        resumeId: s.threadId,planMode:s.planMode,
        model: s.model,
        sandbox: s.sandbox,
        effort: codexEffort(s.effort)??activeModel(sessionInfo(sessionId)?.models??[],s.model)?.defaultEffort,
        serviceTier:s.fastMode?fastTier(activeModel(sessionInfo(sessionId)?.models??[],s.model))?.id:undefined,
        signal: abort.signal,
        approvalPolicy:s.workRoot||s.remote||['dontAsk','bypassPermissions'].includes(s.permissionMode)?'never':'on-request',
        onRequest:nativeRequestHandler(sessionId,()=>emit('session:changed',{sessionId}),!s.workRoot&&!s.remote&&!s.planMode),
        onEvent: (ev) => {
          if(ev.kind==='child-thread'){const card=readStore().sessions.find(c=>c.id===s.cardId);if(card)patchSession(s.cardId,{nativeSessions:[...nativeSessionRefs(card),{engine:'codex',id:ev.threadId}]});return}
          if(ev.kind==='background-turn'){if(!live.has(sessionId))return;s.running=ev.busy;rememberMeta(sessionId,{busy:ev.busy});emit(ev.busy?'session:turn-start':'session:turn-end',{sessionId});if(!ev.busy)dispatchQueued(s,sessionId);return}
          if(ev.kind==='usage'){rememberMeta(sessionId,{usage:ev.usage});return}
          if (ev.kind === 'thread') {
            s.threadId = ev.threadId
            patchSession(s.cardId, { threadId: ev.threadId })
            rememberMeta(sessionId, { threadId: ev.threadId })
            emit('session:resolved', { sessionId, threadId: ev.threadId })
            return
          }
          if (!live.has(sessionId)) return
          emit('session:codex', { sessionId, event: ev })
        }
      })
      if (!live.has(sessionId)) return
      s.abort = undefined
      rememberMeta(sessionId, { busy: false })
      emit('session:turn-end', { sessionId })
    }
  } finally {
    s.running = nativeCodexBusy(sessionId);rememberMeta(sessionId,{busy:s.running});if(!s.running){cancelApprovals(sessionId);dispatchQueued(s,sessionId)}
  }
}

function dispatchQueued(s:Live,id:string){
  if(!live.has(id)||s.running||!s.pendingMessages?.length)return
  const next=s.pendingMessages.shift()!;rememberMeta(id,{pendingMessages:[...s.pendingMessages]})
  void sendMessage(id,next.text,undefined,next.images).catch(error=>emit('session:error',{sessionId:id,message:String(error)}))
}
export function enqueueMessage(id:string,text:string,images:string[]=[]){
  const s=require_(id);assertEmployeeControl(s.cardId)
  if(!Array.isArray(images)||images.some(p=>typeof p!=='string')||images.length>16)throw new Error('images 必须是最多 16 个工作目录内的图片路径')
  if(!text.trim()&&!images.length)throw new Error('Message cannot be empty')
  const entry={id:newSessionId(),text,images};(s.pendingMessages??=[]).push(entry)
  rememberMeta(id,{pendingMessages:[...s.pendingMessages]});dispatchQueued(s,id);return entry
}
export async function steerMessage(id:string,text:string){
  const s=require_(id);assertEmployeeControl(s.cardId)
  if(!s.running||!text.trim())throw new Error('请在任务运行时追加非空指令')
  if(s.engine==='codex')await nativeCodexRequest(id,'turn/steer',{input:[{type:'text',text}]})
  else s.input.push({type:'user',message:{role:'user',content:text},parent_tool_use_id:null,session_id:s.sessionId??''} as SDKUserMessage)
  emit('session:user',{sessionId:id,text});return true
}
export async function backgroundProcesses(id:string,processId?:string,stop=false){
  const s=require_(id);if(stop)assertEmployeeControl(s.cardId)
  if(s.engine==='claude'){if(stop){const ids=processId?[processId]:Object.keys(s.nativeTasks??{});for(const task of ids){if(!s.nativeTasks?.[task])throw new Error('任务不属于当前员工');await s.q.stopTask(task);delete s.nativeTasks[task]}}return {data:Object.values(s.nativeTasks??{})}}
  if(!hasNativeCodexSession(id))return {data:[]}
  return nativeCodexRequest(id,stop?processId?'thread/backgroundTerminals/terminate':'thread/backgroundTerminals/clean':'thread/backgroundTerminals/list',processId?{processId}:{})
}
export function queuedMessages(id:string){return [...(require_(id).pendingMessages??[])]}
export function removeQueuedMessage(id:string,messageId:string){
  const s=require_(id);assertEmployeeControl(s.cardId);s.pendingMessages=(s.pendingMessages??[]).filter(m=>m.id!==messageId)
  rememberMeta(id,{pendingMessages:[...s.pendingMessages]});return queuedMessages(id)
}
export async function setPlanMode(id:string,enabled:boolean,owner?:string){
  const s=require_(id);assertEmployeeControl(s.cardId,owner)
  if(s.running)throw new Error('请先等待当前任务结束或停止任务')
  if(s.engine==='claude')await s.q.setPermissionMode(enabled?'plan':s.permissionMode)
  s.planMode=enabled;if(!owner)patchSession(s.cardId,{planMode:enabled});rememberMeta(id,{planMode:enabled});return true
}

function require_(id: string): Live {
  const s = live.get(id)
  if (!s) throw new Error(`unknown session ${id}`)
  return s
}

/** Deterministic slash commands never become model prompts. */
async function runSessionCommand(id:string,text:string,owner?:string):Promise<boolean>{
  const match=text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);if(!match)return false
  const s=require_(id),meta=sessionInfo(id)!,name=match[1],value=match[2]?.trim()??''
  if(s.engine==='codex'&&['compact','review'].includes(name)){if(name==='compact'&&(!s.threadId||value))throw new Error('用法：/compact，需要已有会话内容');return false}
  const command=mergeCommands([],s.engine,activeModel(meta.models,s.model)).find(c=>c.name===name||c.aliases?.includes(name))
  if(!command){
    const native=meta.commands.find(c=>c.name===name||c.aliases?.includes(name))
    if(s.engine==='claude'&&native&&!meta.terminalCommands?.includes(native.name))return false
    throw new Error(`/${name} 当前不可通过此引擎的会话 API 执行。输入 /help 查看可用命令。`)
  }
  let result=''
  switch(command.name){
    case 'new':{
      if(value)throw new Error('用法：/new 或 /clear')
      const card=readStore().sessions.find(c=>c.id===s.cardId)!
      await closeNativeCodexSession(id);patchSession(s.cardId,{nativeSessions:nativeSessionRefs(card),threadId:undefined});s.threadId=undefined;s.running=false;rememberMeta(id,{threadId:undefined,busy:false})
      emit('session:message',{sessionId:id,message:{type:'conversation_reset'}})
      result='已开始新的上下文，员工和工作目录保持不变。';break
    }
    case 'fork':{if(!value){result='用法：/fork 新员工名称。也可点击上方「克隆员工」选择工作目录。';break}if(owner)throw new Error('请通过 card.clone 在任务外克隆员工');const clone=await import('./employees').then(m=>m.cloneEmployee(s.cardId,{title:value}));result=`已克隆员工：${clone.title}\n员工 ID：${clone.id}\n工作目录：${clone.cwd}`;break}
    case 'plan':{await setPlanMode(id,true,owner);if(value)return sendMessage(id,value,owner);result='计划模式已开启。使用 /normal 返回执行模式。';break}
    case 'normal':await setPlanMode(id,false,owner);result='已返回执行模式。';break
    case 'ps':result=JSON.stringify(await backgroundProcesses(id),null,2);break
    case 'stop':await backgroundProcesses(id,undefined,true);result='已停止此员工的后台终端。';break
    case 'skills':case 'mcp':case 'account':case 'usage':{result=JSON.stringify(await import('./engine-tools').then(m=>m.inspectEngine(id,command.name)),null,2);break}
    case 'help':result=meta.commands.filter(c=>!meta.terminalCommands?.includes(c.name)).map(c=>`/${c.name} ${c.argumentHint} — ${c.description}`).join('\n');break
    case 'status':result=JSON.stringify({engine:s.engine,model:s.model,effort:s.effort??'default',planMode:s.planMode??false,fastMode:s.fastMode??false,fastModeState:meta.fastModeState,fastModeDisabledReason:meta.fastModeDisabledReason,permission:s.permissionMode,cwd:s.cwd,nativeSessionId:s.threadId??s.sessionId},null,2);break
    case 'model':{
      if(!value){result=meta.models.map(m=>`${m.value} — ${m.displayName}\n  effort: ${modelEfforts(s.engine,m).join(', ')||'无'}`).join('\n');break}
      const [model,effort,...extra]=value.split(/\s+/);if(extra.length)throw new Error('用法：/model <model> [effort]')
      const selected=activeModel(meta.models,model)
      if(effort&&!modelEfforts(s.engine,selected).includes(effort))throw new Error('所选模型不支持这个思考强度')
      await setModel(id,model,owner);if(effort)await setEffort(id,effort as EffortLevel,owner)
      result=`模型：${model} · 思考：${s.effort??'default'}`;break
    }
    case 'effort':if(value)await setEffort(id,value==='default'?null:value as EffortLevel,owner);result=`思考强度：${s.effort??'default'}；可选：${modelEfforts(s.engine,activeModel(meta.models,s.model)).join(', ')}`;break
    case 'fast':if(value&& !['on','off','status'].includes(value))throw new Error('用法：/fast [on|off|status]');if(value!=='status')await setFastMode(id,value?value==='on':!s.fastMode,owner);result=`Fast：${s.fastMode?'开启（更高用量）':'关闭'}`;break
    case 'permissions':if(value){if(owner)throw new Error('定时任务不能更改员工权限');await setPermissionMode(id,value as PermissionMode)}result=`执行权限：${s.permissionMode}`;break
  }
  emit('session:user',{sessionId:id,text})
  emit('session:message',{sessionId:id,message:{type:'system',subtype:'local_command_output',content:result}})
  emit('session:turn-end',{sessionId:id});queueMicrotask(()=>dispatchQueued(s,id))
  return true
}

export async function setFastMode(id:string,enabled:boolean,owner?:string){
  const s=require_(id);assertEmployeeControl(s.cardId,owner)
  if(s.running)throw new Error('请等待当前任务结束后再切换速度')
  if(enabled&&!supportsFast(s.engine,activeModel(sessionInfo(id)?.models??[],s.model)))throw new Error('当前模型未提供官方 Fast 档位')
  if(s.engine==='claude')await s.q.applyFlagSettings({fastMode:enabled})
  s.fastMode=enabled
  if(!owner)patchSession(s.cardId,{fastMode:enabled})
  rememberMeta(id,{fastMode:enabled})
  return true
}

export async function sendMessage(sessionId: string, text: string, owner?: string,imagePaths:string[]=[]): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  const store=readStore(), card=executionEmployee(store,store.sessions.find(c=>c.id===s.cardId)!)
  if(card.engine!==s.engine)throw new Error('引擎配置已变更，请重新打开会话')
  if(JSON.stringify(card.remote??null)!==JSON.stringify(s.remote??null))throw new Error('云主机配置已变更，请重新打开会话')
  const cwd=card.remote?card.cwd:employeeWorkspace(store,card.group,card.cwd,card.id)
  if(cwd!==s.cwd) throw new Error('工作空间已变更，请重新打开员工会话')
  if(!Array.isArray(imagePaths)||imagePaths.some(p=>typeof p!=='string')||imagePaths.length>16)throw new Error('images 必须是最多 16 个工作目录内的图片路径')
  if (!text.trim()&&!imagePaths.length) throw new Error('Message cannot be empty')
  if (s.running) throw new Error('Session is busy; wait for completion or interrupt it first')
  if(imagePaths.length&&text.startsWith('/'))throw new Error('请使用普通消息发送图片附件')
  if(text.startsWith('/')&&await runSessionCommand(sessionId,text,owner))return true
  let images:ImageInput[]=[]
  if(imagePaths.length){
    const modalities=activeModel(sessionInfo(sessionId)?.models??[],s.model)?.inputModalities
    if(modalities&&!modalities.includes('image'))throw new Error('当前模型不支持图片输入')
    const cancel=new AbortController();s.abort=cancel;s.running=true;rememberMeta(sessionId,{busy:true})
    try{for(const image of imagePaths)images.push(card.remote?await remoteFiles(card.id,card.remote,'read-image',{path:image}):workspaceFiles(cwd,'read-image',{path:image}) as ImageInput)}
    finally{s.running=false;s.abort=undefined;rememberMeta(sessionId,{busy:false})}
    if(cancel.signal.aborted||!live.has(sessionId))return false
  }
  emit('session:user', { sessionId, text,images:imagePaths })
  if (s.engine === 'codex') {
    s.queue.push({text,images})
    s.finished=pumpCodex(s, sessionId)
    return true
  }
  s.running = true
  rememberMeta(sessionId, { busy: true })
  emit('session:turn-start', { sessionId })
  s.input.push({
    type: 'user',
    message: { role: 'user', content:images.length?[...(text?[{type:'text',text}]:[]),...images.map(image=>({type:'image',source:{type:'base64',media_type:image.mimeType,data:image.data}}))]:text },
    parent_tool_use_id: null,
    session_id: s.sessionId ?? ''
  } as SDKUserMessage)
  return true
}

export async function setModel(sessionId: string, model?: string, owner?: string): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  if(s.running)throw new Error('请等待当前任务结束后再切换模型')
  if(s.provider)model=deepSeekModel(s.provider,model)
  if (s.engine === 'claude') await s.q.setModel(model)
  s.model = model
  if (!owner) patchSession(s.cardId, { model })
  rememberMeta(sessionId, { model })
  const selected=activeModel(sessionInfo(sessionId)?.models??[],model)
  if(s.effort&&!modelEfforts(s.engine,selected).includes(s.effort))await setEffort(sessionId,null,owner)
  if(s.fastMode&&!supportsFast(s.engine,selected))await setFastMode(sessionId,false,owner)
  return true
}

export async function setPermissionMode(
  sessionId: string,
  mode: PermissionMode
): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId)
  if (s.running)throw new Error('请等待当前任务结束后再切换权限')
  if(mode==='plan')return setPlanMode(sessionId,true)
  if (!['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'].includes(mode)) throw new Error(`Unknown permission mode: ${mode}`)
  if(s.remote&&mode!=='acceptEdits')throw new Error('云主机模式使用 SSH 用户的远端权限，不能切换本地沙箱')
  if(managerCliRoot(s.cwd)&&mode!=='acceptEdits')throw new Error('Manager 员工需要 Workspace write 才能连接宿主 CLI')
  if(s.workRoot&&mode!=='acceptEdits')throw new Error('Work 模式的目录权限不能绕过；请通过员工工作目录调整权限范围')
  // The engine decides whether this is allowed; record the change only after
  // it agrees, so the reported state can never drift from reality.
  if (s.engine === 'codex') {
    s.permissionMode = mode;s.planMode=false
    s.sandbox = sandboxFor(mode)
    patchSession(s.cardId, { permissionMode: mode,planMode:false })
    rememberMeta(sessionId, { permissionMode: mode,planMode:false })
    return true
  }
  await s.q.setPermissionMode(mode)
  s.permissionMode = mode;s.planMode=false
  patchSession(s.cardId, { permissionMode: mode,planMode:false })
  rememberMeta(sessionId, { permissionMode: mode,planMode:false })
  return true
}

export async function setThinking(sessionId: string, enabled: boolean, owner?: string): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  if (s.engine === 'codex') throw new Error('Codex 使用模型支持的思考强度；请使用 /effort 或 config.effort')
  // null clears the override (session default); 0 disables; a budget turns it on
  await s.q.setMaxThinkingTokens(enabled ? null : 0, enabled ? 'summarized' : null)
  s.thinkingEnabled = enabled
  if (!owner) patchSession(s.cardId, { thinking: enabled })
  rememberMeta(sessionId, { thinking: enabled })
  return true
}

export async function setEffort(
  sessionId: string,
  effort?: EffortLevel | null,
  owner?: string
): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  // null clears the override back to the model's default, which is what the
  // GUI's "Default" entry means. Codex reads it as a flag on the next turn.
  if(s.running)throw new Error('请等待当前任务结束后再切换思考强度')
  const cleared = effort === null || effort === undefined
  const choices=modelEfforts(s.engine,activeModel(sessionInfo(sessionId)?.models??[],s.model))
  if (!cleared && !choices.includes(effort)) throw new Error(`当前模型支持的思考强度：${choices.join(', ')||'无'}；也可使用 default`)
  if (s.engine === 'claude') {
    await s.q.applyFlagSettings({ effortLevel: cleared ? (s.provider?'high':null) : (effort as import('@anthropic-ai/claude-agent-sdk').EffortLevel) })
  }
  s.effort = cleared ? undefined : (effort as EffortLevel)
  if (!owner) patchSession(s.cardId, { effort: s.effort })
  rememberMeta(sessionId, { effort: s.effort })
  return true
}

export async function interrupt(sessionId: string): Promise<boolean> {
  const s = live.get(sessionId)
  if (!s) return true
  cancelApprovals(sessionId);s.abort?.abort()
  s.pendingMessages=[];rememberMeta(sessionId,{pendingMessages:[]})
  if (s.engine === 'codex') {
    s.queue.length = 0
    if(s.abort)s.abort.abort();else if(s.running&&hasNativeCodexSession(sessionId))try{await nativeCodexRequest(sessionId,'turn/interrupt')}catch(error){
      if(!String(error).includes('no active turn to interrupt'))throw error
      s.running=false;rememberMeta(sessionId,{busy:false})
    }
  } else {
    await s.q.interrupt()
  }
  emit('session:interrupted', { sessionId })
  return true
}

export async function closeSession(sessionId: string): Promise<boolean> {
  const s = live.get(sessionId)
  if (!s) return true
  cancelApprovals(sessionId)
  forget(sessionId)
  live.delete(sessionId)
  if (s.engine === 'codex') {
    s.queue.length = 0
    s.abort?.abort()
  } else {
    s.input.close()
    s.q.close()
  }
  await s.finished
  if(s.engine==='codex')await closeNativeCodexSession(sessionId)
  info.delete(sessionId)
  emit('session:closed', { sessionId })
  return true
}

/** Tear everything down on quit. */
export async function closeAll():Promise<void> {
  for(const id of live.keys())saveTranscript(id)
  await Promise.all([...live.keys()].map(closeSession))
}

/** What a live session reported about itself, for the CLI to read back. */
export type SessionInfo = {
  id: string
  engine: Engine
  cwd: string
  model?: string
  thinking: boolean
  thinkingSupported: boolean
  planMode?: boolean
  fastMode?: boolean
  fastModeState?: string
  fastModeDisabledReason?: string
  effort?: EffortLevel
  permissionMode: PermissionMode
  usage?:Record<string,unknown>
  pendingMessages?:{id:string;text:string;images?:string[]}[]
  commands: SlashCommand[]
  /** Commands bound to a local terminal, which a GUI should hide. */
  terminalCommands?: string[]
  models: ModelInfo[]
  busy: boolean
  claudeSessionId?: string
  threadId?: string
}

/** Everything a session learned about itself, cached as meta arrives. */
const info = new Map<string, SessionInfo>()

export function rememberTerminalCommands(sessionId: string, names: string[]): void {
  const prev = info.get(sessionId) ?? { commands: [], models: [] }
  info.set(sessionId, { ...prev, terminalCommands: names, id: sessionId } as SessionInfo)
}

export function rememberMeta(sessionId: string, meta: Partial<SessionInfo>): void {
  if (!live.has(sessionId)) return
  const prev = info.get(sessionId) ?? { commands: [], models: [] }
  info.set(sessionId, { ...prev, ...meta, id: sessionId } as SessionInfo)
  emit('session:changed', { sessionId })
}

export function sessionSnapshot(sessionId: string): Session {
  const s = require_(sessionId)
  const card = readStore().sessions.find((c) => c.id === s.cardId)!
  return { ...conversation(sessionId), ...sessionInfo(sessionId), activityPreview:activityPreview(conversation(sessionId)), cardId: s.cardId,
    cwd:s.remote?.directory??s.cwd, title: card?.title ?? '', group: card?.group ?? '', createdAt: card?.createdAt ?? 0,
    approvals: approvalsFor(sessionId) } as Session
}

export function sessionInfo(sessionId: string): SessionInfo | undefined {
  const meta=info.get(sessionId);if(!meta)return undefined
  return {...meta,terminalCommands:meta.terminalCommands?.filter(name=>!engineCommands.some(c=>c.name===name||c.aliases?.includes(name))),commands:mergeCommands(meta.commands,meta.engine,activeModel(meta.models,meta.model))}
}

export function allSessionInfo(): SessionInfo[] {
  return [...info.keys()].map(id=>sessionInfo(id)!)
}

/** The slash commands available to a live session, if it reported any. */
export function sessionCommands(sessionId: string): {
  name: string
  description: string
  argumentHint: string
  aliases?: string[]
}[] {
  return sessionInfo(sessionId)?.commands ?? []
}
