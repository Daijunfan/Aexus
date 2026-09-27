import {rolePolicy,type ManagementRole} from './roles'
export type {ManagementRole} from './roles'
export type PrincipalRef={kind:'operator'}|{kind:'agent';employeeId:string}
export type Delegation={requestedBy:PrincipalRef;relationId?:string;globalGrantId?:string;requestId:string;credentialHash?:string}
export type RequestContext={principal:PrincipalRef;requestId:string;credentialHash?:string;clientId?:string}
export type ManagementRelation={id:string;managerId:string;employeeId:string;state:'pending'|'active';requestedBy:PrincipalRef;approvedBy?:PrincipalRef;createdAt:number;updatedAt:number}
/** Version 1 fields remain readable only for one-time migration; version 2 uses employee roles. */
export type ManagementAccess={managerTeam?:string;version:1|2;revision:number;globalManagerIds:string[];globalGrants?:Record<string,string>;relations:ManagementRelation[]}
export type ManagedIdentity={id:string;group:string;kind?:string;managementRole?:ManagementRole;deleting?:boolean}
export const emptyAccess=():ManagementAccess=>({version:2,revision:0,globalManagerIds:[],relations:[]})

/** Lines are provenance only. User-created employees have no line. */
export function creationRelations(cards:Array<ManagedIdentity&{createdBy?:PrincipalRef;createdAt:number}>):ManagementRelation[]{
  const byId=new Map(cards.map(card=>[card.id,card]))
  return cards.flatMap(employee=>{
    const source=employee.createdBy?.kind==='agent'?byId.get(employee.createdBy.employeeId):undefined
    if(!source||source.deleting||employee.deleting||!rolePolicy(source.managementRole).creates.includes(employee.managementRole??'employee')||(source.group!==employee.group&&rolePolicy(source.managementRole).scope!=='global')||source.id===employee.id)return []
    return [{id:'created-'+employee.id,managerId:source.id,employeeId:employee.id,state:'active' as const,requestedBy:employee.createdBy!,createdAt:employee.createdAt,updatedAt:employee.createdAt}]
  })
}

/** Management requires a local engine and an effective local workspace. */
export function assertManagementKind(card:{kind?:string;group?:string;managementRole?:ManagementRole},global=false,cloudWorkspace=false){
  if((card.kind==='cloud-native-worker'||cloudWorkspace)&&(rolePolicy(card.managementRole).requiresLocal||global))throw new Error('Manager / Governor 必须在 Core 所在主机本地运行且使用本地工作区；云端工作环境只能担任 Employee')
}
export function hasGlobalRole(_access:ManagementAccess|undefined,card:ManagedIdentity|undefined){
  return !!card&&!card.deleting&&card.kind!=='cloud-native-worker'&&rolePolicy(card.managementRole).scope==='global'
}

export type CurrentTask={messageId:string;delegation:Delegation;startedAt:number;runId?:string;viewId?:string}

/** Short-lived API activity, independent of creation provenance and employee task duration. */
export type ManagementInteraction={managerId:string;employeeId:string;command:string;requestId:string;startedAt:number;expiresAt?:number}
export type ManagementActivity={revision:number;interactions:ManagementInteraction[]}

/** Team permissions are computed from the complete roster, never a filtered list of employee nodes. */
export type ManagementTeam={name:string;mode:'work'|'build'|'cloud';hostId?:string;hostName?:string;os:string;distribution?:string;directory?:string;isOwnTeam:boolean;employeeCount:number;governorIds:string[];allowedActions:Array<'delete'>;deleteBlockedReason:string|null}
