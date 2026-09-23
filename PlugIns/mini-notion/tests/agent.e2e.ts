import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
let app: ElectronApplication, page: Page, server: any, client: any, root: any, directory: string;
let errors: string[];

test.beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-chat-ui-'));
  process.env.MINI_NOTION_AGENT_CLAUDE = `${process.execPath} ${path.resolve('tests/fixtures/agent-engine.cjs')}`;
  server = await startServer(directory);
  client = new BackendClient({ directory, autoStart: false });
  await client.call('workspace.init', { empty: true });
  root = await client.call('space.create', { title: '产品设计', engine: 'claude' });
  const env = {
    ...process.env,
    MINI_NOTION_DATA_DIR: directory,
    MINI_NOTION_TEST: '1',
    MINI_NOTION_BACKGROUND_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('.app-shell');
  await client.call('ui.command', { command: 'open-page', params: { pageId: root.id } });
  await expect(page.locator('.page-title')).toHaveValue('产品设计');
  await client.call('ui.command', { command: 'agent', params: { pageId: root.id } });
  await expect(page.locator('.agent-panel')).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  await server?.close();
  delete process.env.MINI_NOTION_AGENT_CLAUDE;
  expect(errors).toEqual([]);
  fs.rmSync(directory, { recursive: true, force: true });
});
const finished = async () => {
  await expect.poll(async () => (await client.call('agent.status', { pageId: root.id })).status).toBe('idle');
  await expect(page.locator('.agent-message.agent h2')).toHaveText('已整理好');
};
async function images() {
  for (const [name, color] of [
    ['red.png', '#e34d4d'],
    ['blue.png', '#3879c8'],
  ])
    await sharp({ create: { width: 160, height: 100, channels: 3, background: color } })
      .png()
      .toFile(path.join(directory, name));
  fs.writeFileSync(path.join(directory, 'brief.txt'), '项目：协作笔记；发布时间：周五。');
  return ['red.png', 'blue.png', 'brief.txt'].map((name) => path.join(directory, name));
}

test('drag panel, persist position via CLI, keep controls reachable and maintain Notion paper styling', async () => {
  const panel = page.locator('.agent-panel');
  const before = (await panel.boundingBox())!;
  await page.mouse.move(before.x + 140, before.y + 22);
  await page.mouse.down();
  await page.mouse.move(before.x - 180, before.y + 42, { steps: 12 });
  await page.mouse.up();
  const after = (await panel.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 80);
  await expect
    .poll(async () => (await client.call('settings.get')).agentPanelPosition?.x)
    .toBeCloseTo(after.x, 0);
  await client.call('settings.set', { changes: { agentPanelPosition: { x: 280, y: 65 } } });
  await expect.poll(async () => (await panel.boundingBox())!.x).toBe(280);
  await page.getByRole('button', { name: '关闭 Agent 面板' }).click();
  await page.getByRole('button', { name: '打开空间 Agent' }).click();
  expect((await panel.boundingBox())!.x).toBe(280);
  await page.screenshot({ path: 'test-results/agent-empty-light.png' });
});

test('multiple images and files send without text using Enter, persist and preview from chat and main page', async () => {
  const files = await images();
  await page.locator('.agent-compose input[type=file]').setInputFiles(files);
  await expect(page.locator('.agent-attachments.draft .agent-attachment')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled();
  await page.getByRole('textbox', { name: '发送给 Agent 的消息' }).press('Enter');
  await finished();
  const history = await client.call('agent.history', { pageId: root.id });
  expect(history[0].text).toBe('');
  expect(history[0].attachments).toHaveLength(3);
  await expect(page.locator('.agent-message.user .agent-attachment')).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator('.agent-message.user img')
        .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  await page.locator('.agent-message.user').getByRole('button', { name: 'brief.txt' }).click();
  await expect(page.locator('.space-preview pre')).toContainText('协作笔记');
  await page.getByRole('button', { name: '关闭 Agent 面板' }).click();
  await page.getByRole('button', { name: '关闭文件面板' }).click();
  await page.locator('.page-workspace-files').getByRole('button', { name: 'red.png' }).click();
  await expect(page.locator('.space-preview img')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.space-preview img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(160);
  await page.screenshot({ path: 'test-results/agent-file-links.png' });
});

test('mixed message via arrow, Markdown tables and tool results, page and file navigation, child uses same Agent', async () => {
  await page.locator('.agent-compose input[type=file]').setInputFiles(await images());
  await page.getByRole('textbox', { name: '发送给 Agent 的消息' }).fill('根据图片和文档整理项目');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await finished();
  await expect(page.locator('.agent-message.agent strong')).toHaveText('项目页面');
  await expect(page.locator('.agent-message.agent table')).toBeVisible();
  await expect(page.locator('.agent-activity')).toHaveCount(1);
  await page.locator('.agent-activity summary').click();
  await expect(page.locator('.agent-tool-output')).toContainText('主流程已通过 CLI 完成');
  await page.locator('.agent-message.agent').getByRole('link', { name: '项目页面' }).click();
  await expect(page.locator('.page-title')).toHaveValue('Agent 整理的项目');
  await page.getByRole('button', { name: '关闭 Agent 面板' }).click();
  await page.getByRole('button', { name: '打开空间 Agent' }).click();
  await expect(page.locator('.agent-message.user')).toContainText('根据图片和文档整理项目');
  await page.locator('.agent-message.agent').getByRole('link', { name: '摘要文件' }).click();
  await expect(page.locator('.space-preview pre')).toContainText('由 Agent 通过 CLI 创建');
  await page.getByRole('button', { name: '关闭文件面板' }).click();
  await page.screenshot({ path: 'test-results/agent-conversation-light.png' });
  await client.call('settings.set', { theme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.agent-message.user .agent-attachment').first()).toHaveCSS(
    'background-color',
    'rgb(25, 25, 25)',
  );
  await page.screenshot({ path: 'test-results/agent-conversation-dark.png' });
});

test('CLI Agent work renders in an already-open conversation with persistent complete history', async () => {
  await client.call('agent.start', { pageId: root.id, prompt: '从 Professional CLI 执行' });
  await finished();
  await expect(page.locator('.agent-message.user')).toHaveText('从 Professional CLI 执行');
  await page.reload();
  await page.waitForSelector('.app-shell');
  await client.call('ui.command', { command: 'agent', params: { pageId: root.id } });
  await expect(page.locator('.agent-message.agent h2')).toHaveText('已整理好');
  await expect(page.locator('.agent-activity')).toHaveCount(1);
  expect((await client.call('agent.status', { pageId: root.id })).sessionId).toBe('ui-session');
});

test('removing pending attachments prevents sending, IME Enter does not send and Shift Enter inserts a newline', async () => {
  await page.locator('.agent-compose input[type=file]').setInputFiles((await images()).slice(0, 1));
  await page.getByRole('button', { name: '移除 red.png' }).click();
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled();
  const input = page.getByRole('textbox', { name: '发送给 Agent 的消息' });
  await input.fill('正在输入');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  expect((await client.call('agent.history', { pageId: root.id })).length).toBe(0);
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('正在输入\n');
});

test('file drag and clipboard images accumulate, then send by arrow without text in the background', async () => {
  const paths = await images();
  const file = { name: 'red.png', bytes: [...fs.readFileSync(paths[0])] };
  await page.evaluate(({ name, bytes }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
    document
      .querySelector('.agent-panel')!
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, file);
  await page.evaluate(
    ({ name, bytes }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
      document
        .querySelector('.agent-compose textarea')!
        .dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
        );
    },
    { name: 'blue.png', bytes: [...fs.readFileSync(paths[1])] },
  );
  await expect(page.locator('.agent-attachments.draft .agent-attachment')).toHaveCount(2);
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await finished();
  const message = (await client.call('agent.history', { pageId: root.id }))[0];
  expect(message.text).toBe('');
  expect(message.attachments).toHaveLength(2);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
  ).toBe(true);
});

test('completed CLI bursts retain the entire transcript beyond the 50-message workspace cache', async () => {
  const messages = Array.from({ length: 130 }, (_, index) => ({
    id: `burst-${index}`,
    role: index % 2 ? 'agent' : 'user',
    kind: 'text',
    text: `完整记录 ${index}`,
    at: index,
  }));
  server.service.storage.appendAgentLog(root.id, messages);
  await server.service.request(
    {
      jsonrpc: '2.0',
      id: 'burst',
      method: 'agent.append',
      params: { pageId: root.id, messages, status: 'running' },
    },
    true,
  );
  await server.service.request(
    {
      jsonrpc: '2.0',
      id: 'done',
      method: 'agent.state',
      params: { pageId: root.id, changes: { status: 'idle' } },
    },
    true,
  );
  await expect(page.locator('.agent-message')).toHaveCount(130);
  await expect(page.locator('.agent-message').first()).toHaveText('完整记录 0');
  await expect(page.locator('.agent-message').last()).toHaveText('完整记录 129');
});
