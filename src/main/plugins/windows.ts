// CLI-owned presentation state. Electron is an optional adapter, never the data owner.
import {currentClientId} from '../request-context'
import type {PluginWindowState,WindowBounds} from '../../shared/plugin-windows'
import {openPluginView,closePluginView} from './runtime'
export type PluginWindowDriver = {
  present(state:PluginWindowState):Promise<void>
  place(state:PluginWindowState):void
  close(state:PluginWindowState):Promise<void>
  mode(state:PluginWindowState):void
}
let driver:PluginWindowDriver|undefined
const windows=new Map<string,PluginWindowState>(),opening=new Map<string,Promise<PluginWindowState>>(),closing=new Map<string,Promise<{closed:boolean}>>()
const listeners=new Set<(windows:PluginWindowState[])=>void>()
export function setPluginWindowDriver(value:PluginWindowDriver){driver=value}
export function pluginWindows(){return [...windows.values()].map(state=>({...state,bounds:state.bounds?{...state.bounds}:undefined}))}
export function onPluginWindows(listener:(windows:PluginWindowState[])=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function changed(){for(const listener of listeners)listener(pluginWindows())}
function get(id:string){const state=windows.get(id);if(!state)throw new Error('Unknown plugin window');return state}
export async function openPluginWindow(plugin:string,workspace:string):Promise<PluginWindowState>{
  const clientId=currentClientId()??'desktop'
  const existing=[...windows.values()].find(window=>window.plugin===plugin&&window.workspace===workspace&&(window.clientId??'desktop')===clientId)
  if(existing){if(existing.mode==='minimized')existing.mode='normal';await driver?.present(existing);changed();return {...existing}}
  const key=clientId+':'+plugin+':'+workspace
  if(opening.has(key))return opening.get(key)!
  const operation=(async()=>{
    const view=await openPluginView(plugin,workspace),state:PluginWindowState={...view,clientId,mode:'normal',attached:!!driver}
    windows.set(state.id,state)
    try{await driver?.present(state);changed();return {...state}}
    catch(error){windows.delete(state.id);await closePluginView(state.id);changed();throw error}
  })()
  opening.set(key,operation)
  try{return await operation}finally{opening.delete(key)}
}
export function placePluginWindow(id:string,patch:Partial<WindowBounds>,fromWindow=false){
  const state=get(id),bounds={x:100,y:100,width:960,height:720,...state.bounds,...patch}
  if(!Object.values(bounds).every(Number.isFinite)||bounds.width<480||bounds.height<360)throw new Error('Window bounds require finite coordinates, width >= 480 and height >= 360')
  for(const key of ['x','y','width','height'] as const)bounds[key]=Math.round(bounds[key])
  if(JSON.stringify(bounds)===JSON.stringify(state.bounds))return {...state}
  state.bounds=bounds;if(!fromWindow)driver?.place(state);changed();return {...state}
}
export function modePluginWindow(id:string,mode:PluginWindowState['mode'],fromWindow=false){
  if(!['normal','minimized','maximized','fullscreen'].includes(mode))throw new Error('Unknown window mode')
  const state=get(id);if(state.mode===mode)return {...state};state.mode=mode;if(!fromWindow)driver?.mode(state);changed();return {...state}
}
export async function dismissPluginWindow(id:string):Promise<{closed:boolean}>{
  if(closing.has(id))return closing.get(id)!
  const state=windows.get(id);if(!state)return {closed:true}
  const operation=(async()=>{
    try{await driver?.close(state);windows.delete(id);await closePluginView(id);changed();return {closed:true}}
    catch(error){state.error=error instanceof Error?error.message:String(error);changed();throw error}
  })()
  closing.set(id,operation)
  try{return await operation}finally{closing.delete(id)}
}
export async function closePluginWindows(){await Promise.all([...opening.values()]);await Promise.all([...windows.keys()].map(id=>dismissPluginWindow(id)))}
