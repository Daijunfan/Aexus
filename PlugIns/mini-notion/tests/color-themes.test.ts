import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { colorThemeNames, wallpapers } from '../src/core/colorThemes';
import { validateAppearance, type AppAppearance } from '../src/core/appearance';
import { appAppearanceStyle, pageAppearanceStyle, recordAppearanceStyle, themeSurface } from '../src/appearance';
import { DataService } from '../src/backend/service';

const luminance = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('all theme variants share readable chrome, document and button tokens', () => {
  for (const palette of colorThemeNames) for (const tone of ['light', 'dark'] as const)
    for (const accentColor of [undefined, '#ffff00', '#ffffff', '#000000', '#ee66bb'] as const) {
      const appearance = { palette, ...(accentColor ? { accentColor } : {}) };
      const tokens = appAppearanceStyle(appearance, tone);
      for (const [fg, bg] of [['--text', '--bg'], ['--muted', '--bg'], ['--blue', '--bg'], ['--accent-contrast', '--accent-solid'], ['--accent-contrast', '--accent-end']])
        assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${palette}/${tone} ${fg}/${bg}`);
      const page = pageAppearanceStyle({ color: 'white' }, tone, appearance) as Record<string, string>;
      const card = recordAppearanceStyle({ color: 'white' }, tone, appearance) as Record<string, string>;
      assert.equal(page['--page-canvas'], tokens['--bg']);
      assert.ok(contrast(page['--page-ink'], page['--page-canvas']) >= 4.5);
      assert.ok(contrast(card['--view-card-ink'], card['--view-card-bg']) >= 4.5);
      assert.ok(!Object.values(tokens).some(value => value.includes('NaN')));
    }
});

test('legacy appearance stays supported and invalid theme options are rejected', () => {
  assert.equal(themeSurface(undefined, 'light').bg, '#ffffff');
  assert.equal(themeSurface({ palette: 'future-palette' } as unknown as AppAppearance, 'light').bg, '#ffffff');
  assert.equal(themeSurface(undefined, 'dark').bg, '#191919');
  assert.equal(themeSurface({ palette: 'ocean', surface: 'warm' }, 'light').bg, '#fffcf5');
  for (const palette of colorThemeNames) for (const wallpaper of Object.keys(wallpapers))
    assert.doesNotThrow(() => validateAppearance({ palette, wallpaper, motion: 'system' }, 'application'));
  for (const value of [{ palette: 'missing' }, { wallpaper: 'url(x)' }, { motion: 'infinite' }, { palette: [] }])
    assert.throws(() => validateAppearance(value, 'application'), /外观字段/);
});

test('settings service persists themes without changing native page bytes', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-theme-')));
  let service = new DataService(path.join(root, '.mininotion'), root);
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await service.request({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params, stateMode: 'none' });
    assert.ok(!response.error, JSON.stringify(response.error)); return response.result;
  };
  try {
    await call('fs.sync');
    const page = await call('page.create', { title: 'Theme stability', color: 'white' });
    const location = await call('fs.path', { pageId: page.id });
    const original = fs.readFileSync(location.absolutePath, 'utf8');
    for (const palette of colorThemeNames) await call('settings.set', { changes: { appearance: { palette, wallpaper: 'dots', motion: 'reduced' } } });
    service = new DataService(path.join(root, '.mininotion'), root);
    assert.deepEqual((await call('settings.get')).appearance, { palette: 'graphite', wallpaper: 'dots', motion: 'reduced' });
    assert.equal(fs.readFileSync(location.absolutePath, 'utf8'), original);
    const schema = await call('schema', { method: 'settings.set' });
    assert.deepEqual(schema.appearance.application.palette, colorThemeNames);
    await call('settings.set', { changes: { appearance: null } });
  } finally {
    service.stopScheduler(); service.agents.stopAll();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
