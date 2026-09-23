import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { createWorkspace } from '../src/seed.ts';
import { computeProperty, readProperty } from '../src/database/propertiesModel.ts';
import { planProjection } from '../src/database/dates.ts';
import { finalizeProperties } from '../src/database/propertyData.ts';
import { diffWorkspace } from '../src/core/patch.ts';
import type { Workspace } from '../src/types.ts';
function fixture() {
  let workspace: Workspace = { ...createWorkspace(), pages: [], activePageId: null };
  return {
    get workspace() {
      return workspace;
    },
    set workspace(value: Workspace) {
      workspace = value;
    },
    call(method: string, params: any = {}) {
      const result = executeWorkspaceCommand(workspace, method, params);
      if (result.changed) workspace = result.workspace!;
      return result.result;
    },
  };
}
test('status groups preserve custom completed states, defaults, renamed values and planner completion', () => {
  const f = fixture(),
    db = f.call('database.create', {
      columns: [
        {
          id: 'status',
          name: '状态',
          type: 'status',
          statusGroups: { todo: ['排队'], doing: ['制作', '审核'], done: ['已交付', '已取消'] },
          defaultStatus: '排队',
        },
        { id: 'date', name: '日期', type: 'date' },
      ],
    });
  const a = f.call('record.create', { databaseId: db.id, title: '甲' }),
    b = f.call('record.create', { databaseId: db.id, title: '乙', values: { status: '已取消' } });
  assert.equal(a.values.status, '排队');
  assert.equal(planProjection(db, { id: 'plan', name: '计划', type: 'plan' }, [a, b]).completed, 1);
  const options = f.call('property.update', {
    databaseId: db.id,
    propertyId: 'status',
    changes: {
      statusGroups: { todo: ['待办'], doing: ['制作', '审核'], done: ['已交付', '已取消'] },
      defaultStatus: '待办',
    },
    optionRenames: { 排队: '待办' },
  });
  assert.deepEqual(options.options, ['待办', '制作', '审核', '已交付', '已取消']);
  assert.equal(f.call('page.get', { pageId: a.id }).values.status, '待办');
  assert.throws(() => f.call('record.update', { pageId: a.id, values: { status: '无效状态' } }), /没有状态/);
});
test('unique IDs include deleted rows, stay reserved across undo and reject manual values', () => {
  const f = fixture(),
    db = f.call('database.create', { columns: [] }),
    first = f.call('record.create', { databaseId: db.id });
  f.call('page.trash', { pageId: first.id });
  const id = f.call('property.add', {
    databaseId: db.id,
    type: 'uniqueId',
    name: '编号',
    definition: { id: 'uid', idPrefix: 'TASK' },
  });
  assert.equal(readProperty(f.call('page.get', { pageId: first.id }), id, f.workspace.pages), 'TASK-1');
  const before = f.workspace,
    second = f.call('record.create', { databaseId: db.id });
  assert.equal(second.uniqueId.number, 2);
  f.workspace = finalizeProperties(
    f.workspace,
    { ...before, uniqueIds: f.workspace.uniqueIds },
    'history.undo',
  );
  const third = f.call('record.create', { databaseId: db.id });
  assert.equal(third.uniqueId.number, 3);
  f.call('page.purge', { pageId: first.id, confirm: true });
  const fourth = f.call('record.create', { databaseId: db.id });
  assert.equal(fourth.uniqueId.number, 4);
  assert.throws(() => f.call('record.update', { pageId: fourth.id, values: { uid: 900 } }), /系统自动填写/);
});
test('concurrent optimistic creates receive distinct IDs from the writer ledger', () => {
  const f = fixture(),
    db = f.call('database.create', { columns: [{ id: 'uid', name: '编号', type: 'uniqueId' }] }),
    base = f.workspace;
  const local = executeWorkspaceCommand(base, 'record.create', {
    databaseId: db.id,
    title: 'GUI',
  }).workspace!;
  const remote = f.call('record.create', { databaseId: db.id, title: 'CLI' });
  f.call('workspace.patch', { patch: diffWorkspace(base, local) });
  const rows = f.workspace.pages.filter((page) => page.parentId === db.id);
  assert.equal(rows.find((page) => page.id === remote.id)!.uniqueId!.number, 1);
  assert.equal(rows.find((page) => page.title === 'GUI')!.uniqueId!.number, 2);
});
test('people and files retain structured values, formula semantics, renamed references and immutable authors', () => {
  const f = fixture(),
    person = f.call('person.create', { name: '小林', email: 'lin@example.test' }),
    db = f.call('database.create', {
      columns: [
        { id: 'owner', name: '负责人', type: 'person' },
        { id: 'files', name: '附件', type: 'files' },
        { id: 'creator', name: '创建者', type: 'createdBy' },
        { id: 'created', name: '创建时间', type: 'createdTime' },
        {
          id: 'formula',
          name: '邮件',
          type: 'formula',
          formula: 'prop("负责人").map(current.email()).join(",")',
        },
      ],
    });
  const row = f.call('record.create', {
    databaseId: db.id,
    values: { owner: [person.id], files: [{ name: '计划.pdf', url: 'https://example.test/plan.pdf' }] },
  });
  assert.equal(row.values.owner[0].name, '小林');
  assert.ok(row.values.files[0].id);
  assert.equal(row.createdBy.name, '我');
  assert.equal(
    readProperty(
      row,
      db.database.columns.find((column: any) => column.id === 'formula'),
      f.workspace.pages,
    ),
    'lin@example.test',
  );
  assert.ok(
    (
      computeProperty(
        row,
        db.database.columns.find((column: any) => column.id === 'created'),
        f.workspace.pages,
      ) as any
    ).value instanceof Date,
  );
  f.call('person.update', { id: person.id, name: '林老师' });
  assert.equal(f.call('page.get', { pageId: row.id }).values.owner[0].name, '林老师');
  f.call('person.delete', { id: person.id });
  assert.equal(f.call('page.get', { pageId: row.id }).values.owner[0].name, '林老师');
  assert.throws(
    () => f.call('record.update', { pageId: row.id, values: { creator: person.name } }),
    /系统自动填写/,
  );
  assert.throws(() => f.call('page.update', { pageId: row.id, changes: { createdAt: 0 } }), /系统管理/);
});

test('renaming status options keeps saved views and button actions aligned', () => {
  const f = fixture(),
    db = f.call('database.create'),
    row = f.call('record.create', { databaseId: db.id });
  const button = f.call('button.create', {
    pageId: db.id,
    property: true,
    actions: [{ type: 'set', values: { status: '已完成' } }],
  });
  const view = f.call('view.create', {
    databaseId: db.id,
    type: 'table',
    config: {
      filters: {
        id: 'scope',
        conjunction: 'and',
        rules: [{ id: 'rule', property: 'status', operator: 'is', value: '已完成' }],
      },
    },
  });
  f.call('property.update', {
    databaseId: db.id,
    propertyId: 'status',
    changes: { statusGroups: { todo: ['未开始'], doing: ['进行中'], done: ['已交付'] } },
    optionRenames: { 已完成: '已交付' },
  });
  f.call('button.run', { pageId: row.id, propertyId: button.propertyId });
  assert.equal(f.call('page.get', { pageId: row.id }).values.status, '已交付');
  assert.equal(f.call('view.render', { databaseId: db.id, viewId: view.id }).count, 1);
});
