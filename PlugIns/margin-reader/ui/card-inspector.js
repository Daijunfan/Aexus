import { $, escape, icon, run, toast, describeError } from './dom.js';
import { api, base } from './transport.js';
import {imageInkHtml} from './image-ink.js';

// A nonmodal editor over the same versioned card operations used by the CLI.
// A dirty draft is never replaced by selection, a delayed response or a live update.
export class CardInspector {
  constructor(study) {
    this.study = study; this.serial = 0; this.busy = false;
    const button = document.createElement('button');
    button.id = 'card-inspector-open'; button.type = 'button'; button.disabled = true;
    button.innerHTML = icon('edit') + '<span>详情</span>';
    button.title = '主题详情与原位编辑 · F2';
    $('study-add-note').after(button); button.onclick = run(() => this.openSelected());
    this.panel = document.createElement('aside');
    this.panel.id = 'card-inspector'; this.panel.className = 'card-inspector'; this.panel.hidden = true;
    this.panel.setAttribute('aria-label', '主题详情与原位编辑');
    this.panel.innerHTML = `<header class="inspector-heading"><span class="inspector-symbol">${icon('file')}</span><div><small id="inspector-kind"></small><h2>主题详情</h2></div><button id="inspector-close" type="button" aria-label="关闭主题详情">×</button></header>
      <form id="inspector-form"><div class="inspector-body">
      <p id="inspector-context" class="inspector-context"></p><figure id="inspector-image" hidden></figure>
      <label class="dialog-field"><span>标题</span><input name="inspector-title" maxlength="200" required></label>
      <label class="dialog-field inspector-body-field"><span id="inspector-body-label">正文</span><textarea name="inspector-body" maxlength="20000" rows="7"></textarea></label>
      <div class="inspector-format-tools" role="group" aria-label="正文格式"><button type="button" data-insert="bold">加粗</button><button type="button" data-insert="italic">斜体</button><button type="button" data-insert="code">代码</button><button type="button" data-insert="link">链接</button></div>
      <details id="inspector-original"><summary>不可变的原文摘录</summary><blockquote></blockquote></details>
      <label class="dialog-field"><span>我的笔记</span><textarea name="inspector-note" maxlength="20000" rows="4"></textarea></label>
      <div class="inspector-properties"><label class="dialog-field"><span>颜色</span><select name="inspector-color"></select></label><label class="dialog-field"><span>标签（逗号分隔）</span><input name="inspector-tags"></label></div>
      <div class="inspector-related"><button type="button" id="inspector-source">${icon('link')}回到原文</button><button type="button" id="inspector-saved-preview">查看保存内容</button><button type="button" id="inspector-comments">评论与附件</button></div>
      <div id="inspector-remote" class="inspector-warning" hidden><strong>主题版本已变化</strong><p id="inspector-remote-message"></p><details><summary>查看最新内容</summary><pre id="inspector-latest"></pre></details><button type="button" id="inspector-reload">载入最新版本…</button></div>
      <div id="inspector-discard" class="inspector-warning" hidden><p>放弃当前未保存修改？此操作不会修改已保存的主题。</p><button type="button" id="inspector-discard-confirm">放弃修改</button><button type="button" id="inspector-discard-cancel">继续编辑</button></div>
      </div><footer><span id="inspector-status" role="status">已保存</span><button type="submit" id="inspector-save" class="primary">保存</button></footer></form>`;
    document.body.append(this.panel);
    this.form = $('inspector-form');
    this.form.addEventListener('input', () => this.changed());
    this.form.addEventListener('change', () => this.changed());
    this.form.addEventListener('submit', e => { e.preventDefault(); run(() => this.save())(); });
    this.panel.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); run(() => this.save())(); }
      if (e.key === 'Escape' && !$('dialog').open) { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
    $('inspector-close').onclick = () => this.close();
    $('inspector-discard-cancel').onclick = () => { this.discardAction = null; $('inspector-discard').hidden = true; };
    $('inspector-discard-confirm').onclick = run(async () => {
      const action = this.discardAction; this.discardAction = null; $('inspector-discard').hidden = true;
      if (action) await action();
    });
    $('inspector-reload').onclick = () => this.confirmDiscard(() => this.load(this.setId, this.cardId));
    $('inspector-source').onclick = run(async () => { this.guard(); const card = this.currentCard(); if (card) await this.study.source(card); });
    $('inspector-comments').onclick = () => { const card = this.currentCard(); if (card) this.study.content.comments(card); };
    $('inspector-saved-preview').onclick = () => { const card = this.currentCard(); if (card) this.study.advanced.preview(card); };
    this.panel.querySelectorAll('[data-insert]').forEach(button => button.onclick = () => this.format(button.dataset.insert));
    document.addEventListener('study-card-selected', event => {
      const { setId, cardId } = event.detail;
      $('card-inspector-open').disabled = !cardId;
      if (!this.panel.hidden && setId === this.setId && cardId && cardId !== this.cardId) {
        if (this.dirty) this.status('草稿已保留。保存或放弃修改后，再打开其他主题。');
        else run(() => this.load(setId, cardId))();
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'F2' || e.isComposing || $('dialog').open || e.target.closest('input,textarea,select,[contenteditable=true]') || !e.target.closest('#study-board')) return;
      e.preventDefault(); run(() => this.openSelected())();
    });
  }
  field(name) { return this.form.elements.namedItem('inspector-' + name); }
  values() {
    return Object.fromEntries(['title', 'body', 'note', 'color', 'tags'].map(name => [name, this.field(name).value]));
  }
  get dirty() { return this.busy || !this.panel.hidden && this.baseline && JSON.stringify(this.values()) !== JSON.stringify(this.baseline); }
  guard() { if (this.dirty) throw Error('主题详情中有未保存修改，请先保存或明确放弃。'); }
  status(text, error = false) { $('inspector-status').textContent = text; $('inspector-status').classList.toggle('error', error); }
  changed() {
    this.panel.dataset.dirty = String(Boolean(this.dirty));
    $('inspector-save').disabled = !this.dirty || this.busy;
    if (!this.busy) this.status(this.dirty ? '有未保存修改 · ⌘ / Ctrl Enter 保存' : '已保存');
  }
  currentCard() {
    return this.study.current?.id === this.setId ? this.study.current.cards.find(c => c.id === this.cardId) : this.savedCard;
  }
  adoptOwnRevision(set,previousRevision){
    // This is called only after this window's successful preceding save. A
    // changed draft field must still match its saved baseline in that result.
    if(this.busy||this.setId!==set?.id||this.revision!==previousRevision||!this.baseline)return;
    const card=set.cards.find(c=>c.id===this.cardId);if(!card)return;
    const current={title:card.title,body:card.editedText??card.text??'',note:card.note||'',color:card.color,tags:(card.tags||[]).join(', ')},values=this.values();
    if(Object.keys(values).some(key=>values[key]!==this.baseline[key]&&current[key]!==this.baseline[key]))return;
    this.revision=set.revision;this.savedCard=card;$('inspector-remote').hidden=true;this.changed();
  }
  async openSelected() {
    const set = this.study.current, id = this.study.map.selected;
    if (!set || !id) { toast('先选择一个主题。'); return; }
    this.panel.style.zIndex='44';this.study.mindmapStudio.panel.style.zIndex='30';
    if (!this.panel.hidden && this.dirty) {
      if (this.cardId === id && this.setId === set.id) { this.field('title').focus(); return; }
      this.confirmDiscard(() => this.load(set.id, id)); return;
    }
    await this.load(set.id, id);this.field('title').focus({preventScroll:true});
  }
  async load(setId, cardId) {
    const ticket = ++this.serial;
    const before = this.panel.hidden ? null : JSON.stringify(this.values());
    const set = await api('study.get', { setId });
    if (ticket !== this.serial || this.study.current?.id !== setId) return;
    if (before !== null && !this.panel.hidden && JSON.stringify(this.values()) !== before) {
      this.status('新的输入已保留。保存或放弃后，再切换主题。'); return;
    }
    const card = set.cards.find(c => c.id === cardId);
    if (!card) throw Error('此主题已移入回收站或被移动，请重新选择。');
    this.setId = setId; this.cardId = cardId; this.panel.hidden = false;
    this.panel.dataset.setId = setId; this.panel.dataset.cardId = cardId;
    this.fill(set, card);if(before===null||this.panel.contains(document.activeElement))this.field('title').focus({ preventScroll: true });
  }
  fill(set, card) {
    this.savedCard = card; this.revision = set.revision; this.bodyKey = card.source || card.editedText !== undefined ? 'editedText' : 'text';
    this.field('color').innerHTML = this.study.colors.map(([color, label]) => `<option value="${escape(color)}">${escape(label)}</option>`).join('');
    if (![...this.field('color').options].some(o => o.value === card.color)) this.field('color').add(new Option(card.color, card.color));
    const values = { title:card.title, body:card.editedText ?? card.text ?? '', note:card.note || '', color:card.color, tags:(card.tags || []).join(', ') };
    for (const [key, value] of Object.entries(values)) this.field(key).value = value;
    this.field('body').readOnly = Boolean(card.reference); this.field('title').readOnly = Boolean(card.reference);
    this.panel.querySelectorAll('[data-insert]').forEach(b => b.disabled = Boolean(card.reference));
    $('inspector-kind').textContent = card.reference ? '实时引用' : card.source ? '原文摘录' : card.anchor ? '文档留白' : '独立笔记';
    $('inspector-body-label').textContent = card.source ? '显示文字 · 原件与截图保留' : card.reference ? '引用正文 · 通过原主题编辑' : '正文 · 支持 Markdown';
    $('inspector-context').textContent=[set.title,card.sourceTitle||card.source?.title||'',card.source?.locator.page?'第 '+card.source.locator.page+' 页':'',card.sourcePath||''].filter(Boolean).join(' · ');
    const figure=$('inspector-image'),asset=card.imageAsset?new URL('data/'+card.imageAsset,base).href:'',ink=(card.ink||[]).filter(s=>s.imageBound&&!s.hidden&&s.reviewSide!=='front'&&set.layers.some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt));
    const imageKey=JSON.stringify([asset,card.title,card.image,ink,set.colors]);figure.hidden=!asset;if(this.imageKey!==imageKey){this.imageKey=imageKey;figure.innerHTML=asset?`<div class="inspector-image-content" style="width:min(calc(100% - 24px),${260*card.image.width/card.image.height}px);aspect-ratio:${card.image.width}/${card.image.height}"><img src="${escape(asset)}" alt="${escape(card.title)} · 摘录原图" draggable="false">${imageInkHtml(card,ink,set.colors)}</div><figcaption>原始摘录 · 保留完整图片</figcaption>`:'';}
    $('inspector-original').hidden = !card.source; $('inspector-original').querySelector('blockquote').textContent = card.text || '图片摘录';
    $('inspector-source').disabled = !(card.source || card.anchor || card.reference);
    $('inspector-remote').hidden = true; $('inspector-discard').hidden = true;
    this.baseline = this.values(); this.panel.dataset.revision = String(set.revision); this.changed();
  }
  confirmDiscard(action) {
    if (this.busy) return;
    if (!this.dirty) { run(action)(); return; }
    this.discardAction = action; $('inspector-discard').hidden = false;
    $('inspector-discard-confirm').focus({ preventScroll: true });
  }
  close() {
    this.confirmDiscard(() => {
      ++this.serial; this.panel.hidden = true; this.baseline = null;
      $('card-inspector-open').focus({ preventScroll: true });
    });
  }
  observe(set) {
    $('card-inspector-open').disabled = !set?.cards.some(c => c.id === this.study.map.selected);
    if (this.panel.hidden || this.busy) return;
    if (!set || set.id !== this.setId) {
      if (!this.dirty) { ++this.serial; this.panel.hidden = true; }
      return;
    }
    const card = set.cards.find(c => c.id === this.cardId);
    if (!card) { this.remote('主题已被移动或删除。草稿保留，可手动复制后关闭。'); return; }
    if (set.revision === this.revision) return;
    if (this.dirty) this.remote('学习集已在另一处修改。保存将校验旧版本，不会覆盖最新内容。', card);
    else this.fill(set, card);
  }
  remote(message, card) {
    $('inspector-remote').hidden = false; $('inspector-remote-message').textContent = message;
    $('inspector-latest').textContent = card ? [card.title, card.editedText ?? card.text, card.note].filter(Boolean).join('\n\n') : '当前主题不可用';
  }
  format(kind) {
    const field = this.field('body'); if (field.readOnly || this.busy) return;
    const start = field.selectionStart, end = field.selectionEnd;
    const selected = field.value.slice(start, end), pairs = { bold:['**','**'], italic:['_','_'], code:['`','`'], link:['[','](https://)'] };
    const [left, right] = pairs[kind];
    field.setRangeText(left + (selected || '文字') + right, start, end, 'select');
    field.focus({ preventScroll: true }); this.changed();
  }
  async save() {
    if (this.busy || !this.dirty || !this.baseline) return;
    if (!this.form.reportValidity()) return;
    const values = this.values(), patch = {};
    for (const name of ['title', 'note', 'color']) if (values[name] !== this.baseline[name]) patch[name] = values[name];
    if (values.body !== this.baseline.body) patch[this.bodyKey] = values.body;
    if (values.tags !== this.baseline.tags) patch.tags = values.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    const setId = this.setId, cardId = this.cardId, revision = this.revision;
    this.busy = true; this.form.querySelectorAll('input,textarea,select,button').forEach(el => el.disabled = true); this.status('正在保存…');
    try {
      const set = await api('study.card.update', { setId, cardId, expectedRevision:revision, ...patch });
      const card = set.cards.find(c => c.id === cardId);
      this.busy = false; this.fill(set, card);
      if (this.study.current?.id === setId) { this.study.render(set, cardId); await this.study.refreshList(); }
      this.status('已保存 · 可撤销');
    } catch (error) {
      this.busy = false; this.status(describeError(error), true);
      if (error.code === 'CONFLICT') {
        const latest = await api('study.get', { setId }).catch(() => null);
        this.remote('保存被拒绝，草稿没有丢失。对比最新内容后再决定是否重新载入。', latest?.cards.find(c => c.id === cardId));
      }
      throw error;
    } finally {
      this.busy = false; this.form.querySelectorAll('input,textarea,select,button').forEach(el => el.disabled = false);
      this.panel.querySelectorAll('[data-insert]').forEach(b => b.disabled = Boolean(this.savedCard?.reference));
      $('inspector-source').disabled = !(this.savedCard?.source || this.savedCard?.anchor || this.savedCard?.reference);
      $('inspector-save').disabled = !this.dirty; this.panel.dataset.dirty = String(Boolean(this.dirty));
    }
  }
}
