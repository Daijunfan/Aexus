'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const { mailboxClient } = require('../lib/mailbox.cjs');
const { createClient, describeCommand } = require('../cli.cjs');
const { setup } = require('./fixtures.cjs');
const schema = require('../schema.json');
const request = () => ({ jsonrpc: '2.0', id: randomUUID(), method: 'settings.get', params: {} });
async function mailboxFixture(t) {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mr-mailbox-')));
  const mailbox = path.join(workspace, '.agents-company/ipc/margin-reader/employee');
  await fs.mkdir(mailbox, { recursive: true });
  await fs.writeFile(path.join(mailbox, 'host.json'), JSON.stringify({ workspace, pid: process.pid }));
  const keys = ['AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_PLUGIN_RPC'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  keys.forEach(key => delete process.env[key]);
  process.env.AGENTS_COMPANY_TOKEN = 'temporary-test-identity';
  t.after(async () => {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await fs.rm(workspace, { recursive: true, force: true });
  });
  const client = await mailboxClient(workspace, mailbox, { timeoutMs: 1000, pollMs: 5 });
  t.after(() => client.close());
  const reply = async (req, value) => {
    for (let count = 0; count < 200; count++) {
      try {
        const envelope = JSON.parse(await fs.readFile(path.join(mailbox, `${req.id}.request.json`), 'utf8'));
        assert.equal(envelope.auth, 'temporary-test-identity');
        const file = path.join(mailbox, `${req.id}.response.json`);
        await fs.writeFile(file + '.tmp', typeof value === 'string' ? value : JSON.stringify(value));
        await fs.rename(file + '.tmp', file); return;
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Test host received no request');
  };
  return { workspace, mailbox, client, reply };
}
test('every API has workspace-independent targeted CLI help generated from its schema', async () => {
  assert.deepEqual(schema.commands, require('../scripts/contracts.cjs').commands);
  for (const command of schema.commands) assert.deepEqual(describeCommand(command.method).options, command.options);
  assert.throws(() => describeCommand('private.unknown'), { code: 'METHOD_NOT_FOUND' });
  const env = { ...process.env, AGENTS_COMPANY_PLUGIN_RPC: '/unavailable-test-mailbox' };
  const { stdout } = await run(process.execPath, [path.resolve(__dirname, '../cli.cjs'), 'help', 'study.card.create'], { env });
  const help = JSON.parse(stdout); assert.equal(help.method, 'study.card.create'); assert.equal(help.options.captureId.required, true);
});
test('mailbox validates matching responses and preserves host authorization errors', async t => {
  const { client, reply } = await mailboxFixture(t);
  for (const error of [false, true]) {
    const req = request(), response = error ? { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Forbidden fixture' } } : { jsonrpc: '2.0', id: req.id, result: { theme: 'dark' } };
    const [received] = await Promise.all([client.request(req), reply(req, response)]);
    assert.deepEqual(received, response);
  }
});
test('mailbox rejects wrong IDs, invalid envelopes and malformed JSON without claiming success', async t => {
  const { client, reply } = await mailboxFixture(t);
  for (const response of [{ jsonrpc: '2.0', id: randomUUID(), result: {} }, { jsonrpc: '2.0', id: null, result: {} }, '{broken']) {
    const req = request();
    await Promise.all([assert.rejects(client.request(req), error => error.code === 'INVALID_RESPONSE' && error.details.mayHaveCompleted === true), reply(req, response)]);
  }
});
test('mailbox timeout reports uncertain completion and never retries or creates a private library', async t => {
  const { workspace, mailbox } = await mailboxFixture(t);
  const client = await mailboxClient(workspace, mailbox, { timeoutMs: 40, pollMs: 5 });
  const req = request();
  await assert.rejects(client.request(req), error => error.code === 'REQUEST_TIMEOUT' && error.details.requestId === req.id && error.details.mayHaveCompleted === true);
  assert.equal((await fs.readdir(mailbox)).filter(name => name.endsWith('.request.json')).length, 1);
  await assert.rejects(fs.stat(path.join(workspace, '.margin-reader')), { code: 'ENOENT' });
  await client.close(); await assert.rejects(client.request(request()), { code: 'RUNTIME_CLOSED' });
});
test('mailbox fails promptly for missing hosts, invalid PIDs, missing credentials and missing employee transport', async t => {
  const { workspace, mailbox, client } = await mailboxFixture(t);
  await fs.unlink(path.join(mailbox, 'host.json'));
  await assert.rejects(client.request(request()), { code: 'HOST_UNAVAILABLE' });
  await fs.writeFile(path.join(mailbox, 'host.json'), JSON.stringify({ workspace, pid: -1 }));
  await assert.rejects(mailboxClient(workspace, mailbox), { code: 'HOST_UNAVAILABLE' });
  await fs.writeFile(path.join(mailbox, 'host.json'), JSON.stringify({ workspace, pid: process.pid }));
  delete process.env.AGENTS_COMPANY_TOKEN;
  process.env.AGENTS_COMPANY_TOKEN_FILE = path.join(workspace, 'missing-test-credential');
  await assert.rejects(mailboxClient(workspace, mailbox), { code: 'AUTH_REQUIRED' });
  process.env.AGENTS_COMPANY_EMPLOYEE = 'test-only-employee';
  await assert.rejects(createClient(workspace), { code: 'HOST_UNAVAILABLE' });
  await assert.rejects(fs.stat(path.join(workspace, '.margin-reader')), { code: 'ENOENT' });
});
test('mailbox rejects escaping IDs, foreign scopes and symbolic-link channels', async t => {
  const { workspace, mailbox, client } = await mailboxFixture(t);
  await assert.rejects(client.request({ ...request(), id: '../escape' }), { code: 'INVALID_REQUEST' });
  await fs.symlink(mailbox, path.join(workspace, 'linked-channel'));
  await assert.rejects(mailboxClient(workspace, path.join(workspace, 'linked-channel')), { code: 'SCOPE_DENIED' });
  await fs.writeFile(path.join(mailbox, 'host.json'), JSON.stringify({ workspace: path.dirname(workspace), pid: process.pid }));
  await assert.rejects(mailboxClient(workspace, mailbox), { code: 'SCOPE_DENIED' });
});
test('workspace watcher excludes control traffic and derived files but includes committed state and ordinary cache folders', () => {
  const { meaningfulWorkspaceChange: changed } = require('../runtime.cjs');
  for (const name of ['.agents-company/ipc/margin-reader/employee/events.json', '.agents-company', 'child/.agents-company/session.json', '.git/index', '.margin-reader/cache/preview.json', '.margin-reader/state.json.lock', '.margin-reader/state.json.temporary.tmp', 'child/.margin-reader/state.json']) assert.equal(changed(name), false, name);
  for (const name of ['.margin-reader/state.json', 'Books/cache/article.md', 'book.pdf', null]) assert.equal(changed(name), true, name);
  assert.equal(changed('.agents-company\\ipc\\events.json'), false);
});
test('persisting mailbox events cannot create a self-sustaining library event loop', async t => {
  const { workspace, runtime, api } = await setup(t);
  const directory = path.join(workspace, '.agents-company/ipc/margin-reader/test');
  await fs.mkdir(directory, { recursive: true });
  let count = 0;
  const unsubscribe = await runtime.subscribe(() => require('node:fs').writeFileSync(path.join(directory, 'events.json'), JSON.stringify({ count: ++count })));
  t.after(unsubscribe);
  await api('fs.write', { path: 'events.md', content: '# Original' });
  await new Promise(resolve => setTimeout(resolve, 650));
  const settled = count; assert(settled > 0 && settled <= 3, `Unexpected event count: ${settled}`);
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(count, settled, 'Host event persistence must not feed back into the watcher');
  await fs.writeFile(path.join(workspace, 'events.md'), '# External editor');
  await new Promise(resolve => setTimeout(resolve, 350));
  assert(count > settled, 'Real external edits must still notify the reader');
});
test('workspace-wide study search exposes every match beyond 500, includes tags, and never mutates state', async t => {
  const { workspace, api, error } = await setup(t);
  const set = await api('study.create', { title: 'Pagination fixture' });
  // Seed a large deterministic fixture in this disposable test library only.
  const store = await require('../lib/store.cjs').createStore(workspace);
  await store.transaction(state => {
    state.studySets[set.id].cards = Array.from({ length: 507 }, (_, index) => ({ id: randomUUID(), title: `Card ${index}`, text: '', note: '', tags: ['检索标签'] }));
  });
  const before = await fs.readFile(store.file, 'utf8');
  const first = await api('study.search', { query: '检索标签' });
  assert.equal(first.cards.length, 500); assert.equal(first.total, 507); assert.equal(first.nextOffset, 500); assert.equal(first.truncated, true);
  const second = await api('study.search', { query: '检索标签', offset: first.nextOffset });
  assert.equal(second.cards.length, 7); assert.equal(second.nextOffset, null); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.cards, ...second.cards].map(card => card.cardId)).size, 507);
  assert.equal((await api('study.search', { query: 'CARD', limit: 3 })).cards.length, 3);
  assert.equal((await api('study.search', { query: 'missing' })).total, 0);
  for (const params of [{ query: ' ' }, { query: 'Card', offset: -1 }, { query: 'Card', limit: 501 }]) await error('study.search', params, 'INVALID_PARAMS');
  assert.equal(await fs.readFile(store.file, 'utf8'), before);
  await api('study.remove', { setId: set.id, expectedRevision: set.revision });
  assert.equal((await api('study.search', { query: 'Card' })).total, 0);
});
