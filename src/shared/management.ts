export type PrincipalRef={kind:'operator'}|{kind:'agent';employeeId:string}
export type ManagementRole='employee'|'manager'
export type Delegation={requestedBy:PrincipalRef;relationId?:string;globalGrantId?:string;requestId:string;credentialHash?:string}
export type RequestContext={principal:PrincipalRef;requestId:string;credentialHash?:string}
export type ManagementRelation={id:string;managerId:string;employeeId:string;state:'pending'|'active';requestedBy:PrincipalRef;approvedBy?:PrincipalRef;createdAt:number;updatedAt:number}
export type ManagementAccess={version:1;revision:number;globalManagerIds:string[];globalGrants?:Record<string,string>;relations:ManagementRelation[]}
export type CurrentTask={messageId:string;delegation:Delegation;startedAt:number;runId?:string}
export const emptyAccess=():ManagementAccess=>({version:1,revision:0,globalManagerIds:[],relations:[]})
