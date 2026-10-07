import {currentEngineScope,engineSelection,scopeAllows,scopeConversation,assertScope,bindEngineResources,RESOURCE_KINDS,type ResourceSet,type ResourceKind,projectEngineStore,scopeSchedule} from './engine-scope'
import {requestContext,withCaller} from './request-context'
import {installedEngines} from './contract'
import {readStore} from './store'
import {catalog} from './chat-group-store'
import {all,one} from './channel-store'
import {scheduleRequest} from './scheduler/service'

export function requireInstalledEngine(id:unknown){const engine=installedEngines().engines.find(engine=>engine.id===id);if(!engine)throw Object.assign(Error('Engine is unavailable. Refresh the library and choose an installed Engine.'),{code:'ENGINE_NOT_FOUND'});return engine}
export async function scopeRequest(command:string,args:Record<string,any>){
 if(requestContext().principal.kind!=='operator')throw Error('Only the user may manage Engine resource associations')
 const engine=requireInstalledEngine(args.engineId??currentEngineScope()),selected=currentEngineScope()
 if(typeof selected==='string'&&selected!==engine.id)throw Error('Load this Engine before changing its associations')
 if(command==='infra.scope'){
  if(Object.keys(args).some(k=>!['engineId','available'].includes(k)))throw Error('Unknown Engine scope field')
  const selection=engineSelection(engine.id)!
  const store=readStore(),resources={teams:selection.resources.teams,employees:store.sessions.filter(e=>selection.resources.employees.includes(e.id)).map(e=>({id:e.id,name:e.title,team:e.group})),groups:catalog().groups.filter(g=>selection.resources.groups.includes(g.id)).map(g=>({id:g.id,name:g.name})),channels:all('SELECT id,name FROM channels').filter(c=>selection.resources.channels.includes(c.id))}
  const schedules=await withCaller({...requestContext(),engineScope:engine.id},()=>scheduleRequest('list',{}))
  const result:any={engineId:engine.id,revision:selection.revision,resources:{...resources,schedules},explicit:selection.resources,sharedBySelection:true}
  if(args.available){
   result.available={teams:store.groups.map(name=>({id:name,name})),employees:store.sessions.filter(e=>!e.deleting).map(e=>({id:e.id,name:e.title,team:e.group})),groups:catalog().groups.map(g=>({id:g.id,name:g.name,memberIds:g.memberIds})),channels:all('SELECT id,name FROM channels'),schedules:await withCaller({...requestContext(),engineScope:undefined},()=>scheduleRequest('list',{})).then((items:any)=>items.map((j:any)=>({id:j.id,name:j.name,employeeId:j.action.employeeId})))}
  }
  return result
 }
 if(Object.keys(args).some(k=>!['engineId','resources','expectedRevision'].includes(k)))throw Error('Unknown Engine scope field')
 const resources=args.resources as Partial<ResourceSet>,store=readStore()
 if(!resources||typeof resources!=='object'||Array.isArray(resources))throw Error('Choose resources to associate')
 for(const [kind,ids] of Object.entries(resources)){
  if(!RESOURCE_KINDS.includes(kind as ResourceKind)||!Array.isArray(ids))throw Error('Unknown Engine resource kind')
  const known=kind==='teams'?store.groups:kind==='employees'?store.sessions.filter(e=>!e.deleting).map(e=>e.id):kind==='groups'?catalog().groups.map(g=>g.id):kind==='channels'?all('SELECT id FROM channels').map(c=>c.id):kind==='schedules'?(await withCaller({...requestContext(),engineScope:undefined},()=>scheduleRequest('list',{})) as any[]).map(j=>j.id):[]
  if(!known.length&&ids.length||ids.some(id=>!known.includes(id)))throw Error('A selected resource no longer exists. Reload the list.')
 }
 bindEngineResources(engine.id,resources,command==='infra.unbind',args.expectedRevision)
 return scopeRequest('infra.scope',{engineId:engine.id})
}
function checkConversation(value:unknown){
 if(typeof value!=='string')return
 if(value.startsWith('source:')){const row=one('SELECT channel_id FROM sources WHERE id=?',value.slice(7));if(!row)throw Error('Unknown social element');assertScope('channels',row.channel_id);return}
 if(!scopeConversation(value))throw Object.assign(Error('Conversation is outside the loaded Engine'),{code:'ENGINE_SCOPE_MISMATCH'})
}
function checkLocation(value:any){
 if(!value||typeof value!=='object')return
 if(value.employee)assertScope('employees',value.employee)
 if(value.team){assertScope('teams',value.team);const selected=engineSelection();if(selected&&!value.employee&&!selected.fullTeams.includes(value.team))throw Object.assign(Error('Only explicitly linked whole Teams expose their shared root. Use the linked employee workspace.'),{code:'ENGINE_SCOPE_MISMATCH'})}
 if(value.group)assertScope('groups',value.group)
 if(value.channel)assertScope('channels',value.channel)
 if(value.conversation)checkConversation(value.conversation)
 if(value.asset)checkAsset(value.asset)
 if(value.shared||value.local)throw Error('Global file locations are unavailable inside a scoped Engine; choose its employee or conversation workspace.')
}
function checkAsset(value:string){
 const root=value.split('|')[0]
 if(['root','company','messages','groups','channels','plan','plan:exports'].includes(root))return
 if(root.startsWith('employee:')||root.startsWith('group:')||root.startsWith('channel:'))checkConversation(root)
 else if(root.startsWith('team:'))checkLocation({team:decodeURIComponent(root.slice(5))})
 else if(root.startsWith('company:'))assertScope('teams',decodeURIComponent(root.slice(8)))
 else if(root.startsWith('published:group:'))assertScope('groups',root.slice(16))
 else if(root.startsWith('published:channel:'))assertScope('channels',root.slice(18))
 else if(!root.startsWith('cloud:')&&!root.startsWith('published-media:'))throw Error('This file workspace is not linked to the loaded Engine')
}
/** Restrict explicit targets before native startup or mutation. Real authorization is checked separately. */
export function guardEngineRequest(command:string,args:Record<string,any>,target?:string){
 const selection=engineSelection();if(!selection||command==='infra.scope'||command==='infra.bind'||command==='infra.unbind'||['contract.info','contract.describe','contract.engines','view.get','view.load-engine','view.launcher','settings.get','api.list','api.describe','api.docs','avatar.list','engine.list','engine.check','engine.capabilities','system.info','auth.whoami','infra.api'].includes(command))return
 if(selection.engineId===null){
  if(['session.list','session.inbox','session.status','group.list','chat.list','channel.list','messenger.directory','messenger.social','messenger.state','plan.query','plan.views','schedule.list','schedule.history','schedule.status','management.activity','management.topology','office.layout','team-view.list','workflow.list'].includes(command))return
  throw Object.assign(Error('Load an Engine before opening its workspace.'),{code:'ENGINE_NOT_LOADED'})
 }
 if(target)assertScope('employees',target)
 for(const key of ['employee','cardId','manager'])if(typeof args[key]==='string'&&args[key]!=='self')assertScope('employees',args[key])
 for(const id of command==='card.remove'?args.ids??[]:[])assertScope('employees',id)
 for(const key of ['team','group'])if(typeof args[key]==='string')assertScope('teams',args[key])
 if(command.startsWith('room.')||command.startsWith('group.')&&command!=='group.add'){
  if(args.name)assertScope('teams',args.name)
  for(const name of args.names??[])assertScope('teams',name)
 }
 for(const key of ['teams','addTeams'])for(const team of args[key]??[])assertScope('teams',team)
 if(args.patch?.teams)for(const team of args.patch.teams)assertScope('teams',team)
 if(command.startsWith('chat.')&&args.id)assertScope('groups',args.id)
 if(command.startsWith('channel.')&&typeof args.id==='string'){
  if(args.id.startsWith('nc_'))assertScope('channels',args.id)
  else if(args.id.startsWith('ns_')){const row=one('SELECT channel_id FROM sources WHERE id=?',args.id);if(row)assertScope('channels',row.channel_id)}
  else if(args.id.startsWith('np_')){const row=one('SELECT s.channel_id FROM posts p JOIN sources s ON s.id=p.source_id WHERE p.id=?',args.id);if(row)assertScope('channels',row.channel_id)}
  else if(args.id.startsWith('cm_')){const row=one('SELECT channel_id FROM channel_messages WHERE id=?',args.id);if(row)assertScope('channels',row.channel_id)}
 }
 if(args.chatId)assertScope('groups',args.chatId)
 if(args.channelId)assertScope('channels',args.channelId)
 if(args.sourceId){const source=one('SELECT channel_id FROM sources WHERE id=?',args.sourceId);if(source)assertScope('channels',source.channel_id)}
 for(const key of ['conversation','replyConversation'])if(args[key])checkConversation(args[key])
 for(const ref of args.conversations??[])checkConversation(ref)
 if(command.startsWith('messenger.'))for(const value of [args.from,args.to])if(typeof value==='string')checkConversation(value)
 for(const ref of args.messages??[])if(ref?.conversation)checkConversation(ref.conversation)
 for(const key of ['members','adminIds','memberIds'])for(const id of args[key]??args.patch?.[key]??[])assertScope('employees',id)
 for(const id of args.engine?.employeeIds??args.patch?.engine?.employeeIds??[])assertScope('employees',id)
 if(Array.isArray(args.mentions))for(const id of args.mentions)assertScope('employees',id)
 if(args.ownerId)assertScope('employees',args.ownerId)
 if(command.startsWith('workspace.'))checkLocation(args)
 if(command.startsWith('transfer.')||command==='workspace.reveal'){checkLocation(args.from);checkLocation(args.to)}
 if(command.startsWith('assets.')){if(args.id)checkAsset(args.id);if(args.root)checkAsset(args.root)}
 if(command.startsWith('workflow.')&&args.engineId&&args.engineId!==selection.engineId)throw Error('Workflow belongs to another Engine')
 if(command==='shared.info')throw Error('Choose a workspace belonging to the loaded Engine')
}
export function projectEngineResult(command:string,args:Record<string,any>,value:any):any{
 const selection=engineSelection();if(!selection||value===null||value===undefined)return value
 const {employees,teams,groups,channels,categories}=selection.resources
 if(value.sessions&&value.groups)return projectEngineStore(value)
 if(['session.status','session.inbox','session.search'].includes(command)&&Array.isArray(value))return value.filter(v=>employees.includes(v.employeeId??v.id??v.cardId))
 if(command==='session.list'&&Array.isArray(value))return value.filter(v=>employees.includes(v.cardId))
 if(command==='group.list'&&Array.isArray(value))return value.filter(v=>teams.includes(typeof v==='string'?v:v.name))
 if(command==='terminal.list'&&Array.isArray(value))return value.filter(v=>employees.includes(v.employee??v.cardId))
 if(command==='transfer.list'&&Array.isArray(value))return value.filter(v=>{try{checkLocation(v.from);checkLocation(v.to);return true}catch{return false}})
 if(command==='management.activity')return {...value,interactions:value.interactions?.filter((e:any)=>employees.includes(e.managerId??e.sourceId)&&employees.includes(e.employeeId??e.targetId))??[]}
 if(command==='management.topology')return {...value,nodes:value.nodes?.filter((e:any)=>employees.includes(e.id)),teams:value.teams?.filter((t:any)=>teams.includes(t.name)),edges:value.edges?.filter((e:any)=>employees.includes(e.managerId)&&employees.includes(e.employeeId))}
 if(command==='status')return {...value,sessions:Array.isArray(value.sessions)?value.sessions.filter((s:any)=>employees.includes(s.cardId)):value.sessions}
 if(value.version===1&&value.conversations&&value.messages&&value.drafts){
  const sourceIds=all('SELECT id,channel_id FROM sources').filter(s=>channels.includes(s.channel_id)).map(s=>s.id),refs=new Set([...employees.map(id=>'employee:'+id),...groups.map(id=>'group:'+id),...channels.map(id=>'channel:'+id),...sourceIds.map(id=>'source:'+id)]),filter=(entries:Record<string,any>,messages=false)=>Object.fromEntries(Object.entries(entries).filter(([key])=>refs.has(key)||messages&&[...refs].some(ref=>key.startsWith(ref+':')||key.startsWith(ref+'|'))))
  const folders=(value.folders??[]).filter((f:any)=>categories.includes(f.id)||!f.engineId&&f.conversations?.length>0&&f.conversations.every((ref:string)=>refs.has(ref))).map((f:any)=>({...f,conversations:f.conversations.filter((ref:string)=>refs.has(ref)),excluded:f.excluded?.filter((ref:string)=>refs.has(ref))})),folderIds=new Set(folders.map((f:any)=>f.id))
  return {...value,conversations:filter(value.conversations),messages:filter(value.messages,true),drafts:filter(value.drafts),folders,orders:Object.fromEntries(Object.entries(value.orders??{}).filter(([key])=>['all','categories','favorites','archive'].includes(key)||folderIds.has(key)).map(([key,ids])=>[key,(ids as string[]).filter(id=>key==='categories'?folderIds.has(id):refs.has(id))])),pendingForward:value.pendingForward?.messages?.every((m:any)=>refs.has(m.conversation))&&(!value.pendingForward.to||refs.has(value.pendingForward.to))?value.pendingForward:undefined}
 }
 return value
}
