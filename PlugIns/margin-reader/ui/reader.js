import { $ } from './dom.js';
import { api, external } from './transport.js';
import { PdfReader } from './pdf-reader.js';
const FLOW_STYLE = `:host{display:block;color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;overflow-wrap:anywhere;padding:44px 48px 64px}h1,h2,h3,h4,h5,h6{font-weight:600;line-height:1.5;scroll-margin-top:20px}h1{font-size:1.7em;margin:0 0 1em}h2{font-size:1.4em;margin:1.8em 0 .7em}h3{font-size:1.15em}p{margin:0 0 1.1em}a{color:var(--accent);text-decoration:underline;cursor:pointer}img{max-width:100%;height:auto}pre{font:.88em/1.8 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg);padding:16px;border-radius:6px}code{font-size:.9em}blockquote{border-left:3px solid var(--accent);padding:2px 18px;margin:1.3em 0;color:var(--muted)}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto;font-size:.85em}td,th{border:1px solid var(--line);padding:7px 10px}figure{margin:1.3em 0}figcaption{color:var(--muted);font-size:.85em}hr{border:0;border-top:1px solid var(--line);margin:2em 0}::selection{background:#389dff35}@media(max-width:1050px){:host{padding:30px 28px 48px}}`;
export class ReaderRenderer {
  constructor(onNavigate, elements = {}) { this.surface=elements.surface||$('reading-surface');this.scroller=elements.scroller||$('reader-scroll'); this.onNavigate = onNavigate; this.generation = 0; this.pdf = new PdfReader(); this.shadow = null; }
  async clear() { this.generation++; await this.pdf.close(); this.shadow = null; this.surface.replaceChildren(); }
  async show(doc, settings, password) {
    const generation = ++this.generation;
    const section = doc.kind === 'pdf' ? (doc.position?.page || 1) - 1 : doc.position?.section || 0;
    const content = doc.kind === 'pdf' ? null : await api('document.content', { id: doc.id, section });
    if (generation !== this.generation) return;
    const surface = this.surface; surface.classList.toggle('pdf', doc.kind === 'pdf');
    this.scroller.classList.toggle('pdf-scroll', doc.kind === 'pdf');
    this.shadow = null;
    if (doc.kind === 'pdf') {
      await this.pdf.render(doc, surface, this.scroller, settings, password);
      return;
    } else {
      await this.pdf.close();
      delete this.scroller.dataset.pdfMode;
      surface.style.width = ''; surface.style.height = ''; delete surface.dataset.layout;
      const article = document.createElement('div'); article.className = 'flow-document'; surface.replaceChildren(article);
      const shadow = article.attachShadow({ mode: 'open' }); this.shadow = shadow;
      const style = document.createElement('style');
      style.textContent = FLOW_STYLE + `:host{font-size:${settings.fontSize}px;line-height:${settings.lineHeight}}`;
      const body = document.createElement('article');
      // This HTML is already sanitized by the shared Core. A shadow root isolates document IDs.
      body.innerHTML = content.html;
      shadow.append(style, body);
      shadow.addEventListener('click', event => {
        const anchor = event.composedPath().find(el => el?.tagName === 'A');
        if (!anchor) return;
        event.preventDefault();
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('#mr-locator=')) {
          try { this.onNavigate(JSON.parse(decodeURIComponent(href.slice(12)))); } catch {}
        } else if (href.startsWith('#')) {
          let id; try { id = decodeURIComponent(href.slice(1)); } catch { return; }
          this.onNavigate({ section, anchor: id });
        } else external(href);
      });
    }
    if (generation !== this.generation) return;
    const scroll = this.scroller; scroll.scrollTop = 0;
    if (doc.kind !== 'pdf' && doc.position?.anchor) {
      const target = this.shadow?.getElementById(doc.position.anchor);
      if (target) scroll.scrollTop = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 20;
    }
  }
  currentLocator(doc) {
    const scroller = this.scroller;
    if (doc.kind === 'pdf') return this.pdf.currentLocator(doc);
    const top = scroller.getBoundingClientRect().top + 55;
    let closest = null;
    for (const anchor of this.shadow?.querySelectorAll('[id]') || []) {
      if (anchor.getBoundingClientRect().top > top) break;
      closest = anchor;
    }
    return { section: doc.position?.section || 0, ...(closest ? { anchor: closest.id } : {}) };
  }
}
