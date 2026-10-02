import { $, escape, run, showDialog, closeDialog, modalDirty, toast } from './dom.js';
import { api, base } from './transport.js';
import { readingText, readingRange } from './dictionary-ranges.mjs';
const BLOCK = 65536, MAX_MARKS = 200;
const uri = target => `margin-reader://card/${target.setId}/${target.cardId}`;
export class ReaderDictionary {
  constructor(study) {
    this.study = study; this.records = new Map();this.pointerIds=new Set();
    const button = document.createElement('button'); button.id = 'reader-dictionary-more'; button.textContent = '后续词条'; button.hidden = true;
    button.title = '正文词条按组显示；读取后续结果，不改变原始文本'; $('study-linkage').after(button);
    button.onclick = run(async () => {
      const record = [...this.records.values()].find(r => r.next);
      if (!record) return;
      record.cursor = record.next; record.resultKey = null; await this.refresh();
      record.layer?.querySelector('button')?.scrollIntoView({ block: 'center' });
    });
    const scroller = $('reader-scroll');
    scroller.addEventListener('pointerdown', e => { clearTimeout(this.clickTimer);this.pointerIds.add(e.pointerId); this.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId }; }, true);
    for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{this.pointerIds.delete(e.pointerId);if(this.pendingPaint)this.schedule();});
    document.addEventListener('selectionchange',()=>{if(this.pendingPaint)this.schedule();});
    scroller.addEventListener('dblclick', () => clearTimeout(this.clickTimer), true);
    scroller.addEventListener('pointerup', e => this.clicked(e), true);
    scroller.addEventListener('scroll', () => this.schedule(), { passive: true });
    new ResizeObserver(() => this.schedule()).observe(scroller);
    new MutationObserver(records => {
      if (records.some(r => r.type === 'attributes' || !r.target.closest?.('.reader-dictionary-layer') && [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1 && !n.classList.contains('reader-dictionary-layer')))) this.schedule();
    }).observe($('reading-surface'), { childList: true, subtree: true, attributes: true, attributeFilter: ['data-render-state'] });
    document.addEventListener('study-view-mounted', () => this.schedule());
  }
  signature() { return JSON.stringify([this.study.current?.id, this.study.current?.linkSettings, this.study.list.map(s => [s.id,s.revision])]); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => run(() => this.refresh())(), 90); }
  clear() { for (const record of this.records.values()) {record.layer?.remove();record.resize?.disconnect();} this.records.clear(); $('reader-dictionary-more').hidden = true; }
  blocked(){
    const shadow=this.study.getRenderer().shadow,selection=shadow?.getSelection?.()||window.getSelection();
    return this.pointerIds.size>0||$('reader-scroll').getAttribute('aria-busy')==='true'||Boolean(selection&&!selection.isCollapsed&&($('reader-scroll').contains(selection.anchorNode)||shadow?.contains(selection.anchorNode)));
  }
  async refresh() {
    if(this.blocked()){this.pendingPaint=true;return;}this.pendingPaint=false;
    if (this.running) { this.again = true; return; }
    this.running = true;
    try {
      const set = this.study.current, doc = this.study.getDocument(), signature = this.signature();
      if (!set || !doc || doc.sourceChanged || set.linkSettings?.titleLinks === false || set.linkSettings?.documentLinks === false) { this.clear(); return; }
      const shadow = this.study.getRenderer().shadow;
      const roots = doc.kind === 'pdf' ? [...$('reading-surface').querySelectorAll('.pdf-page[data-render-state=ready] .textLayer')] : doc.kind === 'flow' && shadow?.querySelector('article') ? [shadow.querySelector('article')] : [];
      for (const [root, record] of this.records) if (!roots.includes(root)) { record.layer?.remove(); record.resize?.disconnect(); this.records.delete(root); }
      for (const root of roots) {
        if (this.signature() !== signature || this.study.getDocument()?.id !== doc.id) { this.again = true; return; }
        const reading = readingText(root), host = doc.kind === 'pdf' ? root.parentElement : root;
        let record = this.records.get(root);
        if (!record || record.signature !== signature || record.text !== reading.text) {
          record?.layer?.remove();record?.resize?.disconnect(); record = { root, host, signature, text: reading.text, cursor: { start: 0, offset: 0 } }; this.records.set(root, record);
          record.resize=new ResizeObserver(()=>this.schedule());record.resize.observe(host);
        }
        record.nodes = reading.nodes;
        const key = JSON.stringify(record.cursor);
        if (record.resultKey !== key) {
          let { start, offset } = record.cursor; const hits = []; let next = null;
          while (start < reading.text.length && hits.length < MAX_MARKS) {
            const text = reading.text.slice(start, start + BLOCK + 200);
            const result = await api('study.dictionary.match', { setId: set.id, text, offset, limit: MAX_MARKS - hits.length });
            if (!root.isConnected || this.signature() !== signature || this.study.getDocument()?.id !== doc.id) { this.again = true; return; }
            if(!result.dictionaryTerms){next=null;break;}
            for (const hit of result.matches) if (hit.start < BLOCK) hits.push({ ...hit, start: hit.start + start, end: hit.end + start });
            if (result.nextOffset !== null && result.matches.at(-1)?.start < BLOCK) { offset = result.nextOffset; next = { start, offset }; }
            else { start = Math.max(start+BLOCK,hits.at(-1)?.end||0); offset = 0; next = start < reading.text.length ? { start, offset } : null; }
            if (!next || hits.length >= MAX_MARKS) break;
          }
          record.hits = hits; record.next = next; record.resultKey = key;
        }
        this.paint(record);
      }
      const more = [...this.records.values()].some(r => r.next); $('reader-dictionary-more').hidden = !more;
    } finally { this.running = false; if (this.again) { this.again = false; this.schedule(); } }
  }
  paint(record) {
    if (!record.root.isConnected) return;
    if(this.blocked()){this.pendingPaint=true;return;}
    if(!record.hits?.length){record.layer?.remove();record.layer=null;record.buttons=[];return;}
    const paintKey=JSON.stringify([record.resultKey,record.host.clientWidth,record.host.clientHeight]);
    const firstNode=record.nodes[0]?.node,lastNode=record.nodes.at(-1)?.node;
    if(record.layer?.isConnected&&record.paintKey===paintKey&&record.firstNode===firstNode&&record.lastNode===lastNode)return;
    record.paintKey=paintKey;record.firstNode=firstNode;record.lastNode=lastNode;
    if (!record.layer?.isConnected) {
      if (getComputedStyle(record.host).position === 'static') record.host.style.position = 'relative';
      const layer = document.createElement('div'); layer.className = 'reader-dictionary-layer';
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden'; record.host.append(layer); record.layer = layer;
    }
    const layer = record.layer, box = record.host.getBoundingClientRect();
    const sx = record.host.clientWidth / Math.max(1,box.width), sy = record.host.clientHeight / Math.max(1,box.height);
    const fragment = document.createDocumentFragment(); record.buttons = [];
    for (const hit of record.hits || []) {
      const range = readingRange(record.nodes, hit.start, hit.end); if (!range) continue;
      let first = true;
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0 || rect.bottom < box.top || rect.top > box.bottom) continue;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'reader-dictionary-hit';
        button.dataset.keyword = hit.text; button.setAttribute('aria-label', `查阅词条：${hit.text}`); button.tabIndex = first ? 0 : -1; first = false;
        button.style.cssText = `position:absolute;left:${(rect.left-box.left)*sx}px;top:${(rect.top-box.top)*sy}px;width:${rect.width*sx}px;height:${rect.height*sy}px;padding:0;margin:0;border:0;border-bottom:2px dotted ${hit.targets[0]?.color || '#2379c5'};border-radius:0;background:transparent;pointer-events:none`;
        button.onfocus = () => { button.style.outline = '2px solid #2379c5'; }; button.onblur = () => { button.style.outline = ''; };
        button.onkeydown = e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); run(() => this.lookup(hit.text))(); } };
        record.buttons.push({ button, hit }); fragment.append(button);
      }
    }
    layer.replaceChildren(fragment);
  }
  clicked(e) {
    if (e.button !== 0 || !this.pointer || this.pointer.id !== e.pointerId || Math.hypot(e.clientX-this.pointer.x,e.clientY-this.pointer.y)>4 || this.study.ink?.mode !== 'off' || this.study.excerpts.region) return;
    const selection = this.study.getRenderer().shadow?.getSelection?.() || window.getSelection();
    if (selection && !selection.isCollapsed) return;
    if (this.study.excerpts.hits(e.clientX,e.clientY).length) return; // Existing annotations keep their editing menu.
    const hit = [...this.records.values()].flatMap(r => r.buttons || []).find(({button}) => { const r=button.getBoundingClientRect(); return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom; });
    if (!hit) return;
    e.stopImmediatePropagation();
    this.clickTimer = setTimeout(() => run(() => this.lookup(hit.hit.text))(), 160);
  }
  async lookup(term, offset = 0) {
    if (modalDirty()) throw new Error('请先保存或取消当前编辑。');
    const setId = this.study.current?.id; if (!setId) return;
    const data = await api('study.dictionary.lookup', { setId, term, offset, limit: 30 });
    if (this.study.current?.id !== setId) return;
    if (!data.total) { toast('词条已移除或字典范围已变化'); this.schedule(); return; }
    if (data.total === 1) return this.preview(data.targets[0], term);
    if(modalDirty())throw new Error('请先保存或取消当前编辑。');closeDialog();
    showDialog({ title: `词条「${term}」 · ${data.total} 个候选`, html: '<div class="link-candidates">'+data.targets.map((t,i)=>`<button type="button" data-dictionary-candidate="${i}">${escape(t.setTitle)} / ${escape(t.cardTitle)}</button>`).join('')+'</div><div class="content-actions"><button type="button" id="dictionary-candidates-prev">上一页</button><button type="button" id="dictionary-candidates-next">下一页</button></div>', onSubmit: null, afterOpen: () => {
      $('dialog-fields').querySelectorAll('[data-dictionary-candidate]').forEach(b => b.onclick = run(() => this.preview(data.targets[Number(b.dataset.dictionaryCandidate)],term)));
      $('dictionary-candidates-prev').disabled = !offset; $('dictionary-candidates-next').disabled = data.nextOffset === null;
      $('dictionary-candidates-prev').onclick = run(() => this.lookup(term,Math.max(0,offset-30))); $('dictionary-candidates-next').onclick = run(() => this.lookup(term,data.nextOffset));
    } });
  }
  async preview(target, term) {
    if(modalDirty())throw new Error('请先保存或取消当前编辑。');
    const owner = await api('study.get', { setId: target.setId }), card = owner.cards.find(c => c.id === target.cardId);
    if (!card) throw new Error('词条卡片已移除，请重新检索。');
    const data = await api('study.card.render', { setId: target.setId, cardId: target.cardId });
    const comments = new Map((card.comments || []).map(c => [c.id,c]));
    const media = m => !m ? '' : m.kind === 'image' ? `<img src="${new URL('data/'+m.asset,base).href}" alt="${escape(m.name)}">` : `<audio controls preload="none" src="${new URL('data/'+m.asset,base).href}"></audio>`;
    if(modalDirty())throw new Error('请先保存或取消当前编辑。');closeDialog();
    showDialog({ title: `${owner.title} / ${card.title}`, html: '<p class="dialog-note">原文阅读位置保持不变。可查阅后关闭，或明确跳转到词条卡片。</p><div class="study-card-preview dictionary-card-preview">'+(card.imageAsset?`<img src="${new URL('data/'+card.imageAsset,base).href}" alt="${escape(card.title)}">`:'')+data.html+(data.noteHtml?'<hr>'+data.noteHtml:'')+data.comments.map(c=>`<section class="rich-comment">${c.html}${media(comments.get(c.id)?.media)}</section>`).join('')+'</div><div class="content-actions"><button type="button" id="dictionary-open-card">打开词条卡片</button><button type="button" id="dictionary-edit-card">编辑词条</button><button type="button" id="dictionary-all-candidates">查看全部候选</button><button type="button" id="dictionary-search-cards">检索相关卡片</button></div>', onSubmit: null, afterOpen: () => {
      this.study.content.bindLinks($('dialog-fields').querySelector('.dictionary-card-preview'), data);
      $('dictionary-open-card').onclick = run(() => this.study.content.openUri(uri(target)));
      $('dictionary-all-candidates').onclick = run(() => this.lookup(term));
      $('dictionary-search-cards').onclick=run(()=>{closeDialog();return this.study.boards.open(null,true,{query:term});});
      $('dictionary-edit-card').onclick = () => { closeDialog(); showDialog({ title: '编辑词条 · '+card.title, html: `<label class="dialog-field"><span>标题</span><input name="title" value="${escape(card.title)}" required></label><label class="dialog-field"><span>笔记 · Markdown / 公式</span><textarea name="note">${escape(card.note || '')}</textarea></label>`, onSubmit: async v => { await api('study.card.update', { setId: target.setId, expectedRevision: owner.revision, cardId: target.cardId, title: v.title, note: v.note }); await this.study.refreshList(); this.schedule(); } }); };
    } });
  }
}
