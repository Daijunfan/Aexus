import {acceptsPresentationEvent,type PresentationEvent} from '../../shared/presentation-events'
import {createWebApi} from './web/transport'
import type {Request} from '../../shared/protocol'
export type RequestOptions={engineScope?:string|null}
export type AgentsApi={
 readonly mode?:'desktop'|'web'
 readonly platform?:'macos'|'linux'|'windows'
 filePath(file:File):string
 rendererReady():void
 call<T=any>(cmd:Request['cmd'],args?:Request['args'],options?:RequestOptions):Promise<T>
 onEvent(handler:(event:PresentationEvent<any>)=>void):()=>void
 onUiRequest(handler:(request:{id:string;op:string;args:Record<string,unknown>})=>void):()=>void
 answerUi(answer:{id:string;data?:unknown;error?:string}):void
 openExternal(url:string):Promise<void>
}
declare global{interface Window{agents:AgentsApi}}
let scope:string|null|undefined,epoch=0,minimumViewRevision=0
export function selectEngineScope(next:string|null,viewRevision=0){
 if(next!==scope){scope=next;epoch++;minimumViewRevision=Number.isSafeInteger(viewRevision)&&viewRevision>=0?viewRevision:0}
}
export const selectedEngineScope=()=>scope
const transport=window.agents??createWebApi()
export const api:AgentsApi={...transport,onEvent:handler=>transport.onEvent(event=>{
 if(acceptsPresentationEvent(event,scope,minimumViewRevision))handler(event)
}),call:async<T>(cmd:Request['cmd'],args?:Request['args'],options?:RequestOptions):Promise<T>=>{
 const generation=epoch,selected=options&&Object.hasOwn(options,'engineScope')?options.engineScope:scope
 try{
  const result=await transport.call<T>(cmd,args,selected!==undefined?{engineScope:selected}:undefined)
  // A late read cannot populate a newly mounted Engine. Its mutation is not replayed.
  if(generation!==epoch&&!cmd.startsWith('view.'))throw Object.assign(Error('Workspace changed; the previous response was discarded.'),{code:'ENGINE_SCOPE_STALE'})
  return result
 }catch(error){if(error instanceof Error)throw error;const value=error as {message?:string;code?:string};throw Object.assign(Error(value?.message??String(error)),value?.code?{code:value.code}:{})}
}}
if(!window.agents)window.agents=api
