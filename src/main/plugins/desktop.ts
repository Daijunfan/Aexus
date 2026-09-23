import {openExternalUrl} from '../external'
import {BrowserWindow,ipcMain,screen} from 'electron'
import {randomUUID} from 'node:crypto'
import {setPluginWindowDriver,placePluginWindow,modePluginWindow,dismissPluginWindow} from './windows'
import type {PluginWindowState} from '../../shared/plugin-windows'

type Record={win:BrowserWindow;state:PluginWindowState;ready:boolean;allowClose:boolean}

export function attachPluginDesktop(main:()=>BrowserWindow|undefined,hidden:boolean,preload:string){
  const records=new Map<string,Record>(),flushes=new Map<string,{owner:number;resolve:()=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>()
  const flush=(record:Record)=>new Promise<void>((resolve,reject)=>{
    if(!record.ready||record.win.webContents.isDestroyed()){resolve();return}
    const id=randomUUID(),timer=setTimeout(()=>{flushes.delete(id);reject(new Error('插件保存尚未完成，请重试关闭'))},12000)
    flushes.set(id,{owner:record.win.webContents.id,resolve,reject,timer})
    record.win.webContents.send('plugin:flush',{id,token:record.state.id})
  })
  const receive=(_event:Electron.IpcMainEvent,data:any)=>{
    const record=[...records.values()].find(r=>!r.win.isDestroyed()&&r.win.webContents===_event.sender)
    if(!record||_event.senderFrame!==_event.sender.mainFrame||data?.token!==record.state.id)return
    if(data.type==='agents-plugin:ready'){record.ready=true}
    if(data.type==='agents-plugin:appearance'&&['light','dark'].includes(data.theme))record.win.setBackgroundColor(data.theme==='dark'?'#191919':'#ffffff')
    if(data.type==='agents-plugin:external'&&/^https?:\/\//.test(data.url))void openExternalUrl(data.url)
    if(data.type==='agents-plugin:flushed'){
      const pending=flushes.get(data.id);if(!pending||pending.owner!==_event.sender.id)return
      clearTimeout(pending.timer);flushes.delete(data.id);data.error?pending.reject(new Error(data.error)):pending.resolve()
    }
  }
  ipcMain.on('plugin:message',receive)
  setPluginWindowDriver({
    async present(state){
      const existing=records.get(state.id)
      if(existing&&!existing.win.isDestroyed()){if(!hidden){existing.win.restore();existing.win.show();existing.win.focus()}return}
      const parent=main(),display=parent?screen.getDisplayMatching(parent.getBounds()):screen.getPrimaryDisplay(),area=display.workArea
      const width=Math.min(1000,area.width-64),height=Math.min(780,area.height-64),origin=parent?.getBounds()??area
      const bounds=state.bounds??{width,height,x:Math.max(area.x,Math.min(origin.x+origin.width+24,area.x+area.width-width-24)),y:Math.max(area.y,Math.min(origin.y+48,area.y+area.height-height-24))}
      const win=new BrowserWindow({...bounds,minWidth:480,minHeight:360,show:false,title:state.name,backgroundColor:'#ffffff',webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}})
      const record:Record={win,state,ready:false,allowClose:false};records.set(state.id,record)
      win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))void openExternalUrl(url);return {action:'deny'}})
      win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==new URL(state.url).origin){event.preventDefault();if(/^https?:\/\//.test(url))void openExternalUrl(url)}})
      win.on('close',event=>{if(record.allowClose)return;event.preventDefault();void dismissPluginWindow(state.id).catch(error=>{if(!win.isDestroyed())win.setTitle(state.name+' · '+error.message)})})
      win.on('closed',()=>{records.delete(state.id);void dismissPluginWindow(state.id)})
      const moved=()=>{placePluginWindow(state.id,win.getBounds(),true)}
      win.on('move',moved).on('resize',moved)
      win.on('minimize',()=>modePluginWindow(state.id,'minimized',true)).on('restore',()=>modePluginWindow(state.id,win.isMaximized()?'maximized':'normal',true)).on('maximize',()=>modePluginWindow(state.id,'maximized',true)).on('unmaximize',()=>modePluginWindow(state.id,'normal',true)).on('enter-full-screen',()=>modePluginWindow(state.id,'fullscreen',true)).on('leave-full-screen',()=>modePluginWindow(state.id,'normal',true))
      win.webContents.on('render-process-gone',()=>{record.ready=false})
      try{await win.loadURL(state.url)}catch(error){record.allowClose=true;win.destroy();throw error}
      placePluginWindow(state.id,win.getBounds(),true)
      if(!hidden){win.show();win.focus()}
    },
    place(state){const record=records.get(state.id);if(record&&state.bounds)record.win.setBounds(state.bounds)},
    mode(state){
      const record=records.get(state.id);if(!record)return
      if(!hidden){const win=record.win;if(state.mode==='fullscreen')win.setFullScreen(true);else{if(win.isFullScreen())win.setFullScreen(false);if(state.mode==='minimized')win.minimize();else{win.restore();state.mode==='maximized'?win.maximize():win.unmaximize()}}}
    },
    async close(state){
      const record=records.get(state.id);if(!record)return
      await flush(record);record.allowClose=true;record.win.destroy()
    }
  })
  return {getWindow:(id:string)=>records.get(id)?.win,dispose(){ipcMain.removeListener('plugin:message',receive);for(const p of flushes.values()){clearTimeout(p.timer);p.reject(new Error('Application closed'))}flushes.clear()}}
}
