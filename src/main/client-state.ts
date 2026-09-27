import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/protocol'
import type {Store} from '../shared/types'
import type {Viewport} from '../shared/canvas'
import {currentClientId} from './request-context'
import {atomicJson} from './atomic-file'
import {emitCoreEvent} from './core-events'
type State={activeId?:string;cameras:Record<string,Viewport>}
const clients=new Map<string,State>()
function state(id:string){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid client identity')
  let value=clients.get(id)
  if(!value){try{value=JSON.parse(fs.readFileSync(path.join(APP_HOME,'clients',id+'.json'),'utf8'))}catch{value={cameras:{}}};clients.set(id,value!)}
  return value!
}
export function clientStore(store:Store,id=currentClientId()):Store{
  if(!id)return store
  const value=state(id),active=value.activeId
  return {...store,activeTeamViewId:active&&(active==='all'||store.teamViews?.some(view=>view.id===active))?active:store.activeTeamViewId,
    viewport:value.cameras.all??store.viewport,teamViews:store.teamViews?.map(view=>({...view,viewport:value.cameras[view.id]??view.viewport}))}
}
export function setClientView(activeId:string,camera?:Viewport){
  const id=currentClientId();if(!id)return false
  const value=state(id)
  if(camera)value.cameras[activeId]={...camera};else value.activeId=activeId
  atomicJson(path.join(APP_HOME,'clients',id+'.json'),value)
  emitCoreEvent({channel:'store:changed',payload:{clientOnly:true},clientId:id})
  return true
}
