import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../src/seed.ts';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { applyAutomations, normalizeActions, triggeredAutomations } from '../src/actions/engine.ts';
import type { Workspace } from '../src/types.ts';
function fixture() {
  let workspace: Workspace = { ...createWorkspace(), pages: [], activePageId: null };
  const call = (method: string, params: any = {}) => {
    const result = executeWorkspaceCommand(workspace, method, params);
    if (result.changed) workspace = result.workspace!;
    return result.result;
  };
  return {
    call,
    get workspace() {
      return workspace;
    },
    set workspace(value: Workspace) {
      workspace = value;
    },
  };
}
const columns = [
  { id: 'count', name: '次数', type: 'number' },
  { id: 'done', name: '完成', type: 'checkbox' },
  { id: 'tags', name: '标签', type: 'multiSelect', options: ['甲', '乙'] },
];
test('bulk actions preserve filters, handle relation additions and reject removed scope properties atomically', () => {
  const f = fixture(),
    call = f.call;
  const related = call('database.create', { title: '项目' });
  const project = call('record.create', { databaseId: related.id, title: '关联项目' });
  const db = call('database.create', {
    columns: [...columns, { id: 'project', name: '项目', type: 'relation', relationTo: related.id }],
  });
  const first = call('record.create', { databaseId: db.id, values: { done: false, tags: ['甲', '乙'] } });
  const second = call('record.create', { databaseId: db.id, values: { done: true, tags: ['甲'] } });
  const button = call('button.create', {
    pageId: db.id,
    actions: [
      {
        type: 'edit',
        databaseId: db.id,
        filters: {
          id: 'scope',
          conjunction: 'and',
          rules: [{ id: 'filter', property: 'done', operator: 'is', value: 'false' }],
        },
        values: { project: [project.id], tags: ['甲'] },
        operations: { project: 'add', tags: 'remove' },
      },
    ],
  });
  call('button.run', { pageId: db.id, blockId: button.blockId });
  assert.deepEqual(call('page.get', { pageId: first.id }).values.project, [project.id]);
  assert.deepEqual(call('page.get', { pageId: first.id }).values.tags, ['乙']);
  assert.equal(call('page.get', { pageId: second.id }).values.project, undefined);
  call('property.delete', { databaseId: db.id, propertyId: 'done' });
  const before = structuredClone(f.workspace);
  assert.throws(
    () => call('button.run', { pageId: db.id, blockId: button.blockId }),
    /第 1 步.*筛选属性.*已移除/,
  );
  assert.deepEqual(f.workspace, before);
  call('button.configure', {
    pageId: db.id,
    blockId: button.blockId,
    actions: [{ type: 'set', target: first.id, values: { project: [second.id] } }],
  });
  assert.throws(() => call('button.run', { pageId: db.id, blockId: button.blockId }), /关联数据库中的记录/);
});
test('deleting a trigger or view-filter property pauses the affected automation', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', { columns });
  const view = call('view.create', {
    databaseId: db.id,
    type: 'table',
    config: {
      filters: {
        id: 'scope',
        conjunction: 'and',
        rules: [{ id: 'condition', property: 'done', operator: 'is', value: 'true' }],
      },
    },
  });
  const rule = call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '限制范围',
      viewId: view.id,
      triggers: [{ type: 'property', propertyId: 'count' }],
      actions: [{ type: 'notify', text: '完成' }],
    },
  });
  call('property.delete', { databaseId: db.id, propertyId: 'done' });
  assert.equal(call('automation.get', { databaseId: db.id, automationId: rule.id }).enabled, false);
  call('automation.resume', { databaseId: db.id, automationId: rule.id });
  call('property.delete', { databaseId: db.id, propertyId: 'count' });
  assert.equal(call('automation.get', { databaseId: db.id, automationId: rule.id }).enabled, false);
  assert.throws(
    () => call('automation.resume', { databaseId: db.id, automationId: rule.id }),
    /触发属性不存在/,
  );
});
test('buttons share multi-step execution, formula variables, created-page references, rich blocks and confirmation', () => {
  const f = fixture(),
    call = f.call,
    db = call('database.create', { columns }),
    row = call('record.create', { databaseId: db.id, title: '起点', values: { count: 3, tags: ['甲'] } });
  const button = call('button.create', {
    pageId: row.id,
    label: '执行流程',
    confirmation: '确认创建后续任务',
    actions: [
      { type: 'variable', name: 'double', value: { formula: 'prop("次数") * 2' } },
      { type: 'set', values: { count: { formula: 'double' }, tags: ['乙'] }, operations: { tags: 'add' } },
      {
        type: 'create',
        databaseId: db.id,
        title: { formula: '"后续 " + trigger.prop("名称")' },
        values: { count: 1 },
      },
      { type: 'set', target: 'created', values: { count: { formula: 'prop("次数") + double' } } },
      {
        type: 'insert',
        blocks: [
          { type: 'heading', props: { level: 2 }, content: '执行记录' },
          { type: 'checkListItem', content: '继续处理' },
        ],
        position: 'afterButton',
      },
      { type: 'notify', text: { formula: '"已处理 " + trigger.prop("名称")' } },
      { type: 'open', target: 'created', mode: 'side' },
    ],
  });
  const before = structuredClone(f.workspace);
  const preview = call('button.preview', { pageId: row.id, blockId: button.blockId });
  assert.deepEqual(f.workspace, before);
  assert.equal(preview.steps.length, 7);
  assert.equal(preview.effects[0].mode, 'side');
  assert.throws(() => call('button.run', { pageId: row.id, blockId: button.blockId }), /确认/);
  assert.deepEqual(f.workspace, before);
  const run = call('button.run', { pageId: row.id, blockId: button.blockId, confirm: true });
  assert.equal(call('page.get', { pageId: row.id }).values.count, 6);
  assert.deepEqual(call('page.get', { pageId: row.id }).values.tags, ['甲', '乙']);
  const child = call('page.get', { pageId: run.effects[0].pageId });
  assert.equal(child.title, '后续 起点');
  assert.equal(child.values.count, 7);
  assert.equal(f.workspace.inbox![0].text, '已处理 起点');
  assert.equal(f.workspace.actionRuns![0].status, 'success');
});
test('action failure leaves all note data unchanged and copied button targets follow copied databases', () => {
  const f = fixture(),
    call = f.call,
    db = call('database.create', { columns }),
    row = call('record.create', { databaseId: db.id, title: '原始', values: { count: 1 } });
  const button = call('button.create', {
    pageId: db.id,
    property: true,
    label: '动作',
    actions: [
      { type: 'set', title: '不可留下' },
      { type: 'set', values: { missing: 1 } },
    ],
  });
  const before = structuredClone(f.workspace);
  assert.throws(() => call('button.run', { pageId: row.id, propertyId: button.propertyId }), /没有属性/);
  assert.deepEqual(f.workspace, before);
  call('button.configure', {
    pageId: db.id,
    propertyId: button.propertyId,
    actions: [{ type: 'create', databaseId: db.id, title: '内部新页面' }],
  });
  const automation = call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '规则',
      triggers: [{ type: 'created' }],
      actions: [{ type: 'set', values: { done: true } }],
    },
  });
  const copy = call('page.duplicate', { pageId: db.id });
  const copied = copy.database.columns.find((column: any) => column.id === button.propertyId);
  assert.equal(copied.button.actions[0].databaseId, copy.id);
  assert.equal(copy.database.automations[0].enabled, false);
  assert.notEqual(copy.database.automations[0].id, automation.id);
});
test('automation all-triggers combine nearby edits once and automatic changes do not cascade', () => {
  const f = fixture(),
    call = f.call,
    db = call('database.create', { columns }),
    row = call('record.create', { databaseId: db.id, values: { count: 0, done: false } });
  call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '组合触发',
      triggerMode: 'all',
      triggers: [
        { id: 'a', type: 'property', propertyId: 'count' },
        { id: 'b', type: 'property', propertyId: 'done' },
      ],
      actions: [{ type: 'set', values: { tags: ['甲'] } }],
    },
  });
  call('automation.create', {
    databaseId: db.id,
    rule: {
      name: '不能连锁',
      triggers: [{ id: 'c', type: 'property', propertyId: 'tags' }],
      actions: [{ type: 'set', title: '不应触发' }],
    },
  });
  let before = f.workspace;
  call('record.update', { pageId: row.id, values: { count: 1 } });
  let execution = applyAutomations(before, f.workspace, executeWorkspaceCommand, 1000);
  assert.equal(execution.workspace.actionRuns?.length || 0, 0);
  f.workspace = execution.workspace;
  before = f.workspace;
  call('record.update', { pageId: row.id, values: { done: true } });
  execution = applyAutomations(
    before,
    f.workspace,
    executeWorkspaceCommand,
    2000,
    (_, after) => after,
    execution.signals,
  );
  f.workspace = execution.workspace;
  assert.deepEqual(call('page.get', { pageId: row.id }).values.tags, ['甲']);
  assert.equal(call('page.get', { pageId: row.id }).title, '');
  assert.equal(f.workspace.actionRuns!.length, 1);
  const expired = applyAutomations(
    before,
    {
      ...before,
      pages: before.pages.map((page) =>
        page.id === row.id ? { ...page, values: { ...page.values, done: true } } : page,
      ),
    },
    executeWorkspaceCommand,
    6001,
    (_, after) => after,
    { unused: { a: 1000 } },
  );
  assert.equal(expired.workspace.actionRuns?.length || 0, 0);
});

test('property triggers observe system relations including the inverse parent relation', () => {
  const f = fixture(),
    call = f.call;
  const db = call('database.create', { columns });
  const parent = call('record.create', { databaseId: db.id, title: '父项目' });
  const child = call('subitem.create', { pageId: parent.id, title: '子项目' });
  const database = call('database.get', { databaseId: db.id });
  const parents = database.columns.find((column: any) => column.system === 'parentItem');
  const children = database.columns.find((column: any) => column.system === 'subItems');
  for (const column of [parents, children])
    call('automation.create', {
      databaseId: db.id,
      rule: {
        name: column.name,
        triggers: [{ type: 'property', propertyId: column.id }],
        actions: [{ type: 'notify', text: column.name }],
      },
    });
  const before = f.workspace;
  call('subitem.set', { pageId: child.id, parentId: null });
  assert.deepEqual(
    new Set(triggeredAutomations(before, f.workspace).jobs.map((job) => job.page.id)),
    new Set([parent.id, child.id]),
  );
});
