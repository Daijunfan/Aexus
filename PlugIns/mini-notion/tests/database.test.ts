import test from 'node:test';
import assert from 'node:assert/strict';
import { makePage } from '../src/model.ts';
import {
  activeView,
  aggregateRows,
  getViews,
  groupRows,
  matchesFilters,
  newView,
  queryRows,
  selectView,
  updateView,
  valueForGroup,
  visibleColumns,
} from '../src/database/model.ts';
import type { Database, FilterGroup } from '../src/types.ts';

const db: Database = {
  view: 'table',
  columns: [
    { id: 'status', name: '状态', type: 'select', options: ['未开始', '进行中', '完成'] },
    { id: 'amount', name: '金额', type: 'number' },
    { id: 'date', name: '日期', type: 'date' },
    { id: 'done', name: '完成', type: 'checkbox' },
  ],
};
const root = makePage({ id: 'db', database: db });
const rows = [
  makePage({
    id: 'a',
    parentId: 'db',
    title: '甲',
    values: { status: '完成', amount: 20, date: '2026-09-12', done: true },
  }),
  makePage({
    id: 'b',
    parentId: 'db',
    title: '乙',
    values: { status: '进行中', amount: 8, date: '2026-09-05' },
  }),
  makePage({
    id: 'c',
    parentId: 'db',
    title: '丙',
    values: { status: '进行中', amount: 100, date: '2026-10-01' },
  }),
];
test('legacy workspaces migrate without applying one view filter to every view', () => {
  const legacy = {
    ...db,
    filter: { field: 'title', value: '甲' },
    sort: { field: 'amount', direction: 'desc' as const },
  };
  assert.equal(getViews(legacy).length, 9);
  assert.equal(activeView(legacy).filters?.rules.length, 1);
  assert.equal(getViews(legacy).find((v) => v.type === 'board')?.filters, undefined);
  const changed = updateView(legacy, 'legacy-board', { name: '按状态', groupBy: 'status' });
  const switched = selectView(changed, 'legacy-board');
  assert.equal(activeView(switched).name, '按状态');
  assert.equal(activeView(switched).sorts?.length, 0);
  assert.equal(activeView(selectView(switched, 'legacy-table')).filters?.rules.length, 1);
});
test('multiple views of the same type retain independent configurations', () => {
  const all = newView('table', '全部');
  const mine = newView('table', '进行中');
  const database = { ...db, views: [all, mine], activeViewId: all.id };
  const changed = updateView(database, mine.id, {
    hiddenProperties: ['amount'],
    sorts: [{ id: 's', property: 'date', direction: 'desc' }],
  });
  assert.deepEqual(activeView(changed).hiddenProperties, []);
  assert.deepEqual(activeView(selectView(changed, mine.id)).hiddenProperties, ['amount']);
  assert.equal(activeView(selectView(changed, mine.id)).sorts?.[0].property, 'date');
});
test('nested AND/OR filters combine numeric, date, checkbox and text predicates', () => {
  const filters: FilterGroup = {
    id: 'f',
    conjunction: 'and',
    rules: [
      { id: 'amount', property: 'amount', operator: 'gt', value: '10' },
      {
        id: 'any',
        conjunction: 'or',
        rules: [
          { id: 'done', property: 'done', operator: 'is', value: 'true' },
          { id: 'date', property: 'date', operator: 'before', value: '2026-09-10' },
        ],
      },
    ],
  };
  assert.deepEqual(
    rows.filter((row) => matchesFilters(row, filters, db, rows)).map((row) => row.id),
    ['a'],
  );
  assert.equal(
    matchesFilters(
      rows[1],
      {
        id: 'x',
        conjunction: 'and',
        rules: [{ id: 'rule', property: 'done', operator: 'is', value: 'false' }],
      },
      db,
      rows,
    ),
    true,
  );
});
test('sort priorities use option order and numeric comparison', () => {
  const view = {
    ...newView('table'),
    sorts: [
      { id: 'one', property: 'status', direction: 'asc' as const },
      { id: 'two', property: 'amount', direction: 'desc' as const },
    ],
  };
  assert.deepEqual(
    queryRows(root, view, rows).map((row) => row.id),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    queryRows(root, view, rows, '甲').map((row) => row.id),
    ['a'],
  );
});
test('group visibility and property ordering do not delete underlying data', () => {
  const view = {
    ...newView('board'),
    groupBy: 'status',
    hideEmptyGroups: true,
    hiddenGroups: ['完成'],
    hiddenProperties: ['amount'],
    propertyOrder: ['date', 'status', 'done', 'amount'],
  };
  assert.deepEqual(
    groupRows(rows, 'status', db, rows, view).map((g) => [g.key, g.rows.length]),
    [['进行中', 2]],
  );
  assert.deepEqual(
    visibleColumns(db, view).map((c) => c.id),
    ['date', 'status', 'done'],
  );
  assert.equal(rows[0].values.amount, 20);
});
test('aggregates use the actual filtered record set', () => {
  assert.equal(aggregateRows(rows, 'amount', 'sum', db, rows), 128);
  assert.equal(aggregateRows(rows.slice(0, 2), 'amount', 'average', db, rows), 14);
  assert.equal(aggregateRows(rows, 'status', 'count_unique', db, rows), 2);
  assert.equal(aggregateRows(rows, 'date', 'percent_filled', db, rows), 100);
});
test('group moves preserve property types and other multi-select memberships', () => {
  assert.equal(valueForGroup(db.columns[1], '10'), 10);
  assert.equal(valueForGroup(db.columns[3], '未勾选'), false);
  assert.deepEqual(valueForGroup({ id: 'tags', name: '标签', type: 'multiSelect' }, 'C', ['A', 'B'], 'A'), [
    'B',
    'C',
  ]);
});
