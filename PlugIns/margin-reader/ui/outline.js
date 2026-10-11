import { $, escape, icon, run, field, showDialog, toast } from './dom.js';
import { api } from './transport.js';
export class Outline {
  constructor({ getDocument, getLocator, navigate, changed }) {
    this.getDocument = getDocument; this.getLocator = getLocator; this.navigate = navigate; this.changed = changed; this.selected = null; this.collapsed = new Set();
    $('add-chapter').addEventListener('click', run(() => this.edit(true)));
    $('edit-chapter').addEventListener('click', run(() => this.edit(false)));
    $('remove-chapter').addEventListener('click', run(() => this.remove()));
    $('indent-chapter').addEventListener('click', run(() => this.mutate('toc.indent')));
    $('outdent-chapter').addEventListener('click', run(() => this.mutate('toc.outdent')));
    $('up-chapter').addEventListener('click', run(() => this.reorder(-1)));
    $('down-chapter').addEventListener('click', run(() => this.reorder(1)));
    $('reset-outline').addEventListener('click', () => showDialog({ title: '恢复原始目录', html: '<p class="dialog-note">自定义目录会被原文自带目录替换。原始文档不会被修改。</p>', submit: '恢复原始目录', onSubmit: async () => { const doc = this.getDocument(); await api('toc.reset', { id: doc.id, expectedRevision: doc.revision }); this.selected = null; await this.changed(); } }));
  }
  currentNode() { return this.getDocument()?.toc.find(n => n.id === this.selected); }
  async mutate(method, extra = {}) {
    const doc = this.getDocument(); if (!doc || !this.selected) return;
    try { await api(method, { id: doc.id, expectedRevision: doc.revision, nodeId: this.selected, ...extra }); }
    finally { await this.changed(); }
    this.focus();
  }
  focus() { $('outline-tree').querySelector(`[data-node="${CSS.escape(this.selected || '')}"]`)?.focus({ preventScroll: true }); }
  async reorder(direction) {
    const doc = this.getDocument(), node = this.currentNode(); if (!doc || !node) return;
    const siblings = doc.toc.filter(n => n.parentId === node.parentId), position = siblings.findIndex(n => n.id === node.id), target = position + direction;
    if (target < 0 || target >= siblings.length) return;
    await this.mutate('toc.move', { parentId: node.parentId, index: target });
  }
  render() {
    const doc = this.getDocument(); if (!doc) return;
    if (!doc.toc.some(n => n.id === this.selected)) this.selected = null;
    const selected = this.currentNode();
    for (const id of ['edit-chapter','indent-chapter','outdent-chapter','remove-chapter','up-chapter','down-chapter']) $(id).disabled = !selected;
    if (selected) {
      const siblings = doc.toc.filter(n => n.parentId === selected.parentId), index = siblings.findIndex(n => n.id === selected.id);
      $('indent-chapter').disabled = index === 0; $('outdent-chapter').disabled = selected.parentId === null;
      $('up-chapter').disabled = index === 0; $('down-chapter').disabled = index === siblings.length - 1;
    }
    $('outline-count').textContent = doc.toc.length;
    const walk = (parent, depth) => doc.toc.filter(n => n.parentId === parent).map(node => {
      const children = doc.toc.some(n => n.parentId === node.id), collapsed = this.collapsed.has(node.id);
      return `<div class="outline-row ${node.id === this.selected ? 'selected' : ''} ${node.unresolved ? 'unresolved' : ''}" data-node="${escape(node.id)}" role="treeitem" tabindex="0" aria-level="${depth + 1}" aria-selected="${node.id === this.selected}" ${children ? `aria-expanded="${!collapsed}"` : ''} draggable="true" title="${escape(node.title)}${node.unresolved ? ' · 目标失效，请编辑章节位置' : ' · 拖动排序，按住 Option/Alt 拖动设为子章节'}" style="padding-left:${6 + depth * 15}px"><button class="twisty" tabindex="-1" aria-label="展开或折叠子章节">${children ? icon(collapsed ? 'chevron-right' : 'chevron-down') : ''}</button><span class="node-title">${escape(node.title)}</span><span class="node-position">${node.unresolved ? '!' : doc.kind === 'pdf' ? node.locator.page : doc.kind==='media'?`${node.locator.time.toFixed(1)}s`:node.locator.section + 1}</span></div>${children && !collapsed ? walk(node.id, depth + 1) : ''}`;
    }).join('');
    $('outline-tree').innerHTML = walk(null, 0) || '<div class="outline-empty">原文还没有章节目录。<br>点击右上角 ＋，<br>在当前阅读位置添加章节。</div>';
    for (const row of $('outline-tree').querySelectorAll('.outline-row')) {
      const node = doc.toc.find(n => n.id === row.dataset.node);
      row.addEventListener('click', run(async event => {
        if (event.target.closest('.twisty')) { this.collapsed.has(node.id) ? this.collapsed.delete(node.id) : this.collapsed.add(node.id); this.render(); return; }
        this.selected = node.id; this.render(); this.focus(); await this.navigate(node.locator);
      }));
      row.addEventListener('dblclick', run(() => { this.selected = node.id; return this.edit(false); }));
      row.addEventListener('keydown', run(async event => {
        this.selected = node.id;
        if (event.key === 'Tab') { event.preventDefault(); await this.mutate(event.shiftKey ? 'toc.outdent' : 'toc.indent'); }
        else if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); await this.reorder(event.key === 'ArrowUp' ? -1 : 1); }
        else if (event.key === 'Enter') { event.preventDefault(); await this.navigate(node.locator); }
        else if (event.key === 'F2') { event.preventDefault(); await this.edit(false); }
        else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.remove(); }
        else if (event.key === 'Escape') $('add-chapter').focus();
      }));
      row.addEventListener('dragstart', event => { this.selected = node.id; event.dataTransfer.setData('application/x-margin-reader-chapter', node.id); event.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('application/x-margin-reader-chapter')) { event.preventDefault(); row.classList.toggle('drop-child', event.altKey); row.classList.toggle('drop-before', !event.altKey); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop-before','drop-child'));
      row.addEventListener('drop', run(async event => {
        const from = event.dataTransfer.getData('application/x-margin-reader-chapter'); if (!from) return;
        event.preventDefault(); row.classList.remove('drop-before','drop-child'); if (from === node.id) return;
        this.selected = from;
        const siblings = this.getDocument().toc.filter(n => n.parentId === node.parentId && n.id !== from);
        await this.mutate('toc.move', event.altKey ? { parentId: node.id } : { parentId: node.parentId, index: siblings.findIndex(n => n.id === node.id) });
      }));
    }
  }
  async edit(add) {
    const doc = this.getDocument(); if (!doc) return;
    const node = this.currentNode(); if (!add && !node) return;
    const location = add ? this.getLocator() : node.locator;
    const expectedRevision = doc.revision;
    let html = field('title', '章节标题', add ? '' : node.title, { required: true });
    if(doc.kind==='media')html+=field('time','跳转时间（秒）',location.time||0,{type:'number',min:0,max:doc.media.duration,required:true});
    else if (doc.kind === 'pdf') html += field('page', '跳转页码', location.page || 1, { type: 'number', min: 1, max: doc.pageCount, required: true, help: `共 ${doc.pageCount} 页，页码从 1 开始。` });
    else html += field('section', '所在章节', location.section ?? 0, { choices: doc.sections.map(s => [s.index, `${s.index + 1}. ${s.title}`]) }) + field('anchor', '定位锚点（可留空）', location.anchor || '', { help: '留空跳转到此章节开头；默认使用当前阅读位置。锚点由文档解析生成。' });
    if (add) html += field('parent', '目录层级', node?.parentId || '', { choices: [['','顶层章节'], ...doc.toc.map(n => [n.id, n.title])] });
    showDialog({ title: add ? '添加章节' : '编辑章节', html, onSubmit: async values => {
      const current = this.getDocument();
      const locator = doc.kind==='media'?{time:Number(values.time)}:doc.kind === 'pdf' ? { page: Number(values.page) } : { section: Number(values.section), ...(values.anchor.trim() ? { anchor: values.anchor.trim() } : {}) };
      try {
        const result = await api(add ? 'toc.add' : 'toc.update', { id: doc.id, expectedRevision, title: values.title, locator, ...(add ? { parentId: values.parent || null } : { nodeId: node.id }) });
        if (add) this.selected = result.toc.find(n => !doc.toc.some(old => old.id === n.id))?.id || this.selected;
        toast(add ? '章节已添加' : '章节已保存');
      } finally { await this.changed(); }
    },afterOpen:()=>{if(doc.kind==='media')$('dialog-fields').querySelector('[name=time]').step='0.1';} });
  }
  remove() {
    const doc = this.getDocument(), node = this.currentNode(); if (!doc || !node) return;
    const hasChildren = doc.toc.some(n => n.parentId === node.id);
    showDialog({ title: '删除目录章节', html: `<p class="dialog-note">删除「${escape(node.title)}」？只修改目录，不删除原文。</p>` + (hasChildren ? field('mode', '子章节处理', 'promote', { choices: [['promote','保留子章节，并提升一级'],['subtree','同时删除其目录子章节']] }) : ''), submit: '删除章节', onSubmit: async values => {
      await this.mutate('toc.remove', { mode: values.mode || 'promote' }); this.selected = null; this.render();
    } });
  }
}
