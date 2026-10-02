'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');
const { normalizeSection, tocFromHeadings, dataImage, IMAGE_MIME } = require('./html.cjs');
const { assert, fail, LIMITS, escapeHtml, safePath, readBounded } = require('./safety.cjs');
const FORMATS = [...require('./av-document.cjs').FORMATS,'mrv','pdf','doc','docx','epub','mobi','azw3','azw','kf8','txt','md','markdown','html','htm','xhtml','rtf','odt','fb2','csv','json','xml','log','yaml','yml','rst','png','jpg','jpeg','gif','webp','avif','bmp'];
function textDecode(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return require('iconv-lite').decode(bytes, 'utf16-le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return require('iconv-lite').decode(bytes, 'utf16-be');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return require('iconv-lite').decode(bytes, 'gb18030'); }
}
async function zipLoad(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  assert(entries.length <= LIMITS.zipEntries, 'TOO_LARGE', 'Archive contains too many entries.');
  let size = 0;
  for (const entry of entries) {
    assert(!(entry.unsafeOriginalName || entry.name).split('/').includes('..') && !entry.name.startsWith('/'), 'INVALID_DOCUMENT', 'Archive contains unsafe paths.');
    size += entry._data?.uncompressedSize || 0;
    assert(size <= LIMITS.expanded, 'TOO_LARGE', 'Expanded archive exceeds the safety limit.');
  }
  return zip;
}
async function zipText(zip, file) {
  const entry = zip.file(file); assert(entry, 'INVALID_DOCUMENT', `Archive entry is missing: ${file}`);
  const bytes = await entry.async('nodebuffer'); assert(bytes.length <= LIMITS.html, 'TOO_LARGE', 'Archive text entry is too large.');
  return textDecode(bytes);
}
function zipTarget(base, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) return null;
  const [raw, anchor] = href.split('#');
  let target;
  try { target = path.posix.normalize(path.posix.join(path.posix.dirname(base), decodeURIComponent(raw || path.posix.basename(base)))); } catch { return null; }
  if (target.startsWith('../') || target === '..') return null;
  return { path: target, ...(anchor ? { anchor: decodeURIComponent(anchor) } : {}) };
}
function xml(source) { return new JSDOM(source, { contentType: 'application/xml' }); }
async function parseEpub(bytes) {
  const zip = await zipLoad(bytes);
  if (zip.file('META-INF/encryption.xml')) {
    const encryption = await zipText(zip, 'META-INF/encryption.xml');
    assert(!/aes|xmlenc#|microsoft.*drm/i.test(encryption), 'DRM_UNSUPPORTED', 'DRM-protected EPUB content cannot be decrypted by this reader.');
  }
  const container = xml(await zipText(zip, 'META-INF/container.xml'));
  let opfPath;
  try { opfPath = container.window.document.querySelector('rootfile')?.getAttribute('full-path'); } finally { container.window.close(); }
  assert(opfPath && !opfPath.startsWith('/') && !opfPath.split('/').includes('..'), 'INVALID_DOCUMENT', 'EPUB package path is missing or unsafe.');
  const opf = xml(await zipText(zip, opfPath));
  let title, spine, nav, ncx;
  try {
    const doc = opf.window.document;
    title = doc.getElementsByTagName('dc:title')[0]?.textContent || 'EPUB';
    const items = new Map(Array.from(doc.querySelectorAll('manifest > item')).map(item => [item.getAttribute('id'), { href: zipTarget(opfPath, item.getAttribute('href'))?.path, properties: item.getAttribute('properties') || '', mime: item.getAttribute('media-type') }]));
    spine = Array.from(doc.querySelectorAll('spine > itemref')).map(ref => items.get(ref.getAttribute('idref'))).filter(item => item?.href);
    nav = [...items.values()].find(item => item.properties.split(/\s+/).includes('nav'));
    ncx = items.get(doc.querySelector('spine')?.getAttribute('toc')) || [...items.values()].find(item => item.mime === 'application/x-dtbncx+xml');
  } finally { opf.window.close(); }
  assert(spine.length && spine.length <= 10000, 'INVALID_DOCUMENT', 'EPUB reading order is empty or too large.');
  const sections = [];
  const locator = (base, href) => { const t = zipTarget(base, href); if (!t) return null; const section = spine.findIndex(item => item.href === t.path); return section >= 0 ? { section, ...(t.anchor ? { anchor: t.anchor } : {}) } : null; };
  for (const [i, item] of spine.entries()) {
    sections.push(await normalizeSection(await zipText(zip, item.href), i, {
      resolveImage: async src => { const t = zipTarget(item.href, src); const entry = t && zip.file(t.path); if (!entry) return null; return dataImage(await entry.async('nodebuffer'), path.extname(t.path)); },
      resolveLink: href => locator(item.href, href)
    }));
  }
  const toc = [];
  function add(title, target, parentId) {
    if (!target) return parentId;
    const node = { id: `original-${toc.length + 1}`, title: title.trim().slice(0, 500) || 'Untitled', parentId, locator: target, source: 'original' }; toc.push(node); return node.id;
  }
  if (nav?.href) {
    const dom = new JSDOM(await zipText(zip, nav.href));
    try {
      const root = [...dom.window.document.querySelectorAll('nav')].find(n => (n.getAttribute('epub:type') || '').split(/\s+/).includes('toc')) || dom.window.document.querySelector('nav');
      const walk = (list, parentId = null) => { for (const li of Array.from(list?.children || []).filter(el => el.tagName === 'LI')) { const a = li.querySelector(':scope > a') || li.querySelector(':scope > span > a'); const id = a ? add(a.textContent, locator(nav.href, a.getAttribute('href')), parentId) : parentId; for (const sub of li.querySelectorAll(':scope > ol,:scope > ul')) walk(sub, id); } };
      walk(root?.querySelector('ol,ul'));
    } finally { dom.window.close(); }
  }
  if (!toc.length && ncx?.href) {
    const dom = xml(await zipText(zip, ncx.href));
    try {
      const walk = (el, parentId = null) => { for (const point of Array.from(el?.children || []).filter(n => n.localName === 'navPoint')) { const target = locator(ncx.href, point.querySelector('content')?.getAttribute('src')); const id = add(point.querySelector('navLabel')?.textContent || '', target, parentId); walk(point, id); } };
      walk(dom.window.document.querySelector('navMap'));
    } finally { dom.window.close(); }
  }
  return { title, kind: 'flow', sections, toc: toc.length ? toc : tocFromHeadings(sections), warnings: sections.flatMap(s => s.warnings) };
}
async function parsePdf(bytes, password) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), password, verbosity: 0, isEvalSupported: false, useSystemFonts: true, cMapUrl: path.join(base, 'cmaps') + path.sep, cMapPacked: true, standardFontDataUrl: path.join(base, 'standard_fonts') + path.sep });
  let pdf;
  try {
    pdf = await task.promise;
    assert(pdf.numPages <= 10000, 'TOO_LARGE', 'PDF exceeds the 10,000-page indexing limit.');
    const sections = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i); const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      const viewport = page.getViewport({ scale: 1 });
      sections.push({ title: `Page ${i}`, text: text.trim(), html: `<pre>${escapeHtml(text.trim())}</pre>`, blocks: [{ text: text.trim(), anchor: null }], anchors: [], headings: [], warnings: [], width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    const toc = [];
    const walk = async (nodes, parentId = null) => { for (const n of nodes || []) {
      let dest = n.dest; if (typeof dest === 'string') dest = await pdf.getDestination(dest);
      let page = 1;
      if (Array.isArray(dest) && dest.length) { try { page = typeof dest[0] === 'number' ? dest[0] + 1 : await pdf.getPageIndex(dest[0]) + 1; } catch {} }
      const node = { id: `original-${toc.length + 1}`, parentId, title: n.title || 'Untitled', locator: { page }, source: 'original' };
      toc.push(node); await walk(n.items, node.id);
    } };
    await walk(await pdf.getOutline());
    const metadata = await pdf.getMetadata().catch(() => ({}));
    const labels = await pdf.getPageLabels();
    return { title: metadata.info?.Title || '', kind: 'pdf', sections, toc, pageLabels: labels, warnings: sections.every(s => !s.text) ? ['Scanned PDF: original pages are readable, but there is no searchable text layer. OCR is not included in this release.'] : [] };
  } catch (e) {
    if (e.name === 'PasswordException') fail('PASSWORD_REQUIRED', 'PDF needs a valid password. Supply password for this request; it is not saved.');
    throw e;
  } finally { if (pdf) await pdf.destroy(); else await task.destroy(); }
}
async function parseMobi(bytes, format, resourceDir) {
  assert(bytes.length > 86 && bytes.toString('ascii', 60, 68) === 'BOOKMOBI', 'INVALID_DOCUMENT', 'Not a MOBI/AZW3 document.');
  const offset = bytes.readUInt32BE(78);
  assert(offset + 16 < bytes.length, 'INVALID_DOCUMENT', 'Invalid MOBI record table.');
  assert(bytes.readUInt16BE(offset + 12) === 0, 'DRM_UNSUPPORTED', 'DRM-protected Kindle books are not supported.');
  const { initMobiFile, initKf8File } = await import('@lingo-reader/mobi-parser');
  const kf8 = ['azw3','kf8'].includes(format) || (offset + 40 < bytes.length && bytes.readUInt32BE(offset + 36) === 8);
  const book = await (kf8 ? initKf8File : initMobiFile)(new Uint8Array(bytes), resourceDir);
  if (!kf8) require('./mobi-targets.cjs').materializeMobiTargets(book);
  if (kf8) {
    // Compatibility adapter for pinned parser 0.4.6: its replace() assumes every
    // head link is a Kindle resource. Real books can also contain web stylesheet links.
    const replace = book.replace.bind(book);
    book.replace = source => {
      const dom = new JSDOM(source);
      try {
        for (const link of dom.window.document.head.querySelectorAll('link')) {
          if (!/^kindle:(flow|embed):/i.test(link.getAttribute('href') || '')) link.remove();
        }
        for (const node of dom.window.document.querySelectorAll('[aid],a[name]')) if (!node.id) node.id = node.getAttribute('aid') || node.getAttribute('name');
        return replace(dom.window.document.documentElement.outerHTML);
      } finally { dom.window.close(); }
    };
  }
  try {
    const spine = book.getSpine(); assert(spine.length && spine.length <= 10000, 'INVALID_DOCUMENT', 'Electronic book reading order is empty or too large.');
    const resolve = href => { if (typeof href !== 'string' || (kf8 && !/^kindle:pos:fid:[0-9A-V]+:off:[0-9A-V]+$/i.test(href))) return null; const r = book.resolveHref(href); if (!r) return null; const section = spine.findIndex(s => s.id === r.id); const anchor = r.selector?.match(/\[(?:id|aid|name)=["'](.*)["']\]/)?.[1]; return section >= 0 ? { section, ...(anchor ? { anchor } : {}) } : null; };
    const sections = [];
    for (const [i, item] of spine.entries()) {
      const chapter = await book.loadChapter(item.id);
      assert(chapter?.html, 'INVALID_DOCUMENT', 'An electronic book chapter could not be decoded.');
      sections.push(await normalizeSection(chapter.html, i, {
        resolveLink: resolve,
        resolveImage: async src => { const file = path.resolve(src); assert(file.startsWith(resourceDir + path.sep), 'SCOPE_DENIED', 'Book resource escaped its temporary directory.'); const safe = await safePath(resourceDir, path.relative(resourceDir, file)); return dataImage(await readBounded(safe, 16 * 1024 * 1024), path.extname(file)); }
      }));
    }
    const toc = [];
    const walk = (nodes, parentId = null) => { for (const n of nodes || []) { const target = resolve(n.href); let parent = parentId; if (target) { const node = { id: `original-${toc.length + 1}`, parentId, title: n.label || 'Untitled', locator: target, source: 'original' }; toc.push(node); parent = node.id; } walk(n.children, parent); } };
    walk(book.getToc());
    const meta = book.getMetadata();
    return { kind: 'flow', title: String(meta.title || ''), sections, toc: toc.length ? toc : tocFromHeadings(sections), warnings: sections.flatMap(s => s.warnings) };
  } finally { book.destroy(); }
}
async function parseDocument({ bytes, filename, workspace, resourceDir, password }) {
  bytes = Buffer.from(bytes);
  const format = path.extname(filename).slice(1).toLowerCase();
  assert(FORMATS.includes(format), 'UNSUPPORTED_FORMAT', `Unsupported document extension: .${format || '(none)'}`);
  let result;
  if(require('./av-document.cjs').FORMATS.includes(format))result=await require('./av-document.cjs').probe(bytes,filename,resourceDir);
  else if (format === 'pdf') result = await parsePdf(bytes, password);
  else if (format === 'epub') result = await parseEpub(bytes);
  else if (['mobi','azw','azw3','kf8'].includes(format)) result = await parseMobi(bytes, format, resourceDir);
  else {
    let html = '', warnings = [];
    if (format === 'docx') {
      await zipLoad(bytes);
      const converted = await require('mammoth').convertToHtml({ buffer: bytes }, { externalFileAccess: false, includeEmbeddedStyleMap: false, styleMap: ["p[style-name='标题 1'] => h1:fresh", "p[style-name='标题 2'] => h2:fresh", "p[style-name='标题 3'] => h3:fresh"] });
      html = converted.value; warnings = converted.messages.map(m => m.message);
    } else if (format === 'doc') {
      const WordExtractor = require('word-extractor');
      const doc = await new WordExtractor().extract(bytes);
      html = doc.getBody().split(/\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('');
      if (doc.getFootnotes()) html += `<h2>Footnotes</h2><pre>${escapeHtml(doc.getFootnotes())}</pre>`;
      warnings.push('Legacy DOC is read as extracted text. Page layout, images and original heading styles are not preserved; a custom outline can be added.');
    } else if (['md','markdown'].includes(format)) html = await require('marked').parse(textDecode(bytes), { gfm: true, async: true });
    else if (['html','htm','xhtml'].includes(format)) html = textDecode(bytes);
    else if (format === 'rtf') {
      assert(process.platform === 'darwin', 'DEPENDENCY_MISSING', 'RTF reading requires macOS textutil. Convert to DOCX/TXT on other platforms.');
      html = require('node:child_process').execFileSync('/usr/bin/textutil', ['-convert','html','-format','rtf','-stdin','-stdout'], { input: bytes, encoding: 'utf8', timeout: 30000, maxBuffer: LIMITS.html });
    } else if (format === 'odt') {
      const zip = await zipLoad(bytes); const dom = xml(await zipText(zip, 'content.xml'));
      try { for (const el of dom.window.document.getElementsByTagName('*')) {
        if (el.localName === 'h') { const level = Math.min(6, Math.max(1, Number(el.getAttribute('text:outline-level')) || 1)); html += `<h${level}>${escapeHtml(el.textContent)}</h${level}>`; }
        else if (el.localName === 'p') html += `<p>${escapeHtml(el.textContent)}</p>`;
      } } finally { dom.window.close(); }
      warnings.push('ODT is rendered as structured text; complex page layout is not retained.');
    } else if (format === 'fb2') {
      const dom = xml(textDecode(bytes));
      try { for (const el of dom.window.document.querySelectorAll('body title,body p,body subtitle')) html += `<${el.localName === 'p' ? 'p' : 'h2'}>${escapeHtml(el.textContent)}</${el.localName === 'p' ? 'p' : 'h2'}>`; } finally { dom.window.close(); }
    } else if (IMAGE_MIME['.' + format]) html = `<figure><img src="${dataImage(bytes, '.' + format)}" alt="${escapeHtml(path.basename(filename))}"></figure>`;
    else {
      const text = textDecode(bytes);
      html = format === 'txt' ? text.split(/\n\s*\n/).map(p => /^(第.{1,30}[章节卷部]|chapter\s+\w+)/i.test(p.trim()) && p.trim().length < 160 ? `<h2>${escapeHtml(p.trim())}</h2>` : `<pre>${escapeHtml(p)}</pre>`).join('') : `<pre>${escapeHtml(text)}</pre>`;
    }
    const resolveImage = async src => {
      if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/')) return null;
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(filename), decodeURIComponent(src.split('#')[0])));
      const file = await safePath(workspace, rel);
      return dataImage(await readBounded(file, 16 * 1024 * 1024), path.extname(rel));
    };
    const section = await normalizeSection(html, 0, { resolveImage });
    result = { title: section.headings[0]?.title || '', kind: 'flow', sections: [section], toc: tocFromHeadings([section]), warnings: [...warnings, ...section.warnings] };
  }
  result.title ||= path.basename(filename, path.extname(filename));
  result.format = format;
  result.pageCount = result.kind === 'pdf' ? result.sections.length : null;
  result.warnings = [...new Set(result.warnings || [])].slice(0, 100);
  return result;
}
module.exports = { parseDocument, FORMATS, textDecode, zipLoad };
