import type {ContractClient} from '../../Contract/protocol'
export type AuditInput={team:string;hidden?:boolean}
export type AuditReport={engineId:'workspace-audit';team:string;createdAt:string;workspaces:{employeeId:string|null;name:string;path:string;files:number;folders:number;entries:{name:string;directory:boolean;bytes:number}[]}[];acceptance:{passed:true;checks:string[]}}
export function runAudit(client:ContractClient,input:AuditInput):Promise<AuditReport>
