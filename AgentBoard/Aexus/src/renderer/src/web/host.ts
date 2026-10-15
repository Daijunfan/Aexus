import {useSyncExternalStore} from 'react'
import type {AgentsApi} from '../api'
import type {ViewState} from '../../../shared/view'
import {employeeReady,type StoredSession} from '../../../shared/types'

/**
 * CloudHosts Role Board owns the outer Company/Messages/Plan tabs. A single
 * Aexus React tree and the original authenticated AgentsApi own the content.
 * This adapter carries presentation/lifecycle messages only; it never copies
 * business state or grants arbitrary native execution to the web renderer.
 */
declare global {
  interface Window {
    __CLOUDHOSTS_AEXUS_EMBEDDED__?: boolean
    webkit?: {messageHandlers?: {cloudHostsAgentBoard?: {postMessage:(value:unknown)=>void}}}
  }
}

export type HostedTab='company'|'messages'|'plan'
export type HostActivity=Readonly<{visible:boolean;focused:boolean}>
type Envelope={
  protocolVersion:1
  instanceId:string
  requestId:string
  type:string
  payload:Record<string,unknown>
  windowId:string
  clientId:string
  nonce:string
}
type Binding={instanceId:string;windowId:string;nonce:string;origin:string;capabilities:Set<string>;clientId:string}
type PendingNative={resolve:(value:unknown)=>void;reject:(cause:Error)=>void;timer:ReturnType<typeof setTimeout>}
const params=new URLSearchParams(location.search)
export const isCloudHostsEmbedded=window.__CLOUDHOSTS_AEXUS_EMBEDDED__===true||params.get('aexus-host')==='cloudhosts'
const inactive:HostActivity=Object.freeze({visible:false,focused:false})
const standalone:HostActivity=Object.freeze({visible:true,focused:true})
let activity:HostActivity=isCloudHostsEmbedded?inactive:standalone
let runtimeState='starting'
let binding:Binding|undefined
let parentOrigin:string|undefined
let activeTab:HostedTab='company'
let suppressTab:HostedTab|undefined
let suppressUntil=0
const activityListeners=new Set<()=>void>()
const flushers=new Set<()=>Promise<void>>()
const pendingNative=new Map<string,PendingNative>()
const EMPTY=Object.freeze({})

export const currentHostActivity=()=>activity
export const useHostActivity=()=>useSyncExternalStore(subscribeHostActivity,currentHostActivity,currentHostActivity)
export const hostMayMarkRead=()=>isCloudHostsEmbedded?(activity.visible&&activity.focused):(document.visibilityState==='visible'&&document.hasFocus())
export const hostRuntimeState=()=>runtimeState
function subscribeHostActivity(listener:()=>void){activityListeners.add(listener);return()=>{activityListeners.delete(listener)}}
export function onHostActivity(listener:()=>void){return subscribeHostActivity(listener)}
export function onHostedFlush(flusher:()=>Promise<void>){if(!isCloudHostsEmbedded)return()=>{};flushers.add(flusher);return()=>{flushers.delete(flusher)}}
function updateActivity(next:HostActivity){
  if(activity.visible===next.visible&&activity.focused===next.focused)return
  activity=Object.freeze(next)
  document.documentElement.dataset.hostVisible=String(next.visible)
  document.documentElement.dataset.hostFocused=String(next.focused)
  for(const listener of activityListeners)listener()
}
const id=()=>crypto.randomUUID()
const asObject=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:EMPTY
function valid(value:unknown):value is Envelope{
  const item=asObject(value)
  return item.protocolVersion===1&&typeof item.instanceId==='string'&&item.instanceId.length>0
    &&typeof item.requestId==='string'&&item.requestId.length>0
    &&typeof item.type==='string'&&typeof item.windowId==='string'&&item.windowId.length>0
    &&typeof item.clientId==='string'&&item.clientId.length>0
    &&item.payload!==null&&typeof item.payload==='object'&&!Array.isArray(item.payload)
}
function emit(type:string,payload:Record<string,unknown>,requestId:string=id()){
  if(!binding)return false
  const envelope:Envelope={protocolVersion:1,instanceId:binding.instanceId,windowId:binding.windowId,
    clientId:binding.clientId,nonce:binding.nonce,requestId,type,payload}
  const handler=window.webkit?.messageHandlers?.cloudHostsAgentBoard
  if(handler){handler.postMessage(envelope);return true}
  if(parentOrigin&&window.parent!==window){window.parent.postMessage(envelope,parentOrigin);return true}
  return false
}
function failure(requestId:string,code:string,message:string){
  emit('protocol.error',{code,message},requestId)
}
async function flushState(){
  if(!flushers.size)throw Error('No mounted UI persistence handlers are available')
  // A rejected draft or preference write must be reported, never acknowledged
  // as successfully persisted to the host.
  const tasks=[...flushers]
  const results=await Promise.allSettled(tasks.map(task=>task()))
  const errors=results.flatMap((result,index)=>result.status==='rejected'?[{index,message:result.reason instanceof Error?result.reason.message:String(result.reason)}]:[])
  if(errors.length)throw Error('Save failed: '+errors.map(value=>value.message).join('; '))
  return tasks.length
}
export async function requestHostedNative(capability:string,payload:Record<string,unknown>):Promise<unknown>{
  if(!binding||!binding.capabilities.has(capability))throw Error('Host native capability unavailable: '+capability)
  if(pendingNative.size>=12)throw Error('Too many pending native requests')
  const requestId=id()
  return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pendingNative.delete(requestId);reject(Error('Host native request timed out'))},capability==='folder.pick'||capability==='file.pick'?130000:15000)
    pendingNative.set(requestId,{resolve,reject,timer})
    if(!emit('native.request',{capability,args:payload},requestId)){
      clearTimeout(timer);pendingNative.delete(requestId);reject(Error('Host bridge unavailable'))
    }
  })
}
export function syncHostedNavigation(view:ViewState){
  if(!isCloudHostsEmbedded)return
  let tab:HostedTab
  if(view.kind==='messages')tab='messages'
  else if(view.kind==='plan')tab='plan'
  else if(view.returnTo?.kind==='messages')tab='messages'
  else if(view.returnTo?.kind==='plan')tab='plan'
  else if(['conversation','settings','employee','initialization','clone'].includes(view.kind))tab=activeTab
  else tab='company'
  activeTab=tab
  // Suppress intermediate original view states during a host-initiated switch.
  // Otherwise an intermediate Company event can undo host Plan selection.
  if(suppressTab){
    if(suppressTab===tab){suppressTab=undefined;suppressUntil=0;return}
    if(Date.now()<suppressUntil)return
    suppressTab=undefined;suppressUntil=0
  }
  // The outer header follows original in-app routes such as Plan->conversation
  // and group->employee. No CloudHosts legacy conversation route is invoked.
  emit('navigation.change',{view:tab,revision:view.revision,source:'aexus'})
}
export function startHostedBridge(api:AgentsApi,clientId:string){
  if(!isCloudHostsEmbedded)return()=>{}
  document.documentElement.dataset.cloudhostsEmbedded='true'
  document.documentElement.dataset.hostVisible='false'
  document.documentElement.dataset.hostFocused='false'
  let disposed=false
  const receive=async(input:unknown,origin?:string,source?:MessageEventSource|null)=>{
    if(disposed)return
    const raw=asObject(input)
    if(!valid(input)){
      if(binding&&typeof raw.requestId==='string'&&raw.protocolVersion!==1)
        failure(raw.requestId,'UNSUPPORTED_VERSION','Expected protocolVersion 1')
      return
    }
    let length:number
    try{length=JSON.stringify(input).length}catch{return failure(input.requestId,'INVALID_PAYLOAD','Host envelope cannot be serialized')}
    if(length>131072)return failure(input.requestId,'PAYLOAD_TOO_LARGE','Host envelope exceeds 128 KiB')
    const item=input,payload=asObject(item.payload)
    if(item.type==='host.hello'){
      if(binding)return failure(item.requestId,'ALREADY_BOUND','A host instance is already bound')
      if(typeof payload.expectedOrigin!=='string'||payload.expectedOrigin!==location.origin
        ||typeof payload.nonce!=='string'||payload.nonce.length<24
        ||!Array.isArray(payload.capabilities)||!payload.capabilities.every(v=>typeof v==='string'))return
      if(origin!==undefined&&(source!==window.parent||origin==='null'))return
      if(item.clientId!==clientId&&item.clientId!=='pending')return
      binding={instanceId:item.instanceId,windowId:item.windowId,nonce:payload.nonce,
        origin:location.origin,capabilities:new Set(payload.capabilities),clientId}
      parentOrigin=origin
      emit('aexus.ready',{origin:location.origin,nonce:payload.nonce,view:activeTab,mode:'web'},item.requestId)
      return
    }
    if(!binding)return
    if(item.type==='host.ticket'){
      if(typeof payload.ticket!=='string'||payload.ticket.length>8192)
        return failure(item.requestId,'TICKET_INVALID','Missing hosted session ticket')
      try{
        const response=await fetch('/api/hosted/exchange',{method:'POST',credentials:'same-origin',
          headers:{'content-type':'application/json'},body:JSON.stringify({ticket:payload.ticket})})
        const reply=await response.json()
        if(!response.ok||reply.ok!==true)throw Error(String(reply.error||'Hosted session exchange rejected'))
        // An HTTP exchange alone does not prove WKWebView retained its
        // HttpOnly session cookie. Verify the original authenticated endpoint.
        const bootstrap=await fetch('/api/bootstrap',{credentials:'same-origin'})
        if(!bootstrap.ok)throw Error('Hosted session bootstrap refused: HTTP '+bootstrap.status)
        const {initializeWeb,webAuthenticated}=await import('./transport')
        await initializeWeb()
        if(!webAuthenticated())throw Error('Hosted browser session is not authenticated')
        emit('host.ticket',{accepted:true},item.requestId)
      }catch(cause){failure(item.requestId,'HOST_AUTH_FAILED',cause instanceof Error?cause.message:String(cause))}
      return
    }
    if(item.instanceId!==binding.instanceId||item.windowId!==binding.windowId
      ||item.clientId!==binding.clientId){failure(item.requestId,'WRONG_BINDING','Unknown instance, window, or client');return}
    if(origin!==undefined&&(source!==window.parent||origin!==parentOrigin)){failure(item.requestId,'WRONG_ORIGIN','Origin mismatch');return}
    if(item.nonce!==binding.nonce){failure(item.requestId,'CAPABILITY_DENIED','Missing lifecycle nonce');return}
    if(item.type==='view.visibility'){
      if(typeof payload.visible!=='boolean'||typeof payload.focused!=='boolean')return failure(item.requestId,'INVALID_PAYLOAD','Expected visible/focused booleans')
      updateActivity({visible:payload.visible,focused:payload.visible&&payload.focused})
      emit('view.visibility',{accepted:true,visible:activity.visible,focused:activity.focused},item.requestId)
      return
    }
    if(item.type==='navigation.change'){
      const next=payload.view
      if(next!=='company'&&next!=='messages'&&next!=='plan')return failure(item.requestId,'VIEW_DISABLED','Only company/messages/plan are available')
      const roleId=payload.roleId
      if(roleId!==undefined&&(next!=='messages'||typeof roleId!=='string'||!roleId||roleId.length>128))return failure(item.requestId,'INVALID_PAYLOAD','Expected a Role Board employee ID')
      if(next===activeTab&&!roleId){emit('navigation.change',{accepted:true,view:next},item.requestId);return}
      try{
        suppressTab=next;suppressUntil=Date.now()+2500
        if(roleId){
          const [role]=await api.call<Array<Pick<StoredSession,'id'|'initialization'>>>('session.status',{employee:roleId})
          if(!role)throw Error('Role no longer exists')
          await api.call('view.open',{kind:employeeReady(role)?'messages':'initialization',employee:roleId})
        }
        else await api.call('view.select',{id:next})
        activeTab=next
        emit('navigation.change',{accepted:true,view:next},item.requestId)
      }catch(cause){
        suppressTab=undefined;suppressUntil=0
        failure(item.requestId,'NAVIGATION_FAILED',cause instanceof Error?cause.message:String(cause))
      }
      return
    }
    if(item.type==='state.flush'){
      try{const flushed=await flushState();emit('state.flush',{saved:true,flushers:flushed},item.requestId)}
      catch(cause){emit('state.flush',{saved:false,error:cause instanceof Error?cause.message:String(cause)},item.requestId)}
      return
    }
    if(item.type==='runtime.state'){
      if(typeof payload.status!=='string'||!['stopped','starting','ready','stopping','failed'].includes(payload.status))return failure(item.requestId,'INVALID_PAYLOAD','Unknown runtime status')
      runtimeState=payload.status
      emit('runtime.state',{accepted:true},item.requestId)
      return
    }
    if(item.type==='protocol.error')return // Denial acknowledgements never recurse.
    if(item.type==='native.response'){
      const pending=pendingNative.get(item.requestId)
      if(!pending)return failure(item.requestId,'UNKNOWN_REQUEST','No matching native request')
      pendingNative.delete(item.requestId);clearTimeout(pending.timer)
      payload.error?pending.reject(Error(String(payload.error))):pending.resolve(payload.result)
      return
    }
    failure(item.requestId,'UNKNOWN_TYPE','Unsupported host message')
  }
  const fromParent=(event:MessageEvent)=>{if(event.source===window.parent)void receive(event.data,event.origin,event.source)}
  const fromNative=(event:Event)=>{void receive((event as CustomEvent).detail)}
  window.addEventListener('message',fromParent)
  window.addEventListener('cloudhosts:host-envelope',fromNative)
  const hide=()=>{updateActivity(inactive);void flushState().catch(()=>{})}
  window.addEventListener('pagehide',hide)
  return()=>{
    disposed=true
    window.removeEventListener('message',fromParent)
    window.removeEventListener('cloudhosts:host-envelope',fromNative)
    window.removeEventListener('pagehide',hide)
    for(const value of pendingNative.values()){clearTimeout(value.timer);value.reject(Error('Host bridge closed'))}
    pendingNative.clear()
    binding=undefined
  }
}
