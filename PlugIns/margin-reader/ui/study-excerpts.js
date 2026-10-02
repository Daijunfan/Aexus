import { $, escape, run, toast, describeError, field, showDialog, closeDialog } from './dom.js';
import { api } from './transport.js';
import { pagePoint, sourceRectangle, projectRects, displayY } from './page-slices.mjs';
import { textRange, pointInPolygon } from './selection-utils.mjs';
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
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export class StudyExcerpts {
  constructor(study) {
    this.study=study;this.draft=null;this.busy=false;this.region=false;
    const lasso=document.createElement('button');lasso.id='study-excerpt-lasso';lasso.textContent='套索摘录';lasso.onclick=()=>{this.study.ink.setMode('off');this.setRegion(this.region==='lasso'?false:'lasso');};$('study-region').after(lasso);
    const palette=document.createElement('div');palette.id='study-palette';palette.hidden=true;palette.setAttribute('role','dialog');palette.setAttribute('aria-label','选择标注颜色并保存摘录');
    palette.innerHTML=`<div class="study-palette-heading"><span>保存为摘录卡片</span><button id="study-palette-close" aria-label="取消摘录">×</button></div><label class="capture-destination"><span>保存到</span><select id="capture-destination"><option value="new">新卡片</option><option value="append">追加到选中卡片</option><option value="revise">替换选中摘录 / 重新绑定</option></select></label><div class="study-swatches">${study.colors.map(([color,label])=>`<button data-color="${color}" aria-label="标注${label}并保存" title="${label}" style="background:${study.hex[color]}"></button>`).join('')}</div><p id="study-capture-status" role="status"></p>`;
    document.body.append(palette);this.palette=palette;
    palette.addEventListener('pointerdown',e=>{if(!e.target.closest('select,option,input'))e.preventDefault();});$('study-palette-close').onclick=()=>this.hide();palette.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>this.save(b.dataset.color));
    const scroller=$('reader-scroll');
    scroller.addEventListener('pointerdown',e=>{this.pointer={x:e.clientX,y:e.clientY,button:e.button};},true);
    scroller.addEventListener('pointerup',e=>setTimeout(()=>{
      if(e.target.closest('[data-page-ui]')||this.regionDrag||this.region||this.study.ink?.mode!=='off')return;
      const moved=!this.pointer||Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>4;
      const range=selectedRange(this.study.getRenderer().shadow);
      if(!moved&&e.button===0&&(!range||!range.toString().trim()))run(()=>this.chooseMark(e))();
      else this.readSelection();
    },0));
    scroller.addEventListener('contextmenu',e=>{if(this.hits(e.clientX,e.clientY).length){e.preventDefault();run(()=>this.chooseMark(e))();}});
    document.addEventListener('pointerdown',e=>{if(this.markMenu&&!e.composedPath().includes(this.markMenu))this.closeMarkMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.closeMarkMenu();});
    $('reader-scroll').addEventListener('keyup',()=>this.readSelection());
    document.addEventListener('pointerdown',e=>{if(!this.busy&&!e.composedPath().some(n=>n===palette||n===this.markMenu||n===$('reader-scroll')))this.hide();});
    // Reflow and card linkage may scroll programmatically after the menu opens.
    // Keep that menu available; real wheel/pointer navigation still dismisses it.
    $('reader-scroll').addEventListener('scroll',()=>{if(!this.busy&&!this.markMenu)this.hide();},{passive:true});
    $('reader-scroll').addEventListener('wheel',()=>this.closeMarkMenu(),{passive:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!this.busy){this.hide();this.setRegion(false);}});
    this.observer=new MutationObserver(records=>{if(records.some(m=>!m.target.closest?.('.study-highlight-layer')&&![...m.addedNodes,...m.removedNodes].every(n=>n.nodeType===1&&n.classList.contains('study-highlight-layer'))))this.scheduleMarks();});
    this.observer.observe($('reading-surface'),{subtree:true,childList:true,attributes:true,attributeFilter:['data-render-state']});
    new ResizeObserver(()=>this.scheduleMarks()).observe($('reader-scroll'));
    $('reader-scroll').addEventListener('pointerdown',e=>this.regionStart(e));
  }
  active(){const set=this.study.current,doc=this.study.getDocument();return set&&doc&&set.documentIds.includes(doc.id)?{set,doc}:null;}
  hide(){if(this.busy)return;this.closeMarkMenu();this.palette.hidden=true;this.draft=null;document.querySelector('.study-region-draft')?.remove();document.dispatchEvent(new Event('reader-interaction-finished'));}
  setRegion(on){this.region=on;this.hide();$('reader-scroll').classList.toggle('study-region-mode',on);$('study-region').setAttribute('aria-pressed',on);}
  readSelection(){
    const doc=this.study.getDocument(),set=this.study.current;if(!doc||this.busy||this.palette.contains(document.activeElement))return;
    const shadow=this.study.getRenderer().shadow,range=selectedRange(shadow);if(!range)return;
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
          for(const r of part.getClientRects())if(r.width>0&&r.height>0){for(const rect of sourceRectangle(page,r))rects.push({page:number,...rect});}
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
    this.show({...(set?{setId:set.id,expectedRevision:set.revision}:{}),documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:crypto.randomUUID(),text,locator,selection},range.getBoundingClientRect());
  }
  show(draft,box){
    if(this.study.getDocument()?.kind==='pdf'){
      const pages=new Set(draft.selection.rects?.map(r=>r.page)||[draft.selection.polygon?.page]);
      const selected=[...$('reading-surface').querySelectorAll('.pdf-page')].filter(p=>pages.has(Number(p.dataset.page)));
      if(selected.some(p=>p.pageSlices?.blocks.length>1))draft.selection.bands=selected.flatMap(p=>p.pageSlices.blocks.filter(b=>b.type==='source').map(b=>({page:Number(p.dataset.page),start:b.start,end:b.end})));
    }
    const target=this.study.current?.cards.find(c=>c.id===this.study.map.selected&&c.source&&!c.reference);
    this.captureTarget=target?{id:target.id,partId:this.revisePartId||target.excerptParts?.[0]?.id||target.id}:null;const revising=Boolean(this.revisePartId&&target);this.revisePartId=null;
    $('capture-destination').value=revising?'revise':'new';for(const option of $('capture-destination').options)option.disabled=option.value!=='new'&&!target;
    this.draft=draft;this.palette.hidden=false;$('study-capture-status').textContent='';
    this.palette.style.left=`${clamp(box.left+box.width/2-132,8,innerWidth-280)}px`;
    this.palette.style.top=`${clamp(box.bottom+9,8,innerHeight-125)}px`;
    this.palette.querySelectorAll('button').forEach(b=>b.disabled=false);
  }
  async save(color){
    if(!this.draft||this.busy)return;this.busy=true;this.palette.querySelectorAll('button').forEach(b=>b.disabled=true);$('study-capture-status').textContent='正在生成图片并保存…';
    const draft=this.draft;
    try{
      if(!draft.setId){const set=await this.study.ensureNotes();draft.setId=set.id;draft.expectedRevision=set.revision;}
      const password=this.study.getPassword?.();
      const mode=$('capture-destination').value,target=this.captureTarget;
      if(mode!=='new'&&!target)throw Error('请先选择一张已有摘录卡片');
      const result=await api(mode==='new'?'study.card.create':mode==='append'?'study.excerpt.append':'study.excerpt.revise',{...draft,...(mode==='new'?{color}:{cardId:target.id,...(mode==='revise'?{partId:target.partId}:{})}),...(password?{password}:{})});
      this.busy=false;this.hide();window.getSelection()?.removeAllRanges();this.study.getRenderer().shadow?.getSelection?.()?.removeAllRanges();
      await this.study.refresh(result.card.id);toast('摘录图片与卡片已保存');
    }catch(error){this.busy=false;this.palette.querySelectorAll('button').forEach(b=>b.disabled=false);$('study-capture-status').textContent=error.code==='CONFLICT'?'学习集已变化，请重新选择原文后保存。':describeError(error);await this.study.refresh().catch(()=>{});}
  }
  regionStart(e){
    const active=this.active();if(e.target.closest('[data-page-ui]')||!this.region||!active||active.doc.kind!=='pdf'||e.button!==0)return;
    const page=e.target.closest('.pdf-page');if(!page)return;if(this.region==='lasso'){this.lassoStart(e,page,active);return;}e.preventDefault();e.stopPropagation();
    const box=page.getBoundingClientRect(),start={x:clamp(e.clientX-box.left,0,box.width),y:clamp(e.clientY-box.top,0,box.height)};
    const draft=document.createElement('div');draft.className='study-region-draft';page.append(draft);page.setPointerCapture(e.pointerId);this.regionDrag=true;
    let rect;
    const move=event=>{const x=clamp(event.clientX-box.left,0,box.width),y=clamp(event.clientY-box.top,0,box.height);rect={x:Math.min(x,start.x),y:Math.min(y,start.y),width:Math.abs(x-start.x),height:Math.abs(y-start.y)};Object.assign(draft.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});};
    const stop=event=>{
      move(event);page.removeEventListener('pointermove',move);page.removeEventListener('pointerup',stop);page.releasePointerCapture(e.pointerId);this.region=false;$('reader-scroll').classList.remove('study-region-mode');$('study-region').setAttribute('aria-pressed','false');
      if(rect.width>5&&rect.height>5){const mapped=sourceRectangle(page,{left:box.left+rect.x,top:box.top+rect.y,width:rect.width,height:rect.height}).map(r=>({page:Number(page.dataset.page),...r}));if(!mapped.length){draft.remove();this.regionDrag=false;return;}const r=mapped[0];this.show({setId:active.set.id,expectedRevision:active.set.revision,documentId:active.doc.id,expectedSourceVersion:active.doc.sourceVersion,captureId:crypto.randomUUID(),text:'',locator:{page:r.page,pageOffset:r.y},selection:{rects:mapped}},{left:box.left+rect.x,width:rect.width,bottom:box.top+rect.y+rect.height});}else draft.remove();
      setTimeout(()=>{this.regionDrag=false;},20);
    };
    page.addEventListener('pointermove',move);page.addEventListener('pointerup',stop);
  }
  lassoStart(e,page,active){
    e.preventDefault();e.stopPropagation();const box=page.getBoundingClientRect(),point=ev=>pagePoint(page,ev.clientX,ev.clientY),points=[point(e)];this.regionDrag=true;
    const draft=document.createElementNS('http://www.w3.org/2000/svg','svg');draft.classList.add('study-region-draft');draft.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';draft.setAttribute('viewBox','0 0 1 1');draft.setAttribute('preserveAspectRatio','none');page.append(draft);$('reader-scroll').setPointerCapture(e.pointerId);
    const move=ev=>{if(points.length<2048)points.push(point(ev));draft.innerHTML=`<polygon points="${points.map(p=>[p[0],page.pageSlices?displayY(page.pageSlices,p[1])/box.height:p[1]].join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width=".002"/>`;};
    const stop=ev=>{move(ev);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);this.setRegion(false);if(points.length>=3){const ys=points.map(p=>p[1]);this.show({setId:active.set.id,expectedRevision:active.set.revision,documentId:active.doc.id,expectedSourceVersion:active.doc.sourceVersion,captureId:crypto.randomUUID(),text:'',locator:{page:Number(page.dataset.page),pageOffset:Math.min(...ys)},selection:{polygon:{page:Number(page.dataset.page),points}}},{left:ev.clientX,width:0,bottom:ev.clientY});}draft.remove();setTimeout(()=>this.regionDrag=false,20);};
    const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);draft.remove();this.regionDrag=false;this.setRegion(false);};document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
  }
  scheduleMarks(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.paint());}
  selectCard(id){for(const layer of this.layers||[])for(const mark of layer.children){const selected=mark.dataset.cardId===id;mark.classList.toggle('study-mark-selected',selected);mark.style.outline=selected?'2px solid var(--accent,#4b91ed)':'';}}
  closeMarkMenu(){this.markMenu?.remove();this.markMenu=null;}
  hits(x,y){
    const cards=new Map(),set=this.study.current;if(!set)return [];
    for(const layer of this.layers||[])for(const el of layer.children){const r=el.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)continue;const card=set.cards.find(c=>c.id===el.dataset.cardId);if(!card)continue;
      const polygon=(card.annotationLocations?.[Number(el.dataset.locationIndex)]?.source||card.excerptParts?.find(p=>p.id===el.dataset.partId)?.source||card.source)?.selection?.polygon;if(polygon){const page=el.closest('.pdf-page'),box=page.getBoundingClientRect();if(!pointInPolygon(...pagePoint(page,x,y),polygon.points))continue;}
      cards.set(card.id,card);
    }
    return [...cards.values()].reverse();
  }
  async chooseMark(event){
    const cards=this.hits(event.clientX,event.clientY);if(!cards.length)return;
    this.hide();const position={x:event.clientX,y:event.clientY};
    if(cards.length===1)return this.openMark(cards[0],position);
    const menu=this.popup(position);menu.innerHTML='<strong>重叠标注 · 选择一条</strong>'+cards.map(c=>`<button data-id="${c.id}">${escape(c.title)}</button>`).join('');
    menu.querySelectorAll('button').forEach(b=>b.onclick=run(()=>this.openMark(cards.find(c=>c.id===b.dataset.id),position)));
  }
  popup(position){
    this.closeMarkMenu();const menu=document.createElement('div');menu.id='study-annotation-menu';menu.className='context-menu annotation-menu';menu.setAttribute('role','menu');document.body.append(menu);this.markMenu=menu;
    menu.style.left=clamp(position.x,8,innerWidth-290)+'px';menu.style.top=clamp(position.y+10,8,innerHeight-350)+'px';return menu;
  }
  repair(card){
    const set=this.study.current;
    showDialog({title:'修复旧摘录定位',html:'<p class="dialog-note">核对原 PDF 和保存的截图，只为图像一致的片段补回定位。原截图和笔记保留，可撤销。</p>'+field('password','PDF 密码（仅加密原文需要）','',{type:'password'}),submit:'核对并修复',onSubmit:async v=>{if(this.study.current?.id!==set.id)throw Error('学习集已切换。');const result=await this.study.change('study.excerpt.repair',{cardIds:[card.id],...(v.password?{password:v.password}:{})},set.revision),report=result.mappingRepair;toast(`已修复 ${report.repairedCardIds.length} 张摘录；${report.unchanged} 张保持原状。`+(report.skipped.length?' '+[...new Set(report.skipped.map(s=>s.message))].join(' '):''),Boolean(report.skipped.length));}});
  }
  async fragments(card){
    const setId=this.study.current.id,data=await api('study.excerpt.list',{setId,cardId:card.id});
    showDialog({title:'连续摘录 · 原文片段',html:'<button type="button" id="excerpt-repair">修复旧摘录定位</button>'+data.parts.map((p,i)=>`<section class="excerpt-part" data-part="${p.id}"><strong>${i+1}. ${escape(p.source.title)}</strong><p>${escape(p.text||'图片摘录')}</p><small>${p.sourceChanged?'原文已变化，请重新选择并绑定':p.source.locator.page?'第 '+p.source.locator.page+' 页':'第 '+(p.source.locator.section+1)+' 节'}</small><div><button type="button" data-part-action="source">回到这段原文</button><button type="button" data-part-action="image">查看原始截图</button><button type="button" data-part-action="revise">重新选择 / 绑定此片段</button><button type="button" data-part-action="remove" ${data.parts.length<=1?'disabled':''}>移除此片段</button></div></section>`).join(''),onSubmit:null,afterOpen:()=>{
      $('excerpt-repair').onclick=()=>{closeDialog();this.repair(card);};
      $('dialog-fields').querySelectorAll('[data-part-action]').forEach(b=>b.onclick=run(async()=>{
        const part=data.parts.find(p=>p.id===b.closest('[data-part]').dataset.part),action=b.dataset.partAction;closeDialog();
        if(action==='source')return this.study.activateCard(card,'map',true,part.id);
        if(action==='image'){const image=await api('study.excerpt.image',{setId,cardId:card.id,partId:part.id});showDialog({title:part.source.title,html:`<img class="study-snapshot" src="data:${image.mimeType};base64,${image.contentBase64}" alt="${escape(part.source.title)}">`,onSubmit:null});return;}
        if(action==='remove'){await api('study.excerpt.remove',{setId,cardId:card.id,partId:part.id,expectedRevision:data.revision});await this.study.refresh(card.id);return;}
        this.study.map.select(card.id);this.revisePartId=part.id;toast('请在原文中重新选择文字或区域，然后保存。旧截图保留在撤销历史中。');
      }));
    }});
  }
  async openMark(card,position){
    if(this.study.learning?.masked(card,'document')){await this.study.change('study.recall.reveal',{cardId:card.id});return;}
    await this.study.activateCard(card,'document');
    const set=this.study.current, fresh=set.cards.find(c=>c.id===card.id);if(!fresh)return;
    const revision=set.revision,menu=this.popup(position);
    menu.innerHTML=`<strong>${escape(fresh.title)}</strong><div class="annotation-colors">${this.study.colors.map(([color,label])=>`<button data-color="${color}" title="改为${label}" aria-label="标注改为${label}" style="background:${set.colors[color]}"></button>`).join('')}</div><button data-action="edit">编辑笔记 / 标签</button><button data-action="review">加入 / 编辑复习</button><button data-action="parts">连续摘录 / 修改片段</button><button data-action="hide">取消标注（保留卡片）</button><button data-action="remove">删除摘录卡片…</button><button data-action="close">关闭菜单</button>`;
    menu.querySelectorAll('[data-color]').forEach(b=>b.onclick=run(async()=>{await this.study.change('study.card.update',{cardId:card.id,color:b.dataset.color},revision);this.closeMarkMenu();}));
    menu.querySelectorAll('[data-action]').forEach(b=>b.onclick=run(async()=>{const action=b.dataset.action;this.closeMarkMenu();if(action==='hide'){await this.study.change('study.annotation.update',{cardId:card.id,visible:false},revision);toast('标注已取消，卡片与图片保留。可撤销。');}else if(action==='remove')this.study.map.remove(fresh);else if(action==='edit')this.study.map.edit(fresh);else if(action==='review')this.study.map.workbench.configureReview(fresh);else if(action==='parts')return this.fragments(fresh);}));
  }
  revealCard(id,source){
    this.paint();const elements=(this.layers||[]).flatMap(layer=>[...layer.children]).filter(el=>el.dataset.cardId===id&&(!source?.excerptId||el.dataset.partId===source.excerptId)&&(!source?.locator.page||Number(el.closest('.pdf-page')?.dataset.page)===source.locator.page));
    const scroller=$('reader-scroll'),visible=elements.find(el=>el.getBoundingClientRect().height>0)||$('reading-surface').querySelector(`[data-note-card="${id}"]`);
    if(visible){const r=visible.getBoundingClientRect(),v=scroller.getBoundingClientRect();if(r.top<v.top+12||r.bottom>v.bottom-12)scroller.scrollTop+=r.top-v.top-50;
      if(document.body.dataset.uiMotion!=='reduced')visible.animate([{outline:'3px solid #e45640',opacity:.65},{outline:'2px solid #4b91ed',opacity:.34}],{duration:900});}
    this.selectCard(id);
  }
  paint(){
    this.layers=[];const active=this.active(),obsolete=new Set();
    for(const root of [$('reading-surface'),this.study.getRenderer().shadow].filter(Boolean))for(const layer of root.querySelectorAll('.study-highlight-layer'))obsolete.add(layer);
    if(!active){obsolete.forEach(layer=>layer.remove());return;}const {set,doc}=active,cards=set.cards.flatMap(c=>Array.isArray(c.annotationLocations)?c.annotationLocations.map((part,i)=>({...c,source:part.source,sourceChanged:part.sourceChanged,notebookVisible:part.notebookVisible,partId:part.partId,locationIndex:i})):c.excerptParts?.length?c.excerptParts.map(part=>({...c,source:part.source,sourceChanged:part.sourceChanged,notebookVisible:part.notebookVisible,partId:part.id})):[c]).filter(c=>c.source?.documentId===doc.id&&!c.sourceChanged&&c.notebookVisible!==false&&c.annotation?.visible!==false);
    const addLayer=root=>{let layer=root.querySelector(':scope > .study-highlight-layer');if(!layer){layer=document.createElement('div');layer.className='study-highlight-layer';layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3;overflow:hidden';root.append(layer);}obsolete.delete(layer);this.layers.push(layer);return layer;};
    const mark=(layer,c,rect)=>{const el=document.createElement('span');el.className='study-mark';el.dataset.cardId=c.id;if(c.partId)el.dataset.partId=c.partId;if(c.locationIndex!==undefined)el.dataset.locationIndex=c.locationIndex;el.style.cssText=`position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;background:${set.colors[c.color]};opacity:.34;mix-blend-mode:multiply;border-radius:2px;pointer-events:none`;const style=c.annotation?.style||'highlight';if(style!=='highlight'){el.style.background='transparent';el.style.opacity='.85';el.style.color=set.colors[c.color];if(style==='box')el.style.border='2px solid currentColor';else{el.style.borderBottom='2px solid currentColor';if(style==='strike')el.style.height=(rect.height/2)+'px';}}
      if(c.source.selection.polygon){const r=c.source.selection.rects[0];el.style.clipPath=`polygon(${c.source.selection.polygon.points.map(p=>`${(p[0]-r.x)/r.width*100}% ${(p[1]-(rect.sourceStart??r.y))/((rect.sourceEnd??r.y+r.height)-(rect.sourceStart??r.y))*100}%`).join(',')})`;}this.study.learning?.paintMark(el,c);layer.append(el);};
    if(doc.kind==='pdf'){
      const pages=[...$('reading-surface').querySelectorAll('.pdf-page[data-render-state=ready]')],wanted=new Set(pages.map(p=>Number(p.dataset.page))),byPage=new Map();
      for(const c of cards)for(const number of new Set((c.source.selection.rects||[]).map(r=>r.page)))if(wanted.has(number)){if(!byPage.has(number))byPage.set(number,[]);byPage.get(number).push(c);}
      for(const page of pages){
        const number=Number(page.dataset.page),relevant=byPage.get(number);if(!relevant?.length)continue;
        const layer=addLayer(page),key=JSON.stringify([set.id,doc.sourceVersion,page.clientWidth,page.clientHeight,page.pageSlices,set.recall,relevant.map(c=>[c.id,c.partId,c.locationIndex,set.colors[c.color],c.annotation,c.source.selection])]);
        if(layer.paintKey===key)continue;layer.paintKey=key;layer.replaceChildren();
        for(const c of relevant)for(const r of c.source.selection.rects.filter(r=>r.page===number))for(const projected of page.pageSlices?projectRects(page.pageSlices,r,page.clientWidth):[{x:r.x*page.clientWidth,y:r.y*page.clientHeight,width:r.width*page.clientWidth,height:r.height*page.clientHeight,sourceStart:r.y,sourceEnd:r.y+r.height}])mark(layer,c,projected);
      }
    }else{
      const root=this.study.getRenderer().shadow?.querySelector('article');if(!root)return;root.style.position='relative';const layer=addLayer(root),box=root.getBoundingClientRect();layer.replaceChildren();
      for(const c of cards){if(c.source.locator.section!==doc.position.section||c.source.selection.start===undefined)continue;const range=textRange(root,c.source.selection.start,c.source.selection.end);if(!range)continue;for(const r of range.getClientRects())mark(layer,c,{x:r.left-box.left,y:r.top-box.top,width:r.width,height:r.height});}
    }
    obsolete.forEach(layer=>layer.remove());this.selectCard(this.study.map.selected);
  }
}
