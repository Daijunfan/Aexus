#!/usr/bin/env node
'use strict';
// Explicit, headless acceptance of the same URL dialog that users operate.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { parseArgs } = require('node:util');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
async function main() {
  const { values } = parseArgs({ options: { url: { type: 'string' }, workspace: { type: 'string' }, package: { type: 'string' } }, strict: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifact = path.join(root, 'artifacts', 'blog-ui-' + stamp);
  await fs.mkdir(artifact, { recursive: true });
  const temporary = !values.workspace;
  const workspace = values.workspace ? await fs.realpath(values.workspace) : await fs.mkdtemp(path.join(os.tmpdir(), 'margin-blog-ui-'));
  const pluginRoot = path.resolve(values.package || root);
  const { startServer } = require(path.join(pluginRoot, 'lib/server.cjs'));
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve(root, '../../node_modules/@playwright/test'));
  const report = { status: 'running', platform: process.platform, package: pluginRoot, workspace, startedAt: new Date().toISOString(), checks: [] };
  let browser, server;
  const errors = [];
  const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) {
      const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
      const choices = fsSync.existsSync(cache) ? fsSync.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse() : [];
      const executablePath = choices.map(n => path.join(cache, n, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(p => fsSync.existsSync(p));
      if (!executablePath) throw error;
      browser = await chromium.launch({ headless: true, executablePath });
    }
    server = await startServer({ workspace, pluginRoot });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url);
    await page.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
    const url = values.url || 'https://www.ruanyifeng.com/blog/2015/07/flex-grammar.html';
    await page.click('#import-url');
    await page.fill('#dialog [name="url"]', url);
    const finished = page.waitForResponse(response => {
      try { return response.url().endsWith('/rpc') && response.request().postDataJSON()?.method === 'web.import'; } catch { return false; }
    }, { timeout: 180000 });
    await page.click('#dialog-submit');
    const reply = await (await finished).json(); assert(!reply.error, JSON.stringify(reply.error));
    const doc = reply.result;
    await page.waitForSelector('#dialog', { state: 'hidden', timeout: 180000 });
    assert.equal(doc.kind, 'flow'); assert.equal(doc.format, 'html'); assert(doc.toc.length > 0);
    assert.deepEqual(doc.warnings, [], 'Blog import must not silently omit failed images');
    const content = await server.runtime.request({ jsonrpc: '2.0', id: 1, method: 'document.content', params: { id: doc.id } });
    assert(!content.error, JSON.stringify(content.error)); assert(content.result.text.length > 1000);
    const bytes = await fs.readFile(path.join(workspace, doc.path));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.match(bytes.toString(), /data:image\//);
    assert.doesNotMatch(bytes.toString(), /<img[^>]*\ssrc=["'](?:https?:)?\/\//i);
    report.article = { id: doc.id, title: doc.title, source: url, path: doc.path, bytes: bytes.length, textLength: content.result.text.length, chapters: doc.toc.length, sha256: hash, warnings: doc.warnings };
    pass('The real blog URL dialog saves an HTML document, readable text, headings and images');
    await page.close(); await server.close(); server = await startServer({ workspace, pluginRoot });
    const offline = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    offline.on('pageerror', error => errors.push(error.message));
    const remoteRequests = [];
    await offline.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(server.url).origin) return route.continue();
      remoteRequests.push(route.request().url()); return route.abort();
    });
    await offline.goto(server.url); await offline.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
    await offline.waitForFunction(() => {
      const root = document.querySelector('.flow-document')?.shadowRoot;
      const images = [...(root?.querySelectorAll('article img') || [])];
      return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0);
    }, undefined, { timeout: 60000 });
    report.article.images = await offline.locator('.flow-document article img').count();
    assert.equal((await offline.locator('#document-title').textContent()), doc.title);
    await offline.screenshot({ path: path.join(artifact, 'blog-offline-title.png') });
    await offline.locator('.flow-document article img').first().scrollIntoViewIfNeeded();
    await offline.screenshot({ path: path.join(artifact, 'blog-offline-images.png') });
    pass('All saved raster images decode after service restart with external requests blocked');
    assert.deepEqual(remoteRequests, []); assert.deepEqual(errors, []);
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(workspace, doc.path))).digest('hex'), hash);
    pass('Offline reading makes no remote requests and does not alter the saved document');
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; throw error; }
  finally {
    await browser?.close(); await server?.close();
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(artifact, 'result.json'), JSON.stringify(report, null, 2));
    if (temporary) await fs.rm(workspace, { recursive: true, force: true });
    console.log('Blog UI acceptance: ' + path.join(artifact, 'result.json'));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
