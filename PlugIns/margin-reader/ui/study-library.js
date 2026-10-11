import {$,escape,icon,field,showDialog,run,toast} from './dom.js';
import {api} from './transport.js';
import {PALETTES,avatarTone} from './visual-theme.mjs';

// Study folders organize references to study IDs. They are separate from the
// physical document tree; a move never relocates source PDFs or card assets.
export class StudyLibrary {
  constructor(study){
    this.study=study;this.data={revision:0,folders:[],sets:[]};this.expanded=new Set();this.settings={};this.page=0;this.size=100;this.query='';
    const sidebar=document.querySelector('.study-sidebar');sidebar.id='study-library-sidebar';sidebar.classList.add('library-section');sidebar.setAttribute('aria-label','学习集');
    const heading=sidebar.querySelector('.study-sidebar-heading'),create=$('study-create'),deleted=$('study-deleted'),importPackage=$('study-import-package');
    const root=document.createElement('button');root.id='studies-root';root.className='root-row section-root';root.type='button';root.innerHTML=icon('book')+'<span>学习集</span>';root.onclick=run(()=>this.open(null));sidebar.prepend(root);
    const separator=document.createElement('hr');separator.className='sidebar-section-divider';separator.setAttribute('aria-label','学习集与我的文库分隔线');
    const files=document.createElement('section');files.id='file-library-sidebar';files.className='library-section';files.setAttribute('aria-label','我的文库');
    const explorer=document.querySelector('.explorer');
    explorer.querySelector('.pane-heading>span').textContent='阅读空间';
    const navigation=document.createElement('nav');navigation.id='sidebar-navigation';navigation.setAttribute('aria-label','学习集与文库导航');
    explorer.querySelector('.pane-heading').after(navigation);navigation.append(sidebar,separator,files);
    files.append($('library-root'),$('file-tree'));
    $('library-root').classList.add('section-root');$('study-set-list').setAttribute('role','tree');$('study-set-list').setAttribute('aria-label','学习集文件夹与学习集');
    this.bindDrop(root,null);
    const view=document.createElement('section');view.id='study-library-view';view.className='study-library-view';view.hidden=true;view.setAttribute('aria-label','学习集文库');
    view.innerHTML=`<header class="collection-heading"><div><nav id="study-library-breadcrumbs" class="breadcrumbs" aria-label="学习集文件夹路径"></nav><h1 id="study-library-title">学习集</h1><p id="study-library-count" class="muted"></p></div><div class="collection-actions"><button id="collection-new-folder">${icon('folder-plus')}<span>新建文件夹</span></button><button id="collection-create" class="primary">${icon('plus')}<span>新建学习集</span></button></div></header><div class="collection-controls"><label class="collection-search">${icon('search')}<input id="study-library-search" type="search" placeholder="搜索学习集与文件夹…" aria-label="搜索学习集与文件夹"></label><div class="view-switch" role="group" aria-label="学习集视图"><button id="study-library-grid" title="缩略图视图" aria-label="学习集缩略图视图">${icon('grid')}</button><button id="study-library-list" title="列表视图" aria-label="学习集列表视图">${icon('list')}</button></div><button id="study-folder-trash" title="已删除的空文件夹">${icon('trash')}文件夹回收站</button></div><div id="study-library-items" class="collection-items grid"></div><div id="study-library-empty" class="collection-empty" hidden>${icon('book')}<h2>整理你的学习主题</h2><p>新建学习集，或把已有学习集拖入文件夹。<br>文档原件仍保留在“我的文库”。</p></div><nav id="collection-pages" class="study-list-pagination" aria-label="学习集分页" hidden><button id="collection-previous">上一页</button><span id="collection-page-status"></span><button id="collection-next">下一页</button></nav>`;
    $('library-view').after(view);this.view=view;
    // Relocate the original action elements, preserving their public handlers.
    create.className='primary';create.innerHTML=icon('plus')+'<span>新建学习集</span>';$('collection-create').replaceWith(create);
    importPackage.innerHTML=icon('upload')+'<span>导入学习集</span>';view.querySelector('.collection-actions').prepend(importPackage);
    deleted.innerHTML=icon('trash')+'<span>学习集回收站</span>';view.querySelector('.collection-controls').append(deleted);heading.remove();
    $('collection-new-folder').onclick=()=>this.newFolder();$('study-folder-trash').onclick=()=>this.trash();
    $('study-library-search').oninput=()=>{this.query=$('study-library-search').value.trim().toLocaleLowerCase();this.page=0;this.paint();};
    for(const mode of ['grid','list'])$('study-library-'+mode).onclick=run(async()=>{await study.setSettings({studyLibraryView:mode});});
    $('collection-previous').onclick=()=>{this.page=Math.max(0,this.page-1);this.paint();};$('collection-next').onclick=()=>{this.page++;this.paint();};
    document.addEventListener('click',e=>{if(this.menu&&!e.target.closest('.collection-menu,[data-collection-more]'))this.closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.closeMenu();});
  }
  get active(){return !this.view.hidden;}
  get folderId(){return this.settings.studyFolder||null;}
  apply(settings){this.settings=settings;if(this.active)this.paint();this.highlight();}
  accept(data){if(data.revision<this.data.revision)return;this.data=data;if(this.active)this.paint();}
  async open(id){this.page=0;this.query='';$('study-library-search').value='';if(id)this.expandParents(id);await this.study.showCollection(id);this.paint();}
  show(on){this.view.hidden=!on;if(on)this.paint();this.highlight();}
  highlight(){
    $('studies-root').setAttribute('aria-current',this.active||this.study.current?'page':'false');
    $('library-root').setAttribute('aria-current',!this.active&&!this.study.current?'page':'false');
  }
  folder(id){return this.data.folders.find(f=>f.id===id&&!f.deletedAt);}
  expandParents(id){let f=this.folder(id),steps=0;while(f&&steps++<64){this.expanded.add(f.id);f=this.folder(f.parentId);}}
  path(id){const parts=[];let f=this.folder(id),steps=0;while(f&&steps++<64){parts.unshift(f);f=this.folder(f.parentId);}return parts;}
  renderTree(sets=this.data.sets){
    const selected=this.study.current?.id,owner=sets.find(s=>s.id===selected),revealKey=JSON.stringify([selected,owner?.folderId]);
    // Reveal a newly selected/moved study once; respect later manual collapses.
    if(this.revealKey!==revealKey){this.revealKey=revealKey;if(owner?.folderId)this.expandParents(owner.folderId);}
    const key=JSON.stringify([this.data.revision,sets.map(s=>[s.id,s.title,s.cardCount,s.documentCount,s.folderId]),selected,[...this.expanded],this.folderId]);
    if(this.treeKey===key){this.highlight();return;}this.treeKey=key;
    const folders=this.data.folders.filter(f=>!f.deletedAt),children=new Map();for(const f of folders){if(!children.has(f.parentId))children.set(f.parentId,[]);children.get(f.parentId).push(f);}
    const grouped=new Map();for(const s of sets){const parent=this.folder(s.folderId)?.id||null;if(!grouped.has(parent))grouped.set(parent,[]);grouped.get(parent).push(s);}
    const walk=(parent,depth=0)=>{
      if(depth>=64)return '';
      return (children.get(parent)||[]).map(f=>`<div class="study-folder-row ${this.folderId===f.id?'active':''}" data-folder-id="${f.id}" role="treeitem" aria-expanded="${this.expanded.has(f.id)}" aria-level="${depth+1}" style="--folder-depth:${depth}"><button class="folder-toggle" aria-label="展开或折叠学习集文件夹">${icon(this.expanded.has(f.id)?'chevron-down':'chevron-right')}</button><button class="folder-open" title="${escape(f.title)}">${icon('folder')}<span>${escape(f.title)}</span><small>${f.studyCount||0}</small></button><button data-collection-more="folder" aria-label="文件夹操作：${escape(f.title)}">${icon('more')}</button></div>${this.expanded.has(f.id)?walk(f.id,depth+1):''}`).join('')+
      (grouped.get(parent)||[]).map(s=>{const p=PALETTES[avatarTone(s.id)];return `<button class="study-set-row ${s.id===selected?'active':''}" data-set-id="${s.id}" role="treeitem" aria-level="${depth+1}" draggable="true" style="--folder-depth:${depth}" title="${escape(s.title)}"><span class="study-set-avatar" aria-hidden="true" style="--avatar-color:${p.fill};--avatar-end:${p.end}">${escape(Array.from(s.title)[0]||'学')}</span><span class="study-set-copy"><strong>${escape(s.title)}</strong><small>${s.documentCount} 份文档</small></span><small class="study-set-count">${s.cardCount}</small></button>`;}).join('');
    };
    $('study-set-list').innerHTML=walk(null)||'<span class="study-sidebar-empty">创建学习集，集中整理一个主题</span>';
    for(const row of $('study-set-list').querySelectorAll('.study-folder-row')){
      const id=row.dataset.folderId;row.querySelector('.folder-toggle').onclick=()=>{this.expanded.has(id)?this.expanded.delete(id):this.expanded.add(id);this.renderTree(sets);};
      row.querySelector('.folder-open').onclick=run(()=>this.open(id));row.querySelector('[data-collection-more]').onclick=e=>this.menuFor('folder',id,e.currentTarget);
      row.oncontextmenu=e=>{e.preventDefault();this.menuFor('folder',id,row,e);};this.bindDrop(row,id);this.bindDrag(row,'folder',id);
    }
    for(const row of $('study-set-list').querySelectorAll('.study-set-row')){row.onclick=run(()=>this.study.home(row.dataset.setId));row.oncontextmenu=e=>{e.preventDefault();this.menuFor('set',row.dataset.setId,row,e);};this.bindDrag(row,'set',row.dataset.setId);}
    this.highlight();
  }
  paint(){
    if(!this.active)return;
    const folder=this.folder(this.folderId),parent=folder?.id||null,path=this.path(parent),mode=this.settings.studyLibraryView||'grid';
    $('study-library-title').textContent=folder?.title||'学习集';
    $('study-library-breadcrumbs').innerHTML=`<button data-collection-folder="">学习集</button>`+path.map(f=>`${icon('chevron-right')}<button data-collection-folder="${f.id}">${escape(f.title)}</button>`).join('');
    $('study-library-breadcrumbs').querySelectorAll('button').forEach(b=>{b.onclick=run(()=>this.open(b.dataset.collectionFolder||null));this.bindDrop(b,b.dataset.collectionFolder||null);});
    const folders=this.data.folders.filter(f=>!f.deletedAt&&(this.query?f.title.toLocaleLowerCase().includes(this.query):f.parentId===parent));
    const sets=this.data.sets.filter(s=>this.query?(s.title+' '+s.description).toLocaleLowerCase().includes(this.query):(s.folderId||null)===parent);
    const rows=[...folders.map(f=>({kind:'folder',value:f})),...sets.map(s=>({kind:'set',value:s}))],pages=Math.max(1,Math.ceil(rows.length/this.size));this.page=Math.min(this.page,pages-1);
    $('study-library-count').textContent=`${folders.length} 个文件夹 · ${sets.length} 个学习集${this.query?' · 全部文件夹搜索':''}`;
    for(const m of ['grid','list']){$('study-library-'+m).classList.toggle('active',mode===m);$('study-library-'+m).setAttribute('aria-pressed',String(mode===m));}
    const box=$('study-library-items'),key=JSON.stringify([parent,mode,this.query,this.page,rows]);
    if(this.itemsKey!==key){this.itemsKey=key;box.className='collection-items '+mode;
      box.innerHTML=(parent&&!this.query?`<button class="collection-up" data-collection-folder="${folder.parentId||''}">${icon('arrow-left')}返回上一级</button>`:'')+rows.slice(this.page*this.size,(this.page+1)*this.size).map(({kind,value:v})=>{
        const folder=kind==='folder',p=PALETTES[avatarTone(v.id)];
        return `<article class="collection-tile ${folder?'is-folder':'is-study'}" data-collection-id="${v.id}" data-collection-kind="${kind}" draggable="true"><button class="collection-open" title="打开${escape(v.title)}"><span class="collection-art" style="--tile-color:${p.fill};--tile-end:${p.end}">${icon(folder?'folder':'book')}${folder?'':`<span class="collection-monogram">${escape(Array.from(v.title).slice(0,2).join(''))}</span>`}</span><span class="collection-copy"><strong>${escape(v.title)}</strong><span class="collection-summary">${folder?'整理学习主题':escape(v.description||'围绕一个主题阅读与思考')}</span><small>${folder?`${v.folderCount||0} 个文件夹 · ${v.studyCount||0} 个学习集`:`${v.documentCount} 份文档 · ${v.cardCount} 个主题`}</small></span></button><button data-collection-more="${kind}" aria-label="更多操作：${escape(v.title)}" title="更多操作">${icon('more')}</button></article>`;
      }).join('');
      box.querySelector('[data-collection-folder]')?.addEventListener('click',run(e=>this.open(e.currentTarget.dataset.collectionFolder||null)));
      for(const tile of box.querySelectorAll('[data-collection-id]')){const id=tile.dataset.collectionId,kind=tile.dataset.collectionKind;
        tile.querySelector('.collection-open').onclick=run(()=>kind==='folder'?this.open(id):this.study.home(id));tile.querySelector('[data-collection-more]').onclick=e=>this.menuFor(kind,id,e.currentTarget);tile.oncontextmenu=e=>{e.preventDefault();this.menuFor(kind,id,tile,e);};this.bindDrag(tile,kind,id);if(kind==='folder')this.bindDrop(tile,id);
      }
    }
    $('study-library-empty').hidden=rows.length>0;$('collection-pages').hidden=pages===1;$('collection-page-status').textContent=`${this.page+1} / ${pages}`;$('collection-previous').disabled=this.page===0;$('collection-next').disabled=this.page===pages-1;
  }
  async mutate(method,params,revision=this.data.revision){const result=await api(method,{...params,expectedRevision:revision});this.accept(result);this.study.list=result.sets;this.renderTree(result.sets);return result;}
  newFolder(){const parent=this.folderId,revision=this.data.revision;showDialog({title:'新建学习集文件夹',html:field('title','文件夹名称','',{required:true,help:parent?'创建在当前学习集文件夹内':'创建在学习集根目录，不移动文档原件'}),submit:'创建',onSubmit:async v=>{await this.mutate('study.folder.create',{title:v.title,parentId:parent},revision);if(parent)this.expanded.add(parent);this.renderTree();}});}
  choices(exclude){return [['','学习集根目录'],...this.data.folders.filter(f=>!f.deletedAt&&f.id!==exclude&&!this.path(f.id).some(p=>p.id===exclude)).map(f=>[f.id,this.path(f.id).map(p=>p.title).join(' / ')])];}
  menuFor(kind,id,anchor,event){
    this.closeMenu();const item=kind==='folder'?this.folder(id):this.data.sets.find(s=>s.id===id);if(!item)return;
    const menu=document.createElement('div');menu.className='context-menu collection-menu';menu.setAttribute('role','menu');
    menu.innerHTML=[['open','打开'],['rename','重命名'],['move','移动到文件夹'],...(kind==='folder'?[['remove','移入文件夹回收站']]:[['remove','移入学习集回收站']])].map(([a,t])=>`<button role="menuitem" data-action="${a}">${t}</button>`).join('');document.body.append(menu);this.menu=menu;
    const b=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,event?.clientX??b.left))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,event?.clientY??b.bottom))+'px';
    for(const button of menu.querySelectorAll('button'))button.onclick=run(async()=>{this.closeMenu();const action=button.dataset.action,revision=this.data.revision;
      if(action==='open')return kind==='folder'?this.open(id):this.study.home(id);
      if(action==='rename')showDialog({title:kind==='folder'?'重命名学习集文件夹':'重命名学习集',html:field('title','名称',item.title,{required:true}),onSubmit:async v=>{if(kind==='folder')await this.mutate('study.folder.update',{folderId:id,title:v.title},revision);else{await api('study.update',{setId:id,expectedRevision:item.revision,title:v.title});await this.study.refreshList();}}});
      if(action==='move')showDialog({title:'移动到学习集文件夹',html:field('folderId','目标位置',kind==='folder'?item.parentId||'':item.folderId||'',{choices:this.choices(kind==='folder'?id:null)}),onSubmit:v=>this.mutate(kind==='folder'?'study.folder.update':'study.library.move',kind==='folder'?{folderId:id,parentId:v.folderId||null}:{setIds:[id],folderId:v.folderId||null},revision)});
      if(action==='remove')showDialog({title:'移入回收站',html:`<p>将“${escape(item.title)}”移入回收站？</p><p class="dialog-note">${kind==='folder'?'文件夹必须为空，请先移走其中的学习集和子文件夹。':'保留原始文档、卡片与摘录图片，可从学习集回收站恢复。'}</p>`,submit:'移入回收站',onSubmit:async()=>{if(kind==='folder')await this.mutate('study.folder.remove',{folderId:id},revision);else{await api('study.remove',{setId:id,expectedRevision:item.revision});await this.study.refreshList();}}});
    });
  }
  closeMenu(){this.menu?.remove();this.menu=null;}
  bindDrag(element,kind,id){element.draggable=true;element.addEventListener('dragstart',e=>{if(e.target.closest('[data-collection-more]')){e.preventDefault();return;}this.closeMenu();this.drag={kind,id,revision:this.data.revision};e.dataTransfer.setData('application/x-margin-study',JSON.stringify({kind,id}));e.dataTransfer.effectAllowed='move';});element.addEventListener('dragend',()=>{this.drag=null;document.querySelectorAll('.collection-drop').forEach(el=>el.classList.remove('collection-drop'));});}
  bindDrop(element,folderId){
    element.addEventListener('dragover',e=>{if(!this.drag||!e.dataTransfer.types.includes('application/x-margin-study'))return;e.preventDefault();e.stopPropagation();element.classList.add('collection-drop');e.dataTransfer.dropEffect='move';});
    element.addEventListener('dragleave',e=>{if(!element.contains(e.relatedTarget))element.classList.remove('collection-drop');});
    element.addEventListener('drop',e=>{if(!this.drag||!e.dataTransfer.types.includes('application/x-margin-study'))return;e.preventDefault();e.stopPropagation();element.classList.remove('collection-drop');const d=this.drag;this.drag=null;
      run(async()=>{await this.mutate(d.kind==='folder'?'study.folder.update':'study.library.move',d.kind==='folder'?{folderId:d.id,parentId:folderId}:{setIds:[d.id],folderId},d.revision);if(folderId)this.expanded.add(folderId);this.renderTree();toast('已移动，文档原件保持原位');})();
    });
  }
  trash(){const deleted=this.data.folders.filter(f=>f.deletedAt),revision=this.data.revision;showDialog({title:'学习集文件夹回收站',html:deleted.map(f=>`<div class="trash-item"><div>${escape(f.title)}</div><button type="button" data-folder-restore="${f.id}">恢复到根目录</button></div>`).join('')||'<p class="dialog-note">没有已删除的学习集文件夹。</p>',onSubmit:null,afterOpen:()=>{let currentRevision=revision;for(const b of $('dialog-fields').querySelectorAll('[data-folder-restore]'))b.onclick=run(async()=>{b.disabled=true;try{const result=await this.mutate('study.folder.restore',{folderId:b.dataset.folderRestore,parentId:null},currentRevision);currentRevision=result.revision;b.closest('.trash-item').remove();}finally{b.disabled=false;}});}});}
}
