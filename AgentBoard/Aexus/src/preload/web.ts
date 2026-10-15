// Presentation-only bridge for an authenticated remote Web UI. No host API or filesystem.
import {contextBridge,ipcRenderer} from 'electron'
contextBridge.exposeInMainWorld('agentsDesktopLifecycle',{
  ready:()=>ipcRenderer.send('renderer:ready'),
  onRequest:(handler:(value:any)=>void)=>{
    const listener=(_event:unknown,value:any)=>handler({...value,id:'native:'+value.id})
    ipcRenderer.on('ui:request',listener);return()=>{ipcRenderer.off('ui:request',listener)}
  },
  answer:(answer:{id:string;data?:unknown;error?:string})=>ipcRenderer.send('ui:response',{...answer,id:answer.id.replace(/^native:/,'')}),
  onVisibility:(handler:(value:any)=>void)=>{
    const listener=(_event:unknown,value:any)=>{if(value?.channel==='desktop:visibility')handler(value)}
    ipcRenderer.on('api:event',listener);return()=>{ipcRenderer.off('api:event',listener)}
  }
})
