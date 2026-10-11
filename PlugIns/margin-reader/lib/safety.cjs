'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const RESERVED = new Set(['.margin-reader', '.agents-company', '.git']);
const LIMITS = Object.freeze({ file: 512 * 1024 * 1024, chunk: 4 * 1024 * 1024, html: 32 * 1024 * 1024, expanded: 256 * 1024 * 1024, zipEntries: 20000, tree: 10000 });
class ReaderError extends Error {
  constructor(code, message, details) { super(message); this.name = 'ReaderError'; this.code = code; this.details = details; }
}
function fail(code, message, details) { throw new ReaderError(code, message, details); }
function assert(condition, code, message, details) { if (!condition) fail(code, message, details); }
// macOS and Windows commonly resolve case variants to the same metadata.
// Reserve compatibility spellings and Win32 trailing/stream aliases as well.
function protectedName(value) { return String(value).normalize('NFKC').toLowerCase().split(':')[0].replace(/[ .]+$/g, ''); }
function isReserved(value) { return RESERVED.has(protectedName(value)); }
function relative(value, { root = false, internal = false } = {}) {
  assert(typeof value === 'string' && value.length <= 4096 && !/[\0\\]/.test(value), 'INVALID_PATH', 'Path must be a relative POSIX path.');
  if (root && (value === '' || value === '.')) return '.';
  assert(value && !path.isAbsolute(value), 'SCOPE_DENIED', 'Absolute paths are not allowed in the workspace API.');
  const parts = value.split('/');
  assert(parts.every(p => p && p !== '.' && p !== '..'), 'SCOPE_DENIED', 'Empty components and path traversal are not allowed.');
  assert(internal || !parts.some(isReserved), 'SCOPE_DENIED', 'Plugin, Git and employee metadata are protected.');
  return parts.join('/');
}
async function safePath(workspace, value, options = {}) {
  const rel = relative(value, options);
  let current = workspace;
  if (rel === '.') return current;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    const st = await fs.lstat(current).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    assert(!st?.isSymbolicLink(), 'SCOPE_DENIED', 'Symbolic links are not followed.');
    if (st?.isFile()) assert(st.nlink === 1, 'SCOPE_DENIED', 'Hard-linked files are not supported within a scoped workspace.');
  }
  return current;
}
async function exists(file) { try { return await fs.lstat(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
async function ensureDir(workspace, rel, internal = false) {
  const file = await safePath(workspace, rel, { root: true, internal });
  await fs.mkdir(file, { recursive: true });
  return safePath(workspace, rel, { root: true, internal });
}
async function readBounded(file, max = LIMITS.file) {
  const handle = await fs.open(file, require('node:fs').constants.O_RDONLY | (require('node:fs').constants.O_NOFOLLOW || 0));
  try {
    const st = await handle.stat();
    assert(st.isFile(), 'INVALID_FILE', 'Only regular files can be read.');
    assert(st.size <= max, 'TOO_LARGE', `File exceeds the ${Math.floor(max / 1024 / 1024)} MiB limit.`);
    const bytes = await handle.readFile();
    assert(bytes.length <= max, 'TOO_LARGE', 'File grew past the size limit while reading.');
    return bytes;
  } finally { await handle.close(); }
}
async function atomicWrite(file, bytes) {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(tmp, 'wx', 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await fs.rename(tmp, file);
  } finally { if (handle) await handle.close(); await fs.rm(tmp, { force: true }); }
}
async function writeNew(file, bytes) {
  const handle = await fs.open(file, 'wx', 0o600).catch(e => { if (e.code === 'EEXIST') fail('ALREADY_EXISTS', 'Destination already exists.'); throw e; });
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function version(st) { return digest(`${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`).slice(0, 24); }
function checkVersion(st, expected) { if (expected !== undefined) assert(version(st) === expected, 'CONFLICT', 'File changed. Reload before retrying.', { currentVersion: version(st) }); }
function cleanName(name) {
  const cleaned = String(name || 'Untitled').normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g, '-').replace(/^\.+/, '').trim();
  // A 120-character Chinese title may exceed the filesystem's filename byte
  // limit. Reserve space for the extension and duplicate-name suffix.
  let result = '', bytes = 0, characters = 0;
  for (const character of cleaned) {
    const size = Buffer.byteLength(character);
    if (bytes + size > 200 || characters >= 120) break;
    result += character; bytes += size; characters++;
  }
  return result.trim() || 'Untitled';
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])); }
function decodeBase64(value, max = LIMITS.chunk) {
  // Repeated regexp groups can overflow V8's regexp stack on a valid 4 MiB
  // upload. Bound allocation first, then compare the canonical round trip.
  // The comparison also rejects whitespace, base64url, missing padding and
  // nonzero padding bits, which Buffer.from(..., 'base64') alone accepts.
  assert(typeof value === 'string' && value.length % 4 === 0 && value.length <= Math.ceil(max / 3) * 4, 'INVALID_PARAMS', 'Expected canonical base64 within the chunk limit.');
  const bytes = Buffer.from(value, 'base64');
  assert(bytes.length <= max && bytes.toString('base64') === value, 'INVALID_PARAMS', 'Invalid base64 or chunk too large.');
  return bytes;
}
function errorResponse(id, error) {
  const domain = error.code === 'ENOENT' ? 'NOT_FOUND' : error.code === 'EEXIST' ? 'ALREADY_EXISTS' : error.code === 'EACCES' ? 'PERMISSION_DENIED' : error instanceof ReaderError ? error.code : 'INTERNAL_ERROR';
  const rpc = domain === 'METHOD_NOT_FOUND' ? -32601 : domain === 'INVALID_PARAMS' ? -32602 : domain === 'INVALID_REQUEST' ? -32600 : -32000;
  return { jsonrpc: '2.0', id: id ?? null, error: { code: rpc, message: error.message || 'Operation failed.', data: { code: domain, ...(error.details ? { details: error.details } : {}) } } };
}
module.exports = { ReaderError, fail, assert, RESERVED, protectedName, isReserved, LIMITS, relative, safePath, exists, ensureDir, readBounded, atomicWrite, writeNew, digest, version, checkVersion, cleanName, escapeHtml, decodeBase64, errorResponse };
