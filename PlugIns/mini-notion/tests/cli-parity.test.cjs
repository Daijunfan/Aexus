const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-parity-'));
  const server = await startServer(directory);
  const client = new BackendClient({ directory, autoStart: false });
  t.after(async () => {
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await client.call('workspace.init', { empty: true });
  return { server, client, call: client.call.bind(client), directory };
}
function sourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(path.join(directory, entry.name))
        : /\.tsx?$/.test(entry.name)
          ? [path.join(directory, entry.name)]
          : [],
    );
}

test('all literal UI operations are discoverable in the public CLI schema, without duplicate methods', async (t) => {
  const { call } = await fixture(t);
  const { commands } = await call('schema');
  const methods = new Set(commands.map((command) => command.method));
  assert.equal(methods.size, commands.length);
  const missing = [];
  for (const file of sourceFiles('src').filter((file) => !/src\/(backend|core|cli)\//.test(file))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:api|command|execute)\(\s*['"]([a-z-]+\.[a-z-]+)['"]/g))
      if (!methods.has(match[1])) missing.push(`${file}: ${match[1]}`);
  }
  assert.deepEqual(missing, []);
  for (const method of methods) assert.equal((await call('schema', { method })).method, method);
});

test('Agent API scope denies foreign mutations, administrative calls, detached roots and atomic batch escapes', async (t) => {
  const { call, server } = await fixture(t);
  const root = await call('space.create', { title: 'Agent 自己' });
  const other = await call('space.create', { title: '保密空间' });
  const child = await call('page.create', { parentId: root.id, title: '子页面' });
  const token = 'test-bound-capability';
  const scopeFor = server.service.agents.scopeFor.bind(server.service.agents);
  server.service.agents.scopeFor = (value) => (value === token ? root.id : scopeFor(value));
  const invoke = (method, params = {}) =>
    server.service.request({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params, agentToken: token });
  const read = await invoke('workspace.get');
  assert.deepEqual(new Set(read.result.pages.map((page) => page.id)), new Set([root.id, child.id]));
  for (const [method, params] of [
    ['page.get', { pageId: other.id }],
    ['page.update', { pageId: other.id, title: '越权' }],
    ['page.create', { title: '新根' }],
    ['page.move', { pageId: child.id, parentId: other.id }],
    ['page.trash', { pageId: root.id }],
    ['settings.set', { theme: 'dark' }],
    ['backup.restore', { path: 'ignored', confirm: true }],
    ['agent.start', { pageId: other.id, prompt: '越权' }],
    ['file.create', { pageId: other.id, name: 'x', content: '越权' }],
    [
      'batch',
      {
        operations: [
          { method: 'page.update', params: { pageId: child.id, title: '不应落盘' } },
          { method: 'page.update', params: { pageId: other.id, title: '越权' } },
        ],
      },
    ],
  ]) {
    const before = await call('workspace.get');
    assert.ok((await invoke(method, params)).error, method);
    assert.deepEqual(await call('workspace.get'), before, method);
  }
  assert.ok((await invoke('page.update', { pageId: child.id, title: '合法编辑' })).result);
  assert.equal((await call('page.get', { pageId: child.id })).title, '合法编辑');
  assert.equal((await call('page.get', { pageId: other.id })).title, '保密空间');
});

test('space, main page and engine remain one-to-one through creation, renaming, duplication and trash', async (t) => {
  const { call } = await fixture(t);
  const root = await call('space.create', { title: '原名', engine: 'codex' });
  await call('space.configure', { pageId: root.id, title: '空间改名' });
  assert.equal((await call('page.get', { pageId: root.id })).title, '空间改名');
  await call('page.update', { pageId: root.id, title: '页面改名' });
  assert.equal((await call('space.get', { pageId: root.id })).space.title, '页面改名');
  const other = await call('space.create', { title: 'other' });
  await assert.rejects(call('page.move', { pageId: root.id, parentId: other.id }), {
    code: 'IMMUTABLE_SPACE',
  });
  await assert.rejects(call('space.configure', { pageId: root.id, engine: 'claude' }), {
    code: 'IMMUTABLE_ENGINE',
  });
  await assert.rejects(call('agent.start', { pageId: root.id, engine: 'claude', prompt: 'x' }), {
    code: 'IMMUTABLE_ENGINE',
  });
  const copy = await call('page.duplicate', { pageId: root.id });
  assert.ok(copy.space);
  assert.equal((await call('space.get', { pageId: copy.id })).space.agent.sessionId, undefined);
  await call('page.trash', { pageId: root.id });
  assert.ok(!(await call('space.list')).some((space) => space.id === root.id));
  await assert.rejects(call('agent.send', { pageId: root.id, text: 'x' }));
  await call('page.restore', { pageId: root.id });
  assert.equal((await call('space.get', { pageId: root.id })).space.engine, 'codex');
});

for (const type of [
  'table',
  'board',
  'gallery',
  'list',
  'calendar',
  'plan',
  'timeline',
  'chart',
  'feed',
  'form',
])
  test(`CLI ${type} view retains filter, sort and display configuration with correct records`, async (t) => {
    const { call } = await fixture(t);
    const root = await call('space.create', { title: '项目' });
    const database = await call('database.create', {
      parentId: root.id,
      title: '数据库',
      columns: [
        { id: 'priority', name: '优先级', type: 'number' },
        { id: 'date', name: '日期', type: 'date' },
        { id: 'status', name: '状态', type: 'select', options: ['Todo', 'Done'] },
      ],
    });
    const a = await call('record.create', {
      databaseId: database.id,
      title: '重点',
      values: { priority: 2, date: '2026-09-11', status: 'Todo' },
    });
    const b = await call('record.create', {
      databaseId: database.id,
      title: '次要',
      values: { priority: 1, date: '2026-09-12', status: 'Todo' },
    });
    await call('record.create', {
      databaseId: database.id,
      title: '已完成',
      values: { priority: 3, status: 'Done' },
    });
    const view = await call('view.create', {
      databaseId: database.id,
      type,
      name: type,
      config: {
        calendarBy: 'date',
        dateAnchor: '2026-09-11',
        groupBy: 'status',
        filters: {
          id: 'filters',
          conjunction: 'and',
          rules: [{ id: 'status-filter', property: 'status', operator: 'is', value: 'Todo' }],
        },
        sorts: [{ id: 'priority-sort', property: 'priority', direction: 'desc' }],
      },
    });
    const rendered = await call('view.render', { databaseId: database.id, viewId: view.id });
    assert.equal(rendered.view.type, type);
    assert.deepEqual(
      rendered.records.map((record) => record.id),
      [a.id, b.id],
    );
    const copy = await call('view.duplicate', { databaseId: database.id, viewId: view.id });
    assert.notEqual(copy.id, view.id);
    assert.deepEqual(
      (await call('view.render', { databaseId: database.id, viewId: copy.id })).records,
      rendered.records,
    );
    await call('view.delete', { databaseId: database.id, viewId: copy.id });
    assert.equal((await call('view.render', { databaseId: database.id, viewId: view.id })).count, 2);
  });

test('scoped Agent template execution keeps scheduling history and preserves unrelated page order', async (t) => {
  const { call, server } = await fixture(t);
  const root = await call('space.create', { title: 'Agent' });
  const other = await call('space.create', { title: 'Unrelated' });
  const db = await call('database.create', { parentId: root.id, title: 'Daily' });
  const template = await call('template.create', { databaseId: db.id, title: 'Template' });
  await call('repeat.configure', {
    templateId: template.id,
    rule: {
      frequency: 'daily',
      interval: 1,
      startDate: '2099-01-01',
      time: '09:00',
      timeZone: 'Asia/Shanghai',
      catchUp: 'skip',
    },
  });
  server.service.agents.scopeFor = () => root.id;
  const invoke = (method, params) =>
    server.service.request({ jsonrpc: '2.0', id: crypto.randomUUID(), agentToken: 'test', method, params });
  const before = (await call('workspace.get')).pages.map((page) => page.id);
  assert.ok(!(await invoke('block.append', { pageId: root.id, text: 'Updated by Agent' })).error);
  assert.deepEqual(
    (await call('workspace.get')).pages.map((page) => page.id),
    before,
  );
  const run = await invoke('repeat.run', { templateId: template.id });
  assert.ok(!run.error, JSON.stringify(run.error));
  assert.equal((await call('repeat.history', { templateId: template.id })).length, 1);
  assert.equal((await call('page.get', { pageId: other.id })).title, 'Unrelated');
});
