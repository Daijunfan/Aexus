import { CommandError } from './errors.ts';

export const blockColors = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;
export type AppearanceColor = keyof typeof palette | `#${string}`;
export type PageColor = Exclude<AppearanceColor, 'default'>;
export const defaultPageColor: PageColor = 'white';
export const pageColorMeaning = {
  white: '默认白色页面',
  red: '关键、最高重要性',
  orange: '重要、优先处理',
  blue: '常规任务',
  green: '资料与参考',
  gray: '低优先级',
} as const;
export type AppAppearance = {
  accentColor?: AppearanceColor;
  surface?: 'neutral' | 'warm' | 'cool';
  density?: 'comfortable' | 'compact';
  agentColor?: AppearanceColor;
  agentMessages?: 'bubble' | 'plain';
};
export type PageAppearance = {
  backgroundColor?: AppearanceColor;
  textColor?: AppearanceColor;
  accentColor?: AppearanceColor;
  surface?: 'plain' | 'paper';
  coverSize?: 'compact' | 'standard' | 'large';
  titleAlign?: 'left' | 'center';
};
export type ViewAppearance = {
  backgroundColor?: AppearanceColor;
  cardColor?: AppearanceColor;
  accentColor?: AppearanceColor;
};

export const palette = {
  default: { name: '默认', light: '#ffffff', dark: '#191919', ink: '#37352f', darkInk: '#d4d4d4' },
  white: { name: '纯白', light: '#ffffff', dark: '#191919', ink: '#ffffff', darkInk: '#ffffff' },
  stone: { name: '暖灰', light: '#e9e5df', dark: '#34312d', ink: '#625c52', darkInk: '#d2ccc2' },
  sand: { name: '沙色', light: '#eddcc0', dark: '#443728', ink: '#786044', darkInk: '#decaac' },
  black: { name: '墨黑', light: '#26282c', dark: '#101114', ink: '#26282c', darkInk: '#d9dce2' },
  gray: { name: '雾灰', light: '#f1f2f1', dark: '#292b2b', ink: '#606663', darkInk: '#c0c5c2' },
  brown: { name: '胡桃', light: '#f5eee7', dark: '#332a25', ink: '#876046', darkInk: '#d6b599' },
  orange: { name: '浅橙', light: '#fff0df', dark: '#38291f', ink: '#ac581c', darkInk: '#f1b37e' },
  yellow: { name: '麦黄', light: '#faf3d8', dark: '#332e1d', ink: '#8a6c16', darkInk: '#deca79' },
  green: { name: '浅绿', light: '#eaf2eb', dark: '#223129', ink: '#2e7353', darkInk: '#92c5a8' },
  blue: { name: '浅蓝', light: '#eaf2fb', dark: '#222e3b', ink: '#246bac', darkInk: '#94bce5' },
  purple: { name: '浅紫', light: '#f1ebf8', dark: '#302638', ink: '#7953a1', darkInk: '#bca1d8' },
  pink: { name: '浅粉', light: '#faedf2', dark: '#362630', ink: '#a74772', darkInk: '#e0a0bd' },
  red: { name: '浅红', light: '#fbecea', dark: '#362422', ink: '#b74940', darkInk: '#e8a49b' },
  teal: { name: '浅青绿', light: '#d8eee8', dark: '#203b34', ink: '#286c5c', darkInk: '#9ed5c6' },
  cyan: { name: '浅青', light: '#dceff5', dark: '#20353d', ink: '#286778', darkInk: '#a1d4e4' },
  scarlet: { name: '正红', light: '#e5484d', dark: '#a72f39', ink: '#bd2433', darkInk: '#ffadb4' },
  coral: { name: '珊瑚红', light: '#f28072', dark: '#a54e43', ink: '#a74436', darkInk: '#ffc0b7' },
  amber: { name: '琥珀', light: '#eeb54e', dark: '#8e651f', ink: '#926114', darkInk: '#f7d28c' },
  lime: { name: '青柠', light: '#b5ce65', dark: '#5c7129', ink: '#586c22', darkInk: '#d5e7a4' },
  emerald: { name: '翡翠绿', light: '#46ae7b', dark: '#246d4b', ink: '#237448', darkInk: '#91dcba' },
  turquoise: { name: '绿松石', light: '#42b7af', dark: '#256e69', ink: '#217b75', darkInk: '#97ddd7' },
  sky: { name: '天蓝', light: '#62b6e8', dark: '#296283', ink: '#2375a7', darkInk: '#a5d8f5' },
  cobalt: { name: '宝蓝', light: '#477bdd', dark: '#294987', ink: '#315eaf', darkInk: '#adc6fa' },
  indigo: { name: '靛蓝', light: '#6667ce', dark: '#3e3c85', ink: '#504cad', darkInk: '#c5bffd' },
  violet: { name: '亮紫', light: '#a16cce', dark: '#683e8b', ink: '#7944a3', darkInk: '#ddbbf5' },
  magenta: { name: '洋红', light: '#cb61aa', dark: '#86386e', ink: '#9e3b80', darkInk: '#f2b3dd' },
  rose: { name: '玫红', light: '#df668c', dark: '#933653', ink: '#b33562', darkInk: '#ffb8cf' },
  crimson: { name: '酒红', light: '#8e3044', dark: '#62202f', ink: '#8e3044', darkInk: '#f0a8bb' },
  forest: { name: '森林绿', light: '#295c47', dark: '#183a2d', ink: '#295c47', darkInk: '#a0d4b9' },
  navy: { name: '藏青', light: '#264c78', dark: '#182e4a', ink: '#264c78', darkInk: '#a9c9ef' },
} as const;

export const appearanceColors = [
  'default',
  'white',
  'stone',
  'gray',
  'brown',
  'sand',
  'black',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
  'scarlet',
  'coral',
  'amber',
  'lime',
  'emerald',
  'turquoise',
  'sky',
  'cobalt',
  'indigo',
  'violet',
  'magenta',
  'rose',
  'crimson',
  'forest',
  'navy',
] as const;

export const appearanceSchema = {
  pageColor: {
    requiredOnCreate: true,
    field: 'color',
    defaultForLegacy: defaultPageColor,
    textField: 'textColor',
    meaning: pageColorMeaning,
  },
  palette,
  colors: appearanceColors,
  customColor: '#RRGGBB',
  reset: 'appearance: null',
  application: {
    accentColor: 'color',
    surface: ['neutral', 'warm', 'cool'],
    density: ['comfortable', 'compact'],
    agentColor: 'color',
    agentMessages: ['bubble', 'plain'],
  },
  page: { color: 'required color; page and all its cards share it', textColor: 'default / preset / #RRGGBB' },
  legacyPageInput:
    'appearance.backgroundColor/textColor are accepted on import and page.update, then migrated to color/textColor. appearance.surface/accentColor no longer affect page colors.',
  view: { backgroundColor: 'color', cardColor: 'color', accentColor: 'color' },
  block: { backgroundColor: blockColors, textColor: blockColors },
} as const;

type PageColorInput = {
  color?: AppearanceColor;
  textColor?: AppearanceColor;
  appearance?: PageAppearance | null;
};

/** One persisted color for both a page and every card representing it. */
export function normalizePageColors<T extends PageColorInput>(page: T) {
  const { appearance, ...rest } = page;
  const color = page.color ?? appearance?.backgroundColor ?? defaultPageColor;
  const {
    backgroundColor: _background,
    textColor: _text,
    accentColor: _accent,
    surface: _surface,
    ...layout
  } = appearance || {};
  return {
    ...rest,
    color: (color === 'default' ? defaultPageColor : color) as PageColor,
    textColor: page.textColor ?? appearance?.textColor ?? 'default',
    ...(Object.keys(layout).length ? { appearance: layout } : {}),
  };
}

export function validatePageColor(value: unknown, field = 'color') {
  if (
    typeof value !== 'string' ||
    !(appearanceColors.includes(value as (typeof appearanceColors)[number]) || /^#[\da-f]{6}$/i.test(value))
  )
    throw new CommandError('INVALID_PAGE_COLOR', `${field} 需要预设颜色或 #RRGGBB`, {
      field,
      colors: appearanceColors,
      meaning: pageColorMeaning,
    });
}

export function requiredPageColor(params: PageColorInput): PageColor {
  const color = params.color ?? params.appearance?.backgroundColor;
  if (color === undefined)
    throw new CommandError(
      'PAGE_COLOR_REQUIRED',
      '创建页面必须提供 color，例如 --color white；重要事项可选 orange、red 或 scarlet',
      { field: 'color', meaning: pageColorMeaning },
    );
  validatePageColor(color);
  return color === 'default' ? defaultPageColor : (color as PageColor);
}

/** Accept the previous API shape at the boundary, without keeping two color fields. */
export function pageColorChanges<T extends PageColorInput>(changes: T): T {
  if (changes.color !== undefined) validatePageColor(changes.color);
  if (changes.textColor !== undefined) validatePageColor(changes.textColor, 'textColor');
  if (!Object.hasOwn(changes, 'appearance')) return changes;
  validateAppearance(changes.appearance, 'page');
  return {
    ...changes,
    ...(changes.color === undefined &&
    (changes.appearance === null || changes.appearance?.backgroundColor !== undefined)
      ? { color: changes.appearance?.backgroundColor || defaultPageColor }
      : {}),
    ...(changes.textColor === undefined &&
    (changes.appearance === null || changes.appearance?.textColor !== undefined)
      ? { textColor: changes.appearance?.textColor || 'default' }
      : {}),
  };
}

export function validateAppearance(value: unknown, scope: 'application' | 'page' | 'view') {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value))
    throw new CommandError('INVALID_APPEARANCE', '外观需要对象；null 恢复默认');
  const fields =
    scope === 'page'
      ? {
          backgroundColor: 'color',
          textColor: 'color',
          accentColor: 'color',
          surface: ['plain', 'paper'],
          coverSize: ['compact', 'standard', 'large'],
          titleAlign: ['left', 'center'],
        }
      : appearanceSchema[scope];
  for (const [key, setting] of Object.entries(value)) {
    const definition = (Object.hasOwn(fields, key) ? fields[key as keyof typeof fields] : undefined) as
      'color' | readonly string[] | undefined;
    if (!definition) throw new CommandError('INVALID_APPEARANCE', `未知外观字段 ${key}`, { fields });
    const valid =
      typeof setting === 'string' &&
      (definition === 'color'
        ? appearanceColors.includes(setting as (typeof appearanceColors)[number]) ||
          /^#[\da-f]{6}$/i.test(setting)
        : definition.includes(setting));
    if (!valid)
      throw new CommandError('INVALID_APPEARANCE', `外观字段 ${key} 的值无效`, {
        allowed: definition === 'color' ? [...appearanceColors, '#RRGGBB'] : definition,
      });
  }
}
