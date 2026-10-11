import { useContext } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, Moon, Sun, Monitor } from 'lucide-react';
import { AppearanceTheme, appAppearanceStyle } from '../appearance';
import { colorThemes, colorThemeNames, wallpapers } from '../core/colorThemes';
import type { AppAppearance } from '../core/appearance';
import { useWorkspace } from '../store';
import { AppSelect } from './AppSelect';

/** Appearance choices only; page data and the editor are never recreated. */
export function ThemeSettings() {
  const { workspace, setting } = useWorkspace();
  const tone = useContext(AppearanceTheme);
  const appearance = workspace!.settings.appearance || {};
  const change = (next: Partial<AppAppearance>) => setting({ appearance: { ...appearance, ...next } });
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const at = choices.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : (at + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + choices.length) % choices.length;
    choices[next].focus(); choices[next].click();
  };
  return <section className="theme-studio" aria-label="主题与背景">
    <div className="theme-mode" role="group" aria-label="明暗模式">
      {([{ id: 'light', name: '浅色', icon: Sun }, { id: 'dark', name: '深色', icon: Moon }, { id: 'system', name: '跟随系统', icon: Monitor }] as const).map(item =>
        <button key={item.id} type="button" aria-pressed={workspace!.settings.theme === item.id} onClick={() => setting({ theme: item.id })}><item.icon size={16} />{item.name}</button>)}
    </div>
    <h4>主题配色</h4>
    <div className="theme-palette-grid" role="radiogroup" aria-label="主题配色" onKeyDown={step}>
      {colorThemeNames.map(id => {
        const selected = (appearance.palette || 'classic') === id;
        return <button key={id} type="button" role="radio" aria-checked={selected} aria-label={colorThemes[id].name}
          tabIndex={selected ? 0 : -1} style={appAppearanceStyle({ palette: id }, tone) as CSSProperties}
          onClick={() => change({ palette: id, accentColor: 'default', surface: 'neutral', wallpaper: id === 'classic' ? 'none' : 'glow' })}>
          <span className="palette-preview" aria-hidden="true"><i className="palette-preview-nav" /><i className="palette-preview-sheet"><b /><b /><b /></i><i className="palette-preview-card" /></span>
          <span className="palette-label">{colorThemes[id].name}<Check size={14} aria-hidden="true" /></span>
        </button>;
      })}
    </div>
    <h4>背景纹理</h4>
    <div className="theme-wallpapers" role="radiogroup" aria-label="背景纹理" onKeyDown={step}>
      {Object.entries(wallpapers).map(([id, name]) => {
        const selected = (appearance.wallpaper || 'none') === id;
        return <button key={id} type="button" role="radio" aria-label={name} aria-checked={selected} tabIndex={selected ? 0 : -1}
          onClick={() => change({ wallpaper: id as AppAppearance['wallpaper'] })}>
          <span className="wallpaper-preview" data-wallpaper={id} aria-hidden="true" /><span>{name}</span>
        </button>;
      })}
    </div>
    <p className="theme-studio-note">颜色用于导航、卡片与背景；正文保持清晰，封面图片不受影响。</p>
    <label className="theme-motion">界面动效<AppSelect aria-label="界面动效" value={appearance.motion || 'system'} onChange={event => change({ motion: event.target.value as AppAppearance['motion'] })}>
      <option value="system">轻盈 · 跟随系统</option><option value="reduced">减少动画</option>
    </AppSelect></label>
  </section>;
}
