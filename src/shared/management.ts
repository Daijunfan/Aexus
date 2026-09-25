export type PrincipalRef={kind:'operator'}|{kind:'agent';employeeId:string}
export type ManagementRole='employee'|'manager'
export type Delegation={requestedBy:PrincipalRef;relationId?:string;globalGrantId?:string;requestId:string;credentialHash?:string}
export type RequestContext={principal:PrincipalRef;requestId:string;credentialHash?:string}
export type ManagementRelation={id:string;managerId:string;employeeId:string;state:'pending'|'active';requestedBy:PrincipalRef;approvedBy?:PrincipalRef;createdAt:number;updatedAt:number}
export type ManagementAccess={version:1;revision:number;globalManagerIds:string[];globalGrants?:Record<string,string>;relations:ManagementRelation[]}
export type CurrentTask={messageId:string;delegation:Delegation;startedAt:number;runId?:string}
export const emptyAccess=():ManagementAccess=>({version:1,revision:0,globalManagerIds:[],relations:[]})

/** A native cloud engine must never acquire company management authority. */
export function assertManagementKind(card:{kind?:string;managementRole?:ManagementRole},global=false){
  if(card.kind==='cloud-native-worker'&&(card.managementRole==='manager'||global))throw new Error('Manager 必须是本地员工；云端原生员工只能担任 Employee')
}
