import { $, escape, run, toast, describeError } from './dom.js';
import { api } from './transport.js';
function selectedRange(shadow) {
  const selection=shadow?.getSelection?.() || window.getSelection();
  if(!selection || selection.isCollapsed)return null;
  let range;
  if(shadow && window.getSelection()?.getComposedRanges) {
    const composed=window.getSelection().getComposedRanges({shadowRoots:[shadow]})[0];
    if(composed){range=document.createRange();range.setStart(composed.startContainer,composed.startOffset);range.setEnd(composed.endContainer,composed.endOffset);}
  }
  range ||= selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  return range&&!range.collapsed?range:null;
}
function textRange(root,start,end) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node,at=0,first,last;
  while((node=walker.nextNode())){const next=at+node.length;if(!first&&start<next)first=[node,start-at];if(end<=next&&end>at){last=[node,end-at];break;}at=next;}
  if(!first||!last)return null;const range=document.createRange();range.setStart(...first);range.setEnd(...last);return range;
}
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export class StudyExcerpts {
  constructor(study) {
    this.study=study;this.draft=null;this.busy=false;this.region=false;
    const lasso=document.createElement('button');lasso.id='study-excerpt-lasso';lasso.textContent='套索摘录';lasso.onclick=()=>{this.study.ink.setMode('off');this.setRegion(this.region==='lasso'?false:'lasso');};$('study-region').after(lasso);
    const palette=document.createElement('div');palette.id='study-palette';palette.hidden=true;palette.setAttribute('role','dialog');palette.setAttribute('aria-label','选择标注颜色并保存摘录');
    palette.innerHTML=`<div class="study-palette-heading"><span>保存为摘录卡片</span><button id="study-palette-close" aria-label="取消摘录">×</button></div><div class="study-swatches">${study.colors.map(([color,label])=>`<button data-color="${color}" aria-label="标注${label}并保存" title="${label}" style="background:${study.hex[color]}"></button>`).join('')}</div><p id="study-capture-status" role="status"></p>`;
    document.body.append(palette);this.palette=palette;
    palette.addEventListener('pointerdown',e=>e.preventDefault());$('study-palette-close').onclick=()=>this.hide();palette.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>this.save(b.dataset.color));
    $('reader-scroll').addEventListener('pointerup',()=>setTimeout(()=>{if(!this.regionDrag&&!this.region)this.readSelection();},0));
    $('reader-scroll').addEventListener('keyup',()=>this.readSelection());
    document.addEventListener('pointerdown',e=>{if(!this.busy&&!e.composedPath().some(n=>n===palette||n===$('reader-scroll')))this.hide();});
    $('reader-scroll').addEventListener('scroll',()=>{if(!this.busy)this.hide();},{passive:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.busy){this.hide();this.setRegion(false);}});
    this.observer=new MutationObserver(records=>{if(records.some(m=>!m.target.closest?.('.study-highlight-layer')&&![...m.addedNodes,...m.removedNodes].every(n=>n.nodeType===1&&n.classList.contains('study-highlight-layer'))))this.scheduleMarks();});
    this.observer.observe($('reading-surface'),{subtree:true,childList:true,attributes:true,attributeFilter:['data-render-state']});
    new ResizeObserver(()=>this.scheduleMarks()).observe($('reader-scroll'));
    $('reader-scroll').addEventListener('pointerdown',e=>this.regionStart(e));
  }
  active(){const set=this.study.current,doc=this.study.getDocument();return set&&doc&&set.documentIds.includes(doc.id)?{set,doc}:null;}
  hide(){if(this.busy)return;this.palette.hidden=true;this.draft=null;document.querySelector('.study-region-draft')?.remove();}
  setRegion(on){this.region=on;this.hide();$('reader-scroll').classList.toggle('study-region-mode',on);$('study-region').setAttribute('aria-pressed',on);}
  readSelection(){
    const active=this.active();if(!active||this.busy||this.palette.contains(document.activeElement))return;
    const {set,doc}=active,shadow=this.study.getRenderer().shadow,range=selectedRange(shadow);if(!range)return;
    const root=doc.kind==='pdf'?$('reading-surface'):shadow?.querySelector('article');
    if(!root?.contains(range.startContainer)||!root.contains(range.endContainer))return;
    const text=range.toString().trim();if(!text)return;
    let locator,selection;
    if(doc.kind==='pdf'){
      const start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
      if(!start.closest('.textLayer'))return;
      const rects=[];
      for(const layer of root.querySelectorAll('.textLayer')){
        const page=layer.closest('.pdf-page'),box=page.getBoundingClientRect(),number=Number(page.dataset.page),walker=document.createTreeWalker(layer,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){
          if(!range.intersectsNode(node))continue;
          const part=document.createRange();part.selectNodeContents(node);
          if(node===range.startContainer)part.setStart(node,range.startOffset);if(node===range.endContainer)part.setEnd(node,range.endOffset);
          if(!part.toString())continue;
          for(const r of part.getClientRects())if(r.width>0&&r.height>0){const x=clamp((r.left-box.left)/box.width,0,1),y=clamp((r.top-box.top)/box.height,0,1),right=clamp((r.right-box.left)/box.width,0,1),bottom=clamp((r.bottom-box.top)/box.height,0,1);if(right>x&&bottom>y)rects.push({page:number,x,y,width:right-x,height:bottom-y});}
        }
      }
      const merged=[];rects.sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x);
      for(const r of rects){const last=merged.at(-1);if(last&&last.page===r.page&&Math.abs(last.y-r.y)<.002&&Math.abs(last.height-r.height)<.003&&r.x<=last.x+last.width+.02){const right=Math.max(last.x+last.width,r.x+r.width);last.x=Math.min(last.x,r.x);last.width=right-last.x;last.height=Math.max(last.height,r.y+r.height-last.y);}else merged.push({...r});}
      if(!merged.length)return;locator={page:merged[0].page,pageOffset:merged[0].y};selection={rects:merged};
    }else{
      const prefix=document.createRange();prefix.selectNodeContents(root);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length;
      prefix.setEnd(range.endContainer,range.endOffset);const end=prefix.toString().length;
      const element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,anchor=element.closest('[id]');
      locator={section:doc.position.section,...(anchor&&root.contains(anchor)?{anchor:anchor.id}:{})};selection={start,end};
    }
    this.show({setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:crypto.randomUUID(),text,locator,selection},range.getBoundingClientRect());
  }
  show(draft,box){
    this.draft=draft;this.palette.hidden=false;$('study-capture-status').textContent='';
    this.palette.style.left=`${clamp(box.left+box.width/2-132,8,innerWidth-280)}px`;
    this.palette.style.top=`${clamp(box.bottom+9,8,innerHeight-125)}px`;
    this.palette.querySelectorAll('button').forEach(b=>b.disabled=false);
  }
  async save(color){
    if(!this.draft||this.busy)return;this.busy=true;this.palette.querySelectorAll('button').forEach(b=>b.disabled=true);$('study-capture-status').textContent='正在生成图片并保存…';
    const draft=this.draft;
    try{
      const password=this.study.getPassword?.();
      const result=await api('study.card.create',{...draft,color,...(password?{password}:{})});
      this.busy=false;this.hide();window.getSelection()?.removeAllRanges();this.study.getRenderer().shadow?.getSelection?.()?.removeAllRanges();
      await this.study.refresh(result.card.id);toast('摘录图片与卡片已保存');
    }catch(error){this.busy=false;this.palette.querySelectorAll('button').forEach(b=>b.disabled=false);$('study-capture-status').textContent=error.code==='CONFLICT'?'学习集已变化，请重新选择原文后保存。':describeError(error);await this.study.refresh().catch(()=>{});}
  }
  regionStart(e){
    const active=this.active();if(!this.region||!active||active.doc.kind!=='pdf'||e.button!==0)return;
    const page=e.target.closest('.pdf-page');if(!page)return;if(this.region==='lasso'){this.lassoStart(e,page,active);return;}e.preventDefault();e.stopPropagation();
    const box=page.getBoundingClientRect(),start={x:clamp(e.clientX-box.left,0,box.width),y:clamp(e.clientY-box.top,0,box.height)};
    const draft=document.createElement('div');draft.className='study-region-draft';page.append(draft);page.setPointerCapture(e.pointerId);this.regionDrag=true;
    let rect;
    const move=event=>{const x=clamp(event.clientX-box.left,0,box.width),y=clamp(event.clientY-box.top,0,box.height);rect={x:Math.min(x,start.x),y:Math.min(y,start.y),width:Math.abs(x-start.x),height:Math.abs(y-start.y)};Object.assign(draft.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});};
    const stop=event=>{
      move(event);page.removeEventListener('pointermove',move);page.removeEventListener('pointerup',stop);page.releasePointerCapture(e.pointerId);this.region=false;$('reader-scroll').classList.remove('study-region-mode');$('study-region').setAttribute('aria-pressed','false');
      if(rect.width>5&&rect.height>5){const r={page:Number(page.dataset.page),x:rect.x/box.width,y:rect.y/box.height,width:rect.width/box.width,height:rect.height/box.height};this.show({setId:active.set.id,expectedRevision:active.set.revision,documentId:active.doc.id,expectedSourceVersion:active.doc.sourceVersion,captureId:crypto.randomUUID(),text:'',locator:{page:r.page,pageOffset:r.y},selection:{rects:[r]}},{left:box.left+rect.x,width:rect.width,bottom:box.top+rect.y+rect.height});}else draft.remove();
      setTimeout(()=>{this.regionDrag=false;},20);
    };
    page.addEventListener('pointermove',move);page.addEventListener('pointerup',stop);
  }
  lassoStart(e,page,active){
    e.preventDefault();e.stopPropagation();const box=page.getBoundingClientRect(),point=ev=>[clamp((ev.clientX-box.left)/box.width,0,1),clamp((ev.clientY-box.top)/box.height,0,1)],points=[point(e)];this.regionDrag=true;
    const draft=document.createElementNS('http://www.w3.org/2000/svg','svg');draft.classList.add('study-region-draft');draft.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';draft.setAttribute('viewBox','0 0 1 1');draft.setAttribute('preserveAspectRatio','none');page.append(draft);$('reader-scroll').setPointerCapture(e.pointerId);
    const move=ev=>{if(points.length<2048)points.push(point(ev));draft.innerHTML=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width=".002"/>`;};
    const stop=ev=>{move(ev);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);this.setRegion(false);if(points.length>=3){const ys=points.map(p=>p[1]);this.show({setId:active.set.id,expectedRevision:active.set.revision,documentId:active.doc.id,expectedSourceVersion:active.doc.sourceVersion,captureId:crypto.randomUUID(),text:'',locator:{page:Number(page.dataset.page),pageOffset:Math.min(...ys)},selection:{polygon:{page:Number(page.dataset.page),points}}},{left:ev.clientX,width:0,bottom:ev.clientY});}draft.remove();setTimeout(()=>this.regionDrag=false,20);};
    const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);draft.remove();this.regionDrag=false;this.setRegion(false);};document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
  }
  scheduleMarks(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.paint());}
  selectCard(id){for(const layer of this.layers||[])for(const mark of layer.children)mark.classList.toggle('study-mark-selected',mark.dataset.cardId===id);}
  paint(){
    this.layers=[];const active=this.active();
    for(const root of [$('reading-surface'),this.study.getRenderer().shadow].filter(Boolean))for(const layer of root.querySelectorAll('.study-highlight-layer'))layer.replaceChildren();
    if(!active)return;const {set,doc}=active,cards=set.cards.filter(c=>c.source?.documentId===doc.id&&!c.sourceChanged);
    const addLayer=root=>{let layer=root.querySelector(':scope > .study-highlight-layer');if(!layer){layer=document.createElement('div');layer.className='study-highlight-layer';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;overflow:hidden';root.append(layer);}this.layers.push(layer);return layer;};
    const mark=(layer,c,rect)=>{const el=document.createElement('span');el.className='study-mark';el.dataset.cardId=c.id;el.style.cssText=`position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:${set.colors[c.color]};opacity:.34;mix-blend-mode:multiply;border-radius:2px;pointer-events:none`;if(c.source.selection.polygon){const r=c.source.selection.rects[0];el.style.clipPath=`polygon(${c.source.selection.polygon.points.map(p=>`${(p[0]-r.x)/r.width*100}% ${(p[1]-r.y)/r.height*100}%`).join(',')})`;}layer.append(el);};
    if(doc.kind==='pdf'){
      for(const page of $('reading-surface').querySelectorAll('.pdf-page:not([data-render-state=folded])')){const number=Number(page.dataset.page),relevant=cards.filter(c=>c.source.selection.rects?.some(r=>r.page===number));if(!relevant.length)continue;const layer=addLayer(page);for(const c of relevant)for(const r of c.source.selection.rects.filter(r=>r.page===number))mark(layer,c,{x:r.x*page.clientWidth,y:r.y*page.clientHeight,width:r.width*page.clientWidth,height:r.height*page.clientHeight});}
    }else{
      const root=this.study.getRenderer().shadow?.querySelector('article');if(!root)return;root.style.position='relative';const layer=addLayer(root),box=root.getBoundingClientRect();
      for(const c of cards){if(c.source.locator.section!==doc.position.section||c.source.selection.start===undefined)continue;const range=textRange(root,c.source.selection.start,c.source.selection.end);if(!range)continue;for(const r of range.getClientRects())mark(layer,c,{x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height});}
    }
    this.selectCard(this.study.map.selected);
  }
}
