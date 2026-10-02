import {api} from '../api'
export const mediaPlaybackError='This media could not be played. Retry or download the file.'
export const mediaTime=(value:number)=>{if(!Number.isFinite(value))return '0:00';const seconds=Math.max(0,Math.floor(value)),hours=Math.floor(seconds/3600);return (hours?hours+':':'')+String(Math.floor(seconds/60)%60).padStart(hours?2:1,'0')+':'+String(seconds%60).padStart(2,'0')}
export const mediaSourceUrl=(id:string)=>{if(api.mode!=='web')return 'agents-media://preview/'+id;const url=new URL('/api/media/'+id,location.href);url.searchParams.set('client',sessionStorage.getItem('agents-company-client')??'');return url.href}
export const mediaPreferences={volume:1,muted:false,rates:{audio:1,video:1}}
export const claimMedia=(element:HTMLMediaElement)=>window.dispatchEvent(new CustomEvent('message-media:play-intent',{detail:element}))
export function watchMedia(element:HTMLMediaElement,onOther:()=>void){const handler=(event:Event)=>{if((event as CustomEvent).detail!==element)onOther()};window.addEventListener('message-media:play-intent',handler);return()=>window.removeEventListener('message-media:play-intent',handler)}
