'use strict';
const { JSDOM } = require('jsdom');
const sanitize = require('sanitize-html');
const { escapeHtml, LIMITS, assert } = require('./safety.cjs');
const IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/;
const IMAGE_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp' };
function dataImage(bytes, ext) { const mime = IMAGE_MIME[ext.toLowerCase()]; return mime ? `data:${mime};base64,${Buffer.from(bytes).toString('base64')}` : null; }
function cleanHtml(html) {
  return sanitize(html, {
    allowedTags: ['p','div','span','section','article','header','footer','main','h1','h2','h3','h4','h5','h6','br','hr','strong','b','em','i','u','s','del','ins','sub','sup','small','mark','blockquote','pre','code','kbd','ul','ol','li','dl','dt','dd','table','caption','thead','tbody','tfoot','tr','th','td','figure','figcaption','img','a','ruby','rt','rp'],
    allowedAttributes: { '*': ['id','lang','dir'], a: ['href','title'], img: ['src','alt','width','height'], th: ['colspan','rowspan'], td: ['colspan','rowspan'], ol: ['start'], li: ['value'] },
    allowedSchemes: ['https','http','mailto'], allowedSchemesByTag: { img: ['data'] }, allowProtocolRelative: false,
    transformTags: { img: (tagName, attrs) => ({ tagName, attribs: { ...attrs, src: IMAGE.test(attrs.src || '') ? attrs.src : '' } }) },
    nonTextTags: ['script','style','textarea','option','noscript','iframe','object','embed','form','button','input','select'],
    enforceHtmlBoundary: false
  });
}
async function normalizeSection(html, section, options = {}) {
  assert(Buffer.byteLength(html) <= LIMITS.html, 'TOO_LARGE', 'A document section exceeds the HTML size limit.');
  const dom = new JSDOM(html, { ...(options.url ? { url: options.url } : {}) });
  try {
    const doc = dom.window.document;
    for (const bad of doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base')) bad.remove();
    const warnings = [];
    for (const img of doc.querySelectorAll('img')) {
      // A src may be a transparent placeholder. Prefer declared lazy images and
      // responsive sources, retaining src as a fallback if a candidate fails.
      const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset') || img.closest('picture')?.querySelector('source')?.getAttribute('srcset') || '';
      const responsive = /\bdata:/i.test(srcset) ? [] : srcset.split(',').map(part => part.trim().split(/\s+/)).filter(parts => parts[0]).sort((a, b) => (parseFloat(b[1]) || 1) - (parseFloat(a[1]) || 1)).map(parts => parts[0]);
      const candidates = [...new Set([img.getAttribute('data-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy-src'), img.getAttribute('data-actualsrc'), ...responsive, img.getAttribute('src')].filter(Boolean))].slice(0, 8);
      let resolved;
      for (const src of candidates) {
        if (IMAGE.test(src)) { resolved = src; break; }
        try { resolved = await options.resolveImage?.(src); } catch (e) { warnings.push(`Image unavailable: ${String(e.message).slice(0, 160)}`); }
        if (resolved && IMAGE.test(resolved)) break;
      }
      if (resolved && IMAGE.test(resolved)) img.setAttribute('src', resolved);
      else { img.replaceWith(doc.createTextNode(img.getAttribute('alt') ? `[${img.getAttribute('alt')}]` : '[Image unavailable offline]')); }
    }
    for (const a of doc.querySelectorAll('a[href]')) {
      const raw = a.getAttribute('href');
      const target = options.resolveLink?.(raw);
      if (target) a.setAttribute('href', `#mr-locator=${encodeURIComponent(JSON.stringify(target))}`);
      else if (options.url && !raw.startsWith('#')) { try { a.setAttribute('href', new URL(raw, options.url).href); } catch { a.removeAttribute('href'); } }
    }
    doc.body.innerHTML = cleanHtml(doc.body.innerHTML);
    const used = new Set();
    for (const el of doc.querySelectorAll('[id]')) { const id = el.id; if (!id || id.length > 300 || used.has(id)) el.removeAttribute('id'); else used.add(id); }
    let n = 0;
    const headings = [];
    for (const h of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      if (!h.id) { do { h.id = `mr-heading-${++n}`; } while (used.has(h.id)); used.add(h.id); }
      headings.push({ title: h.textContent.trim().slice(0, 500) || 'Untitled', level: Number(h.tagName[1]), locator: { section, anchor: h.id } });
    }
    let block = 0;
    for (const p of doc.querySelectorAll('p,pre,blockquote,figure,table')) if (!p.id) { let id; do { id = `mr-block-${++block}`; } while (used.has(id)); p.id = id; used.add(id); }
    const blocks = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6,p,pre,li,figcaption,td,th')).filter(el => !el.querySelector('p,pre,li,table')).map(el => ({ text: el.textContent.trim(), anchor: el.id || el.closest('[id]')?.id || null })).filter(b => b.text);
    return { title: options.title || headings[0]?.title || `Section ${section + 1}`, html: doc.body.innerHTML, text: blocks.length ? blocks.map(b => b.text).join('\n\n') : doc.body.textContent.trim(), blocks, anchors: [...used], headings, warnings };
  } finally { dom.window.close(); }
}
function tocFromHeadings(sections) {
  const toc = []; const stack = [];
  for (const [section, s] of sections.entries()) {
    const headings = s.headings.length ? s.headings : sections.length > 1 ? [{ title: s.title, level: 1, locator: { section } }] : [];
    for (const h of headings) {
      while (stack.length && stack.at(-1).level >= h.level) stack.pop();
      const node = { id: `original-${toc.length + 1}`, parentId: stack.at(-1)?.id || null, title: h.title, locator: h.locator, source: 'original' };
      toc.push(node); stack.push({ id: node.id, level: h.level });
    }
  }
  return toc;
}
function standaloneHtml(title, body, source) {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>body{max-width:860px;margin:48px auto;padding:0 24px;color:#262a33;background:#fff;font:18px/1.8 system-ui}img{max-width:100%;height:auto}pre{overflow:auto;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}a{color:#b74735}</style></head><body>${source ? `<p>Source: <a href="${escapeHtml(source)}">${escapeHtml(source)}</a></p>` : ''}${body}</body></html>\n`;
}
module.exports = { normalizeSection, tocFromHeadings, cleanHtml, dataImage, IMAGE_MIME, IMAGE, standaloneHtml };
