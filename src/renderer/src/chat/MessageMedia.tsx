import {useMessageOwner,useMessageRowState} from './MessageViewport'
import {MessageAudio} from './MessageAudio'
import {useAudioPlaybackAvailable} from './AudioPlayback'
import {mediaSourceUrl as sourceUrl,mediaPreferences as preferences,claimMedia,watchMedia,mediaPlaybackError} from './mediaPresentation'
import {MediaControls} from './MediaControls'
import {useEffect,useRef,useState} from 'react'
import {api} from '../api'
import {Icon} from '../components/Icon'
import {translate as uiText,useI18n} from '../i18n'
import type {MediaInfo} from '../../../shared/media'

/** Native media decoding and range reads, with the same light controls for both clients. */
type Props={conversation:string;path:string;name:string;kind:'audio'|'video';messageId?:string}
export function MessageMedia(props:Props){const background=useAudioPlaybackAvailable();return props.kind==='audio'&&props.messageId&&background?<MessageAudio track={{conversation:props.conversation,path:props.path,name:props.name,messageId:props.messageId}}/>:<InlineMedia {...props}/>}
function InlineMedia({conversation,path,name,kind}:Props){
 useI18n()
 const [current,setCurrent]=useMessageRowState('media:'+kind+':'+path,0)
 const root=useRef<HTMLDivElement>(null),media=useRef<HTMLVideoElement&HTMLAudioElement>(null),grant=useRef<MediaInfo|null>(null),opening=useRef<Promise<void>|null>(null),mounted=useRef(true),visible=useRef(true),resume=useRef(current),playIntent=useRef(0)
 const [src,setSrc]=useState(''),[ready,setReady]=useState(false),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[duration,setDuration]=useState(0),[buffered,setBuffered]=useState(0),[volume,setVolume]=useState(preferences.volume),[muted,setMuted]=useState(preferences.muted),[rate,setRate]=useState(preferences.rates[kind]),[fullscreen,setFullscreen]=useState(false)
 useMessageOwner(playing||fullscreen)
 const release=()=>{const id=grant.current?.id;grant.current=null;if(id)void api.call('messenger.media-close',{id}).catch(()=>{})}
 const unload=()=>{if(media.current&&media.current.readyState>0)resume.current=media.current.currentTime;media.current?.pause();media.current?.removeAttribute('src');media.current?.load();release();setSrc('');setReady(false);setBuffered(0);setPlaying(false);setLoading(false)}
 useEffect(()=>{mounted.current=true;const element=media.current,auth=api.onEvent(event=>{if(event.channel==='client:authentication'&&!event.payload.authenticated){playIntent.current++;unload()}}),off=element?watchMedia(element,()=>{playIntent.current++;element.pause()}):()=>{};const observer=new IntersectionObserver(entries=>{visible.current=entries.some(entry=>entry.isIntersecting);if(!visible.current&&media.current?.paused)unload();else if(visible.current&&!grant.current&&!opening.current)void open().catch(()=>{if(mounted.current){setLoading(false);setError(mediaPlaybackError)}})},{rootMargin:'150px'});if(root.current)observer.observe(root.current);return()=>{mounted.current=false;auth();off();playIntent.current++;observer.disconnect();element?.pause();element?.removeAttribute('src');element?.load();release()}},[conversation,path])
 useEffect(()=>{const element=media.current;if(element){element.volume=volume;element.muted=muted;element.playbackRate=rate}},[volume,muted,rate,src])
 useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
 useEffect(()=>{if(!playing)return;let frame=0;const tick=()=>{const element=media.current;if(element)setCurrent(element.currentTime);frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame)},[playing])
 const open=()=>{
  if(opening.current)return opening.current
  const work=(async()=>{setLoading(true);setError('');const value=await api.call<MediaInfo>('messenger.media-open',{conversation,path});if(!mounted.current||!visible.current&&media.current?.paused){void api.call('messenger.media-close',{id:value.id}).catch(()=>{});return}release();grant.current=value;const url=sourceUrl(value.id);setSrc(url);if(media.current){media.current.src=url;media.current.load()}})()
  opening.current=work
  void work.finally(()=>{if(opening.current===work)opening.current=null}).catch(()=>{})
  return work
 }
 const changeVolume=(value:number)=>{preferences.volume=value;setVolume(value)}
 const changeMute=(value:boolean)=>{preferences.muted=value;setMuted(value)}
 const changeRate=()=>{const values=[.75,1,1.25,1.5,2],value=values[(values.indexOf(rate)+1)%values.length];preferences.rates[kind]=value;setRate(value)}
 const play=async()=>{const intent=++playIntent.current;if(media.current)claimMedia(media.current);visible.current=true;try{if(!grant.current||error)await open();const element=media.current;if(!element||!mounted.current||intent!==playIntent.current)return;if(element.ended)element.currentTime=0;element.volume=preferences.volume;element.muted=preferences.muted;element.playbackRate=preferences.rates[kind];setVolume(preferences.volume);setMuted(preferences.muted);setRate(preferences.rates[kind]);await element.play()}catch(cause){if(mounted.current){setPlaying(false);setLoading(false);if((cause as Error).name==='AbortError')return;setError((cause as Error).name==='NotAllowedError'?'Press play to start playback.':mediaPlaybackError)}}}
 const toggle=()=>{if(media.current&&!media.current.paused)media.current.pause();else void play()}
 const seek=(value:number)=>{const element=media.current;if(!element||!duration)return;element.currentTime=Math.max(0,Math.min(duration,value));resume.current=element.currentTime;setCurrent(element.currentTime)}
 const toggleFullscreen=async()=>{try{if(document.fullscreenElement===root.current)await document.exitFullscreen();else await root.current?.requestFullscreen()}catch{setError('Fullscreen is unavailable in this window.')}}
 const events={
  onLoadedMetadata:()=>{const element=media.current;if(element){setDuration(Number.isFinite(element.duration)?element.duration:0);if(resume.current>0&&resume.current<element.duration)element.currentTime=resume.current;setLoading(false)}},
  onLoadedData:()=>setReady(true),
  onTimeUpdate:()=>{if(media.current&&media.current.readyState>0){resume.current=media.current.currentTime;setCurrent(media.current.currentTime)}},
  onProgress:()=>{const element=media.current;if(element&&element.buffered.length)setBuffered(element.buffered.end(element.buffered.length-1))},
  onPlay:()=>{for(const other of document.querySelectorAll<HTMLMediaElement>('[data-message-media]'))if(other!==media.current)other.pause();setPlaying(true);setError('')},
  onPause:()=>{setPlaying(false);if(!visible.current)unload()},onWaiting:()=>setLoading(true),onPlaying:()=>setLoading(false),onSeeking:()=>setLoading(true),onSeeked:()=>setLoading(false),onEnded:()=>{setPlaying(false);setLoading(false)},
  onError:()=>{if(src&&mounted.current){setLoading(false);setPlaying(false);setError(mediaPlaybackError)}}
 }
 const key=(event:React.KeyboardEvent)=>{
  if(event.key==='Escape'){event.stopPropagation();if(document.fullscreenElement===root.current){event.preventDefault();void document.exitFullscreen()};return}
  if((event.target as HTMLElement).closest('input,button')||event.metaKey||event.ctrlKey||event.altKey)return
  if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','m','f'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key===' ')toggle();else if(event.key==='m')changeMute(!muted);else if(event.key==='f'&&kind==='video')void toggleFullscreen();else if(event.key==='ArrowLeft'||event.key==='ArrowRight')seek(current+(event.key==='ArrowLeft'?-5:5));else changeVolume(Math.max(0,Math.min(1,volume+(event.key==='ArrowUp'?.05:-.05))))}
 }
 return <div ref={root} className={'message-media '+kind+(fullscreen?' is-fullscreen':'')} role={fullscreen?'dialog':'region'} aria-modal={fullscreen||undefined} aria-label={uiText('Media player for {0}',[name])} tabIndex={0} onKeyDown={key} data-playing={playing||undefined}>
  {fullscreen&&<header className="message-media-fullscreen-header"><strong>{name}</strong><button aria-label={uiText('Exit fullscreen')} onClick={()=>void toggleFullscreen()}><Icon name="close"/></button></header>}
  <div className="message-media-screen">
   {kind==='video'?<video ref={media} data-message-media preload="metadata" playsInline {...events} aria-label={uiText('Video {0}',[name])} onClick={toggle}/>:<audio ref={media} data-message-media preload="metadata" {...events} aria-label={uiText('Audio {0}',[name])}/>}
   {kind==='video'&&(!ready||error)&&<div className="message-video-placeholder"><span><Icon name="device-camera-video"/></span><strong>{uiText('Video attachment')}</strong><small>{uiText('Press play to preview')}</small></div>}
   {kind==='video'&&!playing&&<button className="message-media-cover-play" aria-label={uiText('Play video')} disabled={loading} onClick={()=>void play()}><Icon name={loading?'loading':'play'}/></button>}
  </div>
  <MediaControls state={{current,duration,buffered,playing,loading,rate,volume,muted}} playDisabled={loading&&!src} controls={{toggle,seek,speed:changeRate,mute:()=>changeMute(!muted),volume:value=>{changeVolume(value);changeMute(false)}}} status={loading?'Loading media…':playing?'Playing':duration?'Paused':kind==='audio'?'Audio attachment':'Video attachment'}>
   {kind==='video'&&<button aria-label={uiText(fullscreen?'Exit fullscreen':'Enter fullscreen')} title={uiText(fullscreen?'Exit fullscreen':'Enter fullscreen')} onClick={()=>void toggleFullscreen()}><Icon name={fullscreen?'screen-normal':'screen-full'}/></button>}
  </MediaControls>
  {error&&<p className="message-media-error" role="alert">{uiText(error)} <button disabled={loading} onClick={()=>{unload();void play()}}>{uiText('Retry playback')}</button></p>}
 </div>
}
