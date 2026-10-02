import { StudyLibrary } from './study-library.js';
import { StudyDocuments } from './study-documents.js';
import {MindmapStudio} from './mindmap-studio.js';
import { PALETTES, avatarTone } from './visual-theme.mjs';
import { DocumentTextbox } from './document-textbox.js';
import { CardInspector } from './card-inspector.js';
import { ToolFinder } from './tool-finder.js';
import { ReaderDictionary } from './reader-dictionary.js';
import { organizeStudyToolbar } from './study-toolbar.js';
import { AVStudy } from './av-study.js';
import { CaptureDevices } from './capture-devices.js';
import { MapTools } from './map-tools.js';
import { StudyBoards } from './study-boards.js';
import { $, escape, icon, run, field, showDialog, toast, activity } from './dom.js';
import { api } from './transport.js';
import { BackupTools } from './backup-tools.js';
import { StudyTools } from './study-tools.js';
import { StudyLearning } from './study-learning.js';
import { InkTools } from './ink-tools.js';
import { StudyExport } from './study-export.js';
import { StudyContent } from './study-content.js';
import { StudyOrganization } from './study-organize.js';
import { StudyMap } from './study-map.js';
import { CardInk } from './card-ink.js';
import { StudyAdvanced } from './study-advanced.js';
import { StudyInk } from './study-ink.js';
import { StudyExcerpts } from './study-excerpts.js';
export class StudyController {
  get busy(){return Boolean(this._busy);}
  set busy(value){this._busy=Boolean(value);if(this.map?.board){this.map.board.inert=this._busy;this.map.board.setAttribute('aria-busy',String(this._busy));}}
  constructor(options) {
    Object.assign(this,options);this.current=null;this.list=[];this.busy=false;
    this.colors=[['yellow','黄色'],['green','绿色'],['blue','蓝色'],['purple','紫色'],['pink','粉色'],['orange','橙色'],['red','红色'],['teal','青绿'],['cyan','青色'],['indigo','靛蓝'],['lime','黄绿'],['brown','棕色'],['gray','灰色'],['rose','玫瑰'],['olive','橄榄'],['slate','灰蓝']];
    this.hex={yellow:'#f4c84b',green:'#58b985',blue:'#54a4ed',purple:'#aa86d9',pink:'#e689ac',orange:'#ec9b52',red:'#e35d6a',teal:'#36a6a1',cyan:'#54c0db',indigo:'#7272cc',lime:'#98b548',brown:'#af845f',gray:'#92969d',rose:'#cc6d83',olive:'#86965f',slate:'#6e8caa'};
    const sidebar=document.createElement('section');sidebar.className='study-sidebar';sidebar.innerHTML=`<div class="study-sidebar-heading"><span>学习集</span><button id="study-deleted" title="学习集回收站" aria-label="学习集回收站">${icon('trash')}</button><button id="study-create" title="新建学习集" aria-label="新建学习集">${icon('plus')}</button></div><div id="study-set-list"></div>`;$('file-tree').before(sidebar);
    const home=document.createElement('section');home.id='study-home';home.hidden=true;home.innerHTML=`<header class="study-home-header"><div><span class="study-eyebrow">学习集 · 文档与摘录</span><h1 id="study-title"></h1><p id="study-description"></p></div><div><button id="study-edit-set">编辑</button><button id="study-export-set">导出</button><button id="study-remove-set" class="danger">删除学习集</button><button id="study-add-documents" class="primary">＋ 添加文件</button></div></header><div id="study-documents" aria-label="学习集文件"></div><div id="study-home-map"></div>`;$('library-view').after(home);
    const pane=document.createElement('aside');pane.id='study-pane';pane.hidden=true;$('workspace').append(pane);
    const bar=document.createElement('div');bar.id='study-reading-bar';bar.hidden=true;bar.innerHTML=`<button id="study-back-set" title="返回学习集脑图">${icon('arrow-left')}<span id="study-reading-title"></span></button><select id="study-current-document" aria-label="切换学习集文档"></select><button id="study-region" aria-pressed="false" title="拖动框选 PDF 图表或扫描内容">框选摘录</button><button id="study-toggle-map">脑图 / 目录</button>`;$('reader-view').prepend(bar);
    this.inkTools=new InkTools(this);this.map=new StudyMap(this);this.av=new AVStudy(this);this.excerpts=new StudyExcerpts(this);this.ink=new StudyInk(this);this.advanced=new StudyAdvanced(this);this.cardInk=new CardInk(this);this.organization=new StudyOrganization(this);this.content=new StudyContent(this);this.exporter=new StudyExport(this);this.learning=new StudyLearning(this);this.tools=new StudyTools(this);this.backups=new BackupTools(this);this.boards=new StudyBoards(this);this.mapTools=new MapTools(this);this.devices=new CaptureDevices(this);
    $('study-create').onclick=()=>this.create();$('study-deleted').onclick=run(()=>this.deleted());
    $('study-add-documents').onclick=run(()=>this.addDocuments());$('study-edit-set').onclick=()=>this.edit();$('study-remove-set').onclick=()=>this.remove();$('study-export-set').onclick=()=>this.export();
    $('study-back-set').onclick=run(()=>this.home(this.current.id));$('study-current-document').onchange=run(()=>this.member($('study-current-document').value));
    $('study-region').onclick=()=>{this.ink.setMode('off');this.excerpts.setRegion(!this.excerpts.region);};
    $('study-toggle-map').onclick=()=>{this.outline=!this.outline;this.mount(true);};
    const notes = document.createElement('button'); notes.id = 'document-notes'; notes.textContent = '批注';
    notes.title = '直接为当前文档做摘录、手写和笔记，无需先建学习集';
    $('search-document').before(notes); notes.onclick = run(() => this.ensureNotes());
    const linkage = document.createElement('select'); linkage.id = 'study-linkage'; linkage.setAttribute('aria-label', '文档脑图联动');
    linkage.innerHTML = [['both','↔ 双向联动'],['map-to-document','卡片 → 原文'],['document-to-map','原文 → 卡片'],['off','关闭联动']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
    $('study-toggle-map').before(linkage);
    linkage.onchange = run(() => this.change('study.navigation.set', { mode: linkage.value }));
    this.dictionary=new ReaderDictionary(this);
    this.inspector=new CardInspector(this);
    this.textbox=new DocumentTextbox(this);
    organizeStudyToolbar(this);
    this.toolFinder=new ToolFinder(this);this.mindmapStudio=new MindmapStudio(this);
    this.collection=new StudyLibrary(this);
    this.documentGallery=new StudyDocuments(this);
  }
  async refreshList(){const serial=this.listSerial=(this.listSerial||0)+1,data=await api('study.library.get');if(serial!==this.listSerial)return;this.list=data.sets;this.collection?.accept(data);this.renderList();}
  renderList(){
    if(this.collection){this.collection.renderTree(this.list);return;}
    $('study-set-list').innerHTML=this.list.map(s=>{const p=PALETTES[avatarTone(s.id)];return `<button class="study-set-row ${s.id===this.current?.id?'active':''}" data-set-id="${s.id}" title="${escape(s.title)}"><span class="study-set-avatar" aria-hidden="true" style="--avatar-color:${p.fill};--avatar-end:${p.end}">${escape(Array.from(s.title)[0]||'阅')}</span><span class="study-set-copy"><strong>${escape(s.title)}</strong><small>${s.documentCount} 份文档 · 本地学习集</small></span><small class="study-set-count" aria-label="${s.cardCount} 张卡片">${s.cardCount}</small></button>`;}).join('')||'<span class="study-sidebar-empty">点 ＋ 创建学习集</span>';
    $('study-set-list').querySelectorAll('button').forEach(b=>b.onclick=run(()=>this.home(b.dataset.setId)));
  }
  create(){showDialog({title:'新建学习集',html:field('title','名称','',{required:true,help:'同一份文档可以加入多个学习集。摘录和脑图按学习集独立保存。'}),submit:'创建',onSubmit:async values=>{const set=await api('study.create',{title:values.title,folderId:this.collection?.folderId||null});await this.home(set.id);}});}
  async home(id){const ticket=this.activationEpoch=(this.activationEpoch||0)+1;this.busy=true;try{await this.beforeNavigate();if(ticket!==this.activationEpoch)return;const set=await api('study.open',{setId:id});if(ticket!==this.activationEpoch)return;this.current=set;this.outline=false;this.excerpts.hide();await this.showHome();if(ticket!==this.activationEpoch)return;this.render(set);await this.refreshList();}finally{this.busy=false;}}
  async restore(settings){
    if(!settings.activeStudySet)return false;const ticket=this.activationEpoch=(this.activationEpoch||0)+1;this.busy=true;
    try{const current=await api('study.get',{setId:settings.activeStudySet});if(ticket!==this.activationEpoch)return false;this.current=current;this.renderList();const doc=this.current.documents.find(d=>d.id===settings.lastDocument&&d.available);
      if(doc)await this.openDocument(doc.path,{studySetId:this.current.id});else await this.showHome();if(ticket!==this.activationEpoch||!this.current)return false;this.render(this.current);return true;
    }catch(e){if(e.code==='NOT_FOUND'){await this.leave();return false;}throw e;}finally{this.busy=false;}
  }
  async member(id){const set=this.current,doc=set.documents.find(d=>d.id===id);if(!doc?.available)throw new Error('原文件不可用，请先在文库中恢复。');const ticket=this.activationEpoch=(this.activationEpoch||0)+1;this.busy=true;
    try{await this.beforeNavigate();if(ticket!==this.activationEpoch)return;this.excerpts.hide();await api('study.open',{setId:set.id,documentId:id});if(ticket!==this.activationEpoch)return;await this.openDocument(doc.path,{studySetId:set.id});if(ticket!==this.activationEpoch)return;await this.refresh();}finally{this.busy=false;}}
  async activateCard(card, origin = 'map', force = false, excerptId) {
    const setId = this.current?.id;
    if (!setId) return;
    this.map.select(card.id);
    const ticket = this.activationEpoch = (this.activationEpoch || 0) + 1;
    const work = async () => {
      if (ticket !== this.activationEpoch || this.current?.id !== setId) return;
      this.busy = true;
      try {
        if (origin === 'map') await this.beforeNavigate();
        if(ticket!==this.activationEpoch)return;
        const result = await api('study.card.activate', { setId, cardId: card.id, origin, force, ...(excerptId?{excerptId}:{}) });
        if (ticket !== this.activationEpoch || this.current?.id !== setId) return;
        this.current = result.set;
        if (result.linked && origin === 'map' && !result.source) await this.showHome();
        if(ticket!==this.activationEpoch)return;
        this.render(result.set, result.linked ? result.cardId : undefined);
        if (result.source && origin === 'map') {
          await this.loadSource(result.source.documentId, () => ticket === this.activationEpoch);
          if (ticket !== this.activationEpoch) return;
          this.map.select(result.cardId);
          this.excerpts.revealCard(result.cardId,result.source);
        }
        return result;
      } finally { this.busy = false; }
    };
    this.activationQueue = (this.activationQueue || Promise.resolve()).catch(() => {}).then(work);
    return this.activationQueue;
  }
  async source(card) {
    if (!card.source && !card.anchor && !card.reference) return this.map.edit(card);
    return this.activateCard(card, 'map', true);
  }
  async ensureNotes(doc = this.getDocument()) {
    if (!doc) return;
    if (this.current?.documentIds.includes(doc.id)) return this.current;
    const set = await api('study.document.ensure', { id: doc.id });
    this.current = set; this.render(set); await this.refreshList(); return set;
  }
  async attachDocumentNotes(id) {
    await this.refreshList();
    const existing = this.list.find(set => set.documentNotesFor === id);
    if (existing) { this.current = await api('study.document.ensure', { id }); this.render(this.current); }
  }
  async leave(persist=true){if(!this.current)return;this.inspector?.guard();this.activationEpoch=(this.activationEpoch||0)+1;$('presentation-screen').hidden=true;this.current=null;this.inkTools.toolbar.hide();this.inkTools.rulers.render();this.excerpts.setRegion(false);if(persist)await api('settings.set',{activeStudySet:null});this.mount(false);this.renderList();}
  async refresh(focusId){await this.refreshList();if(!this.current)return;const id=this.current.id;try{const set=await api('study.get',{setId:id});if(this.current?.id!==id)return;this.render(set,focusId);}catch(e){if(e.code==='NOT_FOUND'){await this.leave(false);await this.openFolder('.');return;}throw e;}}
  async change(method,params,revision=this.current?.revision){const id=this.current?.id;if(!id)return;try{const set=await api(method,{setId:id,expectedRevision:revision,...params});if(this.current?.id===id)this.render(set,params.cardId);await this.refreshList();return set;}catch(e){await this.refresh();throw e;}}
  mount(reading){const active=!!this.current;$('workspace').classList.toggle('study-active',active);$('workspace').classList.toggle('study-show-outline',!!this.outline);$('study-home').hidden=!active||reading;$('study-reading-bar').hidden=!active||!reading;$('study-pane').hidden=!active||!reading||!!this.outline;if(active){$('library-view').hidden=true;this.map.attach(reading);$('study-region').hidden=this.getDocument()?.kind!=='pdf';$('study-excerpt-lasso').hidden=this.getDocument()?.kind!=='pdf';}else{$('study-home').hidden=true;$('study-pane').hidden=true;}this.excerpts?.scheduleMarks();this.ink?.render();document.dispatchEvent(new Event('study-view-mounted'));}
  render(set,focusId){
    if(this.current?.id===set.id && this.current.revision>set.revision)return;
    const changed=this.current?.id!==set.id;this.current=set;if(changed)this.outline=false;
    if(changed)this.toolbar?.reset();
    $('study-title').textContent=set.title;$('study-description').textContent=set.description||`${set.documents.length} 份文档 · ${set.cards.length} 张摘录卡片`;
    $('study-reading-title').textContent=set.title;
    $('study-linkage').value=set.navigation?.mode||'both';
    this.documentGallery.render(set);
    const select=$('study-current-document'),doc=this.getDocument();select.innerHTML=set.documents.map(d=>`<option value="${d.id}" ${d.available?'':'disabled'}>${escape(d.title)}</option>`).join('');if(doc)select.value=doc.id;
    const selection=set.selection; if(selection?.serial!==this.selectionSerial){this.selectionSerial=selection?.serial;if(selection?.linked)focusId=selection.cardId;}
    this.tools?.render(set);this.map.render(set,focusId);this.av.render();this.learning?.render(set);this.advanced?.render(set);this.organization?.render(set);this.mapTools?.render(set);this.cardInk?.render();this.mount(!!doc);this.renderList();this.excerpts.scheduleMarks();this.ink.render();this.inkTools.toolbar.render();this.inkTools.rulers.render();this.inspector?.observe(set);this.mindmapStudio?.render(set);
  }
  readerRendered(){this.av.render();if(this.current){const doc=this.getDocument();$('study-current-document').value=doc?.id||'';this.mount(Boolean(doc));}this.excerpts.scheduleMarks();this.ink.render();this.cardInk.render();this.inkTools.rulers.render();}
  async addDocuments(){
    const set=this.current,listing=await api('fs.tree',{depth:100}),files=[];const walk=entries=>{for(const e of entries){if(e.kind==='file'&&e.readable)files.push(e);else if(e.children)walk(e.children);}};walk(listing.entries);
    const existing=new Set(set.documents.map(d=>d.path)),chosen=new Set();
    showDialog({title:'添加文件到学习集',html:`<p class="dialog-note">添加引用，不复制或移动文件。已加入的文档会显示勾选。</p><label class="dialog-field"><input id="study-file-search" placeholder="搜索文库文件" aria-label="搜索可添加文件"></label><div class="study-file-picker">${files.map(e=>`<label class="study-file-choice" data-path="${escape(e.path)}"><input type="checkbox" value="${escape(e.path)}" ${existing.has(e.path)?'checked disabled':''}><span>${escape(e.name)}<small>${escape(e.path)}</small></span></label>`).join('')||'<p>文库暂无可阅读文件。请先导入文档。</p>'}</div>`,submit:'添加所选文件',onSubmit:async()=>{if(!chosen.size)throw new Error('请至少选择一个尚未加入的文件。');activity(`正在添加 ${chosen.size} 份文档…`);try{await this.change('study.documents.add',{paths:[...chosen]},set.revision);}finally{activity('');}},afterOpen:()=>{
      $('study-file-search').oninput=()=>{const q=$('study-file-search').value.trim().toLocaleLowerCase();$('dialog-fields').querySelectorAll('.study-file-choice').forEach(el=>el.hidden=!el.dataset.path.toLocaleLowerCase().includes(q));};
      $('dialog-fields').querySelectorAll('.study-file-choice input:not(:disabled)').forEach(input=>input.onchange=()=>{input.checked?chosen.add(input.value):chosen.delete(input.value);$('dialog-submit').textContent=`添加 ${chosen.size} 份文件`;});
    }});
  }
  removeDocument(doc){const revision=this.current.revision;showDialog({title:'从学习集移除文件',html:`<p class="dialog-note">移除「${escape(doc.title)}」的关联？原件、其他学习集及已经生成的摘录卡片均会保留。</p>`,submit:'移除关联',onSubmit:async()=>{await this.change('study.documents.remove',{documentIds:[doc.id]},revision);if(this.getDocument()?.id===doc.id)await this.home(this.current.id);}});}
  edit(){const set=this.current;showDialog({title:'编辑学习集',html:field('title','名称',set.title,{required:true})+`<label class="dialog-field"><span>描述</span><textarea name="description">${escape(set.description)}</textarea></label>`,onSubmit:v=>this.change('study.update',v,set.revision)});}
  remove(){const set=this.current;showDialog({title:'删除学习集',html:`<p class="dialog-note">「${escape(set.title)}」将移入学习集回收站。文档原件和全部摘录图片都会保留，可恢复。</p>`,submit:'移入回收站',onSubmit:async()=>{await api('study.remove',{setId:set.id,expectedRevision:set.revision});await this.leave(false);await this.openFolder('.');await this.refreshList();}});}
  async deleted(){const {sets}=await api('study.list',{includeTrashed:true});showDialog({title:'学习集回收站',html:sets.filter(s=>s.deletedAt).map(s=>`<div class="trash-item"><div>${escape(s.title)}<small>${s.cardCount} 张卡片 · ${s.documentCount} 份文档</small></div><button type="button" data-set="${s.id}">恢复</button></div>`).join('')||'<p class="dialog-note">没有已删除的学习集。</p>',onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-set]').forEach(b=>b.onclick=run(async()=>{const s=sets.find(s=>s.id===b.dataset.set);await api('study.restore',{setId:s.id,expectedRevision:s.revision});b.closest('.trash-item').remove();await this.refreshList();}));}});}
  export(){return this.exporter.export();}
}
