import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode} from 'react'
import {api} from '../api'
import type {MediaInfo} from '../../../shared/media'
import {mediaSourceUrl,mediaPreferences,claimMedia,watchMedia} from './mediaPresentation'
export type AudioTrack={conversation:string;messageId:string;path:string;name:string}
export const audioKey=(track:AudioTrack)=>JSON.stringify([track.conversation,track.messageId,track.path])
type Repeat='off'|'all'|'one'
type AudioState={ownsSession:boolean;queue:AudioTrack[];active:string|null;playing:boolean;loading:boolean;current:number;duration:number;buffered:number;error:string;volume:number;muted:boolean;rate:number;repeat:Repeat}
const empty=():AudioState=>({ownsSession:false,queue:[],active:null,playing:false,loading:false,current:0,duration:0,buffered:0,error:'',volume:mediaPreferences.volume,muted:mediaPreferences.muted,rate:mediaPreferences.rates.audio,repeat:'off'})
type AudioController=ReturnType<typeof useAudioController>
type AudioSource={getSnapshot:()=>AudioController;subscribe:(listener:()=>void)=>()=>void}
export const AudioPlaybackContext=createContext<AudioSource|null>(null)
export const useAudioPlaybackAvailable=()=>useContext(AudioPlaybackContext)!==null
const idleSubscription=()=>()=>{}
/** A card follows its own playback and shared controls; the dock follows the full player. */
export function useAudioPlayback(key?:string){
 const source=useContext(AudioPlaybackContext)
 const getSnapshot=useMemo(()=>{
  let previous:AudioController|null=null
  return()=>{
   const next=source?.getSnapshot()??null
   if(!next||!previous||key===undefined||next.state.active===key||previous.state.active===key)return previous=next
   const a=previous.state,b=next.state
   if(a.queue!==b.queue||a.rate!==b.rate||a.volume!==b.volume||a.muted!==b.muted)previous=next
   return previous
  }
 },[source,key])
 return useSyncExternalStore(source?.subscribe??idleSubscription,getSnapshot,getSnapshot)
}

/** Client playback state only. Every source still opens and reads through authenticated Core APIs. */
function useAudioController(titleFor:(conversation:string)=>string,onReveal:(track:AudioTrack)=>void){
 const element=useRef<HTMLAudioElement>(null),grant=useRef<MediaInfo|null>(null),generation=useRef(0),alive=useRef(true),wanted=useRef(false),[state,setState]=useState<AudioState>(empty),current=useRef(state)
 const update=(patch:Partial<AudioState>)=>{const next={...current.current,...patch};current.current=next;setState(next)}
 const track=()=>current.current.queue.find(item=>audioKey(item)===current.current.active)
 const release=()=>{const id=grant.current?.id;grant.current=null;if(id)void api.call('messenger.media-close',{id}).catch(()=>{})}
 const clearSource=()=>{generation.current++;wanted.current=false;const audio=element.current;audio?.pause();audio?.removeAttribute('src');audio?.load();release()}
 const pause=()=>{wanted.current=false;element.current?.pause();update({playing:false,loading:false})}
 const play=async()=>{
  const selected=track(),audio=element.current;if(!selected||!audio)return
  wanted.current=true;claimMedia(audio);update({ownsSession:true})
  const key=audioKey(selected);let request=generation.current
  try{
   if(!grant.current||current.current.error){
    request=++generation.current;release();update({loading:true,error:''})
    const value=await api.call<MediaInfo>('messenger.media-open',{conversation:selected.conversation,path:selected.path})
    if(!alive.current||request!==generation.current||current.current.active!==key){void api.call('messenger.media-close',{id:value.id}).catch(()=>{});return}
    grant.current=value;audio.src=mediaSourceUrl(value.id);audio.load()
   }
   if(!wanted.current||current.current.active!==key)return
   audio.volume=mediaPreferences.volume;audio.muted=mediaPreferences.muted;audio.playbackRate=mediaPreferences.rates.audio
   update({volume:audio.volume,muted:audio.muted,rate:audio.playbackRate})
   if(audio.ended)audio.currentTime=0
   await audio.play()
  }catch(cause){if(alive.current&&request===generation.current&&current.current.active===key&&(cause as Error).name!=='AbortError')update({playing:false,loading:false,error:(cause as Error).name==='NotAllowedError'?'Press play to start playback.':'This media could not be played. Retry or download the file.'})}
 }
 const choose=(item:AudioTrack,start=true)=>{
  const key=audioKey(item),queue=current.current.queue.some(value=>audioKey(value)===key)?current.current.queue:[...current.current.queue,item]
  if(current.current.active!==key){clearSource();update({queue,active:key,current:0,duration:0,buffered:0,playing:false,loading:false,error:''})}
  else if(queue!==current.current.queue)update({queue})
  if(start)void play()
 }
 const add=(item:AudioTrack,next=false)=>{
  const state=current.current,key=audioKey(item),present=state.queue.some(value=>audioKey(value)===key)
  if(present&&!next)return
  if(key===state.active)return
  const queue=state.queue.filter(value=>audioKey(value)!==key),index=queue.findIndex(value=>audioKey(value)===state.active)
  queue.splice(next?Math.max(0,index+1):queue.length,0,item);update({queue,active:state.active??key})
 }
 const move=(key:string,delta:number)=>{const queue=[...current.current.queue],index=queue.findIndex(item=>audioKey(item)===key),to=index+delta;if(index<0||to<0||to>=queue.length)return;const [item]=queue.splice(index,1);queue.splice(to,0,item);update({queue})}
 const reorder=(from:number,to:number)=>{const queue=[...current.current.queue];if(from<0||from>=queue.length||to<0||to>=queue.length||from===to)return;const [item]=queue.splice(from,1);queue.splice(to,0,item);update({queue})}
 const stop=()=>{clearSource();update({...empty(),volume:current.current.volume,muted:current.current.muted,rate:current.current.rate,repeat:current.current.repeat})}
 const remove=(key:string)=>{const state=current.current,index=state.queue.findIndex(item=>audioKey(item)===key),queue=state.queue.filter(item=>audioKey(item)!==key);if(key!==state.active){update({queue});return}const resume=state.playing;if(!queue.length){stop();return};clearSource();const selected=queue[Math.min(index,queue.length-1)];update({queue,active:null});choose(selected,resume)}
 const seek=(value:number)=>{const audio=element.current;if(!audio||!current.current.duration)return;audio.currentTime=Math.max(0,Math.min(current.current.duration,value));update({current:audio.currentTime})}
 const step=(direction:number)=>{const state=current.current,index=state.queue.findIndex(item=>audioKey(item)===state.active);if(direction<0&&state.current>3){seek(0);return}let next=index+direction;if(next<0||next>=state.queue.length){if(state.repeat!=='all')return;next=(next+state.queue.length)%state.queue.length}if(state.queue[next])choose(state.queue[next])}
 const volume=(value:number)=>{mediaPreferences.volume=value;mediaPreferences.muted=false;if(element.current){element.current.volume=value;element.current.muted=false};update({volume:value,muted:false})}
 const mute=()=>{const value=!current.current.muted;mediaPreferences.muted=value;if(element.current)element.current.muted=value;update({muted:value})}
 const speed=()=>{const values=[.75,1,1.25,1.5,2],rate=values[(values.indexOf(current.current.rate)+1)%values.length];mediaPreferences.rates.audio=rate;if(element.current)element.current.playbackRate=rate;update({rate})}
 const repeat=()=>{const values:Repeat[]=['off','all','one'];update({repeat:values[(values.indexOf(current.current.repeat)+1)%values.length]})}
 const events={
  onLoadedMetadata:()=>{const audio=element.current;if(audio)update({duration:Number.isFinite(audio.duration)?audio.duration:0,loading:false})},
  onTimeUpdate:()=>{if(element.current?.readyState)update({current:element.current.currentTime})},
  onProgress:()=>{const audio=element.current;if(audio?.buffered.length)update({buffered:audio.buffered.end(audio.buffered.length-1)})},
  onPlay:()=>{for(const other of document.querySelectorAll<HTMLMediaElement>('[data-message-media]'))if(other!==element.current)other.pause();update({playing:true,loading:false,error:''})},
  onPause:()=>{if(alive.current)update({playing:false,...(!wanted.current?{loading:false}:{})})},onWaiting:()=>update({loading:true}),onPlaying:()=>update({loading:false}),onSeeked:()=>update({loading:false}),
  onEnded:()=>{if(!wanted.current){update({playing:false,loading:false});return};const state=current.current,index=state.queue.findIndex(item=>audioKey(item)===state.active);if(state.repeat==='one'){seek(0);void play()}else if(index<state.queue.length-1||state.repeat==='all')step(1);else update({playing:false,loading:false})},
  onError:()=>{if(alive.current&&grant.current)update({playing:false,loading:false,error:'This media could not be played. Retry or download the file.'})}
 }
 const latest=useRef({play,pause,step,seek,stop});latest.current={play,pause,step,seek,stop}
 useEffect(()=>{alive.current=true;const audio=element.current,off=audio?watchMedia(audio,()=>{wanted.current=false;audio.pause();update({playing:false,loading:false,ownsSession:false})}):()=>{};return()=>{off();alive.current=false;generation.current++;wanted.current=false;audio?.pause();audio?.removeAttribute('src');audio?.load();release()}},[])
 useEffect(()=>api.onEvent(event=>{if(event.channel==='client:authentication'&&!event.payload.authenticated)latest.current.stop()}),[])
 useEffect(()=>{if(!('mediaSession' in navigator)||!state.active||!state.ownsSession)return;const selected=track()!;navigator.mediaSession.metadata=new MediaMetadata({title:selected.name,artist:titleFor(selected.conversation),album:'Avalon'});navigator.mediaSession.playbackState=current.current.playing?'playing':'paused';const handlers:Partial<Record<MediaSessionAction,MediaSessionActionHandler>>={play:()=>void latest.current.play(),pause:()=>latest.current.pause(),stop:()=>latest.current.stop(),previoustrack:()=>latest.current.step(-1),nexttrack:()=>latest.current.step(1),seekbackward:details=>latest.current.seek(current.current.current-(details.seekOffset??10)),seekforward:details=>latest.current.seek(current.current.current+(details.seekOffset??10)),seekto:details=>{if(details.seekTime!==undefined)latest.current.seek(details.seekTime)}};for(const [name,handler] of Object.entries(handlers))try{navigator.mediaSession.setActionHandler(name as MediaSessionAction,handler!)}catch{};return()=>{for(const name of Object.keys(handlers))try{navigator.mediaSession.setActionHandler(name as MediaSessionAction,null)}catch{};navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none'}},[state.active,state.ownsSession,titleFor])
 useEffect(()=>{if('mediaSession' in navigator&&state.active&&state.ownsSession)navigator.mediaSession.playbackState=state.playing?'playing':'paused'},[state.active,state.playing,state.ownsSession])
 useEffect(()=>{if(!state.ownsSession||!state.duration||!('mediaSession' in navigator)||!navigator.mediaSession.setPositionState)return;try{navigator.mediaSession.setPositionState({duration:state.duration,playbackRate:state.rate,position:Math.max(0,Math.min(state.duration,state.current))})}catch{}},[state.ownsSession,state.duration,state.rate,state.current])
 const toggle=()=>current.current.playing||wanted.current?pause():void play()
 return {state,element,events,selected:track(),choose,add,move,reorder,remove,stop,seek,step,volume,mute,speed,repeat,toggle,retry:()=>{clearSource();void play()},titleFor,reveal:()=>{const item=track();if(item)onReveal(item)}}
}
export function AudioPlaybackProvider({children,titleFor,onReveal}:{children:ReactNode;titleFor:(conversation:string)=>string;onReveal:(track:AudioTrack)=>void}){
 const value=useAudioController(titleFor,onReveal)
 const [source]=useState(()=>{
  let snapshot=value;const listeners=new Set<()=>void>()
  return {getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},publish:(next:AudioController)=>{snapshot=next;for(const listener of listeners)listener()}}
 })
 useLayoutEffect(()=>source.publish(value),[source,value])
 return <AudioPlaybackContext.Provider value={source}><audio ref={value.element} data-message-media data-background-audio preload="metadata" {...value.events} style={{display:'none'}}/>{children}</AudioPlaybackContext.Provider>
}
