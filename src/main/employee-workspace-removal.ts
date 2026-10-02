import fs from 'node:fs'
import path from 'node:path'
import {homedir} from 'node:os'
import {APP_HOME} from '../shared/protocol'
import {teamSettings,employeeSettings,type TeamSettings} from '../shared/types'
import {readStore} from './store'
import {cloudRelative,inside,employeeRoot} from './workspaces'
import {remoteFiles,teamConnectionId} from './tunnel'
import {cloudNativeTarget} from './cloud-native'
import {listCloudHosts} from './cloud-hosts'

/** Called only by explicit card.remove --delete-workspace, before record removal. */
export async function removeEmployeeWorkspace(id:string,preview=false,removing={employees:new Set([id]),teams:new Set<string>()}){
  const store=readStore(),card=store.sessions.find(card=>card.id===id)
  if(!card)throw Error('Unknown employee')
  const config=employeeSettings(store,card),remote=config.mode==='cloud'
  const sameHost=(other:TeamSettings)=>remote
    ?other.mode==='cloud'&&(!!config.hostId&&other.hostId===config.hostId||other.remote?.host===config.remote?.host&&(other.remote?.port??22)===(config.remote?.port??22))
    :other.mode!=='cloud'
  const protectedPaths=[...store.sessions.filter(c=>c.workEnvironment==='local'&&!removing.teams.has(c.group)&&sameHost(employeeSettings(store,c))).map(c=>employeeRoot(store,c)!),...Object.entries(store.teamRoots??{}).filter(([team])=>!removing.teams.has(team)&&sameHost(teamSettings(store,team))).map(([,root])=>root),
    ...store.sessions.filter(other=>!removing.employees.has(other.id)&&sameHost(employeeSettings(store,other))).map(other=>other.cwd)]
  if(remote){
    if(card.kind==='cloud-native-worker')cloudNativeTarget(card)
    const result=await remoteFiles(teamConnectionId(card.group),config.remote!,'remove-directory',{path:cloudRelative(config,card.cwd),protectedPaths,preview,allowRoot:removing.teams.has(card.group)})
    return {...result,key:JSON.stringify([config.remote!.host,config.remote!.port??22,config.remote!.jump,config.remote!.os==='windows'?result.path.toLowerCase():result.path])} as {removed:boolean;path:string;key:string}
  }
  const canonical=(file:string)=>fs.existsSync(file)?fs.realpathSync(file):path.resolve(file)
  const directory=canonical(card.cwd)
  const contains=(file:string)=>file===directory||inside(directory,file)
  const sshFiles=listCloudHosts().flatMap(host=>[host.identityFile,host.knownHosts,host.sshConfig].filter((file):file is string=>!!file).flatMap(file=>{
    const configured=file.startsWith('~/')?path.join(homedir(),file.slice(2)):file
    return [path.join(canonical(path.dirname(configured)),path.basename(configured)),canonical(configured)]
  }))
  if(sshFiles.some(contains))throw Error('工作文件夹包含云主机仍在使用的 SSH 文件，请先在 Cloud Hosts 迁移私钥、known_hosts 或 SSH 配置，或选择 only employee')
  if(directory===path.parse(directory).root||directory===canonical(homedir())||[APP_HOME,...protectedPaths].map(canonical).some(contains))throw Error('工作文件夹仍被其他员工、Team 或宿主使用，请选择 only employee')
  if(fs.existsSync(card.cwd)){
    const stat=fs.lstatSync(card.cwd)
    if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('工作目录不是普通文件夹，请选择 only employee')
    if(!preview)fs.rmSync(directory,{recursive:true,force:true})
  }
  return {removed:!preview,path:directory,key:JSON.stringify(['local',directory])}
}
