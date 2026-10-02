import {$,escape,icon,run,bytesLabel} from './dom.js';
import {LibraryPreviews} from './library-previews.js';

export class StudyDocuments {
  constructor(study){
    this.study=study;this.previews=new LibraryPreviews();this.settings={};
    const tools=document.createElement('div');tools.className='study-document-heading';
    tools.innerHTML=`<span>学习资料 <small id="study-document-total"></small></span><div class="view-switch" role="group" aria-label="学习资料视图"><button id="study-documents-grid" aria-label="学习资料缩略图视图" title="缩略图">${icon('grid')}</button><button id="study-documents-list" aria-label="学习资料列表视图" title="列表">${icon('list')}</button></div>`;
    $('study-documents').before(tools);this.tools=tools;
    for(const mode of ['grid','list'])$('study-documents-'+mode).onclick=run(()=>study.setSettings({studyDocumentsView:mode}));
  }
  apply(settings){this.settings=settings;if(this.study.current)this.render(this.study.current);}
  render(set){
    const root=$('study-documents'),mode=this.settings.studyDocumentsView||'grid';
    this.tools.hidden=!set.documents.length;$('study-document-total').textContent=String(set.documents.length);
    for(const m of ['grid','list']){$('study-documents-'+m).classList.toggle('active',mode===m);$('study-documents-'+m).setAttribute('aria-pressed',String(mode===m));}
    const key=JSON.stringify([set.id,mode,set.documents]);if(key===this.key)return;this.key=key;
    root.dataset.view=mode;
    root.innerHTML=set.documents.map(d=>`<article class="study-document" data-document-id="${d.id}" data-path="${escape(d.path||'')}" data-preview="pending"><button class="study-document-open" ${d.available?'':'disabled'} title="${escape(d.path||'原文件不可用')}"><span class="file-art ${escape(d.format)}">${icon(d.kind==='pdf'?'book':'file')}<span class="document-format-badge">${escape(d.format.toUpperCase())}</span></span><span class="study-document-copy"><strong>${escape(d.title)}</strong><small class="study-document-path">${escape(d.path||'原文件不可用')}</small><span class="study-document-metadata">${escape(d.format.toUpperCase())}${d.bytes!==null&&d.bytes!==undefined?' · '+bytesLabel(d.bytes):''}<span class="study-document-preview-detail"></span></span>${d.sourceChanged?'<small class="study-document-warning">原文变化 · 重新打开以核对</small>':''}</span></button><button class="study-document-remove" aria-label="从学习集移除：${escape(d.title)}" title="只移除关联，不删除原件">×</button></article>`).join('')||'<p class="study-no-docs">先添加文库中的文件，再打开阅读。一个文件可以被多个学习集引用。</p>';
    for(const el of root.querySelectorAll('.study-document')){const id=el.dataset.documentId;el.querySelector('.study-document-open').onclick=run(()=>this.study.member(id));el.querySelector('.study-document-remove').onclick=()=>{const current=this.study.current?.documents.find(d=>d.id===id);if(current)this.study.removeDocument(current);};}
    this.previews.attach(set.documents.filter(d=>d.available).map(d=>({...d,kind:'file',version:d.sourceVersion})),{root,selector:'.study-document'});
  }
}
