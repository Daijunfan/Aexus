import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const zip = new JSZip();
async function add(source, destination = source) {
  const stat = await fs.stat(source);
  if (stat.isDirectory())
    for (const name of await fs.readdir(source))
      await add(path.join(source, name), path.join(destination, name));
  else zip.file(destination, await fs.readFile(source));
}
for (const file of [
  '.prettierrc.json',
  '.gitignore',
  'src',
  'electron',
  'scripts',
  'bin',
  'tests',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'playwright.config.ts',
  'index.html',
  'README.md',
  'PARITY.md',
  'AGENT_PARITY.md',
  'AGENT_ACCEPTANCE.md',
  'ARCHITECTURE.md',
  'CLI.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
])
  await add(file);
for (const file of ['src', 'package.json', 'LICENSE'])
  await add(`node_modules/@blocknote/xl-multi-column/${file}`);
await fs.mkdir('build', { recursive: true });
await fs.writeFile(
  'build/Source.zip',
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
);
console.log('Application source included');
