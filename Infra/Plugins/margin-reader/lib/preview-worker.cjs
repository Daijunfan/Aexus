'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { safePath, readBounded, assert, version, LIMITS } = require('./safety.cjs');
const { IMAGE, IMAGE_MIME } = require('./html.cjs');
async function result(canvas, title, extra = {}) {
  const bytes = await canvas.encode('png');
  return { kind: 'image', mimeType: 'image/png', width: canvas.width, height: canvas.height, contentBase64: bytes.toString('base64'), title, ...extra };
}
async function pdfCover(bytes, filename, pageNumber=1) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false,
    cMapUrl: path.join(base,'cmaps') + path.sep, cMapPacked: true,
    standardFontDataUrl: path.join(base,'standard_fonts') + path.sep, wasmUrl: path.join(base,'wasm') + path.sep });
  try {
    const pdf = await task.promise, page = await pdf.getPage(pageNumber), original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(360 / original.width, 480 / original.height) });
    const canvas = createCanvas(Math.max(1,Math.ceil(viewport.width)), Math.max(1,Math.ceil(viewport.height)));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
    const meta = await pdf.getMetadata().catch(() => ({}));
    return result(canvas, meta.info?.Title || path.basename(filename), { page: pageNumber, pageCount: pdf.numPages });
  } finally { await task.destroy(); }
}
function lines(ctx, text, x, y, width, lineHeight, maximum) {
  let line = '', row = 0;
  for (const character of String(text).replace(/\s+/g,' ').slice(0,8000)) {
    if (ctx.measureText(line + character).width > width && line) {
      ctx.fillText(line, x, y + row++ * lineHeight); line = '';
      if (row >= maximum) return y + row * lineHeight;
    }
    line += character;
  }
  if (line && row < maximum) ctx.fillText(line, x, y + row++ * lineHeight);
  return y + row * lineHeight;
}
async function localImage(src, args) {
  let bytes;
  if (IMAGE.test(src)) {
    if (src.length > 12 * 1024 * 1024) return null;
    bytes = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  } else {
    if (!src || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src)) return null;
    let rel;
    try { rel = path.posix.normalize(path.posix.join(path.posix.dirname(args.filename), decodeURIComponent(src.split(/[?#]/)[0]))); } catch { return null; }
    if (!IMAGE_MIME[path.extname(rel).toLowerCase()]) return null;
    bytes = await readBounded(await safePath(args.workspace, rel), 8 * 1024 * 1024);
  }
  const img = await loadImage(bytes);
  if (img.width < 32 || img.height < 32 || img.width * img.height > 40000000) return null;
  return img;
}
async function articleCover(bytes, args) {
  const { textDecode } = require('./parsers.cjs');
  let html = textDecode(bytes);
  if (['md','markdown'].includes(args.format)) html = await require('marked').parse(html);
  else if (args.format === 'txt') html = '<pre>' + require('./safety.cjs').escapeHtml(html) + '</pre>';
  const dom = new (require('jsdom').JSDOM)(html);
  try {
    const doc = dom.window.document;
    for (const bad of doc.querySelectorAll('script,style,nav,footer,iframe,object,embed,form')) bad.remove();
    const title = doc.querySelector('h1')?.textContent.trim() || doc.title || path.basename(args.filename);
    let image = null;
    for (const img of [...doc.querySelectorAll('img')].slice(0,8)) {
      try { image = await localImage(img.getAttribute('data-src') || img.getAttribute('src'), args); } catch { /* A denied or missing image stays absent. */ }
      if (image) break;
    }
    const canvas = createCanvas(360,480), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,360,480);
    ctx.fillStyle = '#1488ec'; ctx.fillRect(24,26,32,4);
    ctx.fillStyle = '#203048'; ctx.font = 'bold 24px sans-serif'; ctx.textBaseline = 'top';
    let y = lines(ctx,title,24,46,312,32,3) + 15;
    if (image) {
      const scale = Math.min(312 / image.width, 175 / image.height), w = image.width * scale, h = image.height * scale;
      ctx.drawImage(image,(360-w)/2,y,w,h); y += h + 18;
    }
    const blocks = [...doc.querySelectorAll('p,h2,pre')].map(el=>el.textContent.trim()).filter(text=>text && !/^(?:Source:|Saved\s+\d{4})/.test(text));
    const text = blocks.join(' ').slice(0,5000) || doc.body.textContent.trim().slice(0,5000);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#667183'; lines(ctx,text,24,y,312,21,Math.max(1,Math.floor((455-y)/21)));
    const fade = ctx.createLinearGradient(0,440,0,480); fade.addColorStop(0,'#ffffff00'); fade.addColorStop(1,'#ffffffff');
    ctx.fillStyle=fade;ctx.fillRect(0,440,360,40);
    return result(canvas,title,{ hasImage: Boolean(image), excerpt: text.slice(0,240) });
  } finally { dom.window.close(); }
}
async function main(args) {
  const file = await safePath(args.workspace,args.filename), st = await fs.stat(file);
  assert(version(st) === args.expectedVersion,'CONFLICT','Preview source changed before rendering.');
  const bytes = args.pdfBytes?Buffer.from(args.pdfBytes):await readBounded(file,args.format === 'pdf' ? LIMITS.file : LIMITS.html);
  if (args.format === 'pdf') return pdfCover(bytes,args.filename,args.page);
  if (IMAGE_MIME['.'+args.format]) {
    const img = await loadImage(bytes), scale = Math.min(360/img.width,480/img.height);
    const canvas = createCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return result(canvas,path.basename(args.filename));
  }
  return articleCover(bytes,args);
}
main(workerData).then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:{code:error.name==='PasswordException'?'PASSWORD_REQUIRED':error.code||'PREVIEW_UNAVAILABLE',message:error.message}}));
