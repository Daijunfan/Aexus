import {$,icon,run,field,showDialog,toast} from './dom.js';
export class MindmapActions{
 constructor(studio){
  this.studio=studio;this.study=studio.study;const tools=studio.bar.querySelector('.mm-active-tools');
  tools.insertAdjacentHTML('beforeend',`<button id="mm-delete-topic" title="删除所选主题，保留子主题；Shift 点击删除整支。可撤销。" aria-label="删除所选主题" disabled>×</button><button id="mm-collapse-tools" title="展开、折叠与显示层级">${icon('list')}<span>展开 / 折叠</span></button><button id="mm-arrange-tools">对齐 / 分布</button><button id="mm-design-library">我的设计</button>`);
  $('mm-delete-topic').onclick=run(e=>this.study.map.remove(null,e.shiftKey?'subtree':'promote'));
  $('mm-collapse-tools').onclick=()=>this.collapse();$('mm-arrange-tools').onclick=()=>this.arrange();$('mm-design-library').onclick=()=>studio.designs.open();
  tools.insertAdjacentHTML('beforeend','<button id="mm-organize" title="分组、按来源整理、排序、子脑图与文本拆分">整理主题</button><button id="mm-source-links" title="搜索本地主题、原文回链与跨学习集关联">主题与回链</button><button id="mm-capture-settings" title="设置摘录默认位置、颜色、标签和标注方式">摘录设置</button><button id="mm-content-export" title="导出 Markdown、大纲、Word 或保留原文的加密学习集包">导出内容 / 完整包</button>');
  $('mm-organize').onclick=()=>this.study.organization.actions();$('mm-source-links').onclick=()=>this.study.content.find();$('mm-capture-settings').onclick=()=>this.study.organization.captureSettings();$('mm-content-export').onclick=()=>this.study.exporter.export();
  tools.insertAdjacentHTML('beforeend','<button id="mm-keyword-links" title="按本地主题标题和别名自动显示相关词条与回链">关键词关联</button>');$('mm-keyword-links').onclick=run(()=>this.study.content.dictionary());
  const view=$('study-map-viewport');
  view.addEventListener('dblclick',e=>{if(!studio.enabled||e.target.closest('.study-card,button,input,select,[data-link-id],[data-mm-item],#mindmap-overview')||this.study.cardInk.mode!=='off'||this.study.current.map.focusId)return;e.preventDefault();run(async()=>{studio.guard();const b=$('study-map-world').getBoundingClientRect(),set=this.study.current,x=(e.clientX-b.x)/studio.map.zoom+(studio.map.layout.originX||0),y=(e.clientY-b.y)/studio.map.zoom+(studio.map.layout.originY||0),next=await this.study.change('study.note.create',{title:'自由主题',x,y},set.revision);const id=next.cards.find(c=>!set.cards.some(old=>old.id===c.id))?.id;if(id)studio.editTitle(id);})();});
 }
 collapse(){
  this.studio.guard();const set=this.study.current,selected=this.studio.ids();
  showDialog({title:'展开与折叠',html:field('scope','范围','all',{choices:[['all','整张导图'],...(selected.length?[['selected','所选分支']]:[])]})+field('level','显示层级','all',{choices:[['all','全部展开'],['0','仅中心主题'],['1','显示主分支'],['2','显示两层子主题'],['3','显示三层子主题'],['4','显示四层子主题']]}),onSubmit:async v=>{const rootIds=v.scope==='selected'?selected:set.cards.filter(c=>!c.parentId).map(c=>c.id);await this.study.change('study.mindmap.collapse',{cardIds:rootIds,level:v.level==='all'?-1:Number(v.level)},set.revision);}});
 }
 arrange(){
  this.studio.guard();const set=this.study.current,ids=this.studio.ids();if(!ids.length){toast('先选择需要对齐的自由主题或主分支。');return;}
  showDialog({title:'主题对齐与分布',html:field('action','操作','left',{choices:[['left','左对齐'],['right','右对齐'],['top','顶端对齐'],['bottom','底端对齐'],['center-x','垂直居中对齐'],['center-y','水平居中对齐'],['distribute-x','横向均匀分布'],['distribute-y','纵向均匀分布'],['reset','恢复自动位置']]})+'<p class="dialog-note">自由主题可直接对齐；主分支需要开启“自由调整主分支”。子树整体随所属主题移动，原文定位不变。</p>',onSubmit:v=>this.study.change('study.mindmap.arrange',{cardIds:ids,action:v.action},set.revision)});
 }
}
