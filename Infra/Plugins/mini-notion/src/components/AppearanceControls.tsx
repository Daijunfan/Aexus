import { PageIcon } from '../ui';
import { useContext, useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { AppearanceColor, ViewAppearance } from '../core/appearance';
import { appearanceColors, defaultPageColor } from '../core/appearance';
import { palette, appearanceColor, pageAppearanceStyle, AppearanceTheme, readableInk } from '../appearance';
import { useWorkspace } from '../store';
import { Modal } from '../ui';

export function AppearanceColorField({
  label,
  value = 'default',
  onChange,
  allowDefault = true,
}: {
  label: string;
  allowDefault?: boolean;
  value?: AppearanceColor;
  onChange: (value: AppearanceColor) => void;
}) {
  const theme = useContext(AppearanceTheme);
  const [custom, setCustom] = useState(value.startsWith('#') ? value : '');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setCustom(value.startsWith('#') ? value : '');
    setChecked(false);
  }, [value]);
  const commit = () => {
    setChecked(true);
    if (/^#[\da-f]{6}$/i.test(custom)) onChange(custom as AppearanceColor);
    else if (!custom.trim() && value.startsWith('#')) onChange('default');
  };
  return (
    <fieldset className="appearance-color-field">
      <legend>
        {label}
        <span className="appearance-current-color">
          {palette[value as keyof typeof palette]?.name || value}
        </span>
      </legend>
      {allowDefault && (
        <button
          type="button"
          className="appearance-default-color"
          aria-label={`${label}：默认`}
          aria-pressed={value === 'default'}
          onClick={() => onChange('default')}
        >
          <span className="default-swatch">{value === 'default' && <Check size={13} />}</span>使用默认
        </button>
      )}
      <div className="appearance-swatches">
        {appearanceColors
          .filter((color) => color !== 'default')
          .map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${label}：${palette[color].name}`}
              aria-pressed={value === color}
              title={palette[color].name}
              className="appearance-swatch"
              style={{
                backgroundColor: appearanceColor(color, theme),
                color: readableInk(appearanceColor(color, theme)!),
              }}
              onClick={() => onChange(color)}
            >
              {value === color && <Check size={15} />}
            </button>
          ))}
      </div>
      <div className="appearance-custom-color">
        <span>自定义</span>
        <input
          aria-label={`${label}自定义颜色`}
          value={custom}
          placeholder="#RRGGBB"
          maxLength={7}
          onChange={(e) => {
            setCustom(e.target.value.trim());
            setChecked(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {value.startsWith('#') && <span className="appearance-custom-sample" style={{ background: value }} />}
      </div>
      {checked && custom && !/^#[\da-f]{6}$/i.test(custom) && (
        <small className="appearance-color-error" role="alert">
          请输入六位颜色值，例如 #DDEBE2
        </small>
      )}
    </fieldset>
  );
}

export function ViewAppearanceControls({
  value,
  onChange,
}: {
  value?: ViewAppearance | null;
  onChange: (value: ViewAppearance | null) => void;
}) {
  const change = (key: keyof ViewAppearance, color: AppearanceColor) => onChange({ ...value, [key]: color });
  return (
    <div className="appearance-view-controls">
      <p className="appearance-description">视图背景独立设置，每张事件卡片沿用对应页面的颜色标识。</p>
      <AppearanceColorField
        label="视图背景"
        value={value?.backgroundColor}
        onChange={(color) => change('backgroundColor', color)}
      />
      <AppearanceColorField
        label="视图主题色"
        value={value?.accentColor}
        onChange={(color) => change('accentColor', color)}
      />
      <button className="appearance-reset" onClick={() => onChange(null)}>
        <RotateCcw size={13} />
        恢复默认外观
      </button>
    </div>
  );
}

export function PageAppearanceDialog() {
  const { workspace, modal, setModal, patch } = useWorkspace();
  const theme = useContext(AppearanceTheme);
  const page = workspace!.pages.find((p) => p.id === modal?.pageId);
  if (!page) return null;
  return (
    <Modal title="页面颜色" onClose={() => setModal(null)} wide className="page-appearance-modal">
      <div className="appearance-layout modal-body">
        <div className="appearance-options">
          <p className="appearance-description">
            颜色用于页面标记与日历、看板中的事件标识。正文保持干净的纸面，修改会自动保存。
          </p>
          <AppearanceColorField
            label="页面颜色"
            value={page.color}
            allowDefault={false}
            onChange={(color) => patch(page.id, { color: color === 'default' ? defaultPageColor : color })}
          />
          <AppearanceColorField
            label="默认文字颜色"
            value={page.textColor}
            onChange={(textColor) => patch(page.id, { textColor })}
          />
          <p className="appearance-description">
            红色用于关键事项，橙色用于重要事项，蓝色用于常规任务，绿色用于资料，灰色用于低优先事项。也可以按自己的习惯选择。
          </p>
          <button
            className="appearance-reset"
            onClick={() => patch(page.id, { color: defaultPageColor, textColor: 'default' })}
          >
            <RotateCcw size={13} />
            恢复默认配色
          </button>
        </div>
        <div
          className="appearance-live-preview"
          style={pageAppearanceStyle(page, theme, workspace!.settings.appearance)}
        >
          <span className="appearance-preview-label">页面与事件预览</span>
          <article>
            <span className="appearance-preview-icon"><PageIcon icon={page.icon || '✦'} size={32} /></span>
            <h2>{page.title || '我的页面'}</h2>
            <p>正文沿用本页面的默认文字颜色。</p>
            <div className="appearance-preview-callout">
              <PageIcon icon={page.icon || '✦'} size={16} /> {page.title || '日历事件'}
              <br />
              09:00 · 保留页面颜色标记
            </div>
          </article>
        </div>
      </div>
    </Modal>
  );
}
