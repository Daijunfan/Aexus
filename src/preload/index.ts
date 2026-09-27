import { contextBridge, ipcRenderer,webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { Request } from '../shared/protocol'

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
  call: (cmd: Request['cmd'], args?: Request['args']) => ipcRenderer.invoke('api:request', { cmd, args }),
  onEvent: (handler: (event: any) => void) => on('api:event', handler),
  onUiRequest: (handler: (request: any) => void) => on('ui:request', handler),
  answerUi: (answer: unknown) => ipcRenderer.send('ui:response', answer),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
})
