import {useEffect,useRef,useState,type RefObject} from 'react'
import type {ChannelReadEntry,ChannelReadState,ChannelAcknowledgment} from '../../../shared/channels'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'

/** Personal reading is separate from employee delivery receipts. Query only loaded identities. */
export function useChannelReading(id:string,root:RefObject<HTMLDivElement|null>,entryIds:string[],enabled:boolean){
 const cache=useRef({id,entries:new Map<string,ChannelReadEntry|null>()}),[snapshot,setSnapshot]=useState(cache.current),[error,setError]=useState('')
 if(cache.current.id!==id)cache.current={id,entries:new Map()}
 const key=entryIds.join('\n'),refreshRef=useRef<()=>void>(()=>{}),entries=snapshot.id===id?snapshot.entries:cache.current.entries
 useEffect(()=>{
  let alive=true;const wanted=new Set(entryIds)
  if([...cache.current.entries.keys()].some(entry=>!wanted.has(entry))){cache.current={id,entries:new Map([...cache.current.entries].filter(([entry])=>wanted.has(entry)))};setSnapshot(cache.current)}
  const pending=new Set(entryIds.filter(entry=>!cache.current.entries.has(entry)))
  const refresh=createRefreshQueue(async()=>{
   const ids=[...pending];pending.clear()
   try{for(let offset=0;offset<ids.length;offset+=200){
    const batch=ids.slice(offset,offset+200),value=await api.call<ChannelReadState>('channel.read-state',{id,entryIds:batch})
    if(!alive)return
    const next=new Map(cache.current.entries),found=new Map(value.entries.map(entry=>[entry.id,entry]))
    for(const entry of batch){const incoming=found.get(entry)??null;if(next.get(entry)?.state!=='read'||!incoming||incoming.state==='read')next.set(entry,incoming)}
    cache.current={id,entries:next};setSnapshot(cache.current)
   }if(alive)setError('')}catch(cause){if(alive)setError((cause as Error).message)}
  })
  refreshRef.current=()=>{for(const entry of wanted)pending.add(entry);void refresh()}
  if(pending.size)void refresh()
  const off=api.onEvent(event=>{if(event.channel!=='channel:changed'||event.payload.kind!=='reads'||!event.payload.channelIds?.includes(id))return;for(const entry of event.payload.entryIds??wanted)if(wanted.has(entry))pending.add(entry);if(pending.size)void refresh()})
  return()=>{alive=false;off()}
 },[id,key])
 const ready=entryIds.every(entry=>entries.has(entry))
 useEffect(()=>{
  if(!enabled||!ready||!root.current)return
  const area=root.current,observed=new Set<HTMLElement>(),near=new Set<HTMLElement>(),since=new Map<string,number>()
  let disposed=false,sending=false,timer:ReturnType<typeof setTimeout>|undefined,frame=0
  const visible=(marker:HTMLElement)=>{
   if(document.visibilityState!=='visible'||!document.hasFocus()||marker.closest('[hidden]'))return false
   const box=marker.getBoundingClientRect(),viewport=area.getBoundingClientRect()
   if(!box.width||!box.height||!viewport.height||box.top<viewport.top||box.bottom>viewport.bottom+1||box.top<0||box.bottom>innerHeight)return false
   const hit=document.elementFromPoint(Math.max(viewport.left+1,Math.min(viewport.right-1,box.left+box.width/2)),box.top+box.height/2)
   return !!hit&&area.contains(hit)
  }
  const check=()=>{
   clearTimeout(timer);timer=undefined;if(disposed||sending)return
   const now=Date.now(),ids:string[]=[];let delay=Infinity
   for(const marker of near){const entry=marker.dataset.channelRead!,state=cache.current.entries.get(entry)
    if(!state||state.state==='read'||!visible(marker)){since.delete(entry);continue}
    const start=since.get(entry)??now;since.set(entry,start)
    if(now-start>=650)ids.push(entry);else delay=Math.min(delay,650-(now-start))
   }
   if(ids.length){sending=true;const batch=ids.slice(0,200)
    void api.call<ChannelAcknowledgment>('channel.acknowledge',{id,entryIds:batch}).then(value=>{
     if(disposed)return
     if(!value.acknowledged){for(const entry of batch)since.delete(entry);return}
     const accepted=new Set(value.entryIds??[]),next=new Map(cache.current.entries)
     for(const entry of batch){next.set(entry,accepted.has(entry)?{id:entry,state:'read'}:null);since.delete(entry)}
     cache.current={id,entries:next};setSnapshot(cache.current)
    }).catch(()=>{}).finally(()=>{sending=false;if(!disposed)timer=setTimeout(check,1000)})
   }else if(Number.isFinite(delay))timer=setTimeout(check,delay)
  }
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(()=>{frame=0;check()})}
  const intersection=new IntersectionObserver(changes=>{for(const change of changes){const marker=change.target as HTMLElement;if(change.isIntersecting)near.add(marker);else{near.delete(marker);since.delete(marker.dataset.channelRead!)}}schedule()},{root:area,threshold:[0,1]})
  const observe=()=>{const markers=new Set(area.querySelectorAll<HTMLElement>('[data-channel-read]'));for(const marker of observed)if(!markers.has(marker)){intersection.unobserve(marker);observed.delete(marker);near.delete(marker)}for(const marker of markers)if(!observed.has(marker)){observed.add(marker);intersection.observe(marker)}schedule()}
  const content=new MutationObserver(observe);content.observe(area,{childList:true,subtree:true});observe()
  const overlay=new MutationObserver(schedule);overlay.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','style','class','open']})
  const resize=new ResizeObserver(schedule);resize.observe(area)
  const off=api.onEvent(event=>{if(event.channel==='desktop:visibility'){since.clear();schedule()}})
  area.addEventListener('scroll',schedule,{passive:true});window.addEventListener('focus',schedule);window.addEventListener('blur',schedule);document.addEventListener('visibilitychange',schedule)
  return()=>{disposed=true;clearTimeout(timer);cancelAnimationFrame(frame);off();content.disconnect();overlay.disconnect();resize.disconnect();intersection.disconnect();area.removeEventListener('scroll',schedule);window.removeEventListener('focus',schedule);window.removeEventListener('blur',schedule);document.removeEventListener('visibilitychange',schedule)}
 },[id,key,enabled,ready,root])
 return {entries,ready,error,refresh:()=>refreshRef.current()}
}
