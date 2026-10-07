import type {ContractClient} from '../../Contract/protocol'
import type {WorkflowView,WorkflowFile} from '../../Contract/workflow'
export const ENGINE_ID:string
export function startProfile(client:ContractClient,input:Record<string,unknown>,clientRequestId:string):Promise<WorkflowView>
export function readWord(client:ContractClient,jobId:string,file:WorkflowFile):Promise<Uint8Array<ArrayBuffer>>
