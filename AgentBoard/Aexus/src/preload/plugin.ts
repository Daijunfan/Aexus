// The plugin keeps its HTTP/CLI bridge. Only presentation lifecycle messages cross IPC.
import {ipcRenderer} from 'electron'
window.addEventListener('message', event => {
  if(event.source!==window||event.origin!==location.origin)return
  const data=event.data,token=location.pathname.split('/')[1]
  if(data?.token!==token||!['agents-plugin:ready','agents-plugin:appearance','agents-plugin:flushed','agents-plugin:external'].includes(data.type))return
  ipcRenderer.send('plugin:message',data)
})
ipcRenderer.on('plugin:flush',(_event,data)=>window.postMessage({type:'agents-plugin:flush',...data},location.origin))
