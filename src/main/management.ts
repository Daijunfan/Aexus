import {applyManagementLayout} from '../shared/management-layout'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {assertManagementKind,hasGlobalRole,creationRelations,emptyAccess,type ManagementRole,type PrincipalRef,type ManagementTeam} from '../shared/management'
import {readStore,updateStore,writeStore} from './store'
import {employeeSettings,teamSettings} from '../shared/types'
import {getCloudHost} from './cloud-hosts'
import {authorize,callerEmployee,isGlobal,publicEmployee,canControl,requestContext} from './authorization'
import {isManagementRole,isSupervisor,rolePolicy} from '../shared/roles'
import {ensureEmployeeBootstrap} from './plugins/documents'

export function initializeManagement(){
  const previous=readStore(),legacy=previous.access?.version!==2
  const legacyGlobal=(card:typeof previous.sessions[number])=>legacy&&(previous.access?.globalManagerIds?.includes(card.id)||!!previous.access?.managerTeam&&card.group===previous.access.managerTeam)
  const remote=(card:typeof previous.sessions[number])=>card.kind==='cloud-native-worker'||employeeSettings(previous,card).mode==='cloud'
  const invalid=previous.sessions.some(card=>remote(card)&&(isSupervisor(card.managementRole)||legacyGlobal(card)))
  const changedLines=JSON.stringify(previous.access?.relations??[])!==JSON.stringify(creationRelations(previous.sessions))
  if(!legacy&&!invalid&&!changedLines&&!previous.access?.managerTeam&&!previous.access?.globalManagerIds.length)return
  if(previous.sessions.length){mkdirSync(join(APP_HOME,'backups'),{recursive:true});writeFileSync(join(APP_HOME,'backups',`before-employee-roles-${Date.now()}.json`),JSON.stringify(previous,null,2),{mode:0o600})}
  const store=readStore();store.access??=emptyAccess();store.access.version=2
  for(const card of store.sessions){
    card.managementRole??='employee';card.accessMode??='trusted'
    if(remote(card)&&isSupervisor(card.managementRole))card.managementRole='employee'
    else if(!remote(card)&&legacyGlobal(card))card.managementRole='governor'
  }
  delete store.access.managerTeam;store.access.globalManagerIds=[]
  writeStore(store,{reconcileOffice:false})
}

export function managementTopology(team?:string,creator?:string,teamsOnly=false){
  const store=readStore(),principal=requestContext().principal,global=isGlobal(principal),caller=callerEmployee(principal),access=store.access??emptyAccess()
  if(!global&&team&&team!==caller!.group)throw Error('Forbidden Team')
  if(creator!==undefined&&(typeof creator!=='string'||!creator.trim()))throw Error('Creator must be self, others, operator, unknown or an employee ID')
  if(typeof teamsOnly!=='boolean')throw Error('teamsOnly must be boolean')
  const teams:ManagementTeam[]=store.groups.filter(name=>(!team||name===team)&&(global||name===caller!.group)).map(name=>{
    const members=store.sessions.filter(card=>card.group===name)
    const config=teamSettings(store,name),host=config.hostId?getCloudHost(config.hostId):undefined
    let deleteBlockedReason:string|null=null
    try{authorize('group.remove',{name})}catch(error){deleteBlockedReason=(error as Error).message}
    return {name,mode:config.mode,hostId:host?.id,hostName:host?.name,os:host?.os??(process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux'),distribution:host?.distribution,directory:store.teamRoots?.[name],isOwnTeam:name===caller?.group,employeeCount:members.length,governorIds:members.filter(card=>card.managementRole==='governor').map(card=>card.id),allowedActions:deleteBlockedReason?[]:['delete'],deleteBlockedReason}
  })
  const summary={teams:teams.length,employees:teams.reduce((sum,item)=>sum+item.employeeCount,0),deletableTeams:teams.filter(item=>item.allowedActions.includes('delete')).length,blockedTeams:teams.filter(item=>!item.allowedActions.includes('delete')).length}
  if(teamsOnly)return {revision:access.revision,team,teams,summary}
  const actions={read:'session.info',message:'session.send',configure:'config.model',delete:'card.remove',role:'card.management-role'}
  const nodes=store.sessions.filter(c=>!c.deleting&&(!team||c.group===team)&&(global||c.group===caller!.group)).map(card=>{const config=employeeSettings(store,card);return {
    ...publicEmployee(card),
    workspace:{location:config.mode==='cloud'?'cloud':'local',hostId:config.hostId,os:config.remote?.os??(process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux'),distribution:config.remote?.distribution,directory:card.cwd},
    createdByMe:card.createdBy?card.createdBy.kind===principal.kind&&(card.createdBy.kind==='operator'||principal.kind==='agent'&&card.createdBy.employeeId===principal.employeeId):null,
    globalManager:hasGlobalRole(access,card),globalByTeam:false,
    allowedActions:Object.entries(actions).filter(([action,command])=>{try{authorize(command,{id:card.id,...(action==='role'?{role:card.managementRole??'employee'}:{})},card.id);return true}catch{return false}}).map(([action])=>action)
  }}).filter(node=>{
    if(creator===undefined)return true
    if(creator==='self')return node.createdByMe===true
    if(creator==='others')return node.createdByMe===false
    if(creator==='operator')return node.createdBy?.kind==='operator'
    if(creator==='unknown')return node.createdBy===null
    return node.createdBy?.kind==='agent'&&node.createdBy.employeeId===creator
  })
  const ids=new Set(nodes.map(node=>node.id)),relations=creationRelations(store.sessions).filter(r=>ids.has(r.managerId)&&ids.has(r.employeeId)&&(global||isSupervisor(caller!.managementRole)||r.employeeId===caller!.id))
  return {revision:access.revision,managerTeam:null,team,creator,teams,summary,nodes,edges:relations.filter(r=>r.state==='active'),pending:relations.filter(r=>r.state==='pending')}
}
const immutableCreationLine=()=>{throw Error('连线只表示员工的创建来源，无需申请、批准或解绑；Manager 可管理本 Team 的全部 Employee')}
export const requestManagement=(_employee:string,_manager?:string)=>immutableCreationLine()
export const decideManagement=(_id:string,_decision:string)=>immutableCreationLine()
export const unbindManagement=(_id:string)=>immutableCreationLine()
export function setManagementRole(id:string,role:ManagementRole){
  authorize('card.management-role',{id,role},id)
  if(!isManagementRole(role))throw Error('Invalid management role')
  updateStore(store=>{const card=store.sessions.find(c=>c.id===id&&!c.deleting);if(!card)throw Error('Unknown employee');assertManagementKind({...card,managementRole:role},hasGlobalRole(store.access,card),employeeSettings(store,card).mode==='cloud');card.managementRole=role;ensureEmployeeBootstrap(card,store)});return {id,managementRole:role}
}
/** Compatibility alias; all authority still lives in managementRole. */
export function setGlobalManager(id:string,enabled:boolean){
  if(requestContext().principal.kind!=='operator')throw Error('Only the user can grant global authority')
  const card=readStore().sessions.find(card=>card.id===id);if(!card)throw Error('Unknown employee')
  const role=enabled?'governor':hasGlobalRole(undefined,card)?'manager':card.managementRole??'employee'
  const result=setManagementRole(id,role)
  return {...result,globalManager:rolePolicy(role).scope==='global'}
}

export function creationAuthority(principal:PrincipalRef){return {managementRole:'employee' as const,createdBy:principal}}

export function relayoutManagement(team:string){
  authorize('management.relayout',{team})
  const store=updateStore(value=>{applyManagementLayout(value,team)})
  return {team,bounds:store.rooms?.[team]?.bounds,revision:store.revision}
}

/** Legacy discovery only. Team and folder membership no longer grant authority. */
export function setManagerTeam(team:string|null|undefined){
  if(team!==undefined)throw Error('Team 不再授予管理权限；请使用 card.management-role ID governor 设置员工职位')
  const store=readStore()
  return {team:null,members:[],governors:store.sessions.filter(card=>hasGlobalRole(store.access,card)).map(card=>({id:card.id,title:card.title,group:card.group,managementRole:card.managementRole}))}
}
