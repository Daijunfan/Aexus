// Bundle source tests with the same resolver as the shipped Core (Node strip-types
// alone cannot resolve this project's existing extensionless TS imports).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const names = ['model', 'database', 'dates', 'formula', 'properties', 'sync', 'timeGrid'];
const cache = path.join(root, 'node_modules/.cache');
fs.mkdirSync(cache, { recursive: true });
const directory = fs.mkdtempSync(path.join(cache, 'mininotion-domain-'));
try {
  await build({
    absWorkingDir: root,
    entryPoints: names.map((name) => path.join(root, `tests/${name}.test.ts`)),
    outdir: directory,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outExtension: { '.js': '.cjs' },
    logLevel: 'warning',
  });
  const result = spawnSync(
    process.execPath,
    ['--test', ...names.map((name) => path.join(directory, `${name}.test.cjs`))],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
