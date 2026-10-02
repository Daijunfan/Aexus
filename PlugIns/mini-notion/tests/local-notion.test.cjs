const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const exec = promisify(execFile);

test('offline icons, images and block actions survive real CLI writes and a folder service restart', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-local-')));
  const client = new BackendClient({ workspace: root, autoStart: false });
  let server = await startServer(client.directory, root);
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const call = client.call.bind(client);
  const cli = async (...args) =>
    JSON.parse(
      (
        await exec(process.execPath, [path.resolve('dist-cli/cli.cjs'), '--workspace', root, ...args], {
          maxBuffer: 8e6,
        })
      ).stdout,
    );
  const schema = await cli('schema', 'page.create');
  assert.equal(schema.icons.names.length, 1703);
  assert.ok(schema.icons.names.includes('BookOpen'));
  const glyphs = require('lucide-react').icons;
  assert.ok(schema.icons.names.every(name => glyphs[name]), 'every catalog symbol has a bundled renderer');
  const emojis = require('../src/core/emojis.json');
  assert.equal(emojis.length, 3781);
  assert.equal(new Set(emojis.map(item => item[0])).size, emojis.length);
  assert.equal(Object.keys(schema.icons.colors).length, 10);
  const page = await cli(
    'page',
    'create',
    '--title',
    '图标验收',
    '--color',
    'white',
    '--icon',
    'icon:BookOpen:blue',
  );
  for (const color of Object.keys(schema.icons.colors)) {
    await cli('page', 'update', page.id, '--icon', `icon:BookOpen:${color}`);
    assert.equal((await call('page.get', { pageId: page.id })).icon, `icon:BookOpen:${color}`);
  }
  for (const icon of ['icon:Missing:blue', 'icon:BookOpen:ultraviolet', 'icon:BookOpen', null]) {
    await assert.rejects(call('page.update', { pageId: page.id, changes: { icon } }), {
      code: 'INVALID_ICON',
    });
    assert.equal((await call('page.get', { pageId: page.id })).icon, 'icon:BookOpen:red');
  }
  const image = await call('fs.asset-upload', {
    name: 'icon.svg',
    contentBase64: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#337ea9"/></svg>',
    ).toString('base64'),
  });
  await cli('page', 'update', page.id, '--icon', image);
  const copy = await call('page.duplicate', { pageId: page.id });
  assert.equal(copy.icon, image);
  const [block] = await call('block.append', {
    pageId: page.id,
    type: 'callout',
    text: '有颜色的提示',
    props: { emoji: 'icon:Lightbulb:yellow', backgroundColor: 'yellow' },
  });
  const duplicate = await call('block.duplicate', { pageId: page.id, blockId: block.id });
  assert.notEqual(duplicate.id, block.id);
  const updated = await call('block.update', {
    pageId: page.id,
    blockId: duplicate.id,
    type: 'heading',
    props: { level: 2 },
  });
  assert.equal(updated.content, block.content);
  assert.equal(updated.props.level, 2);
  await call('block.move', { pageId: page.id, blockId: duplicate.id, targetPageId: copy.id });
  assert.ok((await call('block.list', { pageId: copy.id })).some((b) => b.id === duplicate.id));
  assert.ok(!(await call('block.list', { pageId: page.id })).some((b) => b.id === duplicate.id));
  await call('page.update', { pageId: copy.id, icon: '👩🏽‍💻' });
  await server.close();
  server = await startServer(client.directory, root);
  assert.equal((await cli('page', 'get', page.id)).icon, image);
  assert.equal((await cli('page', 'get', copy.id)).icon, '👩🏽‍💻');
  assert.equal(
    (await call('block.get', { pageId: page.id, blockId: block.id })).props.emoji,
    'icon:Lightbulb:yellow',
  );
  await cli('page', 'update', page.id, '--icon', '');
  assert.equal((await cli('page', 'get', page.id)).icon, '');
  const location = await call('fs.path', { pageId: page.id });
  assert.equal(location.directory, '图标验收');
  const raw = JSON.parse(fs.readFileSync(location.absolutePath));
  assert.equal(raw.page.icon, '');
});
