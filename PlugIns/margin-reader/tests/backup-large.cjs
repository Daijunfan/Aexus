'use strict';
// Opt-in real-byte workload; creates and deletes only a fresh temporary library.
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), assert = require('node:assert/strict'), { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
(async () => {
  const marker=path.join(root,'artifacts/hardening-current.txt');
  const output = await fs.readFile(marker,'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts','backup-large-'+new Date().toISOString().replace(/[:.]/g,'-')));
  assert(path.resolve(output).startsWith(path.join(root, 'artifacts') + path.sep));await fs.mkdir(output,{recursive:true});
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-gib-backup-')), workspace = path.join(temp, 'library'); await fs.mkdir(workspace);
  const report = { passed: false, platform: process.platform, arch: process.arch, node: process.version, modelCalls: 0, sourceBytes: 3 * 384 * 1024 * 1024, files: [], timingsMs: {}, peakRssBytes: 0 };
  let runtime, timer;
  try {
    const available = await fs.statfs(workspace, { bigint: true }); assert(available.bavail * available.bsize > BigInt(5 * 1024 ** 3), 'Need at least 5 GiB free for this isolated benchmark.');
    const buffer = crypto.randomBytes(4 * 1024 * 1024);
    for (let i = 0; i < 3; i++) {
      const name = `part-${i}.bin`, handle = await fs.open(path.join(workspace, name), 'wx'), hash = crypto.createHash('sha256');
      try { for (let n = 0; n < 96; n++) { buffer.writeUInt32LE(i * 96 + n, 0); hash.update(buffer); await handle.writeFile(buffer); } await handle.sync(); }
      finally { await handle.close(); }
      report.files.push({ name, sha256: hash.digest('hex'), bytes: 384 * 1024 * 1024 });
    }
    runtime = await require('../runtime.cjs').createPlugin({ workspace });
    const api = async (method, params) => { const start = performance.now(); const reply = await runtime.request({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }); assert(!reply.error, JSON.stringify(reply.error)); report.timingsMs[method] = +(performance.now() - start).toFixed(2); return reply.result; };
    const sample = () => { report.peakRssBytes = Math.max(report.peakRssBytes, process.memoryUsage().rss); }; sample(); timer = setInterval(sample, 20);
    report.plan = await api('library.backup.plan', { path: 'large.mrbackup' }); assert(!report.plan.fitsLegacyZip);
    const params = { path: 'large.mrbackup', password: 'synthetic benchmark encryption' };
    report.backup = await api('library.backup.create', { ...params, format: 'segmented' }); assert(report.backup.bytes > 1024 ** 3);
    const info = await api('library.backup.inspect', params); assert.equal(info.bytes, report.plan.originalBytes);
    report.restored = await api('library.backup.restore', { ...params, folder: 'Recovered' });
    for (const file of report.files) {
      const target = path.join(workspace, 'Recovered', file.name), st = await fs.stat(target);
      assert.equal(st.size, file.bytes); assert.equal(await require('../lib/backup-stream-source.cjs').hashFile(target, { version: require('../lib/safety.cjs').version(st) }), file.sha256);
    }
    sample(); assert(report.peakRssBytes < 768 * 1024 * 1024, 'Streaming backup exceeded the 768 MiB process RSS acceptance budget.');
    report.passed = true;
    console.log('PASS 1.125 GiB unique file content: encrypted backup, full verification, restore and original SHA-256; peak RSS MiB=' + (report.peakRssBytes / 1048576).toFixed(2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { report.error = error.stack; throw error; }
  finally { clearInterval(timer); await runtime?.close(); await fs.rm(temp, { recursive: true, force: true }); await fs.writeFile(path.join(output, 'backup-large.json'), JSON.stringify(report, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
