import type { Page } from './types';
import type { CSSProperties } from 'react';
import { createContext } from 'react';
import type { AppearanceColor, AppAppearance, ViewAppearance } from './core/appearance';

import { palette, normalizePageColors, blockBackgrounds } from './core/appearance';
import { iconColors } from './core/icons';
export { palette } from './core/appearance';
type Tone = 'light' | 'dark';
export const AppearanceTheme = createContext<Tone>('light');

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, ratio: number) =>
  '#' +
  rgb(a)
    .map((n, i) =>
      Math.round(n * (1 - ratio) + rgb(b)[i] * ratio)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const luminance = (hex: string) =>
  rgb(hex)
    .map((n) => {
      const s = n / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
export function readableInk(hex: string) {
  const bg = luminance(hex), darkText = bg > 0.179;
  const ink = darkText ? '#37352f' : '#f0f0ef', text = luminance(ink);
  const contrast = (Math.max(bg, text) + 0.05) / (Math.min(bg, text) + 0.05);
  return contrast >= 4.5 ? ink : darkText ? '#000000' : '#ffffff';
}
function readableAccent(color: string, background: string) {
  const bg = luminance(background),
    target = bg > 0.179 ? '#111111' : '#ffffff';
  for (let i = 0; i <= 10; i++) {
    const candidate = mix(color, target, i / 10),
      l = luminance(candidate);
    if ((Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) >= 4.5) return candidate;
  }
  return target;
}
export function appearanceColor(value: AppearanceColor | undefined, theme: Tone, text = false) {
  if (!value || value === 'default') return undefined;
  if (value.startsWith('#')) return value;
  const p = palette[value as keyof typeof palette];
  if (!p) return undefined;
  return text ? (theme === 'dark' ? p.darkInk : p.ink) : p[theme];
}
export function surfaceColors(surface: AppAppearance['surface'], theme: Tone) {
  const dark = theme === 'dark';
  if (surface === 'warm') return { bg: dark ? '#211e19' : '#fffcf5', sidebar: dark ? '#29251f' : '#f3eee4' };
  if (surface === 'cool') return { bg: dark ? '#191f26' : '#fcfdff', sidebar: dark ? '#212a35' : '#f0f4f8' };
  return { bg: dark ? '#191919' : '#ffffff', sidebar: dark ? '#202020' : '#f7f7f7' };
}
export function appAppearanceStyle(a: AppAppearance | null | undefined, theme: Tone): Record<string, string> {
  const { bg, sidebar } = surfaceColors(a?.surface, theme),
    ink = theme === 'dark' ? '#d4d4d4' : '#37352f';
  const accent = appearanceColor(a?.accentColor, theme, true) || '#0b6bcb';
  const agent = appearanceColor(a?.agentColor, theme) || bg;
  return {
    ...Object.fromEntries(Object.entries(blockBackgrounds).flatMap(([color, tones]) => [
      [`--content-${color}-text`, iconColors[color as keyof typeof iconColors][theme]],
      [`--content-${color}-background`, tones[theme]],
    ])),
    '--bg': bg,
    '--sidebar': sidebar,
    '--menu': theme === 'dark' ? mix(bg, '#ffffff', 0.04) : bg,
    '--app-canvas': bg,
    '--app-ink': ink,
    '--blue': readableAccent(accent, bg),
    '--blue-hover': mix(accent, ink, 0.15),
    '--accent-solid': accent,
    '--accent-contrast': readableInk(accent),
    '--agent-canvas': agent,
    '--agent-ink': readableInk(agent),
    '--agent-muted': mix(readableInk(agent), agent, 0.4),
    '--agent-link': readableAccent(accent, agent),
    '--agent-soft': mix(agent, readableInk(agent), 0.05),
    '--agent-line': mix(agent, readableInk(agent), 0.14),
    '--agent-strong-line': mix(agent, readableInk(agent), 0.24),
  };
}
type PageColors = Pick<Partial<Page>, 'color' | 'textColor' | 'appearance'>;
export function pageAppearanceStyle(
  page: PageColors | undefined,
  theme: Tone,
  application?: AppAppearance | null,
): CSSProperties {
  const value = normalizePageColors(page || {});
  const canvas = surfaceColors(application?.surface, theme).bg;
  const color = appearanceColor(value.color, theme)!;
  const ink = appearanceColor(value.textColor, theme, true) || readableInk(canvas);
  const accent = appearanceColor(application?.accentColor, theme, true) || '#0b6bcb';
  return {
    '--page-color': color,
    '--page-color-ink': readableInk(color),
    '--page-canvas': canvas,
    '--page-paper': canvas,
    '--page-ink': ink,
    '--page-muted': mix(ink, canvas, 0.4),
    '--page-cover-height': `${{ compact: 144, standard: 224, large: 320 }[value.appearance?.coverSize || 'standard']}px`,
    '--page-link': readableAccent(accent, canvas),
    '--blue': readableAccent(accent, canvas),
    '--accent-solid': accent,
    '--accent-contrast': readableInk(accent),
    '--blue-hover': mix(accent, ink, 0.15),
  } as CSSProperties;
}
export function viewAppearanceStyle(
  a: ViewAppearance | null | undefined,
  theme: Tone,
  application?: AppAppearance | null,
): CSSProperties {
  if (!a || Object.values(a).every((value) => !value || value === 'default')) return {};
  const accentValue = a.accentColor && a.accentColor !== 'default' ? a.accentColor : application?.accentColor;
  const bg = appearanceColor(a.backgroundColor, theme),
    accent = appearanceColor(accentValue, theme, true) || '#0b6bcb';
  const rangeBg = accentValue?.startsWith('#')
    ? mix(bg || surfaceColors(application?.surface, theme).bg, accent, 0.16)
    : appearanceColor(accentValue || 'blue', theme) || palette.blue[theme];
  return {
    ...(bg
      ? {
          '--view-bg': bg,
          '--bg': bg,
          '--text': readableInk(bg),
          '--subtle': mix(readableInk(bg), bg, 0.2),
          '--muted': mix(readableInk(bg), bg, 0.4),
          '--sidebar': mix(bg, readableInk(bg), 0.04),
          '--line': mix(bg, readableInk(bg), 0.12),
          '--strong-line': mix(bg, readableInk(bg), 0.22),
        }
      : {}),
    ...(accent
      ? {
          '--blue': readableAccent(accent, bg || (theme === 'dark' ? '#191919' : '#ffffff')),
          '--accent-solid': accent,
          '--accent-contrast': readableInk(accent),
          '--blue-hover': mix(accent, readableInk(bg || surfaceColors(application?.surface, theme).bg), 0.15),
          '--view-range-bg': rangeBg,
          '--view-range-ink': readableAccent(accent, rangeBg),
        }
      : {}),
  } as CSSProperties;
}

export function recordAppearanceStyle(page: PageColors, theme: Tone): CSSProperties {
  const value = normalizePageColors(page);
  const color = appearanceColor(value.color, theme)!;
  const bg = surfaceColors('neutral', theme).bg;
  const ink = appearanceColor(value.textColor, theme, true) || readableInk(bg),
    muted = mix(ink, bg, 0.4);
  return {
    '--record-accent': value.color === 'white' ? 'transparent' : color,
    '--view-card-bg': bg,
    '--view-card-ink': ink,
    '--view-card-muted': muted,
    '--bg': bg,
    '--text': ink,
    '--subtle': muted,
    '--muted': muted,
    '--line': mix(bg, ink, 0.12),
    '--strong-line': mix(bg, ink, 0.22),
  } as CSSProperties;
}
