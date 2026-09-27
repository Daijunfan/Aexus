import type { Workspace, Page, Property, PersonValue, FileValue } from '../types.ts';
import { CommandError } from '../core/errors.ts';
import { isInternalPage } from '../model.ts';
import {
  normalizeProperty,
  validateProperty,
  isSystemProperty,
  defaultStatus,
  localPerson,
  workspacePeople,
  isSelectProperty,
} from './propertySchema.ts';

export function updateOptionValues(
  workspace: Workspace,
  databaseId: string,
  column: Property,
  renames: Record<string, string> = {},
): Workspace {
  if (!isSelectProperty(column) && column.type !== 'multiSelect') return workspace;
  const rename = (value: string) => (Object.hasOwn(renames, value) ? renames[value] : value);
  const keep = (value: string) => column.options?.includes(value);
  return {
    ...workspace,
    pages: workspace.pages.map((page) => {
      if (page.parentId !== databaseId || !Object.hasOwn(page.values, column.id)) return page;
      const old = page.values[column.id],
        values = (Array.isArray(old) ? old : [old])
          .filter((value): value is string => typeof value === 'string')
          .map(rename)
          .filter(keep);
      const value =
        column.type === 'multiSelect'
          ? [...new Set(values)]
          : values[0] || (column.type === 'status' ? defaultStatus(column) : '');
      return JSON.stringify(old) === JSON.stringify(value)
        ? page
        : { ...page, values: { ...page.values, [column.id]: value }, updatedAt: Date.now() };
    }),
  };
}

export function normalizePropertyValue(
  value: unknown,
  column: Property,
  workspace: Workspace,
): Page['values'][string] {
  if (column.type === 'person') {
    const entries = value === '' || value == null ? [] : Array.isArray(value) ? value : [value];
    const people = workspacePeople(workspace);
    const selected = entries.map((entry) => {
      if (
        entry &&
        typeof entry === 'object' &&
        entry.kind === 'person' &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string'
      )
        return { ...entry, email: entry.email || '' } as PersonValue;
      const person = people.find(
        (person) => person.id === entry || person.name === entry || (person.email && person.email === entry),
      );
      if (!person) throw new CommandError('PERSON_NOT_FOUND', `找不到本地人员 ${String(entry)}`);
      return person;
    });
    if (column.personLimit === 1 && selected.length > 1)
      throw new CommandError('PERSON_LIMIT', '此属性只允许选择一个人');
    return selected.filter(
      (person, index) => selected.findIndex((value) => value.id === person.id) === index,
    );
  }
  if (column.type === 'files') {
    if (value === '' || value == null) return [];
    if (!Array.isArray(value)) throw new CommandError('INVALID_FILES', '附件值需要文件数组');
    return value.map((file) => {
      if (
        !file ||
        typeof file.name !== 'string' ||
        typeof file.url !== 'string' ||
        !/^(asset:\/\/local\/|https?:\/\/|data:)/i.test(file.url)
      )
        throw new CommandError('INVALID_FILE', '附件需要名称和本地附件地址或网页链接');
      return { ...file, id: file.id || crypto.randomUUID() } as FileValue;
    });
  }
  if (column.type === 'status') {
    if (value === '' || value === undefined || value === null) return defaultStatus(column);
    if (typeof value !== 'string' || !column.options?.includes(value))
      throw new CommandError('INVALID_STATUS', `「${column.name}」中没有状态 ${String(value)}`);
  }
  return value as Page['values'][string];
}
const recovery = new Set([
  'workspace.replace',
  'backup.restore',
  'history.undo',
  'history.redo',
  'history.restore',
  'file.import',
  'normalize',
  'person.update',
]);
export function finalizeProperties(before: Workspace | null, after: Workspace, method: string): Workspace {
  const preserve = recovery.has(method),
    previous = new Map(before?.pages.map((page) => [page.id, page]));
  const actor = localPerson(after),
    now = Date.now();
  const owners = new Map(after.pages.filter((page) => page.database).map((page) => [page.id, page]));
  let pages = after.pages.map((page) => {
    const old = previous.get(page.id);
    let next = page;
    if (page.database) {
      const columns = page.database.columns.map(normalizeProperty);
      columns.forEach(validateProperty);
      if (JSON.stringify(columns) !== JSON.stringify(page.database.columns))
        next = { ...next, database: { ...page.database, columns } };
      owners.set(page.id, next);
    }
    if (!preserve && (!old || JSON.stringify(old) !== JSON.stringify(next)))
      next = { ...next, createdBy: old?.createdBy || (!old ? actor : undefined), editedBy: actor };
    return next;
  });
  // workspace.patch drops the GUI's provisional ledger before reaching this boundary.
  // Keep reservations made by earlier steps of an atomic batch, regardless of row order.
  const undo = ['history.undo', 'history.redo', 'history.restore'].includes(method);
  const ledger = structuredClone(undo ? before?.uniqueIds || {} : after.uniqueIds || {});
  if (!preserve)
    for (const [id, state] of Object.entries(before?.uniqueIds || {}))
      ledger[id] = {
        next: Math.max(state.next, ledger[id]?.next || 1),
        pages: { ...ledger[id]?.pages, ...state.pages },
      };
  pages = pages.map((page) => {
    const database = owners.get(page.parentId || '')?.database;
    if (!database) return page;
    const old = previous.get(page.id),
      values = { ...page.values };
    let changed = false;
    for (const column of database.columns) {
      if (isSystemProperty(column)) {
        if (
          !preserve &&
          Object.hasOwn(values, column.id) &&
          JSON.stringify(values[column.id]) !== JSON.stringify(old?.values[column.id])
        )
          throw new CommandError('READ_ONLY_PROPERTY', `「${column.name}」由系统自动填写`);
        if (Object.hasOwn(values, column.id)) {
          delete values[column.id];
          changed = true;
        }
        continue;
      }
      if (!['person', 'files', 'status'].includes(column.type)) continue;
      if (isInternalPage(page, pages) && values[column.id] === undefined) continue;
      const normalized = normalizePropertyValue(values[column.id], column, after);
      if (JSON.stringify(normalized) !== JSON.stringify(values[column.id])) {
        values[column.id] = normalized;
        changed = true;
      }
    }
    let next = changed ? { ...page, values } : page;
    if (database.columns.some((column) => column.type === 'uniqueId') && !isInternalPage(page, pages)) {
      const id = page.parentId!,
        state = (ledger[id] ||= { next: 1, pages: {} });
      let number = state.pages[page.id];
      if (!number) {
        const imported = preserve && page.uniqueId?.databaseId === id ? page.uniqueId.number : undefined;
        number = imported || state.next;
        state.pages[page.id] = number;
        state.next = Math.max(state.next, number + 1);
      }
      if (next.uniqueId?.databaseId !== id || next.uniqueId.number !== number)
        next = { ...next, uniqueId: { databaseId: id, number } };
    }
    if (!preserve && old && next !== page && JSON.stringify(old.values) !== JSON.stringify(next.values))
      next = { ...next, updatedAt: now, editedBy: actor };
    return next;
  });
  return { ...after, pages, ...(Object.keys(ledger).length ? { uniqueIds: ledger } : {}) };
}
