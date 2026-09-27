const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Storage, validateWorkspace } = require('../electron/storage.cjs');
const workspace = () => ({
  version: 1,
  name: '测试',
  pages: [
    {
      id: 'a',
      parentId: null,
      title: '初稿',
      blocks: [{ type: 'paragraph', content: '第一版' }],
      values: {},
      updatedAt: 100,
    },
  ],
  settings: {},
  expanded: [],
  recent: [],
  activePageId: 'a',
});

test('durable writes reload correctly and retain backups and page history', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  assert.equal(storage.load(), null);
  const first = workspace();
  storage.save(first);
  const second = structuredClone(first);
  second.pages[0].title = '第二版';
  second.pages[0].updatedAt = 200;
  storage.save(second);
  assert.deepEqual(new Storage(directory).load(), second);
  assert.equal(storage.versions('a')[0].page.title, '初稿');
  const backup = fs.readdirSync(path.join(directory, 'backups'))[0];
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'backups', backup))).pages[0].title, '初稿');
  assert.ok(!fs.existsSync(path.join(directory, 'workspace.json.tmp')));
});

test('local assets survive a fresh storage instance and traversal is rejected', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-assets-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  const url = storage.saveAsset('图片.png', Buffer.from('image contents'));
  assert.equal(fs.readFileSync(new Storage(directory).assetPath(url), 'utf8'), 'image contents');
  assert.throws(() => storage.assetPath('asset://local/%2Fetc%2Fpasswd'));
  assert.throws(() => storage.assetPath('https://local/example.png'));
});

test('corrupt files and invalid imports are rejected without replacing data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-corrupt-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  storage.save(workspace());
  assert.throws(() => storage.save({ version: 8 }));
  assert.equal(storage.load().pages[0].title, '初稿');
  const invalid = workspace();
  invalid.pages[0].parentId = 'a';
  assert.throws(() => validateWorkspace(invalid));
  fs.writeFileSync(storage.file, 'corrupted');
  assert.throws(() => storage.load());
  assert.equal(fs.readFileSync(storage.file, 'utf8'), 'corrupted');
});

test('space files live under a per-page directory and reject traversal', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-space-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  const saved = storage.saveSpaceFile('page-1', 'folder-1', 'note.txt', Buffer.from('hello'));
  assert.ok(saved.path.includes(path.join('spaces', 'page-1', 'folder-1')));
  assert.equal(path.basename(path.dirname(saved.path)), 'folder-1');
  assert.equal(fs.readFileSync(saved.path, 'utf8'), 'hello');

  assert.throws(() => storage.spaceRoot('../escape'), /无效/);
  assert.throws(() => storage.spaceDirectory('page-1', '../../etc'), /无效/);
  assert.throws(() => storage.spaceDirectory('page-1', 'a/b'), /无效/);
  assert.throws(() => storage.spaceDirectory('a/../b', null), /无效/);
  assert.throws(() => storage.agentLogFile('../x'), /无效/);
});

test('space files keep a sanitized display name separate from the physical name', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-space-name-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  const saved = storage.saveSpaceFile('p', null, '../../evil.sh', Buffer.from('x'));
  assert.ok(!saved.filename.includes('..'));
  assert.ok(!saved.filename.includes('/'));
  assert.equal(path.basename(saved.path), saved.filename);
});

test('agent logs append and read back, tolerating a truncated tail', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-agent-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  storage.appendAgentLog('p1', [{ id: 'm1', role: 'user', kind: 'text', at: 1 }]);
  storage.appendAgentLog('p1', [{ id: 'm2', role: 'agent', kind: 'text', at: 2 }]);
  fs.appendFileSync(storage.agentLogFile('p1'), '{"broken":');
  const messages = storage.readAgentLog('p1');
  assert.deepEqual(
    messages.map((message) => message.id),
    ['m1', 'm2'],
  );
  storage.removeAgentLog('p1');
  assert.deepEqual(storage.readAgentLog('p1'), []);
});

test('removing a space deletes only its own directory', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-space-remove-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new Storage(directory);
  storage.saveSpaceFile('keep', null, 'a.txt', Buffer.from('a'));
  storage.saveSpaceFile('drop', null, 'b.txt', Buffer.from('b'));
  storage.removeSpace('drop');
  assert.ok(!fs.existsSync(path.join(directory, 'spaces', 'drop')));
  assert.ok(fs.existsSync(path.join(directory, 'spaces', 'keep')));
});
