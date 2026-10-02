import {bindingSettings,mapInkTarget,mapInkVisibility} from './ink-binding.mjs';
import {TransientInk} from './transient-ink.js';
import {inkGesture,geometrySettings,shapeNames} from './ink-gesture.js';
import {imageBounds,projectInk,imageInkContent} from './image-ink.js';
import {$,run,toast} from './dom.js';
import {strokeSvg} from './ink-shapes.mjs';
export class CardInk {
  constructor(study){
    this.study=study;this.mode='off';this.pending=null;this.busy=false;this.gesture=false;this.transient=new TransientInk(()=>this.render());
    const tools=document.createElement('span');tools.className='card-ink-tools';
    tools.innerHTML='<button id="card-ink-pen" aria-pressed="false">脑图笔</button><button id="card-ink-eraser" aria-pressed="false">擦除</button><button id="card-ink-lasso" aria-pressed="false">选笔迹</button><button id="card-ink-settings">笔刷</button><button id="card-ink-binding">随动 / 聚焦</button><button id="card-ink-all">管理笔迹</button><button id="card-ink-retry" hidden>重试笔画</button><button id="card-ink-discard" hidden>放弃笔画</button>';
    document.querySelector('.advanced-map-toolbar').append(tools);
    $('card-ink-pen').onclick=()=>this.modeSet(this.mode==='pen'?'off':'pen');$('card-ink-eraser').onclick=()=>this.modeSet(this.mode==='eraser'?'off':'eraser');$('card-ink-lasso').onclick=()=>this.modeSet(this.mode==='lasso'?'off':'lasso');
    $('card-ink-binding').onclick=()=>study.inkTools.binding();$('card-ink-settings').onclick=()=>study.inkTools.configure();$('card-ink-all').onclick=()=>study.inkTools.all(study.current.cards.find(c=>c.id===study.map.selected));
    $('card-ink-retry').onclick=run(()=>this.save(this.study.current.revision));$('card-ink-discard').onclick=()=>{this.pending=null;this.render();document.dispatchEvent(new Event('reader-interaction-finished'));};
    study.map.board.addEventListener('pointerdown',e=>this.start(e),true);
    $('reader-scroll').addEventListener('pointerdown',e=>{const note=e.target.closest('[data-note-card]');if(note&&note.tagName!=='BUTTON'&&study.ink.mode!=='off')this.start(e,note,study.ink.mode);},true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){this.cancelGesture?.();this.modeSet('off');}});
  }
  get dirty(){return this.busy||!!this.pending||this.gesture;}
  showToolbar(context='map'){this.study.inkTools.toolbar.show(context,{controller:this,root:()=>$('study-map-viewport'),mode:()=>this.mode,selectMode:mode=>this.modeSet(mode),drawing:()=>this.gesture});}
  modeSet(mode){this.mode=mode;if(mode==='off')this.transient.clear();this.study.map.board.classList.toggle('card-ink-active',mode!=='off');this.study.map.board.classList.toggle('card-ink-erasing',mode==='eraser');for(const value of ['pen','eraser','lasso'])$('card-ink-'+value).setAttribute('aria-pressed',mode===value);const bar=this.study.inkTools.toolbar;if(mode==='off')bar.hide(this);else if(bar.owner?.controller===this)bar.render();else this.showToolbar();}
  render(){
    const set=this.study.current;if(!set)return;const pending=this.pending?.setId===set.id?this.pending:null;$('card-ink-retry').disabled=Boolean(this.pending&&!pending);$('card-ink-retry').hidden=!this.pending||this.busy;$('card-ink-discard').hidden=!this.pending||this.busy;
    const cardsById=new Map(set.cards.map(c=>[c.id,c]));
    const visibility=(s,cardId,peek=true)=>mapInkVisibility(s,cardId,{focusId:set.map?.focusId,selectedCardId:peek?this.study.map.selected:null,hideFocusInk:bindingSettings(set.inkBinding).hideFocusInk}),visible=s=>!s.hidden&&set.layers.some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt);
    const temporary=this.transient.strokes.filter(s=>s.setId===set.id),canvasStrokes=[...(set.canvasInk||[]).filter(s=>visible(s)&&visibility(s,null)),...temporary.filter(s=>s.canvas)];if(pending?.canvas)canvasStrokes.push({...pending,id:'draft',...(pending.recognizedShape==='scribble'?{color:'red'}:{})});
    let overlay=$('study-map-world').querySelector('.map-ink-overlay');if(!overlay){overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('map-ink-overlay');$('study-map-world').append(overlay);}
    overlay.setAttribute('width',this.study.map.layout?.width||1000);overlay.setAttribute('height',this.study.map.layout?.height||1000);
    overlay.innerHTML=canvasStrokes.map(s=>{const svg=strokeSvg(s,{color:set.colors[s.color]||s.color,attribute:'data-canvas-stroke'});return s.clip?`<svg x="${s.clip.x}" y="${s.clip.y}" width="${s.clip.width}" height="${s.clip.height}" viewBox="${s.clip.x} ${s.clip.y} ${s.clip.width} ${s.clip.height}" overflow="hidden">${svg}</svg>`:svg;}).join('');
    for(const el of document.querySelectorAll('.study-card,section[data-note-card]')){
      const card=cardsById.get(el.dataset.cardId||el.dataset.noteCard),strokes=[...(card?.ink||[]).filter(s=>s.reviewSide!=='front'&&visible(s)&&(!el.matches('.study-card')||visibility(s,card.id))).map(s=>{const factor=el.matches('.study-card')?visibility(s,card.id):1;return factor===1?s:{...s,opacity:(s.opacity??(s.brush==='highlighter'?.35:1))*factor};}),...temporary.filter(s=>s.cardId===card?.id)];if(pending&&pending.cardId===card?.id)strokes.push({...pending,id:'draft',...(pending.recognizedShape==='scribble'?{imageBound:false,space:'card-relative',color:'red'}:{})});
      if(!card){el.querySelector('.card-ink-overlay')?.remove();continue;}
      if(!strokes.length&&!card.ink?.length){el.querySelector('.card-ink-overlay')?.remove();el.querySelector('.card-ink-badge')?.remove();el.classList.remove('has-bound-ink');continue;}
      el.classList.toggle('has-bound-ink',strokes.some(s=>s.space==='card-relative'));
      if(el.matches('.study-card')){let badge=el.querySelector('.card-ink-badge');const ink=(card.ink||[]).filter(s=>s.reviewSide!=='front');if(ink.length){if(!badge){badge=document.createElement('button');badge.className='card-ink-badge';badge.type='button';badge.textContent='✎';el.append(badge);}badge.setAttribute('aria-label','管理绑定笔迹：'+card.title);badge.title='绑定笔迹 · '+ink.length+' 笔';badge.classList.toggle('is-hidden',ink.some(s=>visibility(s,card.id,false)===0));badge.onclick=e=>{e.preventDefault();e.stopPropagation();this.study.inkTools.bound(card);};}else badge?.remove();}
      let svg=el.querySelector('.card-ink-overlay');if(!svg){svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('card-ink-overlay');el.append(svg);}
      const style=getComputedStyle(el),w=parseFloat(style.width),h=parseFloat(style.height),frame=imageBounds(el,card.image);svg.setAttribute('viewBox',`0 0 ${w} ${h}`);Object.assign(svg.style,{left:-parseFloat(style.borderLeftWidth)+'px',top:-parseFloat(style.borderTopWidth)+'px',right:'auto',bottom:'auto',width:w+'px',height:h+'px'});
      svg.innerHTML=strokes.filter(s=>!s.imageBound).map(s=>strokeSvg(s,{width:w,height:h,color:set.colors[s.color]||s.color,attribute:'data-card-stroke'})).join('')+(frame?`<svg x="${frame.x*w}" y="${frame.y*h}" width="${frame.width*w}" height="${frame.height*h}" viewBox="0 0 ${card.image.width} ${card.image.height}" overflow="hidden">${imageInkContent(card,strokes.filter(s=>s.imageBound),set.colors)}</svg>`:'');
    }
  }
  track(e,move,stop,cancel){
    const capture=this.study.map.board;capture.setPointerCapture(e.pointerId);this.gesture=true;
    const moved=ev=>{if(ev.pointerId===e.pointerId)move(ev);};
    const cleanup=()=>{document.removeEventListener('pointermove',moved);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',abort);if(capture.hasPointerCapture(e.pointerId))capture.releasePointerCapture(e.pointerId);this.gesture=false;this.cancelGesture=null;};
    const end=ev=>{if(ev.pointerId!==e.pointerId)return;cleanup();stop(ev);},abort=ev=>{if(ev.pointerId!==e.pointerId)return;cleanup();cancel();};this.cancelGesture=()=>{cleanup();cancel();};document.addEventListener('pointermove',moved);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',abort);
  }
  start(e,forcedElement,forcedMode){
    if(!forcedElement&&this.study.current?.map?.mindmap?.enabled&&this.study.map.window.overview&&(forcedMode||this.mode)!=='off'){toast('先点击主题放大，再编辑笔迹。');return;}
    const mode=forcedMode||this.mode,el=forcedElement||e.target.closest('.study-card');if(mode==='off'||(!el&&!e.target.closest('#study-map-viewport'))||e.button!==0||e.target.closest('button,[data-note-drag]'))return;
    e.preventDefault();e.stopImmediatePropagation();if(this.dirty||this.study.inkTools.toolbar.busy||this.study.inkTools.rulers.drag||this.study.inkTools.rulers.busy){toast('请先结束笔画或等待工具设置保存',true);return;}if(forcedElement)this.study.ink.showToolbar('card');else this.showToolbar('map');
    const set=this.study.current,cardId=el?.dataset.cardId||el?.dataset.noteCard,card=set.cards.find(c=>c.id===cardId),scope=el?'card':'canvas',box=(el||$('study-map-world')).getBoundingClientRect();
    if(forcedElement){const selector=el.dataset.noteCard?`section[data-note-card="${cardId}"]`:`.study-card[data-card-id="${cardId}"]`;this.study.inkTools.rulers.bind('card',()=>document.querySelector(selector),{drawing:()=>this.gesture,clip:()=>forcedElement?$('reader-scroll'):$('study-map-viewport')});}
    const frame=card&&!card.reference?imageBounds(el,card.image):null;
    const settings=this.study.inkTools.settings,point=ev=>el?[(ev.clientX-box.left)/box.width,(ev.clientY-box.top)/box.height]:[Math.max(0,(ev.clientX-box.left)/this.study.map.zoom),Math.max(0,(ev.clientY-box.top)/this.study.map.zoom)];
    if(!forcedElement&&mode==='pen')return this.startMap(e,el,set,settings);
    if(!forcedElement&&mode==='eraser')return this.eraseMap(e,set,settings);
    if(!forcedElement&&mode==='lasso'&&set.map?.focusId)return this.lassoFocus(e,set);
    if(mode==='lasso'){
      const points=[point(e)],svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add(el?'card-ink-overlay':'map-ink-overlay','ink-gesture');svg.setAttribute('width',el?'100%':this.study.map.layout.width);svg.setAttribute('height',el?'100%':this.study.map.layout.height);if(el){svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');}(el||$('study-map-world')).append(svg);
      const move=ev=>{if(points.length<2048)points.push(point(ev));svg.innerHTML=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width="${el?.002:2}"/>`;};
      this.track(e,move,ev=>{move(ev);svg.remove();const strokes=this.study.inkTools.selected(card?(card.ink||[]).filter(s=>s.reviewSide!=='front'&&(!s.imageBound||frame)&&(forcedElement||mapInkVisibility(s,card.id,{focusId:set.map?.focusId,hideFocusInk:set.inkBinding?.hideFocusInk})===1)).map(s=>s.imageBound?projectInk(s,frame):s):set.canvasInk||[],points);this.study.inkTools.adjust(scope,strokes,{cardId,imageBounds:frame,aspectRatio:el?box.height/box.width:1});},()=>svg.remove());return;
    }
    if(mode==='eraser'){
      const points=[point(e)],cursor=this.study.inkTools.eraserCursor(e,10),controller=forcedMode?this.study.ink:this;
      this.track(e,ev=>{cursor.move(ev);if(points.length<255)points.push(point(ev));},ev=>{points.push(point(ev));cursor.remove();run(async()=>{this.busy=true;try{await this.study.inkTools.erase(scope,points,{cardId,imageBounds:frame,radius:el?10/box.width:10/this.study.map.zoom,aspectRatio:el?box.height/box.width:1,revision:set.revision,mode:settings.eraser});if(settings.eraserAutoCancel&&this.study.current?.id===set.id&&controller.mode==='eraser'){if(forcedMode)controller.setMode('pen');else controller.modeSet('pen');}}finally{this.busy=false;}})();},()=>cursor.remove());return;
    }
    const layer=set.layers.find(l=>l.id===set.activeLayer);if(layer?.locked||layer?.visible===false){toast('请选择可见且未锁定的图层',true);return;}
    const inkPoint=ev=>[...point(ev),...(cardId&&settings.pressure&&ev.pointerType==='pen'?[ev.pressure]:[])],laser=settings.brush==='laser',temporary=laser||settings.vanish,raw=[inkPoint(e)],start=point(e),attach=Boolean(frame&&start[0]>=frame.x&&start[0]<=frame.x+frame.width&&start[1]>=frame.y&&start[1]<=frame.y+frame.height);
    const pending={setId:set.id,...(cardId?{cardId}:{canvas:true}),points:raw,color:laser?'red':settings.color,width:cardId?settings.cardWidth:settings.canvasWidth,layerId:set.activeLayer||'default',brush:laser?'pen':settings.brush,opacity:laser?1:settings.opacity,...(frame?{imageBounds:frame,imageBound:attach,aspectRatio:box.width/box.height}:{})};
    if(temporary){this.transient.touch(pending);}else this.pending=pending;
    const rulerContext=el?'card':'map',ruler=this.study.inkTools.rulers.guide(rulerContext,{point:(x,y)=>el?[(x-box.left)/box.width,(y-box.top)/box.height]:[(x-box.left)/this.study.map.zoom,(y-box.top)/this.study.map.zoom],scale:el?1/box.width:1/this.study.map.zoom,...(el?{clip:box}:{})});
    let attempted=false;const hint=$('study-map-hint').textContent;
    const makeGesture=()=>inkGesture(raw,geometrySettings(settings,el?box.height/box.width:1,{...(ruler?{ruler}:{}),eraseRadius:el?10/box.width:10/this.study.map.zoom,scribbleScope:forcedMode?'scope':'map'}),el?1/box.width:1/this.study.map.zoom,(result,points,geometry)=>{
      if(this.study.current?.id!==set.id||(temporary?!this.transient.has(pending):this.pending!==pending))return;
      pending.points=result.points;pending.rawPoints=points;pending.geometry=geometry;pending.recognizedShape=result.kind;
      if(geometry.heldMs&&result.kind!=='free')$('study-map-hint').textContent=shapeNames[result.kind]+(temporary?' · 临时笔迹':' · 松开保存');this.render();
      if(result.kind==='scribble'&&!attempted&&!temporary){attempted=true;gesture.cancel();$('study-map-hint').textContent='正在涂抹删除…';run(async()=>{const saved=await this.save(set.revision);if(saved)$('study-map-hint').textContent=`已删除 ${saved.lastInk.erased} 笔 · 可撤销`;})();}
    });let gesture=makeGesture();
    const move=ev=>{
      this.study.inkTools.rulers.measure(rulerContext,ev.clientX,ev.clientY);
      const reset=temporary&&!this.transient.has(pending);if(reset){raw.length=0;gesture.cancel();}
      const previous=raw.at(-1),samples=ev.getCoalescedEvents?.();for(const sample of samples?.length?samples:[ev])if(raw.length<2048)raw.push(inkPoint(sample));
      if(temporary&&(!previous||raw.at(-1).some((v,i)=>i<2&&v!==previous[i])))this.transient.touch(pending);
      if(reset)gesture=makeGesture();gesture.move();
    };
    this.track(e,move,ev=>{if(!attempted){if(!temporary||this.transient.has(pending)){move(ev);gesture.finish();}else gesture.cancel();}$('study-map-hint').textContent=hint;if(!attempted&&!temporary)run(()=>this.save(set.revision))();},()=>{gesture.cancel();$('study-map-hint').textContent=hint;if(temporary)this.transient.remove(pending);else this.pending=null;this.render();});
  }
  startMap(e,hit,set,settings){
    const layer=set.layers.find(l=>l.id===set.activeLayer);if(layer?.locked||layer?.visible===false){toast('请选择可见且未锁定的图层',true);return;}
    this.lastPointerType=e.pointerType;const world=$('study-map-world').getBoundingClientRect(),zoom=this.study.map.zoom,selectedCardId=this.study.map.selected||undefined,hitCardId=hit?.dataset.cardId,binding=bindingSettings(set.inkBinding),target=mapInkTarget({focusId:set.map?.focusId,selectedCardId,hitCardId,settings:binding});
    const point=ev=>[Math.max(0,(ev.clientX-world.left)/zoom),Math.max(0,(ev.clientY-world.top)/zoom),...(settings.pressure&&ev.pointerType==='pen'?[ev.pressure]:[])],raw=[point(e)],laser=settings.brush==='laser',temporary=laser||settings.vanish;
    const pending={setId:set.id,mapGesture:true,canvas:true,selectedCardId,points:raw,color:laser?'red':settings.color,width:settings.canvasWidth,layerId:set.activeLayer||'default',brush:laser?'pen':settings.brush,opacity:laser?1:settings.opacity};
    if(target.cardId&&target.binding==='automatic'){const card=set.cards.find(c=>c.id===target.cardId),el=document.querySelector(`.study-card[data-card-id="${target.cardId}"]`),frame=el&&card.image&&!card.reference?imageBounds(el,card.image):null;if(frame){const box=el.getBoundingClientRect(),x=(e.clientX-box.x)/box.width,y=(e.clientY-box.y)/box.height;if(x>=frame.x&&x<=frame.x+frame.width&&y>=frame.y&&y<=frame.y+frame.height)pending.clip={x:(box.x-world.x+frame.x*box.width)/zoom,y:(box.y-world.y+frame.y*box.height)/zoom,width:frame.width*box.width/zoom,height:frame.height*box.height/zoom};}}
    if(temporary)this.transient.touch(pending);else this.pending=pending;if(target.selectedCardId)this.study.map.select(target.selectedCardId);
    const ruler=this.study.inkTools.rulers.guide('map',{point:(x,y)=>[(x-world.left)/zoom,(y-world.top)/zoom],scale:1/zoom});let attempted=false;const hint=$('study-map-hint').textContent;
    const make=()=>inkGesture(raw,geometrySettings(settings,1,{...(ruler?{ruler}:{}),eraseRadius:10/zoom,scribbleScope:'map'}),1/zoom,(result,points,geometry)=>{if(this.study.current?.id!==set.id||(temporary?!this.transient.has(pending):this.pending!==pending))return;pending.points=result.points;pending.rawPoints=points;pending.geometry=geometry;pending.recognizedShape=result.kind;if(geometry.heldMs&&result.kind!=='free')$('study-map-hint').textContent=shapeNames[result.kind]+(temporary?' · 临时笔迹':' · 松开保存');this.render();if(result.kind==='scribble'&&!temporary&&!attempted){attempted=true;gesture.cancel();$('study-map-hint').textContent='正在涂抹删除…';run(async()=>{const saved=await this.save(set.revision);if(saved)$('study-map-hint').textContent=`已删除 ${saved.lastInk.erased} 笔 · 可撤销`;})();}});let gesture=make();
    const move=ev=>{this.study.inkTools.rulers.measure('map',ev.clientX,ev.clientY);const reset=temporary&&!this.transient.has(pending);if(reset){raw.length=0;gesture.cancel();}const previous=raw.at(-1),samples=ev.getCoalescedEvents?.();for(const p of samples?.length?samples:[ev])if(raw.length<2048)raw.push(point(p));if(temporary&&(!previous||raw.at(-1).some((v,i)=>i<2&&v!==previous[i])))this.transient.touch(pending);if(reset)gesture=make();gesture.move();};
    this.track(e,move,ev=>{const tap=e.pointerType!=='pen'&&(binding.doubleTapFocus&&hitCardId||!hitCardId&&set.map?.focusId)&&raw.every(p=>Math.hypot(p[0]-raw[0][0],p[1]-raw[0][1])*zoom<4);if(tap&&!attempted){gesture.cancel();if(temporary)this.transient.remove(pending);else this.pending=null;this.study.map.select(hitCardId||set.map.focusId);this.render();return;}if(!attempted){if(!temporary||this.transient.has(pending)){move(ev);gesture.finish();}else gesture.cancel();}if(!attempted)$('study-map-hint').textContent=hint;if(!temporary&&!attempted)run(()=>this.save(set.revision))();},()=>{gesture.cancel();$('study-map-hint').textContent=hint;if(temporary)this.transient.remove(pending);else this.pending=null;this.render();});
  }
  eraseMap(e,set,settings){
    const world=$('study-map-world').getBoundingClientRect(),zoom=this.study.map.zoom,point=ev=>[(ev.clientX-world.left)/zoom,(ev.clientY-world.top)/zoom],points=[point(e)],cursor=this.study.inkTools.eraserCursor(e,10);
    this.track(e,ev=>{cursor.move(ev);if(points.length<255)points.push(point(ev));},ev=>{points.push(point(ev));cursor.remove();run(async()=>{this.busy=true;try{await this.study.inkTools.erase('map',points,{radius:10/zoom,revision:set.revision,mode:settings.eraser});if(settings.eraserAutoCancel&&this.study.current?.id===set.id&&this.mode==='eraser')this.modeSet('pen');}finally{this.busy=false;}})();},()=>cursor.remove());
  }
  lassoFocus(e,set){
    const card=set.cards.find(c=>c.id===set.map.focusId),el=document.querySelector(`.study-card[data-card-id="${card.id}"]`),box=el.getBoundingClientRect(),point=ev=>[(ev.clientX-box.left)/box.width,(ev.clientY-box.top)/box.height],points=[point(e)],frame=imageBounds(el,card.image),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('card-ink-overlay','ink-gesture');svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');el.append(svg);
    const move=ev=>{if(points.length<2048)points.push(point(ev));svg.innerHTML=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width=".002"/>`;};this.track(e,move,ev=>{move(ev);svg.remove();const ink=(card.ink||[]).filter(s=>mapInkVisibility(s,card.id,{focusId:card.id,hideFocusInk:set.inkBinding?.hideFocusInk})===1&&(!s.imageBound||frame)).map(s=>s.imageBound?projectInk(s,frame):s);this.study.inkTools.adjust('card',this.study.inkTools.selected(ink,points),{cardId:card.id,imageBounds:frame,aspectRatio:box.height/box.width});},()=>svg.remove());
  }
  async save(revision){if(!this.pending||this.busy)return;if(this.pending.setId!==this.study.current?.id)throw Error('笔画属于另一学习集，请回到原学习集后重试。');this.busy=true;try{const {setId,canvas,mapGesture,clip,rawPoints,recognizedShape,...params}=this.pending;params.points=rawPoints||params.points;const result=await this.study.change(mapGesture?'study.map.ink.add':canvas?'study.canvas.ink.add':'study.card.ink.add',params,revision);this.pending=null;if(mapGesture&&result.lastInk?.selectedCardId)this.study.map.select(result.lastInk.selectedCardId);return result;}finally{this.busy=false;this.render();document.dispatchEvent(new Event('reader-interaction-finished'));}}
}
