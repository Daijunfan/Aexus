import {translate as uiText,onInterfaceLanguageChange} from '../i18n'
import type {AgentsApi} from '../api'
import {onPluginFlush} from '../plugins'
type RecordWindow={element:HTMLDivElement;frame:HTMLIFrameElement;plugin:string;workspace:string;ready:boolean;flush:()=>Promise<void>;off:()=>void;api:AgentsApi}
const windows=new Map<string,RecordWindow>()
const pending=new Map<string,{owner:string;resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
window.addEventListener('message',event=>{
  const data=event.data,record=windows.get(data?.token)
  if(!record||event.source!==record.frame.contentWindow||event.origin!=='null')return
  if(data.type==='agents-plugin:rpc'){
    const port=event.ports[0],request=data.request
    if(!port||request?.jsonrpc!=='2.0'||typeof request.method!=='string')return
    // A MessagePort stays with the requesting document if its iframe later navigates.
    void record.api.call('plugin.call',{id:record.plugin,workspace:record.workspace,method:request.method,params:request.params??{},raw:true,viewId:data.token})
      .then(reply=>port.postMessage({...reply,id:request.id}))
      .catch(error=>port.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}}))
      .finally(()=>port.close())
    return
  }
  if(data.type==='agents-plugin:ready')record.ready=true
  if(data.type==='agents-plugin:appearance'&&['light','dark'].includes(data.theme))record.element.dataset.theme=data.theme
  if(data.type==='agents-plugin:external'&&typeof data.url==='string')void record.api.openExternal(data.url)
  if(data.type==='agents-plugin:flushed'){
    const item=pending.get(data.id);if(!item||item.owner!==data.token)return
    pending.delete(data.id);clearTimeout(item.timer);data.error?item.reject(Error(String(data.error))):item.resolve()
  }
})
export function showPlugin(state:any,api:AgentsApi){
  if(windows.has(state.id)){windows.get(state.id)!.element.hidden=false;return}
  const element=document.createElement('div');element.className='web-plugin-window';element.dataset.windowId=state.id;element.setAttribute('role','dialog');element.setAttribute('aria-label',state.name)
  const header=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button'),maximize=document.createElement('button'),error=document.createElement('p')
  title.textContent=state.name;close.textContent='×';maximize.textContent='□'
  const labels=()=>{close.setAttribute('aria-label',uiText('Close {0}',[state.name]));maximize.setAttribute('aria-label',uiText('Maximize {0}',[state.name]))};labels();const offLanguage=onInterfaceLanguageChange(labels)
  header.append(title,maximize,close);element.append(header)
  const frame=document.createElement('iframe');frame.title=state.name;frame.sandbox.add('allow-scripts','allow-forms','allow-downloads');frame.allowFullscreen=true;frame.src=state.url;element.append(frame,error);document.body.append(element)
  const record:RecordWindow={element,frame,plugin:state.plugin,workspace:state.workspace,ready:false,api,off:()=>{},flush:()=>new Promise<void>((resolve,reject)=>{
    if(!record.ready){resolve();return}
    const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error(uiText('The plugin has not confirmed saving. Try again shortly.')))},12000)
    pending.set(id,{owner:state.id,resolve,reject,timer});frame.contentWindow?.postMessage({type:'agents-plugin:flush',token:state.id,id},'*')
  })}
  const offFlush=onPluginFlush(record.flush);record.off=()=>{offFlush();offLanguage()};windows.set(state.id,record)
  close.onclick=()=>{close.disabled=true;void api.call('plugin.dismiss',{id:state.id}).catch(cause=>{error.textContent=cause.message;close.disabled=false})}
  let maximized=false
  maximize.onclick=()=>{maximized=!maximized;void api.call('plugin.mode',{id:state.id,mode:maximized?'maximized':'normal'})}
  let drag:{x:number;y:number;left:number;top:number}|undefined
  header.onpointerdown=e=>{if(e.button!==0||(e.target as Element).closest('button'))return;const box=element.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:box.left,top:box.top};header.setPointerCapture(e.pointerId)}
  header.onpointermove=e=>{if(!drag)return;element.style.left=Math.max(0,drag.left+e.clientX-drag.x)+'px';element.style.top=Math.max(0,drag.top+e.clientY-drag.y)+'px'}
  header.onpointerup=e=>{if(!drag)return;drag=undefined;header.releasePointerCapture(e.pointerId);const box=element.getBoundingClientRect();void api.call('plugin.place',{id:state.id,x:box.x,y:box.y,width:box.width,height:box.height})}
  applyPluginState([state])
}
export async function closePlugin(id:string,remove:boolean){const record=windows.get(id);if(!record)return;if(!remove){await record.flush();return};record.off();record.element.remove();windows.delete(id)}
export function applyPluginState(states:any[]){
  for(const state of states){
    const record=windows.get(state.id);if(!record)continue
    const el=record.element;el.hidden=state.mode==='minimized';el.classList.toggle('maximized',state.mode==='maximized'||state.mode==='fullscreen')
    if(state.bounds&&state.mode==='normal'){const b=state.bounds;el.style.width=Math.min(b.width,innerWidth-24)+'px';el.style.height=Math.min(b.height,innerHeight-24)+'px';el.style.left=Math.max(0,Math.min(b.x,innerWidth-480))+'px';el.style.top=Math.max(0,Math.min(b.y,innerHeight-100))+'px'}
  }
}

export function synchronizePluginWindows(states:any[],api:AgentsApi){
  const visible=new Set(states.map(state=>state.id))
  for(const id of windows.keys())if(!visible.has(id))void closePlugin(id,true)
  for(const state of states)if(!windows.has(state.id))showPlugin(state,api)
  applyPluginState(states)
}
