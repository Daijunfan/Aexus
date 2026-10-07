import {rolePolicy,type ManagementRole} from './roles'
export type {ManagementRole} from './roles'
export type PrincipalRef={kind:'operator'}|{kind:'agent';employeeId:string}
export type Delegation={engineScope?:string;requestedBy:PrincipalRef;relationId?:string;globalGrantId?:string;requestId:string;credentialHash?:string;selfSchedule?:true;channelTrigger?:{channelId:string;entryId:string;batchId:string;employeeId:string};schedule?:{channelId?:string;eventChannelId?:string};groupNotice?:{groupId:string;messageId:string;employeeId:string};channelNotice?:{channelId:string;entryId:string;employeeId:string}}
export type RequestContext={principal:PrincipalRef;requestId:string;credentialHash?:string;clientId?:string;engineScope?:string|null}
export type ManagementRelation={id:string;managerId:string;employeeId:string;state:'pending'|'active';requestedBy:PrincipalRef;approvedBy?:PrincipalRef;createdAt:number;updatedAt:number;origin?:'binding'}
/** Explicit visual overrides, including disabled creation lines. Never used for authorization. */
export type ManagementBinding=Omit<ManagementRelation,'state'|'approvedBy'|'origin'>&{enabled:boolean}
/** Version 1 fields remain readable only for one-time migration; version 2 uses employee roles. */
export type ManagementAccess={managerTeam?:string;version:1|2;revision:number;globalManagerIds:string[];globalGrants?:Record<string,string>;relations:ManagementRelation[];bindings?:ManagementBinding[]}
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

/** Merge historical creation lines with pair-specific visual choices. Multiple sources are allowed. */
export function managementRelations(cards:Parameters<typeof creationRelations>[0],bindings:ManagementBinding[]=[]):ManagementRelation[]{
  const pair=(source:string,target:string)=>JSON.stringify([source,target])
  const nodes=new Map(cards.map(card=>[card.id,card]))
  const edges=new Map(creationRelations(cards).map(edge=>[pair(edge.managerId,edge.employeeId),edge]))
  for(const binding of bindings){
    const key=pair(binding.managerId,binding.employeeId)
    if(!binding.enabled){edges.delete(key);continue}
    const source=nodes.get(binding.managerId),target=nodes.get(binding.employeeId)
    if(!source||!target||source.deleting||target.deleting||source.id===target.id)continue
    const policy=rolePolicy(source.managementRole)
    if(!policy.controls.includes(target.managementRole??'employee')||(policy.scope!=='global'&&source.group!==target.group))continue
    // Rebinding an original creator keeps the historical edge ID and provenance.
    if(!edges.has(key))edges.set(key,{id:binding.id,managerId:source.id,employeeId:target.id,state:'active',requestedBy:binding.requestedBy,createdAt:binding.createdAt,updatedAt:binding.updatedAt,origin:'binding'})
  }
  return [...edges.values()]
}

/** Only roles explicitly marked requiresLocal constrain engine/workspace location. */
export function assertManagementKind(card:{kind?:string;group?:string;managementRole?:ManagementRole},global=false,cloudWorkspace=false){
  if((card.kind==='cloud-native-worker'||cloudWorkspace)&&rolePolicy(card.managementRole).requiresLocal)throw new Error('Secretary 必须在 Core 所在主机本地运行且使用本地工作区；Manager / Governor 可使用云端环境')
}
export function hasGlobalRole(_access:ManagementAccess|undefined,card:ManagedIdentity|undefined){
  return !!card&&!card.deleting&&rolePolicy(card.managementRole).scope==='global'
}

export type CurrentTask={messageId:string;delegation:Delegation;startedAt:number;runId?:string;viewId?:string;sourceView?:import('./message-source').MessageSourceView;chat?:import('./chat-groups').SharedTaskContext}

/** Live communication or a running task with authenticated delegation; never completed-call replay.
 * highlighted is a short visual cue, independent of this record's actual lifetime. */
export type ManagementInteraction={managerId:string;employeeId:string;command:string;requestId:string;startedAt:number;kind?:'request'|'task';messageId?:string;highlighted?:boolean}
export type ManagementActivity={revision:number;interactions:ManagementInteraction[]}

/** Team permissions are computed from the complete roster, never a filtered list of employee nodes. */
export type ManagementTeam={name:string;mode:'work'|'build'|'cloud';hostId?:string;hostName?:string;os:string;distribution?:string;directory?:string;isOwnTeam:boolean;employeeCount:number;governorIds:string[];allowedActions:Array<'delete'>;deleteBlockedReason:string|null}
