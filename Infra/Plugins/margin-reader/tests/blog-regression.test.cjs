'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { normalizeSection } = require('../lib/html.cjs');
const { LIMITS } = require('../lib/safety.cjs');
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
function importer(download) {
  const filename = path.resolve(__dirname, '../lib/web.cjs');
  const localRequire = createRequire(filename), module = { exports: {} };
  const load = vm.runInThisContext('(function(require,module,exports){' + fs.readFileSync(filename, 'utf8') + '\n})', { filename });
  load(name => name === './network.cjs' ? { download } : localRequire(name), module, module.exports);
  return module.exports.importURL;
}

test('lazy images replace src placeholders and responsive images select a useful source', async () => {
  const calls = [];
  const section = await normalizeSection('<h1>Blog</h1><img src="' + pixel + '" data-src="/full.png"><img src="/placeholder.gif" srcset="/small.png 320w, /large.png 1280w">', 0, {
    resolveImage: async src => { calls.push(src); return pixel; }
  });
  assert.deepEqual(calls, ['/full.png', '/large.png']);
  assert.equal((section.html.match(/data:image\/png/g) || []).length, 2);
});

test('failed responsive candidates fall back without losing article text', async () => {
  const calls = [];
  const section = await normalizeSection('<h1>Blog</h1><p>Body preserved</p><img src="/working.png" data-src="/missing.png">', 0, {
    resolveImage: async src => { calls.push(src); return src === '/working.png' ? pixel : null; }
  });
  assert.deepEqual(calls, ['/missing.png', '/working.png']);
  assert.match(section.html, /data:image\/png/);
  assert.match(section.text, /Body preserved/);
});

test('Chinese HTML meta charset, long title and offline image are preserved', async () => {
  const title = '中文博客标题'.repeat(60);
  const html = '<html><head><meta charset="gbk"><title>' + title + '</title></head><body><article><h1>' + title + '</h1><p>' + '这是一篇保存到本地的中文博客，包含实际正文和离线图片。'.repeat(30) + '</p><img src="/figure.png" alt="图解"></article></body></html>';
  const downloaded = require('iconv-lite').encode(html, 'gbk');
  const urls = [];
  const importURL = importer(async url => {
    urls.push(url);
    return url.endsWith('/figure.png') ? { bytes: Buffer.from(pixel.split(',')[1], 'base64'), contentType: 'image/png', url }
      : { bytes: downloaded, contentType: 'text/html', url };
  });
  const result = await importURL('https://blog.example/article');
  assert(Buffer.byteLength(result.name) < 255);
  assert.match(result.bytes.toString(), /这是一篇保存到本地的中文博客/);
  assert.match(result.bytes.toString(), /data:image\/png;base64/);
  assert.deepEqual(urls, ['https://blog.example/article', 'https://blog.example/figure.png']);
  assert(result.bytes.length <= LIMITS.html);
});

test('base href remains effective after the document is sanitized', async () => {
  const html = '<html><head><base href="https://cdn.example/assets/"><title>Article</title></head><body><article><h1>Article</h1><p>' + 'Readable article text. '.repeat(100) + '</p><img src="figure.png"></article></body></html>';
  const urls = [];
  const result = await importer(async url => {
    urls.push(url);
    return url.includes('/assets/') ? { bytes: Buffer.from(pixel.split(',')[1], 'base64'), contentType: 'image/png', url }
      : { bytes: Buffer.from(html), contentType: 'text/html; charset=utf-8', url };
  })('https://blog.example/post');
  assert(urls.includes('https://cdn.example/assets/figure.png'));
  assert.match(result.bytes.toString(), /data:image\/png;base64/);
  assert.doesNotMatch(result.bytes.toString(), /<base\b/i);
});

test('one unavailable image does not discard the saved article', async () => {
  const html = '<article><h1>Offline article</h1><p>' + 'Keep the full article even if an image server fails. '.repeat(30) + '</p><img src="/missing.png" alt="missing"></article>';
  const result = await importer(async url => {
    if (url.endsWith('/missing.png')) throw Object.assign(new Error('Interrupted image'), { code: 'NETWORK_ERROR' });
    return { bytes: Buffer.from(html), contentType: 'text/html', url };
  })('https://blog.example/post');
  assert.match(result.bytes.toString(), /Keep the full article/);
  assert(result.warnings.some(w => w.includes('NETWORK_ERROR')));
  assert.doesNotMatch(result.bytes.toString(), /<img[^>]+src="https?:/i);
});
