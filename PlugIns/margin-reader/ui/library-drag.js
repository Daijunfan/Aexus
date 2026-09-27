import { $, baseName, parentPath, joinPath, run, toast } from './dom.js';
import { api } from './transport.js';
const TYPE = 'application/x-margin-reader-path';
export class LibraryDrag {
  constructor(library) {
    this.library = library; this.source = null; this.busy = false;
    const status = document.createElement('div'); status.id = 'file-drop-status'; status.className = 'file-drop-status'; status.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); document.body.append(status); this.status = status;
    this.bindTarget($('library-root'), { kind: 'folder', path: '.', name: '我的文库' });
    document.addEventListener('dragover', event => {
      if (!this.isFileDrag(event)) return;
      event.preventDefault();
      if (this.external(event)) { event.dataTransfer.dropEffect = 'copy'; this.feedback(null, `松开导入到「${this.library.folder === '.' ? '我的文库' : this.library.folder}」`, true); }
    });
    document.addEventListener('drop', event => {
      if (!this.isFileDrag(event)) return;
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files);
      this.clear();
      if (files.length && !this.busy) run(() => this.library.importFiles(files))();
    });
    document.addEventListener('dragend', () => { this.suppressClickUntil = Date.now() + 180; this.source = null; this.clear(); });
    document.addEventListener('dragleave', event => { if (!event.relatedTarget) this.clear(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { this.source = null; this.clear(); } });
  }
  external(event) { return Array.from(event.dataTransfer?.types || []).includes('Files'); }
  isFileDrag(event) { const types = Array.from(event.dataTransfer?.types || []); return types.includes(TYPE) || types.includes('Files'); }
  bindSource(element, entry) {
    if (!['file','folder'].includes(entry.kind)) return;
    element.draggable = true;
    element.addEventListener('dragstart', event => {
      if (this.library.selection.mode || event.target.closest('.file-more,.file-select')) { event.preventDefault(); return; }
      this.library.closeMenu(); this.source = entry;
      event.dataTransfer.setData(TYPE, entry.path); event.dataTransfer.effectAllowed = 'move'; element.classList.add('drag-source');
    });
  }
  reason(entry) {
    const source = this.source;
    if (!source) return '请在当前窗口拖动文件';
    if (entry.path === source.path || entry.path.startsWith(source.path + '/')) return '不能移入自身或子文件夹';
    if (parentPath(source.path) === entry.path) return '文件已在此文件夹中';
    const children = entry.path === '.' ? this.library.tree : this.library.find(entry.path)?.children;
    if (children?.some(item => item.name === source.name)) return '目标文件夹中已有同名文件';
    return null;
  }
  feedback(entry, message, allowed) {
    if (this.busy) return;
    for (const target of document.querySelectorAll('[data-drop-folder]')) {
      const selected = entry && target.dataset.dropFolder === entry.path;
      target.classList.toggle('drop-target', Boolean(selected && allowed));
      target.classList.toggle('drop-rejected', Boolean(selected && !allowed));
    }
    $('drop-overlay').hidden = true;
    this.status.textContent = message; this.status.hidden = false;
    this.status.dataset.state = allowed ? 'allowed' : 'rejected';
    document.body.classList.toggle('external-file-drag', !entry && allowed);
  }
  clear() {
    if (this.busy) return;
    for (const target of document.querySelectorAll('.drop-target,.drop-rejected,.drag-source')) target.classList.remove('drop-target','drop-rejected','drag-source');
    this.status.hidden = true; $('drop-overlay').hidden = true; document.body.classList.remove('external-file-drag');
  }
  bindTarget(element, entry) {
    if (entry.kind !== 'folder') return;
    element.dataset.dropFolder = entry.path;
    const over = event => {
      if (!this.isFileDrag(event)) return;
      event.preventDefault(); event.stopPropagation();
      const external = this.external(event), reason = this.busy ? '正在处理上一次拖放' : external ? null : this.reason(entry);
      event.dataTransfer.dropEffect = reason ? 'none' : external ? 'copy' : 'move';
      this.feedback(entry, reason || `松开${external ? '导入' : '移动'}到「${entry.path === '.' ? '我的文库' : entry.path}」`, !reason);
    };
    element.addEventListener('dragenter', over); element.addEventListener('dragover', over);
    element.addEventListener('dragleave', event => { if (!element.contains(event.relatedTarget)) this.clear(); });
    element.addEventListener('drop', event => {
      if (!this.isFileDrag(event)) return;
      event.preventDefault(); event.stopPropagation();
      if (this.busy) return;
      const external = this.external(event), reason = external ? null : this.reason(entry);
      if (reason) { this.clear(); toast(reason, true); return; }
      const source = this.source, files = Array.from(event.dataTransfer.files);
      this.busy = true; element.classList.add('drop-pending');
      this.status.textContent = `正在${external ? '导入' : '移动'}到「${entry.path === '.' ? '我的文库' : entry.path}」…`;
      run(async () => {
        try {
          if (external) await this.library.importFiles(files, { folder: entry.path, openLast: false });
          else {
            await api('fs.move', { path: source.path, target: joinPath(entry.path, baseName(source.path)), expectedVersion: source.version });
            this.library.expanded.add(entry.path);
            await this.library.refresh(); await this.library.changed();
            toast(`已移动到「${entry.path === '.' ? '我的文库' : entry.path}」`);
          }
        } finally { this.busy = false; this.source = null; element.classList.remove('drop-pending'); this.clear(); }
      })();
    });
  }
}
