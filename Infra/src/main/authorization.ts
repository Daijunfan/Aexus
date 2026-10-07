import {scopeAllows} from './engine-scope'
import {CHANNEL_POST_TRIGGER_APIS} from '../shared/message-collaboration'
import {validatePostTriggerDelegation} from './channel-post-triggers'
import {channelMemberIds} from './channel-members'
import {requireConversation} from './conversation-policy'
import {one as channelRow,liveChannelPost} from './channel-store'
import {validateScheduleChannels} from './scheduler/channel-policy'
import {EmployeeInitializationError} from './initialization-state'
import {credentialActive} from './agent-access'
import {requestContext,operatorContext,withCaller} from './request-context'
export {requestContext,operatorContext,withCaller} from './request-context'
import {COMMANDS} from '../shared/api-registry'
import {RETIRED_APIS} from '../shared/api-effects'
import {assertManagementKind,hasGlobalRole,type Delegation,type RequestContext,type PrincipalRef} from '../shared/management'
import {rolePolicy,roleAllows,isSupervisor,isManagementRole,roleDescription} from '../shared/roles'
import {employeeSettings,teamSettings,type StoredSession,type Store} from '../shared/types'
import {readStore} from './store'
import {employeeAppearance} from '../shared/avatars'
import {readApiDocument} from './api-documents'
import {catalog as chatCatalog,messages as chatMessages} from './chat-group-store'

export const isGlobal=(principal:PrincipalRef)=>{if(principal.kind==='operator')return true;const store=readStore();return hasGlobalRole(store.access,store.sessions.find(card=>card.id===principal.employeeId))}
/** Application administration preserves the Agent principal; it never impersonates the user. */
export function isAppAdministrator(principal=requestContext().principal){return principal.kind==='operator'||!!rolePolicy(callerEmployee(principal)?.managementRole).appAdministrator}
export function requireAppAdministrator(){if(!isAppAdministrator())throw Error('Only the user or a Secretary may administer the application')}
export function canReadHostCredentials(id:string,principal=requestContext().principal){
  if(isGlobal(principal))return true
  const caller=callerEmployee(principal)
  return caller?.managementRole==='manager'&&teamSettings(readStore(),caller.group).hostId===id
}
export function callerEmployee(principal=requestContext().principal){if(principal.kind!=='agent')return undefined;const card=readStore().sessions.find(c=>c.id===principal.employeeId&&!c.deleting);if(!card)throw Error('Agent identity revoked');return card}
/** Identity discovery is shared by CLI and the read-only native documentation tool. */
export function callerIdentity(context=requestContext(),store=readStore()){
  const principal=context.principal,card=principal.kind==='agent'?store.sessions.find(value=>value.id===principal.employeeId&&!value.deleting):undefined
  if(principal.kind==='agent'&&!card)throw Error('Agent identity revoked')
  const settings=card?teamSettings(store,card.group):undefined
  const policy=rolePolicy(card?.managementRole)
  return {principal,managementRole:card?.managementRole??'employee',roleDescription:roleDescription(card?.managementRole),appAdministrator:principal.kind==='operator'||!!policy.appAdministrator,team:card?.group,globalManager:principal.kind==='operator'||hasGlobalRole(store.access,card),managerTeam:null,globalByTeam:false,accessMode:card?.accessMode??'trusted',
    ...(card?{employee:{id:card.id,title:card.title,role:card.role,engine:card.engine,model:card.model,kind:card.kind??'worker',cwd:card.cwd,workEnvironment:card.workEnvironment??'team'},teamMode:settings!.mode,...(settings!.pluginId?{pluginId:settings!.pluginId}:{})}:{})}
}
let indexedRevision:number|undefined,indexed:{cards:Map<string,StoredSession>}|undefined
function managementIndex(){const store=readStore();if(!indexed||indexedRevision!==store.revision){indexedRevision=store.revision;indexed={cards:new Map(store.sessions.map(card=>[card.id,card]))}}return indexed}
export function canControl(principal:PrincipalRef,targetId:string){
  if(principal.kind==='operator')return true
  const index=managementIndex(),caller=index.cards.get(principal.employeeId),target=index.cards.get(targetId)
  if(!caller||caller.deleting||!target||target.deleting)return false
  const policy=rolePolicy(caller.managementRole)
  return policy.controls.includes(target.managementRole??'employee')&&(policy.scope==='global'||policy.scope==='team'&&caller.group===target.group)
}

/** Scheduling is strictly self or downward; general administration may still include peers. */
export function canSchedule(principal:PrincipalRef,targetId:string){
  if(principal.kind==='operator')return true
  const index=managementIndex(),caller=index.cards.get(principal.employeeId),target=index.cards.get(targetId)
  return !!caller&&!caller.deleting&&!!target&&!target.deleting&&(caller.id===target.id||rolePolicy(caller.managementRole).schedules.includes(target.managementRole??'employee')&&canControl(principal,targetId))
}

export function delegationFor(targetId:string,context=requestContext()):Delegation{
  authorize('session.send',{id:targetId},targetId,context)
  const globalGrantId=context.principal.kind==='agent'&&isGlobal(context.principal)?readStore().access?.globalGrants?.[context.principal.employeeId]:undefined
  return {requestedBy:context.principal,globalGrantId,requestId:context.requestId,credentialHash:context.credentialHash,...(typeof context.engineScope==='string'?{engineScope:context.engineScope}:{})}
}
export function validateDelegation(delegation:Delegation|undefined,targetId:string){
  if(!delegation)return // Old persisted user schedules retain operator ownership.
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  if(delegation.channelTrigger){validatePostTriggerDelegation(delegation,targetId);return}
  if(delegation.channelNotice){
    const notice=delegation.channelNotice,current=channelRow('SELECT admin_ids FROM channels WHERE id=?',notice.channelId),admins: string[]=current?channelMemberIds(notice.channelId):[],delivery=channelRow('SELECT kind,mode FROM channel_deliveries WHERE channel_id=? AND entry_id=? AND employee_id=?',notice.channelId,notice.entryId,targetId)
    if(notice.employeeId!==targetId||!admins.includes(targetId)||delivery?.mode!=='awareness'||!readStore().sessions.some(card=>card.id===targetId&&!card.deleting))throw Error('Channel notification is no longer authorized')
    if(delivery.kind==='news'){const post=liveChannelPost(notice.entryId);if(delegation.requestedBy.kind!=='operator'||post.channel_id!==notice.channelId)throw Error('News notification is no longer authorized')}
    else{authorize('channel.context',{},undefined,context);const message=channelRow('SELECT author FROM channel_messages WHERE channel_id=? AND id=?',notice.channelId,notice.entryId),author=message&&JSON.parse(message.author),sender=delegation.requestedBy;if(!author||author.kind!==sender.kind||sender.kind==='agent'&&(author.employeeId!==sender.employeeId||!admins.includes(sender.employeeId)))throw Error('Channel sender is no longer authorized')}
    return
  }
  if(delegation.groupNotice){
    authorize('chat.context',{},undefined,context)
    const notice=delegation.groupNotice,group=chatCatalog().groups.find(group=>group.id===notice.groupId),message=chatMessages(notice.groupId).find(message=>message.id===notice.messageId)
    const author=message?.author,sender=delegation.requestedBy
    if(notice.employeeId!==targetId||!group?.memberIds.includes(targetId)||!message?.deliveries.some(delivery=>delivery.employeeId===targetId&&delivery.mode==='awareness')||author?.kind!==sender.kind||sender.kind==='agent'&&(author?.kind!=='agent'||author.employeeId!==sender.employeeId||!group.memberIds.includes(sender.employeeId))||!readStore().sessions.some(card=>card.id===targetId&&!card.deleting))throw Error('Group notification is no longer authorized')
    return
  }
  if(delegation.schedule){
    authorize('schedule.create',{},targetId,context)
    validateScheduleChannels(targetId,delegation.schedule,delegation.requestedBy)
  }
  if(delegation.selfSchedule){
    if(delegation.requestedBy.kind!=='agent'||delegation.requestedBy.employeeId!==targetId)throw Error('Invalid self-schedule delegation')
    authorize('schedule.create',{},targetId,context)
  }else authorize('session.send',{id:targetId},targetId,context)
  if(delegation.globalGrantId&&(delegation.requestedBy.kind!=='agent'||readStore().access?.globalGrants?.[delegation.requestedBy.employeeId]!==delegation.globalGrantId))throw Error('Global delegation grant revoked')
}
/** Visual geometry has its own scope; it never grants task or filesystem control. */
export function canEditOffice(store:Store,principal:PrincipalRef,team:string,employeeId?:string){
  if(principal.kind==='operator')return true
  const caller=store.sessions.find(card=>card.id===principal.employeeId&&!card.deleting)
  if(!caller)return false
  const policy=rolePolicy(caller.managementRole)
  if(!roleAllows(caller.managementRole,'layout.write'))return false
  if(policy.scope==='global')return !employeeId||employeeId===caller.id||store.sessions.some(card=>card.id===employeeId&&!card.deleting&&policy.controls.includes(card.managementRole??'employee'))
  if(team!==caller.group||policy.scope!=='team')return false
  if(!employeeId||employeeId===caller.id)return true
  const target=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  return !!target&&target.group===caller.group&&policy.controls.includes(target.managementRole??'employee')
}
const USER_ONLY_APIS=new Set([...COMMANDS.filter(command=>(command.name.startsWith('messenger.')||command.name.startsWith('channel.')&&!CHANNEL_POST_TRIGGER_APIS.has(command.name)&&!['channel.list','channel.get','channel.context','channel.history','channel.timeline','channel.post','channel.image','channel.message-post','channel.publish','channel.media-put'].includes(command.name))).map(command=>command.name),'chat.edit','chat.acknowledge',"system.directories","engine.list","engine.check","engine.configure","engine.install-plan","engine.install","engine.install-status","engine.cancel-install","engine.login","engine.login-status","engine.cancel-login","transfer.upload-begin","transfer.upload-chunk","transfer.upload-commit","transfer.upload-abort","transfer.download-save","transfer.download-info","transfer.download-chunk",'auth.agent-token','auth.revoke','management.global','management.team','session.acknowledge','ui.click','ui.type','ui.drag','ui.wheel'])
const HUMAN_ONLY_APIS=new Set(['infra.scope','infra.bind','infra.unbind','workspace.reveal','assets.naming','assets.info','assets.preview','assets.browse','assets.tree','assets.children','assets.locate','assets.search','assets.file','channel.file-download','transfer.upload-begin','transfer.upload-chunk','transfer.upload-commit','transfer.upload-abort','transfer.download-save','transfer.download-info','transfer.download-chunk','auth.agent-token','auth.revoke','session.acknowledge','chat.acknowledge','channel.acknowledge','chat.edit','messenger.profile','messenger.profile-image','messenger.forward','messenger.forward-draft','messenger.forward-status','messenger.reference','messenger.media-open','messenger.media-info','messenger.media-read','messenger.media-close','ui.click','ui.type','ui.drag','ui.wheel'])
const humanOnly=(command:string)=>HUMAN_ONLY_APIS.has(command)||command.startsWith('messenger.upload-')
function authorizeAccess(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  const policy=COMMANDS.find(c=>c.name===command);if(!policy)throw Error('Unknown API command')
  const principal=context.principal
  if(principal.kind==='agent'&&context.credentialHash&&!credentialActive(principal.employeeId,context.credentialHash))throw Error('Agent credential revoked')
  const caller=callerEmployee(principal)
  if(caller){
    assertManagementKind(caller,isGlobal(principal),employeeSettings(readStore(),caller).mode==='cloud')
    if(caller.initialization&&caller.initialization.status!=='ready'){
      const reading=['card.profile','avatar.list','engine.capabilities','auth.whoami','api.list','api.describe','api.docs','management.roles','management.topology','host.list','plugin.list','plugin.describe','session.status','session.info'].includes(command)||['workspace.list','workspace.read'].includes(command)&&args.employee===caller.id
      if(!reading)throw new EmployeeInitializationError(caller.initialization.status==='failed')
    }
  }
  if(principal.kind==='operator')return
  if(['chat.update','chat.mute','chat.delete'].includes(command)){requireConversation('group:'+args.id,command==='chat.delete'?'owner':'admin',principal);return}
  const administrator=isAppAdministrator(principal)
  if(humanOnly(command)||!administrator&&(USER_ONLY_APIS.has(command)||command.startsWith('ui.')))throw Error('Only the user may call '+command)
  if(!roleAllows(caller!.managementRole,policy.permission))throw Error('Forbidden: '+command)
  assertRoleBoundaries(command,args,targetId,caller!)
  if(policy.permission==='schedule'&&targetId&&!canSchedule(principal,targetId))throw Error('Forbidden schedule target: choose yourself or a subordinate within your role scope')
  if(administrator)return
  if(command.startsWith('connector.')){
    if(isGlobal(principal)||args.manager===caller!.id&&canControl(principal,args.employee))return
    throw Error('Forbidden connector')
  }
  if(policy.permission==='layout.read'||policy.permission==='layout.write'){
    const store=readStore(),employeeId=command==='card.place'?String(args.id):undefined
    const team=command==='card.place'?store.sessions.find(card=>card.id===employeeId)?.group:['office.layout','management.relayout'].includes(command)?args.team:args.name
    if(policy.permission==='layout.read'){
      if(team!==undefined&&!store.groups.includes(team))throw Error('Unknown Team')
      if(isGlobal(principal)||isSupervisor(caller!.managementRole)&&(team===undefined||team===caller!.group))return
    }else if(typeof team==='string'&&store.groups.includes(team)&&canEditOffice(store,principal,team,employeeId))return
    throw Error('Forbidden layout: '+command)
  }
  if(isGlobal(principal)){
    if(targetId&&targetId!==caller!.id&&!canControl(principal,targetId))throw Error('Forbidden employee target')
    return
  }
  const deny=()=>{throw Error('Forbidden: '+command)}
  const own=targetId===caller!.id
  switch(policy.permission){
    case 'chat':case 'identity':case 'topology':return
    case 'host.read':if(canReadHostCredentials(String(args.id),principal))return;return deny()
    case 'relation':if(isSupervisor(caller!.managementRole))return;return deny()
    case 'employee.read':if(command==='session.list'||command==='session.inbox'||command==='session.status'&&!args.employee&&!args.id||own||targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.message':case 'employee.configure':if(targetId&&canControl(principal,targetId))return;return deny()
    case 'employee.create':if(args.group===caller!.group&&rolePolicy(caller!.managementRole).creates.includes(args.managementRole??'employee'))return;return deny()
    case 'employee.delete':if(targetId&&canDeleteEmployee(principal,targetId))return;return deny()
    case 'workspace':if(args.employee===caller!.id&&!args.team&&!args.shared)return;return deny()
    case 'plugin':if(command==='plugin.list'||command==='plugin.describe')return;if(args.employee===caller!.id&&!args.team&&!args.workspace)return;return deny()
    case 'schedule':if(!targetId||own||canControl(principal,targetId))return;return deny()
    default:return deny()
  }
}
export function authorize(command:string,args:Record<string,any>={},targetId?:string,context=requestContext()){
  authorizeAccess(command,args,targetId,context)
}
export function authorizeSlash(text:string,targetId:string,delegation:Delegation|undefined){
  if(!text.startsWith('/')||!delegation)return
  const name=text.trim().split(/\s/)[0].slice(1),commands:Record<string,string>={model:'config.model',effort:'config.effort',fast:'config.fast',plan:'config.plan',normal:'config.plan',permissions:'config.permission',fork:'card.clone',new:'card.native-bind',clear:'card.native-bind',help:'session.info',status:'session.info',skills:'engine.inspect',mcp:'engine.inspect',account:'engine.inspect',usage:'engine.inspect',stop:'session.background-stop',ps:'session.background'}
  const context={principal:delegation.requestedBy,requestId:delegation.requestId,credentialHash:delegation.credentialHash}
  if(!commands[name]&&!isGlobal(context.principal))throw Error('Manager messages cannot invoke unscoped slash commands')
  if(commands[name])authorize(commands[name],{id:targetId},targetId,context)
}
export function canReadEmployee(principal:PrincipalRef,id:string){return principal.kind==='operator'||principal.employeeId===id||canControl(principal,id)}
export function canDeleteEmployee(principal:PrincipalRef,id:string){
  if(principal.kind==='operator')return true
  const caller=managementIndex().cards.get(principal.employeeId),target=managementIndex().cards.get(id)
  return !!caller&&!!target&&!rolePolicy(target.managementRole).userManaged&&rolePolicy(caller.managementRole).removes.includes(target.managementRole??'employee')&&canControl(principal,id)
}

export function visibleEmployees(principal=requestContext().principal){return readStore().sessions.filter(card=>!card.deleting&&scopeAllows('employees',card.id)&&canReadEmployee(principal,card.id))}
export function publicEmployee(card:StoredSession){return {id:card.id,title:card.title,group:card.group,kind:card.kind??'worker',workEnvironment:card.workEnvironment??'team',engine:card.engine,...employeeAppearance(card),managementRole:card.managementRole??'employee',createdBy:card.createdBy??null,createdAt:card.createdAt,deleting:!!card.deleting,initialization:card.initialization}}
/** Full documentation discovery never changes execution authorization. */
export function allowedCommands(context=requestContext(),store=readStore(),all=false){
  if(typeof all!=='boolean')throw Error('all must be boolean')
  const principal=context.principal,card=principal.kind==='agent'?store.sessions.find(c=>c.id===principal.employeeId&&!c.deleting):undefined
  if(principal.kind==='agent'&&!card)return []
  if(all)return COMMANDS
  return COMMANDS.filter(command=>!Object.hasOwn(RETIRED_APIS,command.name)).filter(command=>principal.kind==='operator'||!humanOnly(command.name)&&(!!rolePolicy(card?.managementRole).appAdministrator||!USER_ONLY_APIS.has(command.name)&&!command.name.startsWith('ui.'))&&roleAllows(card?.managementRole,command.permission))
}
export function apiDocumentation(context=requestContext(),store=readStore(),document?:string){
  if(context.principal.kind==='agent'&&!store.sessions.some(card=>card.id===(context.principal as {employeeId:string}).employeeId&&!card.deleting))throw Error('Unknown employee for API documentation')
  return readApiDocument(document)
}

export function permissionDocumentation(_context:RequestContext,_store:Store){
  return readApiDocument('core/permissions').markdown
}

/** All lifecycle entrances share these boundaries, before side effects or global shortcuts. */
function assertRoleBoundaries(command:string,args:Record<string,any>,targetId:string|undefined,caller:StoredSession){
  const store=readStore(),policy=rolePolicy(caller.managementRole),target=store.sessions.find(card=>card.id===targetId)
  const deny=()=>{throw Error('Forbidden: Secretary 的任免仅允许用户；Governor 的任免需要用户或 Secretary')}
  if(command==='card.create'||command==='session.new'){
    const role=args.managementRole??'employee'
    if(!isManagementRole(role))throw Error('Invalid management role')
    if(rolePolicy(role).userManaged)deny()
    if(!policy.creates.includes(role))throw Error('Forbidden: cannot create this employee role')
  }
  if(command==='card.remove'&&target&&!canDeleteEmployee({kind:'agent',employeeId:caller.id},target.id))deny()
  if(command==='group.remove'&&store.sessions.some(card=>card.group===args.name&&!canDeleteEmployee({kind:'agent',employeeId:caller.id},card.id)))deny()
  if(command==='card.management-role'){
    if(!isManagementRole(args.role))throw Error('Invalid management role')
    if(rolePolicy(args.role).userManaged||target&&rolePolicy(target.managementRole).userManaged)deny()
    if(!policy.assigns.includes(args.role)||!target||!policy.assigns.includes(target.managementRole??'employee')||!canControl({kind:'agent',employeeId:caller.id},target.id))throw Error('Forbidden: cannot assign this employee role')
  }
}
