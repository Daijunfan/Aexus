import {TransientInk} from './transient-ink.js';
import {inkGesture,geometrySettings,shapeNames} from './ink-gesture.js';
import {$,escape,run,toast,describeError,showDialog,field} from './dom.js';
import {strokeSvg} from './ink-shapes.mjs';
import {pagePoint,strokeSlices,displayY} from './page-slices.mjs';
const clamp=n=>Math.max(0,Math.min(1,n));
export class StudyInk {
  constructor(study){
    this.study=study;this.mode='off';this.busy=false;this.draft=null;this.transient=new TransientInk(()=>this.render());
    const bar=document.createElement('div');bar.id='study-ink-tools';bar.hidden=true;
    bar.innerHTML=`<button id="study-pen" aria-pressed="false">✎ 手写</button><button id="study-lasso" aria-pressed="false">套索</button><select id="study-ink-layer" aria-label="当前手写图层"></select><button id="study-layers">图层</button><button id="study-eraser" aria-pressed="false">橡皮擦</button><button id="study-ink-settings">笔刷 / 尺子</button><select id="study-ink-color" aria-label="手写颜色">${study.colors.map(([v,t])=>`<option value="${v}" ${v==='blue'?'selected':''}>${t}</option>`).join('')}</select><select id="study-ink-width" aria-label="笔画粗细"><option value="0.002">细</option><option value="0.004" selected>中</option><option value="0.008">粗</option></select><span id="study-ink-status" role="status"></span><button id="study-ink-retry" hidden>重试保存</button><button id="study-ink-discard" hidden>放弃笔画</button>`;
    $('study-reading-bar').after(bar);
    $('study-lasso').onclick=()=>this.setMode(this.mode==='lasso'?'off':'lasso');$('study-layers').onclick=()=>this.manageLayers();
    $('study-ink-layer').onchange=run(()=>study.change('study.layer.update',{layerId:$('study-ink-layer').value,active:true}));
    $('study-ink-settings').onclick=()=>study.inkTools.configure();
    $('study-ink-color').onchange=run(()=>study.change('study.ink.settings',{color:$('study-ink-color').value}));
    $('study-ink-width').onchange=run(()=>study.change('study.ink.settings',{width:Number($('study-ink-width').value)}));
    $('study-pen').onclick=()=>this.setMode(this.mode==='pen'?'off':'pen');$('study-eraser').onclick=()=>this.setMode(this.mode==='eraser'?'off':'eraser');
    $('study-ink-retry').onclick=run(()=>this.save(this.study.current.revision));$('study-ink-discard').onclick=()=>{this.draft=null;this.status('');this.render();document.dispatchEvent(new Event('reader-interaction-finished'));};
    $('reader-scroll').addEventListener('pointerdown',e=>this.start(e),true);
    this.observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('.pdf-page,.pdf-pages')||n.querySelector('.pdf-page')))))this.render();});
    this.observer.observe($('reading-surface'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-render-state']});
    this.resize=new ResizeObserver(()=>this.render());this.resize.observe($('reader-scroll'));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){this.cancelGesture?.();this.setMode('off');}});
  }
  get dirty(){return Boolean(this.draft)||this.busy||this.gesture;}
  status(message){$('study-ink-status').textContent=message;$('study-ink-retry').hidden=!this.draft||this.busy;$('study-ink-discard').hidden=!this.draft||this.busy;}
  showToolbar(context='document'){if(context==='document')this.study.inkTools.rulers.bind(context,()=>$('reader-scroll'),{drawing:()=>this.gesture});this.study.inkTools.toolbar.show(context,{controller:this,root:()=>$('reader-scroll'),mode:()=>this.mode,selectMode:mode=>this.setMode(mode),drawing:()=>this.gesture});}
  setMode(mode){this.mode=mode;if(mode==='off')this.transient.clear();if(mode!=='off')this.study.excerpts.setRegion(false);for(const [id,value] of [['study-lasso','lasso'],['study-pen','pen'],['study-eraser','eraser']])$(id).setAttribute('aria-pressed',mode===value);$('reader-scroll').classList.toggle('study-ink-mode',mode!=='off');$('reader-scroll').classList.toggle('study-erase-mode',mode==='eraser');const bar=this.study.inkTools.toolbar;if(mode==='off')bar.hide(this);else if(bar.owner?.controller===this)bar.render();else this.showToolbar();}
  render(){
    const set=this.study.current,doc=this.study.getDocument(),active=set&&doc?.kind==='pdf'&&set.documentIds.includes(doc.id);$('study-ink-tools').hidden=!active;
    if(!active){this.setMode('off');return;}
    $('study-ink-layer').innerHTML=set.layers.filter(l=>!l.deletedAt).map(l=>`<option value="${l.id}" ${l.locked||!l.visible?'disabled':''}>${escape(l.title)}${l.locked?' · 锁定':''}</option>`).join('');$('study-ink-layer').value=set.activeLayer||'default';
    if(set.inkSettings?.color){const select=$('study-ink-color'),color=set.inkSettings.color;if(![...select.options].some(o=>o.value===color))select.add(new Option(color,color));select.value=color;}
    if(set.inkSettings?.width){const select=$('study-ink-width'),value=String(set.inkSettings.width);if(![...select.options].some(o=>o.value===value))select.add(new Option((set.inkSettings.width*100).toFixed(2)+'%',value));select.value=value;}
    const visible=new Set(set.layers.filter(l=>l.visible&&!l.deletedAt).map(l=>l.id));
    for(const page of $('reading-surface').querySelectorAll('.pdf-page[data-render-state=ready]')){
      const width=page.clientWidth,height=page.pageSlices?.sourceHeight||page.clientHeight,number=Number(page.dataset.page);if(!width||!height)continue;
      const strokes=(set.ink||[]).filter(s=>s.documentId===doc.id&&s.page===number&&!s.sourceChanged&&!s.hidden&&s.notebookVisible!==false&&visible.has(s.layerId||'default'));
      strokes.push(...this.transient.strokes.filter(d=>d.setId===set.id&&d.params.documentId===doc.id&&d.params.page===number).flatMap(d=>(d.previewPaths||[d.params.points]).map((points,i)=>({...d.params,points,id:d.previewPaths?d.id+'-'+i:d.id,fading:d.fading}))));
      const pending=this.draft?.params;if(pending?.documentId===doc.id&&pending.page===number)strokes.push(...(this.draft.previewPaths||[pending.points]).map((points,i)=>({...pending,points,id:this.draft.previewPaths?'draft-'+i:'draft',...(this.draft.recognizedShape==='scribble'?{color:'red'}:{})})));
      let layer=page.querySelector('.study-ink-layer:not(.ink-gesture)');const key=JSON.stringify([width,height,strokes]);if(layer?.dataset.key===key)continue;
      if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('study-ink-layer');page.append(layer);}
      layer.dataset.key=key;layer.setAttribute('viewBox',`0 0 ${width} ${page.clientHeight}`);
      layer.innerHTML=strokeSlices(page,strokes.map(s=>strokeSvg(s,{width,height,color:set.colors[s.color]||s.color})).join(''));
    }
  }
  point(page,event){
    // Reader refreshes may replace the page node while a captured gesture is active.
    const current=$('reading-surface').querySelector(`.pdf-page[data-page="${page.dataset.page}"]`)||page;
    return pagePoint(current,event.clientX,event.clientY);
  }
  track(e,page,move,stop,cancel){
    const capture=$('reader-scroll');capture.setPointerCapture(e.pointerId);this.gesture=true;
    const moved=event=>{if(event.pointerId===e.pointerId)move(event);};
    const cleanup=()=>{document.removeEventListener('pointermove',moved);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',abort);if(capture.hasPointerCapture(e.pointerId))capture.releasePointerCapture(e.pointerId);this.gesture=false;this.cancelGesture=null;};
    const end=event=>{if(event.pointerId!==e.pointerId)return;cleanup();stop(event);},abort=event=>{if(event.pointerId!==e.pointerId)return;cleanup();cancel();};this.cancelGesture=()=>{cleanup();cancel();};
    document.addEventListener('pointermove',moved);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',abort);
  }
  start(e){
    if(e.target.closest('section[data-note-card],button,[data-note-drag]'))return;
    const page=e.target.closest('.pdf-page'),set=this.study.current,doc=this.study.getDocument();
    if(this.mode==='off'||!page||!set||doc?.kind!=='pdf'||e.button!==0)return;if(page.dataset.renderState!=='ready'){toast('当前页正在加载，完成后即可书写。');return;}
    e.preventDefault();e.stopImmediatePropagation();if(this.dirty||this.study.inkTools.toolbar.busy||this.study.inkTools.rulers.drag||this.study.inkTools.rulers.busy){toast('请先结束笔画或等待工具设置保存。',true);return;}this.showToolbar();
    const prefs=this.study.inkTools.settings;
    if(this.mode==='lasso')return this.lasso(e,page,set,doc);
    if(this.mode==='eraser')return this.erase(e,page,set,doc);
    const activeLayer=set.layers.find(l=>l.id===set.activeLayer);if(activeLayer?.locked||activeLayer?.visible===false){toast('请选择可见且未锁定的图层',true);return;}
    const box=page.getBoundingClientRect(),point=event=>[...this.point(page,event),prefs.pressure&&event.pointerType==='pen'?Math.max(.05,event.pressure):1];
    const raw=[point(e)],laser=prefs.brush==='laser',temporary=laser||prefs.vanish;
    const params={layerId:set.activeLayer||'default',documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:Number(page.dataset.page),points:raw,brush:laser?'pen':prefs.brush,opacity:laser?1:prefs.opacity,color:laser?'red':$('study-ink-color').value,width:Number($('study-ink-width').value)};
    const ruler=this.study.inkTools.rulers.guide('document',{page,scale:1/box.width});
    const draft={setId:set.id,params,revision:set.revision};if(temporary)this.transient.touch(draft);else this.draft=draft;this.status(temporary?'临时指示 · 停笔一秒消失':'正在书写…');
    let attempted=false;const makeGesture=()=>inkGesture(raw,geometrySettings(prefs,(page.pageSlices?.sourceHeight||box.height)/box.width,{eraseRadius:12/box.width,...(ruler?{ruler}:{}),...(page.pageSlices?{bands:page.pageSlices.blocks.filter(b=>b.type==='source').map(b=>({start:b.start,end:b.end}))}:{})}),1/box.width,(result,points,geometry)=>{
      if(this.study.current?.id!==set.id||(temporary?!this.transient.has(draft):this.draft!==draft))return;
      params.points=result.points;params.geometry=geometry;draft.rawPoints=points;draft.previewPaths=result.paths;draft.recognizedShape=result.kind;
      if(geometry.heldMs&&result.kind!=='free')this.status(shapeNames[result.kind]+(temporary?' · 临时笔迹':' · 松开保存'));this.render();
      if(result.kind==='scribble'&&!attempted&&!temporary){attempted=true;gesture.cancel();this.status('正在涂抹删除…');run(()=>this.save(set.revision))();}
    });let gesture=makeGesture();
    const move=event=>{
      this.study.inkTools.rulers.measure('document',event.clientX,event.clientY);
      const reset=temporary&&!this.transient.has(draft);if(reset){raw.length=0;gesture.cancel();}
      const previous=raw.at(-1),samples=event.getCoalescedEvents?.();for(const sample of samples?.length?samples:[event])if(raw.length<2048)raw.push(point(sample));
      if(temporary&&(!previous||raw.at(-1).some((v,i)=>i<2&&v!==previous[i])))this.transient.touch(draft);
      if(reset)gesture=makeGesture();gesture.move();
    };
    this.track(e,page,move,event=>{if(!attempted){if(!temporary||this.transient.has(draft)){move(event);gesture.finish();}else gesture.cancel();}if(!attempted&&!temporary)run(()=>this.save(set.revision))();},()=>{gesture.cancel();if(temporary)this.transient.remove(draft);else this.draft=null;this.status('笔画已取消');this.render();});
  }
  erase(e,page,set,doc){
    const prefs=this.study.inkTools.settings,box=page.getBoundingClientRect(),point=ev=>this.point(page,ev),points=[point(e)],cursor=this.study.inkTools.eraserCursor(e,12),bands=page.pageSlices?.blocks.filter(b=>b.type==='source').map(b=>({start:b.start,end:b.end}));this.status(prefs.eraser==='stroke'?'整笔擦除…':'局部擦除…');
    this.track(e,page,ev=>{cursor.move(ev);if(points.length<255)points.push(point(ev));},ev=>{points.push(point(ev));cursor.remove();run(async()=>{this.busy=true;try{await this.study.inkTools.erase('document',points,{documentId:doc.id,page:Number(page.dataset.page),radius:12/box.width,aspectRatio:(page.pageSlices?.sourceHeight||box.height)/box.width,revision:set.revision,mode:prefs.eraser,bands});this.status('擦除已保存，可撤销');if(prefs.eraserAutoCancel&&this.study.current?.id===set.id&&this.study.getDocument()?.id===doc.id&&this.mode==='eraser')this.setMode('pen');}finally{this.busy=false;}})();},()=>{cursor.remove();this.status('已取消擦除');});
  }
  lasso(e,page,set,doc){
    const box=page.getBoundingClientRect(),point=ev=>this.point(page,ev),points=[point(e)];
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('study-ink-layer','ink-gesture');svg.style.zIndex='9';svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');page.append(svg);
    const move=ev=>{if(points.length<2048)points.push(point(ev));svg.innerHTML=`<polygon points="${points.map(p=>[p[0],page.pageSlices?displayY(page.pageSlices,p[1])/box.height:p[1]].join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width=".002"/>`;};
    this.track(e,page,move,ev=>{move(ev);svg.remove();const selected=this.study.inkTools.selected((set.ink||[]).filter(s=>s.documentId===doc.id&&s.page===Number(page.dataset.page)&&!s.sourceChanged),points);this.study.inkTools.adjust('document',selected,{aspectRatio:(page.pageSlices?.sourceHeight||box.height)/box.width});},()=>svg.remove());
  }
  manageLayers(){
    const set=this.study.current;
    showDialog({title:'手写图层',html:set.layers.filter(l=>!l.deletedAt).map(l=>`<div class="layer-row ${l.id===set.activeLayer?'active':''}"><strong>${escape(l.title)}</strong><button type="button" data-layer="${l.id}" data-action="visible">${l.visible?'隐藏':'显示'}</button><button type="button" data-layer="${l.id}" data-action="locked">${l.locked?'解锁':'锁定'}</button><button type="button" data-layer="${l.id}" data-action="edit">编辑</button></div>`).join('')+field('title','新图层名称',''),submit:'新建图层',onSubmit:v=>this.study.change('study.layer.create',{title:v.title},set.revision),afterOpen:()=>{
      $('dialog-fields').querySelectorAll('[data-layer]').forEach(b=>b.onclick=run(async()=>{const l=set.layers.find(l=>l.id===b.dataset.layer),action=b.dataset.action;
        if(action==='edit'){$('dialog-cancel').click();showDialog({title:'编辑图层',html:field('title','名称',l.title)+field('merge','合并到','',{choices:[['','不合并'],...set.layers.filter(t=>t.id!==l.id&&!t.deletedAt&&!t.locked).map(t=>[t.id,t.title])]})+field('remove','删除此图层','no',{choices:[['no','保留'],['yes','删除（可撤销）']]}),onSubmit:v=>v.remove==='yes'?this.study.change('study.layer.remove',{layerId:l.id},set.revision):v.merge?this.study.change('study.layer.merge',{layerId:l.id,targetId:v.merge},set.revision):this.study.change('study.layer.update',{layerId:l.id,title:v.title},set.revision)});}
        else{await this.study.change('study.layer.update',{layerId:l.id,[action]:!l[action]},set.revision);$('dialog-cancel').click();this.manageLayers();}
      }));
    }});
  }
  async save(revision){
    const draft=this.draft;if(!draft||this.busy||draft.setId!==this.study.current?.id)return;this.busy=true;this.status('正在保存…');
    try{const result=await this.study.change('study.ink.add',{...draft.params,points:draft.rawPoints||draft.params.points},revision);this.draft=null;this.status(result.lastInk?.recognizedShape==='scribble'?`已删除 ${result.lastInk.erased} 笔，可撤销`:'已保存');}catch(e){this.status(describeError(e));}finally{this.busy=false;this.status($('study-ink-status').textContent);this.render();document.dispatchEvent(new Event('reader-interaction-finished'));}
  }
}
