import iconNames from './iconNames.json' with { type: 'json' };
import { CommandError } from './errors.ts';

// Keep the existing string field: old emojis, copies and page references need no migration.
export const iconColors = {
  default: { name: '默认', light: '#37352f', dark: '#d4d4d4' },
  gray: { name: '灰色', light: '#787774', dark: '#9b9b9b' },
  brown: { name: '棕色', light: '#9f6b53', dark: '#ba856f' },
  orange: { name: '橙色', light: '#d9730d', dark: '#c77d48' },
  yellow: { name: '黄色', light: '#cb912f', dark: '#c49751' },
  green: { name: '绿色', light: '#448361', dark: '#529e72' },
  blue: { name: '蓝色', light: '#337ea9', dark: '#5e87c9' },
  purple: { name: '紫色', light: '#9065b0', dark: '#9d68d3' },
  pink: { name: '粉色', light: '#c14c8a', dark: '#d15796' },
  red: { name: '红色', light: '#d44c47', dark: '#df5452' },
} as const;
export type IconColor = keyof typeof iconColors;
export { iconNames };
const names = new Set(iconNames);
export const iconSchema = {
  field: 'icon',
  formats: ['Unicode emoji', 'icon:<name>:<color>', 'asset://local/<filename>', 'empty string to remove'],
  names: iconNames,
  colors: iconColors,
  example: 'icon:BookOpen:blue',
  calloutField: 'props.emoji',
};
export function parseIcon(value?: string): { name: string; color: IconColor } | undefined {
  const match = /^icon:([A-Za-z0-9]+):([a-z]+)$/.exec(value || '');
  if (match && names.has(match[1]) && Object.hasOwn(iconColors, match[2]))
    return { name: match[1], color: match[2] as IconColor };
}
export function validateIcon(value: unknown) {
  if (typeof value !== 'string' || (value.startsWith('icon:') && !parseIcon(value)))
    throw new CommandError(
      'INVALID_ICON',
      '图标需要 emoji、本地图片或 icon:<name>:<color>；使用 schema 查看图标名称与颜色',
    );
}
