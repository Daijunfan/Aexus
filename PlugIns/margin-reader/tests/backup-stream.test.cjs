'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { setup, pdfFixture } = require('./fixtures.cjs');
const S = require('../lib/safety.cjs');
const Format = require('../lib/backup-stream-format.cjs');
async function fixture(t) {
  const f = await setup(t); await fs.writeFile(path.join(f.workspace, 'source.pdf'), pdfFixture());
  let set = await f.api('study.create', { title: 'Segmented backup notes' });
  set = await f.api('study.documents.add', { setId: set.id, expectedRevision: set.revision, paths: ['source.pdf'] });
  const doc = await f.api('document.open', { path: 'source.pdf', activate: false });
  const saved = await f.api('study.card.create', { setId: set.id, expectedRevision: set.revision, documentId: doc.id,
    expectedSourceVersion: doc.sourceVersion, captureId: crypto.randomUUID(), title: 'Durable highlight', text: '', color: 'blue',
    locator: { page: 2 }, selection: { rects: [{ page: 2, x: .1, y: .1, width: .5, height: .15 }] } });
  return { ...f, setId: set.id, doc, cardId: saved.card.id };
}
const options = { path: 'portable.mrbackup', format: 'segmented' };
async function reopened(t, folder) {
  const runtime = await require('../runtime.cjs').createPlugin({ workspace: folder }); t.after(() => runtime.close());
  return async (method, params = {}) => { const r = await runtime.request({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }); assert(!r.error, JSON.stringify(r.error)); return r.result; };
}
async function editManifest(workspace, change) {
  const dir = path.join(workspace, options.path), header = JSON.parse(await fs.readFile(path.join(dir, 'header.json')));
  const m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.bin'))); change(m);
  const raw = Buffer.from(JSON.stringify(m)); header.manifestSha256 = S.digest(raw);
  await fs.writeFile(path.join(dir, 'manifest.bin'), raw); await fs.writeFile(path.join(dir, 'header.json'), JSON.stringify(header));
}
test('segmented backup preflight is read-only and encrypted restoration preserves source IDs, PNGs, versions, trash and empty folders', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.workspace, 'Empty'));
  await fs.mkdir(path.join(f.workspace, '.agents-company'), { recursive: true }); await fs.writeFile(path.join(f.workspace, '.agents-company/token'), 'SECRET_NEVER_COPIED');
  await f.api('fs.write', { path: 'removed.md', content: 'Recoverable text' }); await f.api('fs.trash', { path: 'removed.md' });
  let set = await f.api('study.get', { setId: f.setId }); await f.api('study.versions.create', { setId: set.id, expectedRevision: set.revision, title: 'Before backup' });
  const stateFile = path.join(f.workspace, '.margin-reader/state.json'), before = await fs.readFile(stateFile);
  const plan = await f.api('library.backup.plan', { path: options.path }); assert(plan.files > 2 && plan.sufficientSpace); assert.equal(plan.chunkBytes, 4194304);
  assert.deepEqual(await fs.readFile(stateFile), before);
  const password = 'local encrypted archive passphrase'; const result = await f.api('library.backup.create', { ...options, password });
  assert(result.encrypted && result.container === 'directory'); assert((await fs.stat(path.join(f.workspace, options.path))).isDirectory());
  const info = await f.api('library.backup.inspect', { path: options.path, password }); assert.equal(info.studies[0].id, f.setId);
  await f.error('library.backup.inspect', { path: options.path, password: 'wrong' }, 'PASSWORD_REQUIRED');
  await f.error('library.backup.inspect', { path: options.path }, 'PASSWORD_REQUIRED');
  const settings = await f.api('settings.get');
  await f.api('library.backup.restore', { path: options.path, password, folder: 'Recovered' }); assert.deepEqual(await f.api('settings.get'), settings);
  const call = await reopened(t, path.join(f.workspace, 'Recovered'));
  const restored = await call('study.get', { setId: f.setId }); assert.equal(restored.cards[0].sourceChanged, false);
  assert.equal((await call('study.versions.list', { setId: f.setId })).total, 1); assert.equal((await call('fs.trash.list')).items.length, 1);
  assert.deepEqual(await call('study.card.image', { setId: f.setId, cardId: f.cardId }), await f.api('study.card.image', { setId: f.setId, cardId: f.cardId }));
  assert((await fs.stat(path.join(f.workspace, 'Recovered/Empty'))).isDirectory()); assert.equal(await S.exists(path.join(f.workspace, 'Recovered/.agents-company')), null);
  assert.equal(await S.exists(path.join(f.workspace, 'Recovered/.margin-reader/backup-staging')), null);
  assert.deepEqual(await fs.readFile(path.join(f.workspace, 'source.pdf')), pdfFixture());
});
test('a file larger than the old entire-backup limit streams and restores with identical SHA-256', async t => {
  const f = await setup(t), file = path.join(f.workspace, 'large.bin'), handle = await fs.open(file, 'wx');
  const length = 260 * 1024 * 1024 + 19;
  try { await handle.truncate(length); await handle.write(Buffer.from('tail of file'), 0, 12, length - 12); } finally { await handle.close(); }
  const plan = await f.api('library.backup.plan', { path: options.path }); assert.equal(plan.fitsLegacyZip, false); assert.equal(plan.largestFileBytes, length);
  await f.error('library.backup.create', { path: 'legacy.mrbackup' }, 'TOO_LARGE');
  const archive = await f.api('library.backup.create', options); assert(archive.originalBytes > length && archive.chunks < 10);
  await f.api('library.backup.restore', { path: options.path, folder: 'Large-restored' });
  const hash = async p => require('../lib/backup-stream-source.cjs').hashFile(p, { version: S.version(await fs.stat(p)) });
  assert.equal(await hash(file), await hash(path.join(f.workspace, 'Large-restored/large.bin')));
  assert.equal((await fs.stat(path.join(f.workspace, 'Large-restored/large.bin'))).size, length);
});
test('segmented backup refuses unsafe paths, links and existing empty destinations without modifying them', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: '# User document' });
  await f.error('library.backup.plan', { path: '../outside.mrbackup' }, 'SCOPE_DENIED');
  await f.error('library.backup.create', { ...options, password: 'short' }, 'INVALID_PARAMS');
  await fs.symlink(path.join(f.workspace, 'note.md'), path.join(f.workspace, 'alias.md'));
  await f.error('library.backup.create', options, 'SCOPE_DENIED'); await fs.rm(path.join(f.workspace, 'alias.md'));
  await fs.link(path.join(f.workspace, 'note.md'), path.join(f.workspace, 'hardlink.md'));
  await f.error('library.backup.create', options, 'SCOPE_DENIED'); await fs.rm(path.join(f.workspace, 'hardlink.md'));
  await f.api('library.backup.create', options);
  await fs.mkdir(path.join(f.workspace, 'Reserved')); const before = await fs.stat(path.join(f.workspace, 'Reserved'));
  await f.error('library.backup.restore', { path: options.path, folder: 'Reserved' }, 'ALREADY_EXISTS');
  assert.equal((await fs.stat(path.join(f.workspace, 'Reserved'))).ino, before.ino);
  await f.error('library.backup.restore', { path: options.path, folder: options.path + '/Unsafe' }, 'SCOPE_DENIED');
});
test('truncated or corrupt chunks fail inspection and never publish partial restored folders', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: 'Original content' }); await f.api('library.backup.create', options);
  const dir = path.join(f.workspace, options.path), m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.bin')));
  const row = m.files.find(r => r.path === 'note.md'), chunk = path.join(dir, 'chunks', row.segments[0].sha256 + '.bin');
  const original = await fs.readFile(chunk), bad = Buffer.from(original); bad[0] ^= 1; await fs.writeFile(chunk, bad);
  await f.error('library.backup.inspect', { path: options.path }, 'CHECKSUM_MISMATCH');
  await f.error('library.backup.restore', { path: options.path, folder: 'Corrupt-output' }, 'CHECKSUM_MISMATCH');
  assert.equal(await S.exists(path.join(f.workspace, 'Corrupt-output')), null);
  await fs.writeFile(chunk, original.subarray(0, 3)); await f.error('library.backup.inspect', { path: options.path }, 'CHECKSUM_MISMATCH');
  assert.deepEqual(await fs.readdir(path.join(f.workspace, '.margin-reader/backup-staging')), []);
});
test('untrusted segmented manifests reject traversal, path collisions and inconsistent sizes before restore', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: 'Original' }); await f.api('library.backup.create', options);
  const dir = path.join(f.workspace, options.path), bytes = await fs.readFile(path.join(dir, 'manifest.bin')), h = await fs.readFile(path.join(dir, 'header.json'));
  for (const [change, code] of [
    [m => { m.files[0].path = '../outside'; }, 'SCOPE_DENIED'],
    [m => { m.files.push({ ...m.files[0], path: m.files[0].path.toUpperCase() }); }, 'INVALID_BACKUP'],
    [m => { m.files[0].bytes++; }, 'INVALID_BACKUP'],
    [m => { m.directories.push('note.md/child'); }, 'INVALID_BACKUP'],
    [m => { m.files[0].segments[0].sha256 = '../escape'; }, 'INVALID_BACKUP'],
    [m => { m.directories.push('.agents-company'); }, 'SCOPE_DENIED']
  ]) {
    await fs.writeFile(path.join(dir, 'manifest.bin'), bytes); await fs.writeFile(path.join(dir, 'header.json'), h);
    await editManifest(f.workspace, change);
    await f.error('library.backup.restore', { path: options.path, folder: 'Invalid-output' }, code);
    assert.equal(await S.exists(path.join(f.workspace, 'Invalid-output')), null);
  }
});
test('backup detects external edits and API changes during streaming, then removes its private staging', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: 'Original' });
  const original = S.writeNew; let changed = false;
  t.mock.method(S, 'writeNew', async (file, bytes) => { await original(file, bytes); if (!changed && file.includes('/chunks/')) { changed = true; await fs.writeFile(path.join(f.workspace, 'note.md'), 'External edit after capture'); } });
  await f.error('library.backup.create', options, 'CONFLICT'); assert(changed);
  assert.equal(await S.exists(path.join(f.workspace, options.path)), null);
  assert.deepEqual(await fs.readdir(path.join(f.workspace, '.margin-reader/backup-staging')), []);
  t.mock.restoreAll(); changed = false;
  t.mock.method(S, 'writeNew', async (file, bytes) => { await original(file, bytes); if (!changed && file.includes('/chunks/')) { changed = true; await f.api('settings.set', { theme: 'dark' }); } });
  await f.error('library.backup.create', options, 'CONFLICT'); assert.equal((await f.api('settings.get')).theme, 'dark');
});
test('disk failure never changes live data or publishes an incomplete backup', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: 'Original' });
  const before = await fs.readFile(path.join(f.workspace, '.margin-reader/state.json')), original = S.writeNew;
  t.mock.method(S, 'writeNew', async (file, bytes) => { if (file.includes('/chunks/')) throw Object.assign(new Error('injected disk full'), { code: 'ENOSPC' }); return original(file, bytes); });
  await f.error('library.backup.create', options, 'DISK_FULL');
  assert.equal(await S.exists(path.join(f.workspace, options.path)), null);
  assert.deepEqual(await fs.readFile(path.join(f.workspace, '.margin-reader/state.json')), before);
  assert.deepEqual(await fs.readdir(path.join(f.workspace, '.margin-reader/backup-staging')), []);
});
test('encrypted chunk authentication rejects cross-archive substitution even when plaintext hashes match', async t => {
  const f = await setup(t); await f.api('fs.write', { path: 'note.md', content: 'Same plaintext' });
  const password = 'valid encrypted passphrase';
  await f.api('library.backup.create', { ...options, password });
  await f.api('library.backup.create', { path: 'second.mrbackup', format: 'segmented', password });
  const a = path.join(f.workspace, options.path), b = path.join(f.workspace, 'second.mrbackup');
  const headers=await Promise.all([a,b].map(dir=>fs.readFile(path.join(dir,'header.json')).then(JSON.parse)));
  const keys=await Promise.all(headers.map(header=>Format.key(header,password)));
  const hash=S.digest(Buffer.from('Same plaintext')),names=headers.map((header,i)=>Format.chunkName(header,keys[i],hash));
  try{
    assert.notEqual(names[0],hash+'.bin');assert.notEqual(names[0],names[1]);
    assert(!(await fs.readFile(path.join(a,'manifest.bin'))).includes(Buffer.from('note.md')));
    await fs.copyFile(path.join(b,'chunks',names[1]),path.join(a,'chunks',names[0]));
    await f.error('library.backup.inspect', { path: options.path, password }, 'CHECKSUM_MISMATCH');
  }finally{keys.forEach(key=>key.fill(0));}
});
test('a missing chunk and a concurrently claimed restore destination leave no partial published data',async t=>{
 const f=await setup(t);await f.api('fs.write',{path:'note.md',content:'Missing or concurrent'});await f.api('library.backup.create',options);
 const dir=path.join(f.workspace,options.path),m=JSON.parse(await fs.readFile(path.join(dir,'manifest.bin'))),row=m.files.find(r=>r.path==='note.md');
 const chunk=path.join(dir,'chunks',row.segments[0].sha256+'.bin'),original=await fs.readFile(chunk);await fs.rm(chunk);
 await f.error('library.backup.restore',{path:options.path,folder:'Missing-output'},'CHECKSUM_MISMATCH');assert.equal(await S.exists(path.join(f.workspace,'Missing-output')),null);
 await fs.writeFile(chunk,original);
 const write=S.writeNew;let claimed=false;
 t.mock.method(S,'writeNew',async(file,bytes)=>{await write(file,bytes);if(!claimed&&file.includes('/backup-staging/restore-')&&file.endsWith('state.json')){claimed=true;await fs.mkdir(path.join(f.workspace,'Claimed'));await fs.writeFile(path.join(f.workspace,'Claimed/keep.txt'),'Do not overwrite');}});
 await f.error('library.backup.restore',{path:options.path,folder:'Claimed'},'ALREADY_EXISTS');assert(claimed);
 assert.equal(await fs.readFile(path.join(f.workspace,'Claimed/keep.txt'),'utf8'),'Do not overwrite');assert.equal(await S.exists(path.join(f.workspace,'Claimed/.margin-reader')),null);
 assert.deepEqual(await fs.readdir(path.join(f.workspace,'.margin-reader/backup-staging')),[]);
});
test('segmented manifests reject null records and case-normalized file ancestors',async t=>{
 const f=await setup(t);await f.api('fs.write',{path:'note.md',content:'Original'});await f.api('library.backup.create',options);
 const dir=path.join(f.workspace,options.path),raw=await fs.readFile(path.join(dir,'manifest.bin')),h=await fs.readFile(path.join(dir,'header.json'));
 for(const change of [m=>m.files.push(null),m=>m.directories.push('NOTE.MD/child')]){
  await fs.writeFile(path.join(dir,'manifest.bin'),raw);await fs.writeFile(path.join(dir,'header.json'),h);await editManifest(f.workspace,change);
  await f.error('library.backup.inspect',{path:options.path},'INVALID_BACKUP');
 }
});
