'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../agents-company.plugin.json'), schema = require('../schema.json'), pkg = require('../package.json');
assert.equal(manifest.version, pkg.version); assert.equal(schema.version, pkg.version); assert.equal(schema.pluginId, manifest.id);
assert.deepEqual(schema.commands, require('./contracts.cjs').commands, 'schema.json is stale; regenerate contracts before building.');
assert(schema.commands.length > 0); const methods = new Set(schema.commands.map(c => c.method)); assert.equal(methods.size, schema.commands.length);
for (const command of schema.commands) { assert(command.description); assert.equal(command.agentAccess, 'workspace'); for (const option of Object.values(command.options || {})) assert(option.type && option.description); }
for (const field of ['runtime','renderer','cli','documentation','schema']) {
  const file = fs.realpathSync(path.join(root, manifest[field])); assert(file.startsWith(root + path.sep)); assert(fs.statSync(file).isFile());
}
const docs = fs.readFileSync(path.join(root, 'API.md'), 'utf8');
assert(docs.startsWith('---\nschema: agents-company.cli/v1\nplugin: margin-reader\n'));
let index = -1;
for (const heading of ['## Purpose','## Workspace','## Quick start','## Commands','## Files','## Errors','## Compatibility']) { const current = docs.indexOf('\n' + heading + '\n'); assert(current > index, heading); index = current; }
for (const method of methods) assert(docs.includes(`### ${method}\n`), `Missing documented API: ${method}`);
function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => { if (['node_modules','.git','vendor','workspaces','dist-plugin','artifacts'].includes(entry.name)) return []; const file = path.join(directory, entry.name); return entry.isDirectory() ? walk(file) : [file]; }); }
let count = 0;
for (const file of walk(root).filter(file => /\.(cjs|mjs|js)$/.test(file))) {
  const renderer=file.startsWith(path.join(root,'ui')+path.sep)&&!file.endsWith('.cjs');
  const syntax = spawnSync(process.execPath, renderer?['--check','--input-type=module']:['--check',file], { encoding:'utf8',...(renderer?{input:fs.readFileSync(file,'utf8')}:{}) });
  if (syntax.status !== 0) throw new Error(`Syntax check failed: ${file}\n${syntax.stderr||syntax.error?.message||''}`);
  count++;
  if (file.startsWith(path.join(root, 'ui') + path.sep)) {
    const source = fs.readFileSync(file, 'utf8');
    assert(!/localStorage|sessionStorage|window\.require|ipcRenderer|electronAPI/.test(source), 'Renderer must not store business data or call private host APIs.');
    for (const match of source.matchAll(/(?:api|\.change)\(\s*['"]([a-z]+\.[a-z.]+)['"]/g)) assert(methods.has(match[1]), `UI called undeclared method: ${match[1]}`);
  }
}
console.log(`PASS ${count} JavaScript syntax checks; ${methods.size} schema methods; manifest, docs and UI API boundary.`);
