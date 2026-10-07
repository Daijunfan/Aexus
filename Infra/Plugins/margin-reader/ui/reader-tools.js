import {$,escape,run} from './dom.js';
import {api} from './transport.js';
// Basic reader: document tabs only. Comparison/notebook dashboards are retired.
export class ReaderTools{
 constructor(options){Object.assign(this,options);this.serial=0;const bar=document.createElement('div');bar.id='document-tabs';bar.setAttribute('aria-label','已打开的文档');$('reader-view').prepend(bar);}
 async refresh(){
  const serial=++this.serial,current=this.getDocument(),settings=await api('settings.get');const docs=(await api('document.list',{ids:settings.openDocuments||[]})).documents.filter(Boolean);
  if(serial!==this.serial||this.getDocument()?.id!==current?.id)return;
  const tabs=$('document-tabs');tabs.innerHTML=docs.map(d=>`<span class="document-tab ${d.id===current?.id?'active':''}"><button data-open="${d.id}" title="${escape(d.path)}">${escape(d.title)}</button><button data-close="${d.id}" aria-label="关闭文档标签：${escape(d.title)}">×</button></span>`).join('');tabs.hidden=docs.length<2;
  for(const b of tabs.querySelectorAll('[data-open]'))b.onclick=run(()=>this.openDocument(docs.find(d=>d.id===b.dataset.open).path));
  for(const b of tabs.querySelectorAll('[data-close]'))b.onclick=run(async()=>{const remaining=await api('reader.tabs.close',{id:b.dataset.close});if(this.getDocument()?.id===b.dataset.close){if(remaining.length){const d=await api('document.get',{id:remaining.at(-1)});await this.openDocument(d.path);}else await this.closeDocument();}await this.refresh();});
 }
}
