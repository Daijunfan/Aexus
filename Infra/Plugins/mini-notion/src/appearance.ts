import { colorThemes } from './core/colorThemes';
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
export function themeSurface(a: AppAppearance | null | undefined, theme: Tone) {
  const preset = colorThemes[a?.palette || 'classic'] || colorThemes.classic;
  const base = surfaceColors(a?.surface, theme);
  const bg = a?.surface && a.surface !== 'neutral' ? base.bg : preset[theme];
  const accent = appearanceColor(a?.accentColor, theme, true) || preset.accent;
  const sidebar = !a?.palette || a.palette === 'classic' ? base.sidebar : mix(bg, accent, theme === 'dark' ? .12 : .07);
  return { bg, sidebar, accent, companion: preset.companion };
}
function accentTokens(accent: string, background: string, ink: string) {
  return {
    '--blue': readableAccent(accent, background),
    '--blue-hover': mix(accent, ink, 0.15),
    '--accent-end': mix(accent, readableInk(accent) === '#ffffff' || readableInk(accent) === '#f0f0ef' ? '#000000' : '#ffffff', .08),
    '--accent-solid': accent,
    '--accent-contrast': readableInk(accent),
  };
}
export function appAppearanceStyle(a: AppAppearance | null | undefined, theme: Tone): Record<string, string> {
  const { bg, sidebar, accent, companion } = themeSurface(a, theme),
    ink = theme === 'dark' ? '#d4d4d4' : '#37352f';
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
    '--text': ink,
    '--muted': readableAccent(mix(ink, bg, .4), bg),
    '--subtle': mix(ink, bg, .22),
    '--line': mix(bg, ink, .10),
    '--strong-line': mix(bg, ink, .21),
    '--hover': mix(bg, accent, theme === 'dark' ? .14 : .06),
    '--selected': mix(bg, accent, theme === 'dark' ? .24 : .13),
    '--theme-accent': accent,
    '--theme-companion': companion,
    '--theme-wash': mix(bg, accent, theme === 'dark' ? .22 : .17),
    '--theme-wash-secondary': mix(bg, companion, theme === 'dark' ? .23 : .20),
    '--theme-card': theme === 'dark' ? mix(bg, '#ffffff', .035) : '#ffffff',
    '--theme-pattern': mix(bg, accent, theme === 'dark' ? .21 : .15),
    ...accentTokens(accent, bg, ink),
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
  const { bg: canvas, accent } = themeSurface(application, theme);
  const color = appearanceColor(value.color, theme)!;
  const ink = appearanceColor(value.textColor, theme, true) || readableInk(canvas);
  return {
    '--page-color': color,
    '--page-color-ink': readableInk(color),
    '--page-canvas': canvas,
    '--page-paper': canvas,
    '--page-ink': ink,
    '--page-muted': mix(ink, canvas, 0.4),
    '--page-cover-height': `${{ compact: 144, standard: 224, large: 320 }[value.appearance?.coverSize || 'standard']}px`,
    '--page-link': readableAccent(accent, canvas),
    ...accentTokens(accent, canvas, ink),
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
    accent = appearanceColor(accentValue, theme, true) || themeSurface(application, theme).accent;
  const rangeBg = accentValue?.startsWith('#')
    ? mix(bg || themeSurface(application, theme).bg, accent, 0.16)
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
          ...accentTokens(accent, bg || themeSurface(application, theme).bg, readableInk(bg || themeSurface(application, theme).bg)),
          '--view-range-bg': rangeBg,
          '--view-range-ink': readableAccent(accent, rangeBg),
        }
      : {}),
  } as CSSProperties;
}

export function recordAppearanceStyle(page: PageColors, theme: Tone, application?: AppAppearance | null): CSSProperties {
  const value = normalizePageColors(page);
  const color = appearanceColor(value.color, theme)!;
  const surface = themeSurface(application, theme).bg;
  const bg = theme === 'dark' ? mix(surface, '#ffffff', .035) : '#ffffff';
  const ink = appearanceColor(value.textColor, theme, true) || readableInk(bg),
    muted = mix(ink, bg, 0.4);
  return {
    '--record-accent': value.color === 'white' ? 'var(--strong-line)' : color,
    '--record-accent-width': value.color === 'white' ? '1px' : '3px',
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
