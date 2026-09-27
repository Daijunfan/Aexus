import {remoteTarget} from '../shared/remote'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { posix,win32,dirname, isAbsolute, relative, resolve, sep,join } from 'node:path'
import {homedir} from 'node:os'
import {employeeDirectoryName} from '../shared/office'
import { APP_HOME } from '../shared/protocol'
import {requirePlugin} from './plugins/registry'
import {managerCliRoot} from './exec'
import type { Store, StoredSession, TeamSettings } from '../shared/types'
import { teamSettings,employeeSettings } from '../shared/types'
export { employeeDirectoryName as workspaceName } from '../shared/office'

/** User files live under the persistent plugin source, never inside the packaged App. */
export function pluginWorkspaceBase(id:string):string {
  const plugin=requirePlugin(id),marker=join(plugin.directory,'source-location.json')
  const source=existsSync(marker)?JSON.parse(readFileSync(marker,'utf8')).source:undefined
  // Valid legacy development markers remain compatible; release packages have none.
  if(!process.env.AGENTS_COMPANY_WORKSPACES&&typeof source==='string'&&existsSync(source))return join(realpathSync(source),'workspaces')
  return resolve(process.env.AGENTS_COMPANY_WORKSPACES||join(APP_HOME,'workspaces'),plugin.workspaceDirectory||`${plugin.id}-workspace`)
}

/** Previous direct-plugin workspace, retained so the first open can import its files. */
export function legacyPluginWorkspace(id:string):string {
  const plugin=requirePlugin(id)
  return join(process.env.AGENTS_COMPANY_WORKSPACES||join(homedir(),'develop','Agents-company-workspace'),plugin.workspaceDirectory||`${plugin.id}-workspace`)
}

export function inside(root: string, path: string): boolean {
  const part = relative(root, path)
  return !!part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

export function employeeRoot(store:Store,card:{group:string;workEnvironment?:import('../shared/types').WorkEnvironment;localWorkspaceRoot?:string}){
  return teamSettings(store,card.group).mode==='cloud'&&card.workEnvironment==='local'?card.localWorkspaceRoot??defaultTeamRoot(card.group,{mode:'build'}):store.teamRoots?.[card.group]
}

export function defaultTeamRoot(name:string,settings:TeamSettings={mode:'build'}):string {
  const clean=name.trim()
  if(clean&& (clean==='.'||clean==='..'||/[\\/\0]/.test(clean)))throw new Error('Team 名称不能包含路径分隔符或使用 . / ..')
  if(settings.mode==='work') {
    return join(pluginWorkspaceBase(settings.pluginId||''),clean||'default')
  }
  if(!clean||clean==='.'||clean==='..'||/[\\/\0]/.test(clean))throw new Error('Team 名称不能包含路径分隔符或使用 . / ..')
  return join(process.env.AGENTS_COMPANY_PROJECTS||join(homedir(),'develop','Agents-company-projects'),clean)
}

export function managedTeamRoot(name:string,settings:TeamSettings,path?:string):string {
  if(settings.mode==='cloud')throw new Error('云主机使用 Team 配置中的远端目录，不生成本机目录')
  const suggested=defaultTeamRoot(name,settings),base=teamRoot(dirname(suggested),'preview',settings.mode==='work'),expected=teamRoot(suggested,'preview',settings.mode==='work')
  if(!inside(base,expected))throw new Error('工作目录链接不能指向规定的目录范围以外')
  if(path&&teamRoot(path,'preview',settings.mode==='work')!==expected)throw new Error(`此 Team 的工作目录固定为 ${expected}`)
  return expected
}

/** Work Teams use one fixed plugin-owned folder; Build Teams may bind a folder. */
export function chooseTeamRoot(name:string,settings:TeamSettings,path?:string,preview=false):string {
  if(settings.mode==='cloud'){const remote=remoteTarget(settings.remote);if(!remote)throw new Error('云主机 Team 缺少连接配置');return remote.directory}
  if(settings.mode==='work')return teamRoot(managedTeamRoot(name,settings,path),preview?'preview':true,true)
  if(settings.directoryMode!=='bind')return teamRoot(managedTeamRoot(name,settings,path),preview?'preview':true)
  return teamRoot(path||'')
}

export function teamRoot(path: string,create:boolean|'preview'=false,pluginWorkspace=false): string {
  if (!path || !isAbsolute(path)) throw new Error('Team 必须绑定一个已存在的外部文件夹（绝对路径）')
  let ancestor=resolve(path);while(!existsSync(ancestor))ancestor=dirname(ancestor)
  if(!statSync(ancestor).isDirectory())throw new Error('Team 根目录必须是文件夹')
  const root=resolve(realpathSync(ancestor),relative(ancestor,resolve(path)))
  const appHome = existsSync(APP_HOME) ? realpathSync(APP_HOME) : resolve(APP_HOME)
  if ((root === appHome || inside(appHome, root))&&!pluginWorkspace) throw new Error('请选择应用数据目录以外的 Team 文件夹')
  if(create==='preview')return root
  if(create)mkdirSync(root,{recursive:true})
  if(!existsSync(root))throw new Error('Team 根目录不存在，请选择文件夹或允许创建目录')
  return root
}

export function employeeWorkspace(store: Store, group: string, input: string, id?: string, create: boolean | 'preview' = false, directoryMode?: 'create'|'existing',workEnvironment?:import('../shared/types').WorkEnvironment): string {
  const existing=store.sessions.find(card=>card.id===id)
  const identity={group,workEnvironment:workEnvironment??existing?.workEnvironment,localWorkspaceRoot:existing?.group===group?existing.localWorkspaceRoot:undefined},config=employeeSettings(store,identity)
  const configured = employeeRoot(store,identity)
  if (!group || !store.groups.includes(group) || !configured) throw new Error('请先为所属 Team 绑定外部根目录')
  if(config.mode==='cloud')return cloudDirectory(config,input)
  const work=config.mode==='work'
  const root = identity.workEnvironment==='local'&&!existsSync(configured)?resolve(configured):teamRoot(configured,false,work)
  if(root!==configured)throw new Error('Team 根目录已被移动或替换，请重新绑定目录')
  const manager=managerCliRoot(root)===root
  if (!input?.trim()) throw new Error('请选择员工的工作文件夹')
  const target = resolve(root, input)
  let ancestor = target
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const actualAncestor = realpathSync(ancestor)
  if(!statSync(actualAncestor).isDirectory()) throw new Error('员工工作空间必须是文件夹')
  if ((work||manager) && actualAncestor !== root && !inside(root, actualAncestor)) throw new Error('工作目录超出所属 Team 的范围，请选择 Team 根目录或其子目录')
  const prospective=resolve(actualAncestor,relative(ancestor,target))
  if((work||manager)&&prospective===root)throw new Error('员工必须使用 Team 根目录中的子文件夹，不能直接使用 Team 根目录')
  if((work||manager)&&prospective!==root&&!inside(root,prospective))throw new Error('员工工作空间必须位于 Team 根目录或其子文件夹中')
  const appHome=existsSync(APP_HOME)?realpathSync(APP_HOME):resolve(APP_HOME)
  if((prospective===appHome||inside(appHome,prospective))&&!(work&&inside(pluginWorkspaceBase(teamSettings(store,group).pluginId!),prospective))) throw new Error('员工工作空间不能使用应用数据目录')
  for (const card of store.sessions) {
    if (card.id === id||!(work||manager)) continue
    const needsComparison =
      (work && teamSettings(store, card.group).mode === 'work') ||
      (manager && card.group === group)
    if (!needsComparison||employeeSettings(store,card).mode==='cloud') continue
    const other = existsSync(card.cwd)?realpathSync(card.cwd):resolve(card.cwd)
    if (other===prospective) throw new Error('该 Team 的一个文件夹只能对应一名员工；可以选择父目录或嵌套子目录')
  }
  if(directoryMode&&!['create','existing'].includes(directoryMode))throw new Error('目录方式必须为 create 或 existing')
  if(directoryMode==='create'&&existsSync(target))throw new Error('这个文件夹已存在，请选择“绑定已有文件夹”')
  if(directoryMode==='existing'&&!existsSync(target))throw new Error('所选文件夹不存在，请绑定已有文件夹或选择默认生成')
  if(create==='preview')return prospective
  if (create) mkdirSync(target, { recursive: true })
  if(!existsSync(target))throw new Error('员工工作目录已不存在，请在员工资料中重新选择目录')
  const cwd = realpathSync(target)
  if ((work&&cwd!==root&&!inside(root, cwd)) || !statSync(cwd).isDirectory()) throw new Error('工作空间必须是 Team 内部的真实文件夹')
  if((cwd===appHome||inside(appHome,cwd))&&!(work&&inside(pluginWorkspaceBase(teamSettings(store,group).pluginId!),cwd))) throw new Error('员工工作空间不能使用应用数据目录')
  return cwd
}

export function executionEmployee(store:Store,card:StoredSession):StoredSession {
  const config=employeeSettings(store,card)
  return {...card,remote:config.mode==='cloud'?{...config.remote!,directory:card.cwd}:null}
}
export function cloudDirectory(settings:TeamSettings,input:string):string {
  const remote=remoteTarget(settings.remote)
  if(!remote)throw new Error('云主机 Team 缺少连接配置')
  const paths=remote.os==='windows'?win32:posix,root=paths.resolve(remote.directory),target=paths.resolve(root,input),part=paths.relative(root,target)
  if(/[\0\r\n]/.test(input)||part==='..'||part.startsWith('..'+paths.sep)||paths.isAbsolute(part))throw new Error('员工目录必须位于云主机 Team 工作目录内')
  return target
}
export function cloudRelative(settings:TeamSettings,input:string){const paths=settings.remote?.os==='windows'?win32:posix;return paths.relative(settings.remote!.directory,cloudDirectory(settings,input)).split(paths.sep).join('/')||'.'}
export function workspaceStatus(store: Store, card: StoredSession): StoredSession {
  const resolved=executionEmployee(store,card)
  try { employeeWorkspace(store,card.group,card.cwd,card.id); return {...resolved,workspaceError:undefined} }
  catch(error){return {...resolved,workspaceError:error instanceof Error?error.message:String(error)}}
}

/** Creation has two choices. Explicit legacy cwd/create calls remain CLI-compatible. */
export function chooseEmployeeWorkspace(store:Store,group:string,title:string,input?:string,mode?:string,id?:string,preview=false,workEnvironment?:import('../shared/types').WorkEnvironment):string {
  if(mode!==undefined&&!['default','bind','create','existing'].includes(mode))throw new Error('请选择默认生成或绑定已有文件夹')
  if(mode==='default'||(!mode&&!input)) {
    const name=String(title??'').trim()
    if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))throw new Error('默认文件夹必须与员工同名；名字不能含路径分隔符，请修改名字或绑定已有文件夹')
    const existing=store.sessions.find(card=>card.id===id)
    const root=employeeRoot(store,{group,workEnvironment:workEnvironment??existing?.workEnvironment,localWorkspaceRoot:existing?.group===group?existing.localWorkspaceRoot:undefined})
    if(!root)throw new Error('请先为所属 Team 配置工作区')
    const target=resolve(root,name)
    if(input&&resolve(root,input)!==target)throw new Error('默认工作目录由员工名字生成，不能指定其他路径')
    const own=id&&store.sessions.find(c=>c.id===id)?.cwd===target
    return employeeWorkspace(store,group,target,id,preview?'preview':true,own?'existing':'create',workEnvironment)
  }
  const existing=mode==='bind'||mode==='existing'
  return employeeWorkspace(store,group,input||'',id,preview?'preview':!existing,existing?'existing':mode==='create'?'create':undefined,workEnvironment)
}
