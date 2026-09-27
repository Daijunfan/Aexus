import type {AgentsApi} from '../api'
import {showPlugin,closePlugin,applyPluginState,synchronizePluginWindows} from './windows'
import {chooseServerFolder} from './folders'
import {flushPlugins} from '../plugins'
type Event={channel:string;payload:any}
type Connection={authenticated:boolean;connected:boolean;checking:boolean;server?:{os:string;hostname:string};error?:string}
let csrf='',connection:Connection={authenticated:false,connected:false,checking:true},socket:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined
let webApi:AgentsApi|undefined
const events=new Set<(event:Event)=>void>(),ui=new Set<(request:any)=>void>(),stateListeners=new Set<(state:Connection)=>void>()
const lifecycle=(window as any).agentsDesktopLifecycle as {ready:()=>void;onRequest:(fn:(value:any)=>void)=>()=>void;answer:(value:any)=>void;onVisibility:(fn:(value:any)=>void)=>()=>void}|undefined
const clientId=sessionStorage.getItem('agents-company-client')??crypto.randomUUID()
sessionStorage.setItem('agents-company-client',clientId)
function update(patch:Partial<Connection>){connection={...connection,...patch};if(patch.authenticated===false&&webApi)synchronizePluginWindows([],webApi);for(const listener of stateListeners)listener(connection)}
export function onWebState(listener:(state:Connection)=>void){stateListeners.add(listener);listener(connection);return()=>{stateListeners.delete(listener)}}
async function request(url:string,options:RequestInit={}){
  const response=await fetch(url,{...options,credentials:'same-origin'})
  let reply:any;try{reply=await response.json()}catch{throw Error('后端返回无效响应')}
  if(!response.ok||reply.ok===false){if(response.status===401)update({authenticated:false,connected:false});throw Object.assign(Error(reply.error??'请求失败'),{code:reply.code,status:response.status})}
  return reply.data
}
function connect(){
  if(!connection.authenticated||socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return
  const url=new URL('/api/events',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('client',clientId)
  const current=new WebSocket(url);socket=current
  current.onopen=()=>update({connected:true,error:undefined})
  current.onmessage=event=>{
    const value=JSON.parse(event.data)
    if(value.type==='event'){if(value.channel==='plugin:windows'&&webApi)synchronizePluginWindows(value.payload,webApi);for(const listener of events)listener(value)}
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
export function initializeWeb(){return starting??=(async()=>{try{const data=await request('/api/bootstrap');csrf=data.csrf;update({authenticated:true,checking:false,server:data.server});connect()}catch{update({authenticated:false,checking:false})}})()}
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
      if(!connection.authenticated)throw Error('请先登录后端服务')
      if(cmd==='workspace.choose')return await chooseServerFolder(api,String(args?.path??'')) as any
      if(cmd==='plugin.dismiss')await closePlugin(String(args?.id),false)
      let result:any
      try{result=await request('/api/rpc',{method:'POST',headers:headers(),body:JSON.stringify({cmd,args})})}
      catch(error){if(error instanceof TypeError)throw Error('连接中断，操作结果暂时未知。请先查询任务状态，不要重复提交。');throw error}
      if(cmd==='plugin.open')showPlugin(result,api)
      if(cmd==='plugin.dismiss')await closePlugin(String(args?.id),true)
      if(cmd==='plugin.place'||cmd==='plugin.mode')applyPluginState([result])
      return result
    },
    onEvent:handler=>{events.add(handler);const off=lifecycle?.onVisibility(handler);return()=>{events.delete(handler);off?.()}},
    onUiRequest:handler=>{ui.add(handler);const off=lifecycle?.onRequest(handler);return()=>{ui.delete(handler);off?.()}},
    answerUi:answer=>{if(answer.id.startsWith('native:')){lifecycle?.answer(answer);return};if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ui:response',...answer}))},
    async openExternal(value){const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('Only HTTP(S) links are supported');window.open(url.href,'_blank','noopener,noreferrer')}
  }
  webApi=api;return api
}
