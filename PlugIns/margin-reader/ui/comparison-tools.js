import {$,escape,field,showDialog,closeDialog,run,toast} from './dom.js';
import {api} from './transport.js';
import {ReaderRenderer} from './reader.js';
export class ComparisonTools {
 constructor(tools){
  this.tools=tools;this.generation=0;
  const extra=document.createElement('section');extra.id='compare-extra';extra.hidden=true;extra.className='comparison-extra';
  extra.innerHTML='<header><strong id="compare-extra-title"></strong><button id="compare-extra-previous">‹</button><input id="compare-extra-page" type="number" min="1" aria-label="第三栏页码"><button id="compare-extra-next">›</button><button id="compare-extra-edit">编辑此栏</button><button id="compare-extra-close" aria-label="关闭第三栏">×</button></header><div id="compare-extra-scroll" class="reader-scroll"><div id="compare-extra-surface" class="reading-surface"></div></div>';
  $('compare-pane').after(extra);this.renderer=new ReaderRenderer(run(l=>this.navigate(l)),{surface:$('compare-extra-surface'),scroller:$('compare-extra-scroll')});
  const edit=document.createElement('button');edit.id='compare-edit';edit.textContent='编辑此栏';$('compare-close').before(edit);edit.onclick=run(()=>this.swap(1));
  const attached=document.createElement('button');attached.id='reader-attached';attached.textContent='附属笔记本';$('reader-compare').after(attached);attached.onclick=run(()=>this.notebook());
  $('compare-extra-edit').onclick=run(()=>this.swap(2));$('compare-extra-close').onclick=run(async()=>{await api('reader.comparison.set',{documentId:null,slot:2});await tools.refresh();});
  $('compare-extra-page').onchange=run(()=>this.navigate(this.extraDoc.kind==='pdf'?{page:Number($('compare-extra-page').value)}:{section:Number($('compare-extra-page').value)-1}));
  for(const [id,delta] of [['compare-extra-previous',-1],['compare-extra-next',1]])$(id).onclick=run(()=>this.navigate(this.extraDoc.kind==='pdf'?{page:this.extra.locator.page+delta}:{section:this.extra.locator.section+delta}));
  const saveMediaPosition=()=>{if(this.rendering||!this.extraDoc)return;if(this.extraDoc.kind==='media'&&this.timer)return;clearTimeout(this.timer);this.timer=setTimeout(()=>run(async()=>{this.timer=null;if(!this.extraDoc)return;const locator=this.renderer.currentLocator(this.extraDoc);if(JSON.stringify(locator)===JSON.stringify(this.extra.locator))return;this.extra=await api('reader.comparison.set',{documentId:this.extraDoc.id,locator,slot:2});this.extraDoc.position=locator;this.indicators();})(),this.extraDoc.kind==='media'?2000:400);};$('compare-extra-scroll').addEventListener('scroll',saveMediaPosition,{passive:true});$('compare-extra-scroll').addEventListener('reader-media-position',saveMediaPosition);
  this.resize=new ResizeObserver(()=>{clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>run(()=>this.render(this.settings))(),150);});this.resize.observe($('compare-extra-scroll'));
  for(let slot=1;slot<=2;slot++){
   const bar=document.createElement('div');bar.id='compare-divider-'+slot;bar.className='comparison-divider';bar.hidden=true;bar.tabIndex=0;bar.setAttribute('role','separator');bar.setAttribute('aria-label','调整对照视图比例');
   (slot===1?$('compare-pane'):extra).before(bar);bar.onpointerdown=e=>this.drag(e,slot,bar);
   bar.onkeydown=run(async e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const key=slot===1?'comparisonRatio':'comparisonSecondaryRatio',delta=['ArrowLeft','ArrowUp'].includes(e.key)?-.02:.02;await api('settings.set',{[key]:Math.max(.2,Math.min(.8,(this.settings[key]||.5)+delta))});await tools.refresh();});
  }
 }
 layout(settings){
  const main=$('reader-view').parentElement,active=Boolean(settings?.comparison&&this.tools.getDocument()),third=active&&Boolean(settings.comparisonExtra);
  const direction=settings?.comparisonDirection==='auto'?(main.clientWidth<750?'rows':'columns'):settings?.comparisonDirection||'columns';this.direction=direction;
  const a=settings?.comparisonRatio||.5,b=settings?.comparisonSecondaryRatio||.5;
  main.dataset.comparisonDirection=direction;main.dataset.comparisonCount=third?'3':'2';
  const tracks=third?`${a}fr 4px ${(1-a)*b}fr 4px ${(1-a)*(1-b)}fr`:`${a}fr 4px ${1-a}fr`;
  main.style.gridTemplateColumns=active?(direction==='columns'?tracks:'minmax(0,1fr)'):'';main.style.gridTemplateRows=active?(direction==='rows'?tracks:'minmax(0,1fr)'):'';
  for(const [el,index,visible] of [[$('reader-view'),1,active],[$('compare-divider-1'),2,active],[$('compare-pane'),3,active],[$('compare-divider-2'),4,third],[$('compare-extra'),5,third]]){
   el.style.gridColumn=active?(direction==='columns'?String(index):'1'):'';el.style.gridRow=active?(direction==='rows'?String(index):'1'):'';
   if(el.classList.contains('comparison-divider')){el.hidden=!visible;el.setAttribute('aria-orientation',direction==='columns'?'vertical':'horizontal');}
  }
  $('compare-extra').hidden=!third;$('reader-attached').hidden=this.tools.getDocument()?.kind!=='pdf';
 }
 drag(event,slot,bar){
  if(event.button!==0)return;event.preventDefault();bar.setPointerCapture(event.pointerId);this.dragging=true;bar.dataset.layoutDrag='true';
  const parent=bar.parentElement,box=parent.getBoundingClientRect(),vertical=this.direction==='rows',key=slot===1?'comparisonRatio':'comparisonSecondaryRatio';let value=this.settings[key]||.5;
  const move=e=>{let at=((vertical?e.clientY:e.clientX)-(vertical?box.top:box.left))/(vertical?box.height:box.width);if(slot===2)at=(at-(this.settings.comparisonRatio||.5))/(1-(this.settings.comparisonRatio||.5));value=Math.max(.2,Math.min(.8,at));this.layout({...this.settings,[key]:value});};
  const clean=()=>{this.dragging=false;delete bar.dataset.layoutDrag;bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',end);bar.removeEventListener('pointercancel',cancel);};
  const end=()=>{clean();run(async()=>{await api('settings.set',{[key]:value});await this.tools.refresh();})();};const cancel=()=>{clean();this.layout(this.settings);};
  bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',end,{once:true});bar.addEventListener('pointercancel',cancel,{once:true});
 }
 async render(settings){
  if(!settings)return;this.settings=settings;if(this.dragging)return;this.layout(settings);
  const generation=++this.generation,extra=settings.comparisonExtra;this.extra=extra;
  if(!extra||!settings.comparison||!this.tools.getDocument()){this.key=null;this.extraDoc=null;clearTimeout(this.timer);this.timer=null;await this.renderer.clear();return;}
  const doc=await api('document.get',{id:extra.documentId}),scroll=$('compare-extra-scroll');
  const key=JSON.stringify([extra,doc.sourceVersion,doc.revision,scroll.clientWidth,scroll.clientHeight,settings.fontSize,settings.lineHeight,settings.mediaRate]);if(this.key===key||generation!==this.generation)return;
  this.rendering=true;
  try{doc.position=extra.locator;this.extraDoc=doc;$('compare-extra-title').textContent=doc.title;await this.renderer.show(doc,{...settings,pdfMode:'continuous',pdfZoom:1,pdfFit:'width'});if(generation===this.generation){this.key=key;this.indicators();}}
  finally{if(generation===this.generation)this.rendering=false;}
 }
 indicators(){const d=this.extraDoc;if(!d)return;const n=d.kind==='pdf'?d.position.page:d.position.section+1,total=d.kind==='pdf'?d.pageCount:d.sectionCount;$('compare-extra-page').value=n;$('compare-extra-page').max=total;$('compare-extra-previous').disabled=n<=1;$('compare-extra-next').disabled=n>=total;}
 async navigate(locator){if(!this.extraDoc)return;this.extra=await api('reader.comparison.set',{documentId:this.extraDoc.id,locator,slot:2});await this.tools.refresh();}
 async swap(slot){
  const current=this.tools.getDocument(),settings=await api('settings.get'),other=slot===2?settings.comparisonExtra:settings.comparison;if(!current||!other)return;
  await this.tools.prepareNavigation();await api('reader.comparison.set',{documentId:current.id,locator:current.position,slot});await api('reader.position.set',{id:other.documentId,locator:other.locator});await this.tools.syncNavigation();
 }
 async dialog(){
  const current=this.tools.getDocument();if(!current)return;const settings=await api('settings.get'),tree=await api('fs.tree',{depth:100}),files=[];
  const walk=rows=>rows.forEach(e=>e.kind==='file'&&e.readable?files.push(e):e.children&&walk(e.children));walk(tree.entries);
  const saved=await api('reader.comparisons.list',{documentId:current.id,includeDeleted:true}),docs=(await api('document.list')).documents;
  const pathOf=id=>docs.find(d=>d.id===id)?.path;
  showDialog({title:'双文 / 三文对照',html:field('path','第二文档',pathOf(settings.comparison?.documentId)||current.path,{choices:files.map(f=>[f.path,f.path])})+field('third','第三文档（可选）',pathOf(settings.comparisonExtra?.documentId)||'',{choices:[['','仅两个文档'],...files.map(f=>[f.path,f.path])]})+field('direction','布局',settings.comparisonDirection||'columns',{choices:[['auto','自动'],['columns','左右'],['rows','上下']]})+field('ratio','主文档比例 (%)',(settings.comparisonRatio||.5)*100,{type:'number',min:20,max:80})+field('title','保存当前对照为（可选）')+saved.views.map(v=>`<div class="saved-view-row"><button type="button" data-view-open="${v.id}" ${v.deletedAt?'disabled':''}>${escape(v.title)}${v.sources.some(s=>!s.available||s.sourceChanged)?' · 原文需要检查':''}</button><button type="button" data-view-remove="${v.id}">${v.deletedAt?'恢复':'移除'}</button></div>`).join(''),submit:'打开对照',onSubmit:async v=>{
   await this.tools.prepareNavigation();const second=await api('document.open',{path:v.path,activate:false});await api('reader.comparison.set',{documentId:second.id,locator:settings.comparison?.documentId===second.id?settings.comparison.locator:second.position});
   if(v.third){const third=await api('document.open',{path:v.third,activate:false});await api('reader.comparison.set',{documentId:third.id,locator:settings.comparisonExtra?.documentId===third.id?settings.comparisonExtra.locator:third.position,slot:2});}else await api('reader.comparison.set',{documentId:null,slot:2});
   await api('settings.set',{comparisonDirection:v.direction,comparisonRatio:Number(v.ratio)/100});
   if(v.title.trim())await api('reader.comparisons.save',{title:v.title});await this.tools.refresh();
  },afterOpen:()=>{
   $('dialog-fields').querySelector('[name=ratio]').step='any';
   $('dialog-fields').querySelectorAll('[data-view-open]').forEach(b=>b.onclick=run(async()=>{await this.tools.prepareNavigation();await api('reader.comparisons.open',{viewId:b.dataset.viewOpen});closeDialog();await this.tools.syncNavigation();}));
   $('dialog-fields').querySelectorAll('[data-view-remove]').forEach(b=>b.onclick=run(async()=>{const v=saved.views.find(v=>v.id===b.dataset.viewRemove);await api('reader.comparisons.update',{viewId:v.id,expectedRevision:v.revision,deleted:!v.deletedAt});closeDialog();await this.dialog();}));
  }});
 }
 async notebook(){
  const doc=this.tools.getDocument();if(doc?.kind!=='pdf')return;
  if(doc.attachedTo){
   showDialog({title:'附属笔记本 · '+doc.title,html:'<p class="dialog-note">笔迹保存对应原文位置。解除绑定保留笔记本和已保存的来源信息。</p><button type="button" id="notebook-source">回到对应原文</button><button type="button" id="notebook-unlink">解除附属关系</button>',onSubmit:null,afterOpen:()=>{
    $('notebook-source').onclick=run(async()=>{await this.tools.prepareNavigation();const target=await api('reader.notebook.source',{id:doc.id,page:doc.position.page});await api('reader.comparison.set',{documentId:doc.id,locator:doc.position});await api('reader.position.set',{id:target.documentId,locator:target.locator});closeDialog();await this.tools.syncNavigation();});
    $('notebook-unlink').onclick=run(async()=>{await api('reader.notebook.unlink',{id:doc.id,expectedRevision:doc.revision});closeDialog();await this.tools.syncNavigation();});
   }});return;
  }
  const saved=await api('reader.comparisons.list',{documentId:doc.id});
  showDialog({title:'附属笔记本',html:saved.views.filter(v=>v.notebookId).map(v=>`<div class="saved-view-row"><button type="button" data-open-notebook="${v.id}">${escape(v.title)}</button></div>`).join('')+field('path','新建 PDF 路径',doc.path.replace(/\.pdf$/i,'-notes.pdf'),{required:true})+field('title','标题',(doc.title+' · 笔记本').slice(0,200))+field('paper','纸张','lined',{choices:[['plain','空白'],['lined','横线'],['grid','方格'],['dots','点阵']]})+`<p class="dialog-note">生成 ${doc.pageCount} 页笔记本并保存对照关系。原文保持不变；在对照栏点击“编辑此栏”即可摘录和书写。</p>`,submit:'新建并绑定',onSubmit:async v=>{
   await this.tools.prepareNavigation();const study=this.tools.getStudy().current;await api('reader.notebook.create',{sourceId:doc.id,expectedSourceVersion:doc.sourceVersion,path:v.path,title:v.title,paper:v.paper,...(study?{setId:study.id,expectedRevision:study.revision}:{}),activate:true});await this.tools.syncNavigation();
  },afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-open-notebook]').forEach(b=>b.onclick=run(async()=>{await this.tools.prepareNavigation();await api('reader.comparisons.open',{viewId:b.dataset.openNotebook});closeDialog();await this.tools.syncNavigation();}));}});
 }
}
