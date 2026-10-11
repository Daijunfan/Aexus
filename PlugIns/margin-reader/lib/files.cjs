'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { FORMATS } = require('./parsers.cjs');
const { assert, fail, isReserved, LIMITS, relative, safePath, exists, ensureDir, readBounded, atomicWrite, writeNew, digest, version, checkVersion, decodeBase64 } = require('./safety.cjs');
const TEXT = new Set(['txt','md','markdown','html','htm','xhtml','csv','json','xml','log','yaml','yml','rst','fb2']);
async function parentExists(workspace, rel) {
  const parent = path.posix.dirname(rel); const file = await safePath(workspace, parent, { root: true });
  assert((await exists(file))?.isDirectory(), 'NOT_FOUND', 'Destination folder does not exist. Create it with fs.mkdir first.');
}
async function inspectSubtree(file, budget = { n: 0 }) {
  assert(++budget.n <= LIMITS.tree, 'TOO_LARGE', 'Folder operation exceeds 10,000 entries.');
  const st = await fs.lstat(file);
  assert(!st.isSymbolicLink() && (!st.isFile() || st.nlink === 1), 'SCOPE_DENIED', 'Folder contains a symbolic or hard link.');
  assert(st.isFile() || st.isDirectory(), 'INVALID_FILE', 'Folder contains a special device or socket.');
  if (st.isDirectory()) for (const entry of await fs.readdir(file)) {
    assert(!isReserved(entry), 'SCOPE_DENIED', 'Folder contains protected plugin, Git or employee metadata.');
    await inspectSubtree(path.join(file, entry), budget);
  }
}
function remapDocuments(state, from, to) {
  for (const doc of Object.values(state.documents)) if (!doc.trashed && (doc.path === from || doc.path.startsWith(from + '/'))) { doc.path = to + doc.path.slice(from.length); doc.revision++; }
  if (state.settings.currentFolder === from || state.settings.currentFolder.startsWith(from + '/')) state.settings.currentFolder = to + state.settings.currentFolder.slice(from.length);
}
async function listing(store, params, tree = false) {
  const rel = relative(params.path ?? '.', { root: true }); const root = await safePath(store.workspace, rel, { root: true });
  assert((await exists(root))?.isDirectory(), 'NOT_FOUND', 'Folder does not exist.');
  const state = await store.load(); const byPath = new Map(Object.values(state.documents).filter(d => !d.trashed).map(d => [d.path, d]));
  let count = 0, truncated = false;
  async function walk(folder, base, depth) {
    const result = [];
    const entries = (await fs.readdir(folder, { withFileTypes: true })).filter(e => !isReserved(e.name) && e.name !== '.DS_Store').sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    for (const entry of entries) {
      if (++count > LIMITS.tree) { truncated = true; break; }
      const relPath = base === '.' ? entry.name : `${base}/${entry.name}`;
      const st = await fs.lstat(path.join(folder, entry.name)).catch(e => { if (e.code === 'ENOENT') return null; throw e; }); if (!st) continue;
      const doc = byPath.get(relPath); const ext = path.extname(entry.name).slice(1).toLowerCase();
      const item = { name: entry.name, path: relPath, kind: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'folder' : st.isFile() ? 'file' : 'special', size: st.size, modifiedAt: st.mtime.toISOString(), version: version(st), format: ext, readable: st.isFile() && st.nlink === 1 && FORMATS.includes(ext), ...(doc ? { documentId: doc.id, title: doc.title } : {}) };
      if (tree && item.kind === 'folder') { if (depth > 1) item.children = await walk(path.join(folder, entry.name), relPath, depth - 1); else item.collapsed = true; }
      result.push(item);
    }
    return result;
  }
  return { path: rel, entries: await walk(root, rel, tree ? params.depth ?? 32 : 1), truncated, revision: state.revision };
}
async function fileCommand(store, method, p) {
  if (method === 'fs.batch') return require('./batch.cjs').batchCommand(store, p);
  if (method === 'fs.list' || method === 'fs.tree') return listing(store, p, method === 'fs.tree');
  if (method === 'fs.trash.list') return { items: Object.entries((await store.load()).trash).map(([id, item]) => ({ id, ...item })) };
  if (method === 'import.status') { const uploads = (await store.load()).uploads; const upload = Object.hasOwn(uploads, p.uploadId) ? uploads[p.uploadId] : null; assert(upload, 'NOT_FOUND', 'Upload does not exist.'); return { uploadId: p.uploadId, ...upload }; }
  return store.transaction((state, rollback) => applyFileCommand(store, state, rollback, method, p));
}
// Single-file and batch requests share this mutation implementation.
async function applyFileCommand(store, state, rollback, method, p) {
    const workspace = store.workspace;
    if (method === 'fs.mkdir') { const rel = relative(p.path); const file = await safePath(workspace, rel); const prior = await exists(file); assert(!prior || prior.isDirectory(), 'ALREADY_EXISTS', 'A file already occupies this path.'); await ensureDir(workspace, rel); return { path: rel, created: !prior }; }
    if (method === 'fs.write') {
      const rel = relative(p.path); assert(TEXT.has(path.extname(rel).slice(1).toLowerCase()), 'UNSUPPORTED_FORMAT', 'fs.write only accepts supported text formats. Use import for binary files.');
      assert(Buffer.byteLength(p.content) <= LIMITS.html, 'TOO_LARGE', 'Text content exceeds 32 MiB.');
      const file = await safePath(workspace, rel); await parentExists(workspace, rel); const st = await exists(file);
      if (st) { assert(st.isFile(), 'INVALID_FILE', 'Destination is not a file.'); assert(p.expectedVersion, 'CONFLICT', 'Overwriting a file requires expectedVersion from fs.list.'); checkVersion(st, p.expectedVersion); const old = await readBounded(file); rollback(() => atomicWrite(file, old)); await atomicWrite(file, p.content); }
      else { await writeNew(file, p.content); rollback(() => fs.rm(file, { force: true })); }
      return { path: rel, version: version(await fs.stat(file)) };
    }
    if (method === 'fs.move' || method === 'fs.copy') {
      const from = relative(p.path), to = relative(p.target); assert(from !== to && !to.startsWith(from + '/'), 'INVALID_PATH', 'Destination must differ from the source and cannot be inside it.');
      const source = await safePath(workspace, from), target = await safePath(workspace, to); const st = await exists(source); assert(st, 'NOT_FOUND', 'Source does not exist.'); assert(!(await exists(target)), 'ALREADY_EXISTS', 'Destination already exists.'); await parentExists(workspace, to); await inspectSubtree(source); checkVersion(st, p.expectedVersion);
      if (method === 'fs.move') { await fs.rename(source, target); rollback(() => fs.rename(target, source)); remapDocuments(state, from, to); }
      else { rollback(() => fs.rm(target, { recursive: true, force: true })); await fs.cp(source, target, { recursive: true, force: false, errorOnExist: true }); }
      return { path: to, version: version(await fs.stat(target)) };
    }
    if (method === 'fs.trash') {
      const rel = relative(p.path), source = await safePath(workspace, rel), st = await exists(source); assert(st, 'NOT_FOUND', 'Source does not exist.'); checkVersion(st, p.expectedVersion); await inspectSubtree(source);
      const id = randomUUID(); await store.mkdir(`trash/${id}`); const destination = await store.meta(`trash/${id}/item`);
      await fs.rename(source, destination); rollback(() => fs.rename(destination, source));
      const documents = [];
      for (const doc of Object.values(state.documents)) if (!doc.trashed && (doc.path === rel || doc.path.startsWith(rel + '/'))) { doc.trashed = id; documents.push(doc.id); }
      state.trash[id] = { path: rel, kind: st.isDirectory() ? 'folder' : 'file', deletedAt: new Date().toISOString(), documents };
      if (state.settings.currentFolder === rel || state.settings.currentFolder.startsWith(rel + '/')) state.settings.currentFolder = '.';
      if (documents.includes(state.settings.lastDocument)) state.settings.lastDocument = null;
      return { trashId: id, path: rel };
    }
    if (method === 'fs.restore') {
      const item = Object.hasOwn(state.trash, p.trashId) ? state.trash[p.trashId] : null; assert(item, 'NOT_FOUND', 'Trash item does not exist.');
      const to = relative(p.target || item.path), target = await safePath(workspace, to); assert(!(await exists(target)), 'ALREADY_EXISTS', 'Restore destination already exists.'); await parentExists(workspace, to);
      const source = await store.meta(`trash/${p.trashId}/item`); await fs.rename(source, target); rollback(() => fs.rename(target, source));
      for (const id of item.documents) { const doc = state.documents[id]; if (doc) { doc.path = to + doc.path.slice(item.path.length); delete doc.trashed; doc.revision++; } }
      delete state.trash[p.trashId]; return { path: to };
    }
    if (method === 'import.begin') {
      const rel = relative(p.path); assert([...FORMATS,'mrpkg','mrbackup'].includes(path.extname(rel).slice(1).toLowerCase()), 'UNSUPPORTED_FORMAT', 'This file extension is not supported.');
      await parentExists(workspace, rel); assert(!(await exists(await safePath(workspace, rel))), 'ALREADY_EXISTS', 'Destination already exists.');
      assert(Object.keys(state.uploads).length < 32, 'UPLOAD_LIMIT', 'There are 32 pending uploads. Finish or abort an upload first.');
      const id = randomUUID(), file = await store.meta(`uploads/${id}`); await writeNew(file, Buffer.alloc(0)); rollback(() => fs.rm(file, { force: true }));
      state.uploads[id] = { path: rel, totalBytes: p.totalBytes, received: 0, createdAt: new Date().toISOString() };
      return { uploadId: id, ...state.uploads[id], chunkSize: LIMITS.chunk };
    }
    if (method === 'import.chunk' || method === 'import.finish' || method === 'import.abort') {
      const upload = Object.hasOwn(state.uploads, p.uploadId) ? state.uploads[p.uploadId] : null; assert(upload, 'NOT_FOUND', 'Upload does not exist.'); const file = await store.meta(`uploads/${p.uploadId}`);
      if (method === 'import.abort') { delete state.uploads[p.uploadId]; return { aborted: true, stagingFile: p.uploadId }; }
      if (method === 'import.chunk') {
        assert(p.offset === upload.received, 'CONFLICT', 'Upload offset does not match the committed bytes.', { received: upload.received });
        const bytes = decodeBase64(p.contentBase64); assert(upload.received + bytes.length <= upload.totalBytes, 'TOO_LARGE', 'Chunk exceeds the declared file size.');
        const offset = upload.received; await fs.truncate(file, offset); rollback(() => fs.truncate(file, offset));
        const handle = await fs.open(file, 'r+'); try { let written = 0; while (written < bytes.length) written += (await handle.write(bytes, written, bytes.length - written, offset + written)).bytesWritten; await handle.sync(); } finally { await handle.close(); }
        upload.received += bytes.length; return { uploadId: p.uploadId, received: upload.received, totalBytes: upload.totalBytes };
      }
      assert(upload.received === upload.totalBytes, 'INCOMPLETE_UPLOAD', 'Upload does not contain all declared bytes.');
      const bytes = await readBounded(file); assert(bytes.length === upload.totalBytes, 'INCOMPLETE_UPLOAD', 'Staged file size does not match the upload.');
      if (p.sha256) assert(digest(bytes) === p.sha256, 'CHECKSUM_MISMATCH', 'Uploaded file SHA-256 does not match.');
      const target = await safePath(workspace, upload.path); await parentExists(workspace, upload.path); assert(!(await exists(target)), 'ALREADY_EXISTS', 'Destination appeared while uploading.');
      await fs.rename(file, target); rollback(() => fs.rename(target, file)); delete state.uploads[p.uploadId]; return { path: upload.path };
    }
    fail('METHOD_NOT_FOUND', `Unknown file command: ${method}`);
}
module.exports = { fileCommand, applyFileCommand, listing, parentExists, inspectSubtree };
