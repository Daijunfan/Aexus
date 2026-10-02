import {useCallback,useEffect,useMemo,useRef,useState,type RefObject} from 'react'
import {useReadingPosition} from './useReadingPosition'
import type {ChannelEvent,ChannelPost,ChannelPostPage,ChannelView} from '../../../shared/channels'
import {api} from '../api'
import {createRefreshQueue,retainEqual} from '../snapshot'

export function useChannelCatalog(enabled:boolean){
  const [channels,setChannels]=useState<ChannelView[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('')
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  const refresh=useMemo(()=>createRefreshQueue(async()=>{try{const next=await api.call<ChannelView[]>('channel.list');if(alive.current){setChannels(previous=>retainEqual(previous,next));setReady(true);setError('')}}catch(cause){if(alive.current)setError((cause as Error).message)}}),[])
  useEffect(()=>{if(!enabled)return;void refresh();let timer:ReturnType<typeof setTimeout>|undefined;const off=api.onEvent(event=>{if(event.channel==='channel:changed'&&!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},40)});return()=>{off();clearTimeout(timer)}},[enabled,refresh])
  return {channels,ready,error,refresh}
}

const newestFirst=(a:ChannelPost,b:ChannelPost)=>b.publishedAt-a.publishedAt||(a.id<b.id?1:a.id>b.id?-1:0)
/** Only changed publications are re-read; the loaded cursor and reading tail stay intact. */
export function useChannelPosts(channelId:string,query:string,saved:boolean,container:RefObject<HTMLElement|null>){
  const [posts,setPosts]=useState<ChannelPost[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[error,setError]=useState('')
  const current=useRef(posts),end=useRef(cursor),identity=useRef(''),pending=useRef({full:true,ids:new Set<string>()}),keepPosition=useReadingPosition(container,posts)
  const key=JSON.stringify([channelId,query,saved]);identity.current=key
  const publish=(items:ChannelPost[])=>{keepPosition();current.current=items;setPosts(previous=>retainEqual(previous,items))}
  const refresh=useMemo(()=>createRefreshQueue(async()=>{
    const work=pending.current;pending.current={full:false,ids:new Set()}
    setLoading(true)
    try{
      if(work.full||query){
        const loaded=current.current,boundary=loaded.at(-1),count=Math.max(24,loaded.length+work.ids.size),items:ChannelPost[]=[];let next:string|null=null
        do{const page:ChannelPostPage=await api.call<ChannelPostPage>('channel.posts',{channelId,...(query.trim()?{query:query.trim()}:{}),saved:saved||undefined,limit:Math.min(100,Math.max(24,count-items.length)),...(next?{cursor:next}:{})});if(identity.current!==key)return;items.push(...page.posts);next=page.nextCursor}while(next&&(items.length<count||!!boundary&&newestFirst(items.at(-1)!,boundary)<0))
        publish(items);end.current=next;setCursor(next)
      }else if(work.ids.size){
        const changed=await Promise.all([...work.ids].map(async id=>{try{return [id,await api.call<ChannelPost>('channel.post',{id})] as const}catch(cause){if(['Unknown news item','This news item was deleted or expired'].includes((cause as Error).message))return [id,null] as const;throw cause}}))
        if(identity.current!==key)return
        const items=new Map(current.current.map(post=>[post.id,post])),boundary=current.current.at(-1)
        for(const [id,post] of changed){if(!post||post.channelId!==channelId||saved&&!post.saved)items.delete(id);else if(items.has(id)||!end.current||!boundary||newestFirst(post,boundary)<=0)items.set(id,post)}
        publish([...items.values()].sort(newestFirst))
      }
      if(identity.current===key)setError('')
    }catch(cause){if(identity.current===key)setError((cause as Error).message)}finally{if(identity.current===key)setLoading(false)}
  }),[channelId,query,saved,key,keepPosition])
  useEffect(()=>{identity.current=key;current.current=[];end.current=null;pending.current={full:true,ids:new Set()};setPosts([]);setCursor(null);setMore(false);void refresh();let timer:ReturnType<typeof setTimeout>|undefined;const off=api.onEvent(event=>{if(event.channel!=='channel:changed')return;const change=event.payload as ChannelEvent;if(change.kind==='messages'||change.kind==='reads')return;if(change.channelIds&&!change.channelIds.includes(channelId))return;if(change.postIds?.length)for(const id of change.postIds)pending.current.ids.add(id);else pending.current.full=true;if(!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},80)});return()=>{identity.current='';off();clearTimeout(timer)}},[channelId,key,refresh])
  const loadMore=async()=>{if(!cursor||more||loading)return;const wanted=key;setMore(true);try{const page=await api.call<ChannelPostPage>('channel.posts',{channelId,...(query.trim()?{query:query.trim()}:{}),saved:saved||undefined,cursor,limit:24});if(identity.current!==wanted)return;publish([...current.current,...page.posts.filter(post=>!current.current.some(value=>value.id===post.id))].sort(newestFirst));end.current=page.nextCursor;setCursor(page.nextCursor);setError('')}catch(cause){if(identity.current===wanted)setError((cause as Error).message)}finally{if(identity.current===wanted)setMore(false)}}
  const changed=useCallback((id:string,post:ChannelPost|null)=>{keepPosition();const next=current.current.flatMap(value=>value.id!==id?[value]:post&&post.channelId===channelId&&(!saved||post.saved)?[post]:[]);current.current=next;setPosts(next)},[channelId,saved,keepPosition])
  return {posts,cursor,loading,more,error,refresh:()=>{pending.current.full=true;return refresh()},loadMore,changed}
}
