import { contextBridge, ipcRenderer,webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { Request, Response } from '../shared/protocol'

function on(channel: string, handler: (payload: any) => void) {
  const listener = (_e: IpcRendererEvent, payload: unknown) => handler(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.off(channel, listener)
}

contextBridge.exposeInMainWorld('agents', {
  mode: 'desktop',
  platform: process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux',
  filePath: (file:File) => webUtils.getPathForFile(file),
  rendererReady: () => ipcRenderer.send('renderer:ready'),
  call: (cmd: Request['cmd'], args?: Request['args'],options?:{engineScope?:string|null}) => ipcRenderer.invoke('api:request', { cmd, args,...(options&&Object.hasOwn(options,'engineScope')?{engineScope:options.engineScope}:{}) }).then((reply:Response)=>{
    // Error custom properties are dropped by contextBridge; plain values retain Core codes.
    if(!reply.ok)throw {message:reply.error,...(reply.code?{code:reply.code}:{})}
    return reply.data
  },error=>{throw {message:error.message.replace(/^Error invoking remote method 'api:request': (?:Error: )?/,'')}}),
  onEvent: (handler: (event: any) => void) => on('api:event', handler),
  onUiRequest: (handler: (request: any) => void) => on('ui:request', handler),
  answerUi: (answer: unknown) => ipcRenderer.send('ui:response', answer),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
})
