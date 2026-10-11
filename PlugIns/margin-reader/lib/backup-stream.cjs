'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const S = require('./safety.cjs');
const Source = require('./backup-stream-source.cjs');
const Format = require('./backup-stream-format.cjs');

async function stage(store, kind) {
  await store.mkdir('backup-staging');
  const rel = `backup-staging/${kind}-${randomUUID()}`, directory = await store.meta(rel);
  await fs.mkdir(directory, { mode: 0o700 });
  return { rel, directory };
}
async function syncDirectory(directory) {
  const handle = await fs.open(directory, 'r');
  try { await handle.sync(); }
  catch (error) { if (!['EINVAL','ENOTSUP','EBADF'].includes(error.code)) throw error; }
  finally { await handle.close(); }
}
async function publish(store, staging, relative, check) {
  return store.transaction(async (state, rollback) => {
    if (check) await check(state);
    const destination = await S.safePath(store.workspace, relative);
    await require('./files.cjs').parentExists(store.workspace, relative);
    // Reserve the name exclusively; never replace an existing empty directory.
    try{await fs.mkdir(destination, { mode: 0o700 });}catch(error){if(error.code==='EEXIST')S.fail('ALREADY_EXISTS','Backup or restore destination was created by another operation.');throw error;}
    rollback(() => fs.rm(destination, { recursive: true, force: true }));
    await fs.rename(staging.directory, destination);
    await syncDirectory(path.dirname(destination));
    return destination;
  });
}
function explain(error) {
  if (error.code === 'ENOSPC' || error.code === 'EDQUOT') return new S.ReaderError('DISK_FULL', 'Backup storage is full. No complete backup or restored library was published.');
  return error;
}
async function create(store, p) {
  const preview = await Source.plan(store, p);
  S.assert(preview.sufficientSpace, 'DISK_FULL', 'Not enough available space for a segmented backup.', preview);
  const rel = preview.path, state = await store.load(), data = Source.snapshot(state);
  const source = await Source.inventory(store, rel);
  const h = Format.header(p.password), secret = await Format.key(h, p.password);
  let staging, storedBytes = 0;
  try {
    staging = await stage(store, 'create');
    await fs.mkdir(path.join(staging.directory, 'chunks'), { mode: 0o700 });
    const m = { schema: Format.SCHEMA, revision: state.revision, createdAt: h.createdAt, files: [], directories: source.directories, originalBytes: source.bytes + data.length };
    const seen = new Set();
    async function append(name, size, iterable) {
      const row = { path: name, bytes: size, sha256: '', segments: [] }, hash = createHash('sha256'); let read = 0;
      for await (const bytes of iterable) {
        const sha256 = S.digest(bytes); hash.update(bytes); read += bytes.length;
        row.segments.push({ sha256, bytes: bytes.length });
        if (!seen.has(sha256)) {
          const encoded = Format.seal(bytes, h, secret, sha256);
          await S.writeNew(await S.safePath(staging.directory, `chunks/${Format.chunkName(h,secret,sha256)}`), encoded);
          storedBytes += encoded.length; seen.add(sha256);
        }
      }
      S.assert(read === size, 'CONFLICT', 'A backup input changed size.');
      row.sha256 = hash.digest('hex'); m.files.push(row);
    }
    for (const row of source.files) {
      const file = await S.safePath(store.workspace, row.path, { internal: row.path.startsWith('.margin-reader/') });
      await append(row.path, row.bytes, Source.chunks(file, row, Format.CHUNK_BYTES));
    }
    async function *stateChunks() { for (let i = 0; i < data.length; i += Format.CHUNK_BYTES) yield data.subarray(i, i + Format.CHUNK_BYTES); }
    await append('.margin-reader/state.json', data.length, stateChunks());
    Format.validateManifest(require('./study-package.cjs').cleanTree(m));
    const manifestBytes = Buffer.from(JSON.stringify(m));
    S.assert(manifestBytes.length <= Source.MAX_METADATA, 'TOO_LARGE', 'Backup manifest exceeds 64 MiB.');
    const encoded = Format.seal(manifestBytes, h, secret, 'manifest');
    await S.writeNew(path.join(staging.directory, 'manifest.bin'), encoded);
    h.manifestSha256 = S.digest(encoded);
    const headerBytes = Buffer.from(JSON.stringify(h));
    await S.writeNew(path.join(staging.directory, 'header.json'), headerBytes);
    await syncDirectory(path.join(staging.directory, 'chunks')); await syncDirectory(staging.directory);
    await publish(store, staging, rel, async fresh => {
      S.assert(fresh.revision === state.revision, 'CONFLICT', 'Library metadata changed during backup. Retry with a fresh snapshot.');
      const current = await Source.inventory(store, rel);
      S.assert(JSON.stringify(current) === JSON.stringify(source), 'CONFLICT', 'Library files or folders changed during backup. No mixed snapshot was published.');
    });
    return { path: rel, format: 'segmented', schema: Format.SCHEMA, files: m.files.length, originalBytes: m.originalBytes,
      bytes: storedBytes + encoded.length + headerBytes.length, chunks: seen.size, chunkBytes: Format.CHUNK_BYTES,
      encrypted: Boolean(secret), revision: state.revision, container: 'directory' };
  } catch (error) { throw explain(error); }
  finally { secret?.fill(0); if (staging) await fs.rm(staging.directory, { recursive: true, force: true }); }
}
async function normalizedCache(relative, bytes, caches) {
  let parsed;
  try { parsed = require('./study-package.cjs').cleanTree(JSON.parse(bytes)); } catch { return null; }
  if (!['pdf','flow'].includes(parsed.kind) || !Array.isArray(parsed.sections) || parsed.sections.length > 20000) return null;
  if (parsed.kind === 'flow') {
    const sections = [];
    for (const [index, section] of parsed.sections.entries()) sections.push(await require('./html.cjs').normalizeSection(String(section.html || ''), index, { title: section.title }));
    parsed.sections = sections;
  }
  caches.set(path.basename(relative, '.json'), parsed);
  return Buffer.from(JSON.stringify(parsed));
}
async function restoredState(state, destination, records, caches) {
  state.uploads = {};
  for (const doc of Object.values(state.documents)) {
    if (doc.trashed) continue;
    const row = records.get(doc.path);
    if (!row) continue;
    const file = await S.safePath(destination, doc.path), st = await S.exists(file);
    if (st?.isFile() && row.sha256 === doc.hash) doc.sourceVersion = S.version(st);
    if (caches.has(doc.cacheKey)) for (const node of doc.toc || []) {
      try { require('./outline.cjs').validateLocator(node.locator, caches.get(doc.cacheKey)); }
      catch { node.unresolved = true; }
    }
  }
  await fs.mkdir(path.join(destination, '.margin-reader'), { recursive: true, mode: 0o700 });
  await S.writeNew(await S.safePath(destination, '.margin-reader/state.json', { internal: true }), JSON.stringify(state));
}
async function restore(store, p) {
  const rel = S.relative(p.folder), archive = S.relative(p.path);
  S.assert(!rel.startsWith(archive + '/'), 'SCOPE_DENIED', 'Do not restore inside the backup package.');
  const destination = await S.safePath(store.workspace, rel);
  await require('./files.cjs').parentExists(store.workspace, rel);
  S.assert(!(await S.exists(destination)), 'ALREADY_EXISTS', 'Restore into a new folder; existing libraries are never replaced.');
  const backup = await Format.read(store, p); let staging;
  try {
    const required = backup.manifest.originalBytes + (backup.manifest.files.length + backup.manifest.directories.length) * 4096 + Source.MAX_METADATA;
    await Source.diskSpace(path.dirname(destination), required);
    staging = await stage(store, 'restore');
    const caches = new Map(), rows = new Map(backup.manifest.files.map(r => [r.path, r])); let skippedCaches = 0;
    for (const directory of backup.manifest.directories) await S.ensureDir(staging.directory, directory);
    for (const row of backup.manifest.files) {
      if (row.path === '.margin-reader/state.json') continue; // Already validated in Format.read.
      const file = await S.safePath(staging.directory, row.path, { internal: row.path.startsWith('.margin-reader/') });
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      if (row.path.startsWith('.margin-reader/cache/') && row.path.endsWith('.json')) {
        const bytes = await normalizedCache(row.path, await Format.collect(backup, row), caches);
        if (bytes) await S.writeNew(file, bytes); else skippedCaches++;
      } else {
        const handle = await fs.open(file, 'wx', 0o600);
        try { for await (const bytes of Format.rowChunks(backup, row)) await handle.writeFile(bytes); await handle.sync(); }
        finally { await handle.close(); }
      }
    }
    await restoredState(backup.state, staging.directory, rows, caches);
    await syncDirectory(staging.directory);
    await publish(store, staging, rel);
    return { folder: rel, workspaceRelative: rel, format: 'segmented', files: rows.size - skippedCaches,
      documents: Object.keys(backup.state.documents).length, studies: Object.keys(backup.state.studySets).length, skippedCaches };
  } catch (error) { throw explain(error); }
  finally { backup.secret?.fill(0); if (staging) await fs.rm(staging.directory, { recursive: true, force: true }); }
}
module.exports = { create, restore, inspect: Format.inspect, plan: Source.plan, normalizedCache, restoredState };
