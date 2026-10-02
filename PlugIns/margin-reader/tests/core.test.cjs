'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { setup, pdfFixture, docxFixture, epubFixture } = require('./fixtures.cjs');
const { createPlugin } = require('../runtime.cjs');
const { publicAddress } = require('../lib/network.cjs');
const { digest } = require('../lib/safety.cjs');

test('headless CRUD, text search, stable IDs, trash and restore', async t => {
  const { api, error, workspace } = await setup(t);
  await api('fs.mkdir', { path: '资料/项目' });
  const created = await api('fs.write', { path: '资料/项目/hello.md', content: '# 标题\n\nHello world\n\n## 章节二\n\n第二段 Hello\n' });
  const tree = await api('fs.tree'); assert.equal(tree.entries[0].children[0].children[0].name, 'hello.md');
  const doc = await api('document.open', { path: created.path }); assert.equal(doc.toc.length, 2); assert.equal(doc.toc[1].parentId, doc.toc[0].id);
  const content = await api('document.content', { id: doc.id }); assert.match(content.text, /Hello world/);
  const search = await api('document.search', { id: doc.id, query: 'hello' }); assert.equal(search.matches.length, 2);
  await api('reader.position.set', { id: doc.id, locator: search.matches[1].locator });
  await error('fs.write', { path: created.path, content: 'unsafe overwrite' }, 'CONFLICT');
  await api('fs.move', { path: '资料/项目', target: '资料/renamed' });
  const moved = await api('document.open', { path: '资料/renamed/hello.md' }); assert.equal(moved.id, doc.id);
  const copy = await api('fs.copy', { path: moved.path, target: '资料/copy.md' }); assert.notEqual((await api('document.open', { path: copy.path })).id, doc.id);
  await error('fs.copy', { path: moved.path, target: copy.path }, 'ALREADY_EXISTS');
  const trash = await api('fs.trash', { path: '资料/renamed' }); assert.equal((await api('fs.trash.list')).items.length, 1);
  await error('document.get', { id: doc.id }, 'NOT_FOUND'); await api('fs.restore', { trashId: trash.trashId });
  assert.equal((await api('document.open', { path: moved.path })).id, doc.id);
  await api('document.export', { id: doc.id, path: '资料/export.html', format: 'html' }); assert.match(await fs.readFile(path.join(workspace, '资料/export.html'), 'utf8'), /Hello world/);
});

test('outline CRUD, hierarchy, cycle prevention, promotion, jump and conflicts', async t => {
  const { api, error } = await setup(t);
  await api('fs.write', { path: 'outline.md', content: '# Root\n\n## Child\n\n# Another\n\nText' });
  let doc = await api('document.open', { path: 'outline.md' }); const id = doc.id;
  let out = await api('toc.add', { id, expectedRevision: doc.revision, title: '自建章节', locator: { section: 0 } });
  const custom = out.toc.at(-1).id;
  await error('toc.update', { id, expectedRevision: doc.revision, nodeId: custom, title: 'stale' }, 'CONFLICT');
  out = await api('toc.indent', { id, expectedRevision: out.revision, nodeId: custom }); assert.equal(out.toc.at(-1).parentId, 'original-3');
  out = await api('toc.outdent', { id, expectedRevision: out.revision, nodeId: custom }); assert.equal(out.toc.at(-1).parentId, null);
  await error('toc.move', { id, expectedRevision: out.revision, nodeId: 'original-1', parentId: 'original-2' }, 'INVALID_OUTLINE');
  await error('toc.update', { id, expectedRevision: out.revision, nodeId: custom, locator: { section: 999 } }, 'INVALID_LOCATOR');
  out = await api('toc.update', { id, expectedRevision: out.revision, nodeId: custom, title: 'Edited', locator: { section: 0, anchor: 'mr-heading-2' } });
  await api('reader.position.set', { id, locator: out.toc.find(n => n.id === custom).locator });
  assert.equal((await api('reader.position.get', { id })).locator.anchor, 'mr-heading-2');
  out = await api('toc.remove', { id, expectedRevision: out.revision, nodeId: 'original-1' }); assert.equal(out.toc.find(n => n.id === 'original-2').parentId, null);
  out = await api('toc.reset', { id, expectedRevision: out.revision }); assert.equal(out.toc.length, 3);
});

test('concurrent runtimes serialize updates and reject stale outline revisions', async t => {
  const { api, workspace } = await setup(t);
  await api('fs.write', { path: 'concurrent.md', content: '# One' }); const doc = await api('document.open', { path: 'concurrent.md' });
  const other = await createPlugin({ workspace }); t.after(() => other.close());
  const params = { id: doc.id, expectedRevision: doc.revision, title: 'One writer', locator: { section: 0 } };
  const replies = await Promise.all([other.request({ jsonrpc: '2.0', id: 2, method: 'toc.add', params }), other.request({ jsonrpc: '2.0', id: 3, method: 'toc.add', params: { ...params, title: 'Other writer' } })]);
  assert.equal(replies.filter(r => r.result).length, 1); assert.equal(replies.find(r => r.error).error.data.code, 'CONFLICT');
  assert.equal((await api('toc.list', { id: doc.id })).toc.length, 2);
});

test('scope protection rejects traversal, symlinks, hardlinks and protected metadata', async t => {
  const { api, error, runtime, workspace, parent } = await setup(t);
  await fs.writeFile(path.join(parent, 'private.txt'), 'outside'); await fs.symlink(parent, path.join(workspace, 'escape'));
  await error('fs.list', { path: '..' }, 'SCOPE_DENIED'); await error('fs.list', { path: parent }, 'SCOPE_DENIED');
  await error('fs.list', { path: 'escape' }, 'SCOPE_DENIED'); await error('fs.write', { path: '.agents-company/api.md', content: 'x' }, 'SCOPE_DENIED');
  await fs.link(path.join(parent, 'private.txt'), path.join(workspace, 'hard.txt'));
  await error('document.open', { path: 'hard.txt' }, 'SCOPE_DENIED');
  await api('fs.mkdir', { path: 'managed' }); await fs.mkdir(path.join(workspace, 'managed/.agents-company'));
  await error('fs.trash', { path: 'managed' }, 'SCOPE_DENIED');
  await assert.rejects(runtime.readAsset('../private.txt'), e => e.code === 'SCOPE_DENIED');
  assert.equal(await fs.readFile(path.join(parent, 'private.txt'), 'utf8'), 'outside');
});

test('chunked binary import verifies offsets, integrity and duplicate destinations', async t => {
  const { api, error } = await setup(t); const bytes = pdfFixture();
  const upload = await api('import.begin', { path: 'imported.pdf', totalBytes: bytes.length });
  await error('import.chunk', { uploadId: upload.uploadId, offset: 2, contentBase64: 'YQ==' }, 'CONFLICT');
  await api('import.chunk', { uploadId: upload.uploadId, offset: 0, contentBase64: bytes.toString('base64') });
  await error('import.finish', { uploadId: upload.uploadId, sha256: '0'.repeat(64) }, 'CHECKSUM_MISMATCH');
  const doc = await api('import.finish', { uploadId: upload.uploadId, sha256: digest(bytes) });
  assert.equal(doc.kind, 'pdf'); assert.equal(doc.pageCount, 2); assert.equal(doc.toc[1].locator.page, 2);
  assert.match((await api('document.content', { id: doc.id, page: 2 })).text, /offline search/);
  await error('import.begin', { path: 'imported.pdf', totalBytes: 0 }, 'ALREADY_EXISTS');
  await error('reader.position.set', { id: doc.id, locator: { page: 3 } }, 'INVALID_LOCATOR');
});

test('DOCX headings and EPUB3 navigation are parsed without a window', async t => {
  const { api, workspace } = await setup(t);
  await fs.writeFile(path.join(workspace, 'sample.docx'), await docxFixture());
  const doc = await api('document.open', { path: 'sample.docx' }); assert.equal(doc.toc.length, 2); assert.match(doc.toc[0].title, /Word/);
  await fs.writeFile(path.join(workspace, 'sample.epub'), await epubFixture());
  const book = await api('document.open', { path: 'sample.epub' }); assert.equal(book.sectionCount, 2); assert.equal(book.toc[0].title, 'Book opening'); assert.equal(book.toc[2].locator.anchor, 'detail');
  await api('reader.position.set', { id: book.id, locator: book.toc[2].locator });
  const content = await api('document.content', { id: book.id, section: 1 }); assert.ok(!content.html.includes('<script')); assert.match(content.text, /中文内容/);
});

test('EPUB2 NCX original table of contents is preserved', async t => {
  const { api, workspace } = await setup(t); await fs.writeFile(path.join(workspace, 'ncx.epub'), await epubFixture(true));
  const doc = await api('document.open', { path: 'ncx.epub' }); assert.equal(doc.toc[0].title, 'NCX opening'); assert.equal(doc.toc[1].locator.section, 1);
});

test('legacy DOC is genuinely read through the bundled parser on macOS', { skip: process.platform !== 'darwin' }, async t => {
  const { api, workspace } = await setup(t);
  const bytes = require('node:child_process').execFileSync('/usr/bin/textutil', ['-convert','doc','-format','txt','-stdin','-stdout'], { input: 'Legacy DOC searchable text.\n第二段中文。' });
  await fs.writeFile(path.join(workspace, 'legacy.doc'), bytes); const doc = await api('document.open', { path: 'legacy.doc' });
  assert.match((await api('document.content', { id: doc.id })).text, /Legacy DOC searchable text/); assert.match(doc.warnings.join(' '), /Legacy DOC/);
});

test('unsafe HTML is inert; external source edits invalidate caches without deleting custom outline', async t => {
  const { api, error, workspace } = await setup(t);
  await api('fs.write', { path: 'article.html', content: '<h1 id="top">Title</h1><script>process.exit()</script><iframe src="http://localhost"></iframe><p onclick="bad()">Safe text</p><img src="https://invalid.example/image.png"><a href="javascript:alert(1)">Bad link</a>' });
  const doc = await api('document.open', { path: 'article.html' }); const body = await api('document.content', { id: doc.id });
  assert.ok(!/script|iframe|onclick|javascript:|https:\/\/invalid/.test(body.html));
  await api('toc.add', { id: doc.id, expectedRevision: doc.revision, title: 'Custom', locator: { section: 0, anchor: 'top' } });
  await fs.writeFile(path.join(workspace, 'article.html'), '<h1 id="new">Changed</h1><p>new content</p>');
  await error('document.content', { id: doc.id }, 'SOURCE_CHANGED');
  const reopened = await api('document.open', { path: 'article.html' }); assert.equal(reopened.id, doc.id); assert.equal(reopened.toc.at(-1).title, 'Custom'); assert.equal(reopened.toc.at(-1).unresolved, true);
});

test('strict schema, JSON-RPC and useful failure codes', async t => {
  const { error, runtime } = await setup(t);
  await error('private.write', {}, 'METHOD_NOT_FOUND'); await error('fs.mkdir', {}, 'INVALID_PARAMS'); await error('fs.mkdir', { path: 'okay', injected: true }, 'INVALID_PARAMS');
  await error('settings.set', { fontSize: 100 }, 'INVALID_PARAMS'); await error('settings.set', { theme: 'unknown' }, 'INVALID_PARAMS');
  assert.equal((await runtime.request({ id: null, method: 'system.info' })).error.code, -32600);
  await error('web.import', { url: 'http://127.0.0.1/private' }, 'URL_BLOCKED');
  for (const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','0.0.0.0']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('8.8.8.8'), true);
});

test('standalone CLI really creates, reads, modifies and returns nonzero on errors', async t => {
  const { workspace } = await setup(t); const cli = path.resolve(__dirname, '../cli.cjs');
  const env = { ...process.env }; delete env.AGENTS_WORKSPACE; delete env.AGENTS_COMPANY_PLUGIN_RPC; delete env.AGENTS_COMPANY_TOKEN; delete env.AGENTS_COMPANY_TOKEN_FILE;
  const invoke = async (...args) => JSON.parse((await execFile(process.execPath, [cli, '--workspace', workspace, ...args], { env })).stdout);
  assert.equal((await invoke('api','fs.write','--data', JSON.stringify({ path: 'CLI 中文.md', content: '# CLI Title\n\nCLI body' }))).result.path, 'CLI 中文.md');
  const doc = (await invoke('open','CLI 中文.md')).result;
  const added = await invoke('api','toc.add','--data', JSON.stringify({ id: doc.id, expectedRevision: doc.revision, title: 'CLI added', locator: { section: 0 } })); assert.equal(added.result.toc.length, 2);
  assert.match((await invoke('read', doc.id)).result.text, /CLI body/);
  await assert.rejects(execFile(process.execPath, [cli, '--workspace', workspace, 'api','unknown.method'], { env }), e => e.code === 1 && JSON.parse(e.stdout).error.code === -32601);
});
