import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ancestors,
  descendants,
  duplicatePage,
  makePage,
  movePage,
  readProperty,
  restorePage,
  searchPages,
  trashPage,
} from '../src/model.ts';
import { csvPages, databaseCSV, parseCSV } from '../src/transfer.ts';
import type { Workspace } from '../src/types.ts';

const sample = (): Workspace => ({
  version: 1,
  name: '测试',
  activePageId: 'child',
  expanded: [],
  recent: [],
  settings: { theme: 'light', sidebarWidth: 248, sidebarHidden: false, spellcheck: false },
  pages: [
    makePage({ id: 'parent', title: '项目' }),
    makePage({ id: 'child', title: '记录', parentId: 'parent' }),
    makePage({ id: 'grandchild', title: '细节', parentId: 'child' }),
    makePage({ id: 'other', title: '独立页面' }),
  ],
});

test('move preserves a tree and prevents a cycle', () => {
  let state = sample();
  assert.equal(movePage(state, 'parent', 'grandchild'), state);
  state = movePage(state, 'child', 'other');
  assert.equal(state.pages.find((p) => p.id === 'child')?.parentId, 'other');
  assert.deepEqual(
    ancestors(state.pages, 'grandchild').map((p) => p.id),
    ['other', 'child'],
  );
  assert.deepEqual([...descendants(state.pages, 'other')], ['other', 'child', 'grandchild']);
  state = movePage(state, 'other', null, 'parent');
  assert.equal(state.pages[0].id, 'other');
});

test('trash a subtree then restore; keep previously trashed children in trash', () => {
  let state = sample();
  state.pages[2].trashedAt = 100;
  state = trashPage(state, 'parent');
  assert.equal(state.activePageId, null);
  assert.ok(state.pages[0].trashedAt);
  assert.ok(state.pages[1].trashedAt);
  assert.equal(state.pages[3].trashedAt, null);
  state = restorePage(state, 'parent');
  assert.equal(state.pages[0].trashedAt, null);
  assert.equal(state.pages[1].trashedAt, null);
  assert.equal(state.pages[2].trashedAt, 100);
});

test('restore a child of a trashed page to the workspace root', () => {
  const state = restorePage(trashPage(sample(), 'parent'), 'child');
  assert.equal(state.pages.find((p) => p.id === 'child')?.parentId, null);
  assert.equal(state.pages.find((p) => p.id === 'grandchild')?.trashedAt, null);
});

test('duplicate creates independent pages with remapped nested page links', () => {
  const state = sample();
  state.pages[0].blocks = [{ id: 'link', type: 'pageLink', props: { pageId: 'child' } }];
  const result = duplicatePage(state, 'parent');
  const copied = result.workspace.pages.filter((p) => !state.pages.some((s) => s.id === p.id));
  assert.equal(copied.length, 3);
  const parent = copied.find((p) => p.id === result.id)!;
  const child = copied.find((p) => p.title === '记录')!;
  assert.equal(child.parentId, parent.id);
  assert.equal(parent.blocks[0].props?.pageId, child.id);
  assert.notEqual(parent.blocks[0].id, 'link');
  parent.blocks[0].props!.pageId = 'changed';
  assert.equal(state.pages[0].blocks[0].props!.pageId, 'child');
});

test('search covers Chinese title, rich content, tables, properties and excludes trash', () => {
  const state = sample();
  state.pages[0].blocks = [
    { type: 'table', content: { rows: [{ cells: [[{ type: 'text', text: '离线笔记' }]] }] } },
  ];
  state.pages[1].title = '离线笔记';
  state.pages[2].values = { tag: '离线笔记' };
  state.pages[3].title = '离线笔记';
  state.pages[3].trashedAt = 100;
  assert.deepEqual(
    searchPages(state.pages, '离线 笔记').map((p) => p.id),
    ['child', 'parent', 'grandchild'],
  );
});

test('CSV roundtrips commas, quotes, multiline fields and Unicode', () => {
  const text = '\uFEFF"名称","笔记"\r\n"你好, 世界","第一行\n第二行 ""引用"""\r\n';
  assert.deepEqual(parseCSV(text), [
    ['名称', '笔记'],
    ['你好, 世界', '第一行\n第二行 "引用"'],
  ]);
  const pages = csvPages('我的数据库.csv', text);
  assert.equal(pages.length, 2);
  assert.deepEqual(parseCSV(databaseCSV(pages[0], { ...sample(), pages })), parseCSV(text));
  assert.throws(() => parseCSV('"未闭合'), /引号/);
});

test('relation values and rollups update from related records without storing stale calculations', () => {
  const pages = [
    makePage({ id: 'a', title: '项目一', values: { related: ['b', 'c', 'deleted'] } }),
    makePage({ id: 'b', title: '事项 B', values: { hours: 2 } }),
    makePage({ id: 'c', title: '事项 C', values: { hours: 5 } }),
    makePage({ id: 'deleted', trashedAt: 100, values: { hours: 100 } }),
  ];
  const property = {
    id: 'sum',
    name: '工时',
    type: 'rollup' as const,
    relationProperty: 'related',
    targetProperty: 'hours',
    calculation: 'sum' as const,
  };
  assert.equal(readProperty(pages[0], property, pages), 7);
  assert.equal(readProperty(pages[0], { ...property, calculation: 'average' }, pages), 3.5);
  assert.equal(readProperty(pages[0], { ...property, calculation: 'count' }, pages), 2);
  assert.deepEqual(readProperty(pages[0], { id: 'related', name: '关联', type: 'relation' }, pages), [
    '事项 B',
    '事项 C',
  ]);
  pages[1].values.hours = 8;
  assert.equal(readProperty(pages[0], property, pages), 13);
});

test('duplicate remaps self-relations and inline links within the copied subtree', () => {
  const state = sample();
  state.pages[0].database = {
    columns: [{ id: 'related', name: '关联', type: 'relation', relationTo: 'parent' }],
    view: 'table',
  };
  state.pages[1].values.related = ['grandchild', 'other'];
  state.pages[0].blocks = [
    {
      type: 'paragraph',
      content: [
        { type: 'pageMention', props: { pageId: 'child', title: '记录' } },
        {
          type: 'link',
          href: 'mininotion://page/grandchild',
          content: [{ type: 'text', text: '细节', styles: {} }],
        },
      ],
    },
  ];
  const result = duplicatePage(state, 'parent');
  const copied = result.workspace.pages.filter((p) => !state.pages.some((s) => s.id === p.id));
  const root = copied.find((p) => p.id === result.id)!;
  const child = copied.find((p) => p.title === '记录')!;
  const grandchild = copied.find((p) => p.title === '细节')!;
  assert.equal(root.database!.columns[0].relationTo, root.id);
  assert.deepEqual(child.values.related, [grandchild.id, 'other']);
  assert.equal(root.blocks[0].content[0].props.pageId, child.id);
  assert.equal(root.blocks[0].content[1].href, `mininotion://page/${grandchild.id}`);
});

test('formula properties resolve related records and derived rollups without stale stored values', () => {
  const database = makePage({
    id: 'db',
    database: {
      view: 'table',
      columns: [
        { id: 'hours', name: '工时', type: 'number' },
        { id: 'rate', name: '单价', type: 'number' },
        { id: 'total', name: '金额', type: 'formula', formula: 'prop("工时") * prop("单价")' },
        { id: 'related', name: '关联', type: 'relation', relationTo: 'db' },
        {
          id: 'sum',
          name: '汇总金额',
          type: 'rollup',
          relationProperty: 'related',
          targetProperty: 'total',
          calculation: 'sum',
        },
        {
          id: 'mapped',
          name: '公式汇总',
          type: 'formula',
          formula: 'prop("关联").map(current.prop("金额")).sum()',
        },
      ],
    },
  });
  const a = makePage({ id: 'a', parentId: 'db', values: { hours: 3, rate: 100, related: ['b'] } });
  const b = makePage({ id: 'b', parentId: 'db', values: { hours: 2, rate: 90 } });
  const pages = [database, a, b];
  assert.equal(readProperty(a, database.database!.columns[2], pages), 300);
  assert.equal(readProperty(a, database.database!.columns[4], pages), 180);
  assert.equal(readProperty(a, database.database!.columns[5], pages), 180);
  b.values.hours = 5;
  assert.equal(readProperty(a, database.database!.columns[5], pages), 450);
  assert.equal(a.values.total, undefined);
});

test('cyclic formulas produce a recoverable cell error', () => {
  const database = makePage({
    id: 'db',
    database: {
      view: 'table',
      columns: [
        { id: 'a', name: '甲', type: 'formula', formula: 'prop("乙") + 1' },
        { id: 'b', name: '乙', type: 'formula', formula: 'prop("甲") + 1' },
      ],
    },
  });
  const row = makePage({ parentId: 'db' });
  assert.match(String(readProperty(row, database.database!.columns[0], [database, row])), /循环引用/);
});
