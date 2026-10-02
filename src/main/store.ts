import {isEngine} from '../shared/engines'
import {clientStore,setClientView} from './client-state'
import {resolveTeamView} from '../shared/team-views'
import {rerouteTeamConnections} from '../shared/connector'
import {reconcileOfficeLayout} from '../shared/office-layout'
import {hasGlobalRole,managementRelations,assertManagementKind,emptyAccess} from '../shared/management'
import {cloudHostTarget,importCloudHost} from './cloud-hosts'
import {remoteTarget} from '../shared/remote'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs'
import { join,relative,dirname } from 'node:path'
import {DEFAULT_PREFERENCES,THEMES,LANGUAGES,SIDEBAR_MIN,SIDEBAR_MAX,normalizedSidebarWidth,mergePreferences,PRESENTATION_VIEWS,type Preferences,type PreferencesPatch} from '../shared/preferences'
import { homedir } from 'node:os'
import {randomUUID} from 'node:crypto'

// The app's own record of which sessions it created, what they are called and
// which group they sit in. Kept separate from anything the engines persist, so
// sessions started in an editor never show up here.

const ROOT = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
const FILE = join(ROOT, 'sessions.json')

export type { Engine, StoredSession, Store, RoomLayout } from '../shared/types'
import {ALL_TEAM_VIEW,teamSettings,employeeSettings,nativeSessionRefs,type TeamSettings,type RoomLayout,type Store,type StoredSession,type TeamView} from '../shared/types'
import { requirePlugin } from './plugins/registry'
import { AVATARS, ACCESSORIES, DESKS, ROOM_THEMES, WALLS, ROOM_PATTERNS, roomDesign, type RoomDesign } from '../shared/office'
import { employeeRoot,employeeWorkspace, teamRoot,inside,workspaceName,managedTeamRoot,chooseTeamRoot,cloudDirectory,cloudRelative } from './workspaces'
import { provisionWorkspace } from './plugins/documents'
import { ARRANGEMENTS, ROOM_SHAPES, MIN_ROOM_HEIGHT, DEFAULT_VIEW, initialBounds, planOffice, snapEmployee, constrainEmployee, resizeOccupiedRoom, type RoomBounds, type Point, type Viewport } from '../shared/canvas'

const EMPTY: Store = { sessions: [], groups: [], rooms: {} }

export function readStore(): Store {
  try {
    if (!existsSync(FILE)) return { ...EMPTY }
    const raw = JSON.parse(readFileSync(FILE, 'utf8'))
    return {
      revision:raw.revision??0,fullAccessDefaultApplied:raw.fullAccessDefaultApplied,access:raw.access,connectorAnchors:raw.connectorAnchors,lastEmployeeTemplate:raw.lastEmployeeTemplate,lastTeamTemplate:raw.lastTeamTemplate,
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      teamViews:Array.isArray(raw.teamViews)?raw.teamViews:[],activeTeamViewId:raw.activeTeamViewId??ALL_TEAM_VIEW,
      rooms: raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {},
      teamRoots: raw.teamRoots ?? {}, teamSettings:Object.fromEntries(Object.entries(raw.teamSettings??{}).map(([name,value])=>{const config=value as TeamSettings;if(config.mode==='cloud'&&config.hostId){try{return [name,{...config,remote:cloudHostTarget(config.hostId,config.directory)}]}catch{return [name,{...config,remote:undefined}]}}return [name,config]})), viewport: raw.viewport, preferences:{...mergePreferences(raw.preferences),defaultPermissionMode:raw.preferences?.defaultPermissionMode??(raw.fullAccessDefaultApplied?'bypassPermissions':'default'),sidebarWidth:normalizedSidebarWidth(raw.preferences?.sidebarWidth)}
    }
  } catch (error) {
    throw new Error('Store is unreadable; operations stopped: '+(error as Error).message)
  }
}

/**
 * Observers are told whenever the store changes. The GUI relies on this: a
 * session created by the CLI must appear on the floor without a reload.
 */
type StoreListener = (store: Store) => void
const listeners = new Set<StoreListener>()

export function onStoreChange(fn: StoreListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function writeStore(store: Store,options:{reconcileOffice?:boolean}={}): void {
  mkdirSync(ROOT, { recursive: true })
  const current=existsSync(FILE)?JSON.parse(readFileSync(FILE,'utf8')):undefined
  if((current?.revision??0)!==(store.revision??0))throw new Error('State changed during operation; retry against the current state')
  for(const card of store.sessions){if(card.workEnvironment!==undefined&&!['team','local'].includes(card.workEnvironment))throw Error('Invalid work environment');if(card.workEnvironment==='local'&&(card.kind==='cloud-native-worker'||teamSettings(store,card.group).mode==='work'))throw Error('该员工必须使用 Team 工作环境');assertManagementKind(card,hasGlobalRole(store.access,card),employeeSettings(store,card).mode==='cloud')}
  if(store.access){
    const cards=new Map(store.sessions.map(card=>[card.id,card]))
    if(store.access.bindings)store.access.bindings=store.access.bindings.filter(edge=>cards.has(edge.managerId)&&cards.has(edge.employeeId))
    store.access.relations=managementRelations(store.sessions,store.access.bindings)
    if(store.access.version===2){delete store.access.managerTeam;store.access.globalManagerIds=[]}
    else store.access.globalManagerIds=store.access.globalManagerIds.filter(id=>cards.has(id)&&!cards.get(id)!.deleting)
    const principals=(cards:StoredSession[])=>cards.map(card=>({id:card.id,role:card.managementRole??'employee',group:card.group,deleting:card.deleting??false}))
    // Startup may write legacy state while migrating hosts/defaults. Preserve its grant
    // epochs until initializeManagement converts the explicitly authorized employees.
    if(store.access.version===2){
      const globalIds=new Set(store.sessions.filter(card=>hasGlobalRole(store.access,card)).map(card=>card.id))
      store.access.globalGrants=Object.fromEntries(Object.entries(store.access.globalGrants??{}).filter(([id])=>globalIds.has(id)))
      for(const id of globalIds)store.access.globalGrants[id]??=randomUUID()
    }
    const before={...current?.access,revision:0,principals:principals(current?.sessions??[])},after={...store.access,revision:0,principals:principals(store.sessions)}
    store.access.revision=(current?.access?.revision??0)+(JSON.stringify(before)!==JSON.stringify(after)?1:0)
  }
  if(store.connectorAnchors){const ids=new Set(store.sessions.filter(c=>!c.deleting).map(c=>c.id));store.connectorAnchors=Object.fromEntries(Object.entries(store.connectorAnchors).filter(([,c])=>ids.has(c.managerId)&&ids.has(c.employeeId)))}
  if(options.reconcileOffice!==false)reconcileOfficeLayout(store,current)
  store.revision=(current?.revision??0)+1
  const saved={...store,teamSettings:Object.fromEntries(Object.entries(store.teamSettings??{}).map(([name,config])=>[name,config.mode==='cloud'&&config.hostId?{mode:'cloud',hostId:config.hostId,directory:config.remote?.directory??config.directory}:config]))}
  const temporary=FILE+'.'+randomUUID()+'.tmp'
  writeFileSync(temporary, JSON.stringify(saved,null,2),{encoding:'utf8',mode:0o600});renameSync(temporary,FILE)
  for(const listener of listeners)try{listener(store)}catch(error){console.error('Store listener:',error)}
}
export function updateStore(change:(store:Store)=>void):Store {const store=readStore();change(store);writeStore(store);return store}

/** Retain the legacy marker without rewriting any employee permission. */
export function migrateEmployeePermissionDefaults(){
  const store=readStore()
  if(store.fullAccessDefaultApplied)return
  // Compatibility marker only. Never elevate an existing user's selected permissions.
  store.preferences={...getPreferences(),defaultPermissionMode:store.sessions.length?(store.preferences?.defaultPermissionMode??'bypassPermissions'):'default'}
  store.fullAccessDefaultApplied=true
  writeStore(store)
}

export function storePath(): string {
  return FILE
}

export function teamViewList(store=readStore()){store=clientStore(store);return {activeId:store.activeTeamViewId??ALL_TEAM_VIEW,views:[{id:ALL_TEAM_VIEW,name:'All Team',teams:store.groups},...(store.teamViews??[])]}}
export function canvasViewport(store=readStore(),viewId?:string){return resolveTeamView(clientStore(store),viewId).viewport??DEFAULT_VIEW}
function teamViewTeams(store:Store,teams:unknown):string[]{
  if(!Array.isArray(teams)||teams.some(name=>typeof name!=='string'||!store.groups.includes(name)))throw new Error('视图只能包含已有 Team')
  return [...new Set(teams)]
}
function teamViewName(store:Store,name:unknown,id?:string){
  const value=String(name??'').trim()
  if(!value)throw new Error('请填写视图名称')
  if(value.toLowerCase()==='all team'||store.teamViews?.some(view=>view.id!==id&&view.name.toLowerCase()===value.toLowerCase()))throw new Error('视图名称已存在')
  return value
}
export function createTeamView(name:string,teams:string[]):TeamView{
  const store=readStore(),view={id:randomUUID(),name:teamViewName(store,name),teams:teamViewTeams(store,teams)}
  store.teamViews=[...(store.teamViews??[]),view];if(!setClientView(view.id))store.activeTeamViewId=view.id;writeStore(store);return view
}
export function updateTeamView(id:string,patch:{name?:string;teams?:string[];index?:number}):TeamView{
  const store=readStore(),view=store.teamViews?.find(value=>value.id===id)
  if(!view)throw new Error('视图不存在或 All Team 不能编辑')
  if(patch.name!==undefined)view.name=teamViewName(store,patch.name,id)
  if(patch.teams!==undefined){const next=teamViewTeams(store,patch.teams);if(JSON.stringify(next)!==JSON.stringify(view.teams))view.viewport=undefined;view.teams=next}
  if(patch.index!==undefined){
    if(!Number.isInteger(patch.index)||patch.index<0||patch.index>=store.teamViews!.length)throw new Error('视图位置无效')
    store.teamViews!.splice(store.teamViews!.indexOf(view),1)
    store.teamViews!.splice(patch.index,0,view)
  }
  writeStore(store);return view
}
export function removeTeamView(id:string){
  const store=readStore(),view=store.teamViews?.find(value=>value.id===id)
  if(!view)throw new Error('视图不存在或 All Team 不能删除')
  store.teamViews=store.teamViews!.filter(value=>value.id!==id)
  if(store.activeTeamViewId===id)store.activeTeamViewId=ALL_TEAM_VIEW
  writeStore(store);return {removed:true,id}
}
export function selectTeamView(id:string){
  const store=readStore()
  if(id!==ALL_TEAM_VIEW&&!store.teamViews?.some(view=>view.id===id))throw new Error('视图不存在')
  if(!setClientView(id)){store.activeTeamViewId=id;writeStore(store)};return teamViewList(store)
}

export function patchSession(id: string, patch: Partial<StoredSession>): Store {
  const store = readStore()
  const at = store.sessions.findIndex((s) => s.id === id)
  if (at < 0) {
    const card={...(patch as StoredSession),id}
    store.sessions.push(card)
    store.lastEmployeeTemplate={engine:card.engine,kind:card.kind,group:card.group,workEnvironment:card.workEnvironment,directoryMode:card.directoryMode,avatar:card.avatar,accessory:card.accessory,color:card.color,role:card.role,model:card.model,effort:card.effort,permissionMode:card.permissionMode,thinking:card.thinking,planMode:card.planMode,fastMode:card.fastMode,managementRole:card.managementRole}

  } else {
    const previous=store.sessions[at]
    employeeFields(patch,previous)
    const next={...previous,...patch,managementRole:previous.managementRole,createdBy:previous.createdBy,accessMode:previous.accessMode,deleting:previous.deleting}
    next.nativeSessions=nativeSessionRefs({...next,nativeSessions:[...nativeSessionRefs(previous),...(patch.nativeSessions??[])]})
    store.sessions[at] = next
  }
  writeStore(store)
  return store
}

/** Place or resize a department's room on the floor. */
export function setRoom(name: string, layout: RoomLayout): Store {
  const store = readStore()
  if (!store.groups.includes(name)) throw new Error(`Unknown department: ${name}`)
  if (![layout.col, layout.row, layout.w, layout.h].every(Number.isInteger) || layout.col < 0 || layout.row < 0 || layout.w < 1 || layout.h < 1) throw new Error('Room coordinates must be non-negative integers, with positive width and height')
  applyBounds(store,name,{x:layout.col*860,y:layout.row*670,width:layout.w*760,height:layout.h*MIN_ROOM_HEIGHT})
  store.rooms = { ...(store.rooms ?? {}), [name]: { ...store.rooms![name], ...layout } }
  writeStore(store)
  return store
}

export function removeSession(id: string|string[]): Store {
  const store = readStore()
  const ids=new Set(Array.isArray(id)?id:[id])
  store.sessions = store.sessions.filter((s) => !ids.has(s.id))
  writeStore(store)
  return store
}

export function validateTeamSettings(settings:TeamSettings):TeamSettings {
  if(!['work','build','cloud'].includes(settings.mode))throw new Error('Team 模式必须是 work、build 或 cloud')
  if(settings.directoryMode!==undefined&&!['default','bind'].includes(settings.directoryMode))throw new Error('请选择默认生成或绑定已有文件夹')
  if(settings.mode==='cloud'){if(!settings.hostId)throw new Error('请先在 Cloud Hosts 插件添加云主机，再使用 hostId 绑定 Team');const remote=cloudHostTarget(settings.hostId,settings.directory??settings.remote?.directory);return {mode:'cloud',hostId:settings.hostId,directory:remote.directory,remote}}
  if(settings.remote||settings.hostId||settings.directory)throw new Error('SSH 主机和远端目录只能配置在 cloud Team 中；请使用 --mode cloud')
  if(settings.directoryMode!==undefined&&!['default','bind'].includes(settings.directoryMode))throw new Error('请选择默认生成或绑定已有文件夹')
  const directory=settings.directoryMode?{directoryMode:settings.directoryMode}:{}
  if(settings.mode==='build')return {mode:'build',...directory}
  if(!settings.pluginId)throw new Error('Work Team 必须选择已安装的插件')
  if(settings.directoryMode==='bind')throw new Error('Work Team 使用插件固定工作目录，不能手动绑定 Team 文件夹')
  requirePlugin(settings.pluginId)
  return {mode:'work',pluginId:settings.pluginId,...directory}
}

export function addGroup(name: string, root?: string, settings:TeamSettings={mode:'build'}): Store {
  const store = readStore()
  const clean = String(name ?? '').trim()
  if (!clean) throw new Error('Team 名称不能为空')
  if (!store.groups.includes(clean)) {
    const config=validateTeamSettings(settings)
    const canonical = chooseTeamRoot(clean,config,root)
    if(config.mode!=='cloud'&&Object.entries(store.teamRoots??{}).some(([name,path])=>teamSettings(store,name).mode!=='cloud'&&path===canonical&&(config.mode==='work'||config.directoryMode!=='bind')))throw new Error('此工作目录已属于另一个项目或插件')
    if(config.mode!=='cloud'&&(config.mode==='work'||config.directoryMode!=='bind'))provisionWorkspace(canonical,config)
    store.groups.push(clean)
    store.lastTeamTemplate={settings:config,design:roomDesign(store.groups.length-1),bounds:initialBounds(store.groups.length-1)}
    if(store.activeTeamViewId&&store.activeTeamViewId!==ALL_TEAM_VIEW){const view=store.teamViews?.find(view=>view.id===store.activeTeamViewId);if(view){view.teams.push(clean);view.viewport=undefined}}
    store.teamRoots = { ...store.teamRoots, [clean]: canonical }
    store.teamSettings={...store.teamSettings,[clean]:config}
  } else throw new Error('Team 已存在；名称可修改，工作目录创建后不可更换')
  writeStore(store)
  return store
}

export function removeGroup(name: string|string[]): Store {
  const store = readStore()
  const names=new Set(Array.isArray(name)?name:[name])
  if (store.sessions.some(c=>names.has(c.group))) throw new Error('请先迁移或移除 Team 内的员工，再删除 Team；工作文件不会被删除')
  if(store.access?.managerTeam&&names.has(store.access.managerTeam))delete store.access.managerTeam
  store.groups = store.groups.filter(g=>!names.has(g))
  if(store.lastEmployeeTemplate?.group&&names.has(store.lastEmployeeTemplate.group))delete store.lastEmployeeTemplate.group
  store.teamViews=store.teamViews?.map(view=>view.teams.some(team=>names.has(team))?{...view,teams:view.teams.filter(team=>!names.has(team)),viewport:undefined}:view)
  for(const name of names){
    if (store.rooms) delete store.rooms[name]
    if (store.teamRoots) delete store.teamRoots[name]
    if (store.teamSettings) delete store.teamSettings[name]
  }
  writeStore(store)
  return store
}

export function renameGroup(name: string, nextName: string): Store {
  const store = readStore()
  if (!store.groups.includes(name)) throw new Error(`Unknown department: ${name}`)
  const next=String(nextName??'').trim()
  if(!next)throw new Error('Team 名称不能为空')
  if(next===name)return store
  if(store.groups.includes(next))throw new Error('同名 Team 已存在')
  const renamed=<T>(record:Record<string,T>|undefined)=>record&&Object.fromEntries(Object.entries(record).map(([key,value])=>[key===name?next:key,value]))
  if(store.access?.managerTeam===name)store.access.managerTeam=next
  store.groups=store.groups.map(group=>group===name?next:group)
  if(store.lastEmployeeTemplate?.group===name)store.lastEmployeeTemplate.group=next
  store.teamViews=store.teamViews?.map(view=>({...view,teams:view.teams.map(team=>team===name?next:team)}))
  store.sessions=store.sessions.map(card=>card.group===name?{...card,group:next}:card)
  store.teamRoots=renamed(store.teamRoots)
  store.teamSettings=renamed(store.teamSettings)
  store.rooms=renamed(store.rooms)??{}
  writeStore(store,{reconcileOffice:false})
  return store
}

export function designRoom(name: string, patch: Partial<RoomDesign>): Store {
  const store = readStore()
  if (name && !store.groups.includes(name)) throw new Error(`Unknown department: ${name}`)
  const design: Partial<RoomDesign> = {}
  for (const [field, values] of Object.entries({ theme: ROOM_THEMES, wall: WALLS, desk: DESKS, pattern:ROOM_PATTERNS })) {
    const value = patch[field as keyof RoomDesign]
    if (value !== undefined) {
      if (!(values as readonly unknown[]).includes(value)) throw new Error(`Invalid ${field}`)
      Object.assign(design, { [field]: value })
    }
  }
  for (const field of ['plants', 'shelf', 'lamp', 'art', 'scenery'] as const) if (patch[field] !== undefined) design[field] = Boolean(patch[field])
  if(patch.background!==undefined){if(patch.background!==''&&!/^#[\da-f]{6}$/i.test(patch.background))throw new Error('背景颜色必须是十六进制颜色，或留空跟随主题');design.background=patch.background}
  if (patch.subtitle !== undefined) design.subtitle = String(patch.subtitle)
  const index = Math.max(0, store.groups.indexOf(name))
  const room = store.rooms?.[name] ?? { col: index % 3, row: Math.floor(index / 3), w: 1, h: 1 }
  store.rooms = { ...store.rooms, [name]: { ...room, design: { ...room.design, ...design } } }
  if(name===store.groups.at(-1)&&store.lastTeamTemplate)store.lastTeamTemplate.design=roomDesign(index,store.rooms[name].design)
  writeStore(store)
  return store
}

export function employeeFields(patch: Partial<StoredSession>, employee?:StoredSession): Partial<StoredSession> {
  if(patch.engine!==undefined&&!isEngine(patch.engine))throw new Error('Unknown engine')
  if(employee&&patch.engine!==undefined&&patch.engine!==employee.engine)throw new Error('员工引擎创建后固定；如需使用其他引擎，请删除员工后重新添加')
  if (patch.avatar !== undefined && !AVATARS.includes(patch.avatar)) throw new Error('Unknown avatar')
  if (patch.accessory !== undefined && !ACCESSORIES.includes(patch.accessory)) throw new Error('Unknown accessory')
  if (patch.color !== undefined && !/^#[\da-f]{6}$/i.test(patch.color)) throw new Error('Color must be a hex color')
  if(patch.title!==undefined&&!String(patch.title).trim())throw new Error('会话名称不能为空')
  const fields: Partial<StoredSession> = {}
  for (const key of ['title', 'role', 'avatar', 'accessory', 'color'] as const) {
    if (patch[key] !== undefined) Object.assign(fields, { [key]: patch[key] })
  }
  if(fields.title!==undefined)fields.title=String(fields.title).trim()
  return fields
}

export function updateEmployee(id: string, patch: Partial<StoredSession>, directoryMode?:'create'|'existing'): Store {
  const employee = readStore().sessions.find((c) => c.id === id)
  if (!employee) throw new Error(`no such card ${id}`)
  if(patch.group!==undefined&&patch.group!==employee.group)throw new Error('员工创建后不能更换 Team')
  if(patch.cwd!==undefined&&patch.cwd!==employee.cwd)throw new Error('员工工作目录创建后不能更换')
  const fields = employeeFields(patch,employee)
  return patchSession(id, fields)
}

/** Move a session to a department and place it at a position in that list. */
export function moveSession(id: string, group: string, beforeId?: string, targetCwd?: string,directoryMode?:'create'|'existing'): Store {
  const store = readStore()
  const from = store.sessions.findIndex((s) => s.id === id)
  if (from < 0) throw new Error(`no such card ${id}`)
  const card=store.sessions[from]
  if(group!==card.group)throw new Error('员工创建后不能更换 Team')
  if(targetCwd!==undefined&&targetCwd!==card.cwd)throw new Error('员工工作目录创建后不能更换')
  if(card.kind==='cloud-native-worker'&&group!==card.group)throw new Error('Cloud Native Worker 不能移动到另一 Team')
  if(!store.groups.includes(group))throw new Error('Unknown Team')
  const cwd=employeeWorkspace(store,group,targetCwd ?? (group===card.group?card.cwd:card.cwd.split('/').at(-1)!),id,true,directoryMode)
  if(card.group!==group&&store.access)store.access.relations=store.access.relations.filter(r=>r.managerId!==id&&r.employeeId!==id)
  const moving = { ...card, remote:undefined, group, cwd,localWorkspaceRoot:card.workEnvironment==='local'&&teamSettings(store,group).mode==='cloud'?employeeRoot(store,{group,workEnvironment:'local'}):undefined, ...(cwd!==card.cwd||group!==card.group?{nativeSessions:nativeSessionRefs(card),threadId:undefined,claudeSessionId:undefined}:{}), ...(group!==card.group?{position:undefined,remoteAdmin:false,permissionMode:employeeSettings(store,{...card,group}).mode!=='build'?'acceptEdits' as const:card.permissionMode}:{}) }
  const rest = store.sessions.filter((s) => s.id !== id)
  const at = beforeId ? rest.findIndex((s) => s.id === beforeId) : -1
  const next = at < 0 ? [...rest, moving] : [...rest.slice(0, at), moving, ...rest.slice(at)]
  next.forEach((s, i) => (s.orderIndex = i))
  store.sessions = next
  writeStore(store)
  return store
}

/** Change the binding without moving work files or reassigning employee folders. */
export function bindTeamRoot(name:string,path:string):Store {
  const store=readStore()
  if(!store.groups.includes(name))throw new Error('Unknown Team')
  if(store.teamRoots?.[name])throw new Error('Team 工作目录创建后不可更换')
  if(teamSettings(store,name).mode==='cloud')throw new Error('云主机目录请通过 group configure 更新')
  const config={...teamSettings(store,name),directoryMode:'bind' as const},root=chooseTeamRoot(name,config,path)
  const next={...store,teamRoots:{...store.teamRoots,[name]:root},teamSettings:{...store.teamSettings,[name]:config}}
  for(const card of store.sessions.filter(c=>c.group===name))employeeWorkspace(next,name,card.cwd,card.id,'preview')
  if(config.mode==='work'){
    provisionWorkspace(root,config)
    for(const card of store.sessions.filter(c=>c.group===name))provisionWorkspace(card.cwd,config,root)
  }
  writeStore(next);return next
}

/** Move a legacy folder once. Never overwrite a destination or silently drop work. */
export function setTeamRoot(name:string,path?:string,_create=true):Store {
  const store=readStore()
  if(!store.groups.includes(name))throw new Error('Unknown Team')
  if(store.teamRoots?.[name])throw new Error('Team 工作目录创建后不可更换')
  if(teamSettings(store,name).mode==='cloud')throw new Error('云主机目录不支持本地迁移，请使用 group configure')
  const config={...teamSettings(store,name),directoryMode:'default' as const},root=managedTeamRoot(name,config,path),oldRoot=store.teamRoots?.[name]
  if(teamSettings(store,name).directoryMode==='bind')throw new Error('绑定目录不自动迁移；请保留绑定或新建 Team')
  if(oldRoot===root&&existsSync(root))return store
  const destination=config.mode==='work'?join(root,workspaceName(name)):root
  if(oldRoot&&existsSync(oldRoot)&&oldRoot!==root){
    if(Object.entries(store.teamRoots??{}).some(([other,p])=>other!==name&&(p===oldRoot||inside(oldRoot,p))))throw new Error('目录由其他 Team 共用，不能自动迁移')
    if(existsSync(destination))throw new Error(`迁移目标已经存在：${destination}。请先整理其中的文件，原目录未变更。`)
    if(inside(oldRoot,destination))throw new Error('不能把旧工作区迁入自身子目录')
  }
  const next={...store,teamSettings:{...store.teamSettings,[name]:config},teamRoots:{...store.teamRoots,[name]:root},sessions:store.sessions.map(card=>{
    if(card.group!==name)return card
    if(config.mode==='build'&&oldRoot&&card.cwd!==oldRoot&&!inside(oldRoot,card.cwd))return card
    const suffix=oldRoot&&(card.cwd===oldRoot||inside(oldRoot,card.cwd))?relative(oldRoot,card.cwd):config.mode==='work'?workspaceName(card.title):'.'
    return {...card,nativeSessions:nativeSessionRefs(card),cwd:join(config.mode==='work'&&oldRoot?destination:root,suffix),threadId:undefined,claudeSessionId:undefined}
  })}
  mkdirSync(join(ROOT,'backups'),{recursive:true})
  writeFileSync(join(ROOT,'backups',`before-directory-migration-${Date.now()}.json`),JSON.stringify(store,null,2))
  if(oldRoot&&existsSync(oldRoot)&&oldRoot!==root){
    mkdirSync(dirname(destination),{recursive:true});renameSync(oldRoot,destination)
    // Old terminal paths keep working; the app stores only the new canonical paths.
    symlinkSync(destination,oldRoot,'dir')
  }
  teamRoot(root,true,config.mode==='work')
  for(const card of next.sessions.filter(c=>c.group===name)){employeeWorkspace(next,name,card.cwd,card.id,true);provisionWorkspace(card.cwd,config,root)}
  provisionWorkspace(root,config)
  writeStore(next);return next
}

export function configureTeam(name:string,settings:TeamSettings,path?:string):Store {
  const store=readStore()
  if(!store.groups.includes(name))throw new Error('Unknown Team')
  const previous=teamSettings(store,name)
  if(store.teamRoots?.[name])throw new Error('Team 工作方式和工作目录创建后不可更换')
  if(previous.mode==='work'&&previous.directoryMode==='bind'&&settings.mode==='work'&&settings.pluginId===previous.pluginId&&settings.directoryMode===undefined&&path===undefined)return store
  const samePlugin=settings.mode===previous.mode&&settings.pluginId===previous.pluginId
  const config=validateTeamSettings({...settings,directoryMode:settings.directoryMode??(samePlugin?previous.directoryMode:undefined)})
  if(config.mode===previous.mode&&config.pluginId===previous.pluginId&&config.hostId===previous.hostId&&(config.mode!=='cloud'||JSON.stringify(config.remote)===JSON.stringify(previous.remote)))return store
  if(store.sessions.some(c=>c.group===name)&&(config.mode!==previous.mode||config.pluginId!==previous.pluginId))throw new Error('已有员工的 Team 不能切换工作区类型；请创建新的 Team')
  const root=chooseTeamRoot(name,config,config.directoryMode==='bind'?path??store.teamRoots?.[name]:undefined)
  const next={...store,teamSettings:{...store.teamSettings,[name]:config},teamRoots:{...store.teamRoots,[name]:root}}
  if(config.mode==='cloud'&&previous.mode==='cloud')next.sessions=store.sessions.map(card=>card.group===name?{...card,cwd:cloudDirectory(config,cloudRelative(previous,card.cwd)),nativeSessions:nativeSessionRefs(card),remote:undefined,threadId:undefined,claudeSessionId:undefined}:card)
  if(config.mode!=='cloud'&&(config.mode==='work'||config.directoryMode!=='bind'))provisionWorkspace(root,config)
  writeStore(next);return next
}

export function setBounds(name: string, patch: Partial<RoomBounds>): Store {
  const store=readStore()
  applyBounds(store,name,patch)
  if(name===store.groups.at(-1)&&store.lastTeamTemplate)store.lastTeamTemplate.bounds={...store.rooms![name].bounds!}
  writeStore(store,{reconcileOffice:false});return store
}
function applyBounds(store:Store,name:string,patch:Partial<RoomBounds>){
  const index=store.groups.indexOf(name)
  if(index<0 && name!=='') throw new Error('Unknown Team')
  // A manual frame edit leaves other Teams exactly where the user placed them.
  store.rooms??={}
  const planned=planOffice(store)
  for(const room of planned)store.rooms[room.name]={...(store.rooms[room.name]??{col:0,row:0,w:1,h:1}),bounds:{...room.bounds,pinned:true}}
  const prev=initialBounds(Math.max(0,index),store.rooms?.[name])
  let bounds={...prev,...patch}
  if(patch.x!==undefined||patch.y!==undefined) bounds.pinned=true
  if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<360||bounds.height<380) throw new Error('Team 尺寸至少为 360 × 380，坐标须为有限数值')
  bounds.height=Math.max(MIN_ROOM_HEIGHT,bounds.height)
  if(!ROOM_SHAPES.includes(bounds.shape)||!ARRANGEMENTS.includes(bounds.arrangement)) throw new Error('Invalid room shape or arrangement')
  if(bounds.points && (bounds.points.length<3 || bounds.points.some(p=>![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)))) throw new Error('外框至少需要三个控制点，坐标位于 0–1 范围')
  if(patch.width!==undefined||patch.height!==undefined){
    const room=planned.find(r=>r.name===name)!
    const resizing=bounds.shape===prev.shape&&bounds.arrangement===prev.arrangement&&JSON.stringify(bounds.points)===JSON.stringify(prev.points)
    const resized=resizing?resizeOccupiedRoom(room,bounds):room
    if(resizing)bounds=resized.bounds
    const positions=new Map(resized.employees.map(employee=>[employee.card.id,employee.position]))
    store.sessions=store.sessions.map(card=>card.group===name?{...card,position:positions.get(card.id)}:card)
  }
  if(patch.arrangement && patch.arrangement!==prev.arrangement) store.sessions=store.sessions.map(c=>c.group===name?{...c,position:undefined}:c)
  store.rooms={...store.rooms,[name]:{...(store.rooms?.[name]??{col:0,row:0,w:1,h:1}),bounds}}
  if(bounds.x!==prev.x||bounds.y!==prev.y)store.connectorAnchors=rerouteTeamConnections(store.connectorAnchors,name,store.sessions)
  const adjusted=planOffice(store).find(room=>room.name===name)!
  store.sessions=store.sessions.map(card=>card.group===name&&card.position?{...card,position:adjusted.employees.find(e=>e.card.id===card.id)!.position}:card)
}

export function placeEmployee(id: string, position: Point,options:{snap?:boolean;zoom?:number}={}): Store {
  if(![position.x,position.y].every(Number.isFinite)) throw new Error('员工位置必须位于 Team 内部')
  const store=readStore(), card=store.sessions.find(c=>c.id===id)
  if(!card) throw new Error('Unknown employee')
  const planned=planOffice(store),room=planned.find(r=>r.name===card.group)!
  if(options.snap??store.preferences?.snapEmployees??DEFAULT_PREFERENCES.snapEmployees)position=snapEmployee(room,id,position,options.zoom??1).position
  position=constrainEmployee(room.bounds,position,room.employees.find(e=>e.card.id===id)!.position)
  store.rooms??={}
  for(const item of planned)store.rooms[item.name]={...(store.rooms[item.name]??{col:0,row:0,w:1,h:1}),bounds:{...item.bounds,pinned:true}}
  store.sessions=store.sessions.map(c=>c.group===card.group?{...c,position:c.id===id?position:(room.employees.find(p=>p.card.id===c.id)?.position)}:c)
  const existing=store.rooms?.[card.group]??{col:0,row:0,w:1,h:1}
  store.rooms={...store.rooms,[card.group]:{...existing,bounds:{...initialBounds(0,existing),arrangement:'free'}}}
  writeStore(store);return store
}

export function setViewport(view: Viewport,viewId?:string): Store {
  if(![view.x,view.y,view.zoom].every(Number.isFinite)||view.zoom<.08||view.zoom>3) throw new Error('Invalid canvas viewport')
  const store=readStore(),target=resolveTeamView(clientStore(store),viewId)
  if(setClientView(target.id,view))return clientStore(store)
  if(target.id===ALL_TEAM_VIEW)store.viewport=view;else target.viewport=view
  writeStore(store);return store
}

export function getPreferences():Preferences { return readStore().preferences??mergePreferences() }
export function setPreferences(patch:PreferencesPatch):Preferences {
  for(const key of Object.keys(patch))if(!Object.hasOwn(DEFAULT_PREFERENCES,key))throw Error('Unknown preference: '+key)
  const appearance=patch.viewAppearance
  if(appearance!==undefined){
    if(!appearance||typeof appearance!=='object'||Array.isArray(appearance)||Object.keys(appearance).some(view=>!PRESENTATION_VIEWS.includes(view as any)))throw Error('Choose Company, Messages or Plan appearance')
    for(const change of Object.values(appearance))if(!change||typeof change!=='object'||Array.isArray(change)||Object.keys(change).some(key=>!['theme','themeColor'].includes(key)))throw Error('View appearance accepts theme and themeColor')
  }
  const value=mergePreferences(getPreferences(),patch)
  if(!['default','acceptEdits','bypassPermissions'].includes(value.defaultPermissionMode))throw Error('Invalid default engine permission')
  if(!LANGUAGES.includes(value.language))throw new Error('Interface language must be en or zh-CN')
  for(const chosen of [patch,...Object.values(appearance??{}),...Object.values(value.viewAppearance)]){
    if(chosen.theme!==undefined&&!THEMES.includes(chosen.theme))throw Error('Unknown theme')
    if(chosen.themeColor!==undefined&&(typeof chosen.themeColor!=='string'||!/^#[0-9a-f]{6}$/i.test(chosen.themeColor)))throw Error('Theme color must be a six-digit hex color')
  }
  if(!Number.isFinite(value.zoomSensitivity)||value.zoomSensitivity<.25||value.zoomSensitivity>8)throw new Error('Zoom sensitivity must be between 0.25 and 8')
  if(!Number.isFinite(value.panSensitivity)||value.panSensitivity<.25||value.panSensitivity>4)throw new Error('Pan sensitivity must be between 0.25 and 4')
  if(!Number.isFinite(value.sidebarWidth)||value.sidebarWidth<SIDEBAR_MIN||value.sidebarWidth>SIDEBAR_MAX)throw new Error('Icon sidebar width must be between 56 and 96')
  if(!Number.isFinite(value.pageZoom)||value.pageZoom<.75||value.pageZoom>1.5)throw new Error('Page zoom must be between 0.75 and 1.5')
  if(!Number.isFinite(value.explorerWidth)||value.explorerWidth<140||value.explorerWidth>520)throw new Error('Explorer width must be between 140 and 520')
  if(!Number.isFinite(value.terminalHeight)||value.terminalHeight<120||value.terminalHeight>600)throw new Error('Terminal height must be between 120 and 600')
  if(typeof value.snapEmployees!=='boolean')throw new Error('snapEmployees must be boolean')
  if(typeof value.showTeamOverview!=='boolean')throw new Error('showTeamOverview must be boolean')
  for(const key of ['defaultCodexModel','defaultClaudeModel','defaultClineModel','defaultPiModel'] as const){if(typeof value[key]!=='string')throw new Error(key+' must be a model ID');value[key]=value[key].trim()}
  const store=readStore();store.preferences=value;writeStore(store);return value
}

/** Upgrade 0.12 per-employee SSH settings without moving files or changing sessions. */
export function migrateCloudTeams(){
  const store=readStore(),legacy=store.sessions.filter(card=>card.remote&&teamSettings(store,card.group).mode!=='cloud')
  if(!legacy.length)return
  mkdirSync(join(ROOT,'backups'),{recursive:true});writeFileSync(join(ROOT,'backups',`before-cloud-teams-${Date.now()}.json`),JSON.stringify(store,null,2))
  const groups=new Map<string,string>()
  for(const card of legacy){
    const remote=remoteTarget(card.remote)!,key=card.group+JSON.stringify(remote)
    let name=groups.get(key)
    if(!name){const base=`${card.group} 云主机`;name=base;for(let i=2;store.groups.includes(name);i++)name=`${base} ${i}`;groups.set(key,name);store.groups.push(name);store.teamSettings={...store.teamSettings,[name]:{mode:'cloud',remote}};store.teamRoots={...store.teamRoots,[name]:remote.directory}}
    card.group=name;card.cwd=remote.directory;delete card.remote
  }
  writeStore(store)
}

export function migrateCloudHostBindings(){
  const store=readStore();let changed=false
  for(const [name,config] of Object.entries(store.teamSettings??{}))if(config.mode==='cloud'&&!config.hostId&&config.remote){
    if(!changed){mkdirSync(join(ROOT,'backups'),{recursive:true});writeFileSync(join(ROOT,'backups',`before-host-registry-${Date.now()}.json`),JSON.stringify(store,null,2))}
    store.teamSettings![name]={...config,hostId:importCloudHost(name,config.remote),directory:config.remote.directory};changed=true
  }
  if(changed)writeStore(store)
}
