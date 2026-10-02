import {useEffect,useRef,useState} from 'react'
import {api} from '../api'
import type {MediaInfo} from '../../../shared/media'
import {Icon} from '../components/Icon'
import {translate as uiText,useI18n} from '../i18n'
import {audioKey,useAudioPlayback,type AudioTrack} from './AudioPlayback'
import {mediaSourceUrl,mediaPlaybackError} from './mediaPresentation'
import {MediaControls} from './MediaControls'

/** Inactive cards read only duration; the application owns the playing audio element. */
export function MessageAudio({track}:{track:AudioTrack}){
 useI18n()
 const key=audioKey(track),player=useAudioPlayback(key)!,root=useRef<HTMLDivElement>(null),active=player.state.active===key
 const [metadata,setMetadata]=useState({key,duration:0,error:''}),{duration,error}=metadata.key===key?metadata:{duration:0,error:''}
 useEffect(()=>{
  if(active||duration>0)return
  let alive=true,started=false,id:string|undefined;const preview=document.createElement('audio');preview.preload='metadata'
  const close=()=>{preview.onloadedmetadata=null;preview.onerror=null;preview.removeAttribute('src');preview.load();if(id){void api.call('messenger.media-close',{id}).catch(()=>{});id=undefined}}
  const load=async()=>{if(started)return;started=true;try{const info=await api.call<MediaInfo>('messenger.media-open',{conversation:track.conversation,path:track.path});if(!alive){void api.call('messenger.media-close',{id:info.id}).catch(()=>{});return}id=info.id;preview.onloadedmetadata=()=>{if(alive)setMetadata({key,duration:Number.isFinite(preview.duration)?preview.duration:0,error:''});close()};preview.onerror=()=>{if(alive)setMetadata({key,duration:0,error:mediaPlaybackError});close()};preview.src=mediaSourceUrl(id);preview.load()}catch{if(alive)setMetadata({key,duration:0,error:mediaPlaybackError})}}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){void load();observer.disconnect()}},{rootMargin:'150px'});if(root.current)observer.observe(root.current)
  return()=>{alive=false;observer.disconnect();close()}
 },[key,active])
 useEffect(()=>{if(active&&player.state.duration>0)setMetadata({key,duration:player.state.duration,error:''})},[key,active,player.state.duration])
 const state=player.state,total=active?state.duration||duration:duration,current=active?state.current:0,playing=active&&state.playing,problem=active?state.error:error,queued=state.queue.some(item=>audioKey(item)===key)
 return <div ref={root} className="message-media audio message-audio" role="region" aria-label={uiText('Media player for {0}',[track.name])} data-playing={playing||undefined}>
  <MediaControls state={{...state,current,duration:total,buffered:active?state.buffered:0,playing,loading:active&&state.loading}} seekable={active} controls={{...player,toggle:()=>active?player.toggle():player.choose(track)}} status={active&&state.loading?'Loading media…':playing?'Playing':queued?'In audio queue':'Audio attachment'} volumeActions={<><button aria-label={uiText('Play {0} next',[track.name])} title={uiText('Play next')} onClick={()=>player.add(track,true)}><Icon name="arrow-right"/></button><button aria-label={uiText('Add {0} to audio queue',[track.name])} title={uiText(queued?'In audio queue':'Add to audio queue')} disabled={queued} onClick={()=>player.add(track)}><Icon name={queued?'check':'list-ordered'}/></button></>}/>
  {problem&&<p className="message-media-error" role="alert">{uiText(problem)} <button onClick={()=>active?player.retry():player.choose(track)}>{uiText('Retry playback')}</button></p>}
 </div>
}
