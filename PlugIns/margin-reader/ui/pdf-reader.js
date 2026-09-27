import { base } from './transport.js';
import { layoutPages, pageAt, locate, positionTop, clamp } from './pdf-geometry.mjs';
let library;
const MAX_CANVASES = 7, MAX_PIXELS = 5000000, PADDING = 8;
export class PdfReader {
  constructor() {
    this.document = null; this.key = null; this.layoutKey = null; this.epoch = 0;
    this.records = new Map(); this.slots = []; this.pages = []; this.running = 0; this.waiters = [];
    this.onScroll = () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = null; this.updateVisible(); }); };
  }
  async close() {
    this.epoch++; this.scroller?.removeEventListener('scroll', this.onScroll);
    cancelAnimationFrame(this.frame); this.frame = null;
    this.clearPages();
    const loading = this.loading; this.loading = null; this.document = null;
    this.key = null; this.layoutKey = null; this.pages = []; this.slots = [];
    if (loading) await loading.destroy().catch(() => {});
  }
  clearPages() {
    for (const [index, record] of this.records) this.evict(index, record);
    this.records.clear();
  }
  evict(index, record) {
    record.cancelled = true; record.renderTask?.cancel(); record.textLayer?.cancel();
    if (this.records.get(index) === record) this.records.delete(index);
    record.slot?.replaceChildren();
    record.slot?.removeAttribute('data-render-state');
    record.promise?.finally(() => {
      if (record.canvas) record.canvas.width = record.canvas.height = 0;
      if (!this.records.has(index)) record.page?.cleanup();
    });
  }
  async acquire() {
    if (this.running < 2) this.running++;
    else await new Promise(resolve => this.waiters.push(resolve));
  }
  release() { const next = this.waiters.shift(); if (next) next(); else this.running--; }
  async render(metadata, container, scroller, settings, password) {
    library ||= await import('./vendor/pdf.mjs');
    library.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.mjs', base).href;
    const key = `${metadata.id}:${metadata.sourceVersion}`;
    if (key !== this.key) {
      await this.close();
      this.loading = library.getDocument({
        url: new URL(`data/${metadata.originalAsset}`, base).href, password,
        isEvalSupported: false, disableRange: true, disableStream: false, verbosity: 0,
        cMapUrl: new URL('vendor/cmaps/', base).href, cMapPacked: true,
        standardFontDataUrl: new URL('vendor/standard_fonts/', base).href,
        wasmUrl: new URL('vendor/wasm/', base).href
      });
      try { this.document = await this.loading.promise; this.key = key; }
      catch (error) { await this.close(); throw error; }
    }
    if (this.scroller !== scroller) this.scroller?.removeEventListener('scroll', this.onScroll);
    this.scroller = scroller; this.container = container; this.metadata = metadata;
    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.mode = settings.pdfMode || 'continuous';
    scroller.dataset.pdfMode = this.mode;
    const notes=(settings.extendedNotes||[]).filter(c=>c.anchor?.locator.page);
    const marginWidth=notes.some(c=>c.anchor.display==='margin')&&scroller.clientWidth>=560?220:0;
    const width = Math.max(1, scroller.clientWidth - PADDING * 2-marginWidth);
    const height = Math.max(1, scroller.clientHeight - PADDING * 2);
    const index = clamp((metadata.position?.page || 1) - 1, 0, metadata.pageCount - 1);
    const fit = settings.pdfFit || 'width', zoom = settings.pdfZoom || 1;
    this.unfoldPage=settings.unfoldPage;
    const noteKey=JSON.stringify(notes.map(c=>[c.id,c.title,c.text,c.anchor]));
    const layoutKey = `${JSON.stringify(metadata.foldedPages||[])}:${noteKey}:${key}:${this.mode}:${width}:${height}:${fit}:${zoom}:${devicePixelRatio}:${this.mode === 'paged' ? index : ''}`;
    if (this.layoutKey !== layoutKey) {
      this.epoch++; this.clearPages(); this.layoutKey = layoutKey;
      this.pages = layoutPages(metadata.sections, width, height, fit, zoom);
      let added=0;for(let i=0;i<this.pages.length;i++){const rect=this.pages[i];rect.top+=added;if(metadata.foldedPages?.includes(i+1)){added+=38-rect.height;rect.height=38;rect.folded=true;}rect.noteHeight=rect.folded?0:notes.filter(c=>c.anchor.locator.page===i+1&&c.anchor.display==='embedded').length*150;added+=rect.noteHeight;}
      this.pagedIndex = this.mode === 'paged' ? index : null;
      this.slots = []; container.replaceChildren();
      const used = this.mode === 'paged' ? [index] : this.pages.map((_, i) => i);
      const maxWidth = Math.max(width, ...used.map(i => this.pages[i].width))+marginWidth;
      const totalHeight = this.mode === 'paged' ? Math.max(height, this.pages[index].height + this.pages[index].noteHeight) : this.pages.at(-1).top + this.pages.at(-1).height + this.pages.at(-1).noteHeight;
      container.style.width = `${maxWidth}px`; container.style.height = `${totalHeight}px`;
      container.dataset.layout = this.mode;
      const fragment = document.createDocumentFragment();
      for (const i of used) {
        const rect = this.pages[i], slot = document.createElement('div');
        slot.className = 'pdf-page'; slot.dataset.page = i + 1;
        slot.setAttribute('role', 'region'); slot.setAttribute('aria-label', `PDF 第 ${i + 1} 页`);
        slot.style.width = `${rect.width}px`; slot.style.height = `${rect.height}px`;
        slot.style.top = `${this.mode === 'paged' ? Math.max(0, (height - rect.height) / 2) : rect.top}px`;
        slot.style.left = `${(maxWidth - marginWidth - rect.width) / 2}px`;
        this.slots[i] = slot; fragment.append(slot);
        let noteTop=(this.mode==='paged'?Math.max(0,(height-rect.height)/2):rect.top)+rect.height+8;
        for(const card of notes.filter(c=>!rect.folded&&c.anchor.locator.page===i+1)){
          const note=document.createElement(card.anchor.display==='embedded'?'div':'button');
          if(card.anchor.display==='embedded'){note.className='extend-note-block';note.style.top=noteTop+'px';note.style.height='142px';noteTop+=150;const title=document.createElement('h4');title.textContent=card.title;const text=document.createElement('p');text.textContent=card.text;const edit=document.createElement('button');edit.textContent='编辑留白';edit.onclick=()=>settings.editExtendedNote?.(card);note.append(title,text,edit);fragment.append(note);}
          else if(card.anchor.display==='margin'&&marginWidth){note.className='extend-note-margin';note.style.left=(maxWidth-marginWidth+8)+'px';note.style.top=((this.mode==='paged'?0:rect.top)+(card.anchor.locator.pageOffset||0)*rect.height)+'px';const title=document.createElement('strong');title.textContent=card.title;const body=document.createElement('p');body.textContent=card.text;note.append(title,body);note.onclick=()=>settings.editExtendedNote?.(card);fragment.append(note);}
          else{note.className='extend-note-marker';note.style.top=((this.mode==='paged'?0:rect.top)+(card.anchor.locator.pageOffset||0)*rect.height)+'px';note.textContent=card.anchor.display==='collapsed'?'✎':card.title;note.title=card.text;note.onclick=()=>settings.editExtendedNote?.(card);fragment.append(note);}
        }

      }
      container.append(fragment);
      // Put overflow equally on both sides when the user explicitly zooms in.
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    }
    scroller.scrollTop = positionTop(metadata.position || { page: 1 }, this.pages, height, this.mode === 'paged');
    const target = this.ensurePage(index);
    this.updateVisible();
    await target;
  }
  currentLocator(doc) {
    if (!this.pages.length || !this.scroller || this.key !== `${doc.id}:${doc.sourceVersion}`) return doc.position;
    const top = this.scroller.scrollTop, max = this.scroller.scrollHeight - this.scroller.clientHeight;
    // A short last page cannot align its top with the viewport. At the document
    // bottom report that last page, rather than getting stuck on its predecessor.
    const effectiveTop = this.pagedIndex === null && max > 0 && top >= max - 1
      ? Math.max(top, this.pages.at(-1).top) : top;
    return locate(this.pages, effectiveTop, this.pagedIndex);
  }
  updateVisible() {
    if (!this.document || !this.pages.length) return;
    const top = this.scroller.scrollTop;
    const first = this.mode === 'paged' ? this.pagedIndex : pageAt(this.pages, top);
    const last = this.mode === 'paged' ? first : pageAt(this.pages, top + this.scroller.clientHeight);
    const desired = [];
    for (let i = first; i <= last && desired.length < MAX_CANVASES; i++) desired.push(i);
    if (this.mode !== 'paged') {
      if (last + 1 < this.pages.length) desired.push(last + 1);
      if (first > 0) desired.push(first - 1);
    }
    const wanted = new Set(desired.slice(0, MAX_CANVASES));
    for (const [i, record] of this.records) if (!wanted.has(i)) this.evict(i, record);
    for (const i of wanted) this.ensurePage(i);
    this.container.dataset.canvasBudget = MAX_CANVASES;
  }
  ensurePage(index) {
    if (this.records.has(index)) return this.records.get(index).promise;
    const slot = this.slots[index], pdf = this.document, epoch = this.epoch;
    if (!slot || !pdf) return Promise.resolve();
    if(this.pages[index].folded){if(!slot.querySelector('.pdf-unfold')){slot.replaceChildren();const button=document.createElement('button');button.className='pdf-unfold';button.textContent=`第 ${index+1} 页已折叠 · 展开`;button.onclick=()=>this.unfoldPage?.(index+1);slot.append(button);slot.dataset.renderState='folded';}return Promise.resolve();}
    const rect = this.pages[index], record = { slot, cancelled: false };
    this.records.set(index, record);
    const live = () => !record.cancelled && epoch === this.epoch && this.records.get(index) === record;
    record.promise = (async () => {
      await this.acquire();
      try {
        if (!live()) return;
        slot.dataset.renderState = 'loading';
        const page = record.page = await pdf.getPage(index + 1);
        if (!live()) return;
        const viewport = page.getViewport({ scale: rect.scale });
        // Bound bitmap memory even for extremely large paper sizes and Retina displays.
        const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));
        const canvas = record.canvas = document.createElement('canvas');
        canvas.setAttribute('aria-label', `PDF 第 ${index + 1} 页`);
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio)); canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        const layer = document.createElement('div'); layer.className = 'textLayer';
        slot.style.setProperty('--scale-factor', viewport.scale);
        slot.style.setProperty('--user-unit', '1'); slot.style.setProperty('--total-scale-factor', viewport.scale);
        slot.replaceChildren(canvas, layer);
        record.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await record.renderTask.promise;
        if (!live()) return;
        record.textLayer = new library.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
        await record.textLayer.render();
        if (live()) slot.dataset.renderState = 'ready';
      } catch (error) {
        if (!live() || error.name === 'RenderingCancelledException' || error.name === 'AbortException') return;
        slot.dataset.renderState = 'error';
        const retry = document.createElement('button'); retry.className = 'pdf-retry';
        retry.textContent = `第 ${index + 1} 页加载失败，点击重试`;
        retry.title = error.message;
        retry.addEventListener('click', () => { this.evict(index, record); this.ensurePage(index); });
        slot.replaceChildren(retry);
      } finally { this.release(); }
    })();
    return record.promise;
  }
}
