import { $, escape, icon, run, toast, activity, describeError, field, showDialog, bytesLabel, parentPath, baseName, joinPath } from './dom.js';
import { api } from './transport.js';
import { LibraryView } from './library-view.js';
import { LibraryPreviews } from './library-previews.js';
import { LibraryDrag } from './library-drag.js';
import { LibrarySelection } from './library-selection.js';
export class Library extends LibraryView {
  constructor({ openDocument, navigate, changed }) {
    super();
    this.openDocument = openDocument; this.navigate = folder => { this.selection.reset(); return navigate(folder); }; this.changed = changed;
    this.folder = '.'; this.view = 'grid'; this.entries = []; this.tree = []; this.expanded = new Set(); this.selected = null; this.activePath = null; this.generation = 0;
    this.previews = new LibraryPreviews(); this.selection = new LibrarySelection(this); this.drag = new LibraryDrag(this);
    const search=$('file-filter');
    search.addEventListener('input', () => { this.closeMenu();this.selection.reset();this.renderFiles(); });
    const clear=()=>{search.value='';search.dispatchEvent(new Event('input'));search.focus();};
    for(const id of ['clear-file-filter','reset-file-filter'])$(id).onclick=clear;
    search.addEventListener('keydown',event=>{if(event.key==='Escape'&&search.value&&!event.isComposing){event.preventDefault();event.stopPropagation();clear();}});
    $('new-folder').addEventListener('click', () => this.newFolder());
    $('import-files').addEventListener('click', () => $('file-input').click());
    $('empty-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', run(async event => { await this.importFiles(event.target.files); event.target.value = ''; }));
    $('import-url').addEventListener('click', () => this.importUrl());
    $('open-trash').addEventListener('click', run(() => this.trashDialog()));
    $('library-root').addEventListener('click', run(() => this.navigate('.')));
    $('refresh-files').addEventListener('click', run(() => this.refresh()));
    document.addEventListener('click', event => { if (!event.target.closest('.context-menu,.file-more')) this.closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && this.menu) { event.preventDefault(); this.closeMenu(true); } });
    window.addEventListener('resize', () => this.closeMenu());
  }
  async refresh() {
    const generation = ++this.generation;
    const [listing, tree] = await Promise.all([api('fs.list', { path: this.folder }), api('fs.tree', { depth: 64 })]);
    if (generation !== this.generation) return;
    this.entries = listing.entries; this.tree = tree.entries;
    if (this.selected) this.selected = this.find(this.selected.path);
    this.selection.sync();
    this.renderTree(); this.renderFiles();
    if (tree.truncated) toast('文件树条目超过单次上限；可以进入子文件夹继续浏览。');
  }
  find(path, entries = this.tree) { for (const entry of entries) { if (entry.path === path) return entry; if (entry.children) { const nested = this.find(path, entry.children); if (nested) return nested; } } return this.entries.find(e => e.path === path); }
  folders(exclude) {
    const result = [['.', '我的文库']];
    const walk = entries => { for (const entry of entries) if (entry.kind === 'folder' && entry.path !== exclude && !entry.path.startsWith((exclude || '\0') + '/')) { result.push([entry.path, entry.path]); walk(entry.children || []); } };
    walk(this.tree); return result;
  }
  setActive(path) {
    this.activePath = path;
    const parts = (path || '').split('/'); parts.pop(); let parent = '';
    for (const part of parts) { parent = parent ? `${parent}/${part}` : part; this.expanded.add(parent); }
    this.renderTree();
  }
  newFolder() {
    if(this.collection?.active)return this.collection.newFolder();
    const folder = this.folder;
    showDialog({ title: '新建文件夹', html: field('name', '文件夹名称', '', { required: true, help: `创建位置：${folder === '.' ? '我的文库' : folder}` }), submit: '创建', onSubmit: async values => {
      if (values.name.includes('/')) throw new Error('名称不能包含斜杠。');
      await api('fs.mkdir', { path: joinPath(folder, values.name.trim()) }); this.expanded.add(folder); await this.refresh(); toast('文件夹已创建');
    } });
  }
  action(action, entry = this.selected) {
    if (!entry) return;
    if (action === 'rename') {
      showDialog({ title: '重命名', html: field('name', '名称', entry.name, { required: true }), onSubmit: async values => {
        if (values.name.includes('/')) throw new Error('名称不能包含斜杠；移动文件请使用“移动到”。');
        await api('fs.move', { path: entry.path, target: joinPath(parentPath(entry.path), values.name.trim()), expectedVersion: entry.version }); await this.refresh(); await this.changed();
      } });
    } else if (action === 'move' || action === 'copy') {
      showDialog({ title: action === 'move' ? '移动到文件夹' : '复制到文件夹', html: field('folder', '目标文件夹', this.folder, { choices: this.folders(entry.kind === 'folder' ? entry.path : undefined) }) + field('name', '目标名称', entry.name, { required: true }), onSubmit: async values => {
        await api(action === 'move' ? 'fs.move' : 'fs.copy', { path: entry.path, target: joinPath(values.folder, values.name.trim()) }); await this.refresh(); await this.changed();
      } });
    } else if (action === 'trash') {
      showDialog({ title: '移入回收站', html: `<p class="dialog-note">将「${escape(entry.name)}」移入回收站？文件夹中的文件会一起移入，之后可以恢复。不会删除外部来源文件。</p>`, submit: '移入回收站', onSubmit: async () => {
        await api('fs.trash', { path: entry.path, expectedVersion: entry.version }); this.selected = null; await this.refresh(); await this.changed();
      } });
    }
  }
  async trashDialog() {
    const data = await api('fs.trash.list');
    const rows = () => data.items.length ? data.items.map(item => `<div class="trash-item"><div>${escape(item.path)}<small>${new Date(item.deletedAt).toLocaleString('zh-CN')}</small></div><button type="button" data-restore="${escape(item.id)}">恢复</button></div>`).join('') : '<p class="dialog-note">回收站是空的。</p>';
    const bind = () => $('dialog-fields').querySelectorAll('[data-restore]').forEach(button => button.addEventListener('click', run(async () => {
      button.disabled = true;
      try { await api('fs.restore', { trashId: button.dataset.restore }); data.items = data.items.filter(i => i.id !== button.dataset.restore); $('dialog-fields').innerHTML = rows(); bind(); await this.refresh(); await this.changed(); }
      finally { button.disabled = false; }
    })));
    showDialog({ title: '回收站', html: rows(), onSubmit: null, afterOpen: bind });
  }
  importUrl() {
    const folder = this.folder;
    showDialog({ title: '保存网页到文库', html: field('url', '博客或文档链接', '', { required: true, type: 'url', help: '输入公开网页链接，自动保存正文和可下载图片。也支持直接文档下载链接。' }) + field('name', '保存名称（可留空）') + `<p class="notice">保存位置：${escape(folder === '.' ? '我的文库' : folder)}<br>不会绕过登录、付费墙或 DRM。动态网页可能没有可提取的正文。</p>`, submit: '下载并保存', onSubmit: async values => {
      activity('正在下载正文与图片…');
      try {
        const doc = await api('web.import', { url: values.url, folder, ...(values.name.trim() ? { name: values.name.trim() } : {}) }); await this.refresh(); await this.openDocument(doc.path); toast('网页已保存，可以离线阅读');
      } finally { activity(''); }
    } });
  }
  async importFiles(files, options = {}) {
    const list = Array.from(files || []); if (!list.length) return;
    const folder = options.folder ?? this.folder; let lastDocument, failures = [];
    for (const [index, file] of list.entries()) {
      let upload;
      try {
        upload = await api('import.begin', { path: joinPath(folder, file.name), totalBytes: file.size });
        for (let offset = 0; offset < file.size; offset += upload.chunkSize) {
          activity(`导入 ${index + 1}/${list.length} · ${file.name} · ${Math.round(offset / file.size * 100)}%`);
          const bytes = new Uint8Array(await file.slice(offset, offset + upload.chunkSize).arrayBuffer());
          const parts = []; for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
          await api('import.chunk', { uploadId: upload.uploadId, offset, contentBase64: btoa(parts.join('')) });
        }
        activity(`解析 ${file.name}…`);
        lastDocument = await api('import.finish', { uploadId: upload.uploadId, activate: options.openLast !== false }); upload = null;
      } catch (error) {
        if (upload) await api('import.abort', { uploadId: upload.uploadId }).catch(() => {});
        failures.push(`${file.name}：${describeError(error)}`);
      }
    }
    activity(''); await this.refresh();
    if (lastDocument && options.openLast !== false) await this.openDocument(lastDocument.path);
    if (failures.length) toast(failures.join('\n'), true); else toast(`已导入 ${list.length} 份文档`);
  }
}
