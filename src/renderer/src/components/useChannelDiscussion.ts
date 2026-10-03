import {useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import type {ChannelMessage,ChannelHistory} from '../../../shared/channels'
import {api} from '../api'
import {createRefreshQueue,retainEqual} from '../snapshot'
import {useReadingPosition} from './useReadingPosition'

export function useChannelDiscussion(id:string,container:RefObject<HTMLElement|null>,enabled=true){
 const [messages,setMessages]=useState<ChannelMessage[]>([]),[before,setBefore]=useState<number|null>(null),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[error,setError]=useState('')
 const alive=useRef(true),loaded=useRef(messages),initial=useRef(false),pending=useRef(new Set<string>()),keepPosition=useReadingPosition(container,messages)
 loaded.current=messages
 const merge=(items:ChannelMessage[])=>{keepPosition();setMessages(previous=>{const next=new Map(previous.map(message=>[message.id,message]));for(const item of items)next.set(item.id,item);return retainEqual(previous,[...next.values()].sort((a,b)=>a.sequence-b.sequence))})}
 const refresh=useMemo(()=>createRefreshQueue(async()=>{
  if(!enabled){setLoading(false);return}
  const ids=[...pending.current];pending.current.clear()
  try{
   const page=await api.call<ChannelHistory>('channel.history',{id,limit:100})
   const older=ids.filter(key=>loaded.current.some(message=>message.id===key)&&!page.messages.some(message=>message.id===key))
   const updates=await Promise.all(older.map(around=>api.call<ChannelHistory>('channel.history',{id,around,limit:1})))
   if(!alive.current)return
   merge([...page.messages,...updates.flatMap(page=>page.messages)])
   if(!initial.current){initial.current=true;setBefore(page.nextBefore)}
   setError('')
  }catch(cause){if(alive.current)setError((cause as Error).message)}finally{if(alive.current)setLoading(false)}
 }),[id,enabled,keepPosition])
 useEffect(()=>{
  alive.current=true;void refresh();let timer:ReturnType<typeof setTimeout>|undefined
  const off=api.onEvent(event=>{if(!enabled||event.channel!=='channel:changed'||event.payload.kind!=='messages'||event.payload.channelIds&&!event.payload.channelIds.includes(id))return;for(const key of event.payload.messageIds??[])pending.current.add(key);if(!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},40)})
  return()=>{alive.current=false;clearTimeout(timer);off()}
 },[id,refresh])
 const loadMore=async()=>{if(before===null||more)return;setMore(true);try{const page=await api.call<ChannelHistory>('channel.history',{id,before,limit:100});if(alive.current){merge(page.messages);setBefore(page.nextBefore);setError('')}}catch(cause){if(alive.current)setError((cause as Error).message)}finally{if(alive.current)setMore(false)}}
 const reveal=async(around:string,signal?:AbortSignal)=>{if(signal?.aborted)return null;const existing=loaded.current.find(message=>message.id===around);if(existing)return existing;const page=await api.call<ChannelHistory>('channel.history',{id,around,limit:1});if(!alive.current||signal?.aborted)return null;merge(page.messages);return page.messages.find(message=>message.id===around)??null}
 return {messages,before,loading,more,error,refresh,loadMore,reveal,changed:merge}
}
