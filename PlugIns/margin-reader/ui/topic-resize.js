import {paintEquations} from './equation-renderer.js';
import {$,icon,run,toast} from './dom.js';
import {api,base} from './transport.js';
import {topicBox,mapStyle} from './mindmap-style.mjs';
import {topicMarkup} from './mindmap-view.mjs';
export class TopicResize{
 constructor(study){
  this.study=study;this.map=study.map;this.view=$('study-map-viewport');this.map.topicResize=this;
  this.map.board.addEventListener('pointerdown',e=>this.start(e),true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.active&&!this.active.saving){e.preventDefault();e.stopImmediatePropagation();this.cancel();}},true);
  window.addEventListener('blur',()=>{if(this.active&&!this.active.saving)this.cancel();});
 }
 start(e){
  const handle=e.target.closest('[data-mm-resize],[data-mm-equation-scale]');if(!handle||e.button!==0||this.active||this.study.cardInk.mode!=='off'||this.study.busy)return;
  e.preventDefault();e.stopImmediatePropagation();this.map.motion?.finish();if(this.study.inspector?.dirty||this.study.mindmapStudio.dirty){toast('请先保存当前编辑。',true);return;}
  const node=handle.closest('.mindmap-topic'),set=this.study.current,id=node.dataset.cardId,card=set.cards.find(c=>c.id===id),p=this.map.layout.positions.get(id),style=this.map.layout.topics.get(id),config=mapStyle(set.map.mindmap);
  const a=this.active={set,id,card,node,p,style,config,startX:e.clientX,pointer:e.pointerId,width:p.width,kind:handle.hasAttribute('data-mm-equation-scale')?'equation':'width',scale:card.mindmap?.equation?.scale||1};this.map.drag={id,revision:set.revision,resize:true};
  a.preview=document.createElement('div');a.preview.className='mm-resize-preview';$('study-map-world').append(a.preview);node.style.visibility='hidden';
  const move=event=>{if(event.pointerId!==a.pointer||a.saving)return;if(a.kind==='equation')a.scale=Math.max(.2,Math.min(4,(card.mindmap.equation.scale||1)*(1+(event.clientX-a.startX)/this.map.zoom/Math.max(20,style.box.mathWidth))));else a.width=Math.round(Math.max(100,Math.min(800,p.width+(event.clientX-a.startX)/this.map.zoom)));this.paint();};
  const stop=event=>{if(event.pointerId!==a.pointer)return;move(event);run(()=>this.save())();};
  const cancel=event=>{if(event.pointerId===a.pointer&&!a.saving)this.cancel();};
  this.view.setPointerCapture(a.pointer);document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',cancel);
  a.clean=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);if(this.view.hasPointerCapture(a.pointer))this.view.releasePointerCapture(a.pointer);};this.paint();
 }
 paint(){const a=this.active,card=a.kind==='equation'?{...a.card,mindmap:{...a.card.mindmap,equation:{...a.card.mindmap.equation,scale:a.scale}}}:a.card,style={...a.style,...(a.kind==='width'?{width:a.width}:{})},box=topicBox(card,style,a.config,a.style.prefix||'');a.preview.innerHTML=topicMarkup(card,{...a.p,width:box.width,height:box.height},{...style,box,lines:box.lines},a.set,base,icon('more'));paintEquations(a.preview);a.preview.querySelectorAll('button').forEach(b=>b.disabled=true);$('study-map-hint').textContent=`${a.kind==='equation'?'公式比例 '+a.scale.toFixed(2):'主题宽度 '+a.width+'px'} · 松开保存 · Escape 取消`;}
 cleanup(){const a=this.active;if(!a)return;a.clean();a.preview.remove();a.node.style.visibility='';this.map.drag=null;this.map.pressing=null;this.map.deferred=null;this.active=null;this.study.mapTools.suppress=performance.now()+250;$('study-map-hint').textContent='拖动主题调整层级与顺序';return a;}
 cancel(){this.cleanup();this.study.render(this.study.current);this.map.window.schedule();}
 async save(){const a=this.active;if(!a||a.saving)return;if(a.kind==='width'&&Math.abs(a.width-a.p.width)<1||a.kind==='equation'&&Math.abs(a.scale-a.card.mindmap.equation.scale)<.01){this.cancel();return;}a.saving=true;
  try{const set=await api('study.mindmap.topics.update',{setId:a.set.id,expectedRevision:a.set.revision,cardIds:[a.id],patch:a.kind==='equation'?{equation:{latex:a.card.mindmap.equation.latex,scale:a.scale}}:{width:a.width}});this.cleanup();if(this.study.current?.id===set.id){this.study.render(set);this.map.select(a.id);}}
  catch(error){this.cleanup();await this.study.refresh();throw error;}finally{this.map.window.schedule();}
 }
}
