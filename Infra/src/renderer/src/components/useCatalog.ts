import {useEffect,useMemo,useRef,useState} from 'react'
import {api} from '../api'
import {createRefreshQueue,retainEqual} from '../snapshot'
type Event={channel:string;payload:any}
/** Shared query lifecycle, not a shared permission cache. Each catalog owns its API. */
export function useCatalog<T>(command:string,enabled:boolean,matches:(event:Event)=>boolean,delay=40,args:Record<string,unknown>={}){
 const [value,setValue]=useState<T[]>([]),[ready,setReady]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const query=JSON.stringify(args)
 const active=useRef(false),generation=useRef(0),filter=useRef(matches);filter.current=matches
 const refresh=useMemo(()=>createRefreshQueue(async()=>{
  if(!active.current)return
  const scope=generation.current
  try{const result=await api.call<T[]>(command,JSON.parse(query));if(!Array.isArray(result))throw Error('Invalid catalog response');if(scope===generation.current){setValue(previous=>retainEqual(previous,result));setReady(true);setError('')}}
  catch(cause){if(scope===generation.current)setError((cause as Error).message)}
  finally{if(scope===generation.current)setLoading(false)}
 }),[command,query])
 useEffect(()=>{
  if(!enabled)return
  active.current=true;generation.current++;let timer:ReturnType<typeof setTimeout>|undefined
  void refresh()
  const off=api.onEvent(event=>{if((event.channel==='engine-scope:changed'||filter.current(event))&&!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},delay)})
  return()=>{active.current=false;generation.current++;off();clearTimeout(timer)}
 },[enabled,refresh,delay])
 return {value,ready,loading,error,refresh}
}
