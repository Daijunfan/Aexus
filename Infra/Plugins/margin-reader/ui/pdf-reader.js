import { base } from './transport.js';
import { pageSlices, sourceY, displayY } from './page-slices.mjs';
import { mountSlices } from './pdf-layout-view.js';
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
      for(const canvas of record.tiles||[])canvas.width=canvas.height=0;
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
    this.unfoldPage=settings.unfoldPage;this.settings={...settings,noteMarginWidth:marginWidth};this.notes=notes;
    const noteKey=JSON.stringify(notes.map(c=>[c.id,c.title,c.text,c.editedText,c.note,c.imageAsset,c.anchor]));
    const layoutKey = `${JSON.stringify([metadata.foldedPages||[],metadata.foldRegions||[]])}:${noteKey}:${key}:${this.mode}:${width}:${height}:${fit}:${zoom}:${devicePixelRatio}`;
    if (this.layoutKey !== layoutKey) {
      this.epoch++; this.clearPages(); this.layoutKey = layoutKey;
      this.pages = layoutPages(metadata.sections, width, height, fit, zoom);
      let top=0;
      for(let i=0;i<this.pages.length;i++){
        const rect=this.pages[i];rect.top=top;rect.sourceHeight=rect.height;
        rect.slices=pageSlices(rect.sourceHeight,(metadata.foldRegions||[]).filter(r=>r.page===i+1&&!r.sourceChanged),notes.filter(c=>c.anchor.locator.page===i+1),rect.scale);
        let marginBottom=0;if(marginWidth)for(const c of notes.filter(c=>c.anchor.locator.page===i+1&&c.anchor.display==='margin')){
          const at=c.anchor.locator.pageOffset||0;if(rect.slices.blocks.some(b=>b.type==='fold'&&at>=b.start&&at<b.end))continue;
          marginBottom=Math.max(displayY(rect.slices,at),marginBottom)+(c.anchor.height||150)*rect.scale+8;
        }
        rect.folded=metadata.foldedPages?.includes(i+1);rect.height=rect.folded?38:Math.max(rect.slices.height,marginBottom);rect.noteHeight=0;
        top+=rect.height+8;
      }
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
        slot.pageSlices=rect.slices;
        this.slots[i] = slot; fragment.append(slot);

      }
      container.append(fragment);
      // Put overflow equally on both sides when the user explicitly zooms in.
      scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2);
    }
    // Paged views retain up to three raster records, but mount exactly one
    // real page. Neighbor preparation never creates another visible paper.
    if(this.mode==='paged'){
      this.pagedIndex=index;
      const rect=this.pages[index],maxWidth=Math.max(width,rect.width)+marginWidth;
      container.style.width=maxWidth+'px';container.style.height=Math.max(height,rect.height+rect.noteHeight)+'px';
      const slot=this.slot(index);slot.style.top=Math.max(0,(height-rect.height)/2)+'px';slot.style.left=(maxWidth-marginWidth-rect.width)/2+'px';
      if(container.firstElementChild!==slot||container.childElementCount!==1)container.replaceChildren(slot);
    }
    const position=metadata.position||{page:1},rect=this.pages[index];
    scroller.scrollTop=(this.mode==='paged'?0:rect.top)+(position.pageOffset!==undefined?displayY(rect.slices,position.pageOffset):(position.offset||0)*Math.max(0,rect.height-height));
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
    const index=this.pagedIndex??pageAt(this.pages,effectiveTop),rect=this.pages[index];
    const local=Math.max(0,top-(this.pagedIndex===null?rect.top:Math.max(0,(this.scroller.clientHeight-PADDING*2-rect.height)/2)));
    return {page:index+1,pageOffset:Math.round(sourceY(rect.slices,local)*100000)/100000};
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
    if(this.mode==='paged'){
      if(first+1<this.pages.length)desired.push(first+1);
      if(first>0)desired.push(first-1);
    }
    const wanted = new Set(desired.slice(0, this.mode==='paged'?3:MAX_CANVASES));
    for (const [i, record] of this.records) if (!wanted.has(i)) this.evict(i, record);
    for (const i of wanted) this.ensurePage(i);
    this.container.dataset.canvasBudget = this.mode==='paged'?3:MAX_CANVASES;
    this.container.dataset.cachedPages=String(this.records.size);
  }
  slot(index){
    if(this.slots[index])return this.slots[index];
    const rect=this.pages[index];if(!rect)return null;
    const slot=document.createElement('div');slot.className='pdf-page';slot.dataset.page=index+1;slot.setAttribute('role','region');slot.setAttribute('aria-label',`PDF 第 ${index+1} 页`);
    slot.style.width=rect.width+'px';slot.style.height=rect.height+'px';slot.pageSlices=rect.slices;this.slots[index]=slot;return slot;
  }
  ensurePage(index) {
    if (this.records.has(index)) return this.records.get(index).promise;
    const slot = this.slot(index), pdf = this.document, epoch = this.epoch;
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
        const layer = document.createElement('div'); layer.className = 'textLayer';record.textLayerRoot=layer;
        slot.style.setProperty('--scale-factor', viewport.scale);
        slot.style.setProperty('--user-unit', '1'); slot.style.setProperty('--total-scale-factor', viewport.scale);
        slot.replaceChildren(canvas, layer);
        record.renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await record.renderTask.promise;
        if (!live()) return;
        record.textLayer = new library.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport });
        await record.textLayer.render();
        if (live()) {mountSlices(slot,record,viewport,this.settings,this.notes.filter(c=>c.anchor.locator.page===index+1));slot.dataset.renderState = 'ready';}
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
