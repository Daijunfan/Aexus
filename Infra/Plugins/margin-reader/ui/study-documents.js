import {$,escape,icon,run,bytesLabel,parentPath} from './dom.js';
import {LibraryPreviews} from './library-previews.js';

// A compact shelf of original covers. Thumbnails are derived, never user data.
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
    this.tools.hidden=Boolean(this.study.getDocument()||set.view!=='documents');$('study-document-total').textContent=String(set.documents.length);
    for(const m of ['grid','list']){$('study-documents-'+m).classList.toggle('active',mode===m);$('study-documents-'+m).setAttribute('aria-pressed',String(mode===m));}
    const key=JSON.stringify([set.id,mode,set.documents]);if(key===this.key)return;this.key=key;root.dataset.view=mode;
    root.innerHTML=set.documents.map(d=>{
      const format=(d.format||'file').toUpperCase(),folder=parentPath(d.path||'.'),warning=!d.available?'原文件不可用':d.sourceChanged?'原文已更新':'';
      return `<article class="study-document" data-document-id="${d.id}" data-path="${escape(d.path||'')}" data-format="${escape(d.format||'file')}" data-preview="${d.available?'pending':'unavailable'}">
        <button class="study-document-open" ${d.available?'':'disabled'} aria-label="打开 ${escape(d.title)}" title="${escape(d.path||'原文件不可用')}">
          <span class="file-art ${escape(d.format||'file')}"><span class="document-cover-sheet">${icon(d.kind==='pdf'?'book':'file')}<span class="document-cover-fallback">${escape(format)}</span></span></span>
          <span class="study-document-copy"><span class="study-document-caption"><span class="document-format-badge">${escape(format)}</span><span class="study-document-metadata"><span>${d.bytes===null||d.bytes===undefined?'':bytesLabel(d.bytes)}</span><span class="study-document-preview-detail" data-summary="pages"></span></span></span>
          <strong>${escape(d.title)}</strong><small class="study-document-path" title="${escape(d.path||'')}">${escape(!folder||folder==='.'?'我的文库':folder)}</small>
          ${warning?`<span class="study-document-warning" data-unavailable="${!d.available}" title="${d.available?'重新打开以核对原文；已有笔记和原文定位保留。':'请在文库恢复原文件；已有笔记保留。'}">${icon('refresh')}<span>${warning}</span></span>`:''}</span>
        </button><button class="study-document-remove" type="button" aria-label="从学习集移除：${escape(d.title)}" title="移除关联，保留原文件">${icon('trash')}</button></article>`;
    }).join('')||'<p class="study-no-docs">先添加文库中的文件，再打开阅读。一个文件可以被多个学习集引用。</p>';
    for(const el of root.querySelectorAll('.study-document')){const id=el.dataset.documentId;el.querySelector('.study-document-open').onclick=run(()=>this.study.member(id));el.querySelector('.study-document-remove').onclick=()=>{const current=this.study.current?.documents.find(d=>d.id===id);if(current)this.study.removeDocument(current);};}
    this.previews.attach(set.documents.filter(d=>d.available).map(d=>({...d,kind:'file',version:d.sourceVersion})),{root,selector:'.study-document'});
  }
}
