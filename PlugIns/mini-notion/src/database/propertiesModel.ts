import { dateParts, dateEpoch, dateText } from './dateValue.ts';
import type { Page, Property, PersonValue, FileValue } from '../types.ts';
import { relationIds } from './relations.ts';
import { evaluateFormula, formulaText, type FormulaContext, type FormulaValue } from './formula.ts';

export function contextFor(page: Page, pages: Page[], chain: Set<string> = new Set()): FormulaContext {
  return {
    pageId: page.id,
    pageName: (id) => pages.find((page) => page.id === id)?.title || '无标题',
    property: (name, targetId = page.id) => {
      const target = pages.find((page) => page.id === targetId && !page.trashedAt);
      if (!target) return null;
      if (['名称', 'Name', 'title'].includes(name)) return target.title;
      if (['创建时间', 'Created time'].includes(name)) return new Date(target.createdAt);
      if (['最后编辑时间', 'Last edited time'].includes(name)) return new Date(target.updatedAt);
      const column = pages
        .find((p) => p.id === target.parentId)
        ?.database?.columns.find((c) => c.name === name);
      if (!column) throw new Error(`未找到属性「${name}」`);
      return rawProperty(target, column, pages, chain);
    },
  };
}

function rawProperty(page: Page, column: Property, pages: Page[], chain: Set<string>): FormulaValue {
  const key = `${page.id}:${column.id}`;
  if (chain.has(key)) throw new Error(`属性「${column.name}」存在循环引用`);
  const next = new Set(chain);
  next.add(key);
  const raw = page.values[column.id];
  if (column.type === 'createdTime') return new Date(page.createdAt);
  if (column.type === 'editedTime') return new Date(page.updatedAt);
  if (column.type === 'createdBy') return page.createdBy || null;
  if (column.type === 'editedBy') return page.editedBy || null;
  if (column.type === 'uniqueId')
    return page.uniqueId?.databaseId === page.parentId
      ? `${column.idPrefix ? column.idPrefix + '-' : ''}${page.uniqueId.number}`
      : '';
  if (column.type === 'person') return Array.isArray(raw) ? (raw as PersonValue[]) : [];
  if (column.type === 'files') return Array.isArray(raw) ? (raw as FileValue[]).map((file) => file.url) : [];
  if (column.type === 'button') return column.button?.label || column.name;
  if (column.type === 'formula') return evaluateFormula(column.formula || '', contextFor(page, pages, next));
  if (column.type === 'relation') return relationIds(page, column, pages).map((id) => ({ kind: 'page', id }));
  if (column.type === 'rollup') {
    const relation = pages
      .find((parent) => parent.id === page.parentId)
      ?.database?.columns.find((property) => property.id === column.relationProperty);
    const ids = relation ? relationIds(page, relation, pages) : page.values[column.relationProperty || ''];
    const related = Array.isArray(ids)
      ? pages.filter((p) => (ids as string[]).includes(p.id) && !p.trashedAt)
      : [];
    if (!column.calculation || column.calculation === 'count') return related.length;
    const values = related.map((target) => {
      if (column.targetProperty === 'title') return target.title;
      const property = pages
        .find((p) => p.id === target.parentId)
        ?.database?.columns.find((c) => c.id === column.targetProperty);
      if (
        property?.type === 'number' &&
        (target.values[property.id] === undefined || target.values[property.id] === '')
      )
        return null;
      return property
        ? rawProperty(target, property, pages, next)
        : ((dateParts(target.values[column.targetProperty || ''])
            ? dateText(target.values[column.targetProperty || ''])
            : (target.values[column.targetProperty || ''] ?? null)) as FormulaValue);
    });
    if (column.calculation === 'show') {
      const flattened: FormulaValue[] = [];
      for (const value of values)
        if (Array.isArray(value)) flattened.push(...value);
        else if (value !== null && value !== '') flattened.push(value);
      return flattened.filter(
        (value, index) =>
          flattened.findIndex((other) => JSON.stringify(other) === JSON.stringify(value)) === index,
      );
    }
    const numbers = values.filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );
    if (!numbers.length) return null;
    if (column.calculation === 'min') return Math.min(...numbers);
    if (column.calculation === 'max') return Math.max(...numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    return column.calculation === 'average' ? sum / numbers.length : sum;
  }
  if (column.type === 'date') {
    const parts = dateParts(raw);
    return !parts
      ? null
      : parts.end
        ? { kind: 'dateRange', start: new Date(dateEpoch(raw)), end: new Date(dateEpoch(raw, 'end')) }
        : new Date(dateEpoch(raw));
  }
  if (column.type === 'number') return raw === '' || raw === undefined ? 0 : Number(raw);
  if (column.type === 'checkbox') return !!raw;
  if (column.type === 'multiSelect') return Array.isArray(raw) ? (raw as string[]) : [];
  return typeof raw === 'object' && !Array.isArray(raw) ? dateText(raw) : ((raw ?? '') as FormulaValue);
}

export type PropertyResult = { ok: true; value: FormulaValue } | { ok: false; error: string };
export function computeProperty(page: Page, column: Property, pages: Page[]): PropertyResult {
  try {
    return { ok: true, value: rawProperty(page, column, pages, new Set()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function readProperty(
  page: Page,
  column: Property,
  pages: Page[],
): string | number | boolean | string[] {
  if (column.type === 'button') return column.button?.label || column.name;
  if (column.type === 'date') return dateText(page.values[column.id]);
  if (column.type === 'files')
    return ((page.values[column.id] || []) as FileValue[]).map((file) => file.name);
  if (
    ![
      'formula',
      'relation',
      'rollup',
      'createdTime',
      'editedTime',
      'createdBy',
      'editedBy',
      'person',
      'uniqueId',
    ].includes(column.type)
  ) {
    const raw = page.values[column.id];
    return typeof raw === 'object' && !Array.isArray(raw)
      ? dateText(raw)
      : ((raw ?? '') as string | number | boolean | string[]);
  }
  const result = computeProperty(page, column, pages);
  if (!result.ok) return `# ${result.error}`;
  const value = result.value;
  const context = contextFor(page, pages, new Set());
  if (value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((value) => formulaText(value, context));
  if (value instanceof Date) return value.toISOString();
  return formulaText(value, context);
}
