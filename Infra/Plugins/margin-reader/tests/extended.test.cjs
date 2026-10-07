'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { setup } = require('./fixtures.cjs');
const { createPlugin } = require('../runtime.cjs');
function mobiFixture() {
  let html = '<html><head><title>Original test book</title></head><body><h1>Alpha</h1><p>中文 searchable text</p><a filepos="0000000000">Next</a><mbp:pagebreak/><h1>Beta</h1><p>Second chapter body</p></body></html>';
  const target = Buffer.byteLength(html.slice(0, html.indexOf('<h1>Beta')));
  html = html.replace('0000000000', String(target).padStart(10, '0'));
  const title = Buffer.from('Original test book'), text = Buffer.from(html);
  const record = Buffer.alloc(260 + title.length);
  record.writeUInt16BE(1, 0); record.writeUInt32BE(text.length, 4); record.writeUInt16BE(1, 8); record.writeUInt16BE(4096, 10);
  record.write('MOBI', 16, 'ascii'); record.writeUInt32BE(232, 20); record.writeUInt32BE(2, 24); record.writeUInt32BE(65001, 28); record.writeUInt32BE(1, 32); record.writeUInt32BE(6, 36);
  record.writeUInt32BE(260, 84); record.writeUInt32BE(title.length, 88); record[95] = 9; record.writeUInt32BE(2, 108); record.writeUInt32BE(0x40, 128); record.writeUInt32BE(0xffffffff, 244); record.write('EXTH', 248, 'ascii'); record.writeUInt32BE(12, 252); record.writeUInt32BE(0, 256); title.copy(record, 260);
  const pdb = Buffer.alloc(96); pdb.write('Original test book'); pdb.write('BOOKMOBI', 60, 'ascii'); pdb.writeUInt16BE(2, 76); pdb.writeUInt32BE(96, 78); pdb.writeUInt32BE(96 + record.length, 86);
  return { bytes: Buffer.concat([pdb, record, text]), target };
}
test('synthetic non-DRM MOBI preserves searchable chapters and actual byte-position anchors', async t => {
  const { workspace, api } = await setup(t), fixture = mobiFixture();
  await fs.writeFile(path.join(workspace, 'original.mobi'), fixture.bytes);
  const doc = await api('document.open', { path: 'original.mobi' }); assert.equal(doc.sectionCount, 2);
  const content = await api('document.content', { id: doc.id, section: 1 }); assert.match(content.text, /Beta/);
  assert(content.anchors.includes(`filepos:${fixture.target}`));
  await api('reader.position.set', { id: doc.id, locator: { section: 1, anchor: `filepos:${fixture.target}` } });
  assert((await api('document.search', { id: doc.id, query: '中文' })).matches.length > 0);
  for (const chapter of doc.toc) await api('reader.position.set', { id: doc.id, locator: chapter.locator });
});
test('independent runtimes coordinate their state files instead of losing concurrent edits', async t => {
  const { api, raw, workspace } = await setup(t);
  await api('fs.write', { path: 'two-runtimes.md', content: '# Root' });
  const doc = await api('document.open', { path: 'two-runtimes.md' });
  const other = await createPlugin({ workspace }); t.after(() => other.close());
  const params = { id: doc.id, expectedRevision: doc.revision, title: 'Writer', locator: { section: 0 } };
  const replies = await Promise.all([raw('toc.add', params), other.request({ jsonrpc: '2.0', id: 2, method: 'toc.add', params })]);
  assert.equal(replies.filter(r => r.result).length, 1); assert.equal(replies.find(r => r.error).error.data.code, 'CONFLICT');
  assert.equal((await api('toc.list', { id: doc.id })).toc.length, 2);
});
test('untrusted identifiers cannot address prototype properties', async t => {
  const { error } = await setup(t);
  for (const id of ['__proto__','constructor','toString']) {
    await error('document.get', { id }, 'NOT_FOUND');
    await error('import.status', { uploadId: id }, 'NOT_FOUND');
    await error('fs.restore', { trashId: id }, 'NOT_FOUND');
  }
});
test('employee CLI uses only its bound mailbox and assigned credential', async t => {
  const { workspace, runtime, api } = await setup(t);
  const mailbox = path.join(workspace, '.agents-company/ipc/margin-reader/employee-test'); await fs.mkdir(mailbox, { recursive: true });
  await fs.writeFile(path.join(mailbox, 'host.json'), JSON.stringify({ workspace, pid: process.pid }));
  const token = 'isolated-test-credential', pending = new Set(); const failures = [];
  const watcher = fsSync.watch(mailbox, (_event, name) => {
    if (!name?.endsWith('.request.json') || pending.has(name)) return;
    pending.add(name);
    (async () => {
      const file = path.join(mailbox, name); const request = JSON.parse(await fs.readFile(file, 'utf8'));
      assert.equal(request.auth, token);
      const reply = await runtime.request(request), output = file.replace('.request.', '.response.');
      await fs.writeFile(output + '.tmp', JSON.stringify(reply)); await fs.rename(output + '.tmp', output); await fs.rm(file);
    })().catch(error => failures.push(error));
  });
  t.after(() => watcher.close());
  const env = { ...process.env, AGENTS_WORKSPACE: workspace, AGENTS_COMPANY_PLUGIN_RPC: mailbox, AGENTS_COMPANY_TOKEN: token }; delete env.AGENTS_COMPANY_TOKEN_FILE;
  const cli = path.resolve(__dirname, '../cli.cjs');
  const reply = JSON.parse((await execFile(process.execPath, [cli, '--workspace', workspace, 'api', 'fs.write', '--data', JSON.stringify({ path: 'employee.md', content: '# Employee mailbox' })], { env, timeout: 10000 })).stdout);
  assert.equal(reply.result.path, 'employee.md'); assert.equal((await api('fs.list')).entries.length, 1); assert.deepEqual(failures, []);
  await assert.rejects(execFile(process.execPath, [cli, '--workspace', path.dirname(workspace), 'tree'], { env, timeout: 10000 }), e => JSON.parse(e.stdout).error.data.code === 'SCOPE_DENIED');
  await fs.rm(path.join(mailbox, 'host.json'));
  await assert.rejects(execFile(process.execPath, [cli, '--workspace', workspace, 'tree'], { env, timeout: 10000 }), e => JSON.parse(e.stdout).error.data.code === 'HOST_UNAVAILABLE');
});
test('explicit cache rebuild preserves custom chapter edits', async t => {
  const { api, workspace } = await setup(t);
  await api('fs.write', { path: 'refresh.md', content: '# Source\n\nBody' });
  const doc = await api('document.open', { path: 'refresh.md' });
  await api('toc.add', { id: doc.id, expectedRevision: doc.revision, title: 'Keep me', locator: { section: 0 } });
  const state = JSON.parse(await fs.readFile(path.join(workspace, '.margin-reader/state.json'), 'utf8'));
  await fs.writeFile(path.join(workspace, `.margin-reader/cache/${state.documents[doc.id].cacheKey}.json`), 'broken');
  const rebuilt = await api('document.open', { path: 'refresh.md', refresh: true });
  assert(rebuilt.toc.some(n => n.title === 'Keep me'));
  assert.match((await api('document.content', { id: doc.id })).text, /Body/);
});
