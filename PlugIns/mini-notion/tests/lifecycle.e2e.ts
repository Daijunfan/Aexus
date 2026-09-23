import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

test('CLI closes, reopens and quits the real macOS window without losing edits', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-lifecycle-'));
  const env = { ...process.env, MINI_NOTION_DATA_DIR: directory, MINI_NOTION_TEST: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.env.MINI_NOTION_EXECUTABLE,
    args: process.env.MINI_NOTION_EXECUTABLE ? [] : ['.'],
    env,
  });
  let appClosed = false;
  app.on('close', () => {
    appClosed = true;
  });
  const execute = promisify(execFile);
  const entry = process.env.MINI_NOTION_EXECUTABLE
    ? path.resolve(process.env.MINI_NOTION_EXECUTABLE, '../../Resources/app.asar/dist-cli/cli.cjs')
    : path.resolve('dist-cli/cli.cjs');
  const cli = async (...args: string[]) =>
    JSON.parse(
      (
        await execute(
          process.env.MINI_NOTION_EXECUTABLE || process.execPath,
          [entry, '--data-dir', directory, ...args],
          { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
        )
      ).stdout,
    );
  try {
    const page = await app.firstWindow();
    await page.locator('.page-title').waitFor();
    await page.getByRole('button', { name: '新建页面 ⌘N', exact: true }).click();
    await page.locator('.page-title').fill('CLI 生命周期');
    await page.locator('.page-title').press('Enter');
    await page.keyboard.insertText('关闭窗口也要完整保存。');
    const status = await cli('status');
    expect(execFileSync('ps', ['-p', String(status.pid), '-o', 'comm='], { encoding: 'utf8' })).toContain(
      'Helper',
    );
    const closed = page.waitForEvent('close');
    await cli('ui', 'command', 'window-close');
    await closed;
    await expect.poll(async () => (await cli('status')).guiClients).toBe(0);
    const reopened = app.waitForEvent('window');
    await cli('ui', 'launch');
    const next = await reopened;
    await expect(next.locator('.page-title')).toHaveValue('CLI 生命周期');
    await expect(next.locator('.bn-editor')).toContainText('关闭窗口也要完整保存。');
    const closedAgain = next.waitForEvent('close');
    await cli('ui', 'command', 'window-close');
    await closedAgain;
    const withoutWindow = await cli('status');
    expect(withoutWindow.guiClients).toBe(0);
    expect(withoutWindow.desktopClients).toBe(1);
    const quit = app.waitForEvent('close');
    await cli('ui', 'command', 'quit');
    await quit;
    expect(
      JSON.parse(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8')).pages.some(
        (page: any) => page.title === 'CLI 生命周期',
      ),
    ).toBe(true);
  } finally {
    if (!appClosed) await app.close();
    await cli('service', 'stop');
    await new Promise((resolve) => setTimeout(resolve, 150));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
