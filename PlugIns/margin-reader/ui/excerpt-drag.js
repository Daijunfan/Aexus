import {$,run,toast} from './dom.js';
import {api} from './transport.js';
// Drag carries only an opaque capture ID. The original selection stays in this
// window and is committed by the same headless excerpt operation as color-save.
export class ExcerptDrag{
 constructor(excerpts){
  this.excerpts=excerpts;this.study=excerpts.study;
  excerpts.palette.insertAdjacentHTML('beforeend','<button id="excerpt-drag-handle" type="button" draggable="true" title="拖到脑图主题上成为子主题，拖到空白处成为自由主题；保留原文链接">拖到脑图 ↗</button>');
  document.addEventListener('dragstart',e=>{
   if(e.target.closest?.('#excerpt-drag-handle'))this.start(e,excerpts.draft);
   else if(e.composedPath().includes($('reader-scroll'))){excerpts.readSelection();this.start(e,excerpts.draft);}
  },true);
  const viewport=$('study-map-viewport');
  viewport.addEventListener('dragover',e=>{
   if(!this.active)return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='copy';this.study.map.clearDrop();
   const id=this.study.map.window.topicAt(e),node=this.study.map.window.nodes.get(id);node?.classList.add('study-drop-target');
   $('study-map-hint').textContent=id?'松开创建子主题并保留原文链接':'松开在这里创建独立摘录主题';
  },true);
  viewport.addEventListener('drop',e=>{
   if(!this.active)return;e.preventDefault();e.stopImmediatePropagation();
   const draft=this.active;this.clear();
   run(async()=>{
    if(this.study.current?.id!==draft.setId)throw Error('学习集已切换，请重新选择原文。');
    this.study.mindmapStudio.guard();this.study.inspector.guard();
    const parentId=this.study.map.window.topicAt(e)||null,box=$('study-map-world').getBoundingClientRect(),layout=this.study.map.layout;
    const zone=e.target.closest('.mm-zone')?.dataset.mmItem;
    const placement=parentId?{parentId}:{parentId:null,x:(e.clientX-box.left)/this.study.map.zoom+(layout.originX||0),y:(e.clientY-box.top)/this.study.map.zoom+(layout.originY||0),...(zone?{zoneId:zone}:{})};
    this.excerpts.busy=true;
    try{
     const result=await api('study.card.create',{...draft,...placement,color:this.study.current.captureSettings?.color||'yellow',...(this.study.getPassword?.()?{password:this.study.getPassword()}: {})});
     this.excerpts.busy=false;this.excerpts.hide();window.getSelection()?.removeAllRanges();this.study.getRenderer().shadow?.getSelection?.()?.removeAllRanges();
     if(this.study.current?.id===draft.setId){await this.study.refresh(result.card.id);this.study.map.center(result.card.id);}
     toast('摘录已加入脑图，原文链接与图片已保存');
    }finally{this.excerpts.busy=false;}
   })();
  },true);
  viewport.addEventListener('dragleave',e=>{if(this.active&&!viewport.contains(e.relatedTarget))this.study.map.clearDrop();});
  document.addEventListener('dragend',()=>this.clear());document.addEventListener('keydown',e=>{if(e.key==='Escape')this.clear();});window.addEventListener('blur',()=>this.clear());
 }
 start(event,draft){
  if(!draft?.setId||this.excerpts.busy||this.study.current?.id!==draft.setId)return;
  this.active=structuredClone(draft);event.dataTransfer.setData('application/x-margin-reader-excerpt',draft.captureId);event.dataTransfer.effectAllowed='copy';
 }
 clear(){if(this.active){this.active=null;this.study.map.clearDrop();}}
}
