import type { Property, PropertyType, StatusGroup, Workspace, PersonValue, Page } from '../types.ts';
import { CommandError } from '../core/errors.ts';
import { localTimeZone } from './dateValue.ts';

export const propertyTypes: PropertyType[] = [
  'text',
  'number',
  'select',
  'status',
  'multiSelect',
  'date',
  'checkbox',
  'url',
  'email',
  'phone',
  'person',
  'files',
  'createdTime',
  'editedTime',
  'createdBy',
  'editedBy',
  'uniqueId',
  'relation',
  'rollup',
  'formula',
  'button',
];
export const propertyColors = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const statusGroupNames: Record<StatusGroup, string> = {
  todo: '未开始',
  doing: '进行中',
  done: '已完成',
};
export const statusGroupOrder: StatusGroup[] = ['todo', 'doing', 'done'];
export const isReadOnlyProperty = (column: Property) =>
  ['formula', 'rollup', 'button', 'createdTime', 'editedTime', 'createdBy', 'editedBy', 'uniqueId'].includes(
    column.type,
  );
export const isSystemProperty = (column: Property) =>
  ['createdTime', 'editedTime', 'createdBy', 'editedBy', 'uniqueId'].includes(column.type);
export const isSelectProperty = (column: Property) => column.type === 'select' || column.type === 'status';
export const isDateProperty = (column: Property) =>
  ['date', 'createdTime', 'editedTime'].includes(column.type);
export function propertyDateValue(page: Page, property?: string | Property) {
  if (typeof property === 'object') {
    if (property.type === 'createdTime')
      return { start: new Date(page.createdAt).toISOString(), timeZone: localTimeZone() };
    if (property.type === 'editedTime')
      return { start: new Date(page.updatedAt).toISOString(), timeZone: localTimeZone() };
    return page.values[property.id];
  }
  return page.values[property || ''];
}
export const statusGroup = (column: Property, value: string): StatusGroup =>
  statusGroupOrder.find((group) => column.statusGroups?.[group]?.includes(value)) || 'todo';
export const defaultStatus = (column: Property) =>
  column.defaultStatus || column.statusGroups?.todo[0] || column.options?.[0] || '';
export const localPerson = (workspace: Workspace): PersonValue => ({
  kind: 'person',
  id: 'local',
  name: workspace.settings.authorName || '我',
  email: workspace.settings.authorEmail || '',
});
export const workspacePeople = (workspace: Workspace): PersonValue[] => [
  localPerson(workspace),
  ...(workspace.people || []).filter((person) => person.id !== 'local'),
];
export function normalizeProperty(column: Property): Property {
  if (column.type !== 'status') return column;
  const groups = column.statusGroups
    ? structuredClone(column.statusGroups)
    : {
        todo: column.options?.filter(
          (option) => !/^(进行中|in progress|已完成|完成|done)$/i.test(option),
        ) || ['未开始'],
        doing: column.options?.filter((option) => /^(进行中|in progress)$/i.test(option)) || ['进行中'],
        done: column.options?.filter((option) => /^(已完成|完成|done)$/i.test(option)) || ['已完成'],
      };
  const options = statusGroupOrder.flatMap((group) => groups[group] || []);
  if (!options.length) {
    groups.todo = ['未开始'];
    groups.doing = ['进行中'];
    groups.done = ['已完成'];
    options.push('未开始', '进行中', '已完成');
  }
  return {
    ...column,
    statusGroups: groups,
    options,
    defaultStatus: options.includes(column.defaultStatus || '')
      ? column.defaultStatus
      : groups.todo[0] || options[0],
  };
}
export function validateProperty(column: Property) {
  if (!column.id || typeof column.name !== 'string' || !propertyTypes.includes(column.type))
    throw new CommandError('INVALID_PROPERTY', '属性定义无效');
  if (
    column.options &&
    (!Array.isArray(column.options) || column.options.some((value) => typeof value !== 'string'))
  )
    throw new CommandError('INVALID_OPTIONS', '选项必须是字符串数组');
  if (
    column.optionColors &&
    Object.values(column.optionColors).some((color) => !propertyColors.includes(color))
  )
    throw new CommandError('INVALID_COLOR', '选项颜色无效');
  if (column.type === 'status') {
    const options = statusGroupOrder.flatMap((group) => column.statusGroups?.[group] || []);
    if (
      !column.statusGroups ||
      !statusGroupOrder.every((group) => Array.isArray(column.statusGroups![group])) ||
      new Set(options).size !== options.length ||
      options.some((value) => typeof value !== 'string' || !value.trim()) ||
      !options.length
    )
      throw new CommandError('INVALID_STATUS', '状态需要三个分组，选项名称不能为空或重复');
    if (column.defaultStatus && !options.includes(column.defaultStatus))
      throw new CommandError('INVALID_STATUS', '默认状态必须是已有选项');
  }
  if (
    column.type === 'uniqueId' &&
    column.idPrefix !== undefined &&
    !/^[\p{L}\p{N}_-]*$/u.test(column.idPrefix)
  )
    throw new CommandError('INVALID_ID_PREFIX', '编号前缀只支持文字、数字、下划线和连字符');
}
