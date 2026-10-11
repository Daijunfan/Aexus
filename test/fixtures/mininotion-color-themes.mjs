import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

/** Reuse the hosted visual fixture instead of creating another app/test harness. */
export async function verifyColorThemes({ page, api, resize, shot, goto, main, db, views, bounds, noOverlap }) {
  const palettes = [['classic', '留白'], ['ocean', '晴空'], ['aurora', '极光'], ['iris', '鸢尾'], ['rose', '樱桃'], ['sunset', '落日'], ['mint', '薄荷'], ['graphite', '石墨']];
  const openSettings = async () => {
    await api('ui.command', { command: 'settings', params: { tab: 'appearance' } });
    await expect(page.getByRole('radiogroup', { name: '主题配色' })).toBeVisible();
  };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const tone of ['light', 'dark']) {
    await api('settings.set', { theme: tone }); await resize(1280, 850);
    for (const [id, name] of palettes) {
      await openSettings();
      await page.getByRole('radiogroup', { name: '主题配色' }).getByRole('radio', { name, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-palette', id);
      await expect(page.getByRole('radiogroup', { name: '主题配色' }).locator('[aria-checked="true"]')).toHaveCount(1);
      await expect.poll(async () => (await api('settings.get')).appearance?.palette).toBe(id);
      if (id === 'iris') { await page.locator('.settings-content').evaluate(el => el.scrollTop = 0); await shot('palette-settings-' + tone); }
      await page.keyboard.press('Escape'); await goto(main);
      await bounds('.topbar-right'); await noOverlap('.topbar,.topbar-right');
      await expect(page.locator('.page-cover')).not.toHaveCSS('background-image', 'none');
      await shot('palette-' + tone + '-' + id);
    }
    await api('settings.set', { changes: { appearance: { palette: 'aurora', wallpaper: 'glow' } } });
    await page.locator('.sidebar-nav').getByRole('button', { name: '主页', exact: true }).click();
    await shot('color-home-' + tone);
    await goto(main); await resize(480, 600); await openSettings();
    const group = page.getByRole('radiogroup', { name: '背景纹理' });
    for (const [id, name] of [['none', '纯净'], ['glow', '流光'], ['dots', '微点'], ['grid', '方格']]) {
      await group.getByRole('radio', { name, exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-wallpaper', id);
      await bounds('.modal'); await noOverlap('.theme-palette-grid,.theme-wallpapers');
    }
    await page.getByRole('radiogroup', { name: '主题配色' }).getByRole('radio', { name: '晴空', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await expect(page.locator('html')).toHaveAttribute('data-palette', 'aurora');
    await shot('narrow-color-settings-' + tone); await page.keyboard.press('Escape');
    await resize(1280, 850);
    for (const type of ['board', 'gallery']) {
      const view = views.find(value => value.type === type);
      await api('page.open', { pageId: db.id, viewId: view.id });
      await expect(page.locator(`.view-tabs [data-view-id="${view.id}"]`)).toHaveClass(/active/);
      await noOverlap('.database-tools'); await bounds('.database-toolbar');
      await shot('color-' + tone + '-' + type);
    }
  }
  await goto(main);
  const beforeBlocks = (await api('page.get', { pageId: main.id })).blocks;
  await page.evaluate(() => { window.__themeEditor = document.querySelector('.bn-editor'); });
  await api('settings.set', { changes: { appearance: { palette: 'rose', wallpaper: 'dots', motion: 'reduced' } } });
  assert.ok(await page.evaluate(() => window.__themeEditor === document.querySelector('.bn-editor')), 'theme must not remount the editor');
  assert.deepEqual((await api('page.get', { pageId: main.id })).blocks, beforeBlocks);
  await expect(page.locator('.page-scroll').first()).toHaveCSS('scroll-behavior', 'auto');
  await page.reload(); await page.locator('.sidebar').waitFor();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'rose');
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'dots');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await api('settings.set', { changes: { appearance: { palette: 'ocean', wallpaper: 'glow', motion: 'system' } } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.sidebar-nav').getByRole('button', { name: '主页', exact: true }).click();
  assert.ok(parseFloat(await page.locator('.home-greeting').evaluate(el => getComputedStyle(el, '::before').animationDuration)) < .01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(1000);
  const running = await page.evaluate(() => document.getAnimations().filter(a => /ambient-arrive|theme-confirm|pop-in/.test(a.animationName || '') && a.playState === 'running').length);
  assert.equal(running, 0, 'decorative effects must finish instead of running indefinitely');
  await api('settings.set', { changes: { appearance: { palette: 'classic', wallpaper: 'grid' } } });
  await expect(page.locator('.home-scroll')).not.toHaveCSS('background-image', 'none');
  await openSettings();
  await page.getByRole('button', { name: '恢复默认界面外观', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'classic');
  await expect(page.locator('html')).toHaveAttribute('data-wallpaper', 'none');
  await page.keyboard.press('Escape');
  console.log('PASS eight palettes in both tones, four wallpapers, keyboard selection, retained editor, persisted settings and reduced motion');
}
