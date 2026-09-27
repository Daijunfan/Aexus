'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createCanvas } = require('@napi-rs/canvas');
const { assert, safePath, readBounded, version } = require('./safety.cjs');
function wrap(ctx, text, width) {
  const rows = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > width) { rows.push(line); line = ''; }
      line += character;
    }
    rows.push(line);
  }
  return rows;
}
async function textImage(args) {
  const canvas = createCanvas(820, 100), ctx = canvas.getContext('2d');
  ctx.font = '24px sans-serif';
  const longest = Math.max(...args.text.split(/\r?\n/).map(line => ctx.measureText(line).width));
  const width = Math.ceil(Math.min(820, Math.max(420, longest + 64)));
  const rows = wrap(ctx, args.text, width - 64); canvas.width = width;
  assert(rows.length <= 240, 'TOO_LARGE', 'The excerpt is too long for one card. Select a smaller passage.');
  canvas.height = Math.max(150, 85 + rows.length * 34);
  const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.textBaseline = 'top'; c.fillStyle = '#6c7889'; c.font = '16px sans-serif'; c.fillText(args.title.slice(0, 85), 32, 24, width - 64);
  c.fillStyle = '#1e293b'; c.font = '24px sans-serif'; rows.forEach((line, i) => c.fillText(line, 32, 65 + i * 34));
  return encode(canvas, 'text-image');
}
async function encode(canvas, kind) {
  const bytes = await canvas.encode('png');
  assert(bytes.length <= 8 * 1024 * 1024, 'TOO_LARGE', 'Excerpt image exceeds 8 MiB. Select a smaller area.');
  return { bytes, mimeType: 'image/png', width: canvas.width, height: canvas.height, kind };
}
async function pdfImage(args) {
  const file = await safePath(args.workspace, args.filename);
  assert(version(await fs.stat(file)) === args.sourceVersion, 'SOURCE_CHANGED', 'PDF changed before capture.');
  const bytes = await readBounded(file), pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), password: args.password, verbosity: 0, isEvalSupported: false,
    cMapUrl: path.join(base, 'cmaps') + path.sep, cMapPacked: true, standardFontDataUrl: path.join(base, 'standard_fonts') + path.sep, wasmUrl: path.join(base, 'wasm') + path.sep });
  try {
    const pdf = await task.promise, crops = [];
    const pages = [...new Set(args.rects.map(r => r.page))].sort((a,b) => a-b);
    for (const number of pages) {
      const page = await pdf.getPage(number), viewport = page.getViewport({ scale: 1 }), rects = args.rects.filter(r => r.page === number);
      const x = Math.max(0, Math.min(...rects.map(r => r.x)) * viewport.width - 3);
      const y = Math.max(0, Math.min(...rects.map(r => r.y)) * viewport.height - 3);
      const w = Math.min(viewport.width - x, Math.max(...rects.map(r => r.x + r.width)) * viewport.width - x + 3);
      const h = Math.min(viewport.height - y, Math.max(...rects.map(r => r.y + r.height)) * viewport.height - y + 3);
      const scale = Math.min(2, 1100 / w, 1900 / h);
      crops.push({ page, number, x, y, w: Math.ceil(w * scale), h: Math.ceil(h * scale), scale });
    }
    let width = Math.max(...crops.map(c => c.w)) + 24, height = crops.reduce((n,c) => n + c.h + 30, 12);
    const shrink = Math.min(1, Math.sqrt(6000000 / (width * height)), 8000 / height);
    if (shrink < 1) {
      crops.forEach(c => { c.scale *= shrink; c.w = Math.max(1, Math.ceil(c.w * shrink)); c.h = Math.max(1, Math.ceil(c.h * shrink)); });
      width = Math.max(...crops.map(c => c.w)) + 24; height = crops.reduce((n,c) => n + c.h + 30, 12);
    }
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); let top = 8;
    for (const crop of crops) {
      const tile = createCanvas(crop.w, crop.h);
      await crop.page.render({ canvasContext: tile.getContext('2d'), viewport: crop.page.getViewport({ scale: crop.scale }), transform: [1, 0, 0, 1, -crop.x * crop.scale, -crop.y * crop.scale], background: '#fff' }).promise;
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#657083'; ctx.fillText(`PDF · ${crop.number}`, 12, top + 13);
      ctx.save();if(args.polygon?.page===crop.number){const viewport=crop.page.getViewport({scale:1});ctx.beginPath();args.polygon.points.forEach((p,i)=>{const x=12+(p[0]*viewport.width-crop.x)*crop.scale,y=top+20+(p[1]*viewport.height-crop.y)*crop.scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.clip();}
      ctx.drawImage(tile, 12, top + 20);ctx.restore(); top += crop.h + 30; crop.page.cleanup();
    }
    return encode(canvas, args.polygon?'pdf-lasso':'pdf-crop');
  } finally { await task.destroy(); }
}
(async () => workerData.rects?.length ? pdfImage(workerData) : textImage(workerData))()
  .then(result => parentPort.postMessage({ result }), error => parentPort.postMessage({ error: { code: error.name === 'PasswordException' ? 'PASSWORD_REQUIRED' : error.code || 'CAPTURE_FAILED', message: error.message } }));
