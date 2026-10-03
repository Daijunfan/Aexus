// Isolated hosted renderer and Core session path. The engine is a deterministic protocol peer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require = createRequire(import.meta.url), { _electron: electron, chromium, expect } = require('@playwright/test');
const root = path.resolve(import.meta.dirname, '..'), run = promisify(execFile);
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-editor-tools-')));
const out = process.env.AGENTS_COMPANY_TEST_ARTIFACTS || path.join(root, 'artifacts/mininotion-editor-tools/ui');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(temp, 'fixture')); fs.writeFileSync(path.join(temp, 'fixture/release-all'), '');
const env = { ...process.env, AGENTS_COMPANY_HOME: path.join(temp, 'state'), AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'), AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'), AGENTS_COMPANY_HIDDEN: '1', AGENTS_COMPANY_PLUGIN_DIRS: process.env.MINI_NOTION_TEST_PLUGIN || '', CODEX_HOME: path.join(temp, 'codex'), CODEX_BIN: path.join(root, 'test/fixtures/initialization-codex.cjs'), AC_INIT_FIXTURE: path.join(temp, 'fixture') };
for (const key of Object.keys(env)) if (key.startsWith('AGENTS_COMPANY_TOKEN') || ['ELECTRON_RUN_AS_NODE', 'AGENTS_COMPANY_SOCKET', 'AGENTS_COMPANY_EMPLOYEE', 'AGENTS_COMPANY_URL', 'AGENTS_COMPANY_PLUGIN_RPC', 'MINI_NOTION_SOCKET', 'MINI_NOTION_WORKSPACE', 'MINI_NOTION_DATA_DIR'].includes(key)) delete env[key];
const call = async (callEnv, ...args) => {
  const r = JSON.parse((await run(process.execPath, [path.join(root, 'bin/agents'), ...args, '--json'], { env: callEnv, cwd: root, timeout: 30000, maxBuffer: 16e6 })).stdout);
  assert.ok(r.ok, r.error); return r.data;
};
const cli = (...args) => call(env, ...args);
const api = (method, params = {}) => cli('plugin', 'call', 'mininotion', method, '--params', JSON.stringify(params));
const checks = [], errors = [];
const pass = label => { checks.push(label); console.log('PASS ' + label); };
let app, page, browser;
const selectedText = '选区 AI 只发送这一段';
let slashBlock = 'empty';
async function selectText(target = page) {
  await target.locator('[data-id="selection"] .bn-inline-content').click();
  await target.locator('[data-id="selection"] .bn-inline-content').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await expect(target.getByRole('button', { name: '发送选区给 Agent', exact: true })).toBeVisible();
}
async function slash() {
  await expect(page.locator(`[data-id="${slashBlock}"] .bn-inline-content`)).toHaveText('');
  await page.locator(`[data-id="${slashBlock}"] .bn-inline-content`).click();
  await page.locator(`[data-id="${slashBlock}"] .bn-inline-content`).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.type('/');
  await expect(page.getByRole('tablist', { name: '斜杠命令分类' })).toBeVisible();
}
async function dismissSlash() {
  await page.keyboard.press('Escape');
  await page.locator(`[data-id="${slashBlock}"] .bn-inline-content`).click();
  await page.locator(`[data-id="${slashBlock}"] .bn-inline-content`).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Backspace');
  await expect(page.locator(`[data-id="${slashBlock}"] .bn-inline-content`)).toHaveText('');
}
try {
  app = await electron.launch({ executablePath: process.env.AGENTS_COMPANY_TEST_APP||require('electron'), args: process.env.AGENTS_COMPANY_TEST_APP?[]:[process.env.AGENTS_COMPANY_PROFILE_APPLICATION||root], env });
  await (await app.firstWindow()).locator('.infinite-canvas').waitFor();
  const note = await api('page.create', { title: '编辑器三项验收', color: 'white', blocks: [
    { id: 'selection', type: 'paragraph', content: selectedText },
    { id: 'other', type: 'paragraph', content: '这段未选中文字不能自动发送。' },
    { id: 'empty', type: 'paragraph', content: '' },
  ] });
  const location = await api('fs.path', { pageId: note.id });
  await cli('group', 'add', '选区验收');
  const employee = await cli('card', 'create', '--title', '选区机器人', '--group', '选区验收', '--engine', 'codex', '--model', 'gpt-6-luna', '--directory-mode', 'bind', '--cwd', location.absoluteDirectory);
  await expect.poll(async () => (await cli('session', 'status', '--employee', employee.id))[0].initialization.status, { timeout: 30000 }).toBe('ready');
  fs.writeFileSync(path.join(temp, 'fixture', employee.id + '.reply.txt'), '**选区回复**：这是一条确定性测试消息。');
  const opened = app.waitForEvent('window'); const view = await cli('plugin', 'open', 'mininotion'); page = await opened;
  page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await cli('plugin', 'place', view.id, '--width', '1150', '--height', '850');
  await page.locator('.sidebar').waitFor(); await api('page.open', { pageId: note.id });
  await expect(page.getByRole('textbox', { name: '页面标题', exact: true })).toHaveValue(note.title);
  await selectText(); await page.locator('[data-test="colors"]').click();
  const menu = page.locator('.bn-color-picker-dropdown');
  await expect(menu).toBeVisible();
  assert.equal(await menu.locator('.bn-color-icon').count(), 20);
  assert.ok((await menu.locator('.bn-color-icon').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).fontSize))).every(size => size === '0px'));
  assert.equal(await menu.locator('[data-test="text-color-red"] .bn-color-icon').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(212, 76, 71)');
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'colors-light.png') });
  await menu.locator('[data-test="text-color-red"]').click();
  await expect.poll(async () => JSON.stringify((await api('block.get', { pageId: note.id, blockId: 'selection' })).content)).toContain('"textColor":"red"');
  pass('text/background swatches contain no A, match actual colors, and selection color persists through API');
  await slash();
  const tabs = page.getByRole('tablist', { name: '斜杠命令分类' });
  const boxes = await tabs.getByRole('tab').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().top));
  assert.ok(boxes.every(y => Math.abs(y - boxes[0]) < 1));
  await tabs.getByRole('tab', { name: '数据库', exact: true }).click();
  await expect(page.locator('.slash-category-items [role="option"]')).toHaveCount(3);
  await expect(page.locator('.slash-category-items')).toContainText('关联数据库视图');
  await expect(page.locator('.slash-category-menu').locator('..')).toHaveCSS('opacity', '1');
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'database-category.png') });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('.database-block, .inline-database')).toBeVisible();
  await expect.poll(async () => (await api('page.get', { pageId: note.id })).blocks.some(block => block.type === 'databaseView' && block.props.linked)).toBe(true);
  pass('horizontal database tab exposes three database actions and keyboard inserts the correct linked view');
  slashBlock = 'slash-input';
  await api('block.append', { pageId: note.id, blocks: [{ id: slashBlock, type: 'paragraph', content: '' }] });
  await slash(); await page.getByRole('button', { name: '管理命令分类' }).click();
  const manager = page.getByRole('dialog', { name: '管理命令分类' });
  await manager.getByRole('button', { name: '添加分类' }).click();
  await manager.getByRole('textbox', { name: '分类名称' }).fill('常用数据库');
  await manager.getByRole('checkbox', { name: '关联数据库视图', exact: true }).check();
  await manager.getByRole('button', { name: '保存分类' }).click();
  await expect.poll(async () => (await api('settings.get')).slashCategories?.at(-1)?.name).toBe('常用数据库');
  // Closing the manager may leave the slash trigger in the editor; clear it via Core.
  await dismissSlash();
  await slash(); await tabs.getByRole('tab', { name: '常用数据库', exact: true }).click();
  await expect(page.locator('.slash-category-items [role="option"]')).toHaveCount(1);
  const moving = tabs.getByRole('tab', { name: '数据库', exact: true }), target = tabs.getByRole('tab', { name: '基本块', exact: true });
  await moving.hover();
  await page.evaluate(() => {
    window.dragEvents = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, e => window.dragEvents.push({ type, target: e.target.outerHTML?.slice(0, 150), x: e.clientX, y: e.clientY }), true);
  });
  const from = await moving.boundingBox(), to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => (await api('settings.get')).slashCategories[0].name).toBe('数据库');
  pass('custom category membership and pointer-driven horizontal order persist in workspace settings');
  await page.getByRole('button', { name: '管理命令分类' }).click();
  await manager.getByRole('button', { name: '常用数据库', exact: true }).click();
  await manager.getByRole('textbox', { name: '分类名称' }).fill('我的命令'); await manager.getByRole('button', { name: '保存分类' }).click();
  await dismissSlash(); await slash();
  await page.getByRole('button', { name: '管理命令分类' }).click(); await manager.getByRole('button', { name: '我的命令', exact: true }).click();
  await manager.getByRole('button', { name: '删除分类' }).click(); await manager.getByRole('button', { name: '保存分类' }).click();
  await expect.poll(async () => (await api('settings.get')).slashCategories.some(c => c.name === '我的命令')).toBe(false);
  await dismissSlash(); await slash();
  await tabs.getByRole('tab', { name: '数据库', exact: true }).click(); await page.keyboard.type('red background');
  await expect(page.locator('.slash-category-items')).toContainText('红色背景');
  await dismissSlash(); pass('rename/delete preserve commands and typed search works across categories');
  await selectText(); await page.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  const chat = page.getByRole('dialog', { name: '选区 AI 聊天' });
  await expect(chat).toBeVisible(); await expect(chat.locator('.selection-ai-reply')).toContainText('选区回复');
  const transcript = await cli('session', 'transcript', '--employee', employee.id);
  const sent = transcript.items.filter(item => item.role === 'user');
  assert.equal(sent.length, 1); assert.ok(sent[0].text.includes(selectedText)); assert.ok(!sent[0].text.includes('这段未选中'));
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'selection-ai-response.png') });
  await page.getByRole('textbox', { name: '页面标题', exact: true }).click(); await expect(chat).toHaveCount(0);
  pass('one robot click sends only selection to the bound employee, shows Markdown response, and outside click dismisses');
  await selectText(); await page.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  await expect(chat.locator('.selection-ai-reply')).toContainText('选区回复');
  await chat.getByRole('button', { name: 'AI 提示词与发送设置' }).click();
  await chat.getByRole('textbox', { name: '前置提示词' }).fill('请翻译为英文：');
  await chat.getByRole('combobox', { name: 'AI 发送方式' }).selectOption('edit');
  await chat.getByRole('combobox', { name: 'AI 员工' }).selectOption(employee.id);
  await page.keyboard.press('Escape'); await expect(chat).toHaveCount(0);
  await selectText(); await page.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'AI 消息', exact: true })).toHaveValue('请翻译为英文：\n\n' + selectedText);
  assert.equal((await cli('session', 'transcript', '--employee', employee.id)).items.filter(item => item.role === 'user').length, 2);
  await chat.getByRole('textbox', { name: 'AI 消息', exact: true }).fill('手动编辑的消息');
  await chat.getByRole('button', { name: '发送 AI 消息' }).click(); await expect(chat.locator('.selection-ai-reply')).toContainText('选区回复');
  assert.equal((await cli('session', 'transcript', '--employee', employee.id)).items.filter(item => item.role === 'user').at(-1).text, '手动编辑的消息');
  await page.keyboard.press('Escape'); pass('editable prompt and two-click mode persist; manual messages send without losing the mini chat on focus');
  await page.reload(); await expect(page.getByRole('textbox', { name: '页面标题', exact: true })).toHaveValue(note.title);
  await slash(); assert.equal(await tabs.getByRole('tab').nth(1).textContent(), '数据库'); await dismissSlash();
  await selectText(); await page.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'AI 消息', exact: true })).toHaveValue('请翻译为英文：\n\n' + selectedText);
  await page.keyboard.press('Escape'); pass('classification order, AI prefix and send mode survive renderer reload');
  await api('settings.set', { theme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await selectText(); await page.locator('[data-test="colors"]').click();
  await expect(menu.locator('[data-test="text-color-red"] .bn-color-icon')).toBeVisible();
  assert.ok((await menu.locator('.bn-color-icon').evaluateAll(nodes => nodes.map(el => getComputedStyle(el).fontSize))).every(size => size === '0px'));
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'colors-dark.png') }); await page.keyboard.press('Escape');
  await selectText(); await page.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  const sendButton = chat.getByRole('button', { name: '发送 AI 消息', exact: true });
  await expect(sendButton).toBeVisible();
  assert.notEqual(await sendButton.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'selection-ai-dark.png') }); await page.keyboard.press('Escape');
  pass('light and dark swatches remain legible and the mini chat send control has a visible accent background');
  await cli('group', 'add', '插件权限验收', '--mode', 'work', '--plugin', 'mininotion');
  const probe = await cli('card', 'create', '--title', '权限测试员工', '--group', '插件权限验收', '--engine', 'codex', '--cwd', 'writer');
  await expect.poll(async () => (await cli('session', 'status', '--employee', probe.id))[0].initialization.status, { timeout: 30000 }).toBe('ready');
  const credential = await cli('auth', 'agent-token', probe.id);
  const employeeEnv = { ...env, AGENTS_COMPANY_TOKEN: credential.token, AGENTS_COMPANY_EMPLOYEE: probe.id };
  const probeNote = await call(employeeEnv, 'plugin', 'call', 'mininotion', 'page.create', '--employee', probe.id, '--params', JSON.stringify({ title: '已授权的工作区页面', color: 'white' }));
  assert.equal((await call(employeeEnv, 'plugin', 'call', 'mininotion', 'page.get', '--employee', probe.id, '--params', JSON.stringify({ pageId: probeNote.id }))).id, probeNote.id);
  await assert.rejects(call(employeeEnv, 'plugin', 'call', 'mininotion', 'assistant.send', '--employee', probe.id, '--params', JSON.stringify({ employeeId: probe.id, text: 'should reject', clientMessageId: 'denied' })), error => error.stdout?.includes('Plugin command requires user or global management authority'));
  pass('ordinary employee plugin access cannot bypass the host assistant application boundary');
  browser = await chromium.launch({ headless: true, ...(process.env.AGENTS_BROWSER_CHANNEL ? { channel: process.env.AGENTS_BROWSER_CHANNEL } : {}) });
  const web = await browser.newPage({ viewport: { width: 980, height: 760 } }); web.on('pageerror', e => errors.push(e.message));
  await web.goto(view.url); await web.getByRole('textbox', { name: '页面标题', exact: true }).waitFor();
  await selectText(web); await web.locator('[data-test="colors"]').click();
  await expect(web.locator('.bn-color-picker-dropdown [data-test="text-color-blue"] .bn-color-icon')).toBeVisible();
  await web.keyboard.press('Escape'); await selectText(web); await web.getByRole('button', { name: '发送选区给 Agent', exact: true }).click();
  await expect(web.getByRole('dialog', { name: '选区 AI 聊天' })).toBeVisible();
  await web.getByRole('textbox', { name: '页面标题', exact: true }).click(); await expect(web.getByRole('dialog', { name: '选区 AI 聊天' })).toHaveCount(0);
  await web.screenshot({ animations: 'disabled', path: path.join(out, 'browser-render.png') });
  pass('headless Chrome hosted renderer preserves swatches, mini chat focus, and outside dismissal');
  assert.deepEqual(errors, []);
} catch (error) {
  if (page) fs.writeFileSync(path.join(out, 'pointer-events.json'), JSON.stringify(await page.evaluate(() => window.dragEvents || []).catch(() => []), null, 2));
  if (page) await page.screenshot({ animations: 'disabled', path: path.join(out, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack || error)); throw error;
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, errors, temporaryHome: temp, realModelCalls: 0 }, null, 2));
  await browser?.close(); await app?.close(); fs.rmSync(temp, { recursive: true, force: true });
}
