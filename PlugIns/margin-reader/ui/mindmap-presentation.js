import {$,escape as E,icon,run} from './dom.js';
import {base} from './transport.js';
import {layoutMindmap} from './mindmap-layout.mjs';
import {topicMarkup,diagramPaths} from './mindmap-view.mjs';
export class MindmapPresentation {
 constructor(study){this.study=study;this.animations=[];this.media=matchMedia('(prefers-reduced-motion: reduce)');this.media.addEventListener('change',()=>this.cancel());}
 cancel(){for(const a of this.animations){a.finished.catch(()=>{});a.cancel();}this.animations=[];}
 render(set){
  const session=set.presentation,current=set.cards.find(c=>c.id===session.cardIds[session.index]),container=$('presentation-content');if(!current)return false;
  this.cancel();const children=set.cards.filter(c=>c.parentId===current.id),parent=!children.length&&current.parentId?set.cards.find(c=>c.id===current.parentId):current;
  const ids=new Set([parent.id]);for(const c of set.cards)if(c.parentId===parent.id)ids.add(c.id);for(const c of set.cards)if(c.parentId===current.id)ids.add(c.id);
  const rows=set.cards.filter(c=>ids.has(c.id)).slice(0,81).map(c=>({...c,collapsed:false,submap:false,parentId:c.id===parent.id?null:c.parentId,position:null}));
  const layout=layoutMindmap(rows,{mindmap:{...set.map?.mindmap,enabled:true,motion:false,items:(set.map?.mindmap?.items||[]).filter(i=>i.cardIds.every(id=>ids.has(id))),showImages:session.showImages!==false},focusId:parent.id});layout.setId=set.id;
  const screen=$('presentation-screen');screen.classList.add('mm-presentation');screen.style.background=layout.config.paper;screen.style.color=layout.config.ink;
  const stage=document.createElement('section');stage.className='mm-presentation-slide';stage.innerHTML=`<header><span>思维导图 · ${E(set.title)}</span><h1>${E(current.title)}</h1></header><div class="mm-presentation-map"><div class="mm-presentation-canvas" style="width:${layout.width}px;height:${layout.height}px"><svg class="mm-presentation-links" width="${layout.width}" height="${layout.height}">${diagramPaths(layout,set.links)}</svg>${rows.filter(c=>layout.positions.has(c.id)).map(c=>topicMarkup(c,layout.positions.get(c.id),layout.topics.get(c.id),set,base,icon('more'))).join('')}</div></div><footer>${session.showNotes&&current.note?`<p>${E(current.note)}</p>`:''}${ids.size>rows.length?`<small>本页展示 ${rows.length} / ${ids.size} 个主题；后续页面可逐一浏览。</small>`:''}${current.source||current.anchor||current.reference?'<button id="mm-presentation-source">回到原文</button>':''}</footer>`;
  container.replaceChildren(stage);const frame=stage.querySelector('.mm-presentation-map'),world=stage.querySelector('.mm-presentation-canvas');const fit=()=>{if(!world.isConnected)return;const scale=Math.min(1.35,(frame.clientWidth-40)/layout.width,(frame.clientHeight-20)/layout.height);world.style.transform=`translate(${(frame.clientWidth-layout.width*scale)/2}px,${(frame.clientHeight-layout.height*scale)/2}px) scale(${scale})`;};
  this.resize?.disconnect();this.resize=new ResizeObserver(fit);this.resize.observe(frame);fit();
  stage.querySelector(`[data-card-id="${current.id}"]`)?.classList.add('selected');stage.querySelectorAll('.study-card-more,.study-card-collapse,.study-card-source').forEach(el=>el.remove());
  $('mm-presentation-source')?.addEventListener('click',run(async()=>{await this.study.change('study.presentation.action',{action:'stop'});return this.study.source(current);}));
  if(!this.media.matches&&document.body.dataset.uiMotion!=='reduced'){
   const direction=this.previousIndex===undefined||session.index>=this.previousIndex?1:-1;
   try{const a=stage.animate([{opacity:0,transform:`translateX(${direction*32}px) scale(.985)`},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:300,easing:'cubic-bezier(.2,.6,.25,1)'});this.animations.push(a);a.finished.catch(()=>{});}catch{}
  }
  this.previousIndex=session.index;return true;
 }
 stop(){this.cancel();this.resize?.disconnect();$('presentation-screen').classList.remove('mm-presentation');$('presentation-screen').style.background='';$('presentation-screen').style.color='';}
}
