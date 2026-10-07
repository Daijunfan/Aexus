'use strict';
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const { randomBytes, randomUUID, scrypt, createCipheriv, createDecipheriv, createHash, createHmac } = require('node:crypto');
const S = require('./safety.cjs');
const { MAX_BYTES, MAX_FILES, MAX_METADATA } = require('./backup-stream-source.cjs');
const SCHEMA = 'margin-reader.backup/v2', CHUNK_BYTES = 4 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const derive = promisify(scrypt);
function header(password) {
  if (password) S.assert(typeof password === 'string' && password.length >= 8 && password.length <= 1000, 'INVALID_PARAMS', 'Use a passphrase of 8–1000 characters.');
  return { schema: SCHEMA, id: randomUUID(), createdAt: new Date().toISOString(), chunkBytes: CHUNK_BYTES,
    encryption: password ? 'aes-256-gcm' : 'none', ...(password ? { salt: randomBytes(16).toString('hex') } : {}) };
}
async function key(h, password) {
  if (h.encryption === 'none') return null;
  S.assert(typeof password === 'string' && password.length <= 1000, 'PASSWORD_REQUIRED', 'Supply the encrypted backup passphrase.');
  return derive(password, Buffer.from(h.salt, 'hex'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
const aad = (h, label) => Buffer.from(JSON.stringify([SCHEMA, h.id, h.createdAt, h.chunkBytes, h.encryption, h.salt || null, label]));
function seal(bytes, h, secret, label) {
  if (!secret) return bytes;
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, iv, { authTagLength: 16 });
  cipher.setAAD(aad(h, label));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
function unseal(bytes, h, secret, label, code = 'CHECKSUM_MISMATCH') {
  if (!secret) return bytes;
  S.assert(bytes.length >= 28, code, 'Truncated encrypted backup record.');
  try {
    const cipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0,12), { authTagLength: 16 });
    cipher.setAAD(aad(h, label)); cipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
  } catch { S.fail(code, code === 'PASSWORD_REQUIRED' ? 'Wrong passphrase or damaged encrypted backup manifest.' : 'Backup record authentication failed.'); }
}
function json(bytes) {
  try { return require('./study-package.cjs').cleanTree(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { if (error.code) throw error; S.fail('INVALID_BACKUP', 'Backup metadata are not valid JSON.'); }
}
function validateManifest(m) {
  S.assert(m?.schema === SCHEMA && Array.isArray(m.files) && m.files.length > 0 && m.files.length <= MAX_FILES && Array.isArray(m.directories) && m.directories.length <= MAX_FILES, 'INVALID_BACKUP', 'Unsupported segmented backup manifest.');
  const files = new Set(), canonical = new Set(), canonicalFiles = new Set(), directories = new Set(); let total = 0;
  const canonicalize = value => value.normalize('NFC').toLocaleLowerCase('en-US');
  function reserve(value) {
    const canonicalPath = canonicalize(value);
    S.assert(!canonical.has(canonicalPath), 'INVALID_BACKUP', 'Backup paths collide on a case-insensitive or Unicode-normalizing filesystem.');
    canonical.add(canonicalPath);
  }
  for (const directory of m.directories) { S.relative(directory); reserve(directory); directories.add(directory); }
  for (const row of m.files) {
    S.assert(row&&typeof row==='object'&&!Array.isArray(row),'INVALID_BACKUP','Invalid backup file descriptor.');
    require('./backup-reader.cjs').allowed(row.path); reserve(row.path); files.add(row.path); canonicalFiles.add(canonicalize(row.path));
    S.assert(HASH.test(row.sha256) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && Array.isArray(row.segments) && row.segments.length === Math.ceil(row.bytes / CHUNK_BYTES), 'INVALID_BACKUP', 'Invalid backup file record.');
    let size = 0;
    for (const [index, segment] of row.segments.entries()) {
      const expected = Math.min(CHUNK_BYTES, row.bytes - index * CHUNK_BYTES);
      S.assert(segment && HASH.test(segment.sha256) && segment.bytes === expected, 'INVALID_BACKUP', 'Invalid chunk record.'); size += segment.bytes;
    }
    S.assert(size === row.bytes, 'INVALID_BACKUP', 'Chunk sizes do not match the file size.');
    total += row.bytes; S.assert(total <= MAX_BYTES, 'TOO_LARGE', 'Backup exceeds 1 TiB.');
  }
  for (const name of [...files, ...directories]) {
    const parts = name.split('/'); S.assert(parts.length <= 129, 'TOO_LARGE', 'Restored folder depth exceeds 128 levels.');
    while (parts.length > 1) { parts.pop(); S.assert(!canonicalFiles.has(canonicalize(parts.join('/'))), 'INVALID_BACKUP', 'A file is used as the parent of another backup entry.'); }
  }
  S.assert(files.has('.margin-reader/state.json'), 'INVALID_BACKUP', 'Backup contains no library state.');
  S.assert(m.originalBytes === total, 'INVALID_BACKUP', 'Backup total does not match its file records.');
  return total;
}
function chunkName(header,secret,sha256){return (secret?createHmac('sha256',secret).update(header.id+':'+sha256).digest('hex'):sha256)+'.bin';}
async function *rowChunks(backup, row) {
  const hash = createHash('sha256'); let total = 0;
  for (const segment of row.segments) {
    const file = await S.safePath(backup.directory, `chunks/${chunkName(backup.header,backup.secret,segment.sha256)}`);
    let raw;try{raw=await S.readBounded(file,CHUNK_BYTES+28);}catch(error){if(error.code==='ENOENT')S.fail('CHECKSUM_MISMATCH','A backup chunk is missing. Copy the complete package before restoring.');throw error;}
    S.assert(raw.length === segment.bytes + (backup.secret ? 28 : 0), 'CHECKSUM_MISMATCH', 'Backup chunk size changed.');
    const bytes = unseal(raw, backup.header, backup.secret, segment.sha256);
    S.assert(bytes.length === segment.bytes && S.digest(bytes) === segment.sha256, 'CHECKSUM_MISMATCH', 'Backup chunk checksum mismatch.');
    hash.update(bytes); total += bytes.length; yield bytes;
  }
  S.assert(total === row.bytes && hash.digest('hex') === row.sha256, 'CHECKSUM_MISMATCH', 'Backup file checksum mismatch.');
}
async function collect(backup, row, max = MAX_METADATA) {
  S.assert(row.bytes <= max, 'TOO_LARGE', 'Backup metadata exceed the bounded validation budget.');
  const parts = []; for await (const chunk of rowChunks(backup, row)) parts.push(chunk);
  return Buffer.concat(parts);
}
async function read(store, p) {
  const directory = await S.safePath(store.workspace, S.relative(p.path));
  S.assert((await S.exists(directory))?.isDirectory(), 'INVALID_BACKUP', 'Expected a segmented backup directory.');
  const h = json(await S.readBounded(await S.safePath(directory, 'header.json'), 4096));
  S.assert(h&&typeof h==='object'&&!Array.isArray(h),'INVALID_BACKUP','Invalid backup header.');
  S.assert(h.schema === SCHEMA && UUID.test(h.id) && Number.isFinite(Date.parse(h.createdAt)) && h.chunkBytes === CHUNK_BYTES && ['none','aes-256-gcm'].includes(h.encryption) && HASH.test(h.manifestSha256), 'INVALID_BACKUP', 'Invalid or incomplete backup header.');
  S.assert(h.encryption === 'none' ? h.salt === undefined : /^[a-f0-9]{32}$/.test(h.salt), 'INVALID_BACKUP', 'Invalid backup key derivation salt.');
  const secret = await key(h, p.password);
  try {
    const raw = await S.readBounded(await S.safePath(directory, 'manifest.bin'), MAX_METADATA + 28);
    S.assert(S.digest(raw) === h.manifestSha256, 'CHECKSUM_MISMATCH', 'Backup manifest checksum mismatch.');
    const manifest = json(unseal(raw, h, secret, 'manifest', 'PASSWORD_REQUIRED'));
    validateManifest(manifest);
    const backup = { directory, header: h, secret, manifest };
    backup.state = require('./backup-reader.cjs').validateState(json(await collect(backup, manifest.files.find(r => r.path === '.margin-reader/state.json'))));
    return backup;
  } catch (error) { secret?.fill(0); throw error; }
}
async function inspect(store, p) {
  const backup = await read(store, p);
  try {
    for (const row of backup.manifest.files) for await (const _chunk of rowChunks(backup, row)) { /* Every byte is verified, not accumulated. */ }
    return { schema: SCHEMA, format: 'segmented', createdAt: backup.header.createdAt, encrypted: Boolean(backup.secret),
      files: backup.manifest.files.length, bytes: backup.manifest.originalBytes, documents: Object.keys(backup.state.documents).length,
      studies: Object.values(backup.state.studySets).map(require('./study-model.cjs').summary) };
  } finally { backup.secret?.fill(0); }
}
module.exports = { SCHEMA, CHUNK_BYTES, header, key, seal, unseal, read, rowChunks, collect, inspect, validateManifest, chunkName };
