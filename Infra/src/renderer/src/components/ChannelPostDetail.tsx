import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {ChannelPost,ChannelView} from '../../../shared/channels'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'
import {translate as uiText,useI18n} from '../i18n'
import {useDialogFocus} from '../office/useDialogFocus'
import {playMessageMotion} from '../chat/surfaceMotion'
import {ChannelNewsCard} from './ChannelNewsCard'
import {useChannelReading} from './useChannelReading'
import {Icon} from './Icon'

/** A reading overlay, never a navigation to the channel timeline or a copy of its data. */
export function ChannelPostDetail({id,channelId,sourceId,sourceAvatar,blocked=false,onClose,onChanged,onAuthor}:{id:string;channelId:string;sourceId?:string;sourceAvatar?:ChannelView['avatar'];blocked?:boolean;onClose:()=>void;onChanged:(post:ChannelPost|null)=>void;onAuthor:(sourceId:string)=>void}){
 useI18n()
 const overlay=useRef<HTMLDivElement>(null),host=useRef<HTMLElement|null>(null),panel=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null),outside=useRef(false),refreshRef=useRef<()=>void>(()=>{}),updated=useRef(onChanged);updated.current=onChanged
 const [post,setPost]=useState<ChannelPost|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useDialogFocus('.channel-post-detail',true,()=>host.current?.querySelector<HTMLButtonElement>(`.channel-post-card[data-news-id="${CSS.escape(id)}"] .channel-post-open`)??host.current?.querySelector<HTMLButtonElement>('.channel-view-switch button[aria-pressed=true]')??null)
 useLayoutEffect(()=>{
  const node=overlay.current;if(!node)return;host.current=node.parentElement
  const siblings=[...node.parentElement!.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==node).map(el=>({el,inert:el.inert}))
  for(const {el} of siblings)el.inert=true
  const motion=panel.current&&playMessageMotion(panel.current,[{opacity:0,transform:'translateY(8px) scale(.985)'},{opacity:1,transform:'none'}],180)
  return()=>{for(const {el,inert} of siblings)el.inert=inert;motion?.cancel()}
 },[])
 useEffect(()=>{
  let alive=true
  const refresh=createRefreshQueue(async()=>{
   if(!alive)return
   setLoading(true)
   try{
    const value=await api.call<ChannelPost>('channel.post',{id});if(!alive)return
    if(value.channelId!==channelId||sourceId&&value.sourceId!==sourceId)throw Error('This post is no longer available in this channel.')
    setPost(value);setError('')
   }catch(cause){if(alive){setPost(null);setError((cause as Error).message);if(/deleted|expired|Unknown news item|no longer available/.test((cause as Error).message))updated.current(null)}}
   finally{if(alive)setLoading(false)}
  })
  refreshRef.current=()=>void refresh();void refresh()
  const off=api.onEvent(event=>{if(event.channel!=='channel:changed'||['reads','messages'].includes(event.payload.kind))return;if(event.payload.postIds?.length&&!event.payload.postIds.includes(id))return;void refresh()})
  return()=>{alive=false;off()}
 },[id,channelId,sourceId])
 const reading=useChannelReading(channelId,scroll,post?[post.id]:[],!!post&&!loading&&!error&&!blocked)
 const changed=(value:ChannelPost|null)=>{setPost(value);if(!value)setError(uiText('This post is no longer available in this channel.'));updated.current(value)}
 return <div ref={overlay} className="channel-post-detail-overlay" onPointerDown={event=>{outside.current=event.button===0&&event.target===event.currentTarget}} onClick={event=>{if(outside.current&&event.target===event.currentTarget)onClose();outside.current=false}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.nativeEvent.isComposing&&panel.current?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();onClose()}}}>
  <section ref={panel} className="channel-post-detail" role="dialog" aria-modal="true" aria-label={uiText('Post details')}>
   <header className="channel-post-detail-heading"><span>{uiText('Post')}</span><button type="button" aria-label={uiText('Close post')} title={uiText('Close post')} onClick={onClose}><Icon name="close"/></button></header>
   <div ref={scroll} className="channel-post-detail-scroll" aria-busy={loading}>
    {post&&<ChannelNewsCard post={post} expandedInitially sourceAvatar={sourceAvatar} onAuthor={onAuthor} onChanged={changed}/>}
    {!post&&!error&&<div className="channel-post-detail-status" role="status"><Icon name="loading"/>{uiText('Loading article…')}</div>}
    {error&&<div className="channel-post-detail-status" role="alert"><Icon name="info"/><p>{uiText(error)}</p><button onClick={()=>refreshRef.current()}>{uiText('Retry')}</button></div>}
    {reading.error&&<p className="channel-inline-error" role="alert">{uiText(reading.error)}</p>}
    {post&&<span className="channel-post-detail-end" data-channel-read={post.id} aria-hidden="true"/>}
   </div>
  </section>
 </div>
}
