'use strict';
// Derived thumbnails never change library registration, outline or reading position.
const fs = require('node:fs/promises');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { assert, ReaderError, safePath, relative, exists, version, digest, readBounded, atomicWrite, LIMITS } = require('./safety.cjs');
const TYPES = new Set(['pdf','html','htm','xhtml','md','markdown','txt','png','jpg','jpeg','webp','gif','avif','bmp']);
let running = 0; const waiting = [];
async function acquire() { if (running < 2) running++; else await new Promise(resolve => waiting.push(resolve)); }
function release() { const next = waiting.shift(); if (next) next(); else running--; }
function createPreviews(store) {
  let closed = false;
  const pending = new Map(), cancel = new Set();
  async function worker(args) {
    await acquire();
    try {
      assert(!closed, 'RUNTIME_CLOSED', 'Reader was closed.');
      return await new Promise((resolve, reject) => {
        const process = new Worker(path.join(__dirname, 'preview-worker.cjs'), {
          workerData: args, stdout: true, stderr: true,
          resourceLimits: { maxOldGenerationSizeMb: 384, stackSizeMb: 8 }
        });
        let settled = false, timer;
        const stop = () => done(new ReaderError('RUNTIME_CLOSED', 'Reader was closed.'));
        const done = (error, data) => {
          if (settled) return; settled = true; clearTimeout(timer); cancel.delete(stop);
          process.terminate().finally(() => error ? reject(error) : resolve(data));
        };
        cancel.add(stop); process.stdout.resume(); process.stderr.resume();
        timer = setTimeout(() => done(new ReaderError('PREVIEW_TIMEOUT', 'Thumbnail exceeded 30 seconds. The original is unchanged.')), 30000);
        process.once('message', message => message.error ? done(new ReaderError(message.error.code, message.error.message)) : done(null, message.result));
        process.once('error', error => done(new ReaderError('PREVIEW_UNAVAILABLE', error.message)));
        process.once('exit', code => { if (!settled) done(new ReaderError('PREVIEW_UNAVAILABLE', `Thumbnail worker exited (${code}).`)); });
      });
    } finally { release(); }
  }
  async function prune() {
    const directory = await store.meta('cache');
    const names = (await fs.readdir(directory)).filter(name => /^preview-v1-[a-f0-9]{64}\.json$/.test(name));
    if (names.length <= 192) return;
    const files = await Promise.all(names.map(async name => ({ name, time: (await fs.stat(await store.meta(`cache/${name}`)).catch(() => null))?.mtimeMs || 0 })));
    files.sort((a,b) => b.time - a.time);
    for (const file of files.slice(160)) await fs.rm(await store.meta(`cache/${file.name}`), { force: true });
  }
  async function get(params) {
    assert(!closed, 'RUNTIME_CLOSED', 'Reader was closed.');
    const rel = relative(params.path), file = await safePath(store.workspace, rel), st = await exists(file);
    assert(st?.isFile(), 'NOT_FOUND', 'Preview source is not a regular file.');
    assert(st.size <= LIMITS.file, 'TOO_LARGE', 'Preview source exceeds the document size limit.');
    const sourceVersion = version(st), format = path.extname(rel).slice(1).toLowerCase();
    assert(!params.expectedVersion || params.expectedVersion === sourceVersion, 'CONFLICT', 'Preview source changed; refresh the file listing.');
    const base = { path: rel, version: sourceVersion, format };
    if (!TYPES.has(format)) return { ...base, kind: 'fallback', reason: 'UNSUPPORTED_PREVIEW' };
    assert(params.page===undefined||format==='pdf','INVALID_PARAMS','Page previews require a PDF.');
    const key = digest(`preview-v1:${rel}:${sourceVersion}:${params.page||1}`);
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const cache = await store.meta(`cache/preview-v1-${key}.json`);
      if (await exists(cache)) {
        const bytes = await readBounded(cache, 1024 * 1024);
        try {
          const result = JSON.parse(bytes.toString());
          if (result.version === sourceVersion && result.kind === 'image' && typeof result.contentBase64 === 'string') return { ...result, cacheHit: true };
        } catch { /* Disposable cache can be rebuilt without changing user state. */ }
      }
      let result;
      try {
        result = { ...base, ...await worker({ workspace: store.workspace, filename: rel, format, page:params.page||1, expectedVersion: sourceVersion }) };
      } catch (error) {
        if (['SCOPE_DENIED','CONFLICT','RUNTIME_CLOSED','NOT_FOUND','TOO_LARGE'].includes(error.code)) throw error;
        return { ...base, kind: 'fallback', reason: error.code || 'PREVIEW_UNAVAILABLE' };
      }
      const after = await fs.stat(await safePath(store.workspace, rel));
      assert(version(after) === sourceVersion, 'CONFLICT', 'Preview source changed during rendering.');
      const encoded = JSON.stringify(result);
      assert(Buffer.byteLength(encoded) <= 1024 * 1024, 'TOO_LARGE', 'Thumbnail exceeds its output budget.');
      await atomicWrite(await store.meta(`cache/preview-v1-${key}.json`), encoded);
      await prune(); return { ...result, cacheHit: false };
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return { get, async close() { closed = true; for (const stop of [...cancel]) stop(); await Promise.allSettled([...pending.values()]); } };
}
module.exports = { createPreviews };
