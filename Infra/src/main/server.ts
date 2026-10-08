import {stampPresentationEvent,type PresentationEvent,type PresentationStamp} from '../shared/presentation-events'
import {configureEngineScope,validEngineScope,employeeEngineScope,engineSelection,scopeSchedule,scopeConversation} from './engine-scope'
import {guardEngineRequest,projectEngineResult,scopeRequest,requireInstalledEngine} from './engine-scope-api'
import {catalog as scopeGroupCatalog} from './chat-group-store'
import {all as scopeChannelRows} from './channel-store'
import {workflowRequest} from './workflows'
import {contractRequest,installedEngines} from './contract'
import {employeeReady} from '../shared/types'
import {directoryName} from '../shared/directory-names'
import {assetNaming} from './asset-naming'
import {assetInfo} from './asset-details'
import {assetPreview} from './asset-previews'
import {assetIndex} from './asset-index'
import {assetRequest,assetLocation,assetReference} from './assets'
import {socialIdentity} from './message-categories'
import {MESSAGE_COLLABORATION_APIS} from '../shared/message-collaboration'
import {messageCollaborationRequest} from './message-collaboration'
import {CONVERSATION_CONTROL_APIS} from '../shared/conversation-control-schema'
import {conversationControlRequest,reconcileConversationNotices} from './conversation-notices'
import {conversationWorkspaceRequest,conversationFileEndpoint} from './conversation-workspaces'
import {WORKSPACE_FILE_PREFIX} from '../shared/conversation-workspaces'
import { engineRequest } from './commands/engine'
import { chatRequest } from './commands/chat'
import { openMedia,mediaInfo,readMedia,closeMedia } from './media'
import { randomUUID } from 'node:crypto'
import { readChatMessages } from './chat-groups'
import { resolveMessageReply } from './transcripts'
import { forwardMessages,forwardStatus } from './message-forwarding'
import { withPrivateSendReceipt,type PrivateSendAttempt } from './private-send-receipts'
import { privateSendQueued } from './sessions'
import { messengerRequest,resolveConversationReply } from './messenger'
import { channelRequest,channelFileEndpoint,getChannel } from './channels'
import { syncChannelIngress,channelIngressStatus } from './channel-ingress'
import { exportChannelPost } from './channel-export'
import { planRequest } from './plan'
import { APP_VIEWS,appView } from '../shared/app-views'
import { listChatGroups,getChatGroup,groupMediaRoot } from './chat-groups'
import { assertEngineWorkspace } from '../shared/engines'
import { hostTerminals,openHostTerminal,requireHostTerminal,listHostDesktops,connectHostDesktop,launchHostDesktop,closeHostDesktop,assertHostIdle,closeHostTerminals } from './host-connections'
import { isEngine } from '../shared/engines'
import { runtimeInfo } from './platform'
import { homedir } from 'node:os'
import { beginUpload,uploadChunk,commitUpload,abortUpload,downloadInfo,downloadChunk,saveDownload } from './uploads'
import { emitCoreEvent } from './core-events'
import {employeeProfile} from './employee-profile'
import { clientStore } from './client-state'
import { getConnector,setConnector,moveConnectorSegment } from './connectors'
import { taskViewId } from './task-view'
import {messageSourceView} from '../shared/message-source'
import { queueEmployeeInitialization,retryEmployeeInitialization,cancelEmployeeInitialization } from './initialization'
import { removeEmployeeWorkspace } from './employee-workspace-removal'
import { engineModels,defaultEmployeeModel } from './engine-models'
import { officeLayout } from './office'
import { beginManagementInteraction,clearManagementInteraction,managementActivity,pruneManagementActivity } from './management-activity'
import { acknowledgeReply } from './reply-receipts'
import { pendingInitialization,assertEmployeeReady,assertInitializationRequest } from './initialization-state'
import { assertManagementKind,hasGlobalRole } from '../shared/management'
import { isManagementRole,isSupervisor,managementRoles } from '../shared/roles'
import { authenticate,initializeAccessChannel,agentCredential,revokeAgentCredential,removeAgentAccessData } from './agent-access'
import { authorize,requestContext,withCaller,isGlobal,canReadHostCredentials,canReadEmployee,callerEmployee,visibleEmployees,publicEmployee,callerIdentity,allowedCommands,apiDocumentation,delegationFor } from './authorization'
import { setManagerTeam,relayoutManagement,managementTopology,requestManagement,decideManagement,bindManagement,unbindManagement,setManagementRole,setGlobalManager,creationAuthority } from './management'
import type { RequestContext } from '../shared/management'
import { updateStore } from './store'
import { validateCloudHostPatch,cloudHostFingerprints,trustCloudHostFingerprint,queryCloudHosts,cloudHostSummary,cloudHostCredentials,getCloudHost,createCloudHost,updateCloudHost,removeCloudHost,cloudHostTarget,checkCloudHost } from './cloud-hosts'
import { openExternalUrl } from './external'
import { sharedDirectory } from './shared-directory'
import { listAvatars,resolveAvatar,avatarDescription,employeeAppearance,professionValue } from '../shared/avatars'
import { startTransfer,listTransfers,getTransfer,cancelTransfer,type FileEndpoint } from './transfers'
import type { FileLocation } from '../shared/transfers'
import { cloneEmployee } from './employees'
import { openPluginWindow,pluginWindows,placePluginWindow,modePluginWindow,dismissPluginWindow } from './plugins/windows'
import { scheduleRequest,reconcileSchedules } from './scheduler/service'
import { remoteTarget } from '../shared/remote'
import { executeRemote,checkRemote,remoteFiles,closeRemote,resolveEmployeeWorkspace,teamConnectionId } from './tunnel'
import { checkCloudNative,cloudNativeTarget,readCloudNativeSession } from './cloud-native'
import { openTerminal,listTerminals,readTerminal,waitTerminalOutput,inputTerminal,resizeTerminal,closeTerminal,closeEmployeeTerminals } from './terminals'
// A unix-socket server so the whole app can be driven from a terminal. Every
// command maps onto the same operations the GUI uses, which is what makes
// headless testing meaningful: the CLI and the window share one code path.

import { getView,getMessagesView,setView,loadEngineView } from './presentation'
import type { ViewState } from '../shared/view'
import { createServer,connect,type Server,type Socket } from 'node:net'
import { existsSync,unlinkSync,cpSync,renameSync,rmSync,chmodSync,realpathSync,statSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname,basename,isAbsolute,resolve,join } from 'node:path'
import { createInterface } from 'node:readline'
import { APP_HOME,SOCKET_PATH,type Request,type Response } from '../shared/protocol'
import {
revokeInvalidDelegations,assertEmployeeControl,beginEmployeeRemoval,endEmployeeRemoval,beginTeamRemoval,endTeamRemoval,assertTeamAvailable,assertNotRemoving,
closeSession,
interrupt,
listLive,
sendMessage,
sessionCommands,
sessionInfo,
setEffort,
setFastMode,setRemoteAdmin,
setPlanMode,steerMessage,backgroundProcesses,enqueueMessage,queuedMessages,removeQueuedMessage,
setModel,
setPermissionMode,
setThinking,
startSession,
newSessionId,
type StartArgs
} from './sessions'
import { sessionSnapshot } from './sessions'
import { answerApproval,approvalsFor } from './approvals'
import {
getPreferences,setPreferences,
addGroup,
moveSession,
patchSession,
readStore,
removeGroup,
removeSession,
setRoom,
writeStore
} from './store'
import { renameGroup,designRoom,updateEmployee,employeeFields,setTeamRoot,bindTeamRoot,setBounds,placeEmployee,setViewport,configureTeam,validateTeamSettings,teamViewList,createTeamView,updateTeamView,removeTeamView,selectTeamView,canvasViewport } from './store'
import { teamSettings,employeeSettings,nativeSessionRefs,canBindNativeSession,type StoredSession } from '../shared/types'
import { workspaceFiles } from './files'
import {revealWorkspaceFile} from './file-reveal'
import { employeeRoot,employeeWorkspace,executionEmployee,cloudDirectory,cloudRelative,workspaceStatus,teamRoot,managedTeamRoot,chooseTeamRoot,defaultPluginWorkspace,legacyPluginWorkspace,inside } from './workspaces'
import { planOffice } from '../shared/canvas'
import { listPlugins,requirePlugin,installPlugin,pluginFile } from './plugins/registry'
import { callPlugin,openPluginView,closePluginView,releaseWorkspacePlugins } from './plugins/runtime'
import { provisionWorkspace,provisionEmployee,ensureEmployeeBootstrap } from './plugins/documents'
import { readFileSync,writeFileSync } from 'node:fs'
import { deleteNativeSessions,nativeRefsForRemoval } from './native-sessions'
import { transcriptItems,deleteTranscript,seedTranscript } from './transcripts'
import { renderTranscript } from '../shared/transcript'
import type { EffortLevel,PermissionMode } from '@anthropic-ai/claude-agent-sdk'

configureEngineScope(()=>({store:readStore(),groups:scopeGroupCatalog().groups,channels:scopeChannelRows('SELECT c.id,COALESCE(m.member_ids,c.admin_ids) AS member_ids FROM channels c LEFT JOIN channel_membership m ON m.channel_id=c.id').map(row=>({id:row.id,memberIds:JSON.parse(row.member_ids)}))}))

let beforeViewChange = async () => {}
export function setViewGuard(guard: () => Promise<void>) { beforeViewChange = guard }
let server: Server | null = null
let ownsSocket = false
let askRenderer: (op: string, args?: Record<string, unknown>) => Promise<unknown> = async () => { throw new Error('no window is open') }
export function setUiHandler(handler: typeof askRenderer): void { askRenderer = handler }

/** Every connected client, so events can be fanned out. */
const clients = new Set<Socket>()

/** Subscribers that asked to follow a session; socket -> sessionId. */
const following = new Map<Socket, string>()
const followerContexts=new Map<Socket,RequestContext>()
const followerActivity=new Map<Socket,()=>void>()

/** Followers that want every engine event, not just the rendered transcript. */
const rawFollowers = new Set<Socket>()
let desktopEvent:(channel:string,payload:unknown,presentation?:PresentationStamp)=>void=()=>{}
export function setDesktopEvent(handler:typeof desktopEvent){desktopEvent=handler}

/** Only presentation events are filtered. Internal schedulers and independent jobs retain the complete event stream. */
export function presentationEvent(channel:string,payload:any,clientId='desktop'):PresentationEvent<any>|null{
 return withCaller({principal:{kind:'operator'},requestId:'presentation-stamp',clientId},()=>{
  const view=getView()
  return stampPresentationEvent(projectPresentationEvent(channel,payload,clientId),view.engineId??null,view.revision)
 })
}
function projectPresentationEvent(channel:string,payload:any,clientId='desktop'):{channel:string;payload:any}|null{
 return withCaller({principal:{kind:'operator'},requestId:'presentation-event',clientId},()=>{
  if(channel==='view:changed')return {channel,payload}
  const view=getView(),scope=view.engineId??null
  if(scope===null)return channel==='engine-scope:changed'?{channel,payload:{revision:payload?.revision}}:null
  return withCaller({...requestContext(),engineScope:scope},()=>{
   const selected=engineSelection()!,ids=selected.resources.employees
   if(channel.startsWith('terminal:')){const employee=payload?.employee??listTerminals().find(t=>t.id===payload?.id)?.employee;if(!employee||!ids.includes(employee))return null}
   if(channel==='chat:changed'&&!selected.resources.groups.includes(payload?.id))return null
   if(channel==='store:changed')return {channel,payload:{revision:payload?.revision,changes:payload?.changes}}
   if(channel==='management:activity')return {channel,payload:projectEngineResult('management.activity',{},payload)}
   if(channel.startsWith('session:')){const card=payload?.cardId??payload?.employeeId??(payload?.sessionId?sessionInfo(payload.sessionId)?.cardId:undefined);if(card&&!ids.includes(card))return null;if(!card)return null}
   if(payload?.conversation&&!scopeConversation(payload.conversation))return null
   if(payload?.groupId&&!selected.resources.groups.includes(payload.groupId))return null
   if(payload?.chatId&&!selected.resources.groups.includes(payload.chatId))return null
   if(Array.isArray(payload?.channelIds)){const channelIds=payload.channelIds.filter((id:string)=>selected.resources.channels.includes(id));if(!channelIds.length)return null;payload={...payload,channelIds}}
   if(payload?.channelId&&!selected.resources.channels.includes(payload.channelId))return null
   if(channel.startsWith('schedule:')&&payload?.action&&!scopeSchedule(payload))return null
   if(channel.startsWith('workflow:')){if(payload?.engineId!==scope)return null}
   return {channel,payload}
  })
 })
}

/** Fan an event out to CLI clients. Wired from main's broadcast. */
export function publishEvent(channel: string, payload: unknown,clientId?:string): void {
  emitCoreEvent({channel,payload,clientId})
  if(!clientId||clientId==='desktop'){const visible=presentationEvent(channel,payload);if(visible)desktopEvent(visible.channel,visible.payload,visible.presentation)}
  if(clientId&&clientId!=='desktop')return
  for (const [sock, sessionId] of following) {
    if (!sock.writable) continue
    const p = payload as { sessionId?: string }
    if (p?.sessionId && p.sessionId !== sessionId) continue
    const context=followerContexts.get(sock)!
    try{withCaller(context,()=>{authorize('session.follow',{},employeeId(sessionId),context);guardEngineRequest('session.follow',{},employeeId(sessionId));assertEmployeeReady(employeeId(sessionId))})}catch{sock.end(JSON.stringify({type:'done',error:'Access revoked'})+'\n');following.delete(sock);followerContexts.delete(sock);continue}
    if(!p?.sessionId&&(context.principal.kind==='agent'||context.engineScope!==undefined))continue
    // A raw follower gets every event verbatim; a normal one gets only the
    // channels needed to render a conversation.
    if (!rawFollowers.has(sock) && !RENDERED_CHANNELS.has(channel)) continue
    sock.write(JSON.stringify({ type: 'event', channel, payload }) + '\n')
    if (['session:turn-end', 'session:end', 'session:error', 'session:closed'].includes(channel)) {
      sock.end(JSON.stringify({ type: 'done' }) + '\n')
      following.delete(sock)
      followerContexts.delete(sock)
      rawFollowers.delete(sock)
    }
  }
}

/** The channels that make up a rendered conversation. */
const RENDERED_CHANNELS = new Set([
  'session:message',
  'session:codex',
  'session:agent',
  'session:turn-start',
  'session:turn-end',
  'session:end',
  'session:closed',
  'session:error'
])

function employeeId(value:unknown){const id=String(value??'');return readStore().sessions.some(card=>card.id===id)?id:sessionInfo(id)?.cardId}
/** Resolve scope identically for normal API requests and streaming subscriptions. */
export function engineRequestContext(req:Request,context:RequestContext):RequestContext{
  return withCaller(context,()=>{
    const window=context.clientId==='desktop'||context.clientId?.startsWith('web-')
    if(window&&context.engineScope===undefined){
      const current=getView().engineId??null
      if(Object.hasOwn(req,'engineScope')&&req.engineScope!==undefined&&req.engineScope!==current&&!['view.get','view.load-engine','view.launcher','contract.engines'].includes(req.cmd))throw Object.assign(Error('The window changed Engine; check the original operation before retrying.'),{code:'ENGINE_SCOPE_STALE'})
      return {...context,engineScope:current}
    }
    let engineScope=context.engineScope
    if(engineScope===undefined&&context.principal.kind==='agent'){
      const employee=context.principal.employeeId,live=listLive().find(s=>sessionInfo(s.id)?.cardId===employee)
      engineScope=(live?sessionInfo(live.id)?.currentTask?.delegation.engineScope:undefined)??employeeEngineScope(employee)
    }
    if(Object.hasOwn(req,'engineScope')&&req.engineScope!==undefined){
      const selected=req.engineScope
      if(selected!==null&&!validEngineScope(selected))throw Error('Invalid Engine request scope')
      if(typeof selected==='string')requireInstalledEngine(selected)
      if(engineScope!==undefined&&engineScope!==selected)throw Error('A request cannot escape its Engine scope')
      engineScope=selected
    }
    return engineScope===context.engineScope?context:{...context,engineScope}
  })
}
export async function handleRequest(req:Request,context?:RequestContext&{signal?:AbortSignal}):Promise<any>{
  if(context)return withCaller(context,()=>handleRequest(req))
  const incoming=requestContext(),scoped=engineRequestContext(req,incoming)
  if(scoped!==incoming||Object.hasOwn(req,'engineScope')){
    const {engineScope:_,...request}=req
    return withCaller(scoped,()=>handleRequest(request))
  }
  const caller=requestContext(),a={...(req.args??{})} as Record<string,any>
  for(const field of ['crossReply','chat','connectorAnchors','localWorkspaceRoot','createdBy','requestedBy','approvedBy','delegation','access','managerTeam','globalManagerIds','globalGrants','deleting','initialization','lastReply'])if(field in a||a.patch&&field in a.patch||a.spec&&field in a.spec)throw Error('Internal field cannot be supplied: '+field)
  if(a.patch&&'managementRole' in a.patch||a.managementRole!==undefined&&req.cmd!=='card.create')throw Error('Use card.management-role to assign roles')
  if(req.cmd==='card.create'&&a.group===undefined&&caller.principal.kind==='agent')a.group=callerEmployee(caller.principal)!.group
  // Conversation members are not Company employee-control targets.
  let target=CONVERSATION_CONTROL_APIS.has(req.cmd)||MESSAGE_COLLABORATION_APIS.has(req.cmd)?undefined:employeeId(a.employee??a.cardId??a.id)
  if(['card.','session.','config.'].some(prefix=>req.cmd.startsWith(prefix))&&new Set([a.employee,a.cardId,a.id].filter(value=>value!==undefined).map(employeeId).filter(Boolean)).size>1)throw Error('Forbidden: conflicting employee identifiers')
  if(req.cmd.startsWith('card.'))target=employeeId(req.cmd==='card.rename'?a.cardId:a.id)
  if(req.cmd.startsWith('config.')||req.cmd.startsWith('commands.')||req.cmd.startsWith('approval.')||['engine.inspect','engine.skill'].includes(req.cmd))target=employeeId(a.id)
  if(req.cmd.startsWith('terminal.')&&a.id)target=listTerminals().find(terminal=>terminal.id===a.id)?.employee
  if(['view.tools','view.details'].includes(req.cmd))target=getView().employee
  if(req.cmd==='session.open')target=employeeId(a.cardId??a.employee??a.id)
  if(req.cmd==='card.remove'||req.cmd==='group.remove'){
    const single=req.cmd==='card.remove'?'id':'name',many=req.cmd==='card.remove'?'ids':'names'
    if(a[many]!==undefined&&a[single]!==undefined)throw Error(`Provide ${single} or ${many}, not both`)
    const values=a[many]??[a[single]]
    if(!Array.isArray(values)||!values.length||values.some(value=>typeof value!=='string'||!value.trim()))throw Error('Choose at least one valid deletion target')
    a[many]=[...new Set(values)]
    if(a.deleteWorkspace!==undefined&&typeof a.deleteWorkspace!=='boolean')throw Error('deleteWorkspace must be boolean')
    for(const value of a[many])authorize(req.cmd,{...a,[single]:value},req.cmd==='card.remove'?value:undefined,caller)
    if(a.deleteWorkspace&&!isGlobal(caller.principal))throw Error('删除工作文件夹需要用户或全局管理授权；管理关系只允许移除员工')
  }else authorize(req.cmd,a,target,caller)
  guardEngineRequest(req.cmd,a,target)
  if(['transfer.get','transfer.cancel'].includes(req.cmd)){const job=getTransfer(String(a.id));guardEngineRequest('transfer.start',{from:job.from,to:job.to})}
  assertInitializationRequest(req.cmd,target)
  if(['session.send','session.enqueue','session.steer'].includes(req.cmd))a.sourceView=messageSourceView(a.sourceView)
  if((req.cmd==='session.send'||req.cmd==='session.enqueue')&&a.clientMessageId!==undefined){
    if(!target)throw Error('Unknown employee conversation')
    return withPrivateSendReceipt(target,a,attempt=>handleAuthorizedRequest(req,a,target,caller,attempt),privateSendQueued)
  }
  return handleAuthorizedRequest(req,a,target,caller)
}
async function handleAuthorizedRequest(req:Request,a:Record<string,any>,target:string|undefined,caller:RequestContext,privateSend?:PrivateSendAttempt){
  if((req.cmd==='session.send'||req.cmd==='session.enqueue')&&target)a.viewId=taskViewId(target,a.viewId)
  if(['session.send','session.enqueue','chat.send','chat.post'].includes(req.cmd)&&a.replyConversation!==undefined){
    const destination=req.cmd.startsWith('session.')?'employee:'+target:'group:'+a.id
    if(a.replyConversation!==destination){
      if(caller.principal.kind!=='operator')throw Error('Only the user may quote another conversation')
      const previous=req.cmd.startsWith('chat.')&&typeof a.clientMessageId==='string'?readChatMessages(a.id).find(message=>message.author.kind==='operator'&&message.clientMessageId===a.clientMessageId):undefined
      const savedReply=previous?.reply
      a.crossReply=savedReply&&savedReply.conversation===a.replyConversation&&savedReply.id===a.replyTo?savedReply:resolveConversationReply(a.replyConversation,a.replyTo,a.replyQuote,a.replyTextOnly)
    }
    else {delete a.replyConversation;delete a.replyTextOnly}
  }
  if((req.cmd==='session.send'||req.cmd==='session.enqueue')&&(a.replyTo!==undefined||a.replyQuote!==undefined)){
    if(!target)throw Error('Unknown reply conversation')
    if(!a.crossReply)resolveMessageReply(target,a.replyTo,a.replyQuote)
    if(typeof a.text==='string'&&a.text.startsWith('/'))throw Error('Replies require a regular message, not a slash command')
  }
  const finishInteraction=beginManagementInteraction(req.cmd,target,caller)
  try{
  if(a.employee&&req.cmd.startsWith('session.')){
    if(req.cmd==='session.open')a.cardId=a.employee
    const live=listLive().find(item=>sessionInfo(item.id)?.cardId===a.employee)
    a.id=live?.id??a.employee
    if(['session.send','session.enqueue','session.steer','session.open'].includes(req.cmd)&&!live){const opened=await startSession({cardId:a.employee,delegation:delegationFor(a.employee,caller)});authorize(req.cmd,a,target,caller);a.id=opened.sessionId}
  }
  if(req.cmd==='session.send'||req.cmd==='session.enqueue')a.delegation=delegationFor(target??employeeId(a.id)!,caller)
  const result=projectEngineResult(req.cmd,a,await dispatchRequest({...req,args:a},privateSend))
  if(caller.principal.kind==='operator')return result?.sessions&&result?.groups?clientStore(result):result
  if(req.cmd==='session.search')return result.filter((card:StoredSession)=>canReadEmployee(caller.principal,card.id))
  if(req.cmd==='session.list'&&isGlobal(caller.principal)){const ids=new Set(visibleEmployees(caller.principal).map(card=>card.id));return a.live?result.filter((item:any)=>ids.has(item.cardId)):{...result,sessions:result.sessions.filter((item:StoredSession)=>ids.has(item.id))}}
  if(result?.sessions&&result?.groups&&isGlobal(caller.principal))return {...result,sessions:result.sessions.filter((card:StoredSession)=>canReadEmployee(caller.principal,card.id))}
  if(isGlobal(caller.principal))return result
  if(req.cmd==='session.list'){
    const ids=new Set(visibleEmployees(caller.principal).map(card=>card.id))
    return a.live?result.filter((item:any)=>ids.has(item.cardId)).map((item:any)=>({id:item.id,cardId:item.cardId,title:item.title,busy:item.busy,currentTask:item.currentTask,initialization:item.initialization})): {sessions:visibleEmployees(caller.principal).map(publicEmployee)}
  }
  if(result?.sessions&&result?.groups)return {sessions:visibleEmployees(caller.principal).map(publicEmployee)}
  return result
  }finally{finishInteraction()}
}
async function dispatchRequest(req: Request,privateSend?:PrivateSendAttempt): Promise<any> {
  const a = (req.args ?? {}) as Record<string, any>
  const s = (v: unknown) => String(v)

  if(['infra.scope','infra.bind','infra.unbind'].includes(req.cmd))return scopeRequest(req.cmd,a)
  if(req.cmd.startsWith('group.')&&!['group.list','group.remove'].includes(req.cmd))assertTeamAvailable(a.name)
  if(['card.update','card.avatar','card.move','card.remove','card.rename'].includes(req.cmd))assertTeamAvailable(readStore().sessions.find(c=>c.id===(a.id??a.cardId))?.group)
  if(['card.create','card.move','card.update','session.new'].includes(req.cmd))assertTeamAvailable(a.group??a.patch?.group)
  if(MESSAGE_COLLABORATION_APIS.has(req.cmd))return messageCollaborationRequest(req.cmd,a,fileEndpoint)
  if(req.cmd.startsWith('channel.')&&!['channel.settings','channel.image','channel.export'].includes(req.cmd))return channelRequest(req.cmd,a)
  if(CONVERSATION_CONTROL_APIS.has(req.cmd))return conversationControlRequest(req.cmd,a)
  if(req.cmd.startsWith('conversation.'))return conversationWorkspaceRequest(req.cmd,a,fileEndpoint)
  if(req.cmd.startsWith('engine.'))return engineRequest(req.cmd,a)
  if(req.cmd.startsWith('chat.'))return chatRequest(req.cmd,a)
  switch (req.cmd) {
    case 'messenger.media-open': {if(typeof a.conversation!=='string'||!/^(employee|group|channel):[a-zA-Z0-9_-]+$/.test(a.conversation)||typeof a.path!=='string'||!a.path)throw Error('Choose a conversation media file');const [kind,id]=a.conversation.split(':');return openMedia(()=>fileEndpoint({...(kind==='group'?{group:id}:kind==='channel'?{channel:id}:{employee:id}),path:a.path},false))}
    case 'channel.image': {const file=channelFileEndpoint({channelId:s(a.channelId),postId:a.postId,mediaId:a.mediaId});return {...workspaceFiles(file.root,'read-image',{path:file.path}),name:file.name}}
    case 'channel.export': return exportChannelPost(s(a.id))
    case 'channel.settings': {const settings=await channelRequest(req.cmd,a);await syncChannelIngress().catch(()=>{});return {...settings,runtime:channelIngressStatus()}}
    case 'messenger.media-info':return mediaInfo(s(a.id))
    case 'messenger.media-read':return readMedia(s(a.id),Number(a.offset))
    case 'messenger.media-close':return closeMedia(s(a.id))
    case 'messenger.forward':return forwardMessages(a,(cmd,args)=>handleRequest({cmd,args}))
    case 'messenger.forward-status':return forwardStatus(a)
    case 'messenger.profile':case 'messenger.profile-image':case 'messenger.directory':case 'messenger.social':case 'messenger.forward-draft':case 'messenger.gallery':case 'messenger.reference':case 'messenger.state':case 'messenger.reorder':case 'messenger.folder-save':case 'messenger.folder-delete':case 'messenger.conversation':case 'messenger.message':case 'messenger.draft':case 'messenger.search':return messengerRequest(req.cmd,a)
    case 'system.info': return {...runtimeInfo(),clientId:requestContext().clientId}
    case 'system.directories': {
      const directory=realpathSync(a.path?resolve(s(a.path)):homedir())
      if(!statSync(directory).isDirectory())throw Error('请选择后端主机上的文件夹')
      const {readdirSync}=await import('node:fs')
      return {path:directory,parent:dirname(directory),entries:readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&!entry.name.startsWith('.')).map(entry=>({name:entry.name,path:resolve(directory,entry.name)})).sort((x,y)=>x.name.localeCompare(y.name))}
    }
    case 'messenger.upload-begin': {const to=await attachmentDirectory(s(a.conversation)),end=fileEndpoint(to,true);if(to.conversation)end.referencePrefix=WORKSPACE_FILE_PREFIX.slice(0,-1);const upload=await beginUpload(to,end,s(a.name),Number(a.bytes),!!to.conversation);return {...upload,path:to.conversation?WORKSPACE_FILE_PREFIX+upload.name:to.path+'/'+upload.name}}
    case 'transfer.download-save': {let path=a.path,overwrite=a.overwrite===true;if(path===undefined){const source=fileEndpoint(a.from,false),selected=await askRenderer('save-file',{name:source.name??basename(s(a.from?.path))}) as {path:string|null};path=selected.path;overwrite=true;if(!path)return {saved:false}}return saveDownload(fileEndpoint(a.from,false),s(path),overwrite)}
    case 'transfer.upload-begin': return beginUpload(a.to,fileEndpoint(a.to,true),s(a.name),Number(a.bytes))
    case 'transfer.upload-chunk': return uploadChunk(s(a.id),Number(a.offset),s(a.data))
    case 'transfer.upload-commit': return commitUpload(s(a.id))
    case 'transfer.upload-abort': return abortUpload(s(a.id))
    case 'transfer.download-info': return downloadInfo(fileEndpoint(a.from,false))
    case 'transfer.download-chunk': return downloadChunk(fileEndpoint(a.from,false),Number(a.offset),a.modifiedAt)

    case 'auth.whoami': return callerIdentity()
    case 'auth.agent-token': return agentCredential(s(a.id))
    case 'auth.revoke': {const result=revokeAgentCredential(s(a.id));clearManagementInteraction(s(a.id));pruneManagementActivity();revokeInvalidDelegations();reconcileSchedules();reconcileConversationNotices();publishEvent('access:changed',{});return result}
    case 'workflow.prepare':case 'workflow.fork':case 'workflow.export':case 'workflow.start':case 'workflow.list':case 'workflow.get':case 'workflow.events':case 'workflow.respond':case 'workflow.resume':case 'workflow.pause':case 'workflow.amend':case 'workflow.cancel':case 'workflow.file':return workflowRequest(req.cmd,a)
    case 'contract.info':case 'contract.describe':case 'contract.call':case 'contract.engines':case 'infra.api':
      return contractRequest(req.cmd,a,(cmd,args)=>handleRequest({cmd,args}))
    case 'api.list': {
      for(const [key,max] of [['prefix',120],['search',200]] as const)if(a[key]!==undefined&&(typeof a[key]!=='string'||a[key].length>max))throw Error('Invalid API '+key)
      if(Object.keys(a).some(key=>!['all','prefix','search'].includes(key)))throw Error('Unknown API discovery field')
      return allowedCommands(requestContext(),readStore(),a.all).filter(command=>(!a.prefix||command.name.startsWith(a.prefix))&&(!a.search||[command.name,command.summary,command.gui].join(' ').toLowerCase().includes(a.search.toLowerCase())))
    }
    case 'api.describe': {const command=allowedCommands(requestContext(),readStore(),a.all).find(value=>value.name===a.command);if(!command)throw Error('API not available to this caller');return command}
    case 'api.docs': return apiDocumentation(requestContext(),readStore(),a.document)
    case 'avatar.list': return listAvatars(a)
    case 'office.layout': return officeLayout(a.team,a.viewId)
    case 'session.acknowledge': return acknowledgeReply(s(a.employee??employeeId(a.id)),a.replyId)
    case 'management.team': return setManagerTeam(a.clear===true?null:a.team)
    case 'management.topology': return managementTopology(a.team,a.creator,a.teamsOnly)
    case 'connector.get':return getConnector(s(a.manager),s(a.employee))
    case 'connector.set':return setConnector(s(a.manager),s(a.employee),a.source,a.target,false,a.route)
    case 'connector.segment':return moveConnectorSegment(s(a.manager),s(a.employee),Number(a.index),Number(a.x),Number(a.y))
    case 'connector.reset':return setConnector(s(a.manager),s(a.employee),undefined,undefined,true)
    case 'management.activity': return managementActivity(a.team)
    case 'management.roles': return managementRoles()
    case 'management.relayout': return relayoutManagement(s(a.team))
    case 'management.request': return requestManagement(s(a.employee),a.manager)
    case 'management.decide': return decideManagement(s(a.id),s(a.decision))
    case 'management.bind': return bindManagement(a)
    case 'management.unbind': return unbindManagement(a)
    case 'management.global': if(typeof a.enabled!=='boolean')throw Error('enabled must be boolean');return setGlobalManager(s(a.id),a.enabled)
    case 'card.initialize': return retryEmployeeInitialization(s(a.id),{model:a.model,effort:a.effort})
    case 'card.management-role': return setManagementRole(s(a.id),a.role)
    case 'card.access-mode': {const card=readStore().sessions.find(c=>c.id===a.id);if(card&&(card.threadId||card.claudeSessionId)&&card.accessMode!==a.mode)throw Error('Execution isolation is fixed once native history exists; create a new employee');if(!['trusted','isolated'].includes(a.mode))throw Error('Use trusted or isolated');await closeForNativeChange(s(a.id));return updateStore(store=>{const card=store.sessions.find(c=>c.id===a.id);if(!card)throw Error('Unknown employee');card.accessMode=a.mode})}
    case 'card.profile': return employeeProfile(a)
    case 'session.status': {const cards=a.employee?readStore().sessions.filter(c=>c.id===a.employee):visibleEmployees();return cards.map(card=>{const live=listLive().find(item=>sessionInfo(item.id)?.cardId===card.id),state=live?sessionInfo(live.id):undefined;return {...publicEmployee(card),lastReply:card.lastReply,sessionId:live?.id,busy:state?.busy??false,acknowledging:state?.acknowledging??false,currentTask:state?.currentTask,activityPreview:state?.activityPreview,waitingApproval:live?approvalsFor(live.id).length>0:false}})}
    case 'shared.info': return {path:sharedDirectory()}
    case 'transfer.start': return startTransfer(a.from,a.to,fileEndpoint(a.from,false),fileEndpoint(a.to,true))
    case 'transfer.list': return listTransfers()
    case 'transfer.get': return getTransfer(s(a.id))
    case 'transfer.cancel': return cancelTransfer(s(a.id))
    case 'view.shared': return setView({...getView(),shared:!!a.enabled})
    case 'host.fingerprints': return (await cloudHostFingerprints(s(a.id))).map(({line,...key})=>key)
    case 'host.trust': {assertHostIdle(s(a.id));return handleRequest({cmd:'host.update',args:{id:a.id,patch:{knownHosts:await trustCloudHostFingerprint(s(a.id),s(a.fingerprint))}}})}
    case 'host.terminal-open': return openHostTerminal(s(a.id),a.directory,a.cols,a.rows)
    case 'host.terminal-list': return hostTerminals(s(a.id))
    case 'host.terminal-read': {const output=await waitTerminalOutput(requireHostTerminal(s(a.id),s(a.terminal)),Number(a.cursor??0),Number(a.waitMs??0),requestContext().signal);authorize(req.cmd,a);return output}
    case 'host.terminal-input': return inputTerminal(requireHostTerminal(s(a.id),s(a.terminal)),s(a.data??''))
    case 'host.terminal-resize': return resizeTerminal(requireHostTerminal(s(a.id),s(a.terminal)),Number(a.cols),Number(a.rows))
    case 'host.terminal-close': return closeTerminal(requireHostTerminal(s(a.id),s(a.terminal)))
    case 'host.desktop-list': getCloudHost(s(a.id));return listHostDesktops(s(a.id))
    case 'host.desktop-open': return connectHostDesktop(s(a.id))
    case 'host.desktop-launch': return launchHostDesktop(s(a.id),s(a.session))
    case 'host.desktop-close': return closeHostDesktop(s(a.id),s(a.session))
    case 'host.exec': return executeRemote(cloudHostTarget(s(a.id),a.directory),s(a.command),a.timeout===undefined?120:Number(a.timeout))
    case 'host.list': {
      if(a.credentials&&!isGlobal(requestContext().principal)&&!isSupervisor(callerEmployee()?.managementRole))throw Error('Forbidden: host credentials')
      return queryCloudHosts(a).map(host=>{
        const allowed=canReadHostCredentials(host.id)
        if(a.credentials&&allowed)return {...host,credentials:cloudHostCredentials(host.id)}
        return allowed&&!a.summary?host:cloudHostSummary(host)
      })
    }
    case 'host.get': return getCloudHost(s(a.id))
    case 'host.credentials': return cloudHostCredentials(s(a.id),a.files!==false)
    case 'host.create': {const host=createCloudHost(a);writeStore(readStore());publishEvent('hosts:changed',{});return host}
    case 'host.update': {
      assertHostIdle(s(a.id))
      const store=readStore(),teams=store.groups.filter(name=>teamSettings(store,name).hostId===a.id)
      const candidate=validateCloudHostPatch(s(a.id),a.patch??{})
      if(store.sessions.some(card=>card.kind==='cloud-native-worker'&&teams.includes(card.group))){
        const previous=getCloudHost(s(a.id))
        if(['host','os','port','identityFile','sshConfig','jump'].some(key=>JSON.stringify((previous as any)[key]??null)!==JSON.stringify((candidate as any)[key]??null)))throw new Error('Cloud Native Worker 正在使用此主机；不能把原生会话改绑到另一台主机')
      }
      for(const name of teams)remoteTarget({...candidate,directory:teamSettings(store,name).remote?.directory})
      for(const card of store.sessions.filter(c=>teams.includes(c.group)&&employeeSettings(store,c).mode==='cloud'))await closeForWorkspaceChange(card.id)
      const host=updateCloudHost(s(a.id),a.patch??{})
      for(const name of teams)closeRemote(teamConnectionId(name))
      writeStore(readStore());publishEvent('hosts:changed',{});return host
    }
    case 'host.remove': {
      const store=readStore(),teams=store.groups.filter(name=>teamSettings(store,name).hostId===a.id)
      if(teams.length)throw new Error('云主机仍被 Team 绑定：'+teams.join('、'))
      assertHostIdle(s(a.id));await closeHostTerminals(s(a.id))
      const result=removeCloudHost(s(a.id));closeRemote('host-'+s(a.id));publishEvent('hosts:changed',{});return result
    }
    case 'host.check': {
      const id=s(a.id),status=await checkCloudHost(id)
      publishEvent('host:health',{id,status});return status
    }
    case 'host.directories': {
      const target=cloudHostTarget(s(a.id),a.path),result=await remoteFiles('host-'+s(a.id),target,'list',{path:'.'})
      return {path:result.root,entries:result.entries.filter((entry:any)=>entry.directory)}
    }

    case 'schedule.schema': case 'schedule.status': case 'schedule.list': case 'schedule.get': case 'schedule.create':
    case 'schedule.update': case 'schedule.pause': case 'schedule.resume': case 'schedule.delete':
    case 'schedule.preview': case 'schedule.run': case 'schedule.history': case 'schedule.cancel': case 'schedule.trigger':
      return scheduleRequest(req.cmd.slice('schedule.'.length), a)
    case 'plan.schema':case 'plan.query':case 'plan.calendar':case 'plan.timeline':case 'plan.analytics':case 'plan.feed':case 'plan.views':case 'plan.view-create':case 'plan.view-update':case 'plan.view-delete':return planRequest(req.cmd.slice(5),a)
    case 'settings.get': return getPreferences()
    case 'settings.set': return setPreferences(a) // Includes pageZoom and pane sizes; usable without a desktop.

    case 'view.list': return {views:APP_VIEWS,current:getView(),company:teamViewList(),shared:{employees:'session.list',conversations:'session.transcript',inbox:'session.inbox',readReceipts:'session.acknowledge',groups:'chat.list',bindings:'management.topology',schedules:'schedule.list',plans:'plan.query',planViews:'plan.views'}}
    case 'view.select': {
      const mode=appView(a.id);if(!mode)throw Error('Unknown application view')
      if(mode.id!=='company'&&a.teamViewId!==undefined)throw Error('Only Company selects a Team subview')
      if(mode.id==='company'&&a.teamViewId!==undefined&&!teamViewList().views.some(item=>item.id===a.teamViewId))throw Error('Unknown Company subview')
      await beforeViewChange()
      if(mode.id==='company')selectTeamView(a.teamViewId??'all')
      if(mode.id==='messages'){
        const saved={...getMessagesView(),shared:getView().shared}
        try{
          if(saved.employee&&!projectEngineResult('session.list',{},readStore()).sessions.some((card:StoredSession)=>card.id===saved.employee&&!card.deleting&&employeeReady(card)))return setView({kind:'messages'})
          if(saved.chatId)getChatGroup(saved.chatId)
          if(saved.sourceId)saved.channelId=socialIdentity('source:'+saved.sourceId).channelId
          if(saved.channelId)getChannel(saved.channelId)
          return setView(saved)
        }catch{return setView({kind:'messages'})}
      }
      return setView({kind:mode.kind})
    }
    case 'view.load-engine': {
      const engine=requireInstalledEngine(a.engineId)
      await beforeViewChange()
      return loadEngineView(engine.id)
    }
    case 'view.launcher': {
      await beforeViewChange()
      return setView({kind:'home',layer:'launcher',engineId:undefined,shared:false})
    }
    case 'view.layer': {
      if(!['engine','infra'].includes(a.layer))throw Error('Choose engine or infra')
      if(a.engineId===null){await beforeViewChange();return setView({kind:'home',layer:'launcher',engineId:undefined,shared:false})}
      const engine=requireInstalledEngine(a.engineId??getView().engineId)
      await beforeViewChange()
      return setView(engine.id===getView().engineId?{...getView(),layer:a.layer}:{kind:'home',layer:a.layer,engineId:engine.id,shared:false})
    }
    case 'view.get': return getView()
    case 'view.open': {
      const kind=a.kind as ViewState['kind'],store=readStore()
      if(!['home','team','employee','workspace','conversation','initialization','settings','plugin','clone','messages','plan'].includes(kind))throw new Error('Unknown view kind')
      if(a.planViewId!==undefined&&(kind!=='plan'||!((await planRequest('views',{})) as Array<{id:string}>).some((view:any)=>view.id===a.planViewId)))throw Error('Unknown Plan view')
      if([a.employee,a.chatId,a.channelId].filter(value=>value!==undefined).length>1)throw Error('Choose one conversation')
      if(a.chatId!==undefined){if(kind!=='messages')throw Error('Group conversations belong to Messages');getChatGroup(a.chatId)}
      if(a.sourceId!==undefined){if(kind!=='messages'||a.employee!==undefined||a.chatId!==undefined)throw Error('Social elements belong to Messages');const source=socialIdentity('source:'+a.sourceId);if(a.channelId!==undefined&&a.channelId!==source.channelId)throw Error('Social element belongs to another channel');a.channelId=source.channelId}
      if(a.channelId!==undefined){if(kind!=='messages')throw Error('News channels belong to Messages');getChannel(a.channelId)}
      if((kind==='workspace'||(kind==='team'&&a.name))&&!store.groups.includes(a.name))throw new Error('Unknown Team')
      if((kind==='conversation'||kind==='clone'||a.employee)&&!store.sessions.some(c=>c.id===a.employee))throw new Error('Unknown employee')
      if(a.employee&&kind!=='initialization'&&!(kind==='employee'&&store.sessions.find(card=>card.id===a.employee)?.initialization?.status==='failed'))assertEmployeeReady(s(a.employee))
      const pluginId=a.pluginId??((kind==='settings'||kind==='employee'||kind==='clone')?getView().pluginId:undefined)
      if(kind==='plugin'||pluginId)requirePlugin(s(pluginId))
      if(kind==='conversation'&&pluginId){const card=store.sessions.find(c=>c.id===a.employee)!;if(teamSettings(store,card.group).pluginId!==pluginId)throw new Error('员工不属于当前插件')}
      await beforeViewChange()
      if(kind==='plugin'){await openPluginWindow(s(pluginId),pluginWorkspace({id:pluginId}));return setView({kind:'home',pluginId})}
      const previous=getView()
      const returnTo=!['home','messages','plugin','plan'].includes(kind)?(previous.kind==='plan'?{kind:'plan' as const,planViewId:previous.planViewId}:previous.kind==='messages'?{kind:'messages' as const,employee:previous.employee,...(previous.chatId?{chatId:previous.chatId}:{}),...(previous.channelId?{channelId:previous.channelId,...(previous.sourceId?{sourceId:previous.sourceId}:{})}:{})}:previous.returnTo):undefined
      return setView({kind,name:a.name,employee:a.employee,chatId:a.chatId,channelId:a.channelId,sourceId:a.sourceId,planViewId:a.planViewId,settings:a.settings,pluginId,details:!!a.details,shared:previous.shared,returnTo})
    }
    case 'view.close': {
      await beforeViewChange()
      const view=getView(),back=view.returnTo
      if(back?.kind==='plan')return setView({kind:'plan',planViewId:back.planViewId})
      if(back){let channelId:string|undefined;if(back.channelId){try{channelId=getChannel(back.channelId).id}catch{}};return setView({kind:'messages',employee:readStore().sessions.some(card=>card.id===back.employee&&!card.deleting)?back.employee:undefined,...(back.chatId&&listChatGroups().some(group=>group.id===back.chatId)?{chatId:back.chatId}:{}),...(channelId?{channelId,...(back.sourceId?{sourceId:back.sourceId}:{})}:{})})}
      if(view.kind==='messages'&&(view.employee||view.chatId||view.channelId))return setView({kind:'messages'})
      return setView({kind:'home',pluginId:view.pluginId})
    }
    case 'view.tools': {
      const view=getView();if(!['conversation','messages'].includes(view.kind)||!view.employee)throw new Error('Open a conversation first')
      if(a.section&&!['skills','mcp','account','usage','config','export','background'].includes(a.section))throw new Error('Unknown engine section')
      await beforeViewChange();return setView({...view,tools:a.section||undefined})
    }
    case 'view.details': {
      await beforeViewChange()
      const view=getView()
      if(!['conversation','messages'].includes(view.kind)||!view.employee)throw new Error('Open a conversation first')
      return setView({...view,details:!!a.enabled})
    }
    case 'assets.naming':
      return assetNaming(a,async(ids)=>{if(listTransfers().some(job=>['queued','running'].includes(job.state)))throw Error('Finish active file transfers before migrating directories');for(const live of listLive()){const info=sessionInfo(live.id);if(info&&ids.includes(info.cardId!)&&info.busy)throw Error('员工正在工作，请等待空闲再迁移目录')}for(const id of ids)await closeForWorkspaceChange(id)},async(mount,operation,args)=>{const end=fileEndpoint({...mount.scope,path:'.'},false);if(!end.remote)throw Error('Expected a remote workspace');return remoteFiles('asset-naming-'+mount.id,end.remote,operation,args)})
    case 'assets.info':return assetInfo(s(a.id),(cmd,args)=>handleRequest({cmd,args}),fileEndpoint)
    case 'assets.preview':return assetPreview(s(a.id),(cmd,args)=>handleRequest({cmd,args}),fileEndpoint)
    case 'assets.browse':case 'assets.tree':case 'assets.children':case 'assets.search':case 'assets.locate':case 'assets.file':
      if(req.cmd==='assets.file'){const ref=assetReference(s(a.id),a.path);a.id=ref.asset;a.path=ref.path}
      if(req.cmd==='assets.file'&&String(a.id).startsWith('published:')&&!(String(a.id).startsWith('published:channel:')&&a.operation==='list')){if(!['list','read','image','info','chunk'].includes(a.operation))throw Error('Published attachments are read-only; copy them to a workspace to edit');const end=fileEndpoint(assetLocation(s(a.id),s(a.path||'.')),false),op=({image:'read-image',info:'copy-info',chunk:'copy-read'} as Record<string,string>)[a.operation]??a.operation;return workspaceFiles(end.root,op,{path:end.path,offset:a.offset??0,length:262144,hidden:a.hidden})}
      if(req.cmd==='assets.file'&&['info','chunk'].includes(a.operation)){const end=fileEndpoint(assetLocation(s(a.id),s(a.path||'.')),false),op=a.operation==='info'?'copy-info':'copy-read',args={path:end.path,offset:a.offset??0,length:262144};await end.validate?.(op,args);return end.remote?remoteFiles('assets-file-'+a.id,end.remote,op,args):workspaceFiles(end.root,op,args)}
      return assetRequest(req.cmd,a,(cmd,args)=>handleRequest({cmd,args}),async(ref,args)=>{const end=fileEndpoint(ref,false);if(!end.remote)throw Error('Remote inventory requires a remote workspace');return remoteFiles('asset-index-'+String(ref.team??ref.employee),end.remote,'inventory',args)})
    case 'workspace.reveal': return revealWorkspaceFile(fileEndpoint(a.from,false))
    case 'workspace.suggest': {
      const store=readStore(),config=teamSettings(store,s(a.team))
      if(a.workEnvironment==='local'&&config.mode==='cloud')return {path:employeeRoot(store,{group:s(a.team),workEnvironment:'local'})}
      if(a.mode==='cloud'||(!a.mode&&config.mode==='cloud')){const remote=remoteTarget(a.remote??config.remote);if(!remote)throw new Error('请在云主机 Team 中填写远端工作目录');return {path:remote.directory}}
      if(!a.mode&&store.groups.includes(a.team)&&store.teamRoots?.[a.team])return {path:store.teamRoots[a.team]}
      return {path:!a.mode&&config.directoryMode==='bind'?store.teamRoots?.[a.team]:managedTeamRoot(s(a.team||'workspace'),a.mode?{mode:a.mode,pluginId:a.pluginId}:config)}
    }
    case 'workspace.choose':
      return askRenderer('choose-folder',{path:a.path})
    case 'remote.check': {
      const employee=a.employee?readStore().sessions.find(c=>c.id===a.employee):undefined
      if(a.employee&&!employee)throw new Error('Unknown employee')
      return checkRemote(employee?executionEmployee(readStore(),employee).remote:a.team?teamSettings(readStore(),a.team).remote:a.remote)
    }
    case 'terminal.open': {
      const store=readStore(),card=store.sessions.find(c=>c.id===a.employee)
      if(!card)throw new Error('Unknown employee')
      assertTeamAvailable(card.group);assertNotRemoving(card.id)
      employeeWorkspace(store,card.group,card.cwd,card.id)
      return openTerminal(executionEmployee(store,card),Number(a.cols??100),Number(a.rows??24))
    }
    case 'terminal.list': return listTerminals(a.employee).filter(terminal=>canReadEmployee(requestContext().principal,terminal.employee))
    case 'terminal.read': return readTerminal(s(a.id),Number(a.cursor??0))
    case 'terminal.input': return inputTerminal(s(a.id),s(a.data??''))
    case 'terminal.resize': return resizeTerminal(s(a.id),Number(a.cols),Number(a.rows))
    case 'terminal.close': return closeTerminal(s(a.id))
    case 'workspace.image':case 'workspace.list':case 'workspace.read':case 'workspace.write':case 'workspace.mkdir':case 'workspace.move':case 'workspace.trash':case 'workspace.restore': {
      if(a.shared){if(a.team||a.employee)throw Error('共享文件夹不能同时指定 Team 或员工');return workspaceFiles(sharedDirectory(),req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)}
      const store=readStore(),saved=a.employee?store.sessions.find(c=>c.id===a.employee):undefined,card=saved?executionEmployee(store,saved):undefined
      if(card?.remote){if(a.team&&a.team!==card.group)throw new Error('员工不属于这个 Team');return remoteFiles(card.id,card.remote,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)}
      if(!a.employee&&a.team&&teamSettings(store,a.team).mode==='cloud')return remoteFiles(teamConnectionId(a.team),teamSettings(store,a.team).remote!,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)
      return workspaceFiles(workspaceContext(a).root,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)
    }
    case 'plugin.list':
      return listPlugins()
    case 'plugin.describe': {
      const plugin=requirePlugin(s(a.id))
      return {...plugin,api:JSON.parse(readFileSync(pluginFile(plugin.directory,plugin.schema),'utf8')),documentation:readFileSync(pluginFile(plugin.directory,plugin.documentation),'utf8')}
    }
    case 'plugin.install': {
      const plugin=installPlugin(s(a.path))
      const store=readStore(),workspaces=Object.entries(store.teamRoots??{}).filter(([name])=>teamSettings(store,name).pluginId===plugin.id).map(([name,root])=>{try{provisionWorkspace(root,teamSettings(store,name));return {root,ok:true}}catch(error){return {root,ok:false,error:String(error)}}})
      writeStore(store);return {plugin,workspaces}
    }
    case 'workspace.docs':
      {const context=workspaceContext(a);return a.employee?ensureEmployeeBootstrap(context.store.sessions.find(c=>c.id===a.employee)!,context.store):context.settings.mode==='cloud'?{mode:'cloud',workspace:context.root,teamRoot:context.teamRoot,documentation:apiDocumentation().catalogRoot}:provisionWorkspace(context.root,context.settings,context.teamRoot)}
    case 'plugin.call':
      return callPlugin(s(a.id),pluginWorkspace(a),s(a.method),a.params??{},a.raw===true)
    case 'plugin.open': {
      await beforeViewChange()
      const window=await openPluginWindow(s(a.id),pluginWorkspace(a))
      setView({kind:'home',pluginId:s(a.id)})
      return window
    }
    case 'plugin.windows': return pluginWindows()
    case 'plugin.place': return placePluginWindow(s(a.id),a.bounds??{})
    case 'plugin.mode': return modePluginWindow(s(a.id),a.mode)
    case 'plugin.dismiss': return dismissPluginWindow(s(a.id))
    case 'plugin.view':
      {const root=pluginWorkspace(a);if(a.team||a.employee||a.workspace){const context=workspaceContext(a);provisionWorkspace(root,context.settings,context.teamRoot)}return openPluginView(s(a.id),root)}
    case 'plugin.close':
      return pluginWindows().some(window=>window.id===a.viewId)?dismissPluginWindow(s(a.viewId)):closePluginView(s(a.viewId))
    case 'status':
      return {
        running: true,
        home: APP_HOME,
        teamRoots: readStore().teamRoots ?? {},
        live: listLive().length,
        stored: readStore().sessions.length
      }

    case 'session.list': {
      if(a.live){const store=readStore();return listLive().map(s=>sessionSnapshot(s.id,!!a.summary,store))}
      const store=readStore()
      return {...store,sessions:store.sessions.map(c=>workspaceStatus(store,c))}
    }

    case 'session.inbox': {
      const {transcriptPreview}=await import('./transcripts')
      return visibleEmployees().map(card=>{
        try{return {...transcriptPreview(card),employeeId:card.id,unread:!!card.lastReply&&!card.lastReply.readAt}}
        catch{return {employeeId:card.id,text:'',role:null,updatedAt:null,hasMessages:false,unread:!!card.lastReply&&!card.lastReply.readAt,error:'History unavailable'}}
      })
    }
    case 'session.new': return startSession(a as StartArgs)

    case 'session.open': {
      return startSession({ cardId: s(a.cardId),delegation:delegationFor(s(a.cardId)) })
    }

    case 'session.activity': return sessionSnapshot(s(a.id)).activityPreview??null
    case 'session.snapshot': return sessionSnapshot(s(a.id))
    case 'approval.list':
      return approvalsFor(s(a.id))
    case 'approval.respond':
      if (!['allow', 'deny'].includes(a.decision)) throw new Error('Decision must be allow or deny')
      return { answered: answerApproval(s(a.id), s(a.requestId), a.decision === 'allow',a.answers,a.form) }
    case 'session.search': {
      const q = s(a.query ?? '').toLowerCase()
      return readStore().sessions.filter((card) =>
        [card.title, card.group, card.engine, card.cwd,card.remote?.directory,card.remote?.host].some((v) => v?.toLowerCase().includes(q)))
    }

    case 'external.open': return openExternalUrl(s(a.url))
    case 'session.steer': return {sent:await steerMessage(s(a.id),s(a.text),a.sourceView)}
    case 'session.background': return backgroundProcesses(s(a.id))
    case 'session.background-stop': return backgroundProcesses(s(a.id),a.processId,true)
    case 'session.review': {
      const modes=[a.base,a.commit,a.instructions].filter(v=>v!==undefined);if(modes.length>1)throw new Error('Choose only one review target')
      if(sessionInfo(s(a.id))?.engine!=='codex')throw new Error('Claude 审查请使用其命令列表中的 code-review 或 review')
      const suffix=a.base?' --base '+s(a.base):a.commit?' --commit '+s(a.commit):a.instructions?' '+s(a.instructions):''
      return {sent:await sendMessage(s(a.id),'/review'+suffix)}
    }
    case 'session.enqueue': return enqueueMessage(s(a.id),s(a.text??''),a.images,a.delegation,a.viewId,undefined,a.replyTo,a.replyQuote,a.crossReply,a.files,privateSend,a.sourceView)
    case 'session.queue': return queuedMessages(s(a.id))
    case 'session.dequeue': return removeQueuedMessage(s(a.id),s(a.messageId))
    case 'session.export': {
      const id=s(a.id),card=readStore().sessions.find(c=>c.id===id)??readStore().sessions.find(c=>c.id===sessionSnapshot(id).cardId)!;const format=s(a.format??'markdown');if(!['markdown','json'].includes(format))throw new Error('Use markdown|json')
      const items=transcriptItems(id),content=format==='json'?JSON.stringify(items,null,2):renderTranscript(items)
      if(a.path){const employee=executionEmployee(readStore(),card);const args={path:s(a.path),content,create:true};return employee.remote?remoteFiles(card.id,employee.remote,'write',args):workspaceFiles(employeeWorkspace(readStore(),card.group,card.cwd,card.id),'write',args)}
      return {format,content}
    }
    case 'session.send': {const sent=await sendMessage(s(a.id),s(a.text??''),undefined,a.images,a.delegation,a.viewId,undefined,a.replyTo,a.replyQuote,a.crossReply,a.files,privateSend,a.sourceView);return {sent,messageId:sessionInfo(s(a.id))?.currentTask?.messageId}}

    case 'session.transcript': {
      const allItems=transcriptItems(s(a.id)),items=a.limit?allItems.slice(-Math.max(1,Math.min(1000,Number(a.limit)))):allItems
      // Thinking is hidden by default; `--thinking` includes it, matching
      // expanding the thinking block in the GUI.
      const shown = a.thinking
        ? items
        : items.map((it: any) =>
            it.role === 'assistant'
              ? { ...it, blocks: it.blocks.filter((b: any) => b.kind !== 'thinking') }
              : it
          )
      return { text: renderTranscript(shown), items, shown }
    }

    case 'session.info': {
      const info = sessionInfo(s(a.id))
      if (!info){const card=readStore().sessions.find(c=>c.id===a.id);if(card)return {...publicEmployee(card),lastReply:card.lastReply,busy:false,sessionId:null};throw new Error(`unknown session ${s(a.id)}`)}
      const card=readStore().sessions.find(card=>card.id===info.cardId)
      return {...info,...(card?employeeAppearance(card):{})}
    }

    case 'session.interrupt': {
      const task=sessionInfo(s(a.id))?.currentTask
      if(a.expectedMessageId&&task?.messageId!==a.expectedMessageId)throw Error('Current message changed; interruption rejected')
      if(task?.runId)await scheduleRequest('cancel',{id:task.runId})
      else await interrupt(s(a.id))
      return {interrupted:true}
    }

    case 'session.close': {
      const closed = await closeSession(s(a.id))
      return { closed }
    }

    case 'config.engine':
      throw new Error('员工引擎创建后固定；如需使用其他引擎，请删除员工后重新添加')
    case 'config.model':
      return { ok: await setModel(s(a.id), a.model ? s(a.model) : undefined) }
    case 'config.remote-admin':
      if(typeof a.enabled!=='boolean')throw new Error('enabled 必须为布尔值')
      return {ok:await setRemoteAdmin(s(a.id),a.enabled)}
    case 'config.permission':
      return { ok: await setPermissionMode(s(a.id), a.mode as PermissionMode) }
    case 'config.plan':
      if(typeof a.enabled!=='boolean')throw new Error('enabled must be boolean')
      return {ok:await setPlanMode(s(a.id),a.enabled)}
    case 'config.fast':
      if(typeof a.enabled!=='boolean')throw new Error('enabled must be boolean')
      return {ok:await setFastMode(s(a.id),a.enabled)}
    case 'config.thinking':
      return { ok: await setThinking(s(a.id), a.enabled === true || a.enabled === 'on') }
    case 'config.effort':
      // 'default' (or omitting the value) clears the override, matching the
      // "Default" entry in the GUI's effort dropdown.
      return {
        ok: await setEffort(
          s(a.id),
          !a.effort || a.effort === 'default' ? null : (a.effort as EffortLevel)
        )
      }

    // ---- UI inspection: what is actually on screen ----
    case 'ui.view':
    case 'ui.dom':
    case 'ui.text':
      return askRenderer(req.cmd.split('.')[1], {
        selector: a.selector,
        timeout: a.timeout
      })

    case 'ui.style':
      return askRenderer('style', { selector: s(a.selector) })
    case 'ui.screenshot':
      return askRenderer('screenshot', { path: s(a.path),privacy:a.privacy===true })
    case 'ui.drag':
      return askRenderer('drag',a)
    case 'ui.wheel':
      return askRenderer('wheel',a)

    case 'ui.click':
      await askRenderer('click', { selector: s(a.selector) })
      // Give React a beat to re-render before the caller reads the UI.
      await new Promise((r) => setTimeout(r, 400))
      return askRenderer('snapshot')

    case 'ui.type':
      await askRenderer('type', { selector: s(a.selector), value: s(a.value) })
      return askRenderer('snapshot')

    case 'ui.wait':
      return askRenderer('wait', { selector: s(a.selector), timeout: a.timeout ?? 5000 })

    case 'commands.run': {
      const text=s(a.text);if(!text.startsWith('/'))throw new Error('Command must start with /')
      return {sent:await sendMessage(s(a.id),text)}
    }
    case 'commands.list': {
      const all = sessionCommands(s(a.id))
      const f = String(a.filter ?? '').toLowerCase()
      const hidden = new Set(sessionInfo(s(a.id))?.terminalCommands ?? [])
      return all
        .filter((c) => (a.all ? true : !hidden.has(c.name)))
        .filter(
          (c) =>
            !f ||
            c.name.toLowerCase().includes(f) ||
            (c.description ?? '').toLowerCase().includes(f)
        )
    }

    // What Tab/Enter would insert when the menu is open.
    case 'commands.complete': {
      const name = s(a.name).replace(/^\//, '')
      const all = sessionCommands(s(a.id))
      const hit = all.find((c) => c.name === name || c.aliases?.includes(name))
      if (!hit) throw new Error(`no such command '/${name}'`)
      const hint = hit.argumentHint ? ' ' : ''
      return { completion: `/${hit.name}${hint}`, command: hit }
    }

    case 'group.list':
      {const store=readStore();return a.details?store.groups.map(name=>({name,root:store.teamRoots?.[name],...teamSettings(store,name)})):store.groups}
    case 'team-view.list': return teamViewList()
    case 'team-view.create': return createTeamView(s(a.name),a.teams??[])
    case 'team-view.update': return updateTeamView(s(a.id),a.patch??{})
    case 'team-view.remove': return removeTeamView(s(a.id))
    case 'team-view.select': return selectTeamView(s(a.id))
    case 'group.add': {
      const name=s(a.name??'').trim();if(!name)throw new Error('Team 名称不能为空')
      if(readStore().groups.includes(name))throw Error('Team 已存在；名称可修改，工作目录创建后不可更换')
      assertTeamAvailable(name)
      const config=validateTeamSettings({mode:a.mode??(a.hostId?'cloud':'build'),pluginId:a.pluginId,directoryMode:a.directoryMode,hostId:a.hostId,directory:a.directory,remote:a.remote})
      const os=config.remote?.os??(process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux')
      if(a.os!==undefined&&a.os!==os||a.distribution!==undefined&&a.distribution!==config.remote?.distribution)throw Error('目标操作系统与实际 Team 主机不符；先用 host list --summary 按 os/distribution 选择已登记主机，不要用 Team 名称代替主机绑定')
      if(config.mode==='cloud'){
        const create=a.directoryMode==='default'
        if(create&&(a.directory||a.remote?.directory))throw Error('默认生成远端 Team 目录时不要传 remote-dir；绑定已有目录请使用 directory-mode bind')
        if(create&&(name==='.'||name==='..'||/[\\/\0]/.test(name)))throw Error('Team 名称不能包含路径分隔符或使用 . / ..')
        const directory=(await remoteFiles(teamConnectionId(name),config.remote!,'directory',{path:create?directoryName(name,'team'):'.',...(create?{create:true,exclusive:true}:{})})).path
        config.directory=directory;config.remote={...config.remote!,directory}
        closeRemote(teamConnectionId(name))
      }
      return addGroup(name,config.mode==='cloud'?config.remote!.directory:a.root,config)
    }
    case 'group.configure': {
      const store=readStore();if(!store.groups.includes(a.name))throw new Error('Unknown Team')
      if(store.teamRoots?.[s(a.name)])throw new Error('Team 工作方式和工作目录创建后不可更换')
      const previous=teamSettings(store,s(a.name)),config=validateTeamSettings({mode:a.mode,pluginId:a.pluginId,directoryMode:a.directoryMode,hostId:a.mode==='cloud'?a.hostId??previous.hostId:undefined,directory:a.directory??(a.hostId&&a.hostId!==previous.hostId?undefined:previous.remote?.directory),remote:a.mode==='cloud'?a.remote??previous.remote:a.remote})
      const members=store.sessions.filter(card=>card.group===a.name)
      if(members.length&&(config.mode!==previous.mode||config.pluginId!==previous.pluginId))throw new Error('已有员工的 Team 不能切换工作区类型；请创建新的 Team')
      if(members.some(card=>card.kind==='cloud-native-worker')&&(config.mode!=='cloud'||config.hostId!==previous.hostId||config.remote?.directory!==previous.remote?.directory))throw new Error('Cloud Native Worker 的主机和 Team 根目录不能通过普通配置更换')
      if(config.mode==='cloud'&&JSON.stringify(config.remote)!==JSON.stringify(previous.remote)){
        config.remote={...config.remote!,directory:(await remoteFiles(teamConnectionId(a.name),config.remote!,'directory',{path:'.'})).path}
        for(const card of members.filter(card=>employeeSettings(store,card).mode==='cloud'))await remoteFiles(teamConnectionId(a.name),config.remote,'directory',{path:cloudRelative(previous,card.cwd)})
        for(const card of members.filter(card=>employeeSettings(store,card).mode==='cloud'))await closeForWorkspaceChange(card.id)
      }
      assertTeamAvailable(a.name)
      const next=configureTeam(s(a.name),config,a.root),root=next.teamRoots![a.name]
      if(previous.mode==='cloud'&&config.mode!=='cloud')closeRemote(teamConnectionId(a.name))
      if(config.mode!=='cloud')await releaseWorkspacePlugins(root)
      return next
    }
    case 'group.root': case 'group.migrate': {
      const store=readStore(),config=teamSettings(store,s(a.name))
      if(store.teamRoots?.[s(a.name)])throw new Error('Team 工作目录创建后不可更换')
      if(config.mode==='cloud')throw new Error('云主机目录请通过 group configure 更新，不会在本地迁移')
      if(config.mode==='work'&&req.cmd==='group.root')throw new Error('Work Team 使用插件固定工作目录，不能手动绑定 Team 文件夹')
      if(req.cmd==='group.root'&&a.directoryMode==='bind'){
        const root=chooseTeamRoot(s(a.name),{...config,directoryMode:'bind'},a.root)
        const next={...store,teamRoots:{...store.teamRoots,[a.name]:root}}
        for(const card of store.sessions.filter(c=>c.group===a.name))employeeWorkspace(next,card.group,card.cwd,card.id,'preview')
        if(config.mode==='work'&&store.teamRoots?.[a.name]!==root)for(const card of store.sessions.filter(c=>c.group===a.name))await closeForWorkspaceChange(card.id)
        assertTeamAvailable(a.name)
        return bindTeamRoot(s(a.name),root)
      }
      const root=managedTeamRoot(s(a.name),config,a.root)
      if(store.teamRoots?.[s(a.name)]!==root) for(const card of store.sessions.filter(c=>c.group===a.name)) await closeForWorkspaceChange(card.id)
      if(store.teamRoots?.[s(a.name)]!==root&&store.teamRoots?.[s(a.name)])await releaseWorkspacePlugins(store.teamRoots[s(a.name)])
      assertTeamAvailable(a.name)
      return setTeamRoot(s(a.name),root,!!a.create)
    }
    case 'group.rename': {
      const old=s(a.name),next=String(a.nextName??'').trim(),store=renameGroup(old,next)
      if(old!==next){
        closeRemote(teamConnectionId(old))
        for(const card of store.sessions.filter(value=>value.group===next))provisionEmployee(card.cwd,employeeRoot(store,card)!,employeeSettings(store,card))
        const view=getView();if(view.name===old)setView({...view,name:next})
      }
      return store
    }
    case 'group.remove': {
      const names=a.names as string[],locked:string[]=[]
      if(names.some(name=>!readStore().groups.includes(name)))throw new Error('Unknown Team')
      await beforeViewChange()
      try {
        for(const name of names){beginTeamRemoval(name);locked.push(name)}
        const ids=readStore().sessions.filter(card=>names.includes(card.group)).map(card=>card.id)
        await removeEmployees(ids,a.deleteWorkspace===true,names)
        for(const name of names)closeRemote(teamConnectionId(name))
        const store=removeGroup(names),view=getView()
        if(view.name&&names.includes(view.name))setView({kind:'home'})
        return store
      }finally{for(const name of locked)endTeamRemoval(name)}
    }

    // Room placement: the floor layout is state like any other, so the CLI can
    // set it and tests can assert on it.
    case 'room.place': {
      const layout = {
        col: Number(a.col ?? 0),
        row: Number(a.row ?? 0),
        w: Number(a.w ?? 1),
        h: Number(a.h ?? 1)
      }
      return setRoom(s(a.name), layout)
    }
    case 'room.design':
      return designRoom(s(a.name ?? ''), a.design ?? {})
    case 'room.bounds':
      return setBounds(s(a.name),a.bounds ?? {})
    case 'room.layout': {
      const room=planOffice(readStore()).find(r=>r.name===a.name)
      if(!room)throw new Error('Unknown Team')
      return requestContext().principal.kind==='operator'?room:{...room,employees:room.employees.map(({card,position})=>({card:publicEmployee(card),position}))}
    }
    case 'card.place':
      if(a.snap!==undefined&&typeof a.snap!=='boolean')throw new Error('snap must be boolean')
      if(a.zoom!==undefined&&(!Number.isFinite(a.zoom)||a.zoom<.08||a.zoom>3))throw new Error('Invalid canvas zoom')
      return placeEmployee(s(a.id),{x:Number(a.x),y:Number(a.y)},{snap:a.snap,zoom:a.zoom})
    case 'canvas.view':
      return canvasViewport(readStore(),a.viewId)
    case 'canvas.set':
      return setViewport({x:Number(a.x),y:Number(a.y),zoom:Number(a.zoom)},a.viewId)
    case 'card.clone': return cloneEmployee(s(a.id),{title:s(a.title),cwd:a.cwd,directoryMode:a.directoryMode})
    case 'card.native-bind': {
      const sessionId=s(a.sessionId)
      const bindable=()=>{const card=readStore().sessions.find(value=>value.id===a.id&&!value.deleting)
        if(!card||card.kind!=='cloud-native-worker')throw Error('只有 Cloud Native Worker 可以绑定远端原生会话')
        if(!canBindNativeSession(card)||transcriptItems(card.id).length)throw Error('员工已有会话，不能覆盖；请新建员工绑定另一条会话')
        if(nativeSessionRefs(card).some(ref=>ref.id===sessionId&&ref.ownership!=='external'))throw Error('不能把本员工拥有的原生会话重新标记为外部会话')
        return card
      }
      const card=bindable(),{origin}=cloudNativeTarget(card)
      await checkCloudNative(card.group,card.engine,cloudRelative(teamSettings(readStore(),card.group),card.cwd))
      if(readStore().sessions.some(other=>other.id!==card.id&&nativeSessionRefs(other).some(ref=>ref.engine===card.engine&&ref.id===sessionId&&JSON.stringify(ref.origin??null)===JSON.stringify(origin))))throw Error('此远端原生会话已属于另一名员工')
      const items=await readCloudNativeSession(card,sessionId)
      bindable();await closeForNativeChange(card.id)
      const current=bindable()
      if(JSON.stringify(cloudNativeTarget(current).origin)!==JSON.stringify(origin))throw Error('云主机身份已变化，请重新读取原生会话')
      if(readStore().sessions.some(other=>other.id!==card.id&&nativeSessionRefs(other).some(ref=>ref.engine===card.engine&&ref.id===sessionId&&JSON.stringify(ref.origin??null)===JSON.stringify(origin))))throw Error('此远端原生会话已属于另一名员工')
      seedTranscript(card.id,items)
      try{
        const store=patchSession(card.id,{nativeSessions:nativeSessionRefs(current),...(card.engine==='codex'?{threadId:sessionId}:{claudeSessionId:sessionId}),nativeOwnership:'external',initialization:pendingInitialization()})
        queueEmployeeInitialization(card.id)
        return {card:store.sessions.find(value=>value.id===card.id),imported:items.length}
      }catch(error){deleteTranscript(card.id);throw error}
    }
    case 'card.create': {
      if(a.thinking!==undefined&&typeof a.thinking!=='boolean')throw Error('thinking must be a boolean; CLI uses --thinking on|off')
      if(a.accessMode!==undefined&&!['trusted','isolated'].includes(a.accessMode))throw Error('Invalid process access mode')
      if(a.managementRole!==undefined&&!isManagementRole(a.managementRole))throw Error('Invalid management role')
      const kind=a.kind??'worker'
      assertManagementKind({kind,managementRole:a.managementRole??'employee'})
      if(!['worker','cloud-native-worker'].includes(kind))throw new Error('Only Local or Cloud Native Worker employees are supported')
      if(a.chatProvider!==undefined||a.chatMode!==undefined||a.chromeProfile!==undefined)throw new Error('Web chat employees are no longer supported')
      if(a.permissionMode!==undefined&&!['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'].includes(a.permissionMode))throw Error('Invalid engine permission mode')
      const engine = a.engine ?? 'codex'
      if (!isEngine(engine)) throw new Error('Unknown engine')
      let model=a.model||defaultEmployeeModel(engine,kind)
      if (!String(a.title ?? '').trim()) throw new Error('Employee name is required')
      const avatar=resolveAvatar(a),appearance=employeeFields({...a,...(avatar!==undefined?{avatar}:{}),role:professionValue(a)})
      const store=readStore(),identity={group:s(a.group??''),workEnvironment:a.workEnvironment},config=employeeSettings(store,identity)
      assertEngineWorkspace(engine,config.mode,kind)
      if(a.workEnvironment!==undefined&&!['team','local'].includes(a.workEnvironment))throw Error('工作环境必须为 team 或 local')
      if(a.workEnvironment==='local'&&(kind==='cloud-native-worker'||config.mode==='work'))throw Error('该员工必须使用 Team 工作环境')
      assertManagementKind({kind,managementRole:a.managementRole??'employee'},false,config.mode==='cloud')
      if(!store.groups.includes(a.group))throw new Error('Unknown Team')
      if(a.remote!==undefined)throw new Error('云主机连接由 Team 统一配置，请创建或选择 cloud Team')
      if(kind==='cloud-native-worker'){
        if(config.mode!=='cloud'||!config.hostId)throw new Error('Cloud Native Worker 只能加入已绑定主机的 Cloud Team')
        await checkCloudNative(s(a.group),engine)
        if(!a.model)model=(await engineModels(engine,kind,a.group)).defaultModel
        await resolveEmployeeWorkspace(store,s(a.group),s(a.title),a.cwd,a.directoryMode,undefined,true)
      }
      if(!isGlobal(requestContext().principal)&&config.mode==='build'&&a.cwd){const candidate=resolve(employeeRoot(store,identity)!,a.cwd);if(!inside(employeeRoot(store,identity)!,candidate))throw Error('Manager-created workspace must stay inside its Team')}
      const cwd=await resolveEmployeeWorkspace(store,s(a.group??''),s(a.title),a.cwd,a.directoryMode,undefined,false,a.workEnvironment)
      assertTeamAvailable(a.group)
      const latest=readStore();if(!latest.groups.includes(a.group)||JSON.stringify(employeeSettings(latest,identity))!==JSON.stringify(config))throw new Error('Team 已删除或配置已变更，请重新创建员工')
      const id = newSessionId()
      const origin=kind==='cloud-native-worker'?{kind:'cloud' as const,hostId:config.hostId!,host:config.remote!.host,os:config.remote!.os,directory:cwd}:undefined
      authorize('card.create',a);
      const employee:StoredSession = { ...appearance,...creationAuthority(requestContext().principal),managementRole:isGlobal(requestContext().principal)?a.managementRole??'employee':'employee',accessMode:isGlobal(requestContext().principal)?a.accessMode??'trusted':callerEmployee()!.accessMode??'trusted',id, title: s(a.title).trim(), engine,kind,workEnvironment:a.workEnvironment,directoryMode:a.directoryMode??(a.cwd?'bind':'default'),localWorkspaceRoot:a.workEnvironment==='local'&&teamSettings(store,a.group).mode==='cloud'?employeeRoot(store,identity):undefined,nativeOrigin:origin,cwd, group: a.group ?? '', createdAt: Date.now(),
        model,
        thinking: a.thinking??false,effort: engine==='cline'||engine==='pi'?undefined:a.effort??(engine==='codex'?'high':'low'), permissionMode:a.permissionMode??getPreferences().defaultPermissionMode }
      employee.initialization=pendingInitialization()
      ensureEmployeeBootstrap(employee,latest)
      const saved=patchSession(id,employee)
      if(employee.initialization.status==='pending')queueEmployeeInitialization(id)
      return executionEmployee(saved,saved.sessions.find((c) => c.id === id)!)
    }
    case 'card.avatar': {
      const card=readStore().sessions.find(c=>c.id===a.id&&!c.deleting)
      if(!card)throw Error('Unknown employee')
      const avatar=resolveAvatar(a)
      if(!avatar)throw Error('Provide avatar or character with avatarStyle; discover choices with agents avatar list')
      assertNotRemoving(card.id)
      const saved=patchSession(card.id,{avatar,color:avatarDescription(avatar).color}).sessions.find(c=>c.id===card.id)!
      return {id:saved.id,...employeeAppearance(saved)}
    }
    case 'card.update': {
      const store=readStore(), card=store.sessions.find(c=>c.id===a.id)
      if(!card) throw new Error('Unknown employee')
      if(a.patch?.group!==undefined&&a.patch.group!==card.group)throw new Error('员工创建后不能更换 Team')
      if(a.patch?.cwd!==undefined&&a.patch.cwd!==card.cwd||a.patch?.directoryMode!==undefined)throw new Error('员工工作目录创建后不能更换')
      const prospective={...card,group:a.patch?.group??card.group};assertManagementKind(prospective,hasGlobalRole(store.access,prospective),employeeSettings(store,prospective).mode==='cloud')
      const patch={...a.patch};const avatar=resolveAvatar(patch);if(avatar!==undefined)patch.avatar=avatar;if(patch.profession!==undefined)patch.role=professionValue(patch)
      if(patch.workEnvironment!==undefined&&patch.workEnvironment!==(card.workEnvironment??'team'))throw Error('工作环境创建后固定；请创建新员工')
      if(patch.accessMode!==undefined)throw Error('Use card.access-mode')
      if(patch.kind!==undefined&&patch.kind!==(card.kind??'worker'))throw new Error('员工职位创建后不可更改')
      if(patch.chatProvider!==undefined||patch.chatMode!==undefined||patch.chromeProfile!==undefined)throw new Error('Web chat employees are no longer supported')
      employeeFields(patch,card)
      assertEngineWorkspace(patch.engine??card.engine,employeeSettings(store,card).mode)
      if(patch.remote!==undefined)throw new Error('云主机连接由 Team 统一配置，员工不能覆盖主机')
      if(card.kind==='cloud-native-worker'){
        cloudNativeTarget(card)
        if(patch.group!==undefined&&patch.group!==card.group)throw new Error('Cloud Native Worker 不能移动到另一 Team')
      }
      if(patch.group!==undefined || patch.cwd!==undefined || patch.directoryMode!==undefined) {
        const group=patch.group??card.group,input=patch.directoryMode==='default'?patch.cwd:patch.cwd??card.cwd
        const unchanged=group===card.group&&input===card.cwd&&patch.directoryMode!=='default'
        const cwd=unchanged?card.cwd:await resolveEmployeeWorkspace(store,group,patch.title??card.title,input,patch.directoryMode,card.id,true)
        if(cwd!==card.cwd||group!==card.group) await closeForWorkspaceChange(card.id)
        assertTeamAvailable(card.group);assertTeamAvailable(group)
        patch.cwd=unchanged?card.cwd:await resolveEmployeeWorkspace(readStore(),group,patch.title??card.title,input,patch.directoryMode,card.id)
      }
      authorize('card.update',a,card.id)
      const updated=updateEmployee(card.id,patch),next=updated.sessions.find(c=>c.id===card.id)!
      provisionEmployee(next.cwd,employeeRoot(updated,next)!,employeeSettings(updated,next))
      return updated
    }

    case 'session.rename': {
      const id=readStore().sessions.some(c=>c.id===a.id)?s(a.id):sessionSnapshot(s(a.id)).cardId
      if(!id)throw new Error('Unknown employee session')
      const updated=updateEmployee(id,{title:s(a.title)}),card=updated.sessions.find(value=>value.id===id)!
      provisionEmployee(card.cwd,employeeRoot(updated,card)!,employeeSettings(updated,card))
      return updated
    }
    case 'card.rename': {
      const id=s(a.cardId),updated=updateEmployee(id,{title:s(a.title)}),card=updated.sessions.find(value=>value.id===id)!
      provisionEmployee(card.cwd,employeeRoot(updated,card)!,employeeSettings(updated,card))
      return updated
    }
    case 'card.move': {
      const store=readStore(),card=store.sessions.find(c=>c.id===a.id)
      if(!card)throw new Error('Unknown employee')
      if(a.group!==card.group)throw new Error('员工创建后不能更换 Team')
      if(a.cwd!==undefined&&a.cwd!==card.cwd)throw new Error('员工工作目录创建后不能更换')
      assertManagementKind({...card,group:a.group},hasGlobalRole(store.access,{...card,group:a.group}),employeeSettings(store,{...card,group:a.group}).mode==='cloud')
      if(card.kind==='cloud-native-worker'&&a.group!==card.group)throw new Error('Cloud Native Worker 不能移动到另一 Team')
      const input=a.cwd??(card.group===a.group?card.cwd:undefined)
      const cwd=await resolveEmployeeWorkspace(store,s(a.group),card.title,input,a.cwd?'bind':undefined,card.id,true)
      if(cwd!==card.cwd||a.group!==card.group) await closeForWorkspaceChange(card.id)
      assertTeamAvailable(card.group);assertTeamAvailable(a.group)
      await resolveEmployeeWorkspace(readStore(),s(a.group),card.title,input,a.cwd?'bind':undefined,card.id)
      authorize('card.move',a,card.id)
      return moveSession(card.id,s(a.group),a.before?s(a.before):undefined,cwd)
    }
    case 'card.remove':
      for(const id of a.ids)assertTeamAvailable(readStore().sessions.find(card=>card.id===id)?.group)
      return removeEmployees(a.ids,a.deleteWorkspace===true)

    default:
      throw new Error(`unknown command: ${req.cmd}`)
  }
}

/** Both employee and Team deletion share this one native-cleanup transaction. */
async function removeEmployees(ids:string[],deleteWorkspace=false,teams:string[]=[]) {
  const wanted=new Set(ids),locked:string[]=[]
  try {
    const current=readStore()
    for(const id of wanted){
      if(!current.sessions.some(card=>card.id===id))throw new Error('Unknown employee')
      if(!/^[a-z0-9_-]+$/i.test(id))throw new Error('无效的员工 ID，未移除员工')
      authorize('card.remove',{id},id)
      beginEmployeeRemoval(id);locked.push(id)
    }
    const folders=new Map<string,{id:string;path:string}>(),scope={employees:wanted,teams:new Set(teams)}
    if(deleteWorkspace)for(const id of wanted){const folder=await removeEmployeeWorkspace(id,true,scope);folders.set(folder.key,{id,path:folder.path})}
    for(const id of wanted)authorize('card.remove',{id},id)
    updateStore(store=>{for(const card of store.sessions)if(wanted.has(card.id))card.deleting=true})
    for(const id of wanted){await cancelEmployeeInitialization(id);revokeAgentCredential(id);await closeEmployeeTerminals(id);closeRemote(id)}
    for(const live of listLive())if(wanted.has(sessionSnapshot(live.id).cardId!))await closeSession(live.id)
    const latest=readStore(),refs=latest.sessions.filter(card=>wanted.has(card.id)).flatMap(nativeRefsForRemoval)
    const others=latest.sessions.filter(card=>!wanted.has(card.id)).flatMap(nativeSessionRefs)
    if(refs.some(ref=>ref.ownership!=='external'&&others.some(other=>other.engine===ref.engine&&other.id===ref.id&&JSON.stringify(other.origin??null)===JSON.stringify(ref.origin??null))))throw new Error('原生会话仍被其他员工引用，未移除员工')
    await deleteNativeSessions(refs)
    // Delete each shared directory once, children before parents, after every native history is closed.
    for(const folder of [...folders.values()].sort((a,b)=>b.path.length-a.path.length))await removeEmployeeWorkspace(folder.id,false,scope)
    for(const id of wanted){deleteTranscript(id);removeAgentAccessData(id)}
    const store=removeSession([...wanted]),view=getView()
    if(view.employee&&wanted.has(view.employee))setView(view.kind==='messages'||view.returnTo?.kind==='messages'?{kind:'messages'}:view.pluginId?{kind:'plugin',pluginId:view.pluginId}:{kind:'home'})
    return store
  }finally{for(const id of locked)endEmployeeRemoval(id)}
}

function pluginWorkspace(args:Record<string,any>):string {
  if(!args.team&&!args.employee){
    const settings={mode:'work' as const,pluginId:String(args.id)}
    const defaultRoot=teamRoot(defaultPluginWorkspace(settings.pluginId),'preview',true)
    const isolatedRoot=managedTeamRoot('',settings)
    const selected=args.workspace?teamRoot(String(args.workspace),false,true):defaultRoot
    if(selected===defaultRoot||selected===isolatedRoot){
      // Keep the old direct-plugin folder in place. Legacy imports go to its
      // original default slot, never over the collection or an existing Team.
      const legacy=legacyPluginWorkspace(settings.pluginId)
      const imported=join(defaultRoot,'.agents-company','legacy-import.json')
      if(!existsSync(imported)&&!existsSync(isolatedRoot)&&existsSync(legacy)&&!inside(legacy,isolatedRoot)){
        mkdirSync(dirname(isolatedRoot),{recursive:true})
        const stage=isolatedRoot+'.import-'+process.pid
        try{cpSync(legacy,stage,{recursive:true,filter:file=>!file.startsWith(legacy+'/.agents-company')});renameSync(stage,isolatedRoot)}finally{rmSync(stage,{recursive:true,force:true})}
      }
      const root=teamRoot(selected,true,true)
      if(!existsSync(imported)){mkdirSync(dirname(imported),{recursive:true});writeFileSync(imported,JSON.stringify({version:1,completed:true})+'\n')}
      provisionWorkspace(root,settings);return root
    }
  }
  const context=workspaceContext(args)
  if(context.settings.mode!=='work'||context.settings.pluginId!==args.id)throw new Error('请使用绑定了此插件的 Work Team')
  return context.root
}

function workspaceContext(args:Record<string,any>) {
  const store=readStore(),roots=store.teamRoots??{}
  const employee=args.employee?store.sessions.find(c=>c.id===args.employee):undefined
  if(args.employee&&!employee)throw new Error('Unknown employee')
  const name=employee?.group??args.team??Object.entries(roots).find(([,root])=>args.workspace&&root===teamRoot(String(args.workspace),false,true))?.[0]
  if(!name||!roots[name])throw new Error('Choose a registered --team or --employee')
  if(employee&&args.team&&employee.group!==args.team)throw new Error('员工不属于这个 Team')
  const settings=employee?employeeSettings(store,employee):teamSettings(store,name),configured=employee?employeeRoot(store,employee)!:roots[name]
  if(settings.mode==='cloud')return {name,store,teamRoot:configured,root:employee?employee.cwd:configured,settings}
  if(employee?.workEnvironment==='local')return {name,store,teamRoot:configured,root:employeeWorkspace(store,name,employee.cwd,employee.id),settings}
  const root=teamRoot(configured,false,settings.mode==='work')
  if(root!==configured)throw new Error('Team 根目录已被移动或替换，请重新绑定目录')
  return {name,store,teamRoot:root,root:employee?employeeWorkspace(store,name,employee.cwd,employee.id):root,settings}
}

async function attachmentDirectory(conversation:string):Promise<FileLocation>{
  if(!/^(employee|group|channel):[a-zA-Z0-9_-]+$/.test(conversation))throw Error('Choose a valid conversation')
  if(!conversation.startsWith('employee:')){conversationFileEndpoint(conversation,'.',true);return {conversation,path:'.'}}
  const [kind,id]=conversation.split(':'),to:FileLocation={...(kind==='group'?{group:id}:{employee:id}),path:'.'},endpoint=fileEndpoint(to,true)
  const directory=(kind==='employee'?'.agents-attachments/':'')+randomUUID()
  const call=(operation:string,args:Record<string,unknown>)=>endpoint.remote?remoteFiles('attachment-'+id,endpoint.remote,operation,args):Promise.resolve(workspaceFiles(endpoint.root,operation,args))
  if(kind==='employee'&&!(await call('copy-info',{path:'.agents-attachments'})).exists){try{await call('mkdir',{path:'.agents-attachments'})}catch(error){if(!(await call('copy-info',{path:'.agents-attachments'})).directory)throw error}}
  await call('mkdir',{path:directory})
  return {...to,path:directory}
}
function fileEndpoint(ref:FileLocation,destination:boolean):FileEndpoint {
  if(ref?.asset){const mapped=assetLocation(ref.asset,ref.path),endpoint=fileEndpoint(mapped,destination),context=requestContext();return {...endpoint,validate:async(operation,args)=>withCaller(context,async()=>{const current=fileEndpoint(assetLocation(ref.asset!,ref.path),destination);if(current.root!==endpoint.root||JSON.stringify(current.remote)!==JSON.stringify(endpoint.remote))throw Error('Asset workspace changed during transfer');await endpoint.validate?.(operation,args);if(operation==='copy-commit')assetIndex.invalidate()})}}
  if(!ref||typeof ref.path!=='string'||[!!ref.shared,!!ref.team,!!ref.employee,!!ref.local,!!ref.group,!!ref.channel,!!ref.conversation].filter(Boolean).length!==1)throw Error('File location requires one shared/team/employee/local/group/channel scope and path')
  if(ref.conversation)return conversationFileEndpoint(ref.conversation,ref.path,destination)
  if((ref.group||ref.channel)&&ref.path.startsWith(WORKSPACE_FILE_PREFIX))return conversationFileEndpoint((ref.group?'group:'+ref.group:'channel:'+ref.channel),ref.path,destination)
  if(ref.channel){if(destination)throw Error('Channel files are read-only');if(requestContext().principal.kind!=='operator')throw Error('Only the user may download channel files');return channelFileEndpoint({channelId:ref.channel,path:ref.path})}
  if(ref.group){if(requestContext().principal.kind!=='operator')throw Error('Use chat.file for published group attachments');return {root:groupMediaRoot(ref.group),path:ref.path||'.'}}
  if(ref.shared)return {root:sharedDirectory(),path:ref.path||'.'}
  if(ref.local){
    if(!isAbsolute(ref.path))throw Error('本地路径必须为绝对路径')
    if(destination){const root=realpathSync(ref.path);if(!statSync(root).isDirectory())throw Error('目标必须是文件夹');return {root,path:'.'}}
    const file=resolve(ref.path);return {root:realpathSync(dirname(file)),path:basename(file)}
  }
  const context=workspaceContext(ref),root=context.settings.mode==='cloud'?cloudDirectory(context.settings,context.root):context.root
  const remote=context.settings.mode==='cloud'?{...context.settings.remote!,directory:root}:undefined
  return {root,path:ref.path||'.',remote}
}

async function closeForNativeChange(cardId:string):Promise<void> {
  assertEmployeeControl(cardId,undefined,true)
  for(const live of listLive()){const snapshot=sessionSnapshot(live.id);if(snapshot.cardId===cardId){if(snapshot.busy)throw new Error('员工正在工作，请先停止任务再调整执行隔离或绑定原生会话');await closeSession(live.id)}}
}

async function closeForWorkspaceChange(cardId: string): Promise<void> {
  assertEmployeeControl(cardId,undefined,true)
  for(const live of listLive()) {
    const state=sessionSnapshot(live.id)
    if(state.cardId!==cardId) continue
    if(state.busy) throw new Error('员工正在工作，请先停止任务再更改工作空间')
    await closeSession(live.id)
  }
  await closeEmployeeTerminals(cardId);closeRemote(cardId)
}

export function startServer(onListening: () => void = () => {}): void {
  initializeAccessChannel()
  if(process.platform!=='win32')mkdirSync(dirname(SOCKET_PATH), { recursive: true })

  server = createServer((sock) => {
    const cancellation=new AbortController()
    clients.add(sock)
    const drop = () => {
      cancellation.abort()
      followerActivity.get(sock)?.();followerActivity.delete(sock)
      clients.delete(sock)
      following.delete(sock)
      followerContexts.delete(sock)
      rawFollowers.delete(sock)
    }
    sock.on('close', drop)
    sock.on('error', drop)

    const rl = createInterface({ input: sock })
    rl.on('error', drop)
    rl.on('line', async (line) => {
      let req: Request
      try {
        req = JSON.parse(line)
      } catch {
        sock.write(JSON.stringify({ ok: false, error: 'malformed request' }) + '\n')
        return
      }

      let caller:RequestContext
      try{caller=authenticate(req.auth)}catch(error){sock.end(JSON.stringify({ok:false,error:(error as Error).message,...((error as {code?:string}).code?{code:(error as {code:string}).code}:{})})+'\n');return}
      // `follow` keeps the connection open and streams instead of replying.
      // `raw: true` forwards every engine event, not just the rendered text.
      if (req.cmd === 'session.follow') {
        let sessionId=String((req.args??{}).id??(req.args??{}).employee)
        const card=employeeId(sessionId)
        const found=listLive().find(item=>sessionInfo(item.id)?.cardId===card);if(found)sessionId=found.id
        try{caller=engineRequestContext(req,caller);withCaller(caller,()=>{authorize('session.follow',req.args,card,caller);guardEngineRequest('session.follow',req.args??{},card);assertEmployeeReady(card)})}catch(error){sock.end(JSON.stringify({ok:false,error:(error as Error).message,...((error as {code?:string}).code?{code:(error as {code:string}).code}:{})})+'\n');return}
        const info = sessionInfo(sessionId)
        if(info?.busy){followerActivity.get(sock)?.();followerActivity.set(sock,beginManagementInteraction(req.cmd,card,caller))}
        if (!info) {
          if(card){const items=transcriptItems(card);sock.write(JSON.stringify({ok:true,data:{following:card,transcript:items,text:renderTranscript(items)}})+'\n');sock.end(JSON.stringify({type:'done'})+'\n')}
          else sock.end(JSON.stringify({ ok: false, error: `unknown session ${sessionId}` }) + '\n')
          return
        }
        following.set(sock, sessionId);followerContexts.set(sock,caller)
        if ((req.args ?? {}).raw) rawFollowers.add(sock)
        sock.write(
          JSON.stringify({
            ok: true,
            data: { following: sessionId, transcript: transcriptItems(sessionId), text: renderTranscript(transcriptItems(sessionId)) }
          }) + '\n'
        )
        if (!info.busy) sock.end(JSON.stringify({ type: 'done' }) + '\n')
        return
      }

      let res: Response
      try {
        res = { ok: true, data: await handleRequest(req,{...caller,signal:cancellation.signal}) }
      } catch (err) {
        res = { ok: false, error: err instanceof Error ? err.message : String(err), ...((err as {code?:string})?.code?{code:(err as {code:string}).code}:{}) }
      }
      if (sock.writable) sock.write(JSON.stringify(res) + '\n')
    })
  })

  const listen = () => server!.listen(SOCKET_PATH, () => { if(process.platform!=='win32')chmodSync(SOCKET_PATH,0o600); ownsSocket = true; onListening() })
  server.on('error', (err) => { console.error('[socket]', err.message); process.exitCode = 1 })
  if (process.platform==='win32'||!existsSync(SOCKET_PATH)) { listen(); return }
  // Probe before removing a stale socket; never detach another running service.
  const probe = connect(SOCKET_PATH)
  probe.once('connect', () => {
    probe.destroy()
    console.error(`Aexus is already running at ${SOCKET_PATH}`)
    process.exit(1)
  })
  probe.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOENT') {
      console.error(err.message); process.exit(1)
    }
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    listen()
  })
}

export function stopServer(): void {
  try {
    server?.close()
    for (const client of clients) client.destroy()
    if (process.platform!=='win32'&&ownsSocket && existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
  } catch {
    // shutting down anyway
  }
  server = null
  ownsSocket = false
}
