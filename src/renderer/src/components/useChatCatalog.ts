import {useEffect,useState} from 'react'
import {api} from '../api'
import {retainEqual,createRefreshQueue} from '../snapshot'
import type {ChatGroupView} from '../../../shared/chat-groups'
/** The application owns one group catalog. Views consume it rather than maintaining divergent copies. */
export function useChatCatalog(){
 const [groups,setGroups]=useState<ChatGroupView[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let mounted=true,timer:ReturnType<typeof setTimeout>|undefined
  const refresh=createRefreshQueue(async()=>{try{const value=await api.call<ChatGroupView[]>('chat.list');if(!Array.isArray(value))throw Error('Invalid group catalog response');if(mounted){setGroups(previous=>retainEqual(previous,value));setError('');setReady(true)}}catch(cause){if(mounted)setError((cause as Error).message)}})
  void refresh()
  const off=api.onEvent(event=>{if(['chat:changed','store:changed'].includes(event.channel)&&!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},40)})
  return()=>{mounted=false;off();clearTimeout(timer)}
 },[])
 return {groups,ready,error}
}
