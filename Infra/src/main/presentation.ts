import {join} from 'node:path'
import {APP_HOME} from '../shared/core-paths'
import type {ViewState} from '../shared/view'
import {atomicJson,readJson} from './atomic-file'
import {currentClientId} from './request-context'
type MessageLocation=Pick<ViewState,'employee'|'chatId'|'channelId'|'sourceId'>&{kind:'messages'}
const views=new Map<string,ViewState>(),remembered=new Map<string,ViewState>(),messageFile=join(APP_HOME,'message-navigation.json')
const messages=()=>readJson<Record<string,MessageLocation>>(messageFile,()=>({}),value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(view=>view?.kind==='messages'&&['employee','chatId','channelId','sourceId'].every(key=>view[key]===undefined||typeof view[key]==='string')))
const listeners=new Set<(state:ViewState,clientId:string)=>void>()
export const getView=():ViewState=>views.get(currentClientId()??'desktop')??{kind:'home',layer:'launcher',revision:0}
const key=(engine=getView().engineId)=>JSON.stringify([currentClientId()??'desktop',engine??null])
export const getMessagesView=():Omit<ViewState,'revision'>=>messages()[key()]??(!getView().engineId?messages()[currentClientId()??'desktop']:undefined)??{kind:'messages'}
export function loadEngineView(engineId:string):ViewState{
 const previous=remembered.get(key(engineId))
 return setView(previous?{...previous,engineId,layer:'engine',shared:false}:{kind:'home',engineId,layer:'engine',shared:false})
}
export function setView(next:Omit<ViewState,'revision'>):ViewState{
 const id=currentClientId()??'desktop',before=getView()
 if(before.engineId)remembered.set(key(before.engineId),before)
 const value:ViewState={shared:before.shared,...(before.engineId?{engineId:before.engineId,layer:before.layer}:{}),...next,revision:before.revision+1}
 // Ordinary navigation inside a loaded workspace returns to its Infra without losing Engine identity.
 if(next.layer===undefined)value.layer=value.engineId?'infra':'launcher'
 if(value.layer==='launcher'){value.engineId=undefined;value.shared=false;value.employee=undefined;value.chatId=undefined;value.channelId=undefined;value.returnTo=undefined}
 if(value.kind==='messages'){
  const saved=messages();saved[key(value.engineId)]={kind:'messages',employee:value.employee,chatId:value.chatId,channelId:value.channelId,sourceId:value.sourceId};atomicJson(messageFile,saved,true)
 }
 views.set(id,value)
 for(const listener of listeners)listener(value,id)
 return value
}
export function onViewChange(listener:(state:ViewState,clientId:string)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
