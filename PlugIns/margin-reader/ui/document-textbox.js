import { $, icon, run, toast } from './dom.js';
import { pagePoint } from './page-slices.mjs';

// Direct creation seeds the existing versioned note-placement dialog. Nothing
// is written until the user confirms, including when text is dropped on a page.
export class DocumentTextbox {
  constructor(study) {
    this.study = study; this.active = false;
    const button = document.createElement('button'); button.id = 'document-textbox'; button.type = 'button';
    button.innerHTML = icon('edit') + '<span>文本框</span>';
    button.title = '在原页点击放置文本框，也可拖入文字'; button.setAttribute('aria-pressed', 'false');
    $('study-extend-note').after(button); button.onclick = run(() => this.toggle());
    const scroller = $('reader-scroll');
    scroller.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0) return;
      const target = this.target(event); if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.cancel(); run(() => this.place(target))();
    }, true);
    scroller.addEventListener('contextmenu', event => {
      if (event.defaultPrevented || this.study.ink?.mode !== 'off' || this.study.excerpts?.hits(event.clientX, event.clientY).length) return;
      const selection = window.getSelection(); if (selection && !selection.isCollapsed) return;
      const target = this.target(event); if (!target) return;
      event.preventDefault(); this.closeMenu();
      const menu = document.createElement('div'); menu.className = 'context-menu document-textbox-menu'; menu.setAttribute('role', 'menu');
      menu.innerHTML = '<button type="button" role="menuitem">在此处创建文本框</button>';
      document.body.append(menu); this.menu = menu;
      menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, event.clientX)) + 'px';
      menu.style.top = Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, event.clientY)) + 'px';
      menu.querySelector('button').onclick = run(() => { this.closeMenu(); return this.place(target); });
      menu.querySelector('button').focus({ preventScroll: true });
    });
    const textDrop = event => event.dataTransfer && ![...event.dataTransfer.types].includes('Files') && [...event.dataTransfer.types].includes('text/plain');
    scroller.addEventListener('dragover', event => {
      if (!textDrop(event) || !this.target(event)) return;
      event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
    });
    scroller.addEventListener('drop', event => {
      if (!textDrop(event)) return; const target = this.target(event); if (!target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const text = event.dataTransfer.getData('text/plain');
      if (!text.trim()) return;
      if (text.length > 20000) { toast('拖入文字超过 20000 字符，请缩小选段。', true); return; }
      run(() => this.place(target, text))();
    }, true);
    document.addEventListener('pointerdown', e => { if (this.menu && !this.menu.contains(e.target)) this.closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { this.cancel(); this.closeMenu(); } });
    document.addEventListener('study-view-mounted', () => this.render());
    for (const id of ['study-pen','study-eraser','study-lasso','study-region','study-excerpt-lasso']) $(id)?.addEventListener('click', () => this.cancel());
    this.render();
  }
  render() {
    const doc = this.study.getDocument(), set = this.study.current;
    $('document-textbox').hidden = doc?.kind !== 'pdf';
    $('document-textbox').disabled = !set?.documentIds.includes(doc?.id);
    if (!set || doc?.kind !== 'pdf' || this.documentId && this.documentId !== doc.id) this.cancel();
  }
  toggle() {
    if (this.active) { this.cancel(); return; }
    this.study.inspector?.guard();
    if (this.study.ink?.dirty || this.study.cardInk?.dirty) throw Error('请先保存或放弃尚未保存的笔迹。');
    const doc = this.study.getDocument();
    if (!this.study.current?.documentIds.includes(doc?.id) || doc.kind !== 'pdf') throw Error('先在学习集中打开 PDF。');
    this.study.ink.setMode('off'); this.study.cardInk.modeSet('off'); this.study.excerpts.setRegion(false);
    this.active = true; this.documentId = doc.id;
    $('document-textbox').setAttribute('aria-pressed', 'true'); $('reader-scroll').classList.add('placing-textbox');
    toast('点击原页放置文本框；Escape 取消。');
  }
  cancel() {
    this.active = false; this.documentId = null;
    $('document-textbox')?.setAttribute('aria-pressed', 'false'); $('reader-scroll').classList.remove('placing-textbox');
  }
  closeMenu() { this.menu?.remove(); this.menu = null; }
  target(event) {
    const doc = this.study.getDocument(), set = this.study.current;
    if (!set || doc?.kind !== 'pdf' || !set.documentIds.includes(doc.id) || $('dialog').open) return null;
    const element = event.target instanceof Element ? event.target : null;
    if (!element || element.closest('button,input,textarea,select,[data-page-ui],.pdf-note,.pdf-fold-bar,.pdf-unfold')) return null;
    const page = element.closest('.pdf-page[data-render-state=ready]');
    if (!page || $('reader-scroll').getAttribute('aria-busy') === 'true') return null;
    const [x,y] = pagePoint(page, event.clientX, event.clientY);
    return { setId:set.id, documentId:doc.id, sourceVersion:doc.sourceVersion, locator:{page:Number(page.dataset.page), pageOffset:Math.min(.84,y)}, rect:{x:Math.min(.7,x),y:Math.min(.84,y),width:.3,height:.16} };
  }
  place(target, text = '') {
    this.study.inspector?.guard();
    if (this.study.ink?.dirty || this.study.cardInk?.dirty) throw Error('请先结束当前书写。');
    if (this.study.current?.id !== target.setId || this.study.getDocument()?.id !== target.documentId || this.study.getDocument()?.sourceVersion !== target.sourceVersion) throw Error('文档已切换或更新，请重新选择位置。');
    this.cancel(); this.closeMenu();
    this.study.advanced.extend(undefined, {locator:target.locator,rect:target.rect,display:'overlay',text,title:text.split(/\r?\n/).find(line=>line.trim())?.trim().slice(0,80)||'文本框'});
  }
}
