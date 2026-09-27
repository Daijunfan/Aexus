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
const artifacts =
  process.env.AGENTS_COMPANY_TEST_ARTIFACTS || path.join(root, 'artifacts/mininotion-editing');
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
  await cli('group', 'add', 'Notion验收', '--mode', 'work', '--plugin', 'mininotion');
  const note = await api('page.create', {
    title: '研究笔记',
    color: 'white',
    icon: 'icon:BookOpen:blue',
    blocks: [
      { id: 'intro', type: 'paragraph', content: '这是一段普通正文。' },
      { id: 'equation', type: 'equation', props: { expression: 'E = mc^2' } },
      {
        id: 'inline',
        type: 'paragraph',
        content: [
          { type: 'text', text: '行内表达式：', styles: {} },
          { type: 'inlineMath', props: { expression: 'x^2 + y^2' } },
        ],
      },
      {
        id: 'toggle',
        type: 'toggleListItem',
        content: '折叠资料',
        children: [{ id: 'target', type: 'paragraph', content: 'local first 是这里的精确匹配。' }],
      },
      { id: 'editable', type: 'paragraph', content: '' },
    ],
  });
  const second = await api('page.create', { title: 'local first 项目', color: 'white' });
  await api('page.create', { title: 'local other first', color: 'white' });
  const opened = app.waitForEvent('window');
  await cli('plugin', 'open', 'mininotion', '--team', 'Notion验收');
  page = await opened;
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(request.url()))
      requests.push(request.url());
  });
  const win = (await cli('plugin', 'windows'))[0];
  await cli('plugin', 'place', win.id, '--width', '1150', '--height', '850');
  await page.locator('.sidebar').waitFor();
  await api('page.open', { pageId: note.id });
  await expect(page.locator('.equation-block .katex')).toBeVisible();
  await expect(page.locator('.inline-equation .katex')).toBeVisible();
  await page.getByRole('button', { name: '编辑块公式', exact: true }).click();
  await page.getByRole('textbox', { name: 'LaTeX 公式' }).fill('\\frac{a}{b} = c');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect
    .poll(async () => (await api('block.get', { pageId: note.id, blockId: 'equation' })).props.expression)
    .toBe('\\frac{a}{b} = c');
  await page.getByRole('button', { name: '编辑行内公式', exact: true }).click();
  await page.getByRole('textbox', { name: 'LaTeX 公式' }).fill('z^3');
  await page.getByRole('textbox', { name: 'LaTeX 公式' }).press('Enter');
  await expect
    .poll(async () =>
      JSON.stringify((await api('block.get', { pageId: note.id, blockId: 'inline' })).content),
    )
    .toContain('z^3');
  ok('block and inline LaTeX edit, render and persist through the CLI');
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'equations-light.png') });
  await api('block.update', { pageId: note.id, blockId: 'equation', props: { expression: '\\frac{' } });
  await expect(page.locator('.equation-block .katex-error')).toBeVisible();
  await api('block.update', { pageId: note.id, blockId: 'equation', props: { expression: 'E=mc^2' } });
  await expect(page.locator('.equation-block .katex')).toBeVisible();
  ok('invalid formulas retain their source and display an error without breaking the editor');
  await page.keyboard.press('Meta+p');
  const search = page.getByRole('dialog', { name: '搜索', exact: true });
  await search.getByRole('textbox', { name: '搜索所有笔记' }).fill('"local first"');
  await expect(search.locator('.search-result')).toHaveCount(2);
  await expect(
    search.locator('.search-result').filter({ hasText: '研究笔记' }).locator('mark').first(),
  ).toHaveText('local first');
  await search.getByRole('button', { name: '仅标题', exact: true }).click();
  await expect(search.locator('.search-result')).toHaveCount(1);
  await search.getByRole('button', { name: '仅标题', exact: true }).click();
  await search.getByRole('button', { name: '搜索范围', exact: true }).click();
  await page.getByRole('option', { name: '研究笔记', exact: true }).click();
  await expect(search.locator('.search-result')).toHaveCount(1);
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'search-scoped.png') });
  await search.locator('.search-result').click();
  await expect(page.locator('.note-editor')).toHaveAttribute('data-block-target', 'target');
  await expect(page.locator('[data-id="target"] .bn-inline-content').last()).toBeVisible();
  ok('quoted search, title-only, page scope, highlighted excerpts and matching-block navigation');
  await api('page.open', { pageId: second.id });
  await api('page.open', { pageId: note.id, blockId: 'target' });
  await expect(page.locator('.note-editor')).toHaveAttribute('data-block-target', 'target');
  await expect(page.locator('[data-id="target"] .bn-inline-content').last()).toBeVisible();
  await page.locator('[data-id="target"] .bn-inline-content').hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制块链接', exact: true }).click();
  const link = `mininotion://page/${note.id}#target`;
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(link);
  await api('block.append', {
    pageId: second.id,
    type: 'paragraph',
    blocks: [{ type: 'paragraph', content: [{ type: 'link', href: link, content: '回到命中的块' }] }],
  });
  await api('page.open', { pageId: second.id });
  await page.locator('.bn-editor a').filter({ hasText: '回到命中的块' }).click();
  await expect(page.locator('.note-editor')).toHaveAttribute('data-block-target', 'target');
  await expect(page.locator('[data-id="target"] .bn-inline-content').last()).toBeVisible();
  ok('CLI block anchors and copied links reveal targets inside closed toggles');
  await api('page.open', { pageId: second.id });
  const typing = await api('page.create', { title: '输入验收', color: 'white' });
  await api('page.open', { pageId: typing.id });
  await page.locator('.bn-editor').click();
  await page.keyboard.type('> ');
  await page.keyboard.type('toggle');
  await expect
    .poll(async () => (await api('page.get', { pageId: typing.id })).blocks[0].type)
    .toBe('toggleListItem');
  await page.keyboard.press('Meta+Alt+2');
  await expect.poll(async () => (await api('page.get', { pageId: typing.id })).blocks[0].props.level).toBe(2);
  await page.keyboard.press('Meta+d');
  await expect
    .poll(
      async () =>
        (await api('page.get', { pageId: typing.id })).blocks.filter((block) => block.type === 'heading')
          .length,
    )
    .toBe(2);
  await page.keyboard.press('Meta+Alt+4');
  await page.keyboard.press('Meta+Enter');
  await expect
    .poll(async () =>
      (await api('page.get', { pageId: typing.id })).blocks.some(
        (block) => block.type === 'checkListItem' && block.props.checked,
      ),
    )
    .toBe(true);
  await page.keyboard.press('Meta+Alt+8');
  await expect.poll(async () => (await api('page.get', { pageId: typing.id })).blocks.some(block => block.type === 'codeBlock')).toBe(true);
  await page.keyboard.press('Meta+Alt+0');
  await expect.poll(async () => (await api('page.get', { pageId: typing.id })).blocks.some(block => block.type === 'codeBlock')).toBe(false);
  ok('Notion toggle markdown, heading/list conversion, duplicate and checkbox keyboard shortcuts');
  const multi = await api('page.create', {
    title: '多块操作',
    color: 'white',
    blocks: [
      { type: 'paragraph', content: '第一段' },
      { type: 'paragraph', content: '第二段' },
    ],
  });
  await api('page.open', { pageId: multi.id });
  await page.locator('.bn-inline-content').first().click();
  await page.keyboard.press('Meta+a');
  await page.locator('.bn-inline-content').first().hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制块', exact: true }).click();
  await expect.poll(async () => (await api('page.get', { pageId: multi.id })).blocks.length).toBe(4);
  await page.locator('.bn-inline-content').first().click();
  await page.keyboard.press('Meta+a');
  await page.locator('.bn-inline-content').first().hover();
  await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '颜色', exact: true }).hover();
  await page.getByRole('menuitem', { name: '红色背景', exact: true }).click();
  await expect
    .poll(async () =>
      (await api('page.get', { pageId: multi.id })).blocks.every(
        (block) => block.props.backgroundColor === 'red',
      ),
    )
    .toBe(true);
  ok('multi-block menu duplicates the entire selection and applies a shared color');
  await page.getByRole('button', { name: '更换 多块操作 的图标', exact: true }).click();
  const iconDialog = page.getByRole('dialog', { name: '选择图标' });
  await iconDialog.getByRole('textbox', { name: '搜索图标' }).fill('🔥');
  await iconDialog.getByRole('textbox', { name: '搜索图标' }).press('Enter');
  await expect.poll(async () => (await api('page.get', { pageId: multi.id })).icon).toBe('🔥');
  const row = page.getByRole('treeitem', { name: '研究笔记', exact: true });
  await row.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('treeitem', { name: 'local first 项目', exact: true })).toBeFocused();
  ok('sidebar icon editing and keyboard tree navigation');
  const child = await api('page.create', {
    title: '参考资料',
    parentId: note.id,
    color: 'white',
    blocks: [
      { type: 'breadcrumb' },
      {
        type: 'bookmark',
        props: { url: 'https://example.com', title: '本地书签', description: '说明保存在本地' },
      },
    ],
  });
  await api('page.open', { pageId: child.id });
  await expect(page.getByRole('navigation', { name: '页面路径' })).toContainText('研究笔记');
  await page.locator('.bookmark-block').hover();
  await page.getByRole('button', { name: '编辑书签', exact: true }).click();
  await page.getByRole('textbox', { name: '书签标题' }).fill('修改后的书签');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await api('page.get', { pageId: child.id })).blocks.find((block) => block.type === 'bookmark').props
          .title,
    )
    .toBe('修改后的书签');
  await page
    .getByRole('navigation', { name: '页面路径' })
    .getByRole('button', { name: '研究笔记', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: '页面标题' })).toHaveValue('研究笔记');
  ok('local bookmark editing and live breadcrumb navigation without metadata fetching');
  const slash = await api('page.create', { title: '斜杠菜单', color: 'white' });
  await api('page.open', { pageId: slash.id });
  await page.locator('.bn-editor').click();
  await page.keyboard.type('/equation');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () =>
      (await api('page.get', { pageId: slash.id })).blocks.some((block) => block.type === 'equation'),
    )
    .toBe(true);
  const colors = await api('page.create', { title: '快捷颜色', color: 'white' });
  await api('page.open', { pageId: colors.id });
  await page.locator('.bn-editor').click();
  await page.keyboard.type('alpha /red background');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await api('page.get', { pageId: colors.id })).blocks[0].props.backgroundColor)
    .toBe('red');
  await page.keyboard.type('/duplicate');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await api('page.get', { pageId: colors.id })).blocks.length).toBe(2);
  assert.ok(!JSON.stringify((await api('page.get', { pageId: colors.id })).blocks).includes('/duplicate'));
  ok('slash equation insertion, background color and duplicate actions');
  await api('page.open', { pageId: note.id });
  await page.keyboard.press('Meta+f');
  await page.getByRole('textbox', { name: '在页面中查找' }).fill('普通正文');
  await expect(page.locator('.find-bar')).toContainText('1/1');
  await api('block.update', { pageId: note.id, blockId: 'intro', text: '普通正文 普通正文' });
  await expect(page.locator('.find-bar')).toContainText('1/2');
  await page.keyboard.press('Escape');
  ok('in-page find updates after external CLI edits');
  await api('page.open', { pageId: note.id });
  await api('page.open', { pageId: second.id, mode: 'tab' });
  await expect(page.getByRole('tablist', { name: '页面标签' }).getByRole('tab')).toHaveCount(2);
  await expect.poll(async () => (await api('settings.get')).pageTabs).toEqual([note.id, second.id]);
  await page.getByRole('tab', { name: '研究笔记', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '页面标题' })).toHaveValue('研究笔记');
  await page.keyboard.press('Meta+t');
  await expect(page.getByRole('tablist', { name: '页面标签' }).getByRole('tab')).toHaveCount(3);
  await page.getByRole('button', { name: '关闭标签 主页', exact: true }).click();
  await expect(page.getByRole('tablist', { name: '页面标签' }).getByRole('tab')).toHaveCount(2);
  await page.getByRole('tab', { name: '研究笔记', exact: true }).click();
  ok('CLI-opened tabs, keyboard new tab, switch and close persist shared navigation preferences');
  await api('settings.set', { changes: { theme: 'dark' } });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'equations-dark.png') });
  await cli('plugin', 'dismiss', win.id);
  const reopened = app.waitForEvent('window');
  await cli('plugin', 'open', 'mininotion', '--team', 'Notion验收');
  page = await reopened;
  await page.locator('.sidebar').waitFor();
  await expect(page.getByRole('tablist', { name: '页面标签' }).getByRole('tab')).toHaveCount(2);
  await api('page.open', { pageId: note.id });
  await expect(page.locator('.equation-block .katex')).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  assert.ok(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  );
  ok('cold UI reopen, dark rendering, no external network or renderer exceptions');
  console.log(`PASS=${checks} FAIL=0 — no model inference`);
} catch (error) {
  console.error(log, errors);
  await page.screenshot({ animations: 'disabled', path: path.join(artifacts, 'error.png') }).catch(() => {});
  throw error;
} finally {
  await app.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
