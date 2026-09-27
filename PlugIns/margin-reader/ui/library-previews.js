import { api } from './transport.js';
// Only visible cards request Core-generated images. No PDF parsing or business state here.
export class LibraryPreviews {
  constructor() { this.cache = new Map(); this.queue = []; this.running = 0; this.generation = 0; this.bytes = 0; }
  attach(entries) {
    const generation = ++this.generation;
    this.observer?.disconnect(); this.queue = [];
    const byPath = new Map(entries.map(entry => [entry.path, entry]));
    this.observer = new IntersectionObserver(items => {
      for (const item of items) if (item.isIntersecting) {
        this.observer.unobserve(item.target);
        const entry = byPath.get(item.target.dataset.path);
        if (entry) { this.queue.push({ card: item.target, entry, generation }); this.drain(); }
      }
    }, { root: document.getElementById('files'), rootMargin: '160px' });
    for (const card of document.querySelectorAll('#files .file-card')) {
      const entry = byPath.get(card.dataset.path);
      if (entry?.kind !== 'file' || !/^(pdf|html?|xhtml|md|markdown|txt|png|jpe?g|webp|gif|avif|bmp)$/.test(entry.format)) continue;
      const key = `${entry.path}:${entry.version}`, cached = this.cache.get(key);
      if (cached) this.paint(card, cached);
      else this.observer.observe(card);
    }
  }
  remember(key, result) {
    if (this.cache.has(key)) return;
    const size = result.contentBase64?.length || 0;
    this.cache.set(key, result); this.bytes += size;
    while (this.cache.size > 96 || this.bytes > 12 * 1024 * 1024) {
      const oldest = this.cache.keys().next().value;
      this.bytes -= this.cache.get(oldest).contentBase64?.length || 0; this.cache.delete(oldest);
    }
  }
  drain() {
    while (this.running < 2 && this.queue.length) {
      const job = this.queue.shift();
      if (job.generation !== this.generation || !job.card.isConnected) continue;
      this.running++;
      job.card.dataset.preview = 'loading';
      api('document.preview', { path: job.entry.path, expectedVersion: job.entry.version }).then(result => {
        this.remember(`${job.entry.path}:${job.entry.version}`, result);
        if (job.generation === this.generation && job.card.isConnected) this.paint(job.card, result);
      }).catch(error => {
        if (job.card.isConnected) { job.card.dataset.preview = 'unavailable'; job.card.querySelector('.file-art').title = `缩略图暂不可用：${error.message}`; }
      }).finally(() => { this.running--; this.drain(); });
    }
  }
  paint(card, result) {
    if (result.kind !== 'image' || result.mimeType !== 'image/png') { card.dataset.preview = 'unavailable'; return; }
    const art = card.querySelector('.file-art'); if (!art) return;
    const img = document.createElement('img'); img.className = 'document-thumbnail'; img.draggable = false;
    img.alt = `${result.title || card.dataset.path}${result.format === 'pdf' ? ' · PDF 封面' : ' · 内容缩略图'}`;
    img.decoding = 'async'; img.src = `data:image/png;base64,${result.contentBase64}`;
    art.querySelector('.document-thumbnail')?.remove(); art.prepend(img); art.classList.add('has-thumbnail');
    card.dataset.preview = 'ready';
  }
}
