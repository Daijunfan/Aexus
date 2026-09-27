'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parseInWorker } = require('./parse.cjs');
const { validateLocator, editOutline } = require('./outline.cjs');
const { parentExists } = require('./files.cjs');
const { standaloneHtml } = require('./html.cjs');
const { assert, fail, LIMITS, relative, safePath, readBounded, atomicWrite, writeNew, exists, digest, version, escapeHtml } = require('./safety.cjs');
function findDocument(state, id) { const doc = Object.hasOwn(state.documents, id) ? state.documents[id] : null; assert(doc && !doc.trashed, 'NOT_FOUND', 'Document does not exist or is in trash.'); return doc; }
async function sourceStatus(store, doc) {
  const file = await safePath(store.workspace, doc.path); const st = await exists(file);
  return { file, st, changed: !st || !st.isFile() || version(st) !== doc.sourceVersion };
}
async function parsedDocument(store, doc, requireFresh = true) {
  if (requireFresh) assert(!(await sourceStatus(store, doc)).changed, 'SOURCE_CHANGED', 'Source changed outside the reader. Reopen the document before reading or editing its outline.');
  const file = await store.meta(`cache/${doc.cacheKey}.json`);
  const bytes = await readBounded(file, LIMITS.expanded);
  try { return JSON.parse(bytes.toString('utf8')); } catch { fail('CACHE_CORRUPT', 'Parsed cache is unreadable. Reopen with refresh:true to rebuild it.'); }
}
function descriptor(doc, parsed, changed = false) {
  return { id: doc.id, path: doc.path, title: doc.title, format: doc.format, kind: doc.kind, revision: doc.revision, sourceVersion: doc.sourceVersion, sourceChanged: changed, sourceUrl: doc.sourceUrl || null, pageCount: parsed.pageCount, pageLabels: parsed.pageLabels || null, sectionCount: parsed.sections.length, sections: parsed.sections.map((s, i) => ({ index: i, title: s.title, textLength: s.text.length, ...(s.width ? { width: s.width, height: s.height } : {}) })), toc: doc.toc, customOutline: doc.customOutline, foldedPages:doc.foldedPages||[], position: doc.position, originalAsset: `original/${doc.id}`, warnings: [...(doc.importWarnings || []), ...(parsed.warnings || [])], createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}
async function openDocument(store, p, provenance) {
  const rel = relative(p.path);
  return store.transaction(async state => {
    const file = await safePath(store.workspace, rel); const st = await exists(file); assert(st?.isFile(), 'NOT_FOUND', 'Document file does not exist.');
    let doc = Object.values(state.documents).find(d => !d.trashed && d.path === rel);
    const currentVersion = version(st);
    if (doc && doc.sourceVersion === currentVersion && !p.refresh) {
      const parsed = await parsedDocument(store, doc); if (p.activate !== false) {state.settings.lastDocument = doc.id;state.settings.openDocuments=[...new Set([...(state.settings.openDocuments||[]),doc.id])].slice(-20);} return descriptor(doc, parsed);
    }
    const bytes = await readBounded(file);
    const parsed = await parseInWorker(store, { bytes, filename: rel, password: p.password });
    assert(version(await fs.stat(await safePath(store.workspace, rel))) === currentVersion, 'CONFLICT', 'Source changed during parsing. Reopen the document to retry.');
    const id = doc?.id || randomUUID(), hash = digest(bytes), cacheKey = `${id}-${hash}`;
    const encoded = JSON.stringify(parsed); assert(Buffer.byteLength(encoded) <= LIMITS.expanded, 'TOO_LARGE', 'Parsed document exceeds the cache size limit.');
    await atomicWrite(await store.meta(`cache/${cacheKey}.json`), encoded);
    const now = new Date().toISOString();
    const custom = doc?.customOutline;
    doc = { id, path: rel, title: parsed.title, format: parsed.format, kind: parsed.kind, hash, cacheKey, sourceVersion: currentVersion, revision: (doc?.revision || 0) + 1, toc: custom ? doc.toc : structuredClone(parsed.toc), customOutline: Boolean(custom), bookmarks: doc?.bookmarks || [], foldedPages:doc?.hash===hash?(doc.foldedPages||[]):[], position: doc?.position || (parsed.kind === 'pdf' ? { page: 1 } : { section: 0 }), createdAt: doc?.createdAt || now, updatedAt: now, sourceUrl: provenance?.source || doc?.sourceUrl, importWarnings: provenance?.warnings || doc?.importWarnings || [] };
    try { validateLocator(doc.position, parsed); } catch { doc.position = parsed.kind === 'pdf' ? { page: 1 } : { section: 0 }; }
    for (const node of doc.toc) { try { validateLocator(node.locator, parsed); delete node.unresolved; } catch { node.unresolved = true; } }
    state.documents[id] = doc; if (p.activate !== false) {state.settings.lastDocument = id;state.settings.openDocuments=[...new Set([...(state.settings.openDocuments||[]),id])].slice(-20);}
    return descriptor(doc, parsed);
  });
}
async function documentCommand(store, method, p) {
  if(method==='document.list'){const state=await store.load();return {documents:Object.values(state.documents).filter(d=>!d.trashed&&(!p.ids||p.ids.includes(d.id))).map(d=>({id:d.id,title:d.title,path:d.path,format:d.format,kind:d.kind,revision:d.revision,sourceVersion:d.sourceVersion}))};}
  if (method === 'document.open') return openDocument(store, p);
  const mutate = method.startsWith('toc.') && method !== 'toc.list' || method.startsWith('bookmark.') && method !== 'bookmark.list' || method === 'reader.position.set' || method === 'document.export' || method === 'document.fold';
  const action = async (state, rollback = () => {}) => {
    const doc = findDocument(state, p.id);
    if (method === 'reader.position.get') return { id: doc.id, locator: doc.position };
    if (method === 'toc.list') return { id: doc.id, revision: doc.revision, toc: doc.toc, customOutline: doc.customOutline, sourceChanged: (await sourceStatus(store, doc)).changed };
    const bookmarks = async () => ({ id: doc.id, revision: doc.revision, bookmarks: (doc.bookmarks || []).filter(b => p.includeTrashed || !b.deletedAt).map(b => ({ ...b, unresolved: b.sourceHash !== doc.hash })), sourceChanged: (await sourceStatus(store, doc)).changed });
    if (method === 'bookmark.list') return bookmarks();
    const parsed = await parsedDocument(store, doc, method !== 'document.get');
    if (method === 'document.get') return descriptor(doc, parsed, (await sourceStatus(store, doc)).changed);
    if (method === 'document.content') {
      const index = p.page !== undefined ? p.page - 1 : p.section ?? 0;
      assert(p.page === undefined || parsed.kind === 'pdf', 'INVALID_PARAMS', 'page is only valid for PDF documents.');
      assert(index >= 0 && index < parsed.sections.length, 'INVALID_LOCATOR', 'Section/page is outside the document.');
      const section = parsed.sections[index];
      return { id: doc.id, section: index, ...(parsed.kind === 'pdf' ? { page: index + 1 } : {}), html: section.html, text: section.text, anchors: section.anchors, title: section.title, blocks: section.blocks };
    }
    if (method === 'document.search') {
      assert(p.query.trim() && p.query.length <= 1000, 'INVALID_PARAMS', 'Search text must contain 1–1000 characters.');
      const query = p.caseSensitive ? p.query : p.query.toLocaleLowerCase(); const matches = [], limit = p.limit || 100;
      let truncated = false;
      outer: for (const [section, s] of parsed.sections.entries()) {
        for (const block of s.blocks.length ? s.blocks : [{ text: s.text, anchor: null }]) {
          const text = p.caseSensitive ? block.text : block.text.toLocaleLowerCase();
          for (let from = 0; from < text.length;) {
            const offset = text.indexOf(query, from); if (offset < 0) break;
            if (matches.length >= limit) { truncated = true; break outer; }
            matches.push({ locator: parsed.kind === 'pdf' ? { page: section + 1 } : { section, ...(block.anchor ? { anchor: block.anchor } : {}) }, excerpt: block.text.slice(Math.max(0, offset - 50), Math.min(block.text.length, offset + p.query.length + 90)), matchOffset: Math.min(50, offset), matchLength: p.query.length });
            from = offset + Math.max(1, query.length);
          }
        }
      }
      return { id: doc.id, query: p.query, matches, truncated };
    }
    if(method==='document.fold'){assert(p.expectedRevision===doc.revision,'CONFLICT','Document changed; refresh before folding.');assert(doc.kind==='pdf'&&Array.isArray(p.pages)&&p.pages.every(n=>Number.isInteger(n)&&n>=1&&n<=parsed.pageCount),'INVALID_PARAMS','Choose valid PDF page numbers.');doc.foldedPages=[...new Set(p.pages)];doc.revision++;return descriptor(doc,parsed);}
    if (method.startsWith('toc.')) return editOutline(doc, parsed, method, p);
    if (method.startsWith('bookmark.')) {
      assert(p.expectedRevision === doc.revision, 'CONFLICT', 'Document changed in another client. Refresh and explicitly retry.', { currentRevision: doc.revision });
      doc.bookmarks ??= [];
      const title = value => { assert(value.trim() && value.length <= 200, 'INVALID_PARAMS', 'Bookmark title must contain 1–200 characters.'); return value.trim(); };
      if (method === 'bookmark.add') doc.bookmarks.push({ id: randomUUID(), title: title(p.title), locator: validateLocator(p.locator, parsed), sourceHash: doc.hash });
      else if (method === 'bookmark.update') {
        const b = doc.bookmarks.find(b => b.id === p.bookmarkId); assert(b, 'NOT_FOUND', 'Bookmark not found.');
        assert(p.title !== undefined || p.deleted !== undefined, 'INVALID_PARAMS', 'Provide title or deleted.');
        if (p.title !== undefined) b.title = title(p.title);
        if (p.deleted === true) b.deletedAt = new Date().toISOString(); else if (p.deleted === false) delete b.deletedAt;
      } else fail('METHOD_NOT_FOUND', 'Unknown bookmark method.');
      doc.revision++; doc.updatedAt = new Date().toISOString(); return bookmarks();
    }
    if (method === 'reader.position.set') { doc.position = validateLocator(p.locator, parsed); state.settings.lastDocument = doc.id; return { id: doc.id, locator: doc.position }; }
    if (method === 'document.export') {
      const rel = relative(p.path); const target = await safePath(store.workspace, rel); await parentExists(store.workspace, rel); assert(!(await exists(target)), 'ALREADY_EXISTS', 'Export destination exists.');
      let content;
      if (p.format === 'json') content = JSON.stringify({ schemaVersion: 1, document: descriptor(doc, parsed), sections: parsed.sections }, null, 2);
      else if (p.format === 'txt') content = parsed.sections.map(s => s.text).join('\n\n');
      else if (p.format === 'md') content = `# ${doc.title}\n\n` + parsed.sections.map((s, i) => `${parsed.sections.length > 1 ? `## ${s.title || `Section ${i + 1}`}\n\n` : ''}${s.text}`).join('\n\n');
      else content = standaloneHtml(doc.title, `<h1>${escapeHtml(doc.title)}</h1>` + parsed.sections.map((s, i) => `<section id="section-${i}">${s.html}</section>`).join('\n'), doc.sourceUrl);
      await writeNew(target, content); rollback(() => fs.rm(target, { force: true }));
      return { path: rel, format: p.format, bytes: Buffer.byteLength(content), note: parsed.kind === 'pdf' ? 'Export contains the extracted text layer; original PDF pages remain in the source file.' : undefined };
    }
    fail('METHOD_NOT_FOUND', `Unknown document command: ${method}`);
  };
  return mutate ? store.transaction(action) : action(await store.load());
}
module.exports = { openDocument, documentCommand, findDocument, parsedDocument, sourceStatus, descriptor };
