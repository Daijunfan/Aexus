import { $, escape, field, showDialog, run, toast } from './dom.js';
import { api } from './transport.js';

// Selection is transient UI state. File mutations all go through fs.batch.
export class LibrarySelection {
  constructor(library) {
    this.library = library; this.mode = false; this.items = new Map(); this.anchor = null; this.folder = library.folder;
    $('select-files').addEventListener('click', () => this.setMode(!this.mode));
    $('select-all-files').addEventListener('click', () => this.toggleAll());
    for (const [id, action] of [['rename-file','rename'],['move-file','move'],['copy-file','copy'],['trash-file','trash']]) {
      $(id).addEventListener('click', run(() => this.action(action)));
    }
    document.addEventListener('keydown', event => {
      if ($('library-view').hidden || $('dialog').open || library.menu || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
      if (event.key === 'Escape' && this.mode) { event.preventDefault(); this.setMode(false); $('select-files').focus(); }
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && event.target.closest('#files,#selection-bar')) {
        event.preventDefault(); if (!this.mode) this.setMode(true); this.selectAll();
      }
    });
  }
  candidates() { return this.library.visibleEntries().filter(entry => ['file','folder'].includes(entry.kind)); }
  reset() { this.mode = false; this.items.clear(); this.anchor = null; this.render(); }
  setMode(value) {
    this.library.closeMenu(); this.mode = value;
    if (!value) { this.items.clear(); this.anchor = null; }
    this.render();
  }
  sync() {
    if (this.folder !== this.library.folder) { this.mode = false; this.items.clear(); this.anchor = null; this.folder = this.library.folder; }
    const current = new Set(this.candidates().map(entry => entry.path));
    for (const name of this.items.keys()) if (!current.has(name)) this.items.delete(name);
    // Keep the selected versions: a refresh must not silently authorize acting on changed files.
  }
  toggle(entry, range = false) {
    if (!['file','folder'].includes(entry.kind)) return;
    if (!this.mode) this.setMode(true);
    const candidates = this.candidates(), start = candidates.findIndex(e => e.path === this.anchor), end = candidates.findIndex(e => e.path === entry.path);
    if (range && start >= 0 && end >= 0) {
      const selected = candidates.slice(Math.min(start,end), Math.max(start,end) + 1);
      if (new Set([...this.items.keys(), ...selected.map(e => e.path)]).size > 500) { toast('一次最多选择 500 项，请分批处理。', true); return; }
      for (const e of selected) if (!this.items.has(e.path)) this.items.set(e.path, { ...e });
    } else if (this.items.has(entry.path)) this.items.delete(entry.path);
    else {
      if (this.items.size >= 500) { toast('一次最多选择 500 项，请分批处理。', true); return; }
      this.items.set(entry.path, { ...entry });
    }
    if (!range || start < 0) this.anchor = entry.path;
    this.render();
  }
  selectAll() {
    const entries = this.candidates();
    if (entries.length > 500) { toast('当前文件夹超过 500 项，请分批勾选。', true); return; }
    for (const entry of entries) if (!this.items.has(entry.path)) this.items.set(entry.path, { ...entry });
    this.render();
  }
  toggleAll() {
    if (this.items.size && this.items.size === this.candidates().length) { this.items.clear(); this.anchor = null; this.render(); }
    else this.selectAll();
  }
  render() {
    const size = this.items.size;
    $('select-files').textContent = this.mode ? '完成' : '选择';
    $('select-files').setAttribute('aria-pressed', String(this.mode));
    $('selection-tools').hidden = !this.mode;
    $('select-all-files').textContent = size && size === this.candidates().length ? '取消全选' : '全选';
    $('select-all-files').disabled = !this.candidates().length;
    $('selection-actions').hidden = !this.mode || size === 0;
    $('rename-file').hidden = size !== 1;
    $('selected-name').textContent = this.mode ? `已选择 ${size} 项` : '单击打开 · ⋯ 更多操作';
    $('files').classList.toggle('selecting', this.mode);
    const byPath=new Map(this.library.visibleEntries().map(entry=>[entry.path,entry]));
    for (const card of $('files').querySelectorAll('.file-card')) {
      const selected = this.items.has(card.dataset.path), check = card.querySelector('.file-select');
      card.classList.toggle('selected', selected);
      if (check) { check.hidden = !this.mode; check.checked = selected; }
      const entry = byPath.get(card.dataset.path);
      card.draggable = !this.mode && Boolean(entry && ['file','folder'].includes(entry.kind));
      const open = card.querySelector('.file-open');
      if (entry) open.setAttribute('aria-label', `${this.mode ? '选择' : '打开'} ${entry.name}`);
      if (this.mode) open.setAttribute('aria-pressed', String(selected)); else open.removeAttribute('aria-pressed');
    }
  }
  action(action) {
    const chosen = [...this.items.values()].map(entry => ({ ...entry }));
    if (!chosen.length) return;
    if (action === 'rename') { if (chosen.length === 1) this.library.action('rename', chosen[0]); return; }
    const labels = { move: '移动', copy: '复制', trash: '移入回收站' }, label = labels[action];
    if (!label) return;
    const folders = this.library.folders().filter(([folder]) => !chosen.some(entry => entry.kind === 'folder' && (folder === entry.path || folder.startsWith(entry.path + '/'))));
    const summary = `<div class="batch-summary"><strong>已选择 ${chosen.length} 项</strong><p>${chosen.slice(0,8).map(entry => escape(entry.name)).join('<br>')}${chosen.length > 8 ? `<br>以及另外 ${chosen.length - 8} 项` : ''}</p></div>`;
    const input = action === 'trash' ? '<p class="dialog-note">这些文件和文件夹将一起移入回收站，可以恢复。不会永久删除或修改外部原件。</p>'
      : field('folder', '目标文件夹', folders.find(([folder]) => folder !== this.library.folder)?.[0] ?? '.', { choices: folders }) + '<p class="dialog-note">保留原名称。若有同名冲突或文件已变化，整批操作会停止，不覆盖现有文件。</p>';
    showDialog({ title: `${label} ${chosen.length} 项`, html: summary + input, submit: label, onSubmit: async values => {
      const result = await api('fs.batch', { action, items: chosen.map(entry => ({ path: entry.path, expectedVersion: entry.version })), ...(action !== 'trash' ? { folder: values.folder } : {}) }).catch(error => {
        if (error.details?.failedPath) error.message += `\n涉及文件：${error.details.failedPath}`;
        if (error.code === 'CONFLICT') error.message += '\n请取消对话框，重新勾选已变化的文件后再操作。';
        throw error;
      });
      this.items.clear(); this.anchor = null;
      await this.library.refresh(); await this.library.changed();
      toast(`已${label} ${result.count} 项`);
    } });
  }
}
