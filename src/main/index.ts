import {mediaResponse} from './media-response'
import {setFileRevealer} from './file-reveal'
import {closeMediaClient,mediaAvailable} from './media'
import {operatorContext} from './authorization'
import {openExternalUrl,setExternalOpener} from './external'
import {attachPluginDesktop} from './plugins/desktop'
import { app, BrowserWindow, ipcMain, shell,dialog,protocol } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import {getPreferences} from './store'
import { startRuntime } from './runtime'
import { handleRequest, setUiHandler, setViewGuard } from './server'
import { askRenderer, resolveUiRequest, rendererReady, setRendererReady, setPrimaryWindow } from './ui'
import type { Request, Response } from '../shared/protocol'

protocol.registerSchemesAsPrivileged([{scheme:'agents-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}])
const REMOTE_WEB_URL=process.env.AGENTS_COMPANY_WEB_URL
if(REMOTE_WEB_URL){
  const url=new URL(REMOTE_WEB_URL)
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Remote desktop requires an HTTPS server origin (loopback HTTP is allowed)')
}
const HEADLESS = process.env.AGENTS_COMPANY_HEADLESS === '1'
const OFFSCREEN = process.env.AGENTS_COMPANY_OFFSCREEN === '1'
const HIDDEN = OFFSCREEN || process.env.AGENTS_COMPANY_HIDDEN === '1'
if ((HEADLESS || HIDDEN) && process.platform === 'darwin') app.setActivationPolicy('prohibited')
// Keep the existing Electron profile when the product display name changes.
app.setPath('userData', process.env.AGENTS_COMPANY_HOME ? join(process.env.AGENTS_COMPANY_HOME, 'electron') : join(app.getPath('appData'), 'Agents Company'))

let mainWindow:BrowserWindow|undefined
let pluginDesktop:ReturnType<typeof attachPluginDesktop>|undefined
setPrimaryWindow(()=>mainWindow)
const trusted=(event:Electron.IpcMainEvent|Electron.IpcMainInvokeEvent)=>{
  const contents=mainWindow?.webContents,frame=event.senderFrame
  if(!contents||contents!==event.sender||!frame||frame!==contents.mainFrame)return false
  const expected=process.env.ELECTRON_RENDERER_URL||new URL(`file://${join(__dirname,'../renderer/index.html')}`).href
  return new URL(frame.url).origin===new URL(expected).origin&&new URL(frame.url).pathname===new URL(expected).pathname
}
const remoteTrusted=(event:Electron.IpcMainEvent)=>{const frame=event.senderFrame;return !!REMOTE_WEB_URL&&event.sender===mainWindow?.webContents&&frame===event.sender.mainFrame&&!!frame&&new URL(frame.url).origin===new URL(REMOTE_WEB_URL).origin}
const activeWindow=(win:BrowserWindow|undefined)=>!!win&&!win.isDestroyed()&&win.isVisible()&&win.isFocused()&&!win.isMinimized()&&win.webContents.isFocused()
ipcMain.handle('api:request', async (event, request: Request):Promise<Response> => {
  try{
    if(!trusted(event))throw new Error('Untrusted IPC sender')
    // Desktop acknowledgements require the actual native window to be foregrounded.
    const data=['session.acknowledge','chat.acknowledge','channel.acknowledge'].includes(request.cmd)&&!activeWindow(mainWindow)
      ?{acknowledged:false,reason:'window-not-active'}
      :await handleRequest(request,{...operatorContext(),...(request.cmd.startsWith('messenger.media-')?{clientId:'desktop-media-'+event.sender.id}:{})})
    return {ok:true,data}
  }catch(error){
    return {ok:false,error:error instanceof Error?error.message:String(error),...((error as {code?:string})?.code?{code:(error as {code:string}).code}:{})}
  }
})
ipcMain.on('renderer:ready', event => { if(trusted(event)||remoteTrusted(event))setRendererReady(event.sender,true) })
ipcMain.on('ui:response', (event, a) => {if(trusted(event)||remoteTrusted(event))resolveUiRequest(a.id, a.data, a.error)})
ipcMain.handle('shell:openExternal', async (event, url: string) => {
  if(!trusted(event))throw new Error('Untrusted IPC sender')
  if (!/^https?:\/\//.test(url)) throw new Error('Only web links are supported')
  await openExternalUrl(url)
})

setFileRevealer(file=>shell.showItemInFolder(file))

setViewGuard(async () => {
  if (mainWindow&&rendererReady(mainWindow.webContents)) await askRenderer('flush', {}, 12000)
})

setUiHandler(async (op, args) => {
  const win = mainWindow
  if(op==='save-file'){if(!win)throw Error('A desktop window is required; CLI downloads must provide --path');const result=await dialog.showSaveDialog(win,{defaultPath:typeof args?.name==='string'?args.name:undefined});return {path:result.canceled?null:result.filePath??null}}
  if(op==='choose-folder') {
    if(!win)throw new Error('选择文件夹需要桌面窗口；CLI 请直接传入路径')
    const result=await dialog.showOpenDialog(win,{title:'选择工作文件夹',defaultPath:typeof args?.path==='string'?args.path:undefined,properties:['openDirectory','createDirectory']})
    return {path:result.canceled?null:result.filePaths[0]??null}
  }
  if (op === 'screenshot' && win) {
    const contents=win.webContents,throttled=contents.getBackgroundThrottling()
    const css=args?.privacy?await contents.insertCSS('.team-root-label,.activity-bubble,.room-dimension{visibility:hidden!important}'):undefined
    try{
      if(throttled)contents.setBackgroundThrottling(false)
      // Wake an occluded compositor while export styling is still applied. Its
      // first capture can contain the preceding frame even after renderer rAF.
      await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})
      contents.invalidate()
      await contents.executeJavaScript('new Promise(resolve=>{requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(null)));setTimeout(()=>resolve(null),150)})')
      const image = await contents.capturePage(undefined,{stayHidden:true,stayAwake:true}),path=String(args?.path)
      writeFileSync(path, image.toPNG())
      return {path,...image.getSize(),privacy:!!args?.privacy}
    }finally{if(css)await contents.removeInsertedCSS(css);if(throttled)contents.setBackgroundThrottling(true)}
  }
  if ((op === 'drag' || op === 'wheel') && win) {
    const rect=await askRenderer<{x:number;y:number;width:number;height:number}>('rect',{selector:args?.selector})
    const scale=win.webContents.getZoomFactor()
    const x=Math.round((rect.x+rect.width/2)*scale),y=Math.round((rect.y+rect.height/2)*scale)
    win.webContents.sendInputEvent({type:'mouseMove',x,y})
    if(op==='wheel') win.webContents.sendInputEvent({type:'mouseWheel',x,y,deltaX:Number(args?.dx??0),deltaY:Number(args?.dy??0),modifiers:args?.zoom?['control']:[]})
    else {
      win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1})
      for(let step=1;step<=12;step++) {
        win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(x+Number(args?.dx)*step/12),y:Math.round(y+Number(args?.dy)*step/12),button:'left'})
        await new Promise(r=>setTimeout(r,20))
      }
      win.webContents.sendInputEvent({type:'mouseUp',x:x+Number(args?.dx),y:y+Number(args?.dy),button:'left',clickCount:1})
    }
    await new Promise(r=>setTimeout(r,400))
    return askRenderer('snapshot')
  }
  return askRenderer(op, args)
})

function createWindow() {
  const win = new BrowserWindow({
    width: Number(process.env.AGENTS_COMPANY_WIDTH) || 1168,
    height: Number(process.env.AGENTS_COMPANY_HEIGHT) || 1096,
    minWidth: 720, minHeight: 600,
    show: !HIDDEN,
    titleBarStyle: process.platform==='darwin'?'hiddenInset':'default',
    trafficLightPosition: { x: 14, y: 20 },
    backgroundColor: '#141724',
    webPreferences: {
      preload: join(__dirname,REMOTE_WEB_URL?'../preload/web.js':'../preload/index.js'), sandbox: true,
      contextIsolation: true, nodeIntegration: false, offscreen: OFFSCREEN,
      backgroundThrottling: !(HIDDEN||OFFSCREEN)
    }
  })
  mainWindow=win
  const visibility=()=>{if(!win.isDestroyed())win.webContents.send('api:event',{channel:'desktop:visibility',payload:{active:activeWindow(win),visible:win.isVisible()&&!win.isMinimized()}})}
  win.on('show',visibility).on('hide',visibility).on('focus',visibility).on('blur',visibility).on('minimize',visibility).on('restore',visibility)
  win.webContents.on('focus',visibility).on('blur',visibility)
  win.webContents.on('did-finish-load',visibility)
  const mediaClient='desktop-media-'+win.webContents.id
  win.webContents.on('destroyed',()=>closeMediaClient(mediaClient))
  win.on('closed',()=>{mainWindow=undefined})
  // Page zoom is a persisted Core preference, separate from canvas navigation.
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(REMOTE_WEB_URL?1:getPreferences().pageZoom); void win.webContents.setVisualZoomLevelLimits(1,1) })
  win.webContents.on('before-input-event', (_event,input) => {
    win.webContents.setIgnoreMenuShortcuts((input.meta||input.control)&&['+','=','-','0'].includes(input.key))
  })
  win.webContents.on('did-start-navigation', details => { if(details.isMainFrame&&!details.isSameDocument)setRendererReady(win.webContents,false) })
  win.webContents.on('render-process-gone', () => setRendererReady(win.webContents,false))
  win.webContents.setWindowOpenHandler(({url}) => {if(REMOTE_WEB_URL&&/^https?:\/\//.test(url))void shell.openExternal(url);return {action:'deny'}})
  win.webContents.on('will-navigate',(event,url)=>{const expected=REMOTE_WEB_URL||process.env.ELECTRON_RENDERER_URL||new URL(`file://${join(__dirname,'../renderer/index.html')}`).href;if(url!==expected)event.preventDefault()})
  let closing=false
  win.on('close',event=>{
    if(quitting||closing||!rendererReady(win.webContents))return
    event.preventDefault()
    void askRenderer('flush',{},12000).then(()=>{closing=true;win.close()}).catch(error=>console.error('Workspace save:',error.message))
  })
  if(REMOTE_WEB_URL)void win.loadURL(REMOTE_WEB_URL)
  else if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

let stop: (() => Promise<void>) | undefined
let quitting=false,preparingQuit=false
app.whenReady().then(() => {
  if (HEADLESS || HIDDEN) void app.dock?.hide()
  else setExternalOpener(url=>shell.openExternal(url))
  if(REMOTE_WEB_URL){if(HEADLESS)throw Error('Remote Web desktop cannot be headless; use agents serve on the server');createWindow();return}
  protocol.handle('agents-media',request=>{
    const initiator=(request as typeof request&Pick<Electron.ProtocolRequest,'initiatorOrigin'>).initiatorOrigin
    const url=new URL(request.url),window=mainWindow,expected=process.env.ELECTRON_RENDERER_URL?new URL(process.env.ELECTRON_RENDERER_URL).origin:null
    if(!window||url.host!=='preview'||!/^\/[a-f0-9-]{36}$/.test(url.pathname)||initiator&&!(expected?initiator===expected:['null','file://'].includes(initiator)))return new Response(null,{status:403})
    const id=url.pathname.slice(1),context={...operatorContext(),clientId:'desktop-media-'+window.webContents.id}
    return mediaResponse(request,id,(cmd,args)=>handleRequest({cmd,args},context),()=>!window.isDestroyed()&&mediaAvailable(id))
  })
  stop = startRuntime((channel, payload) => {
    if(mainWindow){if(channel==='store:changed'){const zoom=getPreferences().pageZoom;if(mainWindow.webContents.getZoomFactor()!==zoom)mainWindow.webContents.setZoomFactor(zoom)}mainWindow.webContents.send('api:event',{channel,payload})}
  })
  if (!HEADLESS){pluginDesktop=attachPluginDesktop(()=>mainWindow,HIDDEN,join(__dirname,'../preload/plugin.js'));createWindow()}
  app.on('activate', () => {
    if (!HEADLESS && !HIDDEN && !mainWindow) createWindow()
  })
})
app.on('window-all-closed', () => { if (!HEADLESS && process.platform !== 'darwin') app.quit() })
app.on('before-quit', event => {
  if(quitting)return
  event.preventDefault()
  if(preparingQuit)return
  preparingQuit=true
  void (async()=>{
    if(mainWindow&&rendererReady(mainWindow.webContents))await askRenderer('flush',{},12000)
    await stop?.();pluginDesktop?.dispose();quitting=true;app.quit()
  })().catch(error=>{preparingQuit=false;console.error('Workspace save:',error.message)})
})
process.on('SIGTERM', () => app.quit())
