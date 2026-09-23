import {remoteTarget} from '../shared/remote'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, symlinkSync } from 'node:fs'
import { join,relative,dirname } from 'node:path'
import {DEFAULT_PREFERENCES,THEMES,SIDEBAR_MIN,SIDEBAR_MAX,normalizedSidebarWidth,type Preferences} from '../shared/preferences'
import { homedir } from 'node:os'

// The app's own record of which sessions it created, what they are called and
// which group they sit in. Kept separate from anything the engines persist, so
// sessions started in an editor never show up here.

const ROOT = process.env.AGENTS_COMPANY_HOME || join(homedir(), 'AgentsCompany')
const FILE = join(ROOT, 'sessions.json')

export type { Engine, StoredSession, Store, RoomLayout } from '../shared/types'
import {teamSettings,nativeSessionRefs,type TeamSettings,type RoomLayout,type Store,type StoredSession} from '../shared/types'
import { requirePlugin } from './plugins/registry'
import { AVATARS, ACCESSORIES, DESKS, ROOM_THEMES, WALLS, ROOM_PATTERNS, type RoomDesign } from '../shared/office'
import { employeeWorkspace, teamRoot,inside,workspaceName,managedTeamRoot,chooseTeamRoot,cloudDirectory,cloudRelative } from './workspaces'
import { provisionWorkspace } from './plugins/documents'
import { ARRANGEMENTS, ROOM_SHAPES, initialBounds, planOffice, snapEmployee, constrainEmployee, type RoomBounds, type Point, type Viewport } from '../shared/canvas'

const EMPTY: Store = { sessions: [], groups: [], rooms: {} }

export function readStore(): Store {
  try {
    if (!existsSync(FILE)) return { ...EMPTY }
    const raw = JSON.parse(readFileSync(FILE, 'utf8'))
    return {
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      groups: Array.isArray(raw.groups) ? raw.groups : [],
      rooms: raw.rooms && typeof raw.rooms === 'object' ? raw.rooms : {},
      teamRoots: raw.teamRoots ?? {}, teamSettings:raw.teamSettings??{}, viewport: raw.viewport, preferences:{...DEFAULT_PREFERENCES,...raw.preferences,sidebarWidth:normalizedSidebarWidth(raw.preferences?.sidebarWidth)}
    }
  } catch {
    return { ...EMPTY }
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

export function writeStore(store: Store): void {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(FILE, JSON.stringify(store, null, 2), 'utf8')
  for (const fn of listeners) {
    try {
      fn(store)
    } catch {
      // a broken observer must not block the write
    }
  }
}

export function storePath(): string {
  return FILE
}

export function patchSession(id: string, patch: Partial<StoredSession>): Store {
  const store = readStore()
  const at = store.sessions.findIndex((s) => s.id === id)
  if (at < 0) {
    store.sessions.push({ ...(patch as StoredSession), id })
  } else {
    const previous=store.sessions[at]
    employeeFields(patch,previous)
    const next={...previous,...patch}
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
  store.rooms = { ...(store.rooms ?? {}), [name]: { ...store.rooms?.[name], ...layout } }
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
  if(settings.mode==='cloud'){const remote=remoteTarget(settings.remote);if(!remote)throw new Error('云主机 Team 需要 SSH 主机与工作目录');return {mode:'cloud',remote}}
  if(settings.remote)throw new Error('SSH 连接只能配置在 cloud Team 中')
  if(settings.directoryMode!==undefined&&!['default','bind'].includes(settings.directoryMode))throw new Error('请选择默认生成或绑定已有文件夹')
  const directory=settings.directoryMode?{directoryMode:settings.directoryMode}:{}
  if(settings.mode==='build')return {mode:'build',...directory}
  if(!settings.pluginId)throw new Error('Work Team 必须选择已安装的插件')
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
    if(config.mode!=='cloud'&&Object.entries(store.teamRoots??{}).some(([name,path])=>teamSettings(store,name).mode!=='cloud'&&path===canonical&&(config.mode==='work'?teamSettings(store,name).mode==='work'&&teamSettings(store,name).pluginId!==config.pluginId:config.directoryMode!=='bind')))throw new Error('此工作目录已属于另一个项目或插件')
    if(config.mode!=='cloud'&&(config.mode==='work'||config.directoryMode!=='bind'))provisionWorkspace(canonical,config)
    store.groups.push(clean)
    store.teamRoots = { ...store.teamRoots, [clean]: canonical }
    store.teamSettings={...store.teamSettings,[clean]:config}
  } else if(teamSettings(store,clean).mode==='cloud'){if(JSON.stringify(teamSettings(store,clean))!==JSON.stringify(validateTeamSettings(settings)))throw new Error('Team 已存在，请使用 group configure 修改连接')} else if (root) return settings.directoryMode==='bind'?bindTeamRoot(clean,root):setTeamRoot(clean, root)
  writeStore(store)
  return store
}

export function removeGroup(name: string): Store {
  const store = readStore()
  if (store.sessions.some(c=>c.group===name)) throw new Error('请先迁移或移除 Team 内的员工，再删除 Team；工作文件不会被删除')
  store.groups = store.groups.filter((g) => g !== name)
  if (store.rooms) delete store.rooms[name]
  if (store.teamRoots) delete store.teamRoots[name]
  if (store.teamSettings) delete store.teamSettings[name]
  writeStore(store)
  return store
}

export function renameGroup(name: string, nextName: string): Store {
  const store = readStore()
  if (!store.groups.includes(name)) throw new Error(`Unknown department: ${name}`)
  if (nextName.trim() !== name) throw new Error('Team 名称创建后不可修改，与工作目录保持一致')
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
  writeStore(store)
  return store
}

export function employeeFields(patch: Partial<StoredSession>, employee?:StoredSession): Partial<StoredSession> {
  if(patch.engine!==undefined&&!['codex','claude'].includes(patch.engine))throw new Error('Unknown engine')
  if (patch.avatar !== undefined && !AVATARS.includes(patch.avatar)) throw new Error('Unknown avatar')
  if (patch.accessory !== undefined && !ACCESSORIES.includes(patch.accessory)) throw new Error('Unknown accessory')
  if (patch.color !== undefined && !/^#[\da-f]{6}$/i.test(patch.color)) throw new Error('Color must be a hex color')
  if(patch.title!==undefined&&!String(patch.title).trim())throw new Error('会话名称不能为空')
  if(employee&&patch.title!==undefined&&String(patch.title).trim()!==employee.title)throw new Error('员工名称创建后不可修改，与工作目录保持一致')
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
  const fields = employeeFields(patch,employee)
  if(patch.engine!==undefined&&patch.engine!==employee.engine)Object.assign(fields,{engine:patch.engine,nativeSessions:nativeSessionRefs(employee),threadId:undefined,claudeSessionId:undefined,model:patch.engine==='codex'?'gpt-5.6-luna':undefined,effort:'low',fastMode:false,thinking:patch.engine==='claude',permissionMode:teamSettings(readStore(),patch.group??employee.group).mode==='build'?'default':'acceptEdits'})
  if (patch.group !== undefined && patch.group !== employee.group) moveSession(id, patch.group, undefined, patch.cwd, directoryMode)
  else if (patch.cwd !== undefined && patch.cwd !== employee.cwd) {
    const cwd=employeeWorkspace(readStore(),employee.group,patch.cwd,id,true,directoryMode)
    if(cwd!==employee.cwd) Object.assign(fields,{cwd,threadId:undefined,claudeSessionId:undefined})
  }
  return patchSession(id, fields)
}

/** Move a session to a department and place it at a position in that list. */
export function moveSession(id: string, group: string, beforeId?: string, targetCwd?: string,directoryMode?:'create'|'existing'): Store {
  const store = readStore()
  const from = store.sessions.findIndex((s) => s.id === id)
  if (from < 0) throw new Error(`no such card ${id}`)
  const card=store.sessions[from]
  const cwd=employeeWorkspace(store,group,targetCwd ?? (group===card.group?card.cwd:card.cwd.split('/').at(-1)!),id,true,directoryMode)
  const moving = { ...card, remote:undefined, group, cwd, ...(cwd!==card.cwd||group!==card.group?{nativeSessions:nativeSessionRefs(card),threadId:undefined,claudeSessionId:undefined}:{}), ...(group!==card.group?{position:undefined,permissionMode:teamSettings(store,group).mode!=='build'?'acceptEdits' as const:card.permissionMode}:{}) }
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
  teamRoot(root,true)
  for(const card of next.sessions.filter(c=>c.group===name)){employeeWorkspace(next,name,card.cwd,card.id,true);provisionWorkspace(card.cwd,config,root)}
  provisionWorkspace(root,config)
  writeStore(next);return next
}

export function configureTeam(name:string,settings:TeamSettings,path?:string):Store {
  const store=readStore()
  if(!store.groups.includes(name))throw new Error('Unknown Team')
  const previous=teamSettings(store,name),config=validateTeamSettings({...settings,directoryMode:settings.directoryMode??previous.directoryMode})
  if(config.mode===previous.mode&&config.pluginId===previous.pluginId&&(config.mode!=='cloud'||JSON.stringify(config.remote)===JSON.stringify(previous.remote)))return store
  if(store.sessions.some(c=>c.group===name)&&(config.mode!==previous.mode||config.pluginId!==previous.pluginId))throw new Error('已有员工的 Team 不能切换工作区类型；请创建新的 Team')
  const root=chooseTeamRoot(name,config,config.directoryMode==='bind'?path??store.teamRoots?.[name]:undefined)
  const next={...store,teamSettings:{...store.teamSettings,[name]:config},teamRoots:{...store.teamRoots,[name]:root}}
  if(config.mode==='cloud'&&previous.mode==='cloud')next.sessions=store.sessions.map(card=>card.group===name?{...card,cwd:cloudDirectory(config,cloudRelative(previous,card.cwd)),nativeSessions:nativeSessionRefs(card),remote:undefined,threadId:undefined,claudeSessionId:undefined}:card)
  if(config.mode!=='cloud'&&(config.mode==='work'||config.directoryMode!=='bind'))provisionWorkspace(root,config)
  writeStore(next);return next
}

export function setBounds(name: string, patch: Partial<RoomBounds>): Store {
  const store=readStore(), index=store.groups.indexOf(name)
  if(index<0 && name!=='') throw new Error('Unknown Team')
  // Manual geometry makes the current layout stable; moving one Team never reflows its neighbors.
  store.rooms??={}
  const planned=planOffice(store)
  for(const room of planned)store.rooms[room.name]={...(store.rooms[room.name]??{col:0,row:0,w:1,h:1}),bounds:{...room.bounds,pinned:true}}
  const prev=initialBounds(Math.max(0,index),store.rooms?.[name])
  const bounds={...prev,...patch}
  if(patch.x!==undefined||patch.y!==undefined) bounds.pinned=true
  if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<360||bounds.height<380) throw new Error('Team 尺寸至少为 360 × 380，坐标须为有限数值')
  if(!ROOM_SHAPES.includes(bounds.shape)||!ARRANGEMENTS.includes(bounds.arrangement)) throw new Error('Invalid room shape or arrangement')
  if(bounds.points && (bounds.points.length<3 || bounds.points.some(p=>![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1)))) throw new Error('外框至少需要三个控制点，坐标位于 0–1 范围')
  if(patch.width!==undefined||patch.height!==undefined){const room=planned.find(r=>r.name===name)!;store.sessions=store.sessions.map(c=>c.group===name?{...c,position:room.employees.find(p=>p.card.id===c.id)!.position}:c)}
  if(patch.arrangement && patch.arrangement!==prev.arrangement) store.sessions=store.sessions.map(c=>c.group===name?{...c,position:undefined}:c)
  store.rooms={...store.rooms,[name]:{...(store.rooms?.[name]??{col:0,row:0,w:1,h:1}),bounds}}
  const adjusted=planOffice(store).find(room=>room.name===name)!
  store.sessions=store.sessions.map(card=>card.group===name&&card.position?{...card,position:adjusted.employees.find(e=>e.card.id===card.id)!.position}:card)
  writeStore(store); return store
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

export function setViewport(view: Viewport): Store {
  if(![view.x,view.y,view.zoom].every(Number.isFinite)||view.zoom<.08||view.zoom>3) throw new Error('Invalid canvas viewport')
  const store=readStore(); store.viewport=view; writeStore(store); return store
}

export function getPreferences():Preferences { return {...DEFAULT_PREFERENCES,...readStore().preferences} }
export function setPreferences(patch:Partial<Preferences>):Preferences {
  const value={...getPreferences(),...patch}
  if(!THEMES.includes(value.theme))throw new Error('Unknown theme')
  if(!Number.isFinite(value.zoomSensitivity)||value.zoomSensitivity<.25||value.zoomSensitivity>8)throw new Error('Zoom sensitivity must be between 0.25 and 8')
  if(!Number.isFinite(value.panSensitivity)||value.panSensitivity<.25||value.panSensitivity>4)throw new Error('Pan sensitivity must be between 0.25 and 4')
  if(!Number.isFinite(value.sidebarWidth)||value.sidebarWidth<SIDEBAR_MIN||value.sidebarWidth>SIDEBAR_MAX)throw new Error('Icon sidebar width must be between 56 and 96')
  if(!Number.isFinite(value.pageZoom)||value.pageZoom<.75||value.pageZoom>1.5)throw new Error('Page zoom must be between 0.75 and 1.5')
  if(!Number.isFinite(value.explorerWidth)||value.explorerWidth<140||value.explorerWidth>520)throw new Error('Explorer width must be between 140 and 520')
  if(!Number.isFinite(value.terminalHeight)||value.terminalHeight<120||value.terminalHeight>600)throw new Error('Terminal height must be between 120 and 600')
  if(typeof value.snapEmployees!=='boolean')throw new Error('snapEmployees must be boolean')
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
