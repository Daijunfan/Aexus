import { isSelectProperty, isDateProperty, propertyDateValue } from './propertySchema.ts';
import type {
  Aggregate,
  Database,
  DatabaseView,
  FilterGroup,
  FilterRule,
  Page,
  PersonValue,
  Property,
  ViewType,
} from '../types.ts';
import { readProperty, isTemplatePage } from '../model.ts';
import { dateWall, dateEpoch } from './dateValue.ts';
import { relationIds } from './relations.ts';

export const viewNames: Record<ViewType, string> = {
  table: '表格',
  board: '看板',
  gallery: '画廊',
  list: '列表',
  calendar: '日历',
  plan: '计划',
  timeline: '时间线',
  chart: '图表',
  feed: '动态',
  form: '表单',
};
export const subItemDisplay = (view: DatabaseView) =>
  view.subItemDisplay ||
  (['table', 'list', 'timeline'].includes(view.type)
    ? 'nested'
    : ['board', 'gallery', 'calendar'].includes(view.type)
      ? 'card'
      : 'flat');
export const emptyFilters = (): FilterGroup => ({ id: crypto.randomUUID(), conjunction: 'and', rules: [] });
export function removeViewProperty(view: DatabaseView, id: string): DatabaseView {
  const filter = (group: FilterGroup): FilterGroup => ({
    ...group,
    rules: group.rules
      .filter((rule) => 'rules' in rule || rule.property !== id)
      .map((rule) => ('rules' in rule ? filter(rule) : rule)),
  });
  const withoutKey = <T>(object: Record<string, T> | undefined) =>
    object ? Object.fromEntries(Object.entries(object).filter(([key]) => key !== id)) : undefined;
  return {
    ...view,
    filters: view.filters ? filter(view.filters) : undefined,
    sorts: view.sorts?.filter((sort) => sort.property !== id),
    groupBy: view.groupBy === id ? undefined : view.groupBy,
    subGroupBy: view.subGroupBy === id ? undefined : view.subGroupBy,
    calendarBy: view.calendarBy === id ? undefined : view.calendarBy,
    timelineEnd: view.timelineEnd === id ? '' : view.timelineEnd,
    planDoneBy: view.planDoneBy === id ? undefined : view.planDoneBy,
    chartGroup: view.chartGroup === id ? undefined : view.chartGroup,
    chartValue: view.chartValue === id ? undefined : view.chartValue,
    hiddenProperties: view.hiddenProperties?.filter((key) => key !== id),
    propertyOrder: view.propertyOrder?.filter((key) => key !== id),
    columnWidths: withoutKey(view.columnWidths),
    calculations: withoutKey(view.calculations),
    formRequired: view.formRequired?.filter((key) => key !== id),
  };
}
export function newView(type: ViewType, name = viewNames[type]): DatabaseView {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    filters: emptyFilters(),
    sorts: [],
    hiddenProperties: [],
    openPagesIn: type === 'gallery' || type === 'calendar' ? 'center' : 'side',
  };
}

// Old workspaces keep their active layout and query when first adopting saved views.
export function getViews(database: Database): DatabaseView[] {
  if (database.views?.length) return database.views;
  return (
    ['table', 'board', 'timeline', 'calendar', 'gallery', 'list', 'chart', 'feed', 'form'] as ViewType[]
  ).map((type) => ({
    id: `legacy-${type}`,
    name: viewNames[type],
    type,
    calendarBy: database.calendarBy,
    groupBy:
      type === 'board'
        ? database.groupBy || database.columns.find((c) => isSelectProperty(c))?.id
        : undefined,
    filters:
      database.view === type && database.filter?.value
        ? {
            id: 'legacy-filter-group',
            conjunction: 'and',
            rules: [
              {
                id: 'legacy-filter',
                property: database.filter.field,
                operator: 'contains',
                value: database.filter.value,
              },
            ],
          }
        : undefined,
    sorts:
      database.view === type && database.sort
        ? [{ id: 'legacy-sort', property: database.sort.field, direction: database.sort.direction }]
        : [],
    openPagesIn: 'side',
  }));
}

export function activeView(database: Database): DatabaseView {
  const views = getViews(database);
  return (
    views.find((v) => v.id === database.activeViewId) ||
    views.find((v) => v.type === database.view) ||
    views[0]
  );
}

export function updateView(database: Database, id: string, changes: Partial<DatabaseView>): Database {
  const views = getViews(database).map((view) => (view.id === id ? { ...view, ...changes, id } : view));
  const selected =
    views.find((view) => view.id === (database.activeViewId || activeView(database).id)) || views[0];
  return { ...database, views, activeViewId: selected.id, view: selected.type };
}

export function selectView(database: Database, id: string): Database {
  const views = getViews(database);
  const view = views.find((v) => v.id === id);
  return view ? { ...database, views, activeViewId: id, view: view.type } : database;
}

export function columnValue(page: Page, property: string, database: Database, pages: Page[]) {
  if (property === 'title') return page.title;
  if (property === 'createdAt') return page.createdAt;
  if (property === 'updatedAt') return page.updatedAt;
  const column = database.columns.find((c) => c.id === property);
  if (column?.type === 'checkbox') return !!page.values[property];
  return column ? readProperty(page, column, pages) : '';
}

const isEmpty = (value: unknown) =>
  value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0);
export function matchesRule(row: Page, rule: FilterRule, database: Database, pages: Page[]): boolean {
  const column = database.columns.find((c) => c.id === rule.property);
  const raw =
    column?.type === 'relation'
      ? relationIds(row, column, pages)
      : column?.type === 'person'
        ? ((row.values[column.id] || []) as PersonValue[]).flatMap((person) => [
            person.id,
            person.name,
            person.email,
          ])
        : columnValue(row, rule.property, database, pages);
  const scalar = (
    column && isDateProperty(column)
      ? dateWall(propertyDateValue(row, column)).slice(0, 10)
      : String(raw ?? '')
  ).toLocaleLowerCase();
  const expected = rule.value.toLocaleLowerCase();
  if (column && isDateProperty(column) && expected.includes('t')) {
    const actualTime = dateEpoch(propertyDateValue(row, column)),
      expectedTime = dateEpoch(rule.value);
    if (!Number.isFinite(actualTime) || !Number.isFinite(expectedTime)) return rule.operator === 'is_not';
    if (rule.operator === 'is') return actualTime === expectedTime;
    if (rule.operator === 'is_not') return actualTime !== expectedTime;
    if (['before', 'lt'].includes(rule.operator)) return actualTime < expectedTime;
    if (['after', 'gt'].includes(rule.operator)) return actualTime > expectedTime;
    if (['on_or_before', 'lte'].includes(rule.operator)) return actualTime <= expectedTime;
    if (['on_or_after', 'gte'].includes(rule.operator)) return actualTime >= expectedTime;
  }
  const values = Array.isArray(raw) ? raw.map((value) => String(value).toLocaleLowerCase()) : null;
  const equal = values ? values.includes(expected) : scalar === expected;
  const contains = values ? values.includes(expected) : scalar.includes(expected);
  switch (rule.operator) {
    case 'empty':
      return isEmpty(raw);
    case 'not_empty':
      return !isEmpty(raw);
    case 'is':
      return equal;
    case 'is_not':
      return !equal;
    case 'contains':
      return contains;
    case 'not_contains':
      return !contains;
    case 'starts_with':
      return scalar.startsWith(expected);
    case 'ends_with':
      return scalar.endsWith(expected);
    case 'gt':
      return !isEmpty(raw) && Number(raw) > Number(expected);
    case 'gte':
      return !isEmpty(raw) && Number(raw) >= Number(expected);
    case 'lt':
      return !isEmpty(raw) && Number(raw) < Number(expected);
    case 'lte':
      return !isEmpty(raw) && Number(raw) <= Number(expected);
    case 'before':
      return !!scalar && scalar.slice(0, 10) < expected;
    case 'after':
      return !!scalar && scalar.slice(0, 10) > expected;
    case 'on_or_before':
      return !!scalar && scalar.slice(0, 10) <= expected;
    case 'on_or_after':
      return !!scalar && scalar.slice(0, 10) >= expected;
  }
}

export function matchesFilters(
  row: Page,
  group: FilterGroup | undefined,
  database: Database,
  pages: Page[],
): boolean {
  if (!group?.rules.length) return true;
  const matches = (rule: FilterGroup | FilterRule) =>
    'rules' in rule ? matchesFilters(row, rule, database, pages) : matchesRule(row, rule, database, pages);
  return group.conjunction === 'and' ? group.rules.every(matches) : group.rules.some(matches);
}

export function queryRows(page: Page, view: DatabaseView, pages: Page[], search = ''): Page[] {
  const database = page.database!;
  const needle = search.trim().toLocaleLowerCase();
  const rows = pages.filter(
    (row) =>
      row.parentId === page.id &&
      !row.trashedAt &&
      !row.templateFor &&
      (!isTemplatePage(row, pages) || isTemplatePage(page, pages)) &&
      (!database.subItems ||
        ((view.subItemFilter !== 'parents' || !row.subItemOf) &&
          (view.subItemFilter !== 'children' || !!row.subItemOf) &&
          (subItemDisplay(view) !== 'card' || !row.subItemOf))) &&
      matchesFilters(row, view.filters, database, pages) &&
      (!needle ||
        `${row.title} ${database.columns.map((c) => columnValue(row, c.id, database, pages)).join(' ')}`
          .toLocaleLowerCase()
          .includes(needle)),
  );
  return rows.sort((a, b) => {
    for (const sort of view.sorts || []) {
      const av = columnValue(a, sort.property, database, pages);
      const bv = columnValue(b, sort.property, database, pages);
      const column = database.columns.find((c) => c.id === sort.property);
      let result = 0;
      if (isEmpty(av) || isEmpty(bv)) result = Number(isEmpty(av)) - Number(isEmpty(bv));
      else if (column?.type === 'date')
        result = dateEpoch(a.values[column.id]) - dateEpoch(b.values[column.id]);
      else if (column?.options && isSelectProperty(column))
        result = column.options.indexOf(String(av)) - column.options.indexOf(String(bv));
      else if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else if (typeof av === 'boolean' && typeof bv === 'boolean') result = Number(av) - Number(bv);
      else result = String(av).localeCompare(String(bv), 'zh-CN', { numeric: true });
      if (result) return sort.direction === 'asc' ? result : -result;
    }
    return 0;
  });
}

export type RowGroup = { key: string; label: string; rows: Page[] };
export function groupRows(
  rows: Page[],
  property: string | undefined,
  database: Database,
  pages: Page[],
  view?: DatabaseView,
): RowGroup[] {
  if (!property) return [{ key: '__all', label: '', rows }];
  const column = database.columns.find((c) => c.id === property);
  const people = new Map(
    rows.flatMap((row) =>
      column?.type === 'person'
        ? ((row.values[column.id] || []) as PersonValue[]).map((person) => [person.id, person.name] as const)
        : [],
    ),
  );
  const groups = new Map<string, Page[]>();
  for (const option of column?.options || []) groups.set(option, []);
  groups.set('', []);
  for (const row of rows) {
    const raw =
      column?.type === 'relation'
        ? relationIds(row, column, pages)
        : column?.type === 'person'
          ? ((row.values[column.id] || []) as PersonValue[]).map((person) => person.id)
          : columnValue(row, property, database, pages);
    const groupedValue =
      column && isDateProperty(column) ? dateWall(propertyDateValue(row, column)).slice(0, 10) : raw;
    const keys = Array.isArray(groupedValue)
      ? groupedValue.length
        ? groupedValue.map(String)
        : ['']
      : [
          isEmpty(groupedValue)
            ? ''
            : typeof groupedValue === 'boolean'
              ? groupedValue
                ? '已勾选'
                : '未勾选'
              : String(groupedValue),
        ];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
  }
  const order = view?.groupOrder || [...groups.keys()];
  return [...groups]
    .filter(([key, rows]) => !view?.hiddenGroups?.includes(key) && (!view?.hideEmptyGroups || rows.length))
    .map(([key, rows]) => ({
      key,
      label: key
        ? column?.type === 'relation'
          ? pages.find((p) => p.id === key)?.title || '无标题'
          : column?.type === 'person'
            ? people.get(key) || '未知人员'
            : key
        : '无 ' + (column?.name || '分组'),
      rows,
    }))
    .sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    });
}

export function valueForGroup(
  column: Property | undefined,
  key: string,
  previous?: Page['values'][string],
  from = '',
): Page['values'][string] {
  if (column?.type === 'checkbox') return key === '已勾选';
  if (column?.type === 'number') return key === '' ? '' : Number(key);
  if (column?.type === 'person')
    return [
      ...(Array.isArray(previous)
        ? (previous as PersonValue[]).filter((person) => person.id !== from && person.id !== key)
        : []),
      ...(key ? [key] : []),
    ] as PersonValue[];
  if (column?.type === 'multiSelect' || column?.type === 'relation')
    return [
      ...new Set([
        ...(Array.isArray(previous)
          ? previous.filter((v): v is string => typeof v === 'string' && v !== from)
          : []),
        ...(key ? [key] : []),
      ]),
    ];
  return key;
}

export function visibleColumns(database: Database, view: DatabaseView): Property[] {
  const order = view.propertyOrder || database.columns.map((c) => c.id);
  return database.columns
    .filter((c) => !view.hiddenProperties?.includes(c.id))
    .sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    });
}

export function aggregateRows(
  rows: Page[],
  property: string,
  operation: Aggregate,
  database: Database,
  pages: Page[],
): number {
  const values = rows.map((row) => columnValue(row, property, database, pages));
  const filled = values.filter((value) => !isEmpty(value));
  if (operation === 'count') return rows.length;
  if (operation === 'count_values') return filled.length;
  if (operation === 'count_unique') return new Set(filled.flat().map(String)).size;
  if (operation === 'empty') return rows.length - filled.length;
  if (operation === 'percent_filled')
    return rows.length ? Math.round((filled.length / rows.length) * 100) : 0;
  const numbers = filled.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (!numbers.length) return 0;
  if (operation === 'min') return Math.min(...numbers);
  if (operation === 'max') return Math.max(...numbers);
  const sum = numbers.reduce((a, b) => a + b, 0);
  return operation === 'average' ? Math.round((sum / numbers.length) * 100) / 100 : sum;
}
