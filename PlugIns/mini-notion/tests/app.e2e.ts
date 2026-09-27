import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
  type Locator,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { diffWorkspace } from '../src/core/patch';

let app: ElectronApplication;
let page: Page;
let data: string;
let errors: string[];
async function dragRecord(source: Locator, target: Locator, targetOffset?: { x: number; y: number }) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  await target.evaluate((element) => {
    const state = {
      started: false,
      accepted: false,
      log: [] as unknown[],
      controller: new AbortController(),
    };
    (window as any).recordDrag = state;
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend'])
      document.addEventListener(
        type,
        (event) => {
          const drag = event as DragEvent;
          if (type === 'dragstart') state.started = true;
          if (type === 'dragover' && element.contains(event.target as Node) && event.defaultPrevented)
            state.accepted = true;
          state.log.push({
            type,
            x: drag.clientX,
            y: drag.clientY,
            accepted: event.defaultPrevented,
            target: (event.target as HTMLElement).className,
          });
        },
        { signal: state.controller.signal },
      );
  });
  const from = await source.boundingBox();
  if (!from) throw new Error('拖动元素不可见');
  try {
    await page.mouse.move(from.x + 6, from.y + 6);
    await page.mouse.down();
    await page.mouse.move(from.x + 14, from.y + 14, { steps: 3 });
    await page.waitForFunction(() => (window as any).recordDrag.started, undefined, { timeout: 3000 });
    await target.scrollIntoViewIfNeeded();
    const to = await target.boundingBox();
    if (!to) throw new Error('拖动目标不可见');
    const destination = {
      x: to.x + (targetOffset?.x ?? to.width / 2),
      y: to.y + (targetOffset?.y ?? to.height / 2),
    };
    await page.mouse.move(destination.x, destination.y, { steps: 12 });
    await page.mouse.move(destination.x + 1, destination.y + 1);
    await page.waitForFunction(() => (window as any).recordDrag.accepted, undefined, { timeout: 3000 });
  } finally {
    await page.mouse.up();
    await page.evaluate(() => (window as any).recordDrag.controller.abort());
  }
}

const executeCLI = promisify(execFile);
async function cli(...args: string[]) {
  const executable = process.env.MINI_NOTION_EXECUTABLE || process.execPath;
  const entry = process.env.MINI_NOTION_EXECUTABLE
    ? path.resolve(process.env.MINI_NOTION_EXECUTABLE, '../../Resources/app.asar/dist-cli/cli.cjs')
    : path.resolve('dist-cli/cli.cjs');
  const { stdout } = await executeCLI(executable, [entry, '--data-dir', data, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  return JSON.parse(stdout);
}

async function launch() {
  const env = {
    ...process.env,
    MINI_NOTION_DATA_DIR: data,
    MINI_NOTION_TEST: '1',
    MINI_NOTION_BACKGROUND_TEST: '1',
    ...(process.env.MINI_NOTION_AGENT_CLAUDE
      ? { MINI_NOTION_AGENT_CLAUDE: process.env.MINI_NOTION_AGENT_CLAUDE }
      : {}),
    ...(process.env.MINI_NOTION_AGENT_CODEX
      ? { MINI_NOTION_AGENT_CODEX: process.env.MINI_NOTION_AGENT_CODEX }
      : {}),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.env.MINI_NOTION_EXECUTABLE,
    args: process.env.MINI_NOTION_EXECUTABLE ? [] : ['.'],
    env,
  });
  page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('.page-title').waitFor();
  await page.evaluate(() => {
    const log: unknown[] = [];
    (window as any).resizePointerLog = log;
    let active = false;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
      document.addEventListener(
        type,
        (event) => {
          const pointer = event as PointerEvent;
          if (type === 'pointerdown')
            active = !!(pointer.target as HTMLElement).closest('.hourly-resize,.timeline-resize');
          if (active)
            log.push({
              type,
              x: pointer.clientX,
              y: pointer.clientY,
              buttons: pointer.buttons,
              id: pointer.pointerId,
              trusted: pointer.isTrusted,
              target: (pointer.target as HTMLElement).className,
            });
          if (type === 'pointerup' || type === 'pointercancel') active = false;
        },
        true,
      );
  });
}
test.beforeEach(async () => {
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-e2e-'));
  errors = [];
  await launch();
});
test.afterEach(async () => {
  if (test.info().status !== test.info().expectedStatus && !page.isClosed())
    await test.info().attach('resize-pointer-events', {
      body: JSON.stringify(await page.evaluate(() => (window as any).resizePointerLog || []), null, 2),
      contentType: 'application/json',
    });
  if (test.info().status !== test.info().expectedStatus && !page.isClosed())
    await test.info().attach('record-drag-events', {
      body: JSON.stringify(await page.evaluate(() => (window as any).recordDrag?.log || []), null, 2),
      contentType: 'application/json',
    });
  await app?.close();
  fs.rmSync(data, { recursive: true, force: true });
  expect(errors).toEqual([]);
});

test('native workspace: create, type Chinese, rich blocks, search, relaunch, trash and restore', async () => {
  await expect(page.getByRole('textbox', { name: '页面标题', exact: true })).toHaveValue('我的空间');
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-welcome.png' });
  await page.getByRole('button', { name: '新建页面 ⌘N', exact: true }).click();
  await page.getByRole('textbox', { name: '页面标题', exact: true }).fill('离线中文测试');
  await page.getByRole('textbox', { name: '页面标题', exact: true }).press('Enter');
  await page.locator('.bn-editor').pressSequentially('Hello local notes');
  await page.locator('.bn-editor').press('Enter');
  await page.keyboard.insertText('中文输入正常，关闭后仍然保留。');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('[] ');
  await page.keyboard.insertText('完成本地保存验证');
  await expect(page.locator('.bn-editor input[type="checkbox"]')).toHaveCount(1);
  await page.locator('.bn-editor input[type="checkbox"]').check();
  await page.getByRole('button', { name: '收藏页面', exact: true }).click();
  await expect
    .poll(
      () =>
        JSON.parse(fs.readFileSync(path.join(data, 'workspace.json'), 'utf8')).pages.find(
          (p: any) => p.title === '离线中文测试',
        )?.favorite,
    )
    .toBe(true);
  await app.close();
  await launch();
  await expect(page.getByRole('textbox', { name: '页面标题', exact: true })).toHaveValue('离线中文测试');
  await expect(page.locator('.bn-editor')).toContainText('中文输入正常，关闭后仍然保留。');
  await expect(page.locator('.bn-editor input[type="checkbox"]')).toBeChecked();
  await page.getByRole('button', { name: '搜索 ⌘ K', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索所有笔记' }).fill('中文输入正常');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.getByRole('textbox', { name: '搜索所有笔记' }).press('Enter');
  await page.getByRole('button', { name: '页面更多操作' }).click();
  await page.getByRole('menuitem', { name: '移到回收站' }).click();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await page.getByRole('button', { name: '恢复 离线中文测试' }).click();
  await expect(page.locator('.trash-row')).toHaveCount(0);
});

test('database: edit properties, filter, sort, board drag and open records', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(4);
  const row = page.locator('.database-table tbody tr').filter({ hasText: '整理个人知识库' });
  await row.getByRole('button', { name: '状态', exact: true }).click();
  await page.getByRole('menuitem', { name: '已完成', exact: true }).click();
  await expect(row).toContainText('已完成');
  await page.getByRole('textbox', { name: '搜索数据库' }).fill('知识');
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await page.getByRole('textbox', { name: '搜索数据库' }).fill('');
  await page.getByRole('button', { name: '看板', exact: true }).click();
  await expect(page.locator('.board-column')).toHaveCount(4);
  const source = page.locator('.database-card').filter({ hasText: '设计自己的阅读清单' });
  const destination = page
    .locator('.board-column')
    .filter({ has: page.locator('.board-column-title', { hasText: '进行中' }) });
  await source.dragTo(destination);
  await expect(destination).toContainText('设计自己的阅读清单');
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-board.png' });
  await page.getByRole('button', { name: '新建', exact: true }).first().click();
  await page.locator('.peek-panel .page-title').fill('真正的数据库记录');
  await page.locator('.peek-panel .page-title').press('Enter');
  await page.keyboard.insertText('这一条记录也有完整的笔记正文。');
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(page.locator('.database-card').filter({ hasText: '真正的数据库记录' })).toHaveCount(1);
  await page.getByRole('button', { name: '画廊', exact: true }).click();
  await expect(page.locator('.gallery-card')).toHaveCount(5);
  await page.getByRole('button', { name: '列表', exact: true }).click();
  await expect(page.locator('.database-list-row')).toHaveCount(5);
});

test('native import/export, attachment protocol, backup and history', async () => {
  const source = path.join(data, 'example.md');
  fs.writeFileSync(source, '# 导入标题\n\n这是导入的中文笔记。\n\n- [ ] 导入待办\n');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.getByRole('button', { name: /选择文件，或将文件拖到这里/ }).click();
  await expect(page.locator('.page-title')).toHaveValue('example');
  await expect(page.locator('.bn-editor')).toContainText('这是导入的中文笔记');
  const exportPath = path.join(data, 'exported.md');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exportPath);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page
    .getByRole('dialog', { name: '导出页面' })
    .getByRole('button', { name: '导出', exact: true })
    .click();
  await expect.poll(() => fs.existsSync(exportPath)).toBe(true);
  expect(fs.readFileSync(exportPath, 'utf8')).toContain('这是导入的中文笔记');
  const asset = await page.evaluate(async () => {
    const url = await window.native!.saveAsset(
      'test.txt',
      new TextEncoder().encode('local attachment').buffer,
    );
    return { url, text: await (await fetch(url)).text() };
  });
  expect(asset.text).toBe('local attachment');
  const archive = path.join(data, 'backup.mininotion');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, archive);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与备份' }).click();
  await page.getByRole('button', { name: '导出完整备份' }).click();
  await expect.poll(() => fs.existsSync(archive)).toBe(true);
  expect(fs.statSync(archive).size).toBeGreaterThan(1000);
});

test('theme, templates, nested pages and narrow window remain usable', async () => {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '外观与 Agent', exact: true }).click();
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-dark.png' });
  await page.getByRole('button', { name: '模板', exact: true }).click();
  await page.getByRole('button', { name: /会议记录 让讨论变成清晰的行动/ }).click();
  await page.getByRole('button', { name: '使用此模板' }).click();
  await expect(page.locator('.page-title')).toHaveValue('会议记录');
  await expect(page.locator('.bn-editor')).toContainText('下一步行动');
  await page.getByRole('button', { name: '页面更多操作' }).click();
  await page.getByRole('menuitem', { name: '添加子页面' }).click();
  await page.locator('.page-title').fill('会议子页面');
  await expect(page.locator('.breadcrumbs')).toContainText('会议记录');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 680));
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-narrow.png' });
  await expect(page.locator('.page-title')).toBeInViewport();
  await page.getByRole('button', { name: '收起侧边栏 ⌘\\' }).click();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: '展开侧边栏 ⌘\\' }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
});

test('multi-column editing, syntax highlighting, page links and calendar', async () => {
  await page.getByRole('button', { name: '新建页面 ⌘N', exact: true }).click();
  await page.locator('.page-title').fill('排版与代码');
  await page.locator('.page-title').press('Enter');
  await page.keyboard.type('/');
  await page.keyboard.insertText('两列');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bn-block-column')).toHaveCount(2);
  await page.keyboard.insertText('左边的想法');
  await page.locator('.bn-block-column').nth(1).click();
  await page.keyboard.insertText('右边的计划');
  await expect(page.locator('.bn-editor')).toContainText('左边的想法');
  await expect(page.locator('.bn-editor')).toContainText('右边的计划');
  await page.getByRole('button', { name: '导入', exact: true }).click();
  const source = path.join(data, 'code.md');
  fs.writeFileSync(source, '# 示例代码\n\n```javascript\nconst answer = 42;\nconsole.log(answer);\n```\n');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  await page.getByRole('button', { name: /选择文件，或将文件拖到这里/ }).click();
  await expect(page.locator('.bn-editor')).toContainText('const answer = 42');
  await expect(page.locator('[data-content-type="codeBlock"] [style*="--shiki"]')).not.toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-code.png' });
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.getByRole('button', { name: '日历', exact: true }).click();
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  await page.getByRole('button', { name: `在 ${today} 新建`, exact: true }).click();
  await page.locator('.peek-panel .page-title').fill('日历上的任务');
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(
    page.getByRole('button', { name: `日历上的任务 ${today} 至 ${today}`, exact: true }),
  ).toBeVisible();
  const created = (await cli('page', 'list')).find((item: any) => item.title === '日历上的任务');
  expect((await cli('page', 'get', created.id)).values.date).toBe(today);
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop-calendar.png' });
});

test('backup restores all pages and attachments; page history restores content; PDF is written', async () => {
  const before = await page.evaluate(async () => {
    const { workspace } = await window.native!.load();
    const url = await window.native!.saveAsset('kept.txt', new TextEncoder().encode('retained asset').buffer);
    return { workspace, url };
  });
  const backup = path.join(data, 'roundtrip.mininotion');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backup);
  await page.evaluate(() => window.native!.exportBackup());
  await page.locator('.page-title').fill('修改后的标题');
  await page.getByRole('button', { name: '页面更多操作' }).click();
  await page.getByRole('menuitem', { name: '页面历史', exact: true }).click();
  await page.getByRole('button', { name: '恢复此版本' }).click();
  await expect(page.locator('.page-title')).toHaveValue('我的空间');
  await page.getByRole('button', { name: '新建页面 ⌘N', exact: true }).click();
  await page.locator('.page-title').fill('备份后新增');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, backup);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '数据与备份' }).click();
  await page.getByRole('button', { name: '从备份恢复' }).click();
  await expect(page.locator('.page-title')).toHaveValue('我的空间');
  const after = await page.evaluate(
    async (url) => ({
      workspace: (await window.native!.load()).workspace,
      content: await (await fetch(url)).text(),
    }),
    before.url,
  );
  expect(after.workspace!.pages.length).toBe(before.workspace!.pages.length);
  expect(after.workspace!.pages.some((p) => p.title === '备份后新增')).toBe(false);
  expect(after.content).toBe('retained asset');
  const pdf = path.join(data, 'note.pdf');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, pdf);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { includeHidden: true }).selectOption('pdf');
  await page.getByRole('dialog').getByRole('button', { name: '导出', exact: true }).click();
  await expect.poll(() => fs.existsSync(pdf)).toBe(true);
  expect(fs.readFileSync(pdf).subarray(0, 5).toString()).toBe('%PDF-');
  expect(fs.statSync(pdf).size).toBeGreaterThan(10000);
  const pdfText = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  expect(pdfText).toContain('我的空间');
  expect(pdfText).toContain('从这里开始');
  expect(pdfText).toContain('今天的小目标');
  fs.copyFileSync(pdf, 'test-results/exported-note.pdf');
});

test('database relations and rollups stay live and export calculated values', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  const addProperty = async (name: string, type: string) => {
    await page.getByRole('button', { name: '添加属性', exact: true }).click();
    await page.getByLabel('属性名称', { exact: true }).fill(name);
    await page.getByLabel('属性类型', { exact: true }).and(page.locator('select')).selectOption(type);
  };
  await addProperty('工时', 'number');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const first = page
    .locator('.database-table tbody tr')
    .filter({ has: page.locator('.database-row-title', { hasText: '整理个人知识库' }) });
  const second = page
    .locator('.database-table tbody tr')
    .filter({ has: page.locator('.database-row-title', { hasText: '设计自己的阅读清单' }) });
  await first.getByRole('spinbutton', { name: '工时' }).fill('2');
  await second.getByRole('spinbutton', { name: '工时' }).fill('5');
  await addProperty('相关事项', 'relation');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await first.getByRole('button', { name: '相关事项', exact: true }).click();
  await page.getByRole('menuitem', { name: /设计自己的阅读清单/ }).click();
  await page.keyboard.press('Escape');
  await addProperty('关联工时', 'rollup');
  await page
    .getByLabel('目标属性', { exact: true })
    .and(page.locator('select'))
    .selectOption({ label: '工时' });
  await page.getByLabel('计算方式', { exact: true }).and(page.locator('select')).selectOption('sum');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(first.locator('.property-computed')).toHaveText('5');
  await second.getByRole('spinbutton', { name: '工时' }).fill('9');
  await expect(first.locator('.property-computed')).toHaveText('9');
  const output = path.join(data, 'database.csv');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox', { includeHidden: true }).selectOption('csv');
  await page.getByRole('dialog').getByRole('button', { name: '导出', exact: true }).click();
  await expect.poll(() => fs.existsSync(output)).toBe(true);
  expect(fs.readFileSync(output, 'utf8')).toContain('"设计自己的阅读清单","9"');
});

test('imported images are local, render offline after restart, and travel with Markdown export', async () => {
  fs.copyFileSync('build/icon.png', path.join(data, 'image.png'));
  const source = path.join(data, 'images.md');
  fs.writeFileSync(source, '# 图片笔记\n\n![本地图片](image.png)\n\n图片与文字一起保存。');
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, source);
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.getByRole('button', { name: /选择文件，或将文件拖到这里/ }).click();
  await expect(page.locator('.bn-editor img')).toHaveAttribute('src', /^asset:\/\/local\//);
  await expect
    .poll(() => page.locator('.bn-editor img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1024);
  fs.unlinkSync(path.join(data, 'image.png'));
  await app.close();
  await launch();
  await page.route(/^https?:/, (route) => route.abort());
  await expect
    .poll(() => page.locator('.bn-editor img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1024);
  const output = path.join(data, 'with-images.md');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '导出', exact: true }).click();
  await expect.poll(() => fs.existsSync(output)).toBe(true);
  expect(fs.readFileSync(output, 'utf8')).toContain('with-images.assets/');
  expect(fs.readdirSync(path.join(data, 'with-images.assets'))).toHaveLength(1);
});

test('native menus, Chinese IME composition, rich formatting and find across text styles', async () => {
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()!
      .items.find((item) => item.label === '文件')!
      .submenu!.items.find((item) => item.label === '新建页面')!;
    item.click();
  });
  const title = page.locator('.page-title');
  await expect(title).toHaveValue('');
  await title.focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: '中文输入测试', selectionStart: 6, selectionEnd: 6 });
  await cdp.send('Input.insertText', { text: '中文输入测试' });
  await expect(title).toHaveValue('中文输入测试');
  await title.press('Enter');
  await page.keyboard.insertText('跨 ');
  await page.keyboard.press('Meta+b');
  await page.keyboard.insertText('格式');
  await page.keyboard.press('Meta+b');
  await page.keyboard.insertText(' 查找');
  await expect(page.locator('.bn-editor strong')).toHaveText('格式');
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()!
      .items.find((item) => item.label === '编辑')!
      .submenu!.items.find((item) => item.label === '查找…')!
      .click(),
  );
  await page.getByRole('textbox', { name: '在页面中查找', exact: true }).fill('跨 格式 查找');
  await expect(page.locator('.find-bar')).toContainText('1/1');
  await page.getByRole('button', { name: '关闭查找' }).click();
  await cdp.detach();
});

test('saved database views: create, isolate filters, duplicate, rename and survive restart', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.getByRole('button', { name: '添加视图', exact: true }).click();
  await expect(page.locator('.create-view-grid > button')).toHaveCount(10);
  await page.getByRole('textbox', { name: '新视图名称' }).fill('高优先级');
  await page.getByRole('button', { name: '创建视图', exact: true }).click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page
    .getByRole('combobox', { includeHidden: true, name: '筛选属性', exact: true })
    .selectOption('priority');
  await page.getByRole('combobox', { includeHidden: true, name: '筛选内容', exact: true }).selectOption('高');
  await page.keyboard.press('Escape');
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await page.locator('.view-tabs').getByRole('button', { name: '表格', exact: true }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(4);
  await page.locator('.view-tabs').getByRole('button', { name: '高优先级', exact: true }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await page.locator('.view-tabs').getByRole('button', { name: '高优先级', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑视图', exact: true }).click();
  await page.getByRole('textbox', { name: '视图名称', exact: true }).fill('我的重点');
  await page.keyboard.press('Escape');
  await page.locator('.view-tabs').getByRole('button', { name: '我的重点', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制视图', exact: true }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('combobox', { includeHidden: true, name: '筛选内容', exact: true }).selectOption('中');
  await page.keyboard.press('Escape');
  await expect(page.locator('.database-table tbody tr')).toHaveCount(2);
  await page.locator('.view-tabs').getByRole('button', { name: '我的重点', exact: true }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await app.close();
  await launch();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await expect(
    page.locator('.view-tabs').getByRole('button', { name: '我的重点（副本）', exact: true }),
  ).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/saved-views.png' });
});

test('timeline, chart, feed and form views work with the same live database', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  const addView = async (name: string, type: string) => {
    await page.getByRole('button', { name: '添加视图', exact: true }).click();
    await page.getByRole('textbox', { name: '新视图名称' }).fill(name);
    await page
      .locator('.create-view-grid')
      .getByRole('button', { name: new RegExp(`^${type}`) })
      .click();
    await page.getByRole('button', { name: '创建视图', exact: true }).click();
  };
  await addView('项目排期', '时间线');
  await page.locator('.view-tabs').getByRole('button', { name: '表格', exact: true }).click();
  const date = new Date();
  const dateKey = (offset: number) => {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };
  const row = page
    .locator('.database-table tbody tr')
    .filter({ has: page.locator('.database-row-title', { hasText: '整理个人知识库' }) });
  await row.getByRole('button', { name: '日期', exact: true }).click();
  await page.getByLabel('开始日期', { exact: true }).fill(dateKey(0));
  await page.getByLabel('包含结束日期', { exact: true }).check();
  await page.getByLabel('结束日期', { exact: true }).fill(dateKey(4));
  await page.locator('.date-picker-footer').getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.view-tabs').getByRole('button', { name: '项目排期', exact: true }).click();
  const editedBar = page.locator('.timeline-bar').filter({ hasText: '整理个人知识库' });
  await expect(editedBar).toHaveCount(1);
  await editedBar.locator('.timeline-resize').scrollIntoViewIfNeeded();
  const handle = await editedBar.locator('.timeline-resize').boundingBox();
  await page.mouse.move(handle!.x + 3, handle!.y + 14);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 33, handle!.y + 14, { steps: 5 });
  await page.mouse.up();
  await expect(editedBar).toHaveAttribute('title', `整理个人知识库 · ${dateKey(0)} → ${dateKey(5)}`);
  await page.screenshot({ animations: 'disabled', path: 'test-results/timeline-view.png' });
  await addView('状态分布', '图表');
  await expect(page.locator('.chart-mark')).toHaveCount(3);
  await page
    .getByRole('combobox', { includeHidden: true, name: '图表类型', exact: true })
    .selectOption('donut');
  await expect(page.locator('.donut-chart strong')).toHaveText('4');
  await page
    .locator('.chart-legend')
    .getByRole('button', { name: /进行中/ })
    .click();
  await expect(page.locator('.chart-drilldown > button')).toHaveCount(2);
  await page.screenshot({ animations: 'disabled', path: 'test-results/chart-view.png' });
  await addView('任务收集', '表单');
  await page
    .locator('.database-form')
    .getByRole('textbox', { name: '名称', exact: true })
    .fill('从本地表单提交的任务');
  await page
    .locator('.database-form')
    .getByRole('combobox', { includeHidden: true, name: '状态', exact: true })
    .selectOption('进行中');
  await page.locator('.database-form').getByRole('button', { name: '提交', exact: true }).click();
  await expect(page.locator('.form-success')).toContainText('已收到你的提交');
  await addView('最新动态', '动态');
  await expect(page.locator('.feed-record')).toHaveCount(5);
  await expect(page.locator('.feed-view')).toContainText('从本地表单提交的任务');
  await page.screenshot({ animations: 'disabled', path: 'test-results/feed-view.png' });
});

test('view property visibility, bulk editing and week calendar are configurable', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.getByRole('button', { name: '数据库设置', exact: true }).click();
  await page.getByRole('menuitem', { name: /^属性/ }).click();
  await page.getByRole('button', { name: '隐藏 优先级', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.database-table thead')).not.toContainText('优先级');
  await page.locator('.database-table tbody input[type="checkbox"]').nth(0).check();
  await page.locator('.database-table tbody input[type="checkbox"]').nth(1).check();
  await page.getByRole('combobox', { includeHidden: true, name: '批量编辑属性' }).selectOption('status');
  await page.getByRole('combobox', { includeHidden: true, name: '批量设置的值' }).selectOption('已完成');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.locator('.database-table tbody tr').nth(0)).toContainText('已完成');
  await expect(page.locator('.database-table tbody tr').nth(1)).toContainText('已完成');
  await page.locator('.view-tabs').getByRole('button', { name: '日历', exact: true }).click();
  await page.getByRole('button', { name: '数据库设置', exact: true }).click();
  await page.getByRole('menuitem', { name: /^布局/ }).click();
  await page
    .getByRole('combobox', { includeHidden: true, name: '打开页面的方式', exact: true })
    .selectOption('center');
  await page.getByLabel('日历布局').and(page.locator('select')).selectOption('week');
  await page.keyboard.press('Escape');
  await expect(page.locator('.calendar-week .calendar-day')).toHaveCount(7);
  await page.locator('.calendar-week .calendar-day-top > button').first().click();
  await expect(page.locator('.center-peek .peek-panel')).toBeVisible();
});

test('formula editor previews, stores and recalculates styled formula properties', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.getByRole('button', { name: '添加属性', exact: true }).click();
  await page.getByLabel('属性名称', { exact: true }).fill('进展提示');
  await page
    .getByRole('combobox', { includeHidden: true, name: '属性类型', exact: true })
    .selectOption('formula');
  await page.getByRole('button', { name: '编辑公式', exact: true }).click();
  await page
    .getByRole('textbox', { name: '公式表达式' })
    .fill('if(prop("状态") == "已完成", "完成".style("green", "b"), "推进中")');
  await expect(page.locator('.formula-validity')).toContainText('公式有效');
  await expect(page.locator('.formula-preview-row')).toHaveCount(4);
  await page.screenshot({ animations: 'disabled', path: 'test-results/formula-editor.png' });
  await page.getByRole('button', { name: '保存公式', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const row = page
    .locator('.database-table tbody tr')
    .filter({ has: page.locator('.database-row-title', { hasText: '整理个人知识库' }) });
  await expect(row.locator('.property-computed')).toHaveText('推进中');
  await row.getByRole('button', { name: '状态', exact: true }).click();
  await page.getByRole('menuitem', { name: '已完成', exact: true }).click();
  await expect(row.locator('.property-computed')).toHaveText('完成');
  await app.close();
  await launch();
  await expect(
    page
      .locator('.database-table tbody tr')
      .filter({ has: page.locator('.database-row-title', { hasText: '整理个人知识库' }) })
      .locator('.property-computed'),
  ).toHaveText('完成');
});

test('inline databases edit shared data while linked views keep their own configuration', async () => {
  await page.getByRole('button', { name: '新建页面 ⌘N', exact: true }).click();
  await page.locator('.page-title').fill('工作台');
  await page.locator('.page-title').press('Enter');
  await page.keyboard.type('/');
  await page.keyboard.insertText('内联数据库');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.inline-database')).toHaveCount(1);
  await page.getByRole('textbox', { name: '内联数据库名称' }).fill('工作台任务');
  const original = page.locator('.inline-database').first();
  await original.locator('.database-new').click();
  await page.locator('.peek-panel .page-title').fill('内联记录 A');
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(original.locator('.database-table tbody tr')).toHaveCount(1);
  await page.locator('.note-editor .bn-editor [data-content-type="paragraph"]').last().click();
  await page.keyboard.type('/');
  await page.keyboard.insertText('关联数据库');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '选择一个数据库，创建关联视图' }).click();
  await page.getByRole('menuitem', { name: /工作台任务/ }).click();
  await expect(page.locator('.inline-database')).toHaveCount(2);
  const linked = page.locator('.inline-database').nth(1);
  await expect(linked.locator('.database-table tbody tr')).toHaveCount(1);
  await linked.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page.getByRole('textbox', { name: '筛选内容', exact: true }).fill('不会匹配');
  await page.keyboard.press('Escape');
  await expect(linked.locator('.database-table tbody tr')).toHaveCount(0);
  await expect(original.locator('.database-table tbody tr')).toHaveCount(1);
  await app.close();
  await launch();
  await expect(page.locator('.inline-database')).toHaveCount(2);
  await expect(page.locator('.inline-database').first().locator('.database-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.inline-database').nth(1).locator('.database-table tbody tr')).toHaveCount(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/inline-databases.png' });
});

test('feed edits remain synchronized with an open side preview', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.locator('.view-tabs').getByRole('button', { name: '动态', exact: true }).click();
  const feed = page
    .locator('.feed-record')
    .filter({ has: page.locator('.feed-record-title', { hasText: '整理个人知识库' }) });
  await feed.getByRole('button', { name: '打开 整理个人知识库', exact: true }).click();
  await feed.getByRole('checkbox', { name: '归档已有资料', exact: true }).check();
  await expect(page.locator('.peek-panel .bn-editor input[type="checkbox"]').first()).toBeChecked();
  await page.locator('.peek-panel .bn-editor [data-content-type="paragraph"]').first().click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('同步验证');
  await expect(feed).toContainText('同步验证');
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(feed.getByRole('checkbox', { name: '归档已有资料', exact: true })).toBeChecked();
});

test('charts render negative numeric values instead of discarding them', async () => {
  await page.locator('.sidebar-page[data-page-id="projects"]').click();
  await page.getByRole('button', { name: '添加属性', exact: true }).click();
  await page.getByLabel('属性名称', { exact: true }).fill('净变化');
  await page
    .getByRole('combobox', { includeHidden: true, name: '属性类型', exact: true })
    .selectOption('number');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page
    .locator('.database-table tbody tr')
    .nth(0)
    .getByRole('spinbutton', { name: '净变化' })
    .fill('10');
  await page
    .locator('.database-table tbody tr')
    .nth(1)
    .getByRole('spinbutton', { name: '净变化' })
    .fill('-6');
  await page.locator('.view-tabs').getByRole('button', { name: '图表', exact: true }).click();
  await page.getByRole('combobox', { includeHidden: true, name: '图表计算' }).selectOption('sum');
  await page
    .getByRole('combobox', { includeHidden: true, name: '图表数值属性' })
    .selectOption({ label: '净变化' });
  const negative = page.getByRole('button', { name: '未开始 -6', exact: true }).locator('rect');
  expect(Number(await negative.getAttribute('height'))).toBeGreaterThan(20);
  await page.screenshot({ animations: 'disabled', path: 'test-results/chart-negative.png' });
});

test('CLI and GUI synchronize rich blocks, planner drag, completion, calendar navigation and search', async () => {
  const note = await cli('page', 'create', '--title', 'CLI 新笔记', '--color', 'white');
  await expect(page.locator(`.sidebar-page[data-page-id="${note.id}"]`)).toBeVisible();
  await cli('page', 'open', note.id);
  await expect(page.locator('.page-title')).toHaveValue('CLI 新笔记');
  await cli(
    'block',
    'append',
    note.id,
    '--type',
    'heading',
    '--text',
    '命令插入标题',
    '--props',
    '{"level":2}',
  );
  await expect(page.locator('.bn-editor')).toContainText('命令插入标题');
  await Promise.all([
    page.locator('.page-title').fill('GUI 改标题'),
    cli('block', 'append', note.id, '--text', 'CLI 同时补充正文'),
  ]);
  await expect(page.locator('.bn-editor')).toContainText('CLI 同时补充正文');
  await expect.poll(async () => (await cli('page', 'get', note.id)).title).toBe('GUI 改标题');
  const db = await cli(
    'database',
    'create',
    '--title',
    '每周计划',
    '--view',
    'plan',
    '--columns',
    JSON.stringify([
      { id: 'date', name: '日期', type: 'date' },
      { id: 'done', name: '完成', type: 'checkbox' },
      { id: 'tag', name: '领域', type: 'select', options: ['工作', '生活'] },
    ]),
    '--color',
    'white',
  );
  const viewId = db.database.views[0].id;
  await cli(
    'view',
    'update',
    db.id,
    viewId,
    '--changes',
    JSON.stringify({ dateAnchor: '2026-09-10', calendarBy: 'date', planDoneBy: 'done' }),
  );
  const scheduled = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '周四交付',
    '--values',
    '{"date":"2026-09-10","tag":"工作"}',
    '--color',
    'white',
  );
  const backlog = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '安排读书',
    '--values',
    '{"tag":"生活"}',
    '--color',
    'white',
  );
  await cli(
    'record',
    'create',
    db.id,
    '--title',
    '处理上周事项',
    '--values',
    '{"date":"2026-09-01"}',
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await expect(page.locator('.plan-view')).toBeVisible();
  await expect(page.locator('.plan-schedule .plan-lane')).toHaveCount(7);
  await expect(page.locator('.plan-overdue')).toContainText('处理上周事项');
  await page.getByRole('checkbox', { name: '完成 周四交付', exact: true }).check();
  await expect.poll(async () => (await cli('page', 'get', scheduled.id)).values.done).toBe(true);
  await dragRecord(
    page.locator(`.plan-card[data-record-id="${backlog.id}"]`),
    page.locator('.plan-schedule .plan-lane[data-date="2026-09-11"]'),
  );
  await expect.poll(async () => (await cli('page', 'get', backlog.id)).values.date).toBe('2026-09-11');
  await expect(page.locator('.plan-schedule .plan-lane[data-date="2026-09-11"]')).toContainText('安排读书');
  await page.screenshot({ animations: 'disabled', path: 'test-results/planner-week.png' });
  await page.getByRole('combobox', { includeHidden: true, name: '计划布局' }).selectOption('agenda');
  await expect.poll(async () => (await cli('view', 'list', db.id))[0].planMode).toBe('agenda');
  await cli('view', 'navigate', db.id, viewId, '--direction', 'next');
  await expect(page.locator('.plan-controls')).toContainText('2026-09-14');
  const calendar = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'calendar',
    '--config',
    '{"dateAnchor":"2026-09-10","calendarMode":"week","calendarBy":"date"}',
  );
  await expect(page.locator('.calendar-grid')).toBeVisible();
  await cli('view', 'navigate', db.id, calendar.id, '--date', '2026-10-15');
  await expect(page.locator('.calendar-controls')).toContainText('2026 年 10 月');
  await cli('ui', 'command', 'search', '--params', '{"query":"安排读书"}');
  await expect(page.getByRole('textbox', { name: '搜索所有笔记' })).toHaveValue('安排读书');
  await expect(page.locator('.search-result')).toHaveCount(1);
});

test('CLI conflict resolution releases GUI drafts, including drafts restored after closing the app', async () => {
  const note = await cli('page', 'create', '--title', '并发原文', '--color', 'white');
  await cli('page', 'open', note.id);
  await expect(page.locator('.page-title')).toHaveValue('并发原文');
  for (const offline of [false, true]) {
    const before = await cli('workspace', 'get');
    const draft = structuredClone(before);
    draft.pages.find((value: any) => value.id === note.id).title = '保留的 GUI 草稿';
    const patch = diffWorkspace(before, draft);
    await cli('page', 'update', note.id, '--title', offline ? '关闭期间的 CLI 版本' : '在线 CLI 版本');
    const response = await page.evaluate((patch) => window.native!.api('workspace.patch', { patch }), patch);
    expect(response.error?.code).toBe('CONFLICT');
    const id = response.error!.details.conflictId;
    await page.evaluate(
      ({ patch, id }) =>
        localStorage.setItem(
          'mini-notion-pending',
          JSON.stringify({ patches: [patch], conflictId: id, error: '待处理并发草稿' }),
        ),
      { patch, id },
    );
    await page.reload();
    await expect(page.locator('.page-title')).toHaveValue('保留的 GUI 草稿');
    await expect(page.locator('.save-status')).toContainText('有并发草稿');
    if (offline) {
      await page.evaluate(() => {
        (window as any).originalStorageSet = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
          throw new DOMException('草稿存储已满', 'QuotaExceededError');
        };
      });
      try {
        await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.close(); window.close(); });
        await expect
          .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()))
          .toContain('草稿存储已满');
        expect(page.isClosed()).toBe(false);
        expect(await page.evaluate(() => localStorage.getItem('mini-notion-pending'))).not.toBeNull();
        await app.evaluate(({ app, BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setTitle('正在检验退出保存'); app.quit(); app.quit(); window.close(); });
        await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toContain('草稿存储已满');
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
      } finally {
        await page.evaluate(() => {
          Storage.prototype.setItem = (window as any).originalStorageSet;
        });
      }
      await app.close();
    }
    await cli('conflict', 'resolve', id, '--strategy', 'remote');
    if (offline) await launch();
    await expect(page.locator('.page-title')).toHaveValue(offline ? '关闭期间的 CLI 版本' : '在线 CLI 版本');
    await expect(page.locator('.save-status')).toContainText('已保存到本机');
    expect(await page.evaluate(() => localStorage.getItem('mini-notion-pending'))).toBeNull();
  }
});

test('database templates use the full editor and share defaults between GUI and CLI', async () => {
  const db = await cli('database', 'create', '--title', '模板项目', '--color', 'white');
  await cli('page', 'open', db.id);
  await page.getByRole('button', { name: '新建模板与选项' }).click();
  await page.getByRole('menuitem', { name: '新建模板', exact: true }).click();
  await expect(page.locator('.template-edit-banner')).toBeVisible();
  await page.locator('.page-title').fill('会议记录模板');
  await page.locator('.page-properties').getByRole('button', { name: '状态', exact: true }).click();
  await page.getByRole('menuitem', { name: '进行中', exact: true }).click();
  await page.locator('.page-title').press('Enter');
  await page.keyboard.insertText('固定议程：回顾、讨论、行动。');
  await page.getByRole('button', { name: '完成编辑 → 返回数据库' }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(0);
  const templates = await cli('template', 'list', '--database-id', db.id);
  expect(templates).toHaveLength(1);
  const template = templates[0];
  await page.getByRole('button', { name: '新建模板与选项' }).click();
  await page.getByRole('button', { name: '会议记录模板 的模板操作' }).click();
  await page.getByRole('menuitem', { name: '设为数据库的默认模板' }).click();
  await page.keyboard.press('Escape');
  await page.locator('.database-new').click();
  await expect(page.locator('.peek-panel .page-title')).toHaveValue('会议记录模板');
  await expect(page.locator('.peek-panel .bn-editor')).toContainText('固定议程');
  await expect(page.locator('.peek-panel .page-properties')).toContainText('进行中');
  await page.getByRole('button', { name: '关闭预览' }).click();
  const cliRow = await cli('record', 'create', db.id, '--title', 'CLI 使用默认模板', '--color', 'white');
  expect(cliRow.values.status).toBe('进行中');
  expect(JSON.stringify(cliRow.blocks)).toContain('固定议程');
  await expect(page.locator('.database-table tbody tr')).toHaveCount(2);
  await cli(
    'template',
    'update',
    template.id,
    '--blocks',
    '[{"type":"paragraph","content":"更新后的模板正文"}]',
  );
  await page.locator('.database-new').click();
  await expect(page.locator('.peek-panel .bn-editor')).toContainText('更新后的模板正文');
  await page.screenshot({ animations: 'disabled', path: 'test-results/database-template-record.png' });
  await page.getByRole('button', { name: '关闭预览' }).click();
  await cli('template', 'delete', template.id);
  await page.locator('.database-new').click();
  await expect(page.locator('.peek-panel .page-title')).toHaveValue('');
  expect(await cli('template', 'list', '--database-id', db.id)).toHaveLength(0);
});

test('sub-items, card previews, timeline dependencies and automatic scheduling work in GUI and CLI', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '项目排期',
    '--columns',
    JSON.stringify([
      { id: 'start', name: '开始', type: 'date' },
      { id: 'end', name: '结束', type: 'date' },
      { id: 'points', name: '分数', type: 'number' },
    ]),
    '--color',
    'white',
  );
  const a = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '前置任务',
    '--values',
    '{"start":"2026-09-07","end":"2026-09-08"}',
    '--color',
    'white',
  );
  const b = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '后续任务',
    '--values',
    '{"start":"2026-09-09","end":"2026-09-10"}',
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  const structureSettings = async () => {
    await page.getByRole('button', { name: '数据库设置', exact: true }).click();
    await page.getByRole('menuitem', { name: '子项目与依赖', exact: true }).click();
  };
  await structureSettings();
  await page.getByRole('switch', { name: '启用子项目' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '为 前置任务 添加子项目' }).click();
  await page.locator('.peek-panel .page-title').fill('设计子任务');
  await page.locator('.peek-panel').getByRole('spinbutton', { name: '分数' }).fill('5');
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: '折叠 前置任务 的子项目' }).click();
  await expect(page.locator('.database-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '展开 前置任务 的子项目' }).click();
  const children = await cli('subitem', 'children', a.id);
  expect(children).toHaveLength(1);
  expect(children[0].values.points).toBe(5);
  await page.screenshot({ animations: 'disabled', path: 'test-results/database-subitems.png' });
  const board = await cli('view', 'create', db.id, '--type', 'board');
  await expect(page.locator('.database-card')).toHaveCount(2);
  await expect(page.locator('.card-subitems')).toContainText('设计子任务');
  await cli(
    'view',
    'update',
    db.id,
    board.id,
    '--changes',
    '{"subItemDisplay":"flat","subItemFilter":"all"}',
  );
  await expect(page.locator('.database-card')).toHaveCount(3);
  await cli(
    'view',
    'create',
    db.id,
    '--type',
    'timeline',
    '--config',
    '{"calendarBy":"start","timelineEnd":"end","dateAnchor":"2026-09-01"}',
  );
  await structureSettings();
  await page.getByRole('switch', { name: '启用依赖关系' }).click();
  await page.getByRole('combobox', { includeHidden: true, name: '依赖结束日期' }).selectOption('end');
  await page
    .getByRole('combobox', { includeHidden: true, name: '自动调整依赖日期' })
    .selectOption('maintain');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '从 前置任务 创建依赖', exact: true }).click();
  await page.getByRole('menuitem', { name: '后续任务', exact: true }).click();
  await expect(page.locator('.peek-panel')).toHaveCount(0);
  await expect(page.locator('.dependency-edge')).toHaveCount(1);
  expect(await cli('dependency', 'list', db.id)).toEqual([{ from: a.id, to: b.id }]);
  await cli('record', 'update', a.id, '--values', '{"start":"2026-09-10","end":"2026-09-11"}');
  await expect(page.locator(`[data-timeline-id="${b.id}"]`)).toHaveAttribute(
    'aria-label',
    /2026-09-12 至 2026-09-13/,
  );
  expect((await cli('page', 'get', b.id)).values.start).toBe('2026-09-12');
  await page.screenshot({ animations: 'disabled', path: 'test-results/timeline-dependencies.png' });
  await cli('history', 'undo', '--page-id', a.id);
  await expect(page.locator(`[data-timeline-id="${b.id}"]`)).toHaveAttribute(
    'aria-label',
    /2026-09-09 至 2026-09-10/,
  );
  await expect(cli('dependency', 'add', a.id, b.id)).rejects.toThrow(/循环/);
});

test('calendar ranges span weeks, drag without losing duration, and share scheduling with the planner', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '跨日安排',
    '--view',
    'calendar',
    '--columns',
    '[{"id":"start","name":"开始","type":"date"},{"id":"end","name":"结束","type":"date"}]',
    '--color',
    'white',
  );
  const view = db.database.views[0];
  await cli(
    'view',
    'update',
    db.id,
    view.id,
    '--changes',
    '{"calendarBy":"start","timelineEnd":"end","dateAnchor":"2026-09-11"}',
  );
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '跨周发布',
    '--values',
    '{"start":"2026-09-10","end":"2026-09-15"}',
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await expect(page.locator(`.calendar-event[data-calendar-id="${row.id}"]`)).toHaveCount(2);
  await expect(page.getByRole('combobox', { includeHidden: true, name: '日历结束日期' })).toHaveValue('end');
  await page.screenshot({ animations: 'disabled', path: 'test-results/calendar-ranges.png' });
  const first = page.locator(`.calendar-event[data-calendar-id="${row.id}"]`).first();
  const target = page.locator('.calendar-day[data-date="2026-09-17"]');
  await dragRecord(first, target, { x: 30, y: 15 });
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.start).toBe('2026-09-17');
  expect((await cli('page', 'get', row.id)).values.end).toBe('2026-09-22');
  await cli('record', 'schedule', row.id, '2026-09-07', '--end', '2026-09-09');
  await expect(page.locator(`.calendar-event[data-calendar-id="${row.id}"]`)).toHaveCount(1);
  await expect(page.locator(`.calendar-event[data-calendar-id="${row.id}"]`)).toHaveAttribute(
    'aria-label',
    /2026-09-07 至 2026-09-09/,
  );
  const plan = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'plan',
    '--config',
    '{"calendarBy":"start","timelineEnd":"end","dateAnchor":"2026-09-08","planMode":"agenda"}',
  );
  await expect(page.locator(`.plan-card[data-record-id="${row.id}"]`)).toHaveCount(3);
  const rendered = await cli('view', 'render', db.id, '--view-id', plan.id);
  expect(rendered.days.filter((day: any) => day.records.includes(row.id))).toHaveLength(3);
  await page.locator('.schedule-fields > summary').click();
  await page.getByRole('combobox', { includeHidden: true, name: '计划结束日期' }).selectOption('');
  await expect(page.locator(`.plan-card[data-record-id="${row.id}"]`)).toHaveCount(1);
  expect((await cli('view', 'list', db.id)).find((view: any) => view.id === plan.id).timelineEnd).toBe('');
});

test('page and selected-block comments synchronize between the sidebar and CLI', async () => {
  const note = await cli(
    'page',
    'create',
    '--title',
    '评论验证',
    '--blocks',
    '[{"type":"paragraph","content":"这是需要评审的正文。"}]',
    '--color',
    'white',
  );
  await cli('page', 'open', note.id);
  await page.getByRole('button', { name: '打开页面评论' }).click();
  await page.getByRole('textbox', { name: '新评论' }).fill('请确认这版内容。');
  await page.locator('.new-comment').getByRole('button', { name: '评论', exact: true }).click();
  await expect(page.locator('.comment-text')).toContainText('请确认这版内容。');
  const thread = (await cli('comment', 'list', note.id))[0];
  await page.locator('.comment-reply textarea').fill('已确认，继续推进。');
  await page.locator('.comment-reply').getByRole('button', { name: '回复', exact: true }).click();
  await expect.poll(async () => (await cli('comment', 'get', note.id, thread.id)).messages.length).toBe(2);
  await cli('comment', 'update', note.id, thread.id, thread.messages[0].id, '--text', 'CLI 已更新评论');
  await expect(page.locator('.comment-text').first()).toHaveText('CLI 已更新评论');
  await page.getByRole('button', { name: '解决讨论', exact: true }).click();
  await expect(page.locator('.comment-thread')).toHaveCount(0);
  await page.getByRole('combobox', { includeHidden: true, name: '评论状态' }).selectOption('resolved');
  await page.getByRole('button', { name: '重新打开讨论' }).click();
  await page.getByRole('combobox', { includeHidden: true, name: '评论状态' }).selectOption('open');
  await page.getByRole('button', { name: '添加表情反馈' }).first().click();
  await page.locator('.comment-reactions').getByRole('button', { name: '👍', exact: true }).click();
  expect((await cli('comment', 'get', note.id, thread.id)).messages[0].reactions['👍']).toBe(true);
  await page.getByRole('button', { name: '关闭评论' }).click();
  await page.locator('.bn-editor').click();
  await page.keyboard.press('Meta+a');
  await page.getByRole('button', { name: '评论所选内容' }).click();
  await expect(page.locator('.comment-new-quote')).toContainText('需要评审');
  await page.getByRole('textbox', { name: '新评论' }).fill('针对原文的批注');
  await page.locator('.new-comment').getByRole('button', { name: '评论', exact: true }).click();
  const anchored = (await cli('comment', 'list', note.id)).find((thread: any) => thread.blockId);
  expect(anchored.blockId).toBe(note.blocks[0].id);
  await page.screenshot({ animations: 'disabled', path: 'test-results/comments-sidebar.png' });
});

test('synced blocks edit inline, share CLI changes, paste as references and detach independently', async () => {
  const a = await cli('page', 'create', '--title', '同步甲', '--color', 'white');
  const b = await cli('page', 'create', '--title', '同步乙', '--color', 'white');
  const c = await cli('page', 'create', '--title', '同步丙', '--color', 'white');
  await cli('page', 'open', a.id);
  await page.locator('.page-title').press('Enter');
  await page.keyboard.type('/');
  await page.keyboard.insertText('同步块');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.synced-block-editor .bn-editor')).toHaveCount(1);
  await page.locator('.synced-block-editor .bn-editor').click();
  await page.keyboard.insertText('统一规范第一版');
  await expect.poll(async () => (await cli('sync', 'list'))[0]?.preview).toContain('统一规范第一版');
  const source = (await cli('sync', 'list'))[0];
  await page.getByRole('button', { name: '同步到其他页面', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索同步目标页面' }).fill('同步乙');
  await page.getByRole('menuitem', { name: '同步乙', exact: true }).click();
  await cli('page', 'open', b.id);
  await expect(page.locator('.synced-block-editor .bn-editor')).toContainText('统一规范第一版');
  const block = (await cli('block', 'list', source.id))[0];
  await cli('block', 'update', source.id, block.id, '--text', '来自 CLI 的统一规范');
  await expect(page.locator('.synced-block-editor .bn-editor')).toContainText('来自 CLI 的统一规范');
  await cli('sync', 'link', source.id, b.id);
  const editors = page.locator('.synced-block-editor .bn-editor');
  await expect(editors).toHaveCount(2);
  await editors.first().click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.insertText('在任意引用处编辑');
  await expect(editors.nth(1)).toContainText('在任意引用处编辑');
  await editors.first().click();
  await app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()!
      .items.flatMap((item) => item.submenu?.items || [])
      .find((item) => item.label === '全选')!;
    item.click();
  });
  await page.keyboard.insertText('原生菜单只编辑共享正文');
  await expect(editors.nth(1)).toHaveText('原生菜单只编辑共享正文');
  await editors.first().click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.insertText('在任意引用处编辑');
  await page.screenshot({ animations: 'disabled', path: 'test-results/synced-inline.png' });
  // Keep the system clipboard intact while testing the exact copy payload and paste handler.
  await page.evaluate(() => {
    navigator.clipboard.write = async (items) => {
      const item = items[0];
      (window as any).copiedSyncHTML = await (await item.getType('text/html')).text();
    };
  });
  await page.getByRole('button', { name: '复制并同步', exact: true }).first().click();
  await expect
    .poll(() => page.evaluate(() => (window as any).copiedSyncHTML || ''))
    .toContain('data-mini-notion-sync');
  const html = await page.evaluate(() => (window as any).copiedSyncHTML);
  await cli('page', 'open', c.id);
  await expect(page.locator('.page-title')).toHaveValue(c.title);
  await page.locator('.bn-editor').click();
  await page.locator('.bn-editor').evaluate((element, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, html);
  await expect(page.locator('.synced-block')).toHaveCount(1);
  await expect(page.locator('.synced-block-editor .bn-editor')).toContainText('在任意引用处编辑');
  await page.getByRole('button', { name: '同步块操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '取消此处同步', exact: true }).click();
  await expect(page.locator('.synced-block')).toHaveCount(0);
  await cli('block', 'update', source.id, block.id, '--text', '同步源继续更新');
  await expect(page.locator('.bn-editor')).toContainText('在任意引用处编辑');
});

test('date picker ranges and time zones stay consistent with CLI, calendar, formulas and timeline resizing', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '日期与时区',
    '--columns',
    JSON.stringify([
      { id: 'date', name: '日期', type: 'date' },
      {
        id: 'duration',
        name: '分钟',
        type: 'formula',
        formula: 'dateBetween(dateEnd(prop("日期")),dateStart(prop("日期")),"minutes")',
      },
    ]),
    '--color',
    'white',
  );
  const row = await cli('record', 'create', db.id, '--title', '跨日会议', '--color', 'white');
  await cli('page', 'open', db.id);
  await page.locator('.database-table tbody').getByRole('button', { name: '日期', exact: true }).click();
  await page.getByLabel('开始日期', { exact: true }).fill('2026-09-11');
  await page.getByLabel('包含结束日期', { exact: true }).check();
  await page.getByLabel('结束日期', { exact: true }).fill('2026-09-14');
  await page.getByLabel('包含时间', { exact: true }).check();
  await page
    .getByLabel('日期时区', { exact: true })
    .and(page.locator('select'))
    .selectOption('Asia/Shanghai');
  await page.getByLabel('开始日期', { exact: true }).fill('2026-09-11T09:30');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-09-14T10:15');
  await expect
    .poll(async () => (await cli('page', 'get', row.id)).values.date.end)
    .toBe('2026-09-14T10:15+08:00');
  const before = (await cli('page', 'get', row.id)).values.date;
  await page.getByLabel('日期时区', { exact: true }).and(page.locator('select')).selectOption('UTC');
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue('2026-09-11T01:30');
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.date.timeZone).toBe('UTC');
  const utc = (await cli('page', 'get', row.id)).values.date;
  expect(Date.parse(utc.start)).toBe(Date.parse(before.start));
  await page.screenshot({ animations: 'disabled', path: 'test-results/date-range-picker.png' });
  await page.locator('.date-picker-footer').getByRole('button', { name: '完成', exact: true }).click();
  const computed = await cli(
    'formula',
    'evaluate',
    row.id,
    '--expression',
    'dateBetween(dateEnd(prop("日期")),dateStart(prop("日期")),"minutes")',
  );
  expect(computed).toBe(4365);
  const calendar = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'calendar',
    '--name',
    '跨日日历',
    '--config',
    '{"calendarBy":"date","dateAnchor":"2026-09-11"}',
  );
  await cli('page', 'open', db.id, '--view-id', calendar.id);
  await expect(page.locator('.calendar-event')).toHaveCount(2);
  const timeline = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'timeline',
    '--name',
    '时区时间线',
    '--config',
    '{"calendarBy":"date","dateAnchor":"2026-09-01","timelineScale":"month"}',
  );
  await cli('page', 'open', db.id, '--view-id', timeline.id);
  const resize = page.locator('.timeline-resize');
  await resize.scrollIntoViewIfNeeded();
  const rect = await resize.boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect!.x + rect!.width / 2 + 60, rect!.y + rect!.height / 2, { steps: 8 });
  await page.evaluate(() => {
    const down = (window as any).resizePointerLog.filter((event: any) => event.type === 'pointerdown').at(-1);
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: down.id,
        clientX: 1300,
        clientY: 0,
        buttons: 0,
        bubbles: true,
      }),
    );
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await cli('page', 'get', row.id)).values.date.end)
    .toBe('2026-09-16T02:15+00:00');
  await cli(
    'record',
    'schedule',
    row.id,
    '2026-09-20T08:00',
    '--end',
    '2026-09-20T09:00',
    '--time-zone',
    'Asia/Shanghai',
  );
  await page.locator('.timeline-bar').click();
  await expect(page.locator('.peek-panel .date-property-value')).toContainText(
    '2026-09-20 08:00 → 2026-09-20 09:00',
  );
});

test('hourly planner moves, resizes and completes real timed records with matching CLI output', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '小时计划',
    '--view',
    'plan',
    '--columns',
    JSON.stringify([
      { id: 'date', name: '日期', type: 'date' },
      { id: 'done', name: '完成', type: 'checkbox' },
    ]),
    '--color',
    'white',
  );
  const view = (await cli('view', 'list', db.id))[0];
  await cli(
    'view',
    'update',
    db.id,
    view.id,
    '--changes',
    JSON.stringify({
      planMode: 'hourWeek',
      timeZone: 'Asia/Shanghai',
      dateAnchor: '2026-09-11',
      calendarBy: 'date',
    }),
  );
  const a = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '设计评审',
    '--values',
    JSON.stringify({
      date: { start: '2026-09-11T09:00+08:00', end: '2026-09-11T10:00+08:00', timeZone: 'Asia/Shanghai' },
    }),
    '--color',
    'white',
  );
  const b = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '产品讨论',
    '--values',
    JSON.stringify({
      date: { start: '2026-09-11T09:30+08:00', end: '2026-09-11T10:30+08:00', timeZone: 'Asia/Shanghai' },
    }),
    '--color',
    'white',
  );
  const unplanned = await cli('record', 'create', db.id, '--title', '安排阅读', '--color', 'white');
  await cli('page', 'open', db.id);
  await expect(page.locator('.hourly-day')).toHaveCount(7);
  await page.getByLabel('计划布局', { exact: true }).and(page.locator('select')).selectOption('hourDay');
  await expect(page.locator('.hourly-day')).toHaveCount(1);
  await page.locator('.hourly-scroll').scrollIntoViewIfNeeded();
  const eventA = page.locator(`[data-time-event="${a.id}"]`),
    eventB = page.locator(`[data-time-event="${b.id}"]`);
  const boxA = await eventA.boundingBox(),
    boxB = await eventB.boundingBox();
  expect(boxA!.x + boxA!.width).toBeLessThanOrEqual(boxB!.x);
  await page.screenshot({ animations: 'disabled', path: 'test-results/hourly-overlap.png' });
  const dragToMinute = async (source: Locator, minute: number) => {
    await page.locator('.hourly-scroll').evaluate((element, minute) => {
      element.scrollTop = Math.max(0, minute - 180) * 0.9;
    }, minute);
    await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox();
    await page.mouse.move(from!.x + 8, from!.y + 6);
    await page.mouse.down();
    await page.mouse.move(from!.x + 18, from!.y + 16, { steps: 3 });
    const target = await page.locator('.hourly-slots').boundingBox();
    await page.mouse.move(target!.x + target!.width * 0.7, target!.y + minute * 0.9, { steps: 12 });
    await page.mouse.move(target!.x + target!.width * 0.7 + 1, target!.y + minute * 0.9 + 1);
    await page.mouse.up();
  };
  await dragToMinute(eventA, 11 * 60 + 15);
  await expect
    .poll(async () => (await cli('page', 'get', a.id)).values.date.start)
    .toBe('2026-09-11T11:15+08:00');
  expect((await cli('page', 'get', a.id)).values.date.end).toBe('2026-09-11T12:15+08:00');
  const resize = eventA.locator('.hourly-resize');
  const handle = await resize.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 3);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 30, { steps: 6 });
  await page.evaluate(() => {
    const down = (window as any).resizePointerLog.filter((event: any) => event.type === 'pointerdown').at(-1);
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: down.id,
        clientX: 0,
        clientY: 0,
        buttons: 0,
        bubbles: true,
      }),
    );
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await cli('page', 'get', a.id)).values.date.end)
    .toBe('2026-09-11T12:45+08:00');
  await eventA.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => (await cli('page', 'get', a.id)).values.date.start)
    .toBe('2026-09-11T11:30+08:00');
  await page.locator('.plan-backlog .plan-card').filter({ hasText: '安排阅读' }).scrollIntoViewIfNeeded();
  await dragToMinute(page.locator('.plan-backlog .plan-card').filter({ hasText: '安排阅读' }), 10 * 60 + 30);
  await expect
    .poll(async () => (await cli('page', 'get', unplanned.id)).values.date.start)
    .toBe('2026-09-11T10:30+08:00');
  expect((await cli('page', 'get', unplanned.id)).values.date.end).toBe('2026-09-11T11:30+08:00');
  await eventA.getByRole('checkbox').check();
  await expect.poll(async () => (await cli('page', 'get', a.id)).values.done).toBe(true);
  await page.getByLabel('隐藏已完成', { exact: true }).check();
  await expect(eventA).toHaveCount(0);
  const projection = await cli('view', 'render', db.id);
  expect(projection.timeGrid.days[0].events.map((event: any) => event.id)).toEqual([b.id, unplanned.id]);
  await page.getByLabel('时间表时区', { exact: true }).and(page.locator('select')).selectOption('UTC');
  await expect(eventB).toContainText('01:30–02:30');
  await app.close();
  await launch();
  await expect(page.getByLabel('计划布局', { exact: true }).and(page.locator('select'))).toHaveValue(
    'hourDay',
  );
  await expect(page.getByLabel('时间表时区', { exact: true }).and(page.locator('select'))).toHaveValue('UTC');
  expect((await cli('page', 'get', a.id)).values.date.timeZone).toBe('Asia/Shanghai');
});

test('hourly plans create from the grid, switch to all-day, export PDF and show repeated DST hours', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '日程验收',
    '--view',
    'plan',
    '--columns',
    JSON.stringify([{ id: 'date', name: '日期', type: 'date' }]),
    '--color',
    'white',
  );
  const view = (await cli('view', 'list', db.id))[0];
  await cli(
    'view',
    'update',
    db.id,
    view.id,
    '--changes',
    JSON.stringify({ planMode: 'hourDay', timeZone: 'Asia/Shanghai', dateAnchor: '2026-09-11' }),
  );
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '全天与小时转换',
    '--values',
    JSON.stringify({
      date: { start: '2026-09-11T09:00+08:00', end: '2026-09-11T10:00+08:00', timeZone: 'Asia/Shanghai' },
    }),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await page.locator('.hourly-scroll').scrollIntoViewIfNeeded();
  await dragRecord(page.locator(`[data-time-event="${row.id}"]`), page.locator('.hourly-all-day'));
  await expect(page.locator('.hourly-all-day-event')).toContainText('全天与小时转换');
  expect((await cli('page', 'get', row.id)).values.date).toEqual({ start: '2026-09-11', end: '2026-09-11' });
  await page.locator('.hourly-scroll').evaluate((element) => (element.scrollTop = 12 * 60 * 0.9));
  const slots = await page.locator('.hourly-slots').boundingBox();
  await page.mouse.dblclick(slots!.x + 85, slots!.y + 18 * 60 * 0.9);
  await page.locator('.peek-panel .page-title').fill('晚间复盘');
  const created = (await cli('record', 'list', db.id)).find((row: any) => row.title === '晚间复盘');
  expect(created.values.date.start).toBe('2026-09-11T18:00+08:00');
  expect(created.values.date.end).toBe('2026-09-11T19:00+08:00');
  await page.getByRole('button', { name: '关闭预览', exact: true }).click();
  const pdf = path.join(data, 'hourly.pdf');
  await cli('file', 'export', db.id, '--type', 'pdf', '--output', pdf);
  const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  expect(text).toContain('晚间复盘');
  expect(text).toContain('全天与小时转换');
  await cli(
    'view',
    'update',
    db.id,
    view.id,
    '--changes',
    JSON.stringify({ dateAnchor: '2026-11-01', timeZone: 'America/New_York' }),
  );
  for (const [name, offset] of [
    ['第一个一点', '-04:00'],
    ['第二个一点', '-05:00'],
  ])
    await cli(
      'record',
      'create',
      db.id,
      '--title',
      name,
      '--values',
      JSON.stringify({
        date: {
          start: `2026-11-01T01:15${offset}`,
          end: `2026-11-01T01:45${offset}`,
          timeZone: 'America/New_York',
        },
      }),
      '--color',
      'white',
    );
  await expect(page.locator('.hourly-tick')).toHaveCount(25);
  await page.locator('.hourly-scroll').evaluate((element) => (element.scrollTop = 0));
  const repeated = page.locator('.hourly-tick').filter({ hasText: '01:00' });
  await expect(repeated).toHaveCount(2);
  const first = await page.locator('.hourly-event').filter({ hasText: '第一个一点' }).boundingBox(),
    second = await page.locator('.hourly-event').filter({ hasText: '第二个一点' }).boundingBox();
  expect(second!.y - first!.y).toBeCloseTo(54, 0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/hourly-dst.png' });
});

test('weekly hourly resizing can extend a meeting across days without changing its start', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '每周时间表',
    '--view',
    'plan',
    '--columns',
    JSON.stringify([{ id: 'date', type: 'date', name: '日期' }]),
    '--color',
    'white',
  );
  const view = (await cli('view', 'list', db.id))[0];
  await cli(
    'view',
    'update',
    db.id,
    view.id,
    '--changes',
    JSON.stringify({ planMode: 'hourWeek', timeZone: 'Asia/Shanghai', dateAnchor: '2026-09-08' }),
  );
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '跨日安排',
    '--values',
    JSON.stringify({
      date: { start: '2026-09-07T09:00+08:00', end: '2026-09-07T10:00+08:00', timeZone: 'Asia/Shanghai' },
    }),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await page.locator('.hourly-scroll').scrollIntoViewIfNeeded();
  const handle = await page.locator('.hourly-resize').boundingBox(),
    target = await page.locator('[data-time-slots="2026-09-09"]').boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 3);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 11 * 60 * 0.9, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await cli('page', 'get', row.id)).values.date.end)
    .toBe('2026-09-09T11:00+08:00');
  expect((await cli('page', 'get', row.id)).values.date.start).toBe('2026-09-07T09:00+08:00');
  await expect(page.locator(`[data-time-event="${row.id}"]`)).toHaveCount(3);
  const grid = (await cli('view', 'render', db.id)).timeGrid;
  expect(grid.days[0].events[0].continuesAfter).toBe(true);
  expect(grid.days[1].events[0].continuesBefore).toBe(true);
  expect(grid.days[2].events[0].minuteEnd).toBe(11 * 60);
  await expect(page.locator('[data-hour-date="2026-09-08"] .hourly-event-title')).toBeInViewport();
  await expect(page.locator('.peek-panel')).toHaveCount(0);
  const saved = (await cli('page', 'get', row.id)).values.date;
  const lastHandle = await page.locator('.hourly-resize').boundingBox();
  await page.mouse.move(lastHandle!.x + lastHandle!.width / 2, lastHandle!.y + 3);
  await page.mouse.down();
  await page.mouse.move(lastHandle!.x + lastHandle!.width / 2, lastHandle!.y + 57, { steps: 6 });
  await page.evaluate(() => {
    const down = (window as any).resizePointerLog.filter((event: any) => event.type === 'pointerdown').at(-1);
    document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: down.id, bubbles: true }));
  });
  await page.mouse.up();
  expect((await cli('page', 'get', row.id)).values.date).toEqual(saved);
  await page.screenshot({ animations: 'disabled', path: 'test-results/hourly-week.png' });
  const titles = ['需要完整保留的第一条重叠事项', '需要完整保留的第二条重叠事项', '周日完整日程'];
  for (const [index, title] of titles.entries())
    await cli(
      'record',
      'create',
      db.id,
      '--title',
      title,
      '--values',
      JSON.stringify({
        date: {
          start: `2026-09-${index === 2 ? '13' : '07'}T10:00+08:00`,
          end: `2026-09-${index === 2 ? '13' : '07'}T11:00+08:00`,
          timeZone: 'Asia/Shanghai',
        },
      }),
      '--color',
      'white',
    );
  const pdf = path.join(data, 'weekly-full.pdf');
  await cli('file', 'export', db.id, '--type', 'pdf', '--output', pdf);
  const pdfText = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
  for (const title of titles) expect(pdfText).toContain(title);
  expect(pdfText).toContain('详细日程');
});

test('recurring template settings generate dated pages and expose pause, preview and history in GUI and CLI', async () => {
  const db = await cli('database', 'create', '--title', '循环计划', '--color', 'white');
  const template = await cli(
    'template',
    'create',
    db.id,
    '--title',
    '定期检查',
    '--blocks',
    JSON.stringify([{ type: 'paragraph', content: '定期检查事项' }]),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await expect(page.locator('.page-title')).toHaveValue(db.title);
  await page.getByRole('button', { name: '新建模板与选项' }).click();
  await page.getByRole('button', { name: '定期检查 的模板操作' }).click();
  await page.getByRole('menuitem', { name: '重复 · 关闭', exact: true }).click();
  await page.getByLabel('重复周期', { exact: true }).and(page.locator('select')).selectOption('weekly');
  for (const [index, day] of ['一', '二', '三', '四', '五', '六', '日'].entries()) {
    const button = page.getByRole('button', { name: `每周${day}`, exact: true });
    const wanted = index === 0 || index === 2;
    if ((await button.getAttribute('aria-pressed')) !== String(wanted)) await button.click();
  }
  await page.getByLabel('循环开始日期', { exact: true }).fill('2099-01-01');
  await page.getByLabel('循环生成时间', { exact: true }).fill('09:00');
  await page.getByLabel('循环时区', { exact: true }).and(page.locator('select')).selectOption('UTC');
  await page.locator('.repeat-fields > summary').click();
  await page.getByLabel('循环页面名称', { exact: true }).fill('定期检查 {date}');
  await page.getByLabel('循环日期包含时间', { exact: true }).check();
  await page.getByLabel('循环持续分钟数', { exact: true }).fill('30');
  await page.screenshot({ animations: 'disabled', path: 'test-results/repeat-settings.png' });
  await page.getByRole('button', { name: '保存循环', exact: true }).click();
  await expect.poll(async () => (await cli('repeat', 'get', template.id)).rule?.frequency).toBe('weekly');
  const repeat = await cli('repeat', 'get', template.id);
  expect(repeat.rule.weekdays).toEqual([1, 3]);
  expect(repeat.rule.frequency).toBe('weekly');
  const preview = await cli('repeat', 'preview', template.id, '--after', '2098-12-31T00:00Z', '--count', '3');
  const run = await cli('scheduler', 'run', '--at', preview[1].at);
  expect(run.runs).toHaveLength(1);
  const generated = await cli('page', 'get', run.runs[0].pageId);
  expect(generated.title).toBe(`定期检查 ${preview[1].at.slice(0, 10)}`);
  expect(generated.values.date.end).toContain('09:30+00:00');
  await expect(page.locator('.database-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: '计划与提醒', exact: true }).click();
  await expect(page.locator('.scheduler-dialog')).toContainText('定期检查');
  await page.getByRole('button', { name: '暂停循环', exact: true }).click();
  await expect.poll(async () => (await cli('repeat', 'get', template.id)).rule.enabled).toBe(false);
  await page.getByRole('button', { name: '恢复循环', exact: true }).click();
  await page.getByRole('button', { name: '运行记录', exact: true }).click();
  await expect(page.locator('.schedule-list')).toContainText(generated.title);
  await page.screenshot({ animations: 'disabled', path: 'test-results/scheduler-history.png' });
  await page.getByRole('button', { name: '打开生成页面', exact: true }).click();
  await expect(page.locator('.page-title')).toHaveValue(generated.title);
  await expect(page.locator('.bn-editor')).toContainText('定期检查事项');
  await app.close();
  await launch();
  expect((await cli('repeat', 'get', template.id)).rule.enabled).toBe(true);
  expect((await cli('scheduler', 'run', '--at', preview[1].at)).runs).toHaveLength(0);
});

test('date reminders deliver to the inbox, support snooze, and send the native notification adapter once', async () => {
  const db = await cli('database', 'create', '--title', '提醒验证', '--color', 'white');
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '检查数据绑定',
    '--values',
    JSON.stringify({ date: '2099-01-03' }),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await expect(page.locator('.page-title')).toHaveValue(db.title);
  await page.locator('.database-table tbody').getByRole('button', { name: '日期', exact: true }).click();
  await page.getByLabel('日期提醒', { exact: true }).and(page.locator('select')).selectOption('days:1');
  await page.locator('.date-picker-footer').getByRole('button', { name: '完成', exact: true }).click();
  await expect.poll(async () => (await cli('reminder', 'list', '--page-id', row.id)).length).toBe(1);
  const reminder = (await cli('reminder', 'list', '--page-id', row.id))[0];
  expect(reminder.offset).toBe(1);
  expect(reminder.unit).toBe('days');
  await cli(
    'reminder',
    'update',
    row.id,
    reminder.id,
    '--changes',
    JSON.stringify({ timeZone: 'UTC', text: '请检查数据绑定' }),
  );
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('macOS 桌面提醒', { exact: true }).check();
  await expect.poll(async () => (await cli('settings', 'get')).desktopNotifications).toBe(true);
  await cli('ui', 'command', 'close-dialog');
  const delivered = await cli('scheduler', 'run', '--at', '2099-01-02T09:00:00Z');
  expect(delivered.notifications).toHaveLength(1);
  await expect.poll(() => fs.existsSync(path.join(data, 'notification-test.jsonl'))).toBe(true);
  expect(fs.readFileSync(path.join(data, 'notification-test.jsonl'), 'utf8').trim().split('\n')).toHaveLength(
    1,
  );
  await page.getByRole('button', { name: '收件箱', exact: true }).click();
  await expect(page.locator('.inbox-items')).toContainText('请检查数据绑定');
  await page.getByRole('button', { name: '标为已读', exact: true }).click();
  expect(await cli('inbox', 'list', '--status', 'unread')).toHaveLength(0);
  await page.getByLabel('稍后提醒', { exact: true }).and(page.locator('select')).selectOption('60');
  await expect(page.locator('.inbox-item')).toHaveCount(0);
  const snoozed = (await cli('reminder', 'list', '--page-id', row.id))[0];
  await cli('scheduler', 'run', '--at', snoozed.dueAt);
  await expect(page.locator('.inbox-item')).toHaveCount(1);
  await page.screenshot({ animations: 'disabled', path: 'test-results/reminder-inbox.png' });
  await page.getByRole('button', { name: '归档通知', exact: true }).click();
  await page.getByRole('button', { name: '已归档', exact: true }).click();
  await expect(page.locator('.inbox-item')).toHaveCount(2);
  await page.getByRole('button', { name: '取消归档', exact: true }).first().click();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.locator('.inbox-dialog').getByRole('button', { name: '检查数据绑定', exact: true }).click();
  await expect(page.locator('.page-title')).toHaveValue(row.title);
  await page.getByRole('button', { name: '设置页面提醒', exact: true }).click();
  await page.getByRole('button', { name: '编辑提醒', exact: true }).click();
  await page.getByLabel('提醒方式', { exact: true }).and(page.locator('select')).selectOption('at');
  await page.getByLabel('提醒时间', { exact: true }).fill('2099-02-01T09:00');
  await page.getByRole('button', { name: '保存提醒', exact: true }).click();
  expect((await cli('reminder', 'get', row.id, reminder.id)).propertyId).toBeUndefined();
});

test('reminders still arrive with no window and notification activation keeps the opened note selected after editing', async () => {
  const note = await cli('page', 'create', '--title', '关闭窗口后提醒', '--color', 'white');
  await cli('settings', 'set', '--changes', JSON.stringify({ desktopNotifications: true }));
  await cli(
    'reminder',
    'add',
    note.id,
    '--at',
    new Date(Date.now() + 1800).toISOString(),
    '--text',
    '回到这页继续写',
  );
  const closed = page.waitForEvent('close');
  await cli('ui', 'command', 'window-close');
  await closed;
  await expect.poll(() => fs.existsSync(path.join(data, 'notification-test.jsonl'))).toBe(true);
  const notification = JSON.parse(
    fs.readFileSync(path.join(data, 'notification-test.jsonl'), 'utf8').trim().split('\n')[0],
  );
  expect((await cli('status')).guiClients).toBe(0);
  const opened = app.waitForEvent('window');
  const activated = await app.evaluate(
    ({ app }, id) => app.emit(`test-notification-click:${id}`),
    notification.id,
  );
  expect(activated).toBe(true);
  page = await opened;
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.page-title')).toHaveValue(note.title);
  await expect.poll(async () => (await cli('workspace', 'get')).activePageId).toBe(note.id);
  await page.locator('.page-title').fill('从提醒继续编辑');
  await expect.poll(async () => (await cli('page', 'get', note.id)).title).toBe('从提醒继续编辑');
  await expect(page.locator('.page-title')).toHaveValue('从提醒继续编辑');
  expect((await cli('inbox', 'get', notification.id)).readAt).toBeTruthy();
});

test('document buttons configure rich insertions, preview confirmation and run through the shared CLI', async () => {
  const note = await cli('page', 'create', '--title', '按钮笔记', '--color', 'white');
  await cli('page', 'open', note.id);
  await expect(page.locator('.page-title')).toHaveValue(note.title);
  await page.locator('.page-title').press('Enter');
  await page.keyboard.type('/');
  await page.keyboard.insertText('按钮');
  await expect(page.locator('.bn-suggestion-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.locator('.button-block .button-main').click();
  await page.getByLabel('按钮文字', { exact: true }).fill('插入复盘');
  await page.getByRole('button', { name: '添加动作', exact: true }).click();
  await page.getByLabel('动作类型', { exact: true }).and(page.locator('select')).selectOption('insert');
  const draft = page.locator('.action-draft-editor .bn-editor');
  await draft.click();
  await page.keyboard.insertText('本次复盘正文');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[] ');
  await page.keyboard.insertText('继续行动');
  await page
    .getByLabel('插入内容位置', { exact: true })
    .and(page.locator('select'))
    .selectOption('afterButton');
  await page.getByLabel('按钮执行前确认', { exact: true }).check();
  await page.getByLabel('按钮确认文字', { exact: true }).fill('插入本次复盘？');
  await page.getByRole('button', { name: '预览动作', exact: true }).click();
  await expect(page.locator('.action-preview')).toContainText('本次复盘正文');
  await page.screenshot({ animations: 'disabled', path: 'test-results/button-editor.png' });
  await page.getByRole('button', { name: '保存按钮', exact: true }).click();
  await page.locator('.button-block .button-main').click();
  await expect(page.getByRole('dialog', { name: '确认按钮动作' })).toBeVisible();
  await page
    .getByRole('dialog', { name: '确认按钮动作' })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  expect(
    (await cli('page', 'get', note.id)).blocks.filter((block: any) => block.type === 'checkListItem'),
  ).toHaveLength(0);
  await page.locator('.button-block .button-main').click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
  await expect(page.locator('.note-editor').first()).toContainText('本次复盘正文');
  await expect(page.locator('.note-editor input[type="checkbox"]')).toHaveCount(1);
  const button = (await cli('button', 'list', '--page-id', note.id))[0];
  await cli('button', 'run', note.id, '--block-id', button.blockId, '--confirm');
  await expect(page.locator('.note-editor input[type="checkbox"]')).toHaveCount(2);
  await cli('history', 'undo', '--page-id', note.id);
  await expect(page.locator('.note-editor input[type="checkbox"]')).toHaveCount(1);
  await app.close();
  await launch();
  await expect(page.locator('.button-block .button-main')).toHaveText('插入复盘');
});

test('database automation editing and button properties work consistently from GUI and CLI', async () => {
  const projects = await cli('database', 'create', '--title', '关联项目库', '--color', 'white');
  const project = await cli('record', 'create', projects.id, '--title', '桌面版本', '--color', 'white');
  const db = await cli(
    'database',
    'create',
    '--title',
    '动作数据库',
    '--columns',
    JSON.stringify([
      { id: 'done', name: '完成', type: 'checkbox' },
      { id: 'count', name: '次数', type: 'number' },
      { id: 'project', name: '项目', type: 'relation', relationTo: projects.id },
    ]),
    '--color',
    'white',
  );
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '需要处理',
    '--values',
    JSON.stringify({ done: false, count: 0 }),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await expect(page.locator('.page-title')).toHaveValue(db.title);
  await page.getByRole('button', { name: '自动化', exact: true }).click();
  await page.getByRole('button', { name: '新建自动化', exact: true }).click();
  await page.getByLabel('自动化名称', { exact: true }).fill('完成时计数');
  await page.getByLabel('自动化触发条件', { exact: true }).and(page.locator('select')).selectOption('done');
  await page.locator('.automation-dialog summary').filter({ hasText: '只对满足条件' }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page.getByLabel('筛选属性', { exact: true }).and(page.locator('select')).selectOption('done');
  await page.getByLabel('添加属性动作', { exact: true }).and(page.locator('select')).selectOption('count');
  await page.getByRole('button', { name: '切换次数动作值的公式', exact: true }).click();
  await page.getByLabel('次数动作值公式', { exact: true }).fill('prop("次数") + 1');
  await page.getByRole('button', { name: '预览动作', exact: true }).click();
  await expect(page.locator('.action-preview')).toContainText('次数');
  await page.getByRole('button', { name: '保存自动化', exact: true }).click();
  await expect(page.locator('.automation-list')).toContainText('完成时计数');
  await cli('ui', 'command', 'close-dialog');
  await page.locator('.database-table tbody').getByRole('checkbox', { name: '完成', exact: true }).check();
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.count).toBe(1);
  await cli('record', 'update', row.id, '--values', JSON.stringify({ done: false }));
  await expect(
    page.locator('.database-table tbody').getByRole('checkbox', { name: '完成', exact: true }),
  ).not.toBeChecked();
  const button = await cli(
    'button',
    'create',
    db.id,
    '--property',
    '--label',
    '确认完成',
    '--actions',
    JSON.stringify([{ type: 'set', values: { done: true } }]),
  );
  await page.locator('.database-table tbody').getByRole('button', { name: '确认完成', exact: true }).click();
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.count).toBe(2);
  await expect(page.locator('.database-table tbody').getByLabel('次数', { exact: true })).toHaveValue('2');
  await page.screenshot({ animations: 'disabled', path: 'test-results/database-actions.png' });
  await page
    .locator('.database-table tbody .note-action-button')
    .getByRole('button', { name: '配置按钮', exact: true })
    .click();
  await page.getByLabel('按钮文字', { exact: true }).fill('处理完成');
  await page.getByLabel('添加属性动作', { exact: true }).and(page.locator('select')).selectOption('project');
  await page.getByRole('button', { name: '项目动作值', exact: true }).click();
  await page.getByPlaceholder('搜索关联页面…').fill('桌面');
  await page.getByRole('menuitem', { name: '桌面版本', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '保存按钮', exact: true }).click();
  expect((await cli('button', 'get', row.id, '--property-id', button.propertyId)).config.label).toBe(
    '处理完成',
  );
  await page.locator('.database-table tbody').getByRole('button', { name: '处理完成', exact: true }).click();
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.project).toEqual([project.id]);
});

test('scheduled automation is configurable in the desktop and shares preview, pause and run history with CLI', async () => {
  const db = await cli('database', 'create', '--title', '周期复盘', '--color', 'white');
  await cli('page', 'open', db.id);
  await page.getByRole('button', { name: '自动化', exact: true }).click();
  await page.getByRole('button', { name: '新建自动化', exact: true }).click();
  await page.getByLabel('自动化名称', { exact: true }).fill('每周复盘');
  await page
    .getByLabel('自动化触发方式', { exact: true })
    .and(page.locator('select'))
    .selectOption('schedule');
  await page.getByLabel('重复周期', { exact: true }).and(page.locator('select')).selectOption('weekly');
  await page.getByLabel('循环开始日期', { exact: true }).fill('2099-01-05');
  await page.getByLabel('循环时区', { exact: true }).and(page.locator('select')).selectOption('UTC');
  await page.getByLabel('动作类型', { exact: true }).and(page.locator('select')).selectOption('create');
  await page.getByLabel('动作目标数据库', { exact: true }).and(page.locator('select')).selectOption(db.id);
  await page.getByLabel('添加属性动作', { exact: true }).and(page.locator('select')).selectOption('title');
  await page.getByLabel('名称动作值', { exact: true }).fill('本周复盘');
  await page.getByRole('button', { name: '预览动作', exact: true }).click();
  await expect(page.locator('.action-preview')).toContainText('本周复盘');
  expect(await cli('record', 'list', db.id)).toHaveLength(0);
  await page.screenshot({ animations: 'disabled', path: 'test-results/scheduled-automation.png' });
  await page.getByRole('button', { name: '保存自动化', exact: true }).click();
  const rule = (await cli('automation', 'list', '--database-id', db.id))[0];
  await cli('scheduler', 'run', '--at', '2099-01-12T23:59:00Z');
  const records = await cli('record', 'list', db.id);
  expect(records.length).toBeGreaterThan(0);
  expect(records.every((record: any) => record.title === '本周复盘')).toBe(true);
  await page.getByRole('button', { name: '暂停自动化', exact: true }).click();
  await expect.poll(async () => (await cli('automation', 'get', db.id, rule.id)).enabled).toBe(false);
  await page.getByRole('button', { name: '查看执行记录', exact: true }).click();
  await expect(page.locator('.action-history')).toContainText('每周复盘');
  expect((await cli('action', 'history', '--owner-id', db.id)).length).toBe(records.length);
});

test('status groups edit in the desktop and planner completion recognizes all completed options', async () => {
  const db = await cli('database', 'create', '--title', '状态工作流', '--color', 'white');
  const row = await cli(
    'record',
    'create',
    db.id,
    '--title',
    '交付设计',
    '--values',
    JSON.stringify({ date: '2026-09-11' }),
    '--color',
    'white',
  );
  await cli('page', 'open', db.id);
  await page.locator('.database-table thead').getByRole('button', { name: '状态', exact: true }).click();
  await page.getByLabel('选项名称 3', { exact: true }).fill('已交付');
  await page.getByRole('button', { name: '添加选项', exact: true }).click();
  await page.getByLabel('选项名称 4', { exact: true }).fill('已取消');
  await page.getByLabel('状态分组 4', { exact: true }).and(page.locator('select')).selectOption('done');
  await page.getByLabel('选项颜色 4', { exact: true }).and(page.locator('select')).selectOption('purple');
  await page.screenshot({ path: 'test-results/status-settings.png', animations: 'disabled' });
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.locator('.database-table tbody').getByRole('button', { name: '状态', exact: true }).click();
  await expect(page.locator('.popover .picker-heading').filter({ hasText: '已完成' })).toBeVisible();
  await page.getByRole('menuitem', { name: '已取消', exact: true }).click();
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.status).toBe('已取消');
  const view = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'plan',
    '--config',
    JSON.stringify({ dateAnchor: '2026-09-11', planMode: 'day' }),
  );
  const rendered = await cli('view', 'render', db.id, '--view-id', view.id);
  expect(rendered.completed).toBe(1);
  await expect(
    page.locator('.plan-view').getByRole('checkbox', { name: '完成 交付设计', exact: true }),
  ).toBeChecked();
  await page.locator('.plan-view').getByRole('checkbox', { name: '完成 交付设计', exact: true }).uncheck();
  await expect.poll(async () => (await cli('page', 'get', row.id)).values.status).toBe('未开始');
});

test('people, files and immutable system properties work in GUI, CLI, export and restart', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '完整属性',
    '--columns',
    JSON.stringify([
      { id: 'owner', name: '负责人', type: 'person' },
      { id: 'files', name: '参考文件', type: 'files' },
      { id: 'email', name: '联系邮箱', type: 'email' },
      { id: 'phone', name: '联系电话', type: 'phone' },
      { id: 'uid', name: '任务编号', type: 'uniqueId', idPrefix: 'TASK' },
      { id: 'created', name: '创建时间', type: 'createdTime' },
      { id: 'author', name: '创建者', type: 'createdBy' },
      {
        id: 'emails',
        name: '负责人邮箱',
        type: 'formula',
        formula: 'prop("负责人").map(current.email()).join(",")',
      },
    ]),
    '--color',
    'white',
  );
  const row = await cli('record', 'create', db.id, '--title', '资料整理', '--color', 'white');
  await cli('page', 'open', row.id);
  await page.getByRole('button', { name: '负责人', exact: true }).click();
  await page.getByRole('menuitem', { name: '添加本地人员', exact: true }).click();
  await page.getByLabel('人员姓名', { exact: true }).fill('小林');
  await page.getByLabel('人员邮箱', { exact: true }).fill('lin@example.test');
  await page.getByRole('button', { name: '保存人员', exact: true }).click();
  await expect(page.getByRole('menuitem').filter({ hasText: '小林' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-properties')).toContainText('lin@example.test');
  await page.getByLabel('联系邮箱', { exact: true }).fill('team@example.test');
  await page.getByLabel('联系电话', { exact: true }).fill('+86 10086');
  const source = path.join(data, 'brief.txt');
  fs.writeFileSync(source, '本地文件属性完整内容');
  await page.getByLabel('参考文件上传文件', { exact: true }).setInputFiles(source);
  await expect(page.getByRole('button', { name: '参考文件', exact: true })).toContainText('brief.txt');
  await page.getByRole('button', { name: '参考文件', exact: true }).click();
  await page.getByLabel('文件名称 1', { exact: true }).fill('项目说明.txt');
  const output = path.join(data, 'downloaded.txt');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByRole('button', { name: '下载文件', exact: true }).click();
  await expect.poll(() => fs.existsSync(output)).toBe(true);
  expect(fs.readFileSync(output, 'utf8')).toBe('本地文件属性完整内容');
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('任务编号', { exact: true })).toHaveText('TASK-1');
  await page.screenshot({ path: 'test-results/rich-properties.png', animations: 'disabled' });
  const saved = await cli('page', 'get', row.id);
  expect(saved.values.owner[0].name).toBe('小林');
  expect(saved.values.files[0].name).toBe('项目说明.txt');
  const markdown = path.join(data, 'properties.md');
  await cli('file', 'export', row.id, '--type', 'md', '--output', markdown);
  const text = fs.readFileSync(markdown, 'utf8');
  expect(text).toContain('项目说明.txt');
  expect(text).toContain('TASK-1');
  expect(fs.readdirSync(path.join(data, 'properties.assets'))).toHaveLength(1);
  await app.close();
  await launch();
  await expect(page.getByLabel('任务编号', { exact: true })).toHaveText('TASK-1');
  await expect(page.getByRole('button', { name: '参考文件', exact: true })).toContainText('项目说明.txt');
});

test('system timestamps can drive read-only calendar and hourly views with matching CLI projection', async () => {
  const db = await cli(
    'database',
    'create',
    '--title',
    '按创建时间',
    '--columns',
    JSON.stringify([{ id: 'created', name: '创建时间', type: 'createdTime' }]),
    '--color',
    'white',
  );
  const row = await cli('record', 'create', db.id, '--title', '此刻的记录', '--color', 'white');
  const date = new Date(row.createdAt).toLocaleDateString('sv-SE');
  const calendar = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'calendar',
    '--config',
    JSON.stringify({ calendarBy: 'created', dateAnchor: date }),
  );
  await cli('page', 'open', db.id);
  await expect(page.locator(`[data-calendar-id="${row.id}"]`).first()).toBeVisible();
  await expect(page.locator(`[data-calendar-id="${row.id}"]`).first()).toHaveAttribute('draggable', 'false');
  expect((await cli('view', 'render', db.id, '--view-id', calendar.id)).records[0].id).toBe(row.id);
  const plan = await cli(
    'view',
    'create',
    db.id,
    '--type',
    'plan',
    '--config',
    JSON.stringify({ calendarBy: 'created', dateAnchor: date, planMode: 'hourDay' }),
  );
  await expect(page.locator(`[data-time-event="${row.id}"]`)).toBeVisible();
  const rendered = await cli('view', 'render', db.id, '--view-id', plan.id);
  expect(rendered.timeGrid.readonlyDates).toBe(true);
  expect(
    rendered.timeGrid.days.flatMap((day: any) => day.events).some((event: any) => event.id === row.id),
  ).toBe(true);
});

function writeStubEngine(file: string, sessionId: string, texts: string[]) {
  fs.writeFileSync(
    file,
    `import { createRequire } from 'node:module';
process.env.MINI_NOTION_FIXTURE_PROFILE = 'transcript';
process.env.MINI_NOTION_FIXTURE_SESSION = ${JSON.stringify(sessionId)};
process.env.MINI_NOTION_FIXTURE_TEXTS = ${JSON.stringify(JSON.stringify(texts))};
createRequire(import.meta.url)(${JSON.stringify(path.resolve('tests/fixtures/agent-engine.cjs'))});`,
  );
}

test('a space scopes its own files, folders and on-disk directory', async () => {
  const space = await cli('space', 'create', '--title', '研究空间', '--engine', 'claude', '--color', 'white');
  const folder = await cli('folder', 'create', space.id, '--name', '资料');
  const nested = await cli('folder', 'create', space.id, '--name', '2026', '--parent-id', folder.id);
  expect(nested.parentId).toBe(folder.id);

  await cli('page', 'open', space.id);
  await page.locator('.sidebar-page-name', { hasText: '研究空间' }).first().waitFor();
  await expect(page.locator('.space-badge').first()).toBeVisible();

  await page.locator('.topbar-space-button').first().click();
  await expect(page.locator('.space-panel')).toBeVisible();
  await expect(page.locator('.space-folder-row', { hasText: '资料' })).toBeVisible();

  const source = path.join(data, 'note.txt');
  fs.writeFileSync(source, 'hello space');
  const uploaded = await cli('space', 'upload', space.id, '--path', source, '--folder-id', nested.id);
  expect(uploaded.name).toBe('note.txt');
  await cli(
    'file',
    'record',
    space.id,
    '--name',
    'note.txt',
    '--url',
    uploaded.url,
    '--folder-id',
    nested.id,
  );

  expect(fs.readdirSync(path.join(data, 'spaces', space.id, nested.id)).length).toBe(1);
  const stored = await cli('space', 'get', space.id);
  expect(stored.files.length).toBe(1);

  // The nested folder starts collapsed, so the recorded file appears once it is expanded.
  await page.locator('.space-folder-row', { hasText: '资料' }).click();
  await page.locator('.space-folder-row', { hasText: '2026' }).click();
  await expect(page.locator('.space-file-row', { hasText: 'note.txt' }).first()).toBeVisible();

  const other = await cli(
    'space',
    'create',
    '--title',
    '另一个空间',
    '--engine',
    'claude',
    '--color',
    'white',
  );
  await cli('page', 'open', other.id);
  await page.locator('.topbar-space-button').first().click();
  await expect(page.locator('.space-empty')).toBeVisible();
  expect(fs.existsSync(path.join(data, 'spaces', other.id))).toBe(true);
  expect(fs.readdirSync(path.join(data, 'spaces', other.id))).toEqual([]);
});

test('the agent streams a transcript into the panel and restores it across restart', async () => {
  const stub = path.join(data, 'stub-claude.mjs');
  writeStubEngine(stub, 'sess-e2e', ['我先看看空间里的内容。', '已经整理好了。']);
  // The service spawns the engine, so the override must reach the app process.
  await app.close();
  process.env.MINI_NOTION_AGENT_CLAUDE = `node ${stub}`;
  await launch();

  const space = await cli('space', 'create', '--title', '写作空间', '--engine', 'claude', '--color', 'white');
  await cli('page', 'open', space.id);
  await page.locator('.sidebar-page-name', { hasText: '写作空间' }).first().waitFor();

  await page.locator('.topbar-space-button.agent').click();
  await expect(page.locator('.agent-panel')).toBeVisible();
  await expect(page.locator('.agent-welcome')).toBeVisible();
  await expect(page.locator('.agent-engine-badge', { hasText: 'Claude Code' })).toBeVisible();

  await page.locator('.agent-compose textarea').fill('整理这个空间');
  await page.locator('.agent-compose button[type="submit"]').click();

  await page.waitForFunction(
    () => document.querySelectorAll('.agent-panel .agent-message.agent').length > 0,
    undefined,
    { timeout: 20000 },
  );
  await expect(page.locator('.agent-panel .agent-message.user').first()).toContainText('整理这个空间');
  await page.locator('.agent-focus-activity > summary').first().click();
  await expect(page.locator('.agent-activity').first()).toBeVisible();
  await page.locator('.agent-activity > summary').first().click();
  await expect(page.locator('.agent-activity[open] pre').first()).toBeVisible();
  await expect(page.locator('.agent-activity[open] pre').first()).toContainText('mininotion');

  await page.waitForFunction(
    () => {
      const dot = document.querySelector('.agent-status-dot');
      return dot && !dot.classList.contains('running');
    },
    undefined,
    { timeout: 20000 },
  );
  const status = await cli('agent', 'status', space.id);
  expect(status.status).toBe('idle');
  expect(status.sessionId).toBe('sess-e2e');

  const history = await cli('agent', 'history', space.id);
  expect(history[0].role).toBe('user');
  expect(history.some((message: any) => message.role === 'agent')).toBe(true);

  await app.close();
  delete process.env.MINI_NOTION_AGENT_CLAUDE;
  await launch();
  await expect(page.locator('.sidebar-page-name', { hasText: '写作空间' }).first()).toBeVisible();
  const restored = await cli('agent', 'status', space.id);
  expect(restored.messages).toBeGreaterThan(0);
  expect(restored.sessionId).toBe('sess-e2e');
});
