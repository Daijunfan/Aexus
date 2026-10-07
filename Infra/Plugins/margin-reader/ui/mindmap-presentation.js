import {paintEquations} from './equation-renderer.js';
import {pitchSvg} from './mindmap-pitch-svg.mjs';
import {overviewGlyphs} from './mindmap-overview.mjs';
import {$,escape as E,icon,run} from './dom.js';
import {base} from './transport.js';
import {layoutMindmap} from './mindmap-layout.mjs';
import {topicMarkup,diagramPaths} from './mindmap-view.mjs';
export class MindmapPresentation {
 constructor(study){
  const screen=document.createElement('section');screen.id='presentation-screen';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-label','脑图演示');
  screen.innerHTML='<header><span id="presentation-progress"></span><button id="presentation-close">退出演示 · Esc</button></header><article id="presentation-content"></article><footer><button id="presentation-previous">上一页 · ←</button><button id="presentation-next">下一页 · →</button></footer>';document.body.append(screen);
  for(const action of ['previous','next','close'])$('presentation-'+action).onclick=run(()=>study.change('study.presentation.action',{action:action==='close'?'stop':action}));
  document.addEventListener('keydown',e=>{if(screen.hidden||e.target.closest('input,textarea,[contenteditable]'))return;const id=e.key==='Escape'?'close':e.key==='ArrowLeft'?'previous':['ArrowRight',' '].includes(e.key)?'next':null;if(id){e.preventDefault();e.stopImmediatePropagation();$('presentation-'+id).click();}},true);
  this.study=study;this.animations=[];this.media=matchMedia('(prefers-reduced-motion: reduce)');this.media.addEventListener('change',()=>this.cancel());}
 cancel(){for(const a of this.animations){a.finished.catch(()=>{});a.cancel();}this.animations=[];}
 update(set){
  const p=set.presentation,screen=$('presentation-screen');const on=Boolean(p?.enabled&&p.mode==='map');screen.hidden=!on;
  if(!on){this.stop();return;}const key=JSON.stringify([set.id,set.revision,p.index]);if(key===this.key)return;this.key=key;
  $('presentation-progress').textContent=`${p.index+1} / ${p.cardIds.length}`;$('presentation-previous').disabled=p.index===0;$('presentation-next').disabled=p.index>=p.cardIds.length-1;this.render(set);
 }
 render(set){
  const session=set.presentation,planFrame=session.frames?.[session.index];if(planFrame&&planFrame.layout!=='map')return this.renderPitch(set,planFrame);
  const current=set.cards.find(c=>c.id===session.cardIds[session.index]),container=$('presentation-content');if(!current)return false;
  this.cancel();const children=planFrame?planFrame.childIds.map(id=>set.cards.find(c=>c.id===id)).filter(Boolean):set.cards.filter(c=>c.parentId===current.id),parent=!planFrame&&!children.length&&current.parentId?set.cards.find(c=>c.id===current.parentId):current;
  const ids=new Set([parent.id,current.id]);if(planFrame){for(const c of children)ids.add(c.id);}else{for(const c of set.cards)if(c.parentId===parent.id||c.parentId===current.id)ids.add(c.id);}
  const rows=set.cards.filter(c=>ids.has(c.id)).map(c=>({...c,collapsed:false,submap:false,parentId:c.id===parent.id?null:c.parentId,position:null}));
  const layout=layoutMindmap(rows,{mindmap:{...set.map?.mindmap,enabled:true,motion:false,items:(set.map?.mindmap?.items||[]).filter(i=>i.cardIds.every(id=>ids.has(id))),showImages:session.showImages!==false},focusId:parent.id});layout.setId=set.id;
  const screen=$('presentation-screen');screen.classList.remove('mm-pitch-active');screen.classList.add('mm-presentation');screen.style.background=layout.config.paper;screen.style.color=layout.config.ink;
  const stage=document.createElement('section');stage.className='mm-presentation-slide';stage.innerHTML=`<header><span>思维导图 · ${E(set.title)}</span><h1>${E(current.title)}</h1></header><div class="mm-presentation-map"><div class="mm-presentation-canvas" style="width:${layout.width}px;height:${layout.height}px"><svg class="mm-presentation-links" width="${layout.width}" height="${layout.height}">${diagramPaths(layout,set.links)}${rows.length>300?overviewGlyphs(layout,ids,current.id).svg:''}</svg>${rows.filter(c=>layout.positions.has(c.id)&&(rows.length<=300||c.id===current.id)).map(c=>topicMarkup(c,layout.positions.get(c.id),layout.topics.get(c.id),set,base,icon('more'))).join('')}</div></div><footer>${session.showNotes&&current.note?`<p>${E(current.note)}</p>`:''}${ids.size>rows.length?`<small>本页展示 ${rows.length} / ${ids.size} 个主题；后续页面可逐一浏览。</small>`:''}${current.source||current.anchor||current.reference?'<button id="mm-presentation-source">回到原文</button>':''}</footer>`;
  container.replaceChildren(stage);paintEquations(stage);const frame=stage.querySelector('.mm-presentation-map'),world=stage.querySelector('.mm-presentation-canvas');const fit=()=>{if(!world.isConnected)return;const scale=Math.min(1.35,(frame.clientWidth-40)/layout.width,(frame.clientHeight-20)/layout.height);world.style.transform=`translate(${(frame.clientWidth-layout.width*scale)/2}px,${(frame.clientHeight-layout.height*scale)/2}px) scale(${scale})`;};
  this.resize?.disconnect();this.resize=new ResizeObserver(fit);this.resize.observe(frame);fit();
  stage.querySelector(`[data-card-id="${current.id}"]`)?.classList.add('selected');stage.querySelectorAll('.study-card-more,.study-card-collapse,.study-card-source,.mm-topic-details,.mm-resize-handle,.mm-equation-scale-handle').forEach(el=>el.remove());
  $('mm-presentation-source')?.addEventListener('click',run(async()=>{await this.study.change('study.presentation.action',{action:'stop'});return this.study.source(current);}));
  if(!this.media.matches&&document.body.dataset.uiMotion!=='reduced'){
   const direction=this.previousIndex===undefined||session.index>=this.previousIndex?1:-1;
   try{const a=stage.animate([{opacity:0,transform:`translateX(${direction*32}px) scale(.985)`},{opacity:1,transform:'translateX(0) scale(1)'}],{duration:300,easing:'cubic-bezier(.2,.6,.25,1)'});this.animations.push(a);a.finished.catch(()=>{});}catch{}
  }
  this.previousIndex=session.index;return true;
 }
 renderPitch(set,frame){
  this.cancel();const session=set.presentation,current=set.cards.find(c=>c.id===frame.cardId);if(!current)return false;
  const options={...set.map?.mindmap?.pitch,notes:session.showNotes!==false,images:session.showImages!==false},rendered=pitchSvg(set,frame,options,c=>c.imageAsset?new URL('data/'+c.imageAsset,base).href:null),scene=rendered.scene;
  const screen=$('presentation-screen');screen.classList.add('mm-presentation','mm-pitch-active');screen.style.background=scene.paper;screen.style.color=scene.ink;
  const stage=document.createElement('section');stage.className='mm-presentation-slide';const next=set.cards.find(c=>c.id===session.cardIds[session.index+1]);
  stage.innerHTML=`<header class="mm-pitch-accessible"><h1>${E(current.title)}</h1></header><div class="mm-pitch-frame">${rendered.svg}</div><footer><button id="mm-pitch-presenter" aria-pressed="${Boolean(this.presenterOpen)}">演讲者视图</button>${current.source||current.anchor||current.reference?'<button id="mm-presentation-source">回到原文</button>':''}</footer><aside class="mm-pitch-notes" ${this.presenterOpen?'':'hidden'}><small>本页</small><h2>${E(current.title)}</h2><pre>${E(current.note||current.editedText||current.text||'暂无笔记')}</pre>${current.mindmap?.equation?`<code>${E(current.mindmap.equation.latex)}</code>`:''}<small>下一页</small><h3>${E(next?.title||'演示结束')}</h3></aside>`;
  $('presentation-content').replaceChildren(stage);paintEquations(stage);this.resize?.disconnect();stage.classList.toggle('mm-presenter-open',Boolean(this.presenterOpen));
  $('mm-pitch-presenter').onclick=()=>{this.presenterOpen=!this.presenterOpen;stage.querySelector('.mm-pitch-notes').hidden=!this.presenterOpen;stage.classList.toggle('mm-presenter-open',this.presenterOpen);$('mm-pitch-presenter').setAttribute('aria-pressed',String(this.presenterOpen));};
  stage.querySelector('.mm-pitch-frame').onclick=run(async e=>{const id=e.target.closest('[data-pitch-card]')?.dataset.pitchCard,index=session.cardIds.indexOf(id);if(index>=0)await this.study.change('study.presentation.action',{action:'goto',index},set.revision);});
  $('mm-presentation-source')?.addEventListener('click',run(async()=>{await this.study.change('study.presentation.action',{action:'stop'});return this.study.source(current);}));
  if(!this.media.matches&&document.body.dataset.uiMotion!=='reduced'){const direction=this.previousIndex===undefined||session.index>=this.previousIndex?1:-1;const a=stage.querySelector('.mm-pitch-frame').animate([{opacity:0,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.2,.65,.25,1)'});this.animations.push(a);a.finished.catch(()=>{});}
  this.previousIndex=session.index;return true;
 }
 stop(){this.cancel();this.resize?.disconnect();$('presentation-screen').classList.remove('mm-presentation','mm-pitch-active');$('presentation-screen').style.background='';$('presentation-screen').style.color='';}
}
