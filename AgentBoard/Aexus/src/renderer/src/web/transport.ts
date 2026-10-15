import {translate as uiText} from '../i18n'
import type {AgentsApi} from '../api'
import {isCloudHostsEmbedded,requestHostedNative} from './host'
import {chooseServerFolder} from './folders'
import {flushPlugins} from '../plugins'
type Event={channel:string;payload:any}
type Connection={authenticated:boolean;connected:boolean;checking:boolean;ready:boolean;server?:{os:string;hostname:string};error?:string}
// `ready` is the state a caller may act on: an established session that is also
// final for this document. A hosted frame meets a cookie from its own earlier
// session, but the host ticket exchange is what authorizes this window, so a
// bare bootstrap must not mount the application before that exchange has been
// confirmed.
let csrf='',hostedConfirmed=!isCloudHostsEmbedded,connection:Connection={authenticated:false,connected:false,checking:true,ready:false},socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined
const events=new Set<(event:Event)=>void>(),ui=new Set<(request:any)=>void>(),stateListeners=new Set<(state:Connection)=>void>()
const lifecycle=(window as any).agentsDesktopLifecycle as {ready:()=>void;onRequest:(fn:(value:any)=>void)=>()=>void;answer:(value:any)=>void;onVisibility:(fn:(value:any)=>void)=>()=>void}|undefined
const hostedClient=new URLSearchParams(location.search).get('client')
const validHostedClient=hostedClient&&/^[a-zA-Z0-9_-]{8,80}$/.test(hostedClient)
export const clientId=(isCloudHostsEmbedded&&validHostedClient?hostedClient:undefined)
  ??sessionStorage.getItem('agents-company-client')??crypto.randomUUID()
sessionStorage.setItem('agents-company-client',clientId)
function update(patch:Partial<Connection>){
  const next={...connection,...patch};next.ready=next.authenticated&&hostedConfirmed
  const authChanged=patch.authenticated!==undefined&&patch.authenticated!==connection.authenticated
  connection=next
  if(authChanged)for(const listener of events)listener({channel:'client:authentication',payload:{authenticated:connection.authenticated}})
  for(const listener of stateListeners)listener(connection)
}
export const webAuthenticated=()=>connection.authenticated
/** Called once the host ticket exchange for this document has been accepted. */
export function confirmHostedSession(){hostedConfirmed=true;update({})}
export function onWebState(listener:(state:Connection)=>void){stateListeners.add(listener);listener(connection);return()=>{stateListeners.delete(listener)}}
async function request(url:string,options:RequestInit={}){
  // The Core selects this browser's session cookie by the client it identifies.
  const response=await fetch(url,{...options,credentials:'same-origin',headers:{'x-agents-client':clientId,...options.headers as Record<string,string>|undefined}})
  let reply:any;try{reply=await response.json()}catch{throw Error(uiText('The Core returned an invalid response'))}
  if(!response.ok||reply.ok===false){
    // A session that no longer matches this browser (expired, revoked, or
    // replaced) is dropped so the next bootstrap re-establishes the real one.
    // The failed call itself is never replayed.
    if(response.status===401||response.status===403&&(reply.code==='HOSTED_CLIENT_MISMATCH'||/csrf/i.test(String(reply.error??'')))){csrf='';update({authenticated:false,connected:false})}
    throw Object.assign(Error(reply.error??uiText('Request failed')),{code:reply.code,status:response.status})
  }
  return reply.data
}
function connect(){
  if(!connection.authenticated||socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return
  const url=new URL('/api/events',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('client',clientId)
  const current=new WebSocket(url);socket=current
  current.onopen=()=>update({connected:true,error:undefined})
  current.onmessage=event=>{
    const value=JSON.parse(event.data)
    if(value.type==='event'){if(value.channel!=='plugin:windows')for(const listener of events)listener(value)}
    else if(value.type==='ui:request')for(const listener of ui)listener(value)
  }
  current.onclose=event=>{
    if(socket!==current)return;socket=undefined;update({connected:false})
    if(event.code===4001){csrf='';update({authenticated:false});return}
    if(connection.authenticated){clearTimeout(retry);retry=setTimeout(async()=>{
      try{const data=await request('/api/bootstrap');csrf=data.csrf;update({authenticated:true,server:data.server})}catch{}
      // Bootstrap turns expired/restarted server sessions into a login prompt. No task is replayed.
      connect()
    },1500)}
  }
  current.onerror=()=>current.close()
}
let starting:Promise<void>|undefined
async function bootstrap(){try{const data=await request('/api/bootstrap');csrf=data.csrf;update({authenticated:true,checking:false,server:data.server});connect()}catch{update({authenticated:false,checking:false})}}
/**
 * `refresh` waits for any in-flight bootstrap and then reads the session again,
 * so a caller that just replaced this document's session (a host authorization)
 * never receives the outcome of an older one.
 */
export function initializeWeb(refresh=false):Promise<void>{
  if(starting)return refresh?starting.then(()=>initializeWeb(true)):starting
  return starting=bootstrap().finally(()=>{starting=undefined})
}
export async function loginWeb(token:string){
  const result=await request('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})})
  csrf=result.csrf
  const data=await request('/api/bootstrap');update({authenticated:true,checking:false,server:data.server,error:undefined});connect()
}
export async function logoutWeb(){await flushPlugins();await request('/api/logout',{method:'POST',headers:headers(),body:'{}'});csrf='';socket?.close();clearTimeout(retry);update({authenticated:false,connected:false})}
const headers=()=>({'content-type':'application/json','x-agents-csrf':csrf,'x-agents-client':clientId,'x-request-id':crypto.randomUUID()})
export function createWebApi():AgentsApi{
  const api:AgentsApi={mode:'web',get platform(){return connection.server?.os as 'macos'|'linux'|'windows'|undefined},filePath:()=>'',rendererReady:()=>lifecycle?.ready(),
    async call(cmd,args){
      if(!connection.authenticated)throw Error(uiText('Sign in to the Core service first'))
      if(cmd==='workspace.choose')return (isCloudHostsEmbedded&&api.platform==='macos'?await requestHostedNative('folder.pick',{path:String(args?.path??'')}):await chooseServerFolder(api,String(args?.path??''))) as any
      let result:any
      try{result=await request('/api/rpc',{method:'POST',headers:headers(),body:JSON.stringify({cmd,args})})}
      catch(error){if(error instanceof TypeError)throw Error(uiText('Connection lost. The outcome is unknown; check task status before resubmitting.'));throw error}
      if(cmd==='workspace.reveal'&&isCloudHostsEmbedded&&result.hostReveal){
        await requestHostedNative('file.reveal',{path:result.path})
        return {...result,hostReveal:undefined,revealed:true}
      }
      return result
    },
    onEvent:handler=>{events.add(handler);const off=lifecycle?.onVisibility(handler);return()=>{events.delete(handler);off?.()}},
    onUiRequest:handler=>{ui.add(handler);const off=lifecycle?.onRequest(handler);return()=>{ui.delete(handler);off?.()}},
    answerUi:answer=>{if(answer.id.startsWith('native:')){lifecycle?.answer(answer);return};if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ui:response',...answer}))},
    async openExternal(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('Only HTTP(S) links are supported');if(isCloudHostsEmbedded)await requestHostedNative('external.open',{url:url.href});else window.open(url.href,'_blank','noopener,noreferrer')}
  }
  return api
}
