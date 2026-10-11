import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { createWorkspace } from '../src/seed.ts';
import { plainText } from '../src/model.ts';
import { databaseCSV } from '../src/transfer.ts';

function workspace() {
  let state = { ...createWorkspace(), pages: [], activePageId: null };
  const call = (method: string, params: Record<string, any> = {}) => {
    const result = executeWorkspaceCommand(state, method, params);
    state = result.workspace as typeof state;
    return result.result;
  };
  return {
    call,
    get state() {
      return state;
    },
  };
}
test('database templates are hidden from records/search and preserve content, properties and sub-pages', () => {
  const { call } = workspace();
  const db = call('database.create', { color: 'white', title: '知识库' });
  const template = call('template.create', {
    color: 'white',
    databaseId: db.id,
    title: '阅读笔记',
    icon: '📘',
    values: { status: '未开始' },
    blocks: [{ type: 'heading', content: '核心观点', props: { level: 2 } }],
  });
  const child = call('page.create', { color: 'white', parentId: template.id, title: '资料来源' });
  call('block.append', {
    pageId: template.id,
    blocks: [{ type: 'pageLink', props: { pageId: child.id, title: child.title } }],
  });
  assert.equal(call('record.list', { databaseId: db.id }).length, 0);
  assert.equal(call('search', { query: '资料来源' }).length, 0);
  assert.equal(call('page.list').length, 1);
  assert.equal(call('page.list', { templates: true }).length, 3);
  const row = call('template.use', { templateId: template.id });
  assert.equal(row.title, '阅读笔记');
  assert.equal(row.icon, '📘');
  assert.equal(row.values.status, '未开始');
  assert.equal(plainText(row.blocks), '核心观点 ');
  const copiedChild = call('page.list', { parentId: row.id })[0];
  assert.notEqual(copiedChild.id, child.id);
  assert.equal(row.blocks[1].props.pageId, copiedChild.id);
  assert.equal(call('record.list', { databaseId: db.id }).length, 1);
  assert.equal(call('search', { query: '资料来源' })[0].id, copiedChild.id);
});

test('database and per-view defaults are shared by record creation, forms and explicit blank records', () => {
  const { call } = workspace();
  const db = call('database.create', { color: 'white', title: '任务' });
  const template = call('template.create', {
    color: 'white',
    databaseId: db.id,
    title: '默认任务',
    icon: '📝',
    values: { status: '未开始', date: '2026-01-01' },
    blocks: [{ type: 'paragraph', content: '目标与下一步' }],
  });
  call('template.update', { templateId: template.id, changes: { font: 'serif', cover: 'paper' } });
  call('template.default', { databaseId: db.id, templateId: template.id });
  const row = call('record.create', { color: 'white', databaseId: db.id, values: { date: '2026-09-11' } });
  assert.equal(row.title, '默认任务');
  assert.equal(row.icon, '📝');
  assert.equal(row.font, 'serif');
  assert.equal(row.cover, 'paper');
  assert.equal(row.values.date, '2026-09-11');
  assert.equal(plainText(row.blocks), '目标与下一步');
  const form = call('view.create', { databaseId: db.id, type: 'form' });
  const answer = call('form.submit', {
    databaseId: db.id,
    viewId: form.id,
    title: '填写者标题',
    values: { status: '进行中' },
  });
  assert.equal(answer.title, '填写者标题');
  assert.equal(answer.values.status, '进行中');
  assert.equal(plainText(answer.blocks), '目标与下一步');
  call('template.default', { databaseId: db.id, viewId: form.id, templateId: 'none' });
  assert.equal(call('record.create', { color: 'white', databaseId: db.id }).title, '');
  assert.equal(
    call('record.create', { color: 'white', databaseId: db.id, templateId: template.id }).title,
    '默认任务',
  );
  assert.equal(call('record.create', { color: 'white', databaseId: db.id, templateId: 'none' }).title, '');
});

test('applying a template preserves existing values, record IDs and self references', () => {
  const { call } = workspace();
  const db = call('database.create', { color: 'white' });
  const template = call('template.create', {
    color: 'white',
    databaseId: db.id,
    title: '模板',
    values: { status: '未开始', priority: '高' },
  });
  call('block.replace', {
    pageId: template.id,
    blocks: [
      {
        type: 'paragraph',
        content: [{ type: 'pageMention', props: { pageId: template.id, title: '自己' } }],
      },
      { type: 'paragraph', content: '模板内容' },
    ],
  });
  const row = call('record.create', {
    color: 'white',
    databaseId: db.id,
    title: '保留标题',
    values: { status: '进行中' },
    blocks: [{ type: 'paragraph', content: '原始内容' }],
  });
  const result = call('template.apply', { templateId: template.id, pageId: row.id });
  assert.equal(result.id, row.id);
  assert.equal(result.title, '保留标题');
  assert.equal(result.values.status, '进行中');
  assert.equal(result.values.priority, '高');
  assert.equal(result.blocks[1].content[0].props.pageId, row.id);
  assert.match(plainText(result.blocks), /原始内容.*模板内容/);
  assert.equal(call('record.list', { databaseId: db.id }).length, 1);
});

test('duplicating databases remaps default templates and deleting defaults falls back to blank', () => {
  const { call } = workspace();
  const db = call('database.create', { color: 'white', title: '来源' });
  const template = call('template.create', { color: 'white', databaseId: db.id, title: '记录模板' });
  call('template.default', { databaseId: db.id, templateId: template.id });
  const copy = call('page.duplicate', { pageId: db.id });
  const copiedTemplates = call('template.list', { databaseId: copy.id });
  assert.equal(copiedTemplates.length, 1);
  assert.notEqual(copiedTemplates[0].id, template.id);
  assert.equal(copy.database.defaultTemplateId, copiedTemplates[0].id);
  const row = call('record.create', { color: 'white', databaseId: copy.id });
  assert.equal(row.title, '记录模板');
  call('page.trash', { pageId: template.id });
  assert.equal(call('record.create', { color: 'white', databaseId: db.id }).title, '');
  call('page.restore', { pageId: template.id });
  assert.equal(call('template.list', { databaseId: db.id }).length, 1);
});

test('templates with sub-items produce independent child records without exposing prototype rows', () => {
  const f = workspace(),
    call = f.call;
  const db = call('database.create', { color: 'white', title: '项目' });
  const source = call('record.create', { color: 'white', databaseId: db.id, title: '完整项目' });
  const child = call('subitem.create', { color: 'white', pageId: source.id, title: '实施步骤' });
  const template = call('template.create', {
    color: 'white',
    databaseId: db.id,
    fromPageId: source.id,
    title: '项目模板',
  });
  assert.equal(call('record.list', { databaseId: db.id }).length, 2);
  assert.equal(databaseCSV(call('page.get', { pageId: db.id }), f.state).split('\r\n').length, 3);
  const first = call('template.use', { templateId: template.id });
  const second = call('template.use', { templateId: template.id });
  const firstChild = call('subitem.children', { pageId: first.id })[0];
  const secondChild = call('subitem.children', { pageId: second.id })[0];
  assert.notEqual(firstChild.id, child.id);
  assert.notEqual(secondChild.id, firstChild.id);
  assert.equal(firstChild.subItemOf, first.id);
  assert.equal(secondChild.subItemOf, second.id);
  assert.equal(call('record.list', { databaseId: db.id }).length, 6);
});
