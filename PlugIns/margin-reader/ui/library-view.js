import { $, escape, icon, run, bytesLabel, parentPath, baseName, joinPath } from './dom.js';
// Presentation and keyboard actions only; all file mutations remain in Library/Core.
export class LibraryView {
  moreButton(entry) {
    return `<button type="button" class="file-more" aria-label="更多操作：${escape(entry.name)}" title="更多操作" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>`;
  }
  bindMore(element, entry) {
    const more = element.querySelector('.file-more');
    more.addEventListener('pointerdown', event => event.stopPropagation());
    more.addEventListener('dblclick', event => event.stopPropagation());
    more.addEventListener('click', event => { event.stopPropagation(); this.showMenu(entry, more); });
    more.addEventListener('keydown', event => event.stopPropagation());
  }
  renderTree() {
    const renderKey=JSON.stringify([this.tree,this.folder,this.activePath,[...this.expanded].sort()]);
    if(this.treeRenderKey===renderKey&&$('file-tree').childElementCount)return;
    const walk = (entries, level) => entries.map(entry => {
      const folder = entry.kind === 'folder', expanded = this.expanded.has(entry.path);
      return `<div class="tree-row ${folder ? 'folder' : ''} ${entry.path === this.activePath || !this.activePath && entry.path === this.folder ? 'active' : ''} ${!folder && !entry.readable ? 'unreadable' : ''}" data-path="${escape(entry.path)}" role="treeitem" tabindex="0" aria-level="${level + 1}" ${folder ? `aria-expanded="${expanded}"` : ''} title="${escape(entry.path)}" style="padding-left:${5 + level * 16}px"><button class="twisty" tabindex="-1" aria-label="展开或折叠">${folder ? icon(expanded ? 'chevron-down' : 'chevron-right') : ''}</button>${icon(folder ? 'folder' : 'file')}<span class="tree-label">${escape(entry.name)}</span>${this.moreButton(entry)}</div>${folder && expanded ? walk(entry.children || [], level + 1) : ''}`;
    }).join('');
    $('file-tree').innerHTML = walk(this.tree, 0) || '<div class="blank-state">这里还没有文件</div>';
    for (const row of $('file-tree').querySelectorAll('.tree-row')) {
      const entry = this.find(row.dataset.path);
      row.addEventListener('click', run(event => {
        if (event.target.closest('.file-more')) return;
        if (event.target.closest('.twisty') && entry.kind === 'folder') { this.expanded.has(entry.path) ? this.expanded.delete(entry.path) : this.expanded.add(entry.path); this.renderTree(); return; }
        return this.open(entry);
      }));
      row.addEventListener('keydown', event => {
        if (event.target.closest('.file-more')) return;
        if (event.key === 'Enter') { event.preventDefault(); run(() => this.open(entry))(); }
        if (event.key === 'F2') { event.preventDefault(); this.action('rename', entry); }
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); this.showMenu(entry, row.querySelector('.file-more')); }
        if (entry.kind === 'folder' && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); event.key === 'ArrowRight' ? this.expanded.add(entry.path) : this.expanded.delete(entry.path); this.renderTree(); }
      });
      row.addEventListener('contextmenu', event => this.context(event, entry));
      this.bindMore(row, entry); this.drag.bindSource(row, entry); this.drag.bindTarget(row, entry);
    }
    this.treeRenderKey=renderKey;
  }
  visibleEntries() {
    const normalize=value=>value.normalize('NFKC').toLocaleLowerCase(),query=normalize($('file-filter').value.trim());
    if(!query)return this.entries;
    if(this.searchCache?.query===query&&this.searchCache.tree===this.tree&&this.searchCache.entries===this.entries)return this.searchCache.results;
    const matches=new Map();
    const walk=entries=>{for(const entry of entries){if(normalize(entry.path).includes(query))matches.set(entry.path,entry);if(entry.children)walk(entry.children);}};
    walk(this.tree);walk(this.entries);
    const results=[...matches.values()];this.searchCache={query,tree:this.tree,entries:this.entries,results};return results;
  }
  renderFiles() {
    // Repeated watcher/metadata refreshes must not discard keyboard focus,
    // thumbnails or a pointer target when the visible file data are unchanged.
    const entries=this.visibleEntries(),query=$('file-filter').value.trim();$('clear-file-filter').hidden=!query;
    const renderKey=JSON.stringify([this.folder,this.view,query,entries]);
    if(this.filesRenderKey===renderKey&&$('files').childElementCount){this.renderSelection();return;}
    const parentNames = this.folder === '.' ? [] : this.folder.split('/');
    let path = '.';
    $('breadcrumbs').innerHTML = `<button data-folder=".">文库</button>` + parentNames.map(name => { path = joinPath(path, name); return `${icon('chevron-right')}<button data-folder="${escape(path)}">${escape(name)}</button>`; }).join('');
    $('breadcrumbs').querySelectorAll('button').forEach(button => button.addEventListener('click', run(() => this.navigate(button.dataset.folder))));
    $('folder-title').textContent = query ? '搜索结果' : this.folder === '.' ? '我的文库' : baseName(this.folder);
    const folders = entries.filter(e => e.kind === 'folder').length;
    $('folder-count').textContent = `${folders} 个文件夹 · ${entries.length - folders} 份文档${query?' · 含子文件夹':''}`;
    $('files').className = `files ${this.view}`;
    $('grid-view').classList.toggle('active', this.view === 'grid'); $('list-view').classList.toggle('active', this.view === 'list');
    const emptyState = $('empty-library'); emptyState.hidden = Boolean(query)||entries.length > 0;
    const noMatches=$('library-no-matches');noMatches.hidden=!query||entries.length>0;
    const root = this.folder === '.'||Boolean(query), parent = parentPath(this.folder);
    $('files').classList.toggle('has-parent', !root);
    const back = root ? '' : `<button id="folder-back" type="button" class="navigation-card library-card" aria-label="返回上一级" title="返回：${escape(parent === '.' ? '我的文库' : parent)}"><span class="file-art back-art">${icon('folder')}<span class="back-arrow">${icon('arrow-left')}</span></span><span class="file-name">返回</span><span class="file-info">${escape(parent === '.' ? '我的文库' : baseName(parent))}</span></button>`;
    $('files').innerHTML = back + entries.map(entry => `<div class="file-card library-card ${this.selection.items.has(entry.path) ? 'selected' : ''}" data-path="${escape(entry.path)}" title="${escape(entry.path)}" role="group" aria-label="${escape(entry.name)}"><input type="checkbox" class="file-select" aria-label="勾选 ${escape(entry.name)}" ${['file','folder'].includes(entry.kind) ? '' : 'disabled'} hidden><button type="button" class="file-open" aria-label="打开 ${escape(entry.name)}"><span class="file-art ${entry.kind === 'folder' ? 'folder' : /^[a-z0-9]+$/.test(entry.format) ? entry.format : ''}">${icon(entry.kind === 'folder' ? 'folder' : 'file')}${entry.kind === 'file' ? `<span class="file-type">${escape(entry.format.toUpperCase().slice(0, 8))}</span>` : ''}</span><span class="file-name">${escape(entry.name)}</span><span class="file-info">${query?escape(entry.path):`${entry.kind === 'folder' ? '文件夹' : bytesLabel(entry.size)} · ${new Date(entry.modifiedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`}</span></button>${this.moreButton(entry)}</div>`).join('');
    $('folder-back')?.addEventListener('click', run(() => this.navigate(parent)));
    const byPath=new Map(entries.map(entry=>[entry.path,entry]));
    for (const card of $('files').querySelectorAll('.file-card')) {
      const entry = byPath.get(card.dataset.path);
      const open = card.querySelector('.file-open');
      card.querySelector('.file-select').addEventListener('click', event => { event.stopPropagation(); this.selection.toggle(entry, event.shiftKey); });
      card.addEventListener('click', run(event => {
        if (event.target.closest('.file-more,.file-select') || event.detail > 1 || event.detail > 0 && Date.now() < (this.drag.suppressClickUntil || 0)) return;
        if (this.selection.mode || event.metaKey || event.ctrlKey || event.shiftKey) this.selection.toggle(entry, event.shiftKey);
        else return this.open(entry);
      }));
      open.addEventListener('keydown', event => {
        if (event.key === 'F2') { event.preventDefault(); this.action('rename', entry); }
        if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { event.preventDefault(); this.showMenu(entry, card.querySelector('.file-more')); }
      });
      card.addEventListener('contextmenu', event => this.context(event, entry));
      this.bindMore(card, entry); this.drag.bindSource(card, entry); this.drag.bindTarget(card, entry);
    }
    $('files').append(emptyState,noMatches);
    this.renderSelection(); this.previews.attach(entries);this.filesRenderKey=renderKey;
  }
  renderSelection() { this.selection.render(); }
  open(entry) { this.closeMenu(); this.selection.reset(); if (entry.kind === 'folder') { this.expanded.add(entry.path); return this.navigate(entry.path); } if (!entry.readable) throw new Error('该文件类型目前无法阅读，仍可使用文件管理操作。'); return this.openDocument(entry.path); }
  closeMenu(focus = false) {
    this.menu?.remove(); this.menu = null;
    this.menuTrigger?.setAttribute('aria-expanded', 'false');
    if (focus && this.menuTrigger?.isConnected) this.menuTrigger.focus();
    this.menuTrigger = null;
  }
  context(event, entry) { event.preventDefault(); event.stopPropagation(); this.showMenu(entry, event.currentTarget.querySelector('.file-more'), { x: event.clientX, y: event.clientY }); }
  showMenu(entry, trigger, point) {
    if (this.menu && this.menuTrigger === trigger && !point) { this.closeMenu(true); return; }
    this.closeMenu(); this.selected = entry;
    const menu = document.createElement('div'); menu.className = 'context-menu file-context-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `${entry.name} 的操作`);
    menu.innerHTML = [['open','打开','file'],['rename','重命名','edit'],['move','移动到…','folder'],['copy','复制到…','copy'],['trash','移入回收站','trash']].map(([action, title, symbol]) => `<button type="button" data-action="${action}" role="menuitem" class="${action === 'trash' ? 'danger' : ''}">${icon(symbol)}<span>${title}</span></button>`).join('');
    document.body.append(menu); this.menu = menu; this.menuTrigger = trigger; trigger?.setAttribute('aria-expanded', 'true');
    const box = trigger?.getBoundingClientRect(), x = point?.x ?? (box?.right || 0) - menu.offsetWidth, y = point?.y ?? box?.bottom ?? 0;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
    const buttons = [...menu.querySelectorAll('button')];
    buttons.forEach(button => button.addEventListener('click', event => { event.stopPropagation(); this.closeMenu(); run(() => button.dataset.action === 'open' ? this.open(entry) : this.action(button.dataset.action, entry))(); }));
    menu.addEventListener('keydown', event => {
      if (!['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)) return;
      if (event.key === 'Tab') { this.closeMenu(true); return; }
      event.preventDefault();
      const at = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
    buttons[0].focus({ preventScroll: true });
  }
}
