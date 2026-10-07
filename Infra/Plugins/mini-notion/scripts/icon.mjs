import sharp from 'sharp';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#fffefb"/><stop offset="1" stop-color="#ebe9e2"/></linearGradient><filter id="shadow" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="15" stdDeviation="14" flood-opacity=".17"/></filter></defs><rect x="82" y="82" width="860" height="860" rx="185" fill="url(#paper)" stroke="#e4e1d9" stroke-width="2"/><g filter="url(#shadow)"><rect x="262" y="228" width="524" height="576" rx="22" transform="rotate(5 524 516)" fill="#deded5" stroke="#393b33" stroke-width="14"/><rect x="228" y="208" width="524" height="576" rx="22" fill="#fffefa" stroke="#33362e" stroke-width="17"/></g><path d="M634 209h52v148l-26-18-26 18z" fill="#7c9580"/><path d="M308 650v-32h29V366h-29v-32h87l99 213 97-213h88v32h-29v252h29v32H555v-32h31V408L479 649h-22L353 415v203h30v32z" fill="#33362e"/></svg>`;
await fs.mkdir('build/icon.iconset', { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2])
    await sharp(Buffer.from(svg))
      .resize(size * scale)
      .png()
      .toFile(`build/icon.iconset/icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`);
}
await sharp(Buffer.from(svg)).resize(1024).png().toFile('build/icon.png');
execFileSync('/usr/bin/iconutil', ['-c', 'icns', 'build/icon.iconset', '-o', 'build/icon.icns']);
console.log('macOS icon generated');
