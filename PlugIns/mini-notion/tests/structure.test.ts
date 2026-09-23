import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../src/seed.ts';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { validateRelationships, relationIds } from '../src/database/relations.ts';
import { hierarchyRows } from '../src/database/structure.ts';
import { queryRows, activeView } from '../src/database/model.ts';
import { applyDependencyShifts } from '../src/database/dependencies.ts';
import { readProperty } from '../src/model.ts';
import type { Workspace } from '../src/types.ts';

function fixture() {
  let state: Workspace = { ...createWorkspace(), pages: [], activePageId: null };
  const call = (method: string, params: Record<string, any> = {}) => {
    const operation = executeWorkspaceCommand(state, method, params);
    if (operation.changed && operation.workspace) {
      validateRelationships(operation.workspace);
      state = applyDependencyShifts(state, operation.workspace);
    }
    return operation.result?.id && operation.result?.blocks
      ? state.pages.find((page) => page.id === operation.result.id)!
      : operation.result;
  };
  return {
    call,
    get state() {
      return state;
    },
  };
}
test('sub-items nest, collapse and expose live parent/children relations to formulas and rollups', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', { columns: [{ id: 'points', name: '分数', type: 'number' }] });
  const parent = call('record.create', { databaseId: db.id, title: '项目' });
  const child = call('subitem.create', { pageId: parent.id, title: '需求', values: { points: 3 } });
  const grandchild = call('subitem.create', { pageId: child.id, title: '评审', values: { points: 2 } });
  call('subitem.create', { pageId: parent.id, title: '交付', values: { points: 5 } });
  const database = call('page.get', { pageId: db.id });
  const view = activeView(database.database);
  const rows = queryRows(database, view, f.state.pages);
  assert.deepEqual(
    hierarchyRows(rows, view).map((entry) => entry.depth),
    [0, 1, 2, 1],
  );
  assert.equal(hierarchyRows(rows, { ...view, collapsedItems: [parent.id] }).length, 1);
  const parentProperty = database.database.columns.find((column: any) => column.system === 'parentItem');
  const childrenProperty = database.database.columns.find((column: any) => column.system === 'subItems');
  assert.deepEqual(relationIds(call('page.get', { pageId: child.id }), parentProperty, f.state.pages), [
    parent.id,
  ]);
  assert.deepEqual(readProperty(parent, childrenProperty, f.state.pages), ['需求', '交付']);
  assert.equal(
    call('formula.evaluate', {
      pageId: parent.id,
      expression: 'prop("子项目").map(current.prop("分数")).sum()',
    }),
    8,
  );
  const rollup = call('property.add', {
    databaseId: db.id,
    definition: {
      name: '子项目总分',
      type: 'rollup',
      relationProperty: childrenProperty.id,
      targetProperty: 'points',
      calculation: 'sum',
    },
  });
  assert.equal(readProperty(parent, rollup, f.state.pages), 8);
  assert.deepEqual(
    call('subitem.children', { pageId: parent.id, recursive: true })
      .map((row: any) => row.id)
      .sort(),
    [child.id, grandchild.id, rows.find((row) => row.title === '交付')!.id].sort(),
  );
  call('record.update', { pageId: grandchild.id, values: { [parentProperty.id]: [parent.id] } });
  assert.equal(call('page.get', { pageId: grandchild.id }).subItemOf, parent.id);
  const before = structuredClone(f.state);
  assert.throws(() => call('subitem.set', { pageId: parent.id, parentId: grandchild.id }), /循环/);
  assert.deepEqual(f.state, before);
});

test('moving, duplicating and deleting parent records preserves sub-item structure and removes invalid dependency edges', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create'),
    target = call('database.create');
  const parent = call('record.create', { databaseId: db.id, title: '主项目' });
  const child = call('subitem.create', { pageId: parent.id, title: '子项目' });
  const grandchild = call('subitem.create', { pageId: child.id, title: '孙项目' });
  const outside = call('record.create', { databaseId: db.id, title: '其他任务' });
  call('dependency.add', { pageId: grandchild.id, predecessorId: parent.id });
  call('dependency.add', { pageId: outside.id, predecessorId: grandchild.id });
  const duplicate = call('page.duplicate', { pageId: parent.id });
  const children = call('subitem.children', { pageId: duplicate.id, recursive: true });
  assert.equal(children.length, 2);
  assert.deepEqual(children.find((page: any) => page.title === '孙项目').blockedBy, [duplicate.id]);
  call('page.move', { pageId: parent.id, parentId: target.id });
  assert.equal(call('page.get', { pageId: child.id }).parentId, target.id);
  assert.equal(call('page.get', { pageId: grandchild.id }).subItemOf, child.id);
  assert.equal(call('page.get', { pageId: target.id }).database.subItems, true);
  assert.deepEqual(call('page.get', { pageId: outside.id }).blockedBy, []);
  call('page.trash', { pageId: parent.id });
  assert.ok(call('page.get', { pageId: grandchild.id }).trashedAt);
  call('page.restore', { pageId: child.id });
  assert.equal(call('page.get', { pageId: child.id }).subItemOf, null);
  assert.equal(call('page.get', { pageId: child.id }).parentId, target.id);
  assert.equal(call('page.get', { pageId: grandchild.id }).trashedAt, null);
  call('page.purge', { pageId: parent.id, confirm: true });
  assert.deepEqual(call('page.get', { pageId: grandchild.id }).blockedBy, []);
});

test('dependency date shifting propagates through a chain and preserves manually changed batch dates', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', {
    columns: [
      { id: 'start', name: '开始', type: 'date' },
      { id: 'end', name: '结束', type: 'date' },
    ],
  });
  const a = call('record.create', {
    databaseId: db.id,
    title: 'A',
    values: { start: '2026-09-07', end: '2026-09-08' },
  });
  const b = call('record.create', {
    databaseId: db.id,
    title: 'B',
    values: { start: '2026-09-09', end: '2026-09-10' },
  });
  const c = call('record.create', {
    databaseId: db.id,
    title: 'C',
    values: { start: '2026-09-11', end: '2026-09-11' },
  });
  call('dependency.add', { pageId: b.id, predecessorId: a.id });
  call('dependency.add', { pageId: c.id, predecessorId: b.id });
  call('database.configure', {
    databaseId: db.id,
    dependencies: { enabled: true, dateProperty: 'start', endProperty: 'end', shift: 'maintain' },
  });
  call('record.update', { pageId: a.id, values: { start: '2026-09-10', end: '2026-09-11' } });
  assert.deepEqual(call('page.get', { pageId: b.id }).values, { start: '2026-09-12', end: '2026-09-13' });
  assert.equal(call('page.get', { pageId: c.id }).values.start, '2026-09-14');
  const before = structuredClone(f.state);
  assert.throws(() => call('dependency.add', { pageId: a.id, predecessorId: c.id }), /循环/);
  assert.deepEqual(f.state, before);
  let batch = executeWorkspaceCommand(f.state, 'record.update', {
    pageId: a.id,
    values: { start: '2026-09-11', end: '2026-09-12' },
  }).workspace!;
  batch = executeWorkspaceCommand(batch, 'record.update', {
    pageId: b.id,
    values: { start: '2026-09-15', end: '2026-09-16' },
  }).workspace!;
  const shifted = applyDependencyShifts(f.state, batch);
  assert.equal(shifted.pages.find((page) => page.id === b.id)!.values.start, '2026-09-15');
  assert.equal(shifted.pages.find((page) => page.id === c.id)!.values.start, '2026-09-17');
});

test('overlap mode, weekend avoidance, no-shift mode and locked successors follow configured rules', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', {
    columns: [
      { id: 'start', name: '开始', type: 'date' },
      { id: 'end', name: '结束', type: 'date' },
    ],
  });
  const a = call('record.create', {
    databaseId: db.id,
    title: '前置',
    values: { start: '2026-09-10', end: '2026-09-10' },
  });
  const b = call('record.create', {
    databaseId: db.id,
    title: '后续',
    values: { start: '2026-09-11', end: '2026-09-14' },
  });
  call('dependency.add', { pageId: b.id, predecessorId: a.id });
  call('database.configure', {
    databaseId: db.id,
    dependencies: {
      enabled: true,
      dateProperty: 'start',
      endProperty: 'end',
      shift: 'overlap',
      avoidWeekends: true,
    },
  });
  call('record.update', { pageId: a.id, values: { end: '2026-09-11' } });
  assert.deepEqual(call('page.get', { pageId: b.id }).values, { start: '2026-09-14', end: '2026-09-17' });
  call('page.update', { pageId: b.id, locked: true });
  const before = structuredClone(f.state);
  assert.throws(() => call('record.update', { pageId: a.id, values: { end: '2026-09-20' } }), /已锁定/);
  assert.deepEqual(f.state, before);
  call('database.configure', { databaseId: db.id, dependencies: { shift: 'none' } });
  call('record.update', { pageId: a.id, values: { end: '2026-09-20' } });
  assert.equal(call('page.get', { pageId: b.id }).values.start, '2026-09-14');
});
