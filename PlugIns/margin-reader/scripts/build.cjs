'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2), at = args.indexOf('--out');
if (at >= 0 && !args[at + 1]) throw new Error('--out needs an output directory.');
const out = path.resolve(at >= 0 ? args[at + 1] : path.join(root, 'dist-plugin'));
if (out === root || root.startsWith(out + path.sep) || out.startsWith(path.join(root, 'workspaces') + path.sep)) throw new Error('Build output must not overwrite source or user workspaces.');
require('./contracts.cjs').generate();
require('./docs.cjs').generate();
const checked = spawnSync(process.execPath, [path.join(__dirname, 'check.cjs')], { cwd: root, stdio: 'inherit' });
if (checked.status !== 0) process.exit(checked.status || 1);
const pdf = path.dirname(require.resolve('pdfjs-dist/package.json'));
const vendor = path.join(root, 'ui', 'vendor');
fs.mkdirSync(vendor, { recursive: true });
for (const [source, destination] of [['build/pdf.mjs','pdf.mjs'], ['build/pdf.worker.mjs','pdf.worker.mjs'], ['web/pdf_viewer.css','pdf_viewer.css'], ['cmaps','cmaps'], ['standard_fonts','standard_fonts'], ['wasm','wasm'], ['LICENSE','PDFJS-LICENSE']]) {
  const from = path.join(pdf, source); if (fs.existsSync(from)) fs.cpSync(from, path.join(vendor, destination), { recursive: true });
}
const katex=path.dirname(require.resolve('katex/package.json'));fs.cpSync(path.join(katex,'dist'),path.join(vendor,'katex'),{recursive:true});
fs.mkdirSync(out, { recursive: true });
for (const name of ['agents-company.plugin.json','schema.json','runtime.cjs','cli.cjs','API.md','README.md','LOCAL_PARITY.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','lib','ui']) fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
// Runtime dependencies are carried with the package; the host does not install or supply them.
fs.cpSync(path.join(root, 'node_modules'), path.join(out, 'node_modules'), { recursive: true, dereference: true, filter: source => path.basename(source) !== '.bin' && path.basename(source) !== '.cache' });
fs.chmodSync(path.join(out, 'cli.cjs'), 0o755);
fs.writeFileSync(path.join(out, 'source-location.json'), JSON.stringify({ source: fs.realpathSync(root) }) + '\n');
console.log(`Built independent Margin Reader plugin: ${out}`);
