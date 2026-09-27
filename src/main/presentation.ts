import type {ViewState} from '../shared/view'
import {currentClientId} from './request-context'
const views=new Map<string,ViewState>()
const listeners=new Set<(state:ViewState,clientId:string)=>void>()
export const getView=()=>views.get(currentClientId()??'desktop')??{kind:'home' as const,revision:0}
export function setView(next:Omit<ViewState,'revision'>):ViewState{
  const id=currentClientId()??'desktop',before=getView(),value={shared:before.shared,...next,revision:before.revision+1}
  views.set(id,value)
  for(const listener of listeners)listener(value,id)
  return value
}
export function onViewChange(listener:(state:ViewState,clientId:string)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
