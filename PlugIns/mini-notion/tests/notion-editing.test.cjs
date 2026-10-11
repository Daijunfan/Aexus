const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const run = require('node:util').promisify(require('node:child_process').execFile);
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-editing-')));
  const client = new BackendClient({ workspace: root, autoStart: false });
  const server = await startServer(client.directory, root);
  t.after(async () => {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const call = client.call.bind(client);
  call.cli = async (...args) =>
    JSON.parse(
      (
        await run(process.execPath, [path.resolve('dist-cli/cli.cjs'), '--workspace', root, ...args], {
          maxBuffer: 8e6,
        })
      ).stdout,
    );
  return call;
}
test('multi-block duplicate and move preserve order, nesting, comments and atomic failure', async (t) => {
  const call = await fixture(t);
  await assert.rejects(call('page.create', { title: 'Missing color' }), { code: 'PAGE_COLOR_REQUIRED' });
  const page = await call('page.create', {
    color: 'white',
    title: 'Source',
    blocks: [
      {
        id: 'a',
        type: 'paragraph',
        content: 'A',
        children: [{ id: 'child', type: 'paragraph', content: 'Child' }],
      },
      { id: 'b', type: 'paragraph', content: 'B' },
      { id: 'c', type: 'paragraph', content: 'C' },
    ],
  });
  const copies = await call.cli('block', 'duplicate', page.id, 'a', '--ids', 'b,child,a');
  assert.equal(copies.length, 2);
  assert.equal(copies[0].content, 'A');
  assert.equal(copies[1].content, 'B');
  assert.notEqual(copies[0].children[0].id, 'child');
  assert.deepEqual(
    (await call('block.list', { pageId: page.id })).map((block) => block.content),
    ['A', 'B', 'A', 'B', 'C'],
  );
  await call('block.update', {
    pageId: page.id,
    blockId: copies[0].id,
    ids: copies.map((block) => block.id),
    props: { textColor: 'red' },
  });
  assert.equal((await call('block.get', { pageId: page.id, blockId: copies[1].id })).props.textColor, 'red');
  const before = await call('page.get', { pageId: page.id });
  await assert.rejects(
    call('block.update', { pageId: page.id, blockId: 'a', ids: ['a', 'missing'], text: 'Wrong' }),
  );
  assert.deepEqual((await call('page.get', { pageId: page.id })).blocks, before.blocks);
  await assert.rejects(
    call('block.move', { pageId: page.id, blockId: 'a', ids: ['a', 'b'], afterId: 'child' }),
  );
  const destination = await call('page.create', { title: 'Destination', color: 'white' });
  const discussion = await call('comment.add', {
    pageId: page.id,
    blockId: 'child',
    text: 'Keep this discussion',
  });
  await call.cli('block', 'move', page.id, 'a', '--ids', 'b,a,child', '--target-page-id', destination.id);
  assert.ok(
    (await call('comment.list', { pageId: destination.id })).some((thread) => thread.id === discussion.id),
  );
  assert.ok(!(await call('comment.list', { pageId: page.id })).some((thread) => thread.id === discussion.id));
  const moved = (await call('block.list', { pageId: destination.id })).slice(-2);
  assert.deepEqual(
    moved.map((block) => block.id),
    ['a', 'b'],
  );
  assert.equal(moved[0].children[0].id, 'child');
  assert.equal(
    (await call('block.get', { pageId: destination.id, blockId: 'a' })).url,
    `mininotion://page/${destination.id}#a`,
  );
});
test('search shares exact phrases, title-only, subtree, dates, ordering and match excerpts', async (t) => {
  const call = await fixture(t);
  const root = await call('page.create', { title: 'Projects', color: 'white' });
  const content = await call('page.create', {
    parentId: root.id,
    title: 'Reading',
    color: 'white',
    blocks: [
      { id: 'intro', type: 'paragraph', content: 'filler '.repeat(100) },
      { id: 'match', type: 'paragraph', content: 'A local first workspace with a precise match' },
    ],
  });
  const title = await call('page.create', { title: 'local first', color: 'white' });
  await call('page.create', { title: 'local other first', color: 'white' });
  const matches = await call.cli('search', '"local first"');
  assert.deepEqual(
    matches.map((page) => page.id),
    [title.id, content.id],
  );
  assert.equal(matches[1].blockId, 'match');
  assert.match(matches[1].excerpt, /local first/);
  assert.deepEqual(
    (await call.cli('search', '"local first"', '--title-only')).map((page) => page.id),
    [title.id],
  );
  assert.deepEqual(
    (await call('search', { query: 'local', inPageId: root.id })).map((page) => page.id),
    [content.id],
  );
  assert.equal((await call('search', { query: 'local', before: '2000-01-01' })).length, 0);
  await assert.rejects(call('search', { query: 'local', sort: 'random' }));
  await assert.rejects(call('search', { query: 'local', after: 'invalid' }));
  const older = await call('search', { query: 'local', sort: 'created-asc' });
  assert.equal(older[0].id, content.id);
});
test('LaTeX blocks and inline equations are stored and searchable using the existing block API', async (t) => {
  const call = await fixture(t);
  const page = await call('page.create', {
    color: 'white',
    blocks: [
      { type: 'equation', props: { expression: 'E = mc^2' } },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Inline ', styles: {} },
          { type: 'inlineMath', props: { expression: 'x^2 + y^2' } },
        ],
      },
    ],
  });
  assert.equal((await call('search', { query: 'mc^2' }))[0].id, page.id);
  assert.equal((await call('search', { query: 'x^2' }))[0].id, page.id);
  const [equation] = await call('block.list', { pageId: page.id });
  await call('block.update', {
    pageId: page.id,
    blockId: equation.id,
    props: { expression: '\\frac{a}{b}' },
  });
  assert.equal(
    (await call('block.get', { pageId: page.id, blockId: equation.id })).props.expression,
    '\\frac{a}{b}',
  );
  await assert.rejects(
    call('block.update', { pageId: page.id, blockId: equation.id, props: { expression: 42 } }),
    { code: 'INVALID_EQUATION' },
  );
});

test('bookmarks, breadcrumbs and page tabs use serializable CLI state', async (t) => {
  const call = await fixture(t);
  const page = await call('page.create', {
    title: 'References',
    color: 'white',
    blocks: [{ type: 'breadcrumb' }],
  });
  const [bookmark] = await call.cli(
    'block',
    'append',
    page.id,
    '--type',
    'bookmark',
    '--props',
    JSON.stringify({
      url: 'https://example.com',
      title: 'Saved reference',
      description: 'Searchable annotation',
    }),
  );
  assert.equal((await call('search', { query: 'annotation' }))[0].blockId, bookmark.id);
  await assert.rejects(
    call('block.update', { pageId: page.id, blockId: bookmark.id, props: { url: 'javascript:alert(1)' } }),
    { code: 'INVALID_BOOKMARK' },
  );
  await call.cli('settings', 'set', '--changes', JSON.stringify({ pageTabs: [page.id, null], activeTab: 1 }));
  assert.deepEqual((await call('settings.get')).pageTabs, [page.id, null]);
  await assert.rejects(call('settings.set', { changes: { activeTab: 9 } }), { code: 'INVALID_SETTINGS' });
});
