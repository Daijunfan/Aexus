import {MindmapFilter} from './mindmap-filter.js';
import {$,escape,field,showDialog,run} from './dom.js';
import {api} from './transport.js';
const area=(name,label,value='')=>`<label class="dialog-field"><span>${label}</span><textarea name="${name}">${escape(value)}</textarea></label>`;
export class StudyWorkbench{
 constructor(map){
  this.map=map;this.study=map.study;
  const tools=document.createElement('div');tools.className='study-workbench-tools';
  tools.innerHTML='<div class="study-edit-tools"><button id="study-add-note" title="新建主题">＋ 主题</button><button id="study-undo" title="撤销 · ⌘ Z" aria-label="撤销">↶</button><button id="study-redo" title="重做 · ⌘ ⇧ Z" aria-label="重做">↷</button></div><button id="map-find-toggle" title="查找主题 · ⌘ F" aria-label="查找主题">查找</button><div class="study-card-filters" hidden><input id="study-card-search" type="search" placeholder="查找主题与笔记…" aria-label="查找主题"><select id="study-color-filter" aria-label="主题颜色"><option value="">全部颜色</option></select><select id="study-tag-filter" aria-label="主题标签"><option value="">全部标签</option></select><button id="map-find-close" aria-label="关闭主题查找">×</button></div>';
  $('study-map-viewport').before(tools);this.tools=tools;this.filterView=new MindmapFilter(this);map.filterView=this.filterView;
  $('study-add-note').onclick=run(()=>this.study.mindmapStudio.add('after'));
  $('study-undo').onclick=run(()=>this.study.change('study.undo',{}));$('study-redo').onclick=run(()=>this.study.change('study.redo',{}));
  $('map-find-toggle').onclick=()=>this.find();$('map-find-close').onclick=()=>{tools.querySelector('.study-card-filters').hidden=true;for(const id of ['study-card-search','study-color-filter','study-tag-filter'])$(id).value='';run(()=>this.filter())();};
  for(const id of ['study-card-search','study-color-filter','study-tag-filter'])$(id).addEventListener('input',()=>{clearTimeout(this.timer);this.timer=setTimeout(run(()=>this.filter()),100);});
  document.addEventListener('keydown',e=>{
   if(!this.study.current||$('dialog').open||e.target.closest('input,textarea,select,[contenteditable=true]')||!(e.metaKey||e.ctrlKey))return;
   if(e.key.toLowerCase()==='z'){e.preventDefault();if(this.study.current.history?.[e.shiftKey?'canRedo':'canUndo'])run(()=>this.study.change(e.shiftKey?'study.redo':'study.undo',{}))();}
   if(e.key.toLowerCase()==='f'&&(this.map.board.contains(e.target)||!$('study-home-map').hidden&&!this.study.getDocument())){e.preventDefault();this.find();}
  });
 }
 find(){this.tools.querySelector('.study-card-filters').hidden=false;$('study-card-search').focus();}
 render(set){
  const previous=this.set;this.set=set;this.map.board.dataset.view='map';
  if(previous?.id!==set.id){this.filtered=null;for(const id of ['study-card-search','study-color-filter','study-tag-filter'])$(id).value='';}
  $('study-undo').disabled=!set.history?.canUndo;$('study-redo').disabled=!set.history?.canRedo;
  const color=$('study-color-filter').value,tag=$('study-tag-filter').value;
  $('study-color-filter').innerHTML='<option value="">全部颜色</option>'+this.study.colors.map(([v,t])=>`<option value="${escape(v)}">${escape(t)}</option>`).join('');$('study-color-filter').value=color;
  $('study-tag-filter').innerHTML='<option value="">全部标签</option>'+[...new Set(set.cards.flatMap(c=>c.tags||[]))].sort().map(t=>`<option value="${escape(t)}">${escape(t)}</option>`).join('');$('study-tag-filter').value=tag;
  const active=Boolean($('study-card-search').value||color||tag);this.filterView.update(this.filtered||[],active);
  if(active&&previous?.revision!==set.revision)run(()=>this.filter())();
 }
 async filter(){
  const set=this.study.current;if(!set)return;const serial=this.serial=(this.serial||0)+1;
  const query=$('study-card-search').value,color=$('study-color-filter').value,tag=$('study-tag-filter').value;this.queryKey=JSON.stringify([set.id,query,color,tag]);
  const data=await api('study.cards.query',{setId:set.id,query,...(color?{color}:{}),...(tag?{tag}:{})});
  if(this.serial!==serial||this.study.current?.id!==set.id)return;this.filtered=data.cards;this.filterView.update(data.cards,Boolean(query||color||tag));this.map.window.schedule();
 }
 reveal(){}
 create(parentId){return this.study.mindmapStudio.add(parentId?'child':'after');}
 edit(card){
  const set=this.study.current;showDialog({title:'编辑主题内容',html:field('title','主题',card.title,{required:true})+area(card.source?'editedText':'text',card.source?'摘录文字':'内容',card.editedText??card.text)+area('note','备注',card.note)+field('tags','标签',(card.tags||[]).join(', ')),onSubmit:v=>this.study.change('study.card.update',{cardId:card.id,...v,tags:v.tags.split(/[,，]/).map(s=>s.trim()).filter(Boolean)},set.revision)});
 }
 links(card){return this.study.content.links(card);}
}
