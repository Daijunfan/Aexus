'use strict';
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const path = require('node:path');
const { download } = require('./network.cjs');
const { assert, cleanName, escapeHtml, LIMITS } = require('./safety.cjs');
const { normalizeSection, standaloneHtml, dataImage, IMAGE } = require('./html.cjs');
const MIME_EXT = { 'application/pdf': '.pdf', 'application/epub+zip': '.epub', 'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/x-mobipocket-ebook': '.mobi', 'application/vnd.amazon.ebook': '.azw' };
async function importURL(url, { name } = {}) {
  const page = await download(url);
  const mime = page.contentType.split(';')[0];
  const extension = MIME_EXT[mime] || (page.bytes.subarray(0, 5).toString() === '%PDF-' ? '.pdf' : null);
  let urlName;
  try { urlName = decodeURIComponent(path.posix.basename(new URL(page.url).pathname)); } catch { urlName = 'document'; }
  if (extension || (!mime.includes('html') && /\.(pdf|docx?|epub|mobi|azw3?|kf8)$/i.test(urlName))) {
    const ext = extension || path.extname(urlName).toLowerCase();
    const base = cleanName(name || path.basename(urlName, path.extname(urlName)) || 'document');
    return { name: base.toLowerCase().endsWith(ext) ? base : base + ext, bytes: page.bytes, source: page.url, warnings: [] };
  }
  assert(page.bytes.length <= 8 * 1024 * 1024, 'TOO_LARGE', 'Blog HTML exceeds 8 MiB.');
  assert(!mime || mime.includes('html') || mime.startsWith('text/'), 'UNSUPPORTED_FORMAT', 'This URL is not an HTML article or supported document.');
  const head = page.bytes.subarray(0, 8192).toString('latin1');
  const metaCharset = (head.match(/<meta\b[^>]*>/gi) || []).map(tag => tag.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]).find(Boolean);
  const bomCharset = page.bytes[0] === 0xff && page.bytes[1] === 0xfe ? 'utf-16le' : page.bytes[0] === 0xfe && page.bytes[1] === 0xff ? 'utf-16be' : page.bytes[0] === 0xef && page.bytes[1] === 0xbb && page.bytes[2] === 0xbf ? 'utf-8' : null;
  const charset = bomCharset || page.contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || metaCharset || 'utf-8';
  let html;
  try { html = new TextDecoder(charset).decode(page.bytes); } catch { html = page.bytes.toString('utf8'); }
  const dom = new JSDOM(html, { url: page.url });
  let article, baseUrl = page.url;
  try {
    const declaredBase = new URL(dom.window.document.baseURI);
    if (['http:', 'https:'].includes(declaredBase.protocol)) baseUrl = declaredBase.href;
    const title = dom.window.document.title || new URL(page.url).hostname;
    article = new Readability(dom.window.document, { maxElemsToParse: 100000, charThreshold: 100 }).parse();
    if (!article?.content) {
      const fallback = new JSDOM(html, { url: page.url });
      try {
        for (const el of fallback.window.document.querySelectorAll('script,style,nav,header,footer,form,aside')) el.remove();
        const body = fallback.window.document.querySelector('article,main') || fallback.window.document.body;
        assert(body.textContent.trim().length >= 80, 'ARTICLE_UNAVAILABLE', 'No readable article was found. The page may require login or JavaScript rendering.');
        article = { title, content: body.innerHTML, byline: null };
      } finally { fallback.window.close(); }
    }
  } finally { dom.window.close(); }
  const warnings = []; let images = 0; let imageBytes = 0;
  // Leave room for base64 expansion, text, generated anchors and HTML metadata.
  const imageBudget = Math.max(0, Math.min(16 * 1024 * 1024, Math.floor((LIMITS.html - Buffer.byteLength(article.content) - 1024 * 1024) * 3 / 4)));
  const imageDeadline = Date.now() + 60000;
  const cache = new Map();
  const section = await normalizeSection(article.content, 0, {
    url: baseUrl, title: article.title,
    resolveImage: async src => {
      if (IMAGE.test(src)) return src;
      const full = new URL(src, baseUrl).href;
      if (cache.has(full)) return cache.get(full);
      if (++images > 48 || imageBytes >= imageBudget || Date.now() >= imageDeadline) { warnings.push('Additional images were skipped because the offline image size/time budget was reached.'); cache.set(full, null); return null; }
      try {
        const image = await download(full, { maxBytes: Math.min(4 * 1024 * 1024, imageBudget - imageBytes), timeout: Math.max(1, Math.min(6000, imageDeadline - Date.now())), redirects: 3 });
        imageBytes += image.bytes.length;
        const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/bmp': '.bmp' })[image.contentType.split(';')[0]];
        const data = typeof ext === 'string' ? dataImage(image.bytes, ext) : null;
        if (!data) warnings.push('Image could not be saved: UNSUPPORTED_IMAGE_TYPE');
        cache.set(full, data); return data;
      } catch (e) { warnings.push(`Image could not be saved: ${e.code || 'NETWORK_ERROR'}`); cache.set(full, null); return null; }
    }
  });
  const title = article.title || new URL(page.url).hostname;
  const header = `<h1>${escapeHtml(title)}</h1>${article.byline ? `<p>${escapeHtml(article.byline)}</p>` : ''}<p>Saved ${new Date().toISOString()}</p>`;
  const bytes = Buffer.from(standaloneHtml(title, header + section.html, page.url));
  assert(bytes.length <= LIMITS.html, 'TOO_LARGE', 'Saved article exceeds the HTML size limit. No partial document was saved.');
  return { name: cleanName(name || title).replace(/\.html?$/i, '') + '.html', bytes, source: page.url, warnings: [...new Set([...warnings, ...section.warnings])].slice(0, 100) };
}
module.exports = { importURL };
