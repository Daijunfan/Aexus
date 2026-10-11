import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { coverPresentation, surfacePosition } from '../src/presentation';
import { PageIcon } from '../src/ui';
import { AppearanceTheme } from '../src/appearance';
import { iconNames } from '../src/core/icons';

test('cover presets and all supported image transports share one escaped crop representation', () => {
  assert.equal(coverPresentation('sage').className, 'cover-sage');
  for (const value of ['asset://local/cover.svg', 'https://example.test/a b"c.png', 'data:image/svg+xml,<svg/>']) {
    const cover = coverPresentation(value, 125);
    assert.equal(cover.className, 'cover-custom');
    assert.equal(cover.style.backgroundImage, `url(${JSON.stringify(value)})`);
    assert.equal(cover.style.backgroundPosition, 'center 100%');
  }
  assert.equal(coverPresentation(null).className, '');
  assert.equal(coverPresentation('not a class').className, '');
});

test('menu geometry stays inside the viewport even for oversized menus and edge anchors', () => {
  for (const width of [320, 480, 560, 1440]) for (const height of [240, 720, 1080])
    for (const x of [-50, 8, width - 10, width + 30]) for (const y of [0, height / 2, height]) {
      const p = surfacePosition(x, y, 580, 700, { width, height }, y - 32);
      assert.ok(p.left >= 8 && p.top >= 8);
      assert.ok(p.left + p.width <= width - 8);
      assert.ok(p.top + Math.min(700, p.maxHeight) <= height - 8);
    }
});

test('every declared symbol renders one correctly sized decorative SVG in both themes', () => {
  for (const theme of ['light', 'dark'] as const) for (const name of iconNames) {
    const markup = renderToStaticMarkup(createElement(AppearanceTheme.Provider, { value: theme },
      createElement(PageIcon, { icon: `icon:${name}:blue`, size: 18 })));
    assert.equal((markup.match(/<svg\b/g) || []).length, 1, name);
    assert.match(markup, /width="18"/);
    assert.match(markup, /height="18"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /stroke-width="1.8"/);
  }
});

test('default icons and complex Unicode emoji retain one accessible visual slot', () => {
  for (const size of [12, 16, 24, 68]) {
    const fallback = renderToStaticMarkup(createElement(PageIcon, { size }));
    assert.match(fallback, new RegExp(`width="${size}"`));
    const emoji = renderToStaticMarkup(createElement(PageIcon, { icon: '🧑🏽‍💻', size }));
    assert.equal((emoji.match(/page-emoji/g) || []).length, 1);
    assert.match(emoji, /aria-hidden="true"/);
  }
});
