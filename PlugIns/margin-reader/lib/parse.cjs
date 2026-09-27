'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { ReaderError, assert, LIMITS } = require('./safety.cjs');
async function parseInWorker(store, args) {
  const resourceDir = await store.mkdir(`cache/parser-${randomUUID()}`);
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'parser-worker.cjs'), { workerData: { ...args, workspace: store.workspace, resourceDir }, resourceLimits: { maxOldGenerationSizeMb: 768, stackSizeMb: 8 }, stdout: true, stderr: true });
      let settled = false;
      const done = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate().finally(() => error ? reject(error) : resolve(result)); };
      const timer = setTimeout(() => done(new ReaderError('PARSE_TIMEOUT', 'Document parsing exceeded 120 seconds. Original file was preserved.')), 120000);
      worker.stdout.resume(); worker.stderr.resume();
      worker.once('message', message => message.error ? done(new ReaderError(message.error.code, message.error.message)) : done(null, message.result));
      worker.once('error', error => done(new ReaderError('INVALID_DOCUMENT', error.message)));
      worker.once('exit', code => { if (!settled) done(new ReaderError('INVALID_DOCUMENT', `Parser exited unexpectedly (${code}).`)); });
    });
  } finally { await fs.rm(resourceDir, { recursive: true, force: true }); }
}
module.exports = { parseInWorker };
