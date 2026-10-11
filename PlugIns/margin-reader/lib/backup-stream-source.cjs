'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const S = require('./safety.cjs');
const MAX_BYTES = 1024 ** 4, MAX_FILES = 100000, MAX_METADATA = 64 * 1024 * 1024;
const metadata = new Set(['study-assets','study-media','versions','databases','trash','cache']);

// A backup never recursively includes older backups, execution credentials or
// another employee's private index. Files in ordinary child folders remain data.
async function inventory(store, destination) {
  const files = [], directories = []; let bytes = 0;
  async function walk(folder, relative = '', depth = 0) {
    S.assert(depth <= 128, 'TOO_LARGE', 'Backup folder depth exceeds 128 levels.');
    const entries = await fs.readdir(folder, { withFileTypes: true });
    entries.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const rel = relative ? relative + '/' + entry.name : entry.name;
      const protectedName=S.protectedName(entry.name);
      if (rel === destination || /\.mrbackup$/i.test(entry.name) || entry.name==='.DS_Store' || ['.agents-company','.git'].includes(protectedName)) continue;
      if (protectedName === '.margin-reader' && relative) continue;
      S.assert(protectedName!=='.margin-reader'||entry.name==='.margin-reader','SCOPE_DENIED','The reader metadata directory must retain its canonical name.');
      if (rel.startsWith('.margin-reader/')) {
        if (rel === '.margin-reader/state.json' || !metadata.has(rel.split('/')[1]) || rel.endsWith('.tmp') || rel.endsWith('.lock')) continue;
        if (rel.startsWith('.margin-reader/cache/') && (!rel.endsWith('.json') || rel.startsWith('.margin-reader/cache/preview-'))) continue;
      }
      const file = await S.safePath(store.workspace, rel, { internal: rel.startsWith('.margin-reader') });
      const st = await fs.lstat(file);
      S.assert(!st.isSymbolicLink() && (!st.isFile() || st.nlink === 1), 'SCOPE_DENIED', 'Backups cannot follow symbolic or hard links.');
      if (st.isDirectory()) {
        if (!rel.startsWith('.margin-reader')) directories.push(S.relative(rel));
        S.assert(directories.length <= MAX_FILES, 'TOO_LARGE', 'Backup exceeds 100000 folders.');
        await walk(file, rel, depth + 1);
      } else {
        S.assert(st.isFile(), 'INVALID_FILE', 'Only regular files can be backed up.');
        S.assert(Number.isSafeInteger(st.size) && st.size >= 0, 'TOO_LARGE', 'File size cannot be represented safely.');
        bytes += st.size;
        S.assert(bytes <= MAX_BYTES && files.length < MAX_FILES - 1, 'TOO_LARGE', 'Segmented backup exceeds 1 TiB or 100000 files.');
        files.push({ path: require('./backup-reader.cjs').allowed(rel), bytes: st.size, version: S.version(st) });
      }
    }
  }
  await walk(store.workspace);
  return { files, directories, bytes };
}
async function *chunks(file, expected, chunkBytes) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const st = await handle.stat();
    S.assert(st.isFile() && st.nlink === 1, 'SCOPE_DENIED', 'Backup input must be a non-linked regular file.');
    S.assert(S.version(st) === expected.version, 'CONFLICT', 'A backup input changed before it was read.');
    const buffer = Buffer.allocUnsafe(Math.max(1, Math.min(chunkBytes, st.size)));
    let position = 0;
    while (position < st.size) {
      const wanted = Math.min(buffer.length, st.size - position); let read = 0;
      while (read < wanted) {
        const result = await handle.read(buffer, read, wanted - read, position + read);
        S.assert(result.bytesRead > 0, 'CONFLICT', 'A backup input was truncated while reading.');
        read += result.bytesRead;
      }
      position += wanted;
      yield buffer.subarray(0, wanted);
    }
    S.assert(S.version(await handle.stat()) === expected.version, 'CONFLICT', 'A backup input changed while reading.');
  } finally { await handle.close(); }
}
async function hashFile(file, expected) {
  const hash = crypto.createHash('sha256');
  for await (const bytes of chunks(file, expected, 1024 * 1024)) hash.update(bytes);
  return hash.digest('hex');
}
async function diskSpace(directory, required) {
  const stat = await fs.statfs(directory, { bigint: true });
  const available = stat.bavail * stat.bsize;
  S.assert(available >= BigInt(Math.ceil(required)), 'DISK_FULL', 'Not enough available disk space for the backup or restored library.', { requiredBytes: required, availableBytes: Number(available) });
  return Number(available);
}
function snapshot(state) {
  const saved = { ...state, uploads: {} }, bytes = Buffer.from(JSON.stringify(saved));
  S.assert(bytes.length <= MAX_METADATA, 'TOO_LARGE', 'Library metadata exceed the 64 MiB segmented-backup validation budget.');
  require('./backup-reader.cjs').validateState(require('./study-package.cjs').cleanTree(saved));
  return bytes;
}
async function plan(store, p) {
  const rel = S.relative(p.path);
  S.assert(rel.toLowerCase().endsWith('.mrbackup'), 'INVALID_PARAMS', 'Use a .mrbackup path.');
  const target = await S.safePath(store.workspace, rel); await require('./files.cjs').parentExists(store.workspace, rel);
  S.assert(!(await S.exists(target)), 'ALREADY_EXISTS', 'Backup destination already exists.');
  const state = await store.load(), data = snapshot(state), source = await inventory(store, rel);
  const chunkBytes = 4 * 1024 * 1024;
  const segments = source.files.reduce((n,r) => n + Math.ceil(r.bytes / chunkBytes), Math.ceil(data.length / chunkBytes));
  const originalBytes = source.bytes + data.length;
  const estimatedAdditionalBytes = originalBytes + segments * 4096 + (source.files.length + source.directories.length) * 512 + 1024 * 1024;
  const stat = await fs.statfs(path.dirname(target), { bigint: true }), availableBytes = Number(stat.bavail * stat.bsize);
  return { path: rel, revision: state.revision, files: source.files.length + 1, directories: source.directories.length, originalBytes,
    largestFileBytes: source.files.reduce((max, r) => Math.max(max, r.bytes), data.length), chunkBytes, estimatedAdditionalBytes, availableBytes,
    sufficientSpace: availableBytes >= estimatedAdditionalBytes, fitsLegacyZip: originalBytes <= 256 * 1024 * 1024,
    format: 'segmented', excludes: ['other .mrbackup archives','credentials','.git','nested private indexes','active uploads','derived previews'] };
}
module.exports = { inventory, chunks, hashFile, diskSpace, snapshot, plan, MAX_BYTES, MAX_FILES, MAX_METADATA };
