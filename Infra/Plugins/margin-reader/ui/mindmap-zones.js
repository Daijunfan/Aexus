import {$,run,field,showDialog,toast} from './dom.js';
import {descendants} from './study-map-layout.mjs';
export class MindmapZones{
 constructor(studio){
  this.studio=studio;this.study=studio.study;this.map=studio.map;const view=$('study-map-viewport');
  studio.bar.querySelector('.mm-active-tools').insertAdjacentHTML('beforeend','<button id="mm-zone" title="把选中的自由分支圈成区域，可整体移动和折叠">区域</button>');$('mm-zone').onclick=()=>this.create();
  this.map.board.addEventListener('click',e=>{const toggle=e.target.closest('[data-zone-toggle]');if(!toggle&&performance.now()<this.suppress&&e.target.closest('.mm-zone')?.dataset.mmItem===this.lastId){e.preventDefault();e.stopImmediatePropagation();return;}if(toggle){e.preventDefault();e.stopImmediatePropagation();run(()=>this.toggle(toggle.dataset.zoneToggle))();}},true);
  this.map.board.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const toggle=e.target.closest('[data-zone-toggle]');if(toggle){e.preventDefault();e.stopImmediatePropagation();run(()=>this.toggle(toggle.dataset.zoneToggle))();}}},true);
  this.map.board.addEventListener('pointerdown',e=>this.start(e),true);
  view.addEventListener('dblclick',e=>{
   const zone=e.target.closest('.mm-zone');if(!zone||e.target.closest('[data-zone-drag],[data-zone-toggle],[data-zone-resize]')||this.study.cardInk.mode!=='off')return;
   e.preventDefault();e.stopImmediatePropagation();run(async()=>{studio.guard();studio.close();const set=this.study.current,b=$('study-map-world').getBoundingClientRect(),next=await this.study.change('study.note.create',{title:'新主题',zoneId:zone.dataset.mmItem,x:(e.clientX-b.x)/this.map.zoom+(this.map.layout.originX||0),y:(e.clientY-b.y)/this.map.zoom+(this.map.layout.originY||0)},set.revision);const id=next.cards.find(c=>!set.cards.some(old=>old.id===c.id)).id;studio.editTitle(id);})();
  },true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.cancel){e.preventDefault();this.cancel();}},true);window.addEventListener('blur',()=>this.cancel?.());
 }
 create(){
  this.studio.guard();const set=this.study.current,ids=this.studio.ids();if(!ids.length){toast('先选择一个或多个自由主题。');return;}
  showDialog({title:'创建脑图区域',html:field('title','区域名称','区域',{required:true})+'<p class="dialog-note">区域保留原来的主题与层级，可整体移动、折叠及调整外观。请选择独立的自由分支。</p>',onSubmit:async v=>{await this.study.change('study.mindmap.decoration.set',{kind:'zone',cardIds:ids,style:{title:v.title,autoResize:true}},set.revision);}});
 }
 toggle(id){this.studio.guard();const set=this.study.current,item=set.map.mindmap.items.find(i=>i.id===id);return this.study.change('study.mindmap.decoration.set',{decorationId:id,style:{collapsed:!item.style?.collapsed}},set.revision);}
 select(item){this.map.select(null);this.study.advanced.selected=new Set(item.cardIds);this.study.mapTools.selection();}
 start(e){
  const handle=e.target.closest('[data-zone-drag],[data-zone-resize]');if(!handle||e.button!==0||this.active||this.study.cardInk.mode!=='off')return;
  try{this.studio.guard();this.study.inspector.guard();}catch(error){toast(error.message,true);return;}
  e.preventDefault();e.stopImmediatePropagation();this.map.motion.finish();const set=this.study.current,id=handle.dataset.zoneDrag||handle.dataset.zoneResize,box=this.map.layout.decorations.find(i=>i.id===id),item=set.map.mindmap.items.find(i=>i.id===id),resizing=Boolean(handle.dataset.zoneResize);if(!box)return;
  const view=$('study-map-viewport'),ghost=document.createElementNS('http://www.w3.org/2000/svg','svg');ghost.classList.add('mm-zone-gesture');ghost.setAttribute('width',this.map.layout.width);ghost.setAttribute('height',this.map.layout.height);ghost.innerHTML=`<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"/>`;$('study-map-world').append(ghost);const rect=ghost.firstElementChild;
  const family=new Set(item.cardIds.flatMap(id=>[...descendants(set.cards,id)])),nodes=[...this.map.window.nodes].filter(([id])=>family.has(id)).map(([,node])=>[node,node.style.transform]);
  this.active=true;this.map.drag={id:null};view.setPointerCapture(e.pointerId);let dx=0,dy=0;
  const move=event=>{if(event.pointerId!==e.pointerId)return;dx=(event.clientX-e.clientX)/this.map.zoom;dy=(event.clientY-e.clientY)/this.map.zoom;
   rect.setAttribute(resizing?'width':'x',resizing?Math.max(100,box.width+dx):box.x+dx);rect.setAttribute(resizing?'height':'y',resizing?Math.max(100,box.height+dy):box.y+dy);
   if(!resizing)for(const [node]of nodes)node.style.transform=`translate(${dx}px,${dy}px)`;
  };
  const clean=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);this.active=false;this.map.drag=null;this.cancel=null;ghost.remove();for(const [node,transform]of nodes)node.style.transform=transform;if(view.hasPointerCapture(e.pointerId))view.releasePointerCapture(e.pointerId);};
  const cancel=()=>{clean();this.study.render(this.study.current);};this.cancel=cancel;
  const stop=event=>{if(event.pointerId!==e.pointerId)return;move(event);clean();if(Math.hypot(dx,dy)*this.map.zoom<3){this.studio.open('decoration',id);return;}this.suppress=performance.now()+300;this.lastId=id;
   const params=resizing?{decorationId:id,style:{autoResize:false,frame:{x:box.x+(this.map.layout.originX||0),y:box.y+(this.map.layout.originY||0),width:Math.max(100,box.width+dx),height:Math.max(100,box.height+dy)}}}:{decorationId:id,dx,dy};
   run(()=>{if(this.study.current?.id!==set.id)throw Error('学习集已切换，未提交区域调整。');return this.study.change(resizing?'study.mindmap.decoration.set':'study.mindmap.zone.move',params,set.revision);})();
  };
  document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop);document.addEventListener('pointercancel',cancel);
 }
}
