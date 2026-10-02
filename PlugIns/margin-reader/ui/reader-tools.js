import { $, escape, field, showDialog, run, closeDialog } from './dom.js';
import { api } from './transport.js';
import { ReaderRenderer } from './reader.js';
import { PageLayout } from './page-layout.js';
import { ComparisonTools } from './comparison-tools.js';
export class ReaderTools {
 constructor(options){
  Object.assign(this,options);this.tabDocs=new Map();this.renderGeneration=0;
  const bar=document.createElement('div');bar.id='document-tabs';bar.setAttribute('aria-label','已打开的文档');$('reader-view').prepend(bar);
  const buttons=document.createElement('span');buttons.className='reader-extra-tools';buttons.innerHTML='<button id="reader-compare">对照</button><button id="reader-page-tools">页面</button><button id="reader-notebook">笔记本</button>';$('search-document').before(buttons);
  this.pageLayout=new PageLayout(this);
  $('reader-page-tools').onclick=()=>this.pageTools();$('reader-notebook').onclick=()=>this.notebook();$('reader-compare').onclick=run(()=>this.compareDialog());
  const compare=document.createElement('section');compare.id='compare-pane';compare.hidden=true;compare.innerHTML='<header><strong id="compare-title"></strong><button id="compare-previous">‹</button><input id="compare-page" type="number" min="1" aria-label="对照文档页码"><span id="compare-total"></span><button id="compare-next">›</button><button id="compare-close" aria-label="关闭对照">×</button></header><div id="compare-scroll" class="reader-scroll"><div id="compare-surface" class="reading-surface"></div></div>';$('reader-view').after(compare);
  this.compareRenderer=new ReaderRenderer(run(locator=>this.compareNavigate(locator)),{surface:$('compare-surface'),scroller:$('compare-scroll')});
  $('compare-close').onclick=run(async()=>{clearTimeout(this.timer);this.timer=null;this.comparing=true;this.compareDoc=null;this.comparison=null;await api('reader.comparison.set',{documentId:null});await this.refresh();});
  $('compare-page').onchange=run(()=>this.compareNavigate(this.compareDoc.kind==='pdf'?{page:Number($('compare-page').value)}:{section:Number($('compare-page').value)-1}));
  $('compare-previous').onclick=run(()=>this.step(-1));$('compare-next').onclick=run(()=>this.step(1));
  const saveComparison=()=>{if(this.comparing||!this.compareDoc)return;if(this.compareDoc.kind==='media'&&this.timer)return;clearTimeout(this.timer);this.timer=setTimeout(()=>run(async()=>{this.timer=null;if(!this.compareDoc)return;const locator=this.compareRenderer.currentLocator(this.compareDoc);if(JSON.stringify(locator)===JSON.stringify(this.comparison?.locator))return;this.comparison=await api('reader.comparison.set',{documentId:this.compareDoc.id,locator});this.compareDoc.position=locator;this.compareIndicators();})(),this.compareDoc.kind==='media'?2000:400);};$('compare-scroll').addEventListener('scroll',saveComparison,{passive:true});$('compare-scroll').addEventListener('reader-media-position',saveComparison);
  this.resize=new ResizeObserver(()=>{clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>run(()=>this.renderCompare())(),150);});this.resize.observe($('compare-pane'));
  this.comparisons=new ComparisonTools(this);
 }
 async refresh(){
  const settings=await api('settings.get'),current=this.getDocument();
  const docs=(await api('document.list',{ids:settings.openDocuments||[]})).documents;
  if(this.getDocument()?.id!==current?.id)return;
  $('document-tabs').innerHTML=docs.filter(Boolean).map(d=>`<span class="document-tab ${d.id===current?.id?'active':''}"><button data-open="${d.id}" title="${escape(d.path)}">${escape(d.title)}</button><button data-close="${d.id}" aria-label="关闭文档标签：${escape(d.title)}">×</button></span>`).join('');
  for(const d of docs.filter(Boolean))this.tabDocs.set(d.id,d);
  $('document-tabs').querySelectorAll('[data-open]').forEach(b=>b.onclick=run(()=>this.openDocument(this.tabDocs.get(b.dataset.open).path)));
  $('document-tabs').querySelectorAll('[data-close]').forEach(b=>b.onclick=run(async()=>{const remaining=await api('reader.tabs.close',{id:b.dataset.close});if(this.getDocument()?.id===b.dataset.close){if(remaining.length){const d=await api('document.get',{id:remaining.at(-1)});await this.openDocument(d.path);}else await this.closeDocument();}await this.refresh();}));
  $('reader-page-tools').hidden=current?.kind!=='pdf';$('reader-layout').hidden=current?.kind!=='pdf';
  this.settings=settings;this.comparison=settings.comparison;await this.renderCompare();await this.comparisons.render(settings);
 }
 async compareDialog(){return this.comparisons.dialog();}
 async renderCompare(){
  const generation=++this.renderGeneration,comparison=this.comparison,active=Boolean(comparison&&this.getDocument());$('compare-pane').hidden=!active;$('reader-view').parentElement.classList.toggle('comparing',active);
  if(!active){clearTimeout(this.timer);this.timer=null;this.compareDoc=null;this.compareKey=null;await this.compareRenderer.clear();return;}
  this.comparing=true;
  try{const settings=await api('settings.get'),metadata=(await api('document.list',{ids:[comparison.documentId]})).documents[0];if(!metadata)throw Error('对照文档不可用');const key=JSON.stringify([comparison,metadata.sourceVersion,metadata.revision,settings.theme,settings.fontSize,settings.lineHeight,settings.mediaRate,$('compare-scroll').clientWidth,$('compare-scroll').clientHeight]);if(this.compareKey===key)return;const doc=await api('document.get',{id:comparison.documentId});if(generation!==this.renderGeneration)return;doc.position=comparison.locator;this.compareDoc=doc;$('compare-title').textContent=doc.title;await this.compareRenderer.show(doc,{...await api('settings.get'),pdfMode:'continuous',pdfZoom:1,pdfFit:'width'});if(generation===this.renderGeneration)this.compareKey=key;this.compareIndicators();}finally{if(generation===this.renderGeneration)this.comparing=false;}
 }
 compareIndicators(){const d=this.compareDoc;if(!d)return;const n=d.kind==='pdf'?d.position.page:d.position.section+1,total=d.kind==='pdf'?d.pageCount:d.sectionCount;$('compare-page').value=n;$('compare-page').max=total;$('compare-total').textContent='/ '+total;$('compare-previous').disabled=n<=1;$('compare-next').disabled=n>=total;}
 async compareNavigate(locator){this.comparison=await api('reader.comparison.set',{documentId:this.compareDoc.id,locator});await this.renderCompare();}
 step(delta){const d=this.compareDoc;return this.compareNavigate(d.kind==='pdf'?{page:d.position.page+delta}:{section:d.position.section+delta});}
 notebook(){showDialog({title:'新建空白笔记本',html:field('path','名称','我的笔记本.pdf',{required:true})+field('pages','页数',12,{type:'number',min:1,max:500})+field('paper','纸张','lined',{choices:[['plain','空白'],['lined','横线'],['grid','方格']]}),submit:'创建',onSubmit:async v=>{const d=await api('pdf.compose',{path:v.path,pages:Array.from({length:Number(v.pages)},()=>({blank:true,paper:v.paper})),activate:false});await this.created(d);}});}
 pageTools(){
  const doc=this.getDocument();if(doc?.kind!=='pdf')return;
  let order=Array.from({length:doc.pageCount},(_,i)=>i+1);
  showDialog({title:'页面整理 · 保留原件',html:field('path','另存为',doc.path.replace(/\.pdf$/i,'-整理.pdf'),{required:true})+field('pages','页码顺序',String(doc.position.page),{help:'逗号分隔；支持范围，例如 1-5, 8, 7。空白页用 0。'})+field('appendId','追加已打开文档','',{choices:[['','不追加'],...[...this.tabDocs.values()].filter(d=>d.kind==='pdf'&&d.id!==doc.id).map(d=>[d.id,d.title])]})+field('action','操作','compose',{choices:[['compose','生成重组文档'],['fold','折叠选中页'],['unfold','展开选中页']]})+field('rotation','顺时针旋转','0',{choices:['0','90','180','270']})+field('crop','裁剪边距（%）','0',{type:'number',min:0,max:40})+'<div class="page-manager-list" id="page-manager-list"></div><button type="button" id="page-all">使用全部页面</button>',submit:'生成整理后的文档',onSubmit:async v=>{
   const selected=[];for(const token of v.pages.split(/[,，]/)){const value=token.trim();if(/^\d+$/.test(value))selected.push(Number(value));else if(/^\d+-\d+$/.test(value)){const [a,b]=value.split('-').map(Number);if(Math.abs(b-a)>2000)throw Error('页码范围过大');for(let n=a;a<=b?n<=b:n>=b;n+=a<=b?1:-1)selected.push(n);}else throw Error('请输入页码或页码范围');}
   if(v.action!=='compose'){const folded=new Set(doc.foldedPages||[]);for(const page of selected)v.action==='fold'?folded.add(page):folded.delete(page);await api('document.fold',{id:doc.id,expectedRevision:doc.revision,pages:[...folded]});await this.openDocument(doc.path);return;}
   const margin=Number(v.crop)/100;if(!Number.isFinite(margin)||margin<0||margin>.4)throw Error('裁剪边距必须在 0–40%');
   const pages=selected.map(page=>page===0?{blank:true}:{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page,rotation:Number(v.rotation),...(margin?{crop:{x:margin,y:margin,width:1-2*margin,height:1-2*margin}}:{})});
   if(v.appendId){const append=await api('document.get',{id:v.appendId});for(let n=1;n<=append.pageCount;n++)pages.push({documentId:append.id,expectedSourceVersion:append.sourceVersion,page:n});}
   const d=await api('pdf.compose',{path:v.path,pages,activate:false});await this.created(d);
  },afterOpen:()=>{$('page-all').onclick=()=>{$('dialog-fields').querySelector('[name=pages]').value=order.join(',');$('dialog-fields').dispatchEvent(new Event('input',{bubbles:true}));};$('page-manager-list').innerHTML='<div id="page-thumbnails" class="page-thumbnails"></div><div><button type="button" id="thumb-prev">上一组</button><span id="thumb-range"></span><button type="button" id="thumb-next">下一组</button></div><p class="dialog-note">重排页码即可重组；省略页码即可移除对应页。旋转和裁剪应用到本次选择的页面，新文档可继续摘录和手写。</p>';let start=0;const show=async()=>{const root=$('page-thumbnails');root.replaceChildren();$('thumb-range').textContent=`${start+1}–${Math.min(start+8,doc.pageCount)} / ${doc.pageCount}`;$('thumb-prev').disabled=start===0;$('thumb-next').disabled=start+8>=doc.pageCount;for(let n=start+1;n<=Math.min(start+8,doc.pageCount);n++){const button=document.createElement('button');button.type='button';button.textContent=String(n);button.onclick=()=>{const field=$('dialog-fields').querySelector('[name=pages]');field.value=field.value?field.value+','+n:String(n);field.dispatchEvent(new Event('input',{bubbles:true}));};root.append(button);run(async()=>{const preview=await api('document.preview',{path:doc.path,expectedVersion:doc.sourceVersion,page:n});if(!button.isConnected||preview.kind!=='image')return;const img=document.createElement('img');img.src=`data:${preview.mimeType};base64,${preview.contentBase64}`;img.alt=`第 ${n} 页`;button.prepend(img);})();}};$('thumb-prev').onclick=()=>{start=Math.max(0,start-8);show();};$('thumb-next').onclick=()=>{start+=8;show();};show();}});
 }
}
