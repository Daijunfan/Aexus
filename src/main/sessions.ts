import { attachmentPaths,attachmentInfo } from '../shared/message-attachments'
import type { MessageReply } from '../shared/types'
import type { MessageQuote } from '../shared/message-quotes'
import { isEngine,assertEngineWorkspace } from '../shared/engines'
import { assertEngineExecutable } from './engines/registry'
import { openEngine } from './engines/runtime'
import type { EngineDriver } from './engines/contract'
import { AsyncQueue } from './engines/session-support'
import { taskViewId,taskViewPrompt } from './task-view'
import {messageSourceView,type MessageSourceView} from '../shared/message-source'
import {messageSourcePrompt} from './message-source'
import { discussionPolicy as chatAcknowledgmentPolicy,discussionPrompt as chatTaskPrompt,discussionTarget,recordDiscussionDelivery as updateChatDelivery } from './discussion-context'
import { openDiscussionTool } from './discussion-tool'
import { prepareDocumentationTool,beginDocumentationRead,assertDocumentationRead } from './documentation-tool'
import {prepareApiTool} from './api-tool'
import type { PrivateSendAttempt } from './private-send-receipts'
import type { SharedTaskContext as ChatTaskContext } from '../shared/chat-groups'
import { assertEmployeeReady,isInitializer,pendingInitialization } from './initialization-state'
import { hasGlobalRole,assertManagementKind } from '../shared/management'
import { prepareRemoteAgentAccess,prepareRemoteEmployeeDocuments,closeRemoteAgentAccess } from './remote-agent-access'
import { employeeProcessOptions } from './agent-process-isolation'
import { delegationFor,validateDelegation,authorizeSlash,requestContext } from './authorization'
import type { Delegation,CurrentTask } from '../shared/management'
import { activityPreview,employeeActivity } from '../shared/activity'
import { dirname } from 'node:path'
import { closeNativeCodexSession } from './codex-native'
import { workspaceFiles } from './files'
import { type RemoteTarget } from '../shared/remote'
import { checkRemote,prepareRemote,resolveEmployeeWorkspace,remoteFiles,type RemoteLaunch } from './tunnel'
export {AsyncQueue,sandboxFor,codexEffort} from './engines/session-support'
// The session registry and every operation that can be performed on a live
// session. Both frontends drive this: the Electron main process (IPC) and the
// local socket server (CLI). Emitting is injected so neither frontend is baked in.

import type {
PermissionMode,
Query,SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { activeModel,modelEfforts,supportsFast,mergeCommands,engineCommands } from '../shared/engine-commands'
import type { EffortLevel,ModelInfo,SlashCommand,ImageInput,EmployeeKind,NativeOrigin } from '../shared/types'
import { type SandboxMode } from './codex'
import { deepSeekProvider,deepSeekModel,deepSeekEffort,type DeepSeekProvider } from './claude-provider'
import { prepareWorkspacePlugins } from './plugins/runtime'
import { patchSession,readStore } from './store'
import { conversation,forget,restoreTranscript,saveTranscript,resolveMessageReply } from './transcripts'
import { approvalsFor,cancelApprovals } from './approvals'
import { teamSettings,employeeSettings,nativeSessionRefs,type Session,type StoredSession } from '../shared/types'
import { employeeRoot,employeeWorkspace,executionEmployee,cloudRelative } from './workspaces'
import { provisionEmployee,ensureEmployeeBootstrap,employeeInstructions,employeeRolePrompt } from './plugins/documents'
import { checkCloudNative,cloudNativeTarget } from './cloud-native'

const removingEmployees=new Set<string>(),removingTeams=new Set<string>()
export function assertTeamAvailable(name?:string){if(name&&removingTeams.has(name))throw new Error('Team 正在删除中，暂时不能创建或调整员工')}
export function beginTeamRemoval(name:string){assertTeamAvailable(name);removingTeams.add(name)}
export function endTeamRemoval(name:string){removingTeams.delete(name)}
export function beginEmployeeRemoval(id:string){if(removingEmployees.has(id))throw new Error('员工正在移除中');removingEmployees.add(id)}
export function endEmployeeRemoval(id:string){removingEmployees.delete(id)}
export function assertNotRemoving(id?:string){if(id&&(removingEmployees.has(id)||readStore().sessions.find(c=>c.id===id)?.deleting))throw new Error('员工正在移除中，无法打开会话')}


export type Engine = import('../shared/engines').EngineId

export type Live = {
  driver:EngineDriver
  privateSend?:PrivateSendAttempt
  privateInitialization?:boolean
  acknowledging?:boolean
  bootstrapInstructions?:string
  cardId: string
  currentTask?:CurrentTask
  kind: EmployeeKind
  nativeOrigin?:NativeOrigin
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
  nativeRemote?:RemoteTarget
  remoteLaunch?:RemoteLaunch
  provider?:DeepSeekProvider
  model?: string
  thinkingEnabled: boolean
  planMode?: boolean
  remoteAdmin?: boolean
  fastMode?: boolean
  effort?: EffortLevel
  sandbox: SandboxMode
  /** Environment applied when the session started, reused for stored cards. */
  permissionMode: PermissionMode
  /** Codex runs one child process per turn, so turns are queued rather than pushed. */
  running: boolean
  queueDispatching?: boolean
  nativeTasks?:Record<string,{processId:string;command:string;cwd:string;status:string}>
  pendingMessages?: {id:string;text:string;images?:string[];files?:string[];delegation?:Delegation;viewId?:string;sourceView?:MessageSourceView;chat?:ChatTaskContext;replyTo?:string;replyQuote?:MessageQuote;crossReply?:MessageReply}[]
  queue: {text:string;images?:ImageInput[];taskId?:string}[]
  abort?: AbortController
  finished?: Promise<void>
}

/** Broadcast an event to whoever is listening (GUI windows, CLI clients). */
export type Emitter = (channel: string, payload: unknown) => void

const privateTurns=new Map<string,Emitter>()
let broadcast: Emitter = () => {}
const observers = new Set<Emitter>()
const emit: Emitter = (channel, payload) => {
  const hidden=privateTurns.get((payload as {sessionId?:string})?.sessionId??'')
  if(hidden)hidden(channel,payload)
  if((hidden||live.get((payload as {sessionId?:string})?.sessionId??'')?.privateInitialization)&&channel!=='session:changed'&&!(live.get((payload as {sessionId?:string})?.sessionId??'')?.acknowledging&&channel==='session:receipt'))return
  broadcast(channel, payload)
  for (const listener of observers) listener(channel, payload)
}
export function onSessionEvent(listener: Emitter) { observers.add(listener); return () => { observers.delete(listener) } }
const taskOwners = new Map<string, string>()
export function assertEmployeeControl(cardId: string, owner?: string, repairFailed=false) {
  if(!repairFailed||readStore().sessions.find(card=>card.id===cardId)?.initialization?.status!=='failed')assertEmployeeReady(cardId)
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

export {buildOptions} from './engines/claude-options'

export type StartArgs = {
  delegation?:Delegation
  cardId?: string
  kind?:EmployeeKind
  workEnvironment?:import('../shared/types').WorkEnvironment
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
  remoteAdmin?: boolean
  fastMode?: boolean
  effort?: EffortLevel
  clineSessionId?:string
  piSessionId?:string
  claudeSessionId?: string
  threadId?: string
}

const openingSessions=new Map<string,Promise<{sessionId:string;cwd:string;engine:Engine}>>()
export async function startSession(args:StartArgs={},owner?:string){
  assertEmployeeReady(args.cardId)
  if(!args.cardId)return startSessionInner(args,owner)
  const existing=openingSessions.get(args.cardId);if(existing)return existing
  const pending=startSessionInner(args,owner);openingSessions.set(args.cardId,pending)
  try{return await pending}finally{openingSessions.delete(args.cardId)}
}
async function startSessionInner(args: StartArgs = {}, owner?: string): Promise<{ sessionId: string; cwd: string; engine: Engine }> {
  const openingDelegation=args.delegation
  assertNotRemoving(args.cardId)
  let card = args.cardId ? readStore().sessions.find((c) => c.id === args.cardId) : undefined
  assertTeamAvailable(card?.group??args.group)
  if (args.cardId && !card) throw new Error(`no such card ${args.cardId}`)
  if (card && card.kind!=='cloud-native-worker' && card.engine === 'codex' && employeeSettings(readStore(),card).mode === 'cloud' && card.codexExecution !== 'native-v1') {
    // Old MCP instructions/tools are already in native history. Start a clean context,
    // retaining the original native ID for deletion and the host's visible transcript.
    const next=patchSession(card.id,{nativeSessions:nativeSessionRefs(card),threadId:undefined,codexExecution:'native-v1'})
    card=next.sessions.find(c=>c.id===card!.id)!
  }
  if (card) {
    assertManagementKind(card,hasGlobalRole(readStore().access,card),employeeSettings(readStore(),card).mode==='cloud')
    ensureEmployeeBootstrap(card,readStore())
    if(card.accessMode==='isolated')employeeProcessOptions(card.id)
    if(card.kind==='cloud-native-worker')cloudNativeTarget(card)
    employeeWorkspace(readStore(),card.group,card.cwd,card.id)
    const existing = [...live.entries()].find(([, s]) => s.cardId === card.id)
    if(existing){if(existing[1].engine===card.engine&&existing[1].kind===(card.kind??'worker')&&JSON.stringify(existing[1].remote??null)===JSON.stringify(executionEmployee(readStore(),card).remote))return {sessionId:existing[0],cwd:existing[1].remote?.directory??existing[1].cwd,engine:existing[1].engine};await closeSession(existing[0])}
    assertEmployeeControl(card.id, owner)
    args = { ...card, cardId: card.id }
  }
  const sessionId = newSessionId()
  const identity={group:args.group??'',workEnvironment:card?.workEnvironment??args.workEnvironment,localWorkspaceRoot:card?.localWorkspaceRoot},config=employeeSettings(readStore(),identity),root=employeeRoot(readStore(),identity)
  if(args.remote!==undefined&&args.remote!==null)throw new Error('云主机连接由 Team 统一配置')
  const cwd = card?employeeWorkspace(readStore(),card.group,card.cwd,card.id):await resolveEmployeeWorkspace(readStore(),args.group??'',args.title||`New ${args.engine==='codex'?'Codex':'Claude'} session`,args.cwd,args.directoryMode,undefined,false,args.workEnvironment)
  assertEngineWorkspace(card?.engine??args.engine??'claude',config.mode,card?.kind??args.kind??'worker')
  const remote=config.mode==='cloud'?{...config.remote!,directory:cwd}:null
  const kind=card?.kind??'worker',nativeRemote=kind==='cloud-native-worker'?cloudNativeTarget(card!).target:undefined
  if(nativeRemote)await checkCloudNative(card!.group,card!.engine,cloudRelative(config,cwd))
  if(!remote)provisionEmployee(cwd,root!,config)
  const workRoot=config.mode==='work'?root:undefined,permissionRoot=workRoot?dirname(workRoot):undefined
  if(workRoot)await prepareWorkspacePlugins(cwd,config.pluginId!,card?.id??sessionId)
  const controlBin=remote&&card?await prepareRemoteAgentAccess(card.id,remote):undefined
  if(remote&&card&&!controlBin)await prepareRemoteEmployeeDocuments(card.id,remote)
  const remoteLaunch=remote&&!nativeRemote?(await checkRemote(remote),['claude','cline','pi'].includes(args.engine??'claude')?await prepareRemote(card?.id??sessionId,'claude',{...remote,cliBin:controlBin}):undefined):undefined
  assertTeamAvailable(args.group)
  const latest=readStore(),latestConfig=employeeSettings(latest,identity)
  if(employeeRoot(latest,identity)!==root||latestConfig.mode!==config.mode||latestConfig.pluginId!==config.pluginId||JSON.stringify(latestConfig.remote)!==JSON.stringify(config.remote))throw new Error('Team 配置已变更，请重新打开会话')
  if(card&&!latest.sessions.some(c=>c.id===card.id&&c.cwd===card.cwd&&c.group===card.group&&c.engine===card.engine&&JSON.stringify(executionEmployee(latest,c).remote)===JSON.stringify(remote)))throw new Error('员工已被移除或调整目录，请重新打开会话')
  if(card){const existing=[...live.entries()].find(([,s])=>s.cardId===card.id);if(existing)return {sessionId:existing[0],cwd:existing[1].remote?.directory??existing[1].cwd,engine:existing[1].engine}}
  assertNotRemoving(card?.id)
  if(!remote)employeeWorkspace(readStore(),args.group??'',cwd,card?.id,false,undefined,identity.workEnvironment)
  const engine: Engine = args.engine ?? 'claude'
  if(!nativeRemote)await assertEngineExecutable(engine)
  if (!isEngine(engine)) throw new Error(`Unknown engine: ${engine}`)
  if (engine === 'codex') args = { ...args, effort: card?args.effort:(args.effort??'low') }
  const provider=engine==='claude'&&!nativeRemote?deepSeekProvider(remote?undefined:cwd):undefined
  if(provider)args={...args,model:deepSeekModel(provider,args.model||'deepseek-flash'),thinking:args.thinking??false,effort:deepSeekEffort(args.effort),fastMode:false}
  const permissionMode = args.permissionMode ?? 'default'
  const cardId = card?.id ?? sessionId
  validateDelegation(openingDelegation,cardId)
  patchSession(cardId, {
    ...card,...(!card?{initialization:pendingInitialization(),createdBy:requestContext().principal,managementRole:'employee' as const,accessMode:'trusted' as const}:{}), engine, cwd,workEnvironment:identity.workEnvironment,localWorkspaceRoot:identity.workEnvironment==='local'&&teamSettings(readStore(),identity.group).mode==='cloud'?root:undefined, remote:undefined, group: args.group ?? '', seat: args.seat,
    threadId:args.threadId,claudeSessionId:args.claudeSessionId,
    title: args.title || `New ${engine === 'codex' ? 'Codex' : 'Claude'} session`,
    createdAt: card?.createdAt ?? Date.now(), model: args.model, effort: args.effort,
    permissionMode, planMode:args.planMode??false,fastMode:args.fastMode??false,remoteAdmin:args.remoteAdmin??false, thinking: engine === 'claude' && args.thinking !== false
  })
  const access=employeeProcessOptions(cardId)
  if(access.profile&&(engine==='codex'||engine==='claude'))patchSession(cardId,{nativeConfigRoot:engine==='codex'?access.env.CODEX_HOME:access.env.CLAUDE_CONFIG_DIR})
  restoreTranscript(sessionId, cardId, engine)

  const opened=await openEngine({args,card,kind,engine,cardId,sessionId,cwd,workRoot,permissionRoot,remote,nativeRemote,remoteLaunch,provider,permissionMode,host:{register:(id,state)=>live.set(id,state),isOpen:id=>live.has(id),metadata:id=>info.get(id),isPrivateTurn:id=>privateTurns.has(id),emit,rememberMeta,rememberTerminalCommands,sessionInfo,dispatchQueued}})
  prepareDocumentationTool(require_(sessionId))
  prepareApiTool(require_(sessionId),sessionId,()=>emit('session:changed',{sessionId}))
  if(!card)(await import('./initialization')).queueEmployeeInitialization(cardId)
  return opened
}

const queuedPrivateSends=new Map<string,PrivateSendAttempt>()
export function privateSendQueued(employeeId:string,queueId:string){return [...live.values()].some(state=>state.cardId===employeeId&&(state.pendingMessages?.some(message=>message.id===queueId)||state.privateSend?.queueId===queueId))}
function interruptQueuedPrivateSend(id:string,reason:string){const attempt=queuedPrivateSends.get(id);try{attempt?.interrupted(reason)}catch(error){return error}finally{queuedPrivateSends.delete(id)}}
function dispatchQueued(s:Live,id:string){
  if(!live.has(id)||s.running||s.acknowledging||s.queueDispatching||!s.pendingMessages?.length)return
  s.queueDispatching=true
  const next=s.pendingMessages.shift()!,privateSend=queuedPrivateSends.get(next.id);queuedPrivateSends.delete(next.id);rememberMeta(id,{pendingMessages:[...s.pendingMessages]})
  void sendMessage(id,next.text,undefined,next.images,next.delegation,next.viewId,next.chat,next.replyTo,next.replyQuote,next.crossReply,next.files,privateSend,next.sourceView).then(sent=>{if(!sent)privateSend?.interrupted('Private message preparation was interrupted. It was not replayed.')}).catch(error=>{try{privateSend?.failed(error)}catch(saveError){emit('session:error',{sessionId:id,message:String(saveError)})};updateChatDelivery(s.cardId,next.chat,{status:'failed',error:String(error)});if(!next.delegation?.groupNotice&&!next.delegation?.channelNotice)emit('session:error',{sessionId:id,message:String(error)})}).finally(()=>{s.queueDispatching=false;if(!s.running)queueMicrotask(()=>dispatchQueued(s,id))})
}
function isGroupNotice(delegation:Delegation,chat:ChatTaskContext|undefined,employeeId:string){
  const notice=delegation.groupNotice??delegation.channelNotice
  if(notice&&(!chat||notice.employeeId!==employeeId||('groupId' in notice? !('groupId' in chat)||notice.groupId!==chat.groupId||notice.messageId!==chat.messageId:!('channelId' in chat)||notice.channelId!==chat.channelId||notice.entryId!==chat.entryId)))throw Error('Shared awareness scope does not match this message')
  if(chat&&(chatAcknowledgmentPolicy(chat,employeeId).mode==='awareness')!==!!notice)throw Error('Shared delivery mode does not match its delegation')
  return !!notice
}
export function enqueueMessage(id:string,text:string,images:string[]=[],delegation?:Delegation,viewId?:string,chat?:ChatTaskContext,replyTo?:string,replyQuote?:MessageQuote,crossReply?:MessageReply,filePaths:string[]=[],privateSend?:PrivateSendAttempt,sourceView?:MessageSourceView){
  const s=require_(id);assertEmployeeControl(s.cardId)
  if(!Array.isArray(images)||images.some(p=>typeof p!=='string')||images.length>16)throw new Error('images 必须是最多 16 个工作目录内的图片路径')
  filePaths=attachmentPaths(filePaths);if(images.length+filePaths.length>16)throw Error('Choose at most 16 attachments')
  if(!text.trim()&&!images.length&&!filePaths.length)throw new Error('Message cannot be empty')
  delegation??=delegationFor(s.cardId);validateDelegation(delegation,s.cardId)
  const notice=isGroupNotice(delegation,chat,s.cardId)
  const nativeControl=s.engine==='codex'&&!chat&&/^\/(compact|review)(?:\s|$)/.test(text)
  if(!notice)authorizeSlash(text,s.cardId,delegation)
  sourceView=messageSourceView(sourceView)
  viewId=notice?undefined:taskViewId(s.cardId,viewId)
  if(crossReply){if(delegation.requestedBy.kind!=='operator')throw Error('Only the user may quote another conversation')}else resolveMessageReply(id,replyTo,replyQuote)
  if(replyTo!==undefined&&text.startsWith('/'))throw Error('Replies require a regular message, not a slash command')
  const entry={id:newSessionId(),text,images,...(filePaths.length?{files:filePaths}:{}),delegation,viewId,...(sourceView?{sourceView}:{}),chat,...(replyTo!==undefined?{replyTo,replyQuote,...(crossReply?{crossReply}:{})}:{})}
  if(privateSend){privateSend.queued(entry.id);queuedPrivateSends.set(entry.id,privateSend)}
  ;(s.pendingMessages??=[]).push(entry)
  rememberMeta(id,{pendingMessages:[...s.pendingMessages]});dispatchQueued(s,id);return entry
}
export async function steerMessage(id:string,text:string,sourceView?:MessageSourceView){
  sourceView=messageSourceView(sourceView)
  const s=require_(id);assertEmployeeControl(s.cardId)
  if(s.acknowledging)throw Error('Wait for group acknowledgment, or queue this message instead.')
  if(!s.running||!text.trim())throw new Error('请在任务运行时追加非空指令')
  const engineText=taskViewPrompt(s.currentTask?.viewId,messageSourcePrompt(sourceView,text))
  await s.driver.steer(engineText)
  emit('session:user',{sessionId:id,text,author:requestContext().principal,...(sourceView?{sourceView}:{})});return true
}
export async function backgroundProcesses(id:string,processId?:string,stop=false){
  const s=require_(id);if(stop)assertEmployeeControl(s.cardId)
  return s.driver.background(processId,stop)
}
export function queuedMessages(id:string){return [...(require_(id).pendingMessages??[])]}
export function removeQueuedMessage(id:string,messageId:string){
  const s=require_(id);assertEmployeeControl(s.cardId);let receiptError:unknown;const removed=s.pendingMessages?.find(message=>message.id===messageId);if(removed){receiptError=interruptQueuedPrivateSend(removed.id,'The queued private message was cancelled. It was not replayed.');updateChatDelivery(s.cardId,removed.chat,{status:'interrupted',error:'Queued message cancelled'})};s.pendingMessages=(s.pendingMessages??[]).filter(m=>m.id!==messageId)
  rememberMeta(id,{pendingMessages:[...s.pendingMessages]});if(receiptError)throw receiptError;return queuedMessages(id)
}
export async function setPlanMode(id:string,enabled:boolean,owner?:string){
  const s=require_(id);assertEmployeeControl(s.cardId,owner)
  if(s.running)throw new Error('请先等待当前任务结束或停止任务')
  await s.driver.setPlan(enabled)
  s.planMode=enabled;if(!owner)patchSession(s.cardId,{planMode:enabled});rememberMeta(id,{planMode:enabled});return true
}

function require_(id: string): Live {
  const s = live.get(id)
  if (!s) throw new Error(`unknown session ${id}`)
  return s
}

/** Deterministic slash commands never become model prompts. */
async function runSessionCommand(id:string,text:string,owner?:string,delegation?:Delegation,viewId?:string,sourceView?:MessageSourceView):Promise<boolean>{
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
      await closeNativeCodexSession(id);patchSession(s.cardId,{nativeSessions:nativeSessionRefs(card),threadId:undefined,nativeOwnership:undefined});s.threadId=undefined;s.running=false;rememberMeta(id,{threadId:undefined,busy:false})
      emit('session:message',{sessionId:id,message:{type:'conversation_reset'}})
      result='已开始新的上下文，员工和工作目录保持不变。';break
    }
    case 'fork':{if(!value){result='用法：/fork 新员工名称。也可点击上方「克隆员工」选择工作目录。';break}if(owner)throw new Error('请通过 card.clone 在任务外克隆员工');const clone=await import('./employees').then(m=>m.cloneEmployee(s.cardId,{title:value}));result=`已克隆员工：${clone.title}\n员工 ID：${clone.id}\n工作目录：${clone.cwd}`;break}
    case 'plan':{await setPlanMode(id,true,owner);if(value)return sendMessage(id,value,owner,[],delegation,viewId,undefined,undefined,undefined,undefined,[],undefined,sourceView);result='计划模式已开启。使用 /normal 返回执行模式。';break}
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
  emit('session:user',{sessionId:id,text,author:delegation?.requestedBy??requestContext().principal,...(sourceView?{sourceView}:{})})
  emit('session:message',{sessionId:id,message:{type:'system',subtype:'local_command_output',content:result}})
  emit('session:turn-end',{sessionId:id});queueMicrotask(()=>dispatchQueued(s,id))
  return true
}

export async function setFastMode(id:string,enabled:boolean,owner?:string){
  const s=require_(id);assertEmployeeControl(s.cardId,owner)
  if(s.running)throw new Error('请等待当前任务结束后再切换速度')
  if(enabled&&!supportsFast(s.engine,activeModel(sessionInfo(id)?.models??[],s.model)))throw new Error('当前模型未提供官方 Fast 档位')
  await s.driver.setFast(enabled)
  s.fastMode=enabled
  if(!owner)patchSession(s.cardId,{fastMode:enabled})
  rememberMeta(id,{fastMode:enabled})
  return true
}

export async function sendMessage(sessionId: string, text: string, owner?: string,imagePaths:string[]=[],delegation?:Delegation,viewId?:string,chat?:ChatTaskContext,replyTo?:string,replyQuote?:MessageQuote,crossReply?:MessageReply,filePaths:string[]=[],privateSend?:PrivateSendAttempt,sourceView?:MessageSourceView): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  delegation??=delegationFor(s.cardId);validateDelegation(delegation,s.cardId)
  const notice=isGroupNotice(delegation,chat,s.cardId)
  if(!notice)authorizeSlash(text,s.cardId,delegation)
  const nativeControl=s.engine==='codex'&&!chat&&/^\/(compact|review)(?:\s|$)/.test(text)
  sourceView=messageSourceView(sourceView)
  const store=readStore(), card=executionEmployee(store,store.sessions.find(c=>c.id===s.cardId)!)
  viewId=notice||nativeControl||privateTurns.has(sessionId)?undefined:taskViewId(card.id,viewId,!!owner)
  if(s.kind==='cloud-native-worker'&&JSON.stringify(cloudNativeTarget(card).origin)!==JSON.stringify(s.nativeOrigin))throw new Error('云主机身份已变化；不会在本机或其他云主机执行')
  if(card.engine!==s.engine)throw new Error('引擎配置已变更，请重新打开会话')
  if(JSON.stringify(card.remote??null)!==JSON.stringify(s.remote??null))throw new Error('云主机配置已变更，请重新打开会话')
  const cwd=card.remote?card.cwd:employeeWorkspace(store,card.group,card.cwd,card.id)
  if(cwd!==s.cwd) throw new Error('工作空间已变更，请重新打开员工会话')
  if(!Array.isArray(imagePaths)||imagePaths.some(p=>typeof p!=='string')||imagePaths.length>16)throw new Error('images 必须是最多 16 个工作目录内的图片路径')
  filePaths=attachmentPaths(filePaths);if(imagePaths.length+filePaths.length>16)throw Error('Choose at most 16 attachments')
  if (!text.trim()&&!imagePaths.length&&!filePaths.length) throw new Error('Message cannot be empty')
  if (s.running||s.acknowledging) throw new Error('Session is busy; wait for completion or interrupt it first')
  if(!s.privateInitialization&&card.initialization?.nativeBindId)patchSession(card.id,{initialization:{...card.initialization,nativeBindId:undefined}})
  if(replyTo!==undefined&&text.startsWith('/'))throw Error('Replies require a regular message, not a slash command')
  if(crossReply&&delegation.requestedBy.kind!=='operator')throw Error('Only the user may quote another conversation')
  const reply=crossReply??resolveMessageReply(sessionId,replyTo,replyQuote)
  if(!notice&&(imagePaths.length||filePaths.length)&&text.startsWith('/'))throw new Error('请使用普通消息发送图片附件')
  if(!chat&&text.startsWith('/')&&await runSessionCommand(sessionId,text,owner,delegation,viewId,sourceView)){s.currentTask={messageId:newSessionId(),delegation,startedAt:Date.now(),runId:owner,viewId,...(sourceView?{sourceView}:{}),chat};rememberMeta(sessionId,{currentTask:s.currentTask});return true}
  if(privateSend)s.privateSend=privateSend
  try{
  let images:ImageInput[]=[]
  const files:import('../shared/message-attachments').MessageAttachment[]=[]
  if(imagePaths.length||filePaths.length){
    const modalities=activeModel(sessionInfo(sessionId)?.models??[],s.model)?.inputModalities
    if(imagePaths.length&&modalities&&!modalities.includes('image'))throw new Error('当前模型不支持图片输入')
    const cancel=new AbortController();s.abort=cancel;s.running=true;rememberMeta(sessionId,{busy:true})
    try{for(const image of imagePaths)images.push(card.remote?await remoteFiles(card.id,card.remote,'read-image',{path:image}):workspaceFiles(cwd,'read-image',{path:image}) as ImageInput);for(const path of filePaths){const info=card.remote?await remoteFiles(card.id,card.remote,'copy-info',{path}):workspaceFiles(cwd,'copy-info',{path});files.push(attachmentInfo(path,info))}}
    finally{s.running=false;s.abort=undefined;rememberMeta(sessionId,{busy:false})}
    if(cancel.signal.aborted||!live.has(sessionId))return false
  }
  const bootstrap=employeeInstructions(card,store)
  if(bootstrap!==s.bootstrapInstructions){
    ensureEmployeeBootstrap(card,store)
  }
  if(s.remote){
    await prepareRemoteAgentAccess(card.id,s.remote)
  }
  validateDelegation(delegation,s.cardId)
  const replyText=reply?'[Reply to a previous message in this conversation]\n'+JSON.stringify(reply)+'\n\n[Current user request]\n'+text:text
  const attachmentText=files.length?replyText+'\n\n[Attached files in this employee workspace]\n'+JSON.stringify(files)+'\nRead these files when relevant; attaching a file does not execute it.':replyText
  const acceptedDelegation=delegation,prefix=s.engine!=='codex'&&bootstrap!==s.bootstrapInstructions?bootstrap+'\n\n[Current user request]\n':''
  // Validate before acknowledging, and rebuild this projection again at actual work dispatch.
  const acknowledgmentText=chatTaskPrompt(chat,s.cardId,acceptedDelegation,attachmentText,true)
  if(!privateTurns.has(sessionId)){s.currentTask={messageId:newSessionId(),delegation,startedAt:Date.now(),runId:owner,viewId,...(sourceView?{sourceView}:{}),chat};rememberMeta(sessionId,{currentTask:s.currentTask})}
  const taskId=privateTurns.has(sessionId)?undefined:s.currentTask?.messageId
  privateSend?.dispatching(taskId!)
  if(!notice)emit('session:user', { sessionId, taskId, text,images:imagePaths,...(files.length?{files}:{}),author:delegation.requestedBy,...(sourceView?{sourceView}:{}),...(reply?{reply}:{}) })
  const finishNotice=(status:'completed'|'failed'|'interrupted',error?:string)=>{
    updateChatDelivery(s.cardId,chat,{status,sessionId,taskId,...(error?{error}:{})})
    s.currentTask=undefined;rememberMeta(sessionId,{currentTask:undefined,busy:s.running});dispatchQueued(s,sessionId)
  }
  const continueDelivery=()=>{
    validateDelegation(acceptedDelegation,s.cardId)
    if(chat&&!chatAcknowledgmentPolicy(chat,s.cardId).acknowledged)throw Error('Group acknowledgment is required before work can begin')
    if(notice){finishNotice('completed');return}
    const engineText=nativeControl?text:prefix+taskViewPrompt(viewId,!chat&&!s.privateInitialization&&!privateTurns.has(sessionId)?messageSourcePrompt(sourceView,attachmentText):chatTaskPrompt(chat,s.cardId,acceptedDelegation,attachmentText))
    s.bootstrapInstructions=bootstrap
    const closePublication=chat?openDiscussionTool(s,chat):undefined
    try{s.driver.send(s.privateInitialization||nativeControl?engineText:employeeRolePrompt(readStore().sessions.find(card=>card.id===s.cardId)!,engineText),images,taskId)}catch(error){closePublication?.();throw error}
    if(closePublication)void s.driver.whenIdle().then(closePublication,closePublication)
    privateSend?.accepted(taskId!)
  }
  if(chat&&!chatAcknowledgmentPolicy(chat,s.cardId).acknowledged){
    if(notice)updateChatDelivery(s.cardId,chat,{status:'running',sessionId,taskId})
    void acknowledgeGroupRequest(s,sessionId,chat,acknowledgmentText,images,taskId).then(()=>{
      if(live.get(sessionId)!==s||s.currentTask?.messageId!==taskId)throw Error('Employee task changed before work dispatch')
      continueDelivery()
    }).catch(error=>{if(live.get(sessionId)===s&&s.currentTask?.messageId===taskId){if(notice)finishNotice((error as Error).name==='AbortError'?'interrupted':'failed',(error as Error).message);else{emit((error as Error).name==='AbortError'?'session:interrupted':'session:error',{sessionId,message:(error as Error).message});dispatchQueued(s,sessionId)}}})
  }else continueDelivery()
  return true
  }finally{if(privateSend&&s.privateSend===privateSend)delete s.privateSend}
}

export async function setModel(sessionId: string, model?: string, owner?: string): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  if(s.running)throw new Error('请等待当前任务结束后再切换模型')
  if(s.provider)model=deepSeekModel(s.provider,model)
  await s.driver.setModel(model)
  s.model = model
  if (!owner) patchSession(s.cardId, { model })
  rememberMeta(sessionId, { model })
  const selected=activeModel(sessionInfo(sessionId)?.models??[],model)
  if(s.effort&&!modelEfforts(s.engine,selected).includes(s.effort))await setEffort(sessionId,null,owner)
  if(s.fastMode&&!supportsFast(s.engine,selected))await setFastMode(sessionId,false,owner)
  return true
}

/** Explicit platform authorization for hardware/admin commands on the remote host only. */
export async function setRemoteAdmin(id:string,enabled:boolean){
  const s=require_(id);assertEmployeeControl(s.cardId)
  if(!s.remote||s.nativeRemote||s.workRoot||s.engine!=='codex')throw new Error('远端主机管理开关仅适用于本地运行、通过 Tunnel 工作的 Codex 员工')
  if(s.running)throw new Error('请等待当前任务结束后再更改远端权限')
  s.remoteAdmin=enabled;patchSession(s.cardId,{remoteAdmin:enabled});rememberMeta(id,{remoteAdmin:enabled});return true
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
  // The engine decides whether this is allowed; record the change only after
  // it agrees, so the reported state can never drift from reality.
  await s.driver.setPermission(mode)
  s.permissionMode = mode;s.planMode=false
  patchSession(s.cardId, { permissionMode: mode,planMode:false })
  rememberMeta(sessionId, { permissionMode: mode,planMode:false })
  return true
}

export async function setThinking(sessionId: string, enabled: boolean, owner?: string): Promise<boolean> {
  const s = require_(sessionId)
  assertEmployeeControl(s.cardId, owner)
  await s.driver.setThinking(enabled)
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
  await s.driver.setEffort(cleared?null:effort)
  s.effort = cleared ? undefined : (effort as EffortLevel)
  if (!owner) patchSession(s.cardId, { effort: s.effort })
  rememberMeta(sessionId, { effort: s.effort })
  return true
}

export async function interrupt(sessionId: string,preserveQueue=false): Promise<boolean> {
  const s = live.get(sessionId)
  if (!s) return true
  let receiptError:unknown;try{s.privateSend?.interrupted('Private message preparation was stopped. It was not replayed.')}catch(error){receiptError=error}
  const notice=!!(s.currentTask?.delegation.groupNotice||s.currentTask?.delegation.channelNotice)
  if(s.acknowledging)privateTurns.get(sessionId)?.('session:interrupted',{sessionId})
  cancelApprovals(sessionId);s.abort?.abort()
  if(!preserveQueue){for(const message of s.pendingMessages??[]){const error=interruptQueuedPrivateSend(message.id,'The private message queue was stopped. It was not replayed.');receiptError??=error;updateChatDelivery(s.cardId,message.chat,{status:'interrupted',error:'Queue cancelled by Stop'})};s.pendingMessages=[]}rememberMeta(sessionId,{pendingMessages:[...(s.pendingMessages??[])]})
  await s.driver.interrupt()
  if(!notice)emit('session:interrupted', { sessionId })
  if(receiptError)throw receiptError
  return true
}

export async function closeSession(sessionId: string): Promise<boolean> {
  const employeeId=live.get(sessionId)?.cardId
  if(employeeId)closeRemoteAgentAccess(employeeId)
  const s = live.get(sessionId)
  if (!s) return true
  let receiptError:unknown;try{s.privateSend?.interrupted('The employee session closed before private message dispatch. It was not replayed.')}catch(error){receiptError=error}
  if(s.acknowledging)privateTurns.get(sessionId)?.('session:closed',{sessionId})
  cancelApprovals(sessionId)
  updateChatDelivery(s.cardId,s.currentTask?.chat,{status:'interrupted',error:'Employee session closed'})
  for(const message of s.pendingMessages??[]){const error=interruptQueuedPrivateSend(message.id,'The employee session closed with a queued private message. It was not replayed.');receiptError??=error;updateChatDelivery(s.cardId,message.chat,{status:'interrupted',error:'Employee session closed'})}
  forget(sessionId)
  live.delete(sessionId)
  await s.driver.close()
  info.delete(sessionId)
  emit('session:closed', { sessionId,cardId:s.cardId })
  if(receiptError)throw receiptError
  return true
}

/** Tear everything down on quit. */
export async function closeAll():Promise<void> {
  for(const id of live.keys())saveTranscript(id)
  await Promise.all([...live.keys()].map(closeSession))
}

/** What a live session reported about itself, for the CLI to read back. */
export type SessionInfo = {
  acknowledging?:boolean
  lastReply?:Session['lastReply']
  initialization?: import('../shared/types').EmployeeInitialization
  cardId?:string
  currentTask?:CurrentTask
  activityPreview?:Session['activityPreview']
  id: string
  engine: Engine
  cwd: string
  model?: string
  thinking: boolean
  thinkingSupported: boolean
  thinkingManaged?: boolean
  planMode?: boolean
  remoteAdmin?: boolean
  fastMode?: boolean
  fastModeState?: string
  fastModeDisabledReason?: string
  effort?: EffortLevel
  permissionMode: PermissionMode
  usage?:Record<string,unknown>
  pendingMessages?:{id:string;text:string;images?:string[];files?:string[];delegation?:Delegation;viewId?:string;sourceView?:MessageSourceView;chat?:ChatTaskContext;replyTo?:string;replyQuote?:MessageQuote;crossReply?:MessageReply}[]
  commands: SlashCommand[]
  /** Commands bound to a local terminal, which a GUI should hide. */
  terminalCommands?: string[]
  models: ModelInfo[]
  busy: boolean
  clineSessionId?:string
  piSessionId?:string
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
  info.set(sessionId, { ...prev, ...meta, ...(live.get(sessionId)?.acknowledging?{busy:true}:{}), id: sessionId } as SessionInfo)
  emit('session:changed', { sessionId })
}

export function sessionSnapshot(sessionId: string,summary=false,store=readStore()): Session {
  const s = require_(sessionId)
  const card = store.sessions.find((c) => c.id === s.cardId)!
  const content=conversation(sessionId)
  return { ...content, ...sessionInfo(sessionId,card),items:summary?[]:content.items, cardId: s.cardId,
    cwd:s.remote?.directory??s.cwd, title: card?.title ?? '', group: card?.group ?? '', createdAt: card?.createdAt ?? 0,
    approvals: approvalsFor(sessionId) } as Session
}

export function sessionInfo(sessionId: string,storedCard?:StoredSession): SessionInfo | undefined {
  const meta=info.get(sessionId);if(!meta)return undefined
  const card=storedCard??readStore().sessions.find(card=>card.id===live.get(sessionId)?.cardId)
  return {...meta,acknowledging:!!live.get(sessionId)?.acknowledging,lastReply:card?.lastReply,cardId:live.get(sessionId)?.cardId,currentTask:privateTurns.has(sessionId)&&!live.get(sessionId)?.acknowledging?undefined:live.get(sessionId)?.currentTask,initialization:card?.initialization,activityPreview:card?employeeActivity(card,{...conversation(sessionId),busy:meta.busy}):activityPreview(conversation(sessionId)),terminalCommands:meta.terminalCommands?.filter(name=>!engineCommands.some(c=>c.name===name||c.aliases?.includes(name))),commands:mergeCommands(meta.commands,meta.engine,activeModel(meta.models,meta.model))}
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

export function revokeInvalidDelegations(){
  for(const [id,state] of live){
    if(state.privateInitialization)continue
    const valid=(delegation:Delegation|undefined)=>{try{validateDelegation(delegation,state.cardId);return true}catch{return false}}
    const previous=state.pendingMessages??[];state.pendingMessages=previous.filter(message=>valid(message.delegation))
    if(previous.length!==state.pendingMessages.length){for(const message of previous)if(!state.pendingMessages.includes(message)){const error=interruptQueuedPrivateSend(message.id,'Private message sender authorization was revoked. It was not replayed.');if(error)emit('session:error',{sessionId:id,message:String(error)});updateChatDelivery(state.cardId,message.chat,{status:'interrupted',error:'Original sender authorization revoked'})};rememberMeta(id,{pendingMessages:state.pendingMessages})}
    if(state.running&&state.currentTask&&!valid(state.currentTask.delegation))void interrupt(id,true).catch(error=>emit('session:error',{sessionId:id,message:String(error)}))
  }
}

/** One internal acknowledgment turn on the existing engine, before the accepted work prompt. */
async function acknowledgeGroupRequest(state:Live,sessionId:string,chat:ChatTaskContext,text:string,images:ImageInput[],taskId?:string){
  const policy=chatAcknowledgmentPolicy(chat,state.cardId)
  let failure:string|undefined
  let resolve!:()=>void,reject!:(error:Error)=>void
  const completed=new Promise<void>((yes,no)=>{resolve=yes;reject=no});void completed.catch(()=>{})
  state.acknowledging=true
  privateTurns.set(sessionId,(channel,payload:any)=>{
    if(channel==='session:codex'||channel==='session:agent'){
      const event=payload.event
      if(event.kind==='notice'&&event.level==='error')failure=event.text
    }
    if(channel==='session:result'&&!payload.success)failure=payload.error||'The acknowledgment turn failed'
    if(channel==='session:error')reject(Error(payload.message))
    if(['session:closed','session:interrupted'].includes(channel))reject(Object.assign(Error('Group acknowledgment was interrupted; work has not started'),{name:'AbortError'}))
    if(channel==='session:end')reject(Error('Employee session closed before group acknowledgment'))
    if(channel==='session:turn-end')failure?reject(Error(failure)):resolve()
  })
  const target=discussionTarget(chat)
  const prompt='[Agents Company '+target.conversationType+' acknowledgment]\n'+JSON.stringify({...chat,...target,employeeId:state.cardId,mode:policy.mode,required:policy.required,muted:policy.muted})+
    '\nRead the shared context in this conversation. '+
    (policy.mode==='awareness'?'This message is for your awareness, not a work assignment. ':'Core dispatches your work after this reading stage. ')+
    'This stage has no tools; Core records receipt on completion.\n[Accepted request]\n'+text
  try{
    state.driver.send(prompt,images,taskId)
    await completed;await state.driver.whenIdle()
    if(live.get(sessionId)!==state||state.currentTask?.messageId!==taskId)throw Error('Employee task changed before shared reading completed')
    chatAcknowledgmentPolicy(chat,state.cardId) // Recheck membership after the native read completes.
    validateDelegation(state.currentTask?.delegation,state.cardId)
    const now=Date.now();updateChatDelivery(state.cardId,chat,{deliveredAt:now,readAt:now})
  }catch(error){if(state.running&&(error as Error).name!=='AbortError')await state.driver.interrupt().catch(()=>{});await state.driver.whenIdle();throw error}
  finally{privateTurns.delete(sessionId);state.acknowledging=false;if(live.has(sessionId))rememberMeta(sessionId,{busy:state.running})}
}

/** Keep the native context, but intercept the entire onboarding turn BEFORE persistence or publication. */
export async function runPrivateInitialization(employeeId:string,prompt:string,signal:AbortSignal):Promise<void>{
  if(!isInitializer(employeeId))throw Error('Initialization requires the private Core job context')
  signal.throwIfAborted()
  const {sessionId}=await startSession({cardId:employeeId})
  if(signal.aborted){await closeSession(sessionId);signal.throwIfAborted()}
  const state=require_(sessionId)
  state.privateInitialization=true
  if(state.running)throw Error('Cannot initialize an active user turn')
  const closeDocumentation=beginDocumentationRead(state)
  let resolve!:()=>void,reject!:(error:Error)=>void
  const completed=new Promise<void>((yes,no)=>{resolve=yes;reject=no})
  // A permission request can fail while sendMessage is still awaiting preparation.
  void completed.catch(()=>{})
  privateTurns.set(sessionId,(channel,payload:any)=>{
    try{
      if(channel==='session:message'){
        const message=payload.message
        if(message.type==='result'&&(message.is_error||String(message.subtype).startsWith('error'))){reject(Error('引擎初始化失败：'+(message.errors?.join('; ')||message.subtype)));return}
      }
      if(channel==='session:codex'||channel==='session:agent'){
        if(payload.event.kind==='notice'&&payload.event.level==='error'){reject(Error(payload.event.text));return}
      }
      if(channel==='session:result'&&payload.success===false)reject(Error(payload.error||'引擎初始化失败'))
      if(channel==='session:error')reject(Error(payload.message))
      if(['session:end','session:closed','session:interrupted'].includes(channel))reject(Error('初始化尚未完成，引擎连接已结束。'))
      if(channel==='session:turn-end'){
        // Authenticated tool results prove readiness; model wording is not a receipt.
        assertDocumentationRead(state);resolve()
      }
    }catch(error){reject(error as Error)}
  })
  const cancel=()=>reject(signal.reason instanceof Error?signal.reason:Error('初始化已取消。'))
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel()
  try{
    await sendMessage(sessionId,prompt)
    await completed
    await state.driver.whenIdle()
    signal.throwIfAborted()
    if(!live.has(sessionId))throw Error('初始化连接已关闭。')
  }catch(error){
    await closeSession(sessionId).catch(()=>{})
    throw error
  }finally{
    closeDocumentation()
    signal.removeEventListener('abort',cancel)
    privateTurns.delete(sessionId)
    state.privateInitialization=false
    state.currentTask=undefined
    if(live.has(sessionId))rememberMeta(sessionId,{currentTask:undefined,busy:false})
  }
}
