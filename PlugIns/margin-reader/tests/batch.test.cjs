'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setup } = require('./fixtures.cjs');
const { createPlugin } = require('../runtime.cjs');
const exec = require('node:util').promisify(require('node:child_process').execFile);
async function prepare(t) {
  const context = await setup(t);
  await context.api('fs.mkdir', { path: 'Target' });
  await context.api('fs.write', { path: 'one.md', content: '# One\n\noriginal one' });
  await context.api('fs.write', { path: 'two.md', content: '# Two\n\noriginal two' });
  const items = (await context.api('fs.list')).entries.filter(e => e.kind === 'file').map(e => ({ path: e.path, expectedVersion: e.version }));
  return { ...context, items };
}
test('batch move/copy/trash preserve real files, stable document IDs and recoverable trash', async t => {
  const { api, workspace, items } = await prepare(t);
  const doc = await api('document.open', { path: 'one.md' });
  const moved = await api('fs.batch', { action: 'move', items, folder: 'Target' });
  assert.equal(moved.count, 2); assert.equal((await api('document.get', { id: doc.id })).path, 'Target/one.md');
  let batch = (await api('fs.list', { path: 'Target' })).entries.map(e => ({ path: e.path, expectedVersion: e.version }));
  await api('fs.mkdir', { path: 'Copied' });
  assert.equal((await api('fs.batch', { action: 'copy', items: batch, folder: 'Copied' })).count, 2);
  assert.equal(await fs.readFile(path.join(workspace,'Copied/one.md'),'utf8'), '# One\n\noriginal one');
  const removed = await api('fs.batch', { action: 'trash', items: batch });
  assert.equal(removed.count, 2); assert.equal((await api('fs.trash.list')).items.length, 2);
  for (const item of removed.items) await api('fs.restore', { trashId: item.trashId });
  assert.equal((await api('document.open', { path: 'Target/one.md' })).id, doc.id);
  assert.equal((await api('fs.list',{path:'Target'})).entries.length, 2);
});
test('batch validates all destinations before moving anything; never overwrites conflicts', async t => {
  const { api, error, workspace, items } = await prepare(t);
  await api('fs.write', { path: 'Target/two.md', content: 'keep destination' });
  const failure = await error('fs.batch', { action: 'move', items, folder: 'Target' }, 'ALREADY_EXISTS');
  assert.equal(failure.data.details.failedPath, 'two.md');
  assert.equal(await fs.readFile(path.join(workspace,'one.md'),'utf8'), '# One\n\noriginal one');
  await assert.rejects(fs.stat(path.join(workspace,'Target/one.md')), { code:'ENOENT' });
  assert.equal(await fs.readFile(path.join(workspace,'Target/two.md'),'utf8'), 'keep destination');
});
test('stale selection fails the whole batch without discarding the newer file', async t => {
  const { error, workspace, items } = await prepare(t);
  await fs.writeFile(path.join(workspace,'two.md'), 'updated by another process');
  await error('fs.batch', { action:'trash',items }, 'CONFLICT');
  assert.equal(await fs.readFile(path.join(workspace,'two.md'),'utf8'), 'updated by another process');
  assert.equal(await fs.readFile(path.join(workspace,'one.md'),'utf8'), '# One\n\noriginal one');
});
test('batch rejects malformed, duplicate, overlapping, out-of-scope and self-target selections', async t => {
  const { api, error, items, workspace, parent } = await prepare(t);
  for (const bad of [[], {}, null, [null], [{path:'one.md'}], [items[0],items[0]], Array(501).fill(items[0]), [{...items[0],unknown:true}]]) {
    await error('fs.batch',{action:'move',items:bad,folder:'Target'},'INVALID_PARAMS');
  }
  await error('fs.batch',{action:'move',items,folder:'.'},'INVALID_PATH');
  await error('fs.batch',{action:'trash',items,folder:'Target'},'INVALID_PARAMS');
  await error('fs.batch',{action:'trash',items:[{path:'../escape',expectedVersion:'x'}]},'SCOPE_DENIED');
  await error('fs.batch',{action:'trash',items:[{path:'.margin-reader/state.json',expectedVersion:'x'}]},'SCOPE_DENIED');
  await fs.symlink(parent,path.join(workspace,'Link'));
  await error('fs.batch',{action:'move',items,folder:'Link'},'SCOPE_DENIED');
  await api('fs.mkdir',{path:'Folder/Sub'});
  const folder=(await api('fs.list')).entries.find(e=>e.path==='Folder');
  await error('fs.batch',{action:'move',items:[{path:'Folder',expectedVersion:folder.version}],folder:'Folder/Sub'},'INVALID_PATH');
  await error('fs.batch',{action:'trash',items:[{path:'Folder',expectedVersion:folder.version},{path:'Folder/Sub',expectedVersion:'x'}]},'INVALID_PARAMS');
});
test('a later ordinary filesystem failure rolls back earlier files and state', async t => {
  const { raw,workspace,items }=await prepare(t);
  const stateFile=path.join(workspace,'.margin-reader/state.json'), before=await fs.readFile(stateFile,'utf8');
  const rename=fs.rename, canonical=await fs.realpath(workspace); let injected=false;
  fs.rename=async(from,to)=>{
    if(!injected&&from===path.join(canonical,'two.md')&&to===path.join(canonical,'Target/two.md')){injected=true;throw Object.assign(new Error('Simulated disk error'),{code:'EIO'});}
    return rename(from,to);
  };
  try { const result=await raw('fs.batch',{action:'move',items,folder:'Target'});assert(result.error);assert(injected); }
  finally { fs.rename=rename; }
  assert.equal(await fs.readFile(stateFile,'utf8'),before);
  for(const name of ['one.md','two.md']) {assert((await fs.stat(path.join(workspace,name))).isFile());await assert.rejects(fs.stat(path.join(workspace,'Target',name)),{code:'ENOENT'});}
});
test('independent runtimes serialize competing batches without losing files', async t => {
  const { runtime,workspace,items,api }=await prepare(t);await api('fs.mkdir',{path:'Other'});
  const other=await createPlugin({workspace});t.after(()=>other.close());
  const replies=await Promise.all([runtime.request({jsonrpc:'2.0',id:1,method:'fs.batch',params:{action:'move',items,folder:'Target'}}),other.request({jsonrpc:'2.0',id:2,method:'fs.batch',params:{action:'move',items,folder:'Other'}})]);
  assert.equal(replies.filter(r=>r.result).length,1);assert.equal(replies.filter(r=>r.error).length,1);
  const counts=await Promise.all(['Target','Other'].map(async folder=>(await api('fs.list',{path:folder})).entries.length));
  assert.deepEqual(counts.sort(),[0,2]);
});
test('batch operation is usable through standalone CLI with normal error exit status', async t => {
  const {workspace,items}=await prepare(t);const env={...process.env};
  for(const key of ['AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE']) delete env[key];
  const args=[path.resolve(__dirname,'../cli.cjs'),'--workspace',workspace,'api','fs.batch','--data',JSON.stringify({action:'move',items,folder:'Target'})];
  const first=JSON.parse((await exec(process.execPath,args,{env})).stdout);assert.equal(first.result.count,2);
  await assert.rejects(exec(process.execPath,args,{env}),e=>e.code===1&&JSON.parse(e.stdout).error.data.code==='NOT_FOUND');
});
