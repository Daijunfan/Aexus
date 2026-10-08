/** Durable business workflows. Domain state stays private to the installed Engine. */
import type {ContractClient} from './protocol'
export type WorkflowStatus='running'|'waiting'|'paused'|'completed'|'failed'|'cancelled'
export type WorkflowFile={name:string;mediaType:string;description:string;bytes:number;sha256:string;encoding?:'utf8'|'base64'}
export type WorkflowView={id:string;engineId:string;engineVersion:string;status:WorkflowStatus;revision:number;createdAt:number;updatedAt:number;summary:Record<string,any>;files:WorkflowFile[];error?:string;controlPending?:boolean}
/** Returned only by an explicit workflow.get({id,ifRevision}) cache validation. */
export type WorkflowUnchanged={id:string;engineId:string;revision:number;unchanged:true}
export type WorkflowRead=WorkflowView|WorkflowUnchanged
export type WorkflowArtifact={name:string;mediaType:string;description:string;content:string;encoding?:'utf8'|'base64'}
export type WorkflowContext={id:string;client:ContractClient;signal:AbortSignal;checkpoint:(state:any)=>Promise<void>}
export type WorkflowResult={status:'waiting'|'completed';state:any;artifacts?:WorkflowArtifact[]}
export interface WorkflowRuntime{
 /** Explicit, tested additive compatibility; no implicit version migration. */
 compatibleVersions?:string[]
 /** Stop only owned native tasks. Mutations of state are persisted after cleanup. */
 pause?(state:any,context:WorkflowContext):Promise<void>
 /** Pure owner-authorized revision while paused. Must invalidate obsolete results. */
 amend?(state:any,update:Record<string,unknown>):any
 create(input:Record<string,unknown>):any
 describe(state:any):Record<string,any>
 respond(state:any,answer:Record<string,unknown>):any
 run(state:any,context:WorkflowContext):Promise<WorkflowResult>
 retry?(state:any):any
 cancel?(state:any,context:WorkflowContext):Promise<void>
}
