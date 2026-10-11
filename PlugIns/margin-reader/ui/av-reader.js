import {api,base} from './transport.js';
import {escape,run} from './dom.js';
export const mediaTime=value=>{const seconds=Math.max(0,Number(value)||0);return `${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;};
export class AVReader {
 constructor(surface,scroller){this.surface=surface;this.scroller=scroller;this.key=null;this.serial=0;}
 clear(){this.serial++;this.readyResolve?.();this.abort?.abort();if(this.url)URL.revokeObjectURL(this.url);this.url=null;if(this.player){this.player.pause();this.player.removeAttribute('src');this.player.load();}this.player=null;this.key=null;this.requested=null;this.intervalEnd=null;}
 async show(doc,settings){
  const key=doc.id+':'+doc.sourceVersion;
  if(key!==this.key){
   this.clear();this.key=key;this.doc=doc;
   this.surface.classList.remove('pdf');this.surface.classList.add('av-document');this.surface.style.width='';this.surface.style.height='';delete this.surface.dataset.layout;this.scroller.classList.remove('pdf-scroll');delete this.scroller.dataset.pdfMode;
   const tag=doc.media.type==='video'?'video':'audio';
   this.surface.innerHTML=`<section class="av-player"><${tag} controls preload="auto" playsinline aria-label="${escape(doc.title)}"></${tag}><div class="av-controls"><label>定位（秒） <input class="av-time" type="number" min="0" max="${doc.media.duration}" step="0.1" aria-label="音视频时间"></label><button class="av-seek">跳转</button><label>速度 <select class="av-rate" aria-label="播放速度">${[.25,.5,.75,1,1.25,1.5,2,3].map(v=>`<option value="${v}">${v}×</option>`).join('')}</select></label><span class="av-progress" role="status"></span></div><p class="av-error" role="alert" hidden></p></section>`;
   const player=this.player=this.surface.querySelector(tag),serial=this.serial;
   this.surface.querySelector('.av-rate').onchange=run(async e=>{player.playbackRate=Number(e.target.value);await api('settings.set',{mediaRate:player.playbackRate});});
   this.surface.querySelector('.av-seek').onclick=()=>{this.intervalEnd=null;player.currentTime=Number(this.surface.querySelector('.av-time').value);};
   const changed=()=>{if(this.player!==player)return;const end=this.intervalEnd;if(end!==null&&player.currentTime>=end&&!player.paused){player.pause();player.currentTime=end;}this.surface.querySelector('.av-progress').textContent=`${mediaTime(player.currentTime)} / ${mediaTime(doc.media.duration)}`;if(document.activeElement!==this.surface.querySelector('.av-time'))this.surface.querySelector('.av-time').value=player.currentTime.toFixed(1);this.scroller.dispatchEvent(new Event('reader-media-position'));};
   player.addEventListener('timeupdate',changed);player.addEventListener('seeked',changed);player.addEventListener('pause',changed);
   player.addEventListener('error',()=>{const error=this.surface.querySelector('.av-error');if(error){error.hidden=false;error.textContent='此音视频无法在当前播放器中解码。原件已保留；可使用 CLI 检查媒体信息与提取画面。';}});
   this.abort=new AbortController();
   try{const response=await fetch(new URL('data/'+doc.originalAsset,base),{signal:this.abort.signal});if(!response.ok)throw Error('无法读取本地媒体');const blob=await response.blob();if(this.serial!==serial)return;this.url=URL.createObjectURL(blob);player.src=this.url;}catch(error){if(this.serial!==serial)return;throw error;}
   await new Promise(resolve=>{if(player.readyState>=1)return resolve();const done=()=>{player.removeEventListener('loadedmetadata',done);player.removeEventListener('error',done);if(this.readyResolve===done)this.readyResolve=null;resolve();};this.readyResolve=done;player.addEventListener('loadedmetadata',done,{once:true});player.addEventListener('error',done,{once:true});});
   if(this.serial!==serial||this.player!==player)return;
  }
  this.doc=doc;if(doc.position.endTime!==undefined&&doc.position.endTime>doc.position.time)this.intervalEnd=doc.position.endTime;this.player.playbackRate=settings.mediaRate||1;this.surface.querySelector('.av-rate').value=String(this.player.playbackRate);
  const requested=JSON.stringify(doc.position);if(this.requested!==requested){this.requested=requested;const time=doc.position?.time||0;if(Number.isFinite(this.player.duration)&&Math.abs(this.player.currentTime-time)>.05)this.player.currentTime=time;}
 }
 currentLocator(doc){const time=Math.min(doc.media.duration,Math.max(0,Math.round((this.player?.currentTime||0)*1000)/1000));if(this.intervalEnd!==null&&time>this.intervalEnd+.1)this.intervalEnd=null;const locator={section:0,time,...(this.intervalEnd!==null&&time<=this.intervalEnd?{endTime:this.intervalEnd}:{})};this.requested=JSON.stringify(locator);return locator;}
}
