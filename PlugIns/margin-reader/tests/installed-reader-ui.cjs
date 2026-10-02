'use strict';
// Opt-in verification of the installed host and plugin. All test windows stay hidden.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const host = path.resolve(root, '../..');
const { _electron: electron } = require(path.join(host, 'node_modules/@playwright/test'));
async function main() {
  const source = process.env.READER_TEST_PDF;
  assert(source, 'Set READER_TEST_PDF to the actual local book path.');
  const expectedHash = createHash('sha256').update(await fs.readFile(source)).digest('hex');
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'margin-installed-')));
  const artifact = path.join(root, 'artifacts', 'installed-ui-' + new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(artifact, { recursive: true });
  const pluginRoot = process.env.READER_PLUGIN_ROOT;
  if (!pluginRoot) throw new Error('Set READER_PLUGIN_ROOT to the installed plugin to validate');
  const env = { ...process.env, AGENTS_COMPANY_HOME: path.join(temp, 'state'), AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'), AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'), AGENTS_COMPANY_PLUGIN_DIRS: pluginRoot, AGENTS_COMPANY_HIDDEN: '1' };
  for (const name of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT']) delete env[name];
  const expectedVersion = JSON.parse(await fs.readFile(path.join(pluginRoot, 'agents-company.plugin.json'), 'utf8')).version;
  const report = { status: 'running', version: expectedVersion, package: pluginRoot, checks: [] };
  const pass = text => { report.checks.push(text); console.log('PASS ' + text); };
  const cli = async (...args) => {
    const output = await exec(process.execPath, [path.join(host, 'bin/agents'), ...args, '--json'], { env, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    const reply = JSON.parse(output.stdout); assert(reply.ok, reply.error); return reply.data;
  };
  const call = (method, params = {}) => cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));
  let app;
  try {
    app = await electron.launch({ executablePath: '/Applications/Agents Company.app/Contents/MacOS/Agents Company', args: [], env, timeout: 60000 });
    await app.firstWindow();
    const described = await cli('plugin','describe','margin-reader');
    assert.equal(described.version, expectedVersion); assert.equal(described.directory, pluginRoot);
    const first = app.waitForEvent('window');
    const opened = await cli('plugin','open','margin-reader');
    const page = await first; page.setDefaultTimeout(120000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('body[data-ready="true"]');
    const finish = page.waitForResponse(response => {
      try { return response.url().endsWith('/rpc') && response.request().postDataJSON()?.method === 'import.finish'; } catch { return false; }
    }, { timeout: 300000 });
    await page.setInputFiles('#file-input', source);
    const reply = await (await finish).json(); assert(!reply.error, JSON.stringify(reply.error));
    const doc = reply.result;
    assert.equal(doc.pageCount, 1061); assert.equal(doc.toc.length, 516);
    assert.equal(createHash('sha256').update(await fs.readFile(path.join(opened.workspace, doc.path))).digest('hex'), expectedHash);
    await page.waitForSelector('.pdf-page > canvas');
    await page.fill('#page-number', '531'); await page.locator('#page-number').press('Tab');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.pdf-page > canvas[aria-label="PDF 第 531 页"]');
      return canvas?.width > 100 && document.querySelector('.pdf-page[data-page="531"] .textLayer')?.textContent.length > 100;
    });
    await page.screenshot({ path: path.join(artifact, 'installed-pdf.png') });
    pass(`Installed ${expectedVersion} imports the real 1061-page PDF through its hidden native window; SHA-256 is identical`);
    assert((await call('document.search', { id: doc.id, query: 'performance', limit: 10 })).matches.length > 0);
    pass('Installed host CLI searches the same document imported by the native window');
    await page.click('#import-url'); await page.fill('#dialog [name="url"]', 'https://www.ruanyifeng.com/blog/2015/07/flex-grammar.html');
    const saved = page.waitForResponse(response => {
      try { return response.url().endsWith('/rpc') && response.request().postDataJSON()?.method === 'web.import'; } catch { return false; }
    }, { timeout: 180000 });
    await page.click('#dialog-submit'); const articleReply = await (await saved).json(); assert(!articleReply.error, JSON.stringify(articleReply.error));
    const article = articleReply.result; assert.deepEqual(article.warnings, []);
    await page.waitForSelector('#dialog', { state: 'hidden' });
    pass('Installed native URL dialog downloads a real Chinese blog without image warnings');
    await cli('plugin','dismiss',opened.id);
    const next = app.waitForEvent('window'); const second = await cli('plugin','open','margin-reader'); const offline = await next;
    await offline.route('**/*', route => new URL(route.request().url()).origin === new URL(second.url).origin ? route.continue() : route.abort());
    // Reload under the network block so initial loads cannot make a test pass.
    await offline.reload();
    await offline.waitForSelector('body[data-ready="true"]', { timeout: 180000 });
    await offline.waitForFunction(() => {
      const images = [...(document.querySelector('.flow-document')?.shadowRoot?.querySelectorAll('article img') || [])];
      return images.length >= 16 && images.every(img => img.complete && img.naturalWidth > 0);
    });
    report.blog = { title: article.title, images: await offline.locator('.flow-document article img').count(), warnings: article.warnings };
    await offline.locator('.flow-document article img').first().scrollIntoViewIfNeeded();
    await offline.screenshot({ path: path.join(artifact, 'installed-blog-offline.png') });
    pass('Installed native reader reopens all 16 blog images with outside network requests blocked');
    assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(win => !win.isVisible())));
    assert.deepEqual(errors, []);
    pass('All verification windows stayed hidden; no uncaught renderer errors');
    await cli('plugin','dismiss',second.id);
    report.pdf = { pages: doc.pageCount, chapters: doc.toc.length, sha256: expectedHash };
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.error = { message: error.message, stack: error.stack }; throw error; }
  finally {
    await app?.close(); await fs.rm(temp, { recursive: true, force: true });
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(artifact, 'result.json'), JSON.stringify(report, null, 2));
    console.log('Installed native report: ' + path.join(artifact, 'result.json'));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
