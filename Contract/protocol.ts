/** Aexus Engine ⇄ Infra, protocol v1. No import of Infra implementation is allowed here. */
export const CONTRACT_VERSION='1.0.0' as const
export type Json=string|number|boolean|null|Json[]|{[key:string]:Json}
export type Arguments=Record<string,unknown>
export type Rpc=(command:string,args?:Arguments)=>Promise<unknown>
export type ContractResult<T=unknown>={contractVersion:typeof CONTRACT_VERSION;command:string;data:T}
export type CommandDescriptor={name:string;summary:string;permission:string;inputSchema:Record<string,unknown>;schemaSource:'registry'|'legacy-documentation';documentation:string;readOnly:boolean;effect:'read'|'write'|'conditional';domain:string;transport:'request'|'stream'}
export interface ContractClient{
 invoke<T=unknown>(command:string,args?:Arguments):Promise<T>
 describe(command?:string):Promise<unknown>
 info():Promise<unknown>
 /** Optional, scoped invalidation hint for an owned workflow. Always re-read with workflow.get. */
 watchWorkflow?(id:string,onChanged:()=>void):()=>void
}
export function contractError(code:string,message:string):Error&{code:string}{return Object.assign(new Error(message),{code})}
export function requireVersion(version:unknown){
 if(version!==CONTRACT_VERSION)throw contractError('CONTRACT_VERSION_UNSUPPORTED',`Unsupported Contract version ${String(version)}; expected ${CONTRACT_VERSION}`)
}
export type ContractEvent={channel:string;payload?:unknown}
export type ContractSubscribe=(handler:(event:ContractEvent)=>void)=>()=>void
export function createContractClient(rpc:Rpc,subscribe?:ContractSubscribe):ContractClient{
 return {
  async invoke<T>(command:string,args:Arguments={}){
   const value=await rpc('contract.call',{version:CONTRACT_VERSION,command,args}) as ContractResult<T>
   if(!value||value.contractVersion!==CONTRACT_VERSION||value.command!==command)throw contractError('CONTRACT_RESPONSE_INVALID','Contract response did not match the request')
   return value.data
  },
  describe:command=>rpc('contract.describe',{version:CONTRACT_VERSION,...(command?{command}:{})}),
  info:()=>rpc('contract.info',{}),
  ...(subscribe?{watchWorkflow:(id:string,onChanged:()=>void)=>subscribe(event=>{
   if(event.channel!=='workflow:changed'||!event.payload||typeof event.payload!=='object')return
   const payload=event.payload as {id?:unknown;engineId?:unknown;revision?:unknown}
   if(payload.id===id&&typeof payload.engineId==='string'&&Number.isSafeInteger(payload.revision))onChanged()
  })}:{})
 }
}
