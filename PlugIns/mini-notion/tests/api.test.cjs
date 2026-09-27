const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const exec = promisify(execFile);
const cliPath = path.resolve('dist-cli/cli.cjs');
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-api-test-'));
  const server = await startServer(directory);
  const client = new BackendClient({ directory, autoStart: false });
  t.after(async () => {
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await client.call('workspace.init', { name: 'API tests', empty: true });
  return { directory, server, client, call: client.call.bind(client) };
}

test('CLI and JSON RPC share page, nested block, formatting, search and trash operations', async (t) => {
  const { directory, call } = await fixture(t);
  const run = async (...args) =>
    JSON.parse((await exec(process.execPath, [cliPath, '--data-dir', directory, ...args])).stdout);
  const page = await run('page', 'create', '--title', '命令行中文笔记', '--color', 'white');
  const added = await run(
    'block',
    'append',
    page.id,
    '--text',
    '完整功能',
    '--type',
    'heading',
    '--props',
    '{"level":2}',
  );
  await run('block', 'format', page.id, added[0].id, '--styles', '{"bold":true}', '--from', '0', '--to', '2');
  const stored = await call('block.get', { pageId: page.id, blockId: added[0].id });
  assert.equal(stored.content[0].text, '完整');
  assert.equal(stored.content[0].styles.bold, true);
  assert.equal((await run('search', '完整功能'))[0].id, page.id);
  await run('page', 'trash', page.id);
  assert.equal((await run('page', 'list')).length, 0);
  await run('page', 'restore', page.id);
  assert.equal((await run('page', 'list')).length, 1);
  const stdin = require('node:child_process').spawn(process.execPath, [
    cliPath,
    '--data-dir',
    directory,
    'serve',
    '--stdio',
  ]);
  let output = '';
  stdin.stdout.on('data', (value) => (output += value));
  const done = new Promise((resolve, reject) => {
    stdin.on('error', reject);
    stdin.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(String(code)))));
  });
  stdin.stdin.end(
    JSON.stringify({ jsonrpc: '2.0', id: 42, method: 'page.get', params: { pageId: page.id } }) + '\n',
  );
  await done;
  assert.equal(JSON.parse(output).id, 42);
  assert.equal(JSON.parse(output).result.title, page.title);
});

test('parallel clients preserve every record; batches commit atomically', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', { color: 'white', title: '并发计划', view: 'plan' });
  const rows = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      call('record.create', { color: 'white', databaseId: db.id, title: `任务 ${index}` }),
    ),
  );
  assert.equal((await call('record.list', { databaseId: db.id })).length, 20);
  const before = await call('workspace.get');
  await assert.rejects(
    call('batch', {
      operations: [
        { method: 'page.update', params: { pageId: rows[0].id, title: '不得提交' } },
        { method: 'page.move', params: { pageId: db.id, parentId: rows[0].id } },
      ],
    }),
    /自身或子页面/,
  );
  assert.deepEqual(await call('workspace.get'), before);
  assert.ok((await call('status')).revision > 20);
});

test('concurrent patches merge different fields and blocks and retain conflicting drafts', async (t) => {
  const { call } = await fixture(t);
  const { diffWorkspace } = await import('../src/core/patch.ts');
  const page = await call('page.create', {
    color: 'white',
    title: '原始标题',
    blocks: [
      { type: 'paragraph', content: '原文' },
      { type: 'paragraph', content: '第二段' },
    ],
  });
  const before = await call('workspace.get');
  const draft = structuredClone(before);
  draft.pages[0].blocks[0].content = 'GUI 修改第一段';
  await call('page.update', { pageId: page.id, title: 'CLI 修改标题' });
  await call('block.update', { pageId: page.id, blockId: page.blocks[1].id, text: 'CLI 修改第二段' });
  await call('workspace.patch', { patch: diffWorkspace(before, draft) });
  const merged = await call('page.get', { pageId: page.id });
  assert.equal(merged.title, 'CLI 修改标题');
  assert.equal(merged.blocks[0].content, 'GUI 修改第一段');
  assert.equal(merged.blocks[1].content, 'CLI 修改第二段');
  draft.pages[0].title = 'GUI 修改同一标题';
  await assert.rejects(
    call('workspace.patch', { patch: diffWorkspace(before, draft) }),
    (error) => error.code === 'CONFLICT' && !!error.details.conflictId,
  );
  const conflicts = await call('conflict.list');
  assert.equal(conflicts.length, 1);
  assert.equal((await call('page.get', { pageId: page.id })).title, 'CLI 修改标题');
  await call('conflict.resolve', { id: conflicts[0].id, strategy: 'local' });
  assert.equal((await call('page.get', { pageId: page.id })).title, 'GUI 修改同一标题');
  assert.equal((await call('page.get', { pageId: page.id })).blocks[1].content, 'CLI 修改第二段');
  assert.equal((await call('conflict.list')).length, 0);
  await call('page.update', { pageId: page.id, title: '解决冲突后的新修改' });
  const revision = (await call('status')).revision;
  const resolved = await call('conflict.get', { id: conflicts[0].id });
  await call('workspace.patch', { patch: resolved.patch });
  await call('conflict.resolve', { id: conflicts[0].id, strategy: 'local' });
  assert.equal((await call('page.get', { pageId: page.id })).title, '解决冲突后的新修改');
  assert.equal((await call('status')).revision, revision);
});

test('plan, calendar, timeline, chart and form projections use stored view configurations', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    title: '丰富视图',
    view: 'plan',
    columns: [
      { id: 'date', name: '日期', type: 'date' },
      { id: 'done', name: '完成', type: 'checkbox' },
      { id: 'amount', name: '数值', type: 'number' },
    ],
  });
  const view = db.database.views[0];
  await call('view.update', {
    databaseId: db.id,
    viewId: view.id,
    changes: { dateAnchor: '2026-09-10', calendarBy: 'date', planDoneBy: 'done' },
  });
  const row = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '计划事项',
    values: { date: '2026-09-10', amount: 5 },
  });
  const projection = await call('view.render', { databaseId: db.id });
  assert.equal(projection.days.length, 7);
  assert.deepEqual(projection.days.find((day) => day.date === '2026-09-10').records, [row.id]);
  await call('record.update', { pageId: row.id, values: { done: true } });
  await call('view.update', { databaseId: db.id, viewId: view.id, changes: { planHideCompleted: true } });
  assert.equal((await call('view.render', { databaseId: db.id })).count, 0);
  await call('view.navigate', { databaseId: db.id, viewId: view.id, direction: 'next' });
  assert.equal((await call('view.render', { databaseId: db.id })).period.from, '2026-09-14');
  for (const type of ['calendar', 'timeline', 'chart', 'form', 'board', 'gallery', 'list', 'feed', 'table']) {
    const view = await call('view.create', {
      databaseId: db.id,
      type,
      config: { calendarBy: 'date', formRequired: ['amount'] },
    });
    const rendered = await call('view.render', { databaseId: db.id, viewId: view.id });
    assert.equal(rendered.view.type, type);
    if (type === 'form') {
      await assert.rejects(
        call('form.submit', { databaseId: db.id, viewId: view.id, title: '缺失必填' }),
        /必填/,
      );
      await call('form.submit', { databaseId: db.id, viewId: view.id, title: '提交', values: { amount: 0 } });
    }
  }
});

test('CLI import/export keeps Unicode, formatting, local attachments, PDF and complete backups', async (t) => {
  const { directory, call } = await fixture(t);
  fs.writeFileSync(
    path.join(directory, 'pixel.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  fs.writeFileSync(path.join(directory, '笔记.md'), '# 中文标题\n\n**加粗文字**\n\n![图片](pixel.png)');
  const imported = await call('file.import', { path: path.join(directory, '笔记.md') });
  const id = imported.pages[0];
  assert.match(JSON.stringify(await call('page.get', { pageId: id })), /asset:\/\/local/);
  for (const type of ['md', 'html', 'json', 'pdf']) {
    const output = path.join(directory, 'out', `导出.${type}`);
    const result = await call('file.export', { pageId: id, type, output });
    assert.ok(result.bytes > 20);
  }
  assert.match(fs.readFileSync(path.join(directory, 'out/导出.md'), 'utf8'), /加粗文字/);
  assert.equal(fs.readFileSync(path.join(directory, 'out/导出.pdf')).subarray(0, 4).toString(), '%PDF');
  const jsonImport = await call('file.import', { path: path.join(directory, 'out/导出.json') });
  assert.match(JSON.stringify(await call('page.get', { pageId: jsonImport.pages[0] })), /asset:\/\/local/);
  const backup = path.join(directory, 'all.mininotion');
  const operationsBefore = await call('history.operations');
  await call('backup.export', { path: backup });
  await call('page.trash', { pageId: id });
  await call('backup.restore', { path: backup, confirm: true });
  assert.equal((await call('page.get', { pageId: id })).trashedAt, null);
  assert.deepEqual(
    (await call('history.operations')).slice(1).map((item) => item.id),
    operationsBefore.map((item) => item.id),
  );
  assert.ok(
    fs.readdirSync(path.join(directory, 'backups')).some((name) => name.startsWith('before-restore-')),
  );
});

test('invalid block styles and malformed view filters cannot corrupt the workspace', async (t) => {
  const { call } = await fixture(t);
  const page = await call('database.create', { color: 'white', title: '输入校验' });
  const before = await call('workspace.get');
  await assert.rejects(
    call('view.update', {
      databaseId: page.id,
      viewId: page.database.views[0].id,
      changes: { filters: { conjunction: 'xor', rules: [] } },
    }),
    /筛选组/,
  );
  await assert.rejects(
    call('block.append', {
      pageId: page.id,
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: '测试', styles: { invalid: true } }] }],
    }),
    /文本样式/,
  );
  assert.deepEqual(await call('workspace.get'), before);
});

test('API streams committed changes and refuses UI commands without a connected GUI', async (t) => {
  const { client, call } = await fixture(t);
  const events = [];
  const unsubscribe = await client.subscribe((event) => events.push(event));
  t.after(unsubscribe);
  const page = await call('page.create', { color: 'white', title: '事件测试' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(
    events.some(
      (event) => event.type === 'state' && event.workspace?.pages.some((value) => value.id === page.id),
    ),
  );
  await assert.rejects(call('page.open', { pageId: page.id }), (error) => error.code === 'GUI_NOT_RUNNING');
});

test('linked view commands preserve source configuration and shared records', async (t) => {
  const { call } = await fixture(t);
  const source = await call('database.create', { color: 'white', title: '来源数据库' });
  const owner = await call('page.create', { color: 'white', title: '关联页面' });
  const embedded = await call('database.embed', { pageId: owner.id, databaseId: source.id, view: 'plan' });
  const scope = { databaseId: source.id, ownerPageId: owner.id, blockId: embedded.block.id };
  const views = await call('view.list', scope);
  assert.equal(views[0].type, 'plan');
  await call('view.update', {
    ...scope,
    viewId: views[0].id,
    changes: { name: '独立计划', dateAnchor: '2026-09-10' },
  });
  assert.equal((await call('view.list', scope))[0].name, '独立计划');
  assert.equal((await call('view.list', { databaseId: source.id }))[0].name, '表格');
  const row = await call('record.create', {
    color: 'white',
    databaseId: source.id,
    title: '共享任务',
    values: { date: '2026-09-10' },
  });
  assert.equal((await call('view.render', scope)).records[0].id, row.id);
});

test('undo and redo survive restart and preserve changes to unrelated fields', async (t) => {
  const { call, server, directory } = await fixture(t);
  const page = await call('page.create', { color: 'white', title: '原名' });
  await call('page.update', { pageId: page.id, title: '新名字' });
  const operation = (await call('history.operations', { pageId: page.id }))[0];
  await call('page.update', { pageId: page.id, icon: '📘' });
  await call('history.undo', { id: operation.id });
  assert.equal((await call('page.get', { pageId: page.id })).title, '原名');
  assert.equal((await call('page.get', { pageId: page.id })).icon, '📘');
  await call('history.redo', { id: operation.id });
  assert.equal((await call('page.get', { pageId: page.id })).title, '新名字');
  assert.ok(fs.existsSync(path.join(directory, 'changes.json')));
  await server.close();
  const restarted = await startServer(directory);
  try {
    assert.equal((await call('history.operations', { pageId: page.id }))[1].id, operation.id);
  } finally {
    await restarted.close();
  }
});

test('simultaneous CLI startup uses a single writer and does not leave successor daemons', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-cli-race-'));
  const client = new BackendClient({ directory, autoStart: false });
  t.after(async () => {
    if (await client.ping()) await client.call('service.stop');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async () =>
      JSON.parse((await exec(process.execPath, [cliPath, '--data-dir', directory, 'status'])).stdout),
    ),
  );
  assert.equal(new Set(statuses.map((status) => status.pid)).size, 1);
  await client.call('service.stop');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(await client.ping(), false);
});

test('the shared service shifts dependencies atomically and undo restores all affected dates', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    columns: [
      { id: 'start', name: '开始', type: 'date' },
      { id: 'end', name: '结束', type: 'date' },
    ],
  });
  const a = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '前置',
    values: { start: '2026-09-07', end: '2026-09-08' },
  });
  const b = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '后续',
    values: { start: '2026-09-09', end: '2026-09-10' },
  });
  await call('dependency.add', { pageId: b.id, predecessorId: a.id });
  await call('database.configure', {
    databaseId: db.id,
    dependencies: { enabled: true, dateProperty: 'start', endProperty: 'end', shift: 'maintain' },
  });
  await call('record.update', { pageId: a.id, values: { start: '2026-09-10', end: '2026-09-11' } });
  assert.equal((await call('page.get', { pageId: b.id })).values.start, '2026-09-12');
  await call('history.undo', { pageId: a.id });
  assert.equal((await call('page.get', { pageId: a.id })).values.start, '2026-09-07');
  assert.equal((await call('page.get', { pageId: b.id })).values.start, '2026-09-09');
  const before = await call('workspace.get');
  await assert.rejects(
    call('dependency.add', { pageId: a.id, predecessorId: b.id }),
    (error) => error.code === 'DEPENDENCY_CYCLE',
  );
  assert.deepEqual(await call('workspace.get'), before);
});

test('record JSON export includes its schema and roundtrips sub-items and internal dependencies', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', { color: 'white', title: '原数据库' });
  const parent = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '父任务',
    values: { priority: '高' },
  });
  const child = await call('subitem.create', { color: 'white', pageId: parent.id, title: '子任务' });
  await call('dependency.add', { pageId: child.id, predecessorId: parent.id });
  const file = path.join(directory, 'record.json');
  await call('file.export', { pageId: parent.id, output: file, type: 'json' });
  const imported = await call('file.import', { path: file });
  const copy = await call('page.get', { pageId: imported.pages[0] });
  const copyDb = await call('database.get', { databaseId: copy.parentId });
  assert.equal(copy.title, '父任务');
  assert.equal(copy.values.priority, '高');
  assert.equal(copyDb.subItems, true);
  const children = await call('subitem.children', { pageId: copy.id });
  assert.equal(children.length, 1);
  assert.notEqual(children[0].id, child.id);
  assert.deepEqual(children[0].blockedBy, [copy.id]);
  assert.equal((await call('record.list', { databaseId: copy.parentId })).length, 2);
  const snapshot = await call('history.snapshot', { pageId: children[0].id });
  await call('subitem.set', { pageId: children[0].id, parentId: null });
  await call('dependency.set', { pageId: children[0].id, blockedBy: [] });
  await call('history.restore', { pageId: children[0].id, versionId: snapshot.id });
  const restored = await call('page.get', { pageId: children[0].id });
  assert.equal(restored.subItemOf, copy.id);
  assert.deepEqual(restored.blockedBy, [copy.id]);
});

test('synced pages roundtrip independent sources, child pages, comments and visible export content', async (t) => {
  const { call, directory } = await fixture(t);
  const page = await call('page.create', {
    color: 'white',
    title: '同步迁移',
    blocks: [{ type: 'paragraph', content: '迁移正文' }],
  });
  await call('comment.add', { pageId: page.id, text: '页面讨论' });
  await call('comment.add', { pageId: page.id, blockId: page.blocks[0].id, text: '正文讨论' });
  const first = await call('sync.create', { pageId: page.id, blockIds: [page.blocks[0].id] });
  const child = await call('page.create', {
    color: 'white',
    parentId: first.sourceId,
    title: '同步组的子页',
  });
  await call('block.append', {
    pageId: first.sourceId,
    blocks: [{ type: 'pageLink', props: { pageId: child.id } }],
  });
  const nested = await call('sync.create', {
    pageId: first.sourceId,
    blocks: [{ type: 'paragraph', content: '嵌套共享内容' }],
  });
  const file = path.join(directory, 'synced.json');
  await call('file.export', { pageId: page.id, output: file, type: 'json' });
  const imported = await call('file.import', { path: file });
  const copy = await call('page.get', { pageId: imported.pages[0] });
  assert.equal(copy.comments[0].messages[0].text, '页面讨论');
  const sourceId = copy.blocks[0].props.sourceId;
  assert.notEqual(sourceId, first.sourceId);
  const source = await call('sync.get', { sourceId });
  assert.equal(source.comments[0].messages[0].text, '正文讨论');
  assert.equal(source.comments[0].blockId, source.blocks[0].id);
  assert.notEqual(source.blocks[0].id, page.blocks[0].id);
  const childLink = source.blocks.find((block) => block.type === 'pageLink');
  const copiedChild = await call('page.get', { pageId: childLink.props.pageId });
  assert.notEqual(copiedChild.id, child.id);
  assert.equal(copiedChild.parentId, sourceId);
  const nestedSource = source.blocks.find((block) => block.type === 'syncedBlock').props.sourceId;
  assert.notEqual(nestedSource, nested.sourceId);
  assert.equal((await call('sync.get', { sourceId: nestedSource })).blocks[0].content, '嵌套共享内容');
  await call('block.update', { pageId: first.sourceId, blockId: page.blocks[0].id, text: '原文后续修改' });
  assert.equal((await call('sync.get', { sourceId })).blocks[0].content, '迁移正文');
  for (const type of ['md', 'html', 'pdf']) {
    const output = path.join(directory, `synced.${type}`);
    await call('file.export', { pageId: copy.id, output, type });
    const text =
      type === 'pdf' ? (await exec('pdftotext', [output, '-'])).stdout : fs.readFileSync(output, 'utf8');
    assert.match(text, /迁移正文/);
    assert.match(text, /嵌套共享内容/);
    assert.doesNotMatch(text, /正文讨论/);
  }
});

test('deleting a property or template cleans independent linked views and form requirements', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', { color: 'white' });
  const owner = await call('page.create', { color: 'white', title: '关联视图页' });
  const embedded = await call('database.embed', { pageId: owner.id, databaseId: db.id, view: 'form' });
  const scope = { databaseId: db.id, ownerPageId: owner.id, blockId: embedded.block.id };
  const view = (await call('view.list', scope))[0];
  await call('view.update', {
    ...scope,
    viewId: view.id,
    changes: {
      formRequired: ['priority'],
      hiddenProperties: ['priority'],
      filters: {
        id: 'f',
        conjunction: 'and',
        rules: [{ id: 'r', property: 'priority', operator: 'is', value: '高' }],
      },
    },
  });
  await call('property.delete', { databaseId: db.id, propertyId: 'priority' });
  const updated = (await call('view.list', scope))[0];
  assert.deepEqual(updated.formRequired, []);
  assert.deepEqual(updated.hiddenProperties, []);
  assert.deepEqual(updated.filters.rules, []);
  await call('form.submit', { ...scope, viewId: view.id, title: '可正常提交' });
  const template = await call('template.create', { color: 'white', databaseId: db.id, title: '模板' });
  await call('view.update', { ...scope, viewId: view.id, changes: { defaultTemplateId: template.id } });
  await call('template.delete', { templateId: template.id });
  assert.equal((await call('view.list', scope))[0].defaultTemplateId, null);
});

test('new clients preserve old data and upgrade an idle service without interrupting an old GUI', async (t) => {
  const http = require('node:http');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-service-upgrade-'));
  fs.writeFileSync(
    path.join(directory, 'workspace.json'),
    JSON.stringify({
      version: 1,
      name: '升级保留',
      pages: [],
      activePageId: null,
      expanded: [],
      recent: [],
      settings: { theme: 'light', sidebarWidth: 248, sidebarHidden: false, spellcheck: true },
    }),
  );
  const client = new BackendClient({ directory });
  let guiClients = 1,
    desktopClients = 0,
    stops = 0;
  const old = http.createServer(async (request, response) => {
    const status = { version: '1.0.0', pid: process.pid, guiClients, desktopClients };
    if (request.url === '/health') {
      response.end(JSON.stringify(status));
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    if (message.method === 'service.stop') {
      stops++;
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { stopping: true }, revision: 0 }),
      );
      old.close();
    } else response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: status, revision: 0 }));
  });
  await new Promise((resolve) => old.listen(client.socket, resolve));
  t.after(async () => {
    old.close();
    await client.call('service.stop');
    for (let attempt = 0; attempt < 20 && (await client.ping()); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 25));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.equal((await client.call('status')).version, '1.0.0');
  await assert.rejects(client.call('workspace.get'), (error) => error.code === 'RESTART_REQUIRED');
  assert.equal(stops, 0);
  guiClients = 0;
  desktopClients = 1;
  await assert.rejects(client.call('workspace.get'), (error) => error.code === 'RESTART_REQUIRED');
  assert.equal(stops, 0);
  desktopClients = 0;
  const workspace = await client.call('workspace.get');
  assert.equal(workspace.name, '升级保留');
  assert.equal(stops, 1);
  assert.equal((await client.call('status')).version, require('../package.json').version);
});

test('date range API validates values, moves dependency ranges atomically and exports their readable values', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    columns: [{ id: 'date', name: '日期', type: 'date' }],
  });
  const a = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '第一段',
    values: { date: { start: '2026-09-14', end: '2026-09-16' } },
  });
  const b = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '第二段',
    values: { date: { start: '2026-09-17', end: '2026-09-18' } },
  });
  await call('database.configure', {
    databaseId: db.id,
    dependencies: { enabled: true, dateProperty: 'date', shift: 'maintain' },
  });
  await call('dependency.add', { pageId: b.id, predecessorId: a.id });
  await call('record.schedule', { pageId: a.id, date: '2026-09-21' });
  assert.deepEqual((await call('page.get', { pageId: b.id })).values.date, {
    start: '2026-09-24',
    end: '2026-09-25',
  });
  await call('history.undo', { pageId: a.id });
  assert.deepEqual((await call('page.get', { pageId: b.id })).values.date, b.values.date);
  const before = await call('workspace.get');
  await assert.rejects(
    call('record.update', { pageId: a.id, values: { date: { start: '2026-09-21', end: '2026-09-20' } } }),
    (error) => error.code === 'INVALID_DATE',
  );
  assert.deepEqual(await call('workspace.get'), before);
  const output = path.join(directory, 'dates.csv');
  await call('file.export', { pageId: db.id, type: 'csv', output });
  assert.match(fs.readFileSync(output, 'utf8'), /2026-09-14 → 2026-09-16/);
  const json = path.join(directory, 'dates.json');
  await call('file.export', { pageId: db.id, type: 'json', output: json });
  const imported = await call('file.import', { path: json });
  const rows = await call('record.list', { databaseId: imported.pages[0] });
  assert.deepEqual(rows[0].values.date, a.values.date);
});

test('CLI hourly text includes timed intervals and view changes persist without modifying source time zones', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    view: 'plan',
    columns: [{ id: 'date', name: '日期', type: 'date' }],
  });
  const view = db.database.views[0];
  await call('view.update', {
    databaseId: db.id,
    viewId: view.id,
    changes: { planMode: 'hourDay', dateAnchor: '2026-09-11', timeZone: 'UTC' },
  });
  const row = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '文本计划',
    values: {
      date: { start: '2026-09-11T09:00+08:00', end: '2026-09-11T10:00+08:00', timeZone: 'Asia/Shanghai' },
    },
  });
  const output = (
    await exec(process.execPath, [
      cliPath,
      '--data-dir',
      directory,
      '--format',
      'text',
      'view',
      'render',
      db.id,
    ])
  ).stdout;
  assert.match(output, /文本计划/);
  assert.match(output, /2026-09-11T01:00\+00:00 → 2026-09-11T02:00\+00:00/);
  const before = (await call('workspace.get')).pages.find((page) => page.id === row.id);
  await call('view.update', {
    databaseId: db.id,
    viewId: view.id,
    changes: { timeZone: 'America/New_York' },
  });
  const previousDay = await call('view.render', { databaseId: db.id, viewId: view.id, date: '2026-09-10' });
  assert.equal(previousDay.timeGrid.days[0].events[0].minuteStart, 21 * 60);
  assert.deepEqual(
    (await call('workspace.get')).pages.find((page) => page.id === row.id),
    before,
  );
  await assert.rejects(
    call('view.update', { databaseId: db.id, viewId: view.id, changes: { timeZone: 'Invalid/Zone' } }),
    (error) => error.code === 'INVALID_DATE',
  );
});

test('recurring jobs commit cursor and pages together, survive restart and do not regenerate undone occurrences', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-recurring-api-'));
  let server = await startServer(directory);
  const client = new BackendClient({ directory, autoStart: false }),
    call = client.call.bind(client);
  t.after(async () => {
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await call('workspace.init', { empty: true });
  const db = await call('database.create', { color: 'white' });
  const template = await call('template.create', {
    color: 'white',
    databaseId: db.id,
    title: '每天复盘',
    blocks: [{ type: 'paragraph', content: '记录进展' }],
  });
  await call('repeat.configure', {
    templateId: template.id,
    rule: {
      frequency: 'daily',
      interval: 1,
      startDate: '2099-01-01',
      time: '09:00',
      timeZone: 'UTC',
      catchUp: 'all',
      dateProperty: 'date',
      titlePattern: '复盘 {date}',
    },
  });
  const output = await Promise.all([
    call('scheduler.run', { at: '2099-01-03T10:00Z' }),
    call('scheduler.run', { at: '2099-01-03T10:00Z' }),
  ]);
  assert.equal(output.flatMap((result) => result.runs).length, 3);
  const generated = await call('record.list', { databaseId: db.id });
  assert.equal(generated.length, 3);
  assert.equal(generated[2].title, '复盘 2099-01-03');
  await call('history.undo', { pageId: generated[0].id });
  assert.equal((await call('record.list', { databaseId: db.id })).length, 0);
  await server.close();
  server = await startServer(directory);
  assert.equal((await call('scheduler.run', { at: '2099-01-03T10:00Z' })).runs.length, 0);
  const backup = path.join(directory, 'repeat.mininotion');
  await call('backup.export', { path: backup });
  await call('repeat.run', { templateId: template.id, at: '2099-01-04T09:00Z' });
  assert.equal((await call('record.list', { databaseId: db.id })).length, 1);
  await call('backup.restore', { path: backup, confirm: true });
  assert.equal((await call('scheduler.run', { at: '2099-01-03T10:00Z' })).runs.length, 0);
  const next = await call('scheduler.run', { at: '2099-01-04T09:00Z' });
  assert.equal(next.runs.length, 1);
  const copy = await call('template.duplicate', { templateId: template.id });
  assert.equal(copy.repeat.enabled, false);
});

test('background reminders deliver through the event stream once with no GUI and can be snoozed or archived', async (t) => {
  const { call, client } = await fixture(t);
  const page = await call('page.create', { color: 'white', title: '本地提醒' });
  let resolveDelivery;
  const delivered = new Promise((resolve) => (resolveDelivery = resolve));
  const events = [];
  const unsubscribe = await client.subscribe((event) => {
    if (event.type === 'notification') {
      events.push(event.item);
      resolveDelivery(event.item);
    }
  });
  t.after(unsubscribe);
  const at = new Date(Date.now() + 1400).toISOString();
  const reminder = await call('reminder.add', { pageId: page.id, at, text: '按时休息' });
  const timeout = setTimeout(() => resolveDelivery(null), 5000);
  const event = await delivered;
  clearTimeout(timeout);
  assert.ok(event);
  assert.equal(event.text, '按时休息');
  assert.equal((await call('status')).guiClients, 0);
  await call('scheduler.run');
  assert.equal(events.length, 1);
  const inbox = await call('inbox.list');
  assert.equal(inbox[0].id, event.id);
  await call('reminder.snooze', {
    pageId: page.id,
    reminderId: reminder.id,
    inboxId: event.id,
    until: '2099-01-01T09:00Z',
  });
  assert.equal((await call('inbox.list')).length, 0);
  assert.equal((await call('scheduler.run', { at: '2099-01-01T09:00Z' })).notifications.length, 1);
  assert.equal((await call('scheduler.run', { at: '2099-01-01T09:00Z' })).notifications.length, 0);
  await call('inbox.read', { all: true });
  assert.equal((await call('inbox.list', { status: 'unread' })).length, 0);
  await call('inbox.archive', { all: true });
  assert.equal((await call('inbox.list')).length, 0);
  assert.equal((await call('inbox.list', { status: 'archived' })).length, 2);
});

test('reminder definitions and delivery state travel in backups; deleting their property disables bindings reversibly', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', { color: 'white' });
  const template = await call('template.create', { color: 'white', databaseId: db.id, title: '模板' });
  const row = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '绑定日期',
    values: { date: '2099-01-01' },
  });
  await call('repeat.configure', {
    templateId: template.id,
    rule: { startDate: '2099-01-01', dateProperty: 'date' },
  });
  const reminder = await call('reminder.add', {
    pageId: row.id,
    propertyId: 'date',
    offset: 1,
    unit: 'days',
    dayTime: '09:00',
    timeZone: 'UTC',
  });
  await call('scheduler.run', { at: '2098-12-31T10:00Z' });
  const backup = path.join(directory, 'reminders.mininotion');
  await call('backup.export', { path: backup });
  await call('property.delete', { databaseId: db.id, propertyId: 'date' });
  assert.equal((await call('reminder.get', { pageId: row.id, reminderId: reminder.id })).enabled, false);
  assert.equal((await call('repeat.get', { templateId: template.id })).rule.dateProperty, undefined);
  await call('history.undo', { pageId: db.id });
  assert.equal((await call('reminder.get', { pageId: row.id, reminderId: reminder.id })).enabled, true);
  await call('reminder.delete', { pageId: row.id, reminderId: reminder.id });
  await call('backup.restore', { path: backup, confirm: true });
  assert.equal((await call('scheduler.run', { at: '2098-12-31T10:00Z' })).notifications.length, 0);
  assert.equal((await call('inbox.list')).length, 1);
});

test('the live scheduler generates a due repeating template automatically without a GUI or manual run', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', { color: 'white' }),
    template = await call('template.create', { color: 'white', databaseId: db.id, title: '自动生成验证' });
  const clock = new Date().toISOString();
  await call('repeat.configure', {
    templateId: template.id,
    rule: {
      startDate: clock.slice(0, 10),
      time: clock.slice(11, 16),
      timeZone: 'UTC',
      frequency: 'daily',
      catchUp: 'latest',
    },
  });
  let rows = [];
  for (let attempt = 0; attempt < 50; attempt++) {
    rows = await call('record.list', { databaseId: db.id });
    if (rows.length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(rows.length, 1);
  assert.equal((await call('page.get', { pageId: rows[0].id })).automationOrigin.templateId, template.id);
  assert.equal((await call('status')).guiClients, 0);
  assert.equal((await call('scheduler.run')).runs.length, 0);
  assert.equal((await call('record.list', { databaseId: db.id })).length, 1);
});

test('button preview includes triggered automation, execution is atomic, and undo restores user data without replay', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    columns: [
      { id: 'done', name: '完成', type: 'checkbox' },
      { id: 'count', name: '次数', type: 'number' },
    ],
  });
  const row = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '处理任务',
    values: { done: false, count: 0 },
  });
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '完成后计数',
      triggers: [{ type: 'property', propertyId: 'done' }],
      filters: {
        id: 'f',
        conjunction: 'and',
        rules: [{ id: 'r', property: 'done', operator: 'is', value: 'true' }],
      },
      actions: [
        { type: 'set', values: { count: { formula: 'prop("次数") + 1' } } },
        { type: 'notify', text: '已完成任务' },
      ],
    },
  });
  const button = await call('button.create', {
    pageId: db.id,
    property: true,
    label: '完成任务',
    confirmation: '确认完成？',
    actions: [{ type: 'set', values: { done: true } }],
  });
  const before = await call('workspace.get'),
    preview = await call('button.preview', { pageId: row.id, propertyId: button.propertyId });
  assert.equal(preview.changes.pages.find((change) => change.id === row.id).after.values.count, 1);
  assert.deepEqual(await call('workspace.get'), before);
  await assert.rejects(
    call('button.run', { pageId: row.id, propertyId: button.propertyId }),
    (error) => error.code === 'CONFIRMATION_REQUIRED',
  );
  await call('button.run', {
    pageId: row.id,
    propertyId: button.propertyId,
    confirm: true,
    expectedConfig: preview.config,
  });
  assert.deepEqual((await call('page.get', { pageId: row.id })).values, { done: true, count: 1 });
  assert.equal((await call('inbox.list')).length, 1);
  await call('history.undo', { pageId: row.id });
  assert.deepEqual((await call('page.get', { pageId: row.id })).values, { done: false, count: 0 });
  assert.equal((await call('inbox.list')).length, 1);
  await call('button.configure', {
    pageId: db.id,
    propertyId: button.propertyId,
    actions: [
      { type: 'set', title: '不可部分保存' },
      { type: 'set', values: { missing: 1 } },
    ],
  });
  await assert.rejects(
    call('button.run', { pageId: row.id, propertyId: button.propertyId, confirm: true }),
    /没有属性/,
  );
  assert.equal((await call('page.get', { pageId: row.id })).title, '处理任务');
  assert.equal((await call('action.history', { pageId: row.id }))[0].status, 'error');
});

test('automations use a short all-trigger window, do not cascade, and failures preserve the original edit', async (t) => {
  const { call } = await fixture(t);
  const db = await call('database.create', {
      color: 'white',
      columns: [
        { id: 'a', name: '甲', type: 'number' },
        { id: 'b', name: '乙', type: 'number' },
        { id: 'done', name: '完成', type: 'checkbox' },
      ],
    }),
    row = await call('record.create', {
      color: 'white',
      databaseId: db.id,
      title: '原名',
      values: { a: 0, b: 0, done: false },
    });
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '组合变化',
      triggerMode: 'all',
      triggers: [
        { type: 'property', propertyId: 'a' },
        { type: 'property', propertyId: 'b' },
      ],
      actions: [{ type: 'set', values: { done: true } }],
    },
  });
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '不得连锁',
      triggers: [{ type: 'property', propertyId: 'done' }],
      actions: [{ type: 'set', title: '不应发生' }],
    },
  });
  await call('record.update', { pageId: row.id, values: { a: 1 } });
  assert.equal((await call('page.get', { pageId: row.id })).values.done, false);
  await call('record.update', { pageId: row.id, values: { b: 2 } });
  assert.equal((await call('page.get', { pageId: row.id })).values.done, true);
  assert.equal((await call('page.get', { pageId: row.id })).title, '原名');
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '失败动作',
      triggers: [{ type: 'property', propertyId: 'a' }],
      actions: [
        { type: 'set', title: '必须回滚' },
        { type: 'set', values: { absent: 1 } },
      ],
    },
  });
  await call('record.update', { pageId: row.id, values: { a: 3 } });
  const after = await call('page.get', { pageId: row.id });
  assert.equal(after.values.a, 3);
  assert.equal(after.title, '原名');
  assert.equal((await call('action.history', { pageId: row.id }))[0].status, 'error');
});

test('scheduled automations share recurrence progress and never trigger record-created automations', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    columns: [{ id: 'done', name: '完成', type: 'checkbox' }],
  });
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '新增时标记',
      triggers: [{ type: 'created' }],
      actions: [{ type: 'set', values: { done: true } }],
    },
  });
  const recurring = await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '每日创建',
      triggers: [],
      schedule: {
        frequency: 'daily',
        interval: 1,
        startDate: '2099-01-01',
        time: '09:00',
        timeZone: 'UTC',
        catchUp: 'all',
      },
      actions: [
        {
          type: 'create',
          databaseId: db.id,
          title: { formula: '"日志 " + formatDate(triggerTime, "YYYY-MM-DD")' },
        },
      ],
    },
  });
  const first = await call('scheduler.run', { at: '2099-01-02T10:00Z' });
  assert.equal(first.automations.length, 2);
  const rows = await call('record.list', { databaseId: db.id });
  assert.deepEqual(
    rows.map((row) => row.title),
    ['日志 2099-01-01', '日志 2099-01-02'],
  );
  assert.ok(rows.every((row) => !row.values.done));
  assert.equal((await call('scheduler.run', { at: '2099-01-02T10:00Z' })).automations.length, 0);
  const backup = path.join(directory, 'automations.mininotion');
  await call('backup.export', { path: backup });
  await call('automation.delete', { databaseId: db.id, automationId: recurring.id });
  await call('backup.restore', { path: backup, confirm: true });
  assert.equal((await call('scheduler.run', { at: '2099-01-02T10:00Z' })).automations.length, 0);
  const userRow = await call('record.create', { color: 'white', databaseId: db.id, title: '手动新增' });
  assert.equal(userRow.values.done, true);
});

test('portable JSON remaps button destinations and imports automation definitions paused', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', { color: 'white', title: '自动化迁移' });
  await call('button.create', {
    pageId: db.id,
    label: '新建任务',
    actions: [
      { type: 'create', databaseId: db.id, title: '来自按钮' },
      { type: 'insert', target: 'created', blocks: [{ type: 'checkListItem', content: '下一步' }] },
    ],
  });
  await call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '新增通知',
      triggers: [{ type: 'created' }],
      actions: [{ type: 'notify', text: '已创建' }],
    },
  });
  const file = path.join(directory, 'actions.json');
  await call('file.export', { pageId: db.id, output: file, type: 'json' });
  const imported = await call('file.import', { path: file });
  const copiedId = imported.pages[0];
  const rule = (await call('automation.list', { databaseId: copiedId }))[0];
  assert.equal(rule.enabled, false);
  const button = (await call('button.list', { pageId: copiedId }))[0];
  await call('button.run', { pageId: copiedId, blockId: button.blockId });
  assert.equal((await call('record.list', { databaseId: db.id })).length, 0);
  const rows = await call('record.list', { databaseId: copiedId });
  assert.equal(rows.length, 1);
  const page = await call('page.get', { pageId: rows[0].id });
  assert.ok(page.blocks.some((block) => block.type === 'checkListItem'));
  assert.equal((await call('inbox.list')).length, 0);
});

test('unique numbering survives atomic reordering, undo, deletion and backup without recycling IDs', async (t) => {
  const { call, directory } = await fixture(t);
  const db = await call('database.create', {
    color: 'white',
    columns: [{ id: 'uid', name: '编号', type: 'uniqueId', idPrefix: 'TASK' }],
  });
  await call('batch', {
    operations: [
      { method: 'record.create', params: { color: 'white', databaseId: db.id, id: 'batch-a', title: '甲' } },
      { method: 'record.create', params: { color: 'white', databaseId: db.id, id: 'batch-b', title: '乙' } },
      { method: 'page.move', params: { pageId: 'batch-b', parentId: db.id, beforeId: 'batch-a' } },
    ],
  });
  assert.equal((await call('page.get', { pageId: 'batch-a' })).uniqueId.number, 1);
  assert.equal((await call('page.get', { pageId: 'batch-b' })).uniqueId.number, 2);
  await call('history.undo', { pageId: 'batch-a' });
  const third = await call('record.create', { color: 'white', databaseId: db.id });
  assert.equal(third.uniqueId.number, 3);
  await call('page.trash', { pageId: third.id });
  await call('page.purge', { pageId: third.id, confirm: true });
  const backup = path.join(directory, 'numbering.mininotion');
  await call('backup.export', { path: backup });
  await call('backup.restore', { path: backup, confirm: true });
  const fourth = await call('record.create', { color: 'white', databaseId: db.id });
  assert.equal(fourth.uniqueId.number, 4);
  await assert.rejects(
    call('record.update', { pageId: fourth.id, values: { uid: 123 } }),
    (error) => error.code === 'READ_ONLY_PROPERTY',
  );
  assert.equal((await call('search', { query: 'TASK-4' }))[0].id, fourth.id);
});

test('person and file properties preserve formulas, local assets, and definitions through portable JSON', async (t) => {
  const { call, directory } = await fixture(t);
  const source = path.join(directory, 'attachment.txt');
  fs.writeFileSync(source, '离线附件正文');
  const asset = await call('asset.add', { path: source });
  const person = await call('person.create', { name: '小陈', email: 'chen@example.test' });
  const db = await call('database.create', {
    color: 'white',
    columns: [
      { id: 'person', name: '负责人', type: 'person' },
      { id: 'files', name: '资料', type: 'files' },
      {
        id: 'formula',
        name: '邮件',
        type: 'formula',
        formula: 'prop("负责人").map(current.email()).join(",")',
      },
    ],
  });
  const row = await call('record.create', {
    color: 'white',
    databaseId: db.id,
    values: { person: [person.id], files: [asset] },
  });
  const file = path.join(directory, 'record.json');
  await call('file.export', { pageId: row.id, type: 'json', output: file });
  const imported = await call('file.import', { path: file }),
    copy = await call('page.get', { pageId: imported.pages[0] });
  assert.equal(copy.values.person[0].email, 'chen@example.test');
  assert.equal(copy.values.files[0].name, 'attachment.txt');
  assert.equal(
    fs.readFileSync((await call('asset.get', { url: copy.values.files[0].url })).path, 'utf8'),
    '离线附件正文',
  );
  assert.equal(
    await call('formula.evaluate', { pageId: copy.id, expression: 'prop("邮件")' }),
    'chen@example.test',
  );
  const csv = path.join(directory, 'files.csv');
  await call('file.export', { pageId: db.id, type: 'csv', output: csv });
  assert.equal(fs.readdirSync(path.join(directory, 'files.assets')).length, 1);
});
