// Run every test file. Bundle TypeScript with the production resolver instead of
// relying on Node's strip-types resolver, which requires explicit TS extensions.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
const files =
  process.argv.length > 2
    ? process.argv.slice(2).map((file) => path.resolve(root, file))
    : fs
        .readdirSync(path.join(root, 'tests'))
        .filter((file) => /\.test\.(ts|cjs)$/.test(file))
        .sort()
        .map((file) => path.join(root, 'tests', file));
const cache = path.join(root, 'node_modules/.cache');
fs.mkdirSync(cache, { recursive: true });
const directory = fs.mkdtempSync(path.join(cache, 'mininotion-tests-'));
try {
  const sources = files.filter((file) => file.endsWith('.ts'));
  if (sources.length)
    await build({
      absWorkingDir: root,
      entryPoints: sources,
      outdir: directory,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      sourcemap: 'inline',
      sourcesContent: false,
      outExtension: { '.js': '.cjs' },
      logLevel: 'warning',
    });
  const result = spawnSync(
    process.execPath,
    [
      '--enable-source-maps',
      '--test',
      '--test-concurrency=4',
      '--test-timeout=30000',
      ...files.map((file) =>
        file.endsWith('.ts') ? path.join(directory, path.basename(file, '.ts') + '.cjs') : file,
      ),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
