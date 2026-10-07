'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const root = path.resolve(__dirname, '..'), host = path.resolve(root, '../..');
async function main() {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'margin-reader-host-')));
  const home = path.join(temp, 'home'), workspaces = path.join(temp, 'workspaces');
  const env = { ...process.env, AGENTS_COMPANY_HOME: home, AGENTS_COMPANY_WORKSPACES: workspaces, AGENTS_COMPANY_BUILTIN_PLUGINS: path.join(temp, 'empty-builtins') };
  for (const key of ['AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_DIRS']) delete env[key];
  const daemon = spawn(process.execPath, ['bin/agents','serve'], { cwd: host, env, stdio: ['ignore','pipe','pipe'] });
  const done = new Promise(resolve => daemon.once('exit', resolve)); let log = '';
  daemon.stdout.on('data', data => { log += data; }); daemon.stderr.on('data', data => { log += data; });
  const results = [], pass = label => { results.push(label); console.log('PASS ' + label); };
  const cli = async (...args) => { const process = await run(require('node:process').execPath, ['bin/agents', ...args, '--json'], { cwd: host, env, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }); const reply = JSON.parse(process.stdout); assert(reply.ok, reply.error); return reply.data; };
  const call = (method, params = {}, team = 'Reader Test') => cli('plugin','call','margin-reader',method,'--team',team,'--params',JSON.stringify(params));
  try {
    for (let i = 0; i < 200 && !fs.existsSync(path.join(home, 'agents.sock')); i++) {
      if (daemon.exitCode !== null) throw new Error('Isolated host stopped: ' + log);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(fs.existsSync(path.join(home, 'agents.sock')), log);
    const installed = await cli('plugin','install',path.join(root, 'dist-plugin')); assert.equal(installed.plugin.id, 'margin-reader'); pass('standard host plugin.install accepts the independent package');
    const described = await cli('plugin','describe','margin-reader'); assert.equal(described.api.commands.length, require('../schema.json').commands.length); pass('host discovers every declared API command');
    await cli('group','add','Reader Test','--mode','work','--plugin','margin-reader');
    await cli('group','add','Reader Other','--mode','work','--plugin','margin-reader');
    await call('fs.mkdir', { path: 'Books' });
    await call('fs.write', { path: 'Books/host.md', content: '# Host Reader\n\nShared Core through host CLI.\n\n## Second chapter\n\nJump here.' });
    const doc = await call('document.open', { path: 'Books/host.md' }); assert.equal(doc.toc.length, 2); pass('Work Team host CLI creates and reads documents without a window');
    const edited = await call('toc.add', { id: doc.id, expectedRevision: doc.revision, title: 'Host chapter', locator: { section: 0 } }); assert.equal(edited.toc.length, 3); pass('host CLI executes editable outline operations');
    assert.equal((await call('fs.list', {}, 'Reader Other')).entries.length, 0); pass('different Teams receive isolated document libraries');
    await assert.rejects(call('fs.write', { path: '../escape.md', content: 'blocked' })); pass('host route preserves plugin workspace boundaries');
    const view = await cli('plugin','view','margin-reader','--team','Reader Test'), base = new URL('.', view.url);
    assert((await fetch(view.url).then(r => r.text())).includes('Margin Reader')); pass('host serves the plugin renderer without changing host source');
    const response = await fetch(new URL('rpc', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 22, method: 'document.content', params: { id: doc.id } }) }).then(r => r.json());
    assert.match(response.result.text, /Shared Core/); pass('host renderer RPC reads the same CLI-managed document');
    const asset = await fetch(new URL(`data/original/${doc.id}`, base)).then(r => r.text()); assert.match(asset, /Host Reader/); pass('host scoped original-document asset route works');
    assert.equal((await fetch(new URL('/rpc', view.url))).status, 404); pass('unguarded host HTTP root has no plugin API');
    await cli('plugin','close',view.id); await assert.rejects(fetch(view.url)); pass('closing a host view releases its HTTP listener');
    let study = await call('study.create', {mapMode:'cards', title: 'Offline workbench' });
    const change = async (method, params = {}) => study = await call(method, { setId: study.id, expectedRevision: study.revision, ...params });
    await change('study.note.create', { title: 'Question', text: 'Answer', tags: ['CLI'] }); const cardId = study.cards[0].id;
    await change('study.review.configure', { cardId, enabled: true });
    assert.equal((await call('study.review.queue', { setId: study.id })).due, 1);
    await change('study.review.grade', { cardId, rating: 'easy' }); assert.equal(study.cards[0].review.schedule.reps, 1);
    await change('study.undo'); assert.equal(study.cards[0].review.schedule.reps, 0);
    assert.equal((await call('study.cards.query', { setId: study.id, tag: 'CLI' })).cards.length, 1);
    pass('host CLI creates note cards, searches tags, schedules FSRS reviews and undoes ratings without a window');
    const mark = await call('bookmark.add', { id: doc.id, expectedRevision: edited.revision, title: 'Saved position', locator: { section: 0 } });
    assert.equal(mark.bookmarks.length, 1); pass('host CLI persists document bookmarks through the declared plugin contract');
    const notebook = await call('pdf.compose', { path: 'Notebook.pdf', pages: [{ blank: true, paper: 'grid' }, { blank: true }] });
    assert.equal(notebook.pageCount, 2); await change('study.documents.add', { paths: ['Notebook.pdf'] });
    await change('study.layer.create', { title: 'CLI layer' });
    await change('study.ink.add', { documentId: notebook.id, expectedSourceVersion: notebook.sourceVersion, page: 1, points: [[0.1, 0.2, 0.4], [0.3, 0.4, 0.9]], color: 'blue', width: 0.004 });
    assert.equal(study.ink[0].layerId, study.activeLayer);
    await call('reader.comparison.set', { documentId: notebook.id, locator: { page: 2 } });
    assert.equal((await call('reader.position.get', { id: notebook.id })).locator.page, 1);
    await call('document.fold', { id: notebook.id, expectedRevision: notebook.revision, pages: [1] });
    assert.deepEqual((await call('document.get', { id: notebook.id })).foldedPages, [1]);
    pass('host CLI creates grid notebooks, pressure handwriting layers, independent comparison positions and reversible page folds');
    const info = await call('system.info'); assert(info.workspace.startsWith(temp + path.sep));
    const reference=await require('./host-plugin-bootstrap.cjs').reference({cli,workspace:info.workspace,scope:['--team','Reader Test'],home});
    assert(reference.guide.includes('study.card.create'));assert.equal(reference.schema.commands.length,require('../schema.json').commands.length);pass('host provisions complete standard CLI documentation through its declared current bootstrap layout');
    await fsp.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await fsp.writeFile(path.join(root, 'artifacts/host-test-results.json'), JSON.stringify({ passed: results.length, results, modelCalls: 0 }, null, 2));
    console.log(`HOST PASS=${results.length} FAIL=0; no model calls or visible windows`);
  } catch (error) { console.error(log); throw error; }
  finally {
    daemon.kill('SIGTERM');
    const force = setTimeout(() => daemon.kill('SIGKILL'), 5000); force.unref();
    await done; clearTimeout(force); await fsp.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
