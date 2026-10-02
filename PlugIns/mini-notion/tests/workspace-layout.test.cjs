const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const run = promisify(execFile);

async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-layout-')));
  const servers = [];
  const connect = async directory => {
    const client = new BackendClient({ workspace: directory, autoStart: false });
    const server = await startServer(client.directory, directory);
    servers.push(server);
    return { client, call: client.call.bind(client), server };
  };
  const main = await connect(root);
  t.after(async () => {
    for (const server of servers.reverse()) await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, connect, ...main };
}
const create = (call, title, parentId) => call('page.create', { title, color: 'white', ...(parentId ? { parentId } : {}) });
const locate = (call, page) => call('fs.path', { pageId: page.id });

test('one main page per stable folder; recursive pages, duplicate titles and all database views are files', async t => {
  const { root, call } = await fixture(t);
  const main = await create(call, '知识库'), child = await create(call, '子页面', main.id), grandchild = await create(call, '第三层', child.id);
  const folder = await locate(call, main);
  assert.equal(folder.path, '知识库/index.mininotion.json');
  assert.equal(path.posix.dirname((await locate(call, child)).directory), folder.directory);
  assert.equal(path.posix.dirname((await locate(call, grandchild)).directory), (await locate(call, child)).directory);
  const duplicateTitle = await create(call, '知识库');
  assert.equal((await locate(call, duplicateTitle)).directory, '知识库 (2)');
  await call('page.update', { pageId: main.id, title: '重新命名的知识库' });
  assert.equal((await locate(call, main)).absoluteDirectory, folder.absoluteDirectory);
  for (const view of ['table', 'board', 'calendar', 'gallery', 'list', 'timeline', 'chart', 'form', 'plan']) {
    const db = await call('database.create', { title: `${view} database`, parentId: main.id, color: 'blue', view });
    const record = await call('record.create', { databaseId: db.id, title: `${view} record`, color: 'white' });
    assert.equal((await call('record.list', { databaseId: db.id })).length, 1);
    assert.equal(path.posix.dirname((await locate(call, db)).directory), folder.directory);
    assert.equal(path.posix.dirname((await locate(call, record)).directory), (await locate(call, db)).directory);
    const stored = JSON.parse(fs.readFileSync((await locate(call, db)).absolutePath));
    assert.equal(stored.page.database.view, view);
  }
  const document = JSON.parse(fs.readFileSync(folder.absolutePath));
  let parentId = grandchild.id;
  const deepIds = [];
  let deepDirectory = (await locate(call, grandchild)).absoluteDirectory;
  for (let i = 0; i < 160; i++) {
    const id = randomUUID(); deepIds.push(id);
    const page = { ...document.page, id, parentId, title: `深度 ${i}`, space: undefined, folders: undefined, files: undefined };
    deepDirectory = path.join(deepDirectory, 'n'); fs.mkdirSync(deepDirectory);
    fs.writeFileSync(path.join(deepDirectory, 'index.mininotion.json'), JSON.stringify({ format: document.format, page }));
    parentId = id;
  }
  assert.deepEqual((await call('fs.sync')).errors, []);
  const tree = await call('page.tree');
  let node = tree.find(page => page.id === main.id).children.find(page => page.id === child.id).children.find(page => page.id === grandchild.id);
  for (const id of deepIds) { node = node.children.find(page => page.id === id); assert.ok(node); }
  assert.ok(!fs.existsSync(path.join(root, 'Documents')));
});

test('existing folders become editable main pages; employee and parent scopes share IDs, files and attachments', async t => {
  const { root, call, connect } = await fixture(t);
  fs.mkdirSync(path.join(root, '员工 工作区'));
  fs.writeFileSync(path.join(root, '员工 工作区/readme.md'), '# 保留原文\n');
  await call('fs.sync');
  const virtual = (await call('page.list')).find(page => page.sourceFile?.path === '员工 工作区');
  const bound = await call('fs.bind', { path: '员工 工作区', title: '共享项目' });
  assert.equal(bound.pageId, virtual.id);
  assert.equal((await call('fs.bind', { path: '员工 工作区', title: '不得覆盖' })).created, false);
  assert.equal((await call('page.get', { pageId: bound.pageId })).title, '共享项目');
  assert.equal((await call('page.list')).find(page => page.sourceFile?.path.endsWith('readme.md')).parentId, bound.pageId);
  const employee = await connect(bound.absoluteDirectory);
  assert.equal((await employee.call('fs.bind', { path: '.' })).pageId, bound.pageId);
  const page = await create(employee.call, 'Agent 创建的子页面', bound.pageId);
  assert.equal((await call('page.get', { pageId: page.id })).parentId, bound.pageId);
  const url = await call('fs.asset-upload', { name: 'sample.txt', contentBase64: Buffer.from('shared attachment').toString('base64') });
  await call('page.update', { pageId: page.id, icon: url });
  assert.equal(fs.readFileSync(path.join((await locate(call, page)).absoluteDirectory, '.mininotion/attachments', path.basename(new URL(url).pathname)), 'utf8'), 'shared attachment');
  assert.equal((await employee.call('page.get', { pageId: page.id })).icon, url);
  const out = await run(process.execPath, [path.resolve('dist-cli/cli.cjs'), '--workspace', bound.absoluteDirectory, 'api', 'block.append', '--data', JSON.stringify({ pageId: page.id, text: '真实 CLI 写入' })], { cwd: root });
  assert.ok(out.stdout);
  assert.match(JSON.stringify(await call('page.get', { pageId: page.id })), /真实 CLI 写入/);
  assert.equal(fs.readFileSync(path.join(bound.absoluteDirectory, 'readme.md'), 'utf8'), '# 保留原文\n');
  assert.equal((await call('fs.info')).mainPages.filter(item => item.pageId === bound.pageId).length, 1);
});

test('moving and duplicating a subtree moves every native file without renaming bound folders', async t => {
  const { call, connect } = await fixture(t);
  const left = await create(call, 'Left'), right = await create(call, 'Right');
  const child = await create(call, 'Child', left.id), grandchild = await create(call, 'Grandchild', child.id);
  const leftFolder = (await locate(call, left)).absoluteDirectory, rightFolder = (await locate(call, right)).absoluteDirectory;
  const leftScope = await connect(leftFolder), rightScope = await connect(rightFolder);
  await leftScope.call('fs.sync');
  const old = await locate(call, grandchild);
  await call('page.move', { pageId: child.id, parentId: right.id });
  assert.equal((await locate(call, grandchild)).absoluteDirectory, path.join(rightFolder, 'Child', 'Grandchild'));
  assert.equal(fs.existsSync(old.absolutePath), false);
  assert.ok(!(await leftScope.call('page.list')).some(page => page.id === child.id));
  assert.equal((await rightScope.call('page.get', { pageId: grandchild.id })).parentId, child.id);
  const copy = await call('page.duplicate', { pageId: right.id });
  const copyId = copy.id || copy.pageId;
  assert.ok(copyId, JSON.stringify(copy));
  const copied = (await call('page.tree')).find(page => page.id === copyId);
  assert.equal(copied.children[0].children.length, 1);
  const copiedFolder = (await call('fs.path', { pageId: copyId })).absoluteDirectory;
  assert.notEqual(copiedFolder, rightFolder);
  assert.ok(fs.existsSync(leftFolder)); assert.ok(fs.existsSync(rightFolder));
});

test('legacy Documents is preserved until explicit migration, with a non-mutating preview', async t => {
  const { root, call } = await fixture(t);
  const sample = await create(call, 'Seed');
  const base = JSON.parse(fs.readFileSync((await locate(call, sample)).absolutePath));
  fs.mkdirSync(path.join(root, 'Documents'));
  const rootId = randomUUID(), childId = randomUUID();
  for (const [id, parentId, title] of [[rootId, null, 'Legacy'], [childId, rootId, 'Legacy child']]) {
    fs.writeFileSync(path.join(root, `Documents/${id}.mininotion.json`), JSON.stringify({ format: base.format, page: { ...base.page, id, parentId, title } }));
  }
  await call('fs.sync');
  await call('page.update', { pageId: rootId, title: 'Legacy renamed' });
  assert.equal((await call('fs.path', { pageId: rootId })).path, `Documents/${rootId}.mininotion.json`);
  const preview = await call('fs.organize');
  assert.equal(preview.dryRun, true); assert.equal(preview.moves.length, 2);
  assert.ok(fs.existsSync(path.join(root, `Documents/${rootId}.mininotion.json`)));
  const applied = await call('fs.organize', { dryRun: false });
  assert.deepEqual(applied.moves, preview.moves);
  const migrated = await call('fs.path', { pageId: rootId });
  assert.equal(migrated.path, 'Legacy renamed/index.mininotion.json');
  assert.equal(path.posix.dirname((await call('fs.path', { pageId: childId })).directory), migrated.directory);
  assert.ok(fs.existsSync(path.join(root, 'Documents')), 'Never delete a bound folder');
  assert.deepEqual((await call('fs.organize')).moves, []);
});

test('external rename, malformed content, conflict and trash never silently replace another writer', async t => {
  const { call } = await fixture(t);
  const main = await create(call, 'External'), child = await create(call, 'Child', main.id);
  const location = await locate(call, child), moved = path.join(location.absoluteDirectory, 'renamed.mininotion.json');
  fs.renameSync(location.absolutePath, moved);
  assert.deepEqual((await call('fs.sync')).errors, []);
  assert.equal((await locate(call, child)).absolutePath, moved);
  const good = fs.readFileSync(moved, 'utf8');
  fs.writeFileSync(moved, '{broken');
  const sync = await call('fs.sync'); assert.equal(sync.errors.length, 1);
  await assert.rejects(call('page.update', { pageId: child.id, title: 'Must not overwrite' }), error => error.code === 'FILE_CONFLICT');
  assert.equal(fs.readFileSync(moved, 'utf8'), '{broken');
  fs.writeFileSync(moved, good);
  await call('fs.sync');
  await call('page.trash', { pageId: main.id });
  assert.ok(!(await call('page.list')).some(page => page.id === child.id));
  await call('page.restore', { pageId: main.id });
  assert.ok((await call('page.list')).some(page => page.id === child.id));
  await call('page.purge', { pageId: main.id, confirm: true });
  assert.ok(!(await call('page.list', { trash: true })).some(page => page.id === main.id || page.id === child.id));
});

test('file transactions reject stale writes and roll back the entire set on storage errors', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-transaction-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'transaction.cjs');
  require('esbuild').buildSync({ entryPoints: [path.resolve('src/backend/folderTransaction.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
  const { fileTransaction, fileHash } = require(bundle);
  const first = path.join(root, 'first.json'), second = path.join(root, 'second.json');
  fs.writeFileSync(first, 'original');
  assert.throws(() => fileTransaction([{ file: first, content: 'new', expected: fileHash('original') }, { file: second, content: 'new', expected: null }], () => { throw new Error('Injected storage failure'); }), /Injected storage failure/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'original'); assert.equal(fs.existsSync(second), false);
  assert.throws(() => fileTransaction([{ file: first, content: 'wrong', expected: fileHash('stale') }]), error => error.code === 'FILE_CONFLICT');
  fs.writeFileSync(path.join(root, '.mininotion-write-lock'), JSON.stringify({ pid: process.pid }));
  assert.throws(() => fileTransaction([{ file: first, content: 'wrong' }]), error => error.code === 'FILE_BUSY');
  fs.unlinkSync(path.join(root, '.mininotion-write-lock'));
  fileTransaction([{ file: first, content: 'committed', expected: fileHash('original') }]);
  assert.equal(fs.readFileSync(first, 'utf8'), 'committed');
  assert.ok(!fs.readdirSync(root).some(name => name.endsWith('.tmp') || name.endsWith('write-lock')));
});

test('synced blocks, database templates and nested records remain usable in the bound main-page scope', async t => {
  const { call, connect } = await fixture(t);
  const main = await create(call, '完整内容');
  const sync = await call('sync.create', { pageId: main.id, name: '共享正文', blocks: [{ type: 'paragraph', content: '源内容' }] });
  const directory = (await locate(call, main)).absoluteDirectory;
  assert.equal((await call('fs.path', { pageId: sync.sourceId })).absoluteDirectory, directory);
  const db = await call('database.create', { title: '任务', parentId: main.id, color: 'blue', view: 'board' });
  const template = await call('template.create', { databaseId: db.id, title: '标准任务', color: 'white', blocks: [{ type: 'paragraph', content: '模板正文' }] });
  const nested = await create(call, '模板子页', template.id);
  const employee = await connect(directory);
  assert.match(JSON.stringify(await employee.call('sync.get', { sourceId: sync.sourceId })), /源内容/);
  await employee.call('sync.update', { sourceId: sync.sourceId, blocks: [{ type: 'paragraph', content: '员工编辑共享正文' }] });
  assert.match(JSON.stringify(await call('sync.get', { sourceId: sync.sourceId })), /员工编辑共享正文/);
  assert.equal((await employee.call('template.list', { databaseId: db.id }))[0].id, template.id);
  const record = await employee.call('template.use', { templateId: template.id, title: '从模板创建' });
  assert.match(JSON.stringify(await call('page.get', { pageId: record.id })), /模板正文/);
  const tree = await call('page.tree');
  const recordNode = tree.find(page => page.id === main.id).children.find(page => page.id === db.id).children.find(page => page.id === record.id);
  assert.equal(recordNode.children.length, 1);
  assert.equal(recordNode.children[0].title, nested.title);
  for (const [id, parentId] of [[db.id, main.id], [template.id, db.id], [nested.id, template.id], [record.id, db.id], [recordNode.children[0].id, record.id]])
    assert.equal(path.dirname((await call('fs.path', { pageId: id })).absoluteDirectory), (await call('fs.path', {pageId: parentId})).absoluteDirectory);
});

test('external remove and recreation with identical bytes restores the page; large raw files retain trash lifecycle', async t => {
  const { root, call } = await fixture(t);
  const main = await create(call, '文件恢复');
  const location = await locate(call, main);
  const content = fs.readFileSync(location.absolutePath);
  fs.unlinkSync(location.absolutePath);
  await call('fs.sync');
  assert.ok(!(await call('page.list')).some(page => page.id === main.id));
  fs.writeFileSync(location.absolutePath, content);
  await call('fs.sync');
  assert.ok((await call('page.list')).some(page => page.id === main.id));
  const large = path.join(root, 'large.bin'), bytes = Buffer.alloc(5 * 1024 * 1024, 7);
  fs.writeFileSync(large, bytes);
  const raw = (await call('page.list')).find(page => page.sourceFile?.path === 'large.bin');
  await call('page.trash', { pageId: raw.id });
  assert.equal(fs.existsSync(large), false);
  await call('page.restore', { pageId: raw.id });
  assert.ok(fs.readFileSync(large).equals(bytes));
  await call('page.purge', { pageId: raw.id, confirm: true });
  assert.equal(fs.existsSync(large), false);
});
