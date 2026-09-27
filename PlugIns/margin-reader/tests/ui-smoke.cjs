'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || path.resolve(__dirname, '../../../node_modules/@playwright/test'));
const { pdfFixture, docxFixture, epubFixture } = require('./fixtures.cjs');
const { startServer } = require('../dist-plugin/lib/server.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'margin-reader-ui-')), workspace = path.join(temp, 'library'); await fs.mkdir(workspace);
  for (const folder of ['产品与设计','研究资料','收藏文章']) await fs.mkdir(path.join(workspace, folder));
  const note = '# 阅读，从整理开始\n\n把分散的资料放回自己的空间。保留原文，用清晰的目录找到下一次思考的起点。\n\n## 01 · 一个可管理的文库\n\n文件夹是最熟悉的组织方式。左侧文件树用来快速切换，大文件夹视图帮助你从全局选择资料。\n\n> 文档属于你，阅读方式也应该由你决定。\n\n## 02 · 在目录中找到线索\n\n每一个章节都可以拥有标题和精确的跳转位置。你可以增加目录、修改标题，使用缩进建立层次。\n\n### CLI 与界面保持一致\n\n所有持久化操作经过同一个 API。外部 CLI 添加的章节会同步出现在这里。\n\n## 03 · 留住值得读的文章\n\n粘贴公开博客链接，将正文保存为离线文档。下一次打开，不必重新寻找。\n\n# 下一次阅读\n\n从目录开始，回到你上次停下的地方。\n';
  await fs.writeFile(path.join(workspace, '阅读器使用指南.md'), note);
  await fs.writeFile(path.join(workspace, '研究论文.pdf'), pdfFixture());
  await fs.writeFile(path.join(workspace, '工作文档.docx'), await docxFixture());
  await fs.writeFile(path.join(workspace, '电子书.epub'), await epubFixture());
  const server = await startServer({ workspace }); let browser;
  const failures = [], results = [];
  const pass = label => { results.push(label); console.log('PASS ' + label); };
  const call = async (method, params = {}) => { const reply = await server.runtime.request({ jsonrpc: '2.0', id: 1, method, params }); assert(!reply.error, JSON.stringify(reply.error)); return reply.result; };
  try {
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) {
      const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
      const roots = fsSync.readdirSync(cache).filter(name => name.startsWith('chromium_headless_shell-')).sort().reverse();
      const executable = roots.map(name => path.join(cache, name, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(file => fsSync.existsSync(file));
      if (!executable) throw error;
      browser = await chromium.launch({ headless: true, executablePath: executable });
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(server.url); await page.waitForSelector('body[data-ready="true"]');
    await page.waitForSelector('.file-card');
    assert.equal(await page.locator('.file-card').count(), 7); assert.equal(await page.locator('.tree-row').count(), 7);
    pass('tree and large folder grid render the same real files');
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'artifacts/library.png') });
    await page.click('#new-folder'); await page.fill('#dialog [name="name"]', '新建文件夹'); await page.click('#dialog-submit'); await page.waitForSelector('#dialog', { state: 'hidden' });
    assert((await fs.stat(path.join(workspace, '新建文件夹'))).isDirectory()); pass('UI creates an actual folder using the shared Core');
    await page.locator('.file-card[data-path="阅读器使用指南.md"] .file-open').click();
    await page.waitForSelector('.flow-document'); await page.waitForSelector('.outline-row');
    assert((await page.locator('.flow-document').locator('article').innerText()).includes('阅读，从整理开始')); pass('flow document body and original heading outline render');
    await page.click('#add-chapter'); await page.fill('#dialog [name="title"]', '自定义阅读章节'); await page.click('#dialog-submit'); await page.waitForSelector('#dialog', { state: 'hidden' });
    await page.getByText('自定义阅读章节', { exact: true }).click();
    await page.click('#indent-chapter');
    let doc = await call('document.open', { path: '阅读器使用指南.md' }); let custom = doc.toc.find(n => n.title === '自定义阅读章节'); assert(custom?.parentId); pass('UI chapter indentation persists in Core');
    await page.click('#outdent-chapter'); await expect.poll(async () => (await call('document.get', { id: doc.id })).toc.find(n => n.id === custom.id).parentId).toBe(null); doc = await call('document.get', { id: doc.id }); custom = doc.toc.find(n => n.id === custom.id); assert.equal(custom.parentId, null); pass('UI outdent retains chapter and target');
    await page.click('#edit-chapter'); await page.fill('#dialog [name="title"]', '编辑后的章节'); await page.click('#dialog-submit'); await page.waitForSelector('#dialog', { state: 'hidden' });
    doc = await call('document.get', { id: doc.id }); assert.equal(doc.toc.find(n => n.id === custom.id).title, '编辑后的章节'); pass('UI chapter title editing is durable');
    const env = { ...process.env }; for (const key of ['AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE']) delete env[key];
    await page.click('#edit-chapter'); await page.fill('#dialog [name="title"]', '不能静默覆盖外部更新');
    const cli = await exec(process.execPath, [path.join(root, 'dist-plugin/cli.cjs'),'--workspace',workspace,'api','toc.update','--data',JSON.stringify({ id: doc.id, expectedRevision: doc.revision, nodeId: custom.id, title: '从 CLI 同步的章节' })], { env }); assert(!JSON.parse(cli.stdout).error);
    await page.getByText('从 CLI 同步的章节', { exact: true }).waitFor({ timeout: 10000 }); pass('separate CLI process changes appear live in the renderer');
    await page.click('#dialog-submit'); await expect(page.locator('#dialog-error')).toContainText('数据已被另一处修改'); await expect(page.locator('#dialog')).toBeVisible(); await page.click('#dialog-cancel'); pass('stale UI editing drafts are rejected without overwriting external CLI updates');
    await page.click('#search-document'); await page.fill('#search-query', '目录'); await page.click('#search-form button[type="submit"]'); await page.waitForSelector('.search-hit'); pass('full-document search returns clickable locators');
    await page.click('#close-search'); await page.screenshot({ path: path.join(root, 'artifacts/reader.png') });
    await page.click('#add-chapter'); await page.fill('#dialog [name="title"]', '尚未保存');
    const flush = async id => page.evaluate(id => new Promise(resolve => { const token = location.pathname.split('/')[1]; const listener = event => { if (event.data?.type === 'agents-plugin:flushed' && event.data.id === id) { removeEventListener('message', listener); resolve(event.data); } }; addEventListener('message', listener); postMessage({ type: 'agents-plugin:flush', token, id }, '*'); }), id);
    assert((await flush('dirty-test')).error); await page.click('#dialog-cancel'); assert(!(await flush('clean-test')).error); pass('host flush rejects unsaved drafts and acknowledges clean state');
    await page.click('#back-library'); await page.locator('.file-card[data-path="研究论文.pdf"] .file-open').click(); await page.waitForSelector('.pdf-page canvas');
    await page.waitForFunction(() => document.querySelector('.textLayer')?.textContent.includes('Introduction'));
    const canvas = await page.locator('.pdf-page[data-page="1"] > canvas').evaluate(c => ({ width: c.width, height: c.height, sample: Array.from(c.getContext('2d').getImageData(0,0,1,1).data) })); assert(canvas.width > 100 && canvas.height > 100); pass('PDF original page canvas and selectable text layer render');
    await page.getByText('Chapter Two', { exact: true }).click(); await page.waitForFunction(() => document.querySelector('.pdf-page[data-page="2"] .textLayer')?.textContent.includes('Chapter Two'));
    await expect(page.locator('#page-number')).toHaveValue('2'); assert.equal(await page.inputValue('#page-number'), '2'); pass('original PDF TOC jumps to the correct page');
    await page.screenshot({ path: path.join(root, 'artifacts/pdf-reader.png') });
    await page.click('#theme'); await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark'); assert.equal(await page.getAttribute('body','data-theme'), 'dark'); assert.equal((await call('settings.get')).theme, 'dark'); pass('theme changes persist through the public API');
    await page.setViewportSize({ width: 1024, height: 768 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false); pass('reader layout fits a 1024-pixel workspace');
    await page.setViewportSize({ width: 780, height: 768 }); await page.click('#toggle-outline'); await expect(page.locator('#outline-pane')).toBeVisible(); await page.click('#toggle-outline'); await expect(page.locator('#outline-pane')).toBeHidden(); pass('chapter outline remains accessible in a narrow window');
    assert.deepEqual(failures, []); pass('no uncaught browser errors');
    await fs.writeFile(path.join(root, 'artifacts/ui-test-results.json'), JSON.stringify({ passed: results.length, results, browserErrors: failures }, null, 2));
    console.log(`UI PASS=${results.length} FAIL=0; screenshots in artifacts/`);
  } finally { await browser?.close(); await server.close(); await fs.rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
