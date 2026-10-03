import {TopicDrag} from './topic-drag.js';
import { $, escape, field, showDialog, run, toast } from './dom.js';
import { api } from './transport.js';
import { rootSelection, selectedRegion } from './map-interaction.mjs';
const modes=[['hand','移动 / 阅读'],['select','框选 / 套索'],['clone','复制工具'],['reference','引用工具'],['cut','剪切工具'],['link-one','单向链接'],['link-both','双向链接'],['curve','手绘链接'],['hierarchy','拖绘父子关系']];
export class MapTools {
 constructor(study){
  this.study=study;this.map=study.map;this.mode='hand';this.active=null;this.suppress=0;this.topicDrag=new TopicDrag(study);this.map.topicDrag=this.topicDrag;
  const bar=document.createElement('div');bar.className='map-interaction-tools';bar.innerHTML=`<select id="map-tool-mode" aria-label="脑图操作工具">${modes.map(([id,title])=>`<option value="${id}">${title}</option>`).join('')}</select><select id="map-selection-shape" aria-label="主题选择方式"><option value="rectangle">矩形</option><option value="lasso">套索</option></select><button id="map-copy">复制</button><button id="map-cut">剪切</button><button id="map-paste">粘贴</button><button id="map-insert">插入节点</button><span id="map-tool-status" role="status"></span>`;
  this.map.board.querySelector('.study-organization-tools').after(bar);
  $('map-tool-mode').onchange=run(async()=>{this.study.cardInk.modeSet('off');this.study.ink.setMode('off');await this.study.change('study.map.preferences',{mode:$('map-tool-mode').value});});
  $('map-selection-shape').onchange=run(()=>this.study.change('study.map.preferences',{selectionShape:$('map-selection-shape').value}));
  $('map-copy').onclick=run(()=>this.copy('clone'));$('map-cut').onclick=run(()=>this.copy('cut'));$('map-paste').onclick=run(()=>this.paste());$('map-insert').onclick=()=>this.insert();
  const viewport=$('study-map-viewport'),board=this.map.board;
  board.addEventListener('pointerdown',e=>{this.suppress=0;this.start(e);},true);
  board.addEventListener('click',e=>{
   if(e.target.closest('button,input,select,textarea'))return;
   const card=e.target.closest('.study-card,.study-list-card');
   if(performance.now()<this.suppress){e.preventDefault();e.stopImmediatePropagation();return;}
   if(card&&this.mode==='hand'&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey){this.study.advanced.selected.clear();this.selection();}
   if(card&&this.mode==='select'){e.preventDefault();e.stopImmediatePropagation();this.toggle(card.dataset.cardId,e.shiftKey||e.metaKey||e.ctrlKey);}
  },true);
  board.addEventListener('dblclick',e=>{if(this.mode!=='hand'&&!e.target.closest('button,input,select')){e.preventDefault();e.stopImmediatePropagation();}},true);
  board.addEventListener('dragstart',e=>{if(this.mode!=='hand'){e.preventDefault();e.stopImmediatePropagation();}},true);
  board.addEventListener('keydown',e=>{
   if($('dialog').open||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
   if((e.ctrlKey||e.metaKey)&&['a','c','x','v'].includes(e.key.toLowerCase())){
    e.preventDefault();e.stopImmediatePropagation();const key=e.key.toLowerCase();
    if(key==='a'){for(const id of this.map.layout?.positions.keys()||[])this.study.advanced.selected.add(id);this.selection();}
    else run(()=>key==='v'?this.paste():this.copy(key==='x'?'cut':'clone'))();
   }
  },true);
  viewport.addEventListener('click',e=>{const hit=e.target.closest('[data-link-id]');if(hit){e.stopPropagation();this.editLink(hit.dataset.linkId);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')this.cancel?.();});
 }
 render(set){
  this.mode=set.map?.tools?.mode||'hand';$('map-tool-mode').value=this.mode;$('map-selection-shape').value=set.map?.tools?.selectionShape||'rectangle';$('map-selection-shape').hidden=this.mode!=='select';
  this.map.board.dataset.interaction=this.mode;this.selection();
 }
 selection(){this.study.advanced.selection();this.study.organization.render(this.study.current);}
 ids(){return this.study.organization.ids();}
 toggle(id,multiple){const selected=this.study.advanced.selected;if(!multiple)selected.clear();selected.has(id)?selected.delete(id):selected.add(id);this.map.select(id);this.selection();}
 async copy(mode='clone',cardIds=this.ids()){
  if(!cardIds.length)throw Error('先选择需要复制或剪切的主题。');
  const set=this.study.current,result=await api('study.clipboard.set',{setId:set.id,expectedRevision:set.revision,cardIds,mode,descendants:true});
  this.receipt=result.clipboard;$('map-tool-status').textContent=`${mode==='cut'?'待剪切':mode==='reference'?'引用':'复制'} ${cardIds.length} 个分支`;return result.clipboard;
 }
 async paste(params={},receipt){
  const set=this.study.current;if(!set)throw Error('先打开学习集。');
  if(set.map?.mindmap?.enabled)this.study.mindmapStudio.guard();
  const parentId=set.map?.mindmap?.enabled&&set.cards.some(c=>c.id===this.map.selected)?this.map.selected:set.map?.submapId||null;
  if(!receipt){const state=await api('study.clipboard.get');if(!state.clipboard)throw Error('还没有复制的主题。');if(!state.valid)throw Error('源主题已更新，请重新复制或剪切。');receipt=state.clipboard;}
  if(this.study.current?.id!==set.id)throw Error('学习集已切换，未执行粘贴。');
  const result=await api('study.clipboard.paste',{setId:set.id,expectedRevision:set.revision,clipboardId:receipt.id,parentId,...params});
  if(this.study.current?.id!==set.id){await this.study.refreshList();return result;}
  this.study.render(result.set,result.rootIds[0]);await this.study.refreshList();
  this.study.advanced.selected=new Set(result.rootIds);this.selection();if(set.map?.mindmap?.enabled)this.map.center(result.rootIds[0]);$('map-tool-status').textContent=`已${result.mode==='cut'?'移动':'粘贴'} ${result.cardIds.length} 个主题`;
  return result;
 }
 insert(card){
  card??=this.study.current?.cards.find(c=>c.id===this.map.selected);if(!card){toast('先选择一个插入位置。');return;}
  const set=this.study.current;
  showDialog({title:'插入主题节点',html:field('relation','相对位置','after',{choices:[['before','前方同级'],['after','后方同级'],['parent','插入父节点'],['child','新建子节点']]})+field('title','标题','',{required:true})+'<label class="dialog-field"><span>正文</span><textarea name="text"></textarea></label>',onSubmit:async values=>{const next=await this.study.change('study.card.insert',{cardId:card.id,...values},set.revision);this.map.select(next.lastInsertedCard);this.map.center(next.lastInsertedCard);}});
 }
 editLink(id){
  if(this.study.current?.map?.mindmap?.enabled)return this.study.mindmapStudio.open('relationship',id);
  const set=this.study.current,link=set.links.find(l=>l.id===id);if(!link)return;
  showDialog({title:'编辑脑图连线',html:field('label','链接说明',link.label||'')+field('bidirectional','方向',link.bidirectional?'yes':'no',{choices:[['no','单向 →'],['yes','双向 ↔']]})+field('action','操作','update',{choices:[['update','保存'],['straight','恢复自动曲线'],['remove','移除连线（可撤销）']]}),onSubmit:v=>v.action==='remove'?this.study.change('study.link.remove',{linkId:id},set.revision):this.study.change('study.link.update',{linkId:id,label:v.label,bidirectional:v.bidirectional==='yes',...(v.action==='straight'?{curve:[]}:{})},set.revision)});
 }
 world(event){const box=$('study-map-world').getBoundingClientRect();return [(event.clientX-box.left)/this.map.zoom,(event.clientY-box.top)/this.map.zoom];}
 start(e){
  if(this.study.current?.map?.mindmap?.enabled&&['hand','select','hierarchy'].includes(this.mode)&&this.map.window.topicAt(e))return this.topicDrag.start(e);
  if(e.button!==0||!e.target.closest('#study-map-viewport')||e.target.closest('button,input,select,textarea,[data-link-id]')||this.study.cardInk.mode!=='off'||this.active)return;
  const card=e.target.closest('.study-card'),selected=this.study.advanced.selected,multi=card&&selected.has(card.dataset.cardId)&&selected.size>1;
  const mode=this.mode==='hand'&&multi?'move':this.mode;
  if(mode==='hand'||mode!=='select'&&!card)return;
  if(mode==='select'&&card)return;
  e.preventDefault();e.stopImmediatePropagation();this.map.closeMenu();
  const set=this.study.current,start=this.world(e),points=[start],id=card?.dataset.cardId;
  const ids=id&&selected.has(id)?[...selected]:id?[id]:[];
  const roots=rootSelection(set.cards,ids),positions=new Map(roots.map(c=>[c.id,{...this.map.layout.positions.get(c.id)}]));
  this.active={mode,start,set,id,ids};this.map.drag={id,revision:set.revision};
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('map-gesture-overlay');overlay.setAttribute('width',this.map.layout.width);overlay.setAttribute('height',this.map.layout.height);$('study-map-world').append(overlay);
  const capture=$('study-map-viewport');capture.setPointerCapture(e.pointerId);let moved=false,previous=[e.clientX,e.clientY];
  const move=event=>{
   const p=this.world(event);if(Math.hypot(event.clientX-e.clientX,event.clientY-e.clientY)>5)moved=true;previous=[event.clientX,event.clientY];
   if(points.length<256)points.push(p);else points[points.length-1]=p;
   if(mode==='select'&&set.map?.tools?.selectionShape!=='lasso')overlay.innerHTML=`<rect x="${Math.min(start[0],p[0])}" y="${Math.min(start[1],p[1])}" width="${Math.abs(start[0]-p[0])}" height="${Math.abs(start[1]-p[1])}"/>`;
   else if(mode==='select')overlay.innerHTML=`<polygon points="${points.map(v=>v.join(',')).join(' ')}"/>`;
   else if(['move','clone','reference','cut'].includes(mode)){overlay.innerHTML=roots.map(c=>{const r=positions.get(c.id);return r?`<rect x="${r.x+p[0]-start[0]}" y="${r.y+p[1]-start[1]}" width="${r.width}" height="${r.height}"/>`:'';}).join('');}
   else overlay.innerHTML=`<polyline fill="none" points="${(mode==='curve'?points:[start,p]).map(v=>v.join(',')).join(' ')}"/>`;
  };
  const cleanup=()=>{
   document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);
   if(capture.hasPointerCapture(e.pointerId))capture.releasePointerCapture(e.pointerId);overlay.remove();this.active=null;this.cancel=null;this.map.drag=null;this.suppress=performance.now()+250;
  };
  const cancel=()=>{cleanup();this.study.render(this.study.current);};this.cancel=cancel;
  const stop=event=>{
   move(event);const end=this.world(event),hit=document.elementFromPoint(previous[0],previous[1])?.closest('.study-card'),targetId=hit?.dataset.cardId;
   cleanup();
   run(async()=>{
    if(mode==='select'){
     const next=e.shiftKey||e.metaKey||e.ctrlKey?new Set(this.study.advanced.selected):new Set();
     for(const id of selectedRegion(this.map.layout.positions,start,end,set.map?.tools?.selectionShape==='lasso'?points:null))next.add(id);
     this.study.advanced.selected=next;if(next.size===1)this.map.select([...next][0]);this.selection();return;
    }
    if(!moved){if(set.map?.mindmap?.enabled&&mode==='move'){if(e.shiftKey||e.metaKey||e.ctrlKey){selected.has(id)?selected.delete(id):selected.add(id);}else selected.clear();}this.map.select(id);this.selection();return;}
    if(['link-one','link-both','curve','hierarchy'].includes(mode)){
     if(!targetId||targetId===id)throw Error('拖到另一个主题上完成连线。');
     if(mode==='hierarchy')await this.study.change('study.cards.move',{cardIds:[id],parentId:targetId,expandParent:true},set.revision);
     else{
      const a=this.map.layout.positions.get(id),b=this.map.layout.positions.get(targetId),curve=mode==='curve'?points.filter((_,i)=>i%Math.ceil(points.length/60)===0):null;
      if(curve){curve[0]=[a.x+a.width/2,a.y+a.height/2];curve.push([b.x+b.width/2,b.y+b.height/2]);}
      await this.study.change('study.link.add',{from:id,to:targetId,bidirectional:mode==='link-both'||mode==='curve'&&e.shiftKey,...(curve?{curve}:{})},set.revision);
     }
    }else{
     const parentId=targetId&&!ids.includes(targetId)?targetId:set.map?.submapId||null,dx=end[0]-start[0],dy=end[1]-start[1];
     if(mode==='move')await this.study.change('study.cards.move',{cardIds:ids,parentId,...(parentId===null||parentId===set.map?.submapId?{positions:roots.map(c=>({cardId:c.id,x:Math.max(0,positions.get(c.id).x+dx),y:Math.max(0,positions.get(c.id).y+dy)}))}:{})},set.revision);
     else{
      const {clipboard}=await api('study.clipboard.set',{setId:set.id,expectedRevision:set.revision,cardIds:ids,mode,descendants:true});
      await this.paste({parentId,...(!targetId?{x:end[0],y:end[1]}:{})},clipboard);
     }
    }
   })();
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
 }
}
