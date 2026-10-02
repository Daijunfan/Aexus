'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const { create, expect } = require('./ui-session.cjs');
(async () => {
  const f = await create('backup-stream-ui'); let error;
  try {
    const { page, api } = f;
    await api('fs.write', { path: 'source.md', content: '# 本地恢复测试\n\n完整原文。' });
    const doc = await api('document.open', { path: 'source.md', activate: false });
    let set = await api('study.create', { title: 'UI backup study' });
    set = await api('study.documents.add', { setId: set.id, expectedRevision: set.revision, paths: ['source.md'] });
    set = await api('study.note.create', { setId: set.id, expectedRevision: set.revision, title: 'Durable UI note', text: 'Saved before backup.' });
    await page.goto(f.server.url); await page.locator('body[data-ready=true]').waitFor();
    const open = async action => { await page.locator('#library-backups').click(); await page.locator('#backup-' + action).click(); await page.locator('#dialog [name=path]').fill('ui-encrypted.mrbackup'); await page.locator('#dialog [name=password]').fill('GUI local archive password'); };
    await open('create'); await expect(page.locator('#dialog [name=format]')).toHaveValue('segmented');
    const before = await fs.readFile(path.join(f.workspace, '.margin-reader/state.json'));
    await page.locator('#backup-plan').click(); await expect(page.locator('#backup-plan-status')).toContainText('预计新增');
    assert.deepEqual(await fs.readFile(path.join(f.workspace, '.margin-reader/state.json')), before);
    f.pass('The backup dialog defaults to chunked mode and displays a read-only disk-space estimate');
    await page.locator('#dialog-submit').click(); await expect(page.locator('#dialog')).toBeHidden();
    assert((await fs.stat(path.join(f.workspace, 'ui-encrypted.mrbackup'))).isDirectory());
    await open('inspect'); await page.locator('#dialog-submit').click(); await expect(page.locator('#dialog')).toBeHidden();
    f.pass('An encrypted directory backup is created and fully verified through the same public API');
    await open('restore'); await page.locator('#dialog [name=folder]').fill('UI-restored'); await page.locator('#dialog-submit').click(); await expect(page.locator('#dialog')).toBeHidden();
    const restored = JSON.parse(await fs.readFile(path.join(f.workspace, 'UI-restored/.margin-reader/state.json')));
    assert.equal(restored.studySets[set.id].cards[0].title, 'Durable UI note'); assert.equal(restored.documents[doc.id].id, doc.id);
    assert.deepEqual(await fs.readFile(path.join(f.workspace, 'UI-restored/source.md')), await fs.readFile(path.join(f.workspace, 'source.md')));
    assert.equal((await api('study.get', { setId: set.id })).revision, set.revision);
    f.pass('UI restoration uses a new directory, preserves stable content identities and leaves the active library unchanged');
    await page.screenshot({ path: path.join(f.output, 'restored-library.png') });
  } catch (e) { error = e; }
  await f.finish(error);
})().catch(e => { console.error(e); process.exitCode = 1; });
