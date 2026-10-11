import {$,run} from './dom.js';
export class MindmapFilter{
 constructor(workbench){
  this.workbench=workbench;this.map=workbench.map;this.study=workbench.study;this.ids=[];this.hits=new Set();
  const bar=document.createElement('div');bar.id='mm-filter-nav';bar.className='mm-filter-nav';bar.hidden=true;bar.innerHTML='<span id="mm-filter-status" role="status"></span><button id="mm-filter-previous" title="上一个匹配主题">↑</button><button id="mm-filter-next" title="下一个匹配主题">↓</button><button id="mm-filter-clear">清除筛选</button>';$('study-map-viewport').before(bar);this.bar=bar;
  $('mm-filter-previous').onclick=run(()=>this.go(-1));$('mm-filter-next').onclick=run(()=>this.go(1));$('mm-filter-clear').onclick=()=>{for(const id of ['study-card-search','study-color-filter','study-tag-filter'])$(id).value='';run(()=>workbench.filter())();};
  $('study-card-search').addEventListener('keydown',e=>{if(e.key==='Enter'&&this.active){e.preventDefault();run(()=>this.go(e.shiftKey?-1:1))();}});
 }
 update(cards,active){
  this.active=Boolean(active&&this.study.current?.map?.mindmap?.enabled&&(this.study.current.view||'map')==='map');this.bar.hidden=!this.active;const previous=this.ids[this.index];this.ids=(cards||[]).map(c=>c.id);this.hits=new Set(this.ids);this.index=this.ids.indexOf(previous);this.paint();
  $('mm-filter-status').textContent=this.active?`${this.ids.length} 个匹配主题 · 保留完整导图结构`:'';for(const key of ['next','previous'])$('mm-filter-'+key).disabled=!this.ids.length;
 }
 paint(){
  for(const [id,node]of this.map.window.nodes){node.classList.toggle('mm-filter-match',this.active&&this.hits.has(id));node.classList.toggle('mm-filter-muted',this.active&&!this.hits.has(id));}
  this.map.board.classList.toggle('mm-filtering',Boolean(this.active));
 }
 async go(step){
  if(!this.ids.length)return;this.index=(this.index+step+this.ids.length)%this.ids.length;const id=this.ids[this.index],position=this.map.layout.positions.get(id);
  if(!position){
   const set=this.study.current,byId=new Map(set.cards.map(c=>[c.id,c])),parents=[];let p=byId.get(id)?.parentId;while(p){const card=byId.get(p);if(!card)break;if(card.collapsed)parents.push(card.id);p=card.parentId;}
   // The explicit next-result action expands only collapsed ancestors, through
   // the same reversible public command used by the topic collapse buttons.
   for(const parent of parents.reverse())await this.study.change('study.card.update',{cardId:parent,collapsed:false});
  }
  if(!this.map.layout.positions.has(id))await this.map.focus(id);this.index=this.ids.indexOf(id);this.map.select(id);this.map.center(id);this.map.window.schedule();$('mm-filter-status').textContent=`${this.index+1} / ${this.ids.length} · ${this.study.current.cards.find(c=>c.id===id)?.title||''}`;
 }
}
