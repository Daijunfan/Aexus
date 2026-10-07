import {useMemo,useSyncExternalStore} from 'react'
import {DEFAULT_PREFERENCES,LANGUAGES,type InterfaceLanguage} from '../../../shared/preferences'
import {zhCN} from './zh-CN'
const sourceKeys=new Map<string,string>();for(const [key,value] of Object.entries(zhCN))if(!sourceKeys.has(value))sourceKeys.set(value,key)
const listeners=new Set<()=>void>()
let language:InterfaceLanguage=DEFAULT_PREFERENCES.language
try{const cached=localStorage.getItem('agents-company-language');if(LANGUAGES.includes(cached as InterfaceLanguage))language=cached as InterfaceLanguage}catch{}
document.documentElement.lang=language
export function setInterfaceLanguage(value:InterfaceLanguage){
 if(!LANGUAGES.includes(value))return
 document.documentElement.lang=value
 if(value===language)return
 language=value
 try{localStorage.setItem('agents-company-language',value)}catch{}
 for(const listener of listeners)listener()
}
export const interfaceLanguage=()=>language
export const interfaceLocale=()=>language==='zh-CN'?'zh-CN':'en-US'
export function translate(key:string,values:readonly unknown[]=[],selected=language){
 const normalized=key.replace(/\s+/g,' ').trim(),canonical=zhCN[key]!==undefined?key:sourceKeys.get(normalized)??normalized
 const rendered=selected==='zh-CN'?zhCN[canonical]??canonical:canonical
 const template=(/^\s/.test(key)?' ':'')+rendered+(/\s$/.test(key)?' ':'')
 return template.replace(/\{(\d+)\}/g,(token,index)=>Number(index)<values.length?String(values[Number(index)]??''):token)
}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const onInterfaceLanguageChange=subscribe
export function useI18n(){
 const selected=useSyncExternalStore(subscribe,interfaceLanguage,()=>DEFAULT_PREFERENCES.language)
 return useMemo(()=>({language:selected,locale:selected==='zh-CN'?'zh-CN':'en-US',t:(key:string,values:readonly unknown[]=[])=>translate(key,values,selected)}),[selected])
}
