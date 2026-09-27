// Exercise the real hosted plugin in an isolated, hidden Agents Company window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url),
  { _electron: electron, expect } = require('@playwright/test');
const root = path.resolve(import.meta.dirname, '../../..');
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ac-notion-local-')));
const artifacts = process.env.AGENTS_COMPANY_TEST_ARTIFACTS || path.join(root, 'artifacts/mininotion-local');
fs.mkdirSync(artifacts, { recursive: true });
fs.mkdirSync(path.join(temp, 'fixture'));
fs.writeFileSync(path.join(temp, 'fixture/release-all'), '');
const env = {
  ...process.env,
  AGENTS_COMPANY_HOME: path.join(temp, 'state'),
  AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'),
  AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'),
  AGENTS_COMPANY_HIDDEN: '1',
  CODEX_BIN: path.join(root, 'test/fixtures/initialization-codex.cjs'),
  CODEX_HOME: path.join(temp, 'codex'),
  AC_INIT_FIXTURE: path.join(temp, 'fixture'),
};
for (const key of Object.keys(env))
  if (
    key.startsWith('AGENTS_COMPANY_TOKEN') ||
    [
      'ELECTRON_RUN_AS_NODE',
      'AGENTS_COMPANY_SOCKET',
      'AGENTS_COMPANY_URL',
      'AGENTS_COMPANY_EMPLOYEE',
    ].includes(key)
  )
    delete env[key];
const app = await electron.launch({
  executablePath: process.env.AGENTS_COMPANY_TEST_APP || require('electron'),
  args: process.env.AGENTS_COMPANY_TEST_APP ? [] : [root],
  env,
});
let page = await app.firstWindow();
page.setDefaultTimeout(15000);
const errors = [],
  requests = [];
let log = '';
app.process().stderr.on('data', (data) => {
  log = (log + data).slice(-6000);
});
const run = promisify(execFile);
const cli = async (...args) => {
  const reply = JSON.parse(
    (
      await run(process.execPath, [path.join(root, 'bin/agents'), ...args, '--json'], {
        env,
        timeout: 25000,
        maxBuffer: 8e6,
      })
    ).stdout,
  );
  assert.ok(reply.ok, reply.error);
  return reply.data;
};
const api = (method, params = {}) =>
  cli('plugin', 'call', 'mininotion', method, '--team', 'Notion验收', '--params', JSON.stringify(params));
let checks = 0;
const ok = (label) => {
  checks++;
  console.log('PASS ' + label);
};
const savedIcon = (id, icon) =>
  expect.poll(async () => (await api('page.get', { pageId: id })).icon).toBe(icon);
const openPicker = async () => {
  await page.getByRole('button', { name: '更换页面图标', exact: true }).click();
  return page.getByRole('dialog', { name: '选择图标' });
};
try {
  await page.locator('.infinite-canvas').waitFor();
  assert.equal((await cli('plugin', 'list')).find(plugin => plugin.id === 'mininotion').version, JSON.parse(fs.readFileSync(path.join(root, 'PlugIns/mini-notion/package.json'))).version);
  await cli('group', 'add', 'Notion验收', '--mode', 'work', '--plugin', 'mininotion');
  const note = await api('page.create', {
    title: '我的知识库',
    color: 'white',
    icon: '📚',
    cover: 'paper',
    blocks: [
      { type: 'heading', props: { level: 2 }, content: '把想法变成清晰的记录' },
      { type: 'paragraph', content: '一个安静的地方，整理笔记、计划与日常灵感。' },
      { type: 'callout', props: { emoji: '💡', backgroundColor: 'yellow' }, content: '从一个小想法开始。' },
      { type: 'checkListItem', props: { checked: true }, content: '整理本周阅读笔记' },
      { type: 'checkListItem', props: { checked: false }, content: '留一点空间给新的想法' },
      { type: 'paragraph', props: { textColor: 'purple' }, content: '紫色正文 · 浅色与深色保持一致的语义' },
    ],
  });
  const target = await api('page.create', { title: '收集箱', color: 'white', icon: 'icon:Inbox:orange' });
  await api('settings.set', { changes: { theme: 'light', sidebarWidth: 225 } });
  const opened = app.waitForEvent('window');
  await cli('plugin', 'open', 'mininotion', '--team', 'Notion验收');
  page = await opened;
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(request.url()))
      requests.push(request.url());
  });
  const window = (await cli('plugin', 'windows'))[0];
  await cli('plugin', 'place', window.id, '--width', '1160', '--height', '860');
  await page.locator('.sidebar').waitFor();
  await api('page.open', { pageId: note.id });
  await expect(page.getByRole('textbox', { name: '页面标题' })).toHaveValue(note.title);
  let picker;
  picker = await openPicker();
  await picker.getByRole('tab', { name: '图标', exact: true }).click();
  await picker.getByRole('textbox', { name: '搜索图标' }).fill('书');
  await expect(picker.getByRole('button', { name: 'BookOpen', exact: true })).toBeVisible();
  await picker.getByRole('button', { name: '蓝色', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'icons-light.png') });
  await picker.getByRole('button', { name: 'BookOpen', exact: true }).click();
  await savedIcon(note.id, 'icon:BookOpen:blue');
  await expect(page.locator('.page-large-icon svg.lucide-book-open')).toBeVisible();
  await expect(page.locator(`.sidebar-page[data-page-id="${note.id}"] svg.lucide-book-open`)).toBeVisible();
  ok('Chinese search, ten-color symbol picker and CLI-backed sidebar/title rendering');
  picker = await openPicker();
  await picker.getByRole('button', { name: '紫色', exact: true }).click();
  await savedIcon(note.id, 'icon:BookOpen:purple');
  await page.keyboard.press('Escape');
  ok('changing an existing icon color persists immediately');
  await page.getByRole('button', { name: '切换提示图标' }).click();
  picker = page.getByRole('dialog', { name: '选择图标' });
  await picker.getByRole('tab', { name: '图标', exact: true }).click();
  await picker.getByRole('textbox', { name: '搜索图标' }).fill('Lightbulb');
  await picker.getByRole('button', { name: '黄色', exact: true }).click();
  await picker.getByRole('button', { name: 'Lightbulb', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api('page.get', { pageId: note.id })).blocks.find((b) => b.type === 'callout').props.emoji,
    )
    .toBe('icon:Lightbulb:yellow');
  ok('callout uses the same picker and block props are persisted');
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'document-light.png') });
  await page.keyboard.press('Meta+Shift+L');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => (await api('settings.get')).theme).toBe('dark');
  await expect(page.locator('.bn-block-content[data-text-color="purple"]')).toHaveCSS(
    'color',
    'rgb(157, 104, 211)',
  );
  await expect(page.locator('.bn-block-content[data-background-color="yellow"]')).toHaveCSS(
    'background-color',
    'rgb(86, 67, 40)',
  );
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'document-dark.png') });
  ok('hosted theme shortcut and readable dark text/highlight palette');
  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: '搜索', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索所有笔记' }).fill('我的知识库');
  await expect(page.locator('.search-result svg.lucide-book-open')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+f');
  await expect(page.locator('.find-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+\\');
  await expect.poll(async () => (await api('settings.get')).sidebarHidden).toBe(true);
  await page.keyboard.press('Meta+\\');
  await expect.poll(async () => (await api('settings.get')).sidebarHidden).toBe(false);
  ok('hosted search, in-page find and sidebar shortcuts work');
  picker = await openPicker();
  await picker.getByRole('tab', { name: '表情符号', exact: true }).click();
  await picker.getByRole('textbox', { name: '搜索图标' }).fill('👩🏽‍💻');
  await picker.getByRole('textbox', { name: '搜索图标' }).press('Enter');
  await savedIcon(note.id, '👩🏽‍💻');
  ok('multi-codepoint emoji is preserved as one icon');
  picker = await openPicker();
  await picker.getByRole('tab', { name: '上传', exact: true }).click();
  const image = {
    name: 'local-icon.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="18" fill="#337ea9"/><path d="M20 60V20L60 60V20" stroke="white" stroke-width="8" fill="none"/></svg>',
    ),
  };
  await picker.locator('input[type=file]').setInputFiles(image);
  await expect
    .poll(async () => (await api('page.get', { pageId: note.id })).icon.startsWith('asset://local/'))
    .toBe(true);
  await expect
    .poll(() =>
      page.locator('.page-large-icon img').evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  ok('local image upload uses the asset CLI and renders through the scoped host URL');
  await page.locator('.page-cover').hover();
  await page.getByRole('button', { name: '更换封面', exact: true }).click();
  await page.locator('.popover input[type=file]').setInputFiles(image);
  await expect
    .poll(async () => (await api('page.get', { pageId: note.id })).cover.startsWith('asset://local/'))
    .toBe(true);
  await expect(page.locator('.page-cover')).toHaveClass(/cover-custom/);
  assert.ok(
    (await page.locator('.page-cover').evaluate((el) => getComputedStyle(el).backgroundImage)).includes(
      '/data/asset/',
    ),
  );
  ok('local cover upload remains visible after bridge URL translation');
  picker = await openPicker();
  await picker.getByRole('menuitem', { name: '移除图标' }).click();
  await savedIcon(note.id, '');
  await api('page.update', { pageId: note.id, icon: 'icon:BookOpen:blue', cover: 'paper' });
  await page.keyboard.press('Meta+n');
  await expect(page.getByRole('textbox', { name: '页面标题' })).toHaveValue('');
  await page.getByRole('textbox', { name: '页面标题' }).fill('快捷键新建');
  await page.getByRole('textbox', { name: '页面标题' }).press('Enter');
  await page.locator('.bn-editor').pressSequentially(':fire', { delay: 30 });
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bn-editor')).toContainText('🔥');
  ok('new-page shortcut and inline colon emoji insertion');
  await api('page.open', { pageId: note.id });
  const paragraph = page.locator('.bn-block-content').filter({ hasText: '一个安静的地方' });
  await paragraph.hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制块', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api('page.get', { pageId: note.id })).blocks.filter((b) =>
          JSON.stringify(b.content).includes('一个安静的地方'),
        ).length,
    )
    .toBe(2);
  await paragraph.first().hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '转换为', exact: true }).hover();
  await page.getByRole('menuitem', { name: '标题 2', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api('page.get', { pageId: note.id })).blocks.filter((b) => b.type === 'heading').length,
    )
    .toBe(2);
  await paragraph.first().hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '移动到', exact: true }).hover();
  await page.getByRole('textbox', { name: '搜索目标页面' }).fill('收集箱');
  await page.getByRole('menuitem', { name: '收集箱', exact: true }).click();
  await expect
    .poll(async () =>
      JSON.stringify((await api('page.get', { pageId: target.id })).blocks).includes('一个安静的地方'),
    )
    .toBe(true);
  ok('block menu duplicate, turn-into and move-to use shared Core operations');
  const db = await api('database.create', { title: '阅读计划', color: 'white', icon: 'icon:Table:green', view: 'table' });
  await api('record.create', { databaseId: db.id, title: '设计中的细节', color: 'white', icon: 'icon:Star:yellow', values: { status: '进行中' } });
  await api('page.open', { pageId: db.id });
  await expect(page.locator('.database svg.lucide-star').first()).toBeVisible();
  for (const type of ['board', 'gallery', 'list']) {
    await api('view.create', { databaseId: db.id, type, name: type });
    await expect(page.locator('.database svg.lucide-star').first()).toBeVisible();
  }
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'database-dark.png') });
  ok('table, board, gallery and list share persisted record icons');
  await api('page.open', { pageId: note.id });
  await cli('plugin', 'place', window.id, '--width', '540', '--height', '650');
  picker = await openPicker();
  await picker.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
  await expect(picker).toHaveCSS('opacity', '1');
  await expect(picker).toHaveCSS('background-color', 'rgb(34, 34, 34)');
  const box = await picker.boundingBox();
  const viewport =
    page.viewportSize() || (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  assert.ok(
    box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
  );
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'picker-narrow-dark.png') });
  await page.keyboard.press('Escape');
  ok('picker remains inside a narrow window');
  await cli('plugin', 'dismiss', window.id);
  const reopened = app.waitForEvent('window');
  await cli('plugin', 'open', 'mininotion', '--team', 'Notion验收');
  page = await reopened;
  await page.locator('.sidebar').waitFor();
  await api('page.open', { pageId: note.id });
  await expect(page.locator('.page-large-icon svg.lucide-book-open')).toBeVisible();
  assert.equal((await api('page.get', { pageId: note.id })).icon, 'icon:BookOpen:blue');
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  ok('reopen preserves data; all windows hidden, no renderer errors or external requests');
  console.log(`PASS=${checks} FAIL=0 — no model inference`);
} catch (error) {
  console.error(log);
  console.error('Renderer errors:', errors);
  console.error(await page.locator('[role=menu],.bn-drag-handle-menu').allTextContents());
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'error.png') }).catch(() => {});
  throw error;
} finally {
  await app.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
