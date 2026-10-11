#!/usr/bin/env node
'use strict';
// Explicit acceptance command. Never runs automatically on application startup.
// Leaves imported documents in a NEW workspace; never changes the source book.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { promisify, parseArgs } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '..');
async function hashFile(filename) {
  const hash = createHash('sha256');
  for await (const bytes of fsSync.createReadStream(filename)) hash.update(bytes);
  return hash.digest('hex');
}
async function findBook() {
  const matches = []; let count = 0;
  async function scan(directory, depth) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      assert(++count <= 10000, 'Downloads scan reached 10,000 entries. Supply --pdf with the exact path.');
      const file = path.join(directory, entry.name);
      if (entry.isFile() && /\.pdf$/i.test(entry.name) && /ai.*performance.*engineering/i.test(entry.name)) matches.push({ file, size: (await fs.stat(file)).size });
      else if (entry.isDirectory() && depth > 0 && !entry.name.startsWith('.')) await scan(file, depth - 1);
    }
  }
  await scan(path.join(os.homedir(), 'Downloads'), 2);
  assert(matches.length, 'AI Performance Engineering PDF was not found. Supply --pdf with its exact local path.');
  return matches.sort((a, b) => b.size - a.size)[0].file;
}
async function main() {
  assert(!process.env.AGENTS_COMPANY_PLUGIN_RPC && !process.env.AGENTS_COMPANY_EMPLOYEE && !process.env.AGENTS_WORKSPACE, 'Run from your own terminal, not an employee-scoped environment.');
  const { values } = parseArgs({ options: { pdf: { type: 'string' }, url: { type: 'string' } }, strict: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifact = path.join(root, 'artifacts', 'import-acceptance-' + stamp);
  await fs.mkdir(artifact, { recursive: true });
  const report = { status: 'running', environment: { platform: process.platform, node: process.version }, startedAt: new Date().toISOString(), checks: [] };
  let server, browser;
  const writeReport = () => fs.writeFile(path.join(artifact, 'result.json'), JSON.stringify(report, null, 2));
  const pass = check => { report.checks.push(check); console.log('PASS ' + check); };
  const { startServer } = require('../lib/server.cjs');
  try {
    assert(process.platform === 'darwin', 'This acceptance command must run on the Mac containing the requested book.');
    const source = await fs.realpath(values.pdf || await findBook());
    const stat = await fs.stat(source); assert(stat.isFile() && stat.size > 4 * 1024 * 1024, 'The acceptance PDF must be larger than one 4 MiB upload chunk.');
    const originalHash = await hashFile(source);
    report.source = { file: source, bytes: stat.size, sha256: originalHash };
    const workspace = path.join(root, 'workspaces', 'Import Acceptance ' + stamp);
    await fs.mkdir(workspace, { recursive: true }); report.workspace = workspace;
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve(root, '../../node_modules/@playwright/test'));
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) {
      const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
      const choices = fsSync.existsSync(cache) ? fsSync.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse() : [];
      const executablePath = choices.map(n => path.join(cache, n, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(p => fsSync.existsSync(p));
      if (!executablePath) throw error;
      browser = await chromium.launch({ headless: true, executablePath });
    }
    server = await startServer({ workspace });
    const cli = async (...args) => {
      const result = await exec(process.execPath, [path.join(root, 'cli.cjs'), '--workspace', workspace, ...args], { cwd: root, timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
      const reply = JSON.parse(result.stdout); assert(!reply.error, JSON.stringify(reply.error)); return reply.result;
    };
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url); await page.waitForSelector('body[data-ready="true"]');
    const completed = page.waitForResponse(response => {
      try { return response.url().endsWith('/rpc') && response.request().postDataJSON()?.method === 'import.finish'; } catch { return false; }
    }, { timeout: 600000 });
    await page.setInputFiles('#file-input', source);
    const reply = await (await completed).json(); assert(!reply.error, JSON.stringify(reply.error));
    const doc = reply.result; report.pdf = { id: doc.id, path: doc.path, pageCount: doc.pageCount, chapters: doc.toc.length, uploadChunks: Math.ceil(stat.size / (4 * 1024 * 1024)) };
    assert(doc.toc.every(node => !node.unresolved && node.locator.page >= 1 && node.locator.page <= doc.pageCount), 'Some original PDF chapter targets are invalid.');
    assert.equal(await hashFile(path.join(workspace, doc.path)), originalHash); pass('Actual local PDF imported through the UI, with identical SHA-256');
    async function rendered(number, requireInk = true, view = page) {
      await view.waitForFunction(({ number, requireInk }) => {
        const canvas = document.querySelector(`.pdf-page > canvas[aria-label="PDF 第 ${number} 页"]`);
        if (!canvas || canvas.width < 100 || canvas.height < 100) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0, ink = 0;
        for (let i = 0; i < pixels.length; i += 64) { if (pixels[i + 3] > 0) { visible++; if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 240) ink++; } }
        return visible > 10 && (!requireInk || ink > 5);
      }, { number, requireInk }, { timeout: 120000 });
    }
    await rendered(1); await page.screenshot({ path: path.join(artifact, 'pdf-first-page.png') });
    const samplePages = [...new Set([1, Math.ceil(doc.pageCount / 2), doc.pageCount])];
    for (const number of samplePages) {
      await page.fill('#page-number', String(number)); await page.locator('#page-number').press('Tab');
      await rendered(number, number !== doc.pageCount);
      assert.equal((await cli('read', doc.id, '--page', String(number))).page, number);
      await page.screenshot({ path: path.join(artifact, `pdf-page-${number}.png`) });
    }
    pass('First, middle and last PDF pages render and are readable from a separate CLI process');
    assert(doc.toc.length, 'This book has no imported TOC; inspect the original before declaring TOC acceptance.');
    const chapter = doc.toc.find(n => !n.unresolved && n.locator.page > 1) || doc.toc[0];
    await page.locator('.outline-row[data-node=' + JSON.stringify(chapter.id) + ']').click();
    await rendered(chapter.locator.page); pass('Clicking an original PDF chapter navigates to its page');
    const query = await cli('search', doc.id, 'performance'); assert(query.matches.length > 0); pass('The real book is searchable from the CLI');
    await page.close(); await server.close(); server = await startServer({ workspace });
    const reopened = await browser.newPage(); reopened.on('pageerror', error => errors.push(error.message)); await reopened.goto(server.url); await reopened.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
    await rendered(chapter.locator.page, true, reopened);
    assert.equal((await cli('open', doc.path)).id, doc.id); pass('PDF reopens after the reader service restarts');
    await reopened.close();
    const url = values.url || 'https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/';
    const article = await cli('url', url);
    const html = await fs.readFile(path.join(workspace, article.path), 'utf8');
    assert((await cli('read', article.id)).text.length > 1000, 'Blog body is missing or unexpectedly short.');
    assert.match(html, /data:image\//); assert.doesNotMatch(html, /<img[^>]*\ssrc=["'](?:https?:)?\/\//i);
    assert.equal(article.warnings.length, 0, 'Blog is incomplete: ' + article.warnings.join('; '));
    const articleHash = await hashFile(path.join(workspace, article.path));
    report.blog = { source: url, path: article.path, bytes: Buffer.byteLength(html), sha256: articleHash };
    await server.close(); server = await startServer({ workspace });
    const offline = await browser.newPage(); offline.on('pageerror', error => errors.push(error.message));
    await offline.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await offline.goto(server.url); await offline.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
    await offline.waitForSelector('.flow-document article img');
    await offline.waitForFunction(() => {
      const images = [...(document.querySelector('.flow-document')?.shadowRoot?.querySelectorAll('article img') || [])];
      return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0);
    });
    assert.equal(await hashFile(path.join(workspace, article.path)), articleHash);
    report.blog.images = await offline.locator('.flow-document article img').count();
    report.blog.textLength = (await cli('read', article.id)).text.length;
    report.blog.warnings = article.warnings;
    await offline.locator('.flow-document article img').first().scrollIntoViewIfNeeded();
    await offline.screenshot({ path: path.join(artifact, 'blog-offline.png') });
    pass('Real blog downloaded through CLI and reopened with external browser requests blocked');
    assert.equal(await hashFile(source), originalHash); assert.equal((await fs.stat(source)).mtimeMs, stat.mtimeMs); pass('Original PDF remains unchanged');
    assert.deepEqual(errors, []); report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, code: error.code }; throw error; }
  finally { await browser?.close(); await server?.close(); report.finishedAt = new Date().toISOString(); await writeReport(); console.log('Acceptance report: ' + path.join(artifact, 'result.json')); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
