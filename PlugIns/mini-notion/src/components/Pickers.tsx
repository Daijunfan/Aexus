import { useState, useRef, useContext } from 'react';
import { Upload, Shuffle, X, Search, Check } from 'lucide-react';
import { Popover, MenuItem, PageIcon } from '../ui';
import { saveAsset } from '../content/assets';
import { useWorkspace } from '../store';
import { AppearanceTheme } from '../appearance';
import { iconColors, parseIcon, type IconColor } from '../core/icons';
import { emojis, emojiGroups, symbols, matchesIcon } from '../core/iconSearch';

export function EmojiPicker({
  x,
  y,
  value,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (icon: string) => void;
  onClose: () => void;
}) {
  const current = parseIcon(value);
  const [tab, setTab] = useState<'emoji' | 'icon' | 'upload'>(
    current ? 'icon' : /^(asset:|https?:|data:)/.test(value) ? 'upload' : 'emoji',
  );
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [color, setColor] = useState<IconColor>(current?.color || 'default');
  const [limit, setLimit] = useState(180);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const theme = useContext(AppearanceTheme);
  const { notify } = useWorkspace();
  const choose = (icon: string) => {
    onChange(icon);
    onClose();
  };
  const choices =
    tab === 'icon'
      ? symbols
          .filter((item) => matchesIcon(query, item.name, item.keywords))
          .map((item) => ({ value: `icon:${item.name}:${color}`, name: item.name }))
      : emojis
          .filter(
            (item) =>
              (!group || item.group === group) && matchesIcon(query, item.emoji, item.name, item.keywords),
          )
          .map((item) => ({ value: item.emoji, name: item.name }));
  const exact = query.trim().toLocaleLowerCase();
  if (exact) choices.sort((a, b) => Number(b.value === exact || b.name.toLocaleLowerCase() === exact) - Number(a.value === exact || a.name.toLocaleLowerCase() === exact));
  const pasted = [...new Intl.Segmenter().segment(query.trim())];
  if (
    tab === 'emoji' &&
    pasted.length === 1 &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(query) &&
    !choices.some((item) => item.value === query.trim())
  )
    choices.unshift({ value: query.trim(), name: query.trim() });
  return (
    <Popover x={x} y={y} onClose={onClose} width={360} className="icon-picker" role="dialog" label="选择图标">
      <div className="icon-picker-tabs" role="tablist" aria-label="图标类型">
        {(
          [
            ['emoji', '表情符号'],
            ['icon', '图标'],
            ['upload', '上传'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setQuery('');
              setLimit(180);
              requestAnimationFrame(() => search.current?.focus());
            }}
          >
            {label}
          </button>
        ))}
        <button
          className="icon-picker-random"
          title="随机图标"
          aria-label="随机图标"
          disabled={!choices.length || saving}
          onClick={() => choose(choices[Math.floor(Math.random() * choices.length)].value)}
        >
          <Shuffle size={16} />
        </button>
      </div>
      {tab !== 'upload' ? (
        <>
          <label className="icon-picker-search">
            <Search size={15} />
            <input
              ref={search}
              autoFocus
              aria-label="搜索图标"
              placeholder="搜索或粘贴表情符号…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(180);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter' && choices[0]) {
                  event.preventDefault();
                  choose(choices[0].value);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  event.currentTarget
                    .closest('.icon-picker')
                    ?.querySelector<HTMLButtonElement>('.icon-picker-grid button')
                    ?.focus();
                }
              }}
            />
          </label>
          {tab === 'icon' ? (
            <div className="icon-picker-colors" aria-label="图标颜色">
              {Object.entries(iconColors).map(([id, tone]) => (
                <button
                  key={id}
                  title={tone.name}
                  aria-label={tone.name}
                  aria-pressed={color === id}
                  style={{ color: tone[theme] }}
                  onClick={() => {
                    setColor(id as IconColor);
                    if (current) onChange(`icon:${current.name}:${id}`);
                  }}
                >
                  <span style={{ background: tone[theme] }}>{color === id && <Check size={12} />}</span>
                </button>
              ))}
            </div>
          ) : (
            <select
              className="icon-picker-category"
              aria-label="表情分类"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setLimit(180);
              }}
            >
              <option value="">全部表情</option>
              {Object.entries(emojiGroups).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <div className="icon-picker-results" key={`${tab}:${query}:${group}`}>
            {!choices.length && <p className="icon-picker-empty">没有找到匹配的图标</p>}
            <div
              className="icon-picker-grid"
              onKeyDown={(event) => {
                const offset = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 9, ArrowUp: -9 }[event.key];
                if (!offset) return;
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
                const index = buttons.indexOf(event.target as HTMLButtonElement);
                buttons[Math.max(0, Math.min(buttons.length - 1, index + offset))]?.focus();
              }}
            >
              {choices.slice(0, limit).map((item) => (
                <button
                  key={item.value}
                  aria-label={item.name}
                  title={item.name}
                  aria-pressed={value === item.value}
                  onClick={() => choose(item.value)}
                >
                  <PageIcon icon={item.value} size={tab === 'icon' ? 22 : 25} />
                </button>
              ))}
            </div>
            {choices.length > limit && (
              <button className="icon-picker-more" onClick={() => setLimit(limit + 180)}>
                显示更多（{choices.length - limit}）
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="icon-picker-upload">
          {value && <PageIcon icon={value} size={64} />}
          <button className="secondary-button" disabled={saving} onClick={() => ref.current?.click()}>
            <Upload size={16} />
            {saving ? '正在保存…' : '上传图片'}
          </button>
          <p>选择本地图片，建议 280 × 280 像素。</p>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setSaving(true);
          try {
            choose(await saveAsset(file));
          } catch {
            notify('图标保存失败，请重试');
          } finally {
            setSaving(false);
          }
        }}
      />
      <div className="menu-divider" />
      <MenuItem icon={<X size={15} />} disabled={saving} onClick={() => choose('')}>
        移除图标
      </MenuItem>
    </Popover>
  );
}
export const covers = [
  { id: 'paper', name: '纸上山丘' },
  { id: 'sand', name: '暖沙' },
  { id: 'sage', name: '鼠尾草' },
  { id: 'dusk', name: '暮色' },
  { id: 'blue', name: '远山' },
  { id: 'pink', name: '浅樱' },
  { id: 'ink', name: '水墨' },
  { id: 'sunset', name: '日落' },
  ...Object.entries(iconColors)
    .filter(([id]) => id !== 'default')
    .map(([id, color]) => ({ id: `solid-${id}`, name: color.name })),
];
export function CoverPicker({
  x,
  y,
  value,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  value?: string | null;
  onChange: (cover: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'gallery' | 'upload'>('gallery');
  const { notify } = useWorkspace();
  const [saving, setSaving] = useState(false);
  return (
    <Popover
      x={x}
      y={y}
      width={380}
      onClose={onClose}
      className="cover-picker"
      role="dialog"
      label="选择封面"
    >
      <div className="icon-picker-tabs" role="tablist" aria-label="封面类型">
        <button role="tab" aria-selected={tab === 'gallery'} onClick={() => setTab('gallery')}>
          图库
        </button>
        <button role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}>
          上传
        </button>
      </div>
      {tab === 'gallery' ? (
        <>
          <div className="picker-heading">颜色与渐变</div>
          <div className="cover-grid">
            {covers.map((cover) => (
              <button
                key={cover.id}
                className={`cover-${cover.id}`}
                title={cover.name}
                aria-label={cover.name}
                aria-pressed={value === cover.id}
                disabled={saving}
                onClick={() => {
                  onChange(cover.id);
                  onClose();
                }}
              >{value === cover.id && <Check size={18} aria-hidden="true" />}</button>
            ))}
          </div>
        </>
      ) : (
        <div className="icon-picker-upload">
          <button className="secondary-button" disabled={saving} onClick={() => ref.current?.click()}>
            <Upload size={16} />
            {saving ? '正在保存…' : '上传图片'}
          </button>
          <p>选择本地图片，建议宽度至少 1,500 像素。</p>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setSaving(true);
          try {
            onChange(await saveAsset(file));
            onClose();
          } catch {
            notify('封面保存失败，请重试');
          } finally {
            setSaving(false);
            e.target.value = '';
          }
        }}
      />
      <div className="menu-divider" />
      <MenuItem
        icon={<X size={15} />}
        disabled={saving || !value}
        onClick={() => {
          onChange(null);
          onClose();
        }}
      >
        移除封面
      </MenuItem>
    </Popover>
  );
}
