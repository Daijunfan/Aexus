import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { normalizeWorkspace } from '../src/core/normalize.ts';
import { validateDomain } from '../src/core/validate.ts';
import { makePage } from '../src/model.ts';
import type { Workspace } from '../src/types.ts';

const base = (): Workspace => ({
  version: 1,
  name: '测试',
  activePageId: null,
  expanded: [],
  recent: [],
  settings: { theme: 'light', sidebarWidth: 248, sidebarHidden: false, spellcheck: false },
  pages: [
    makePage({ id: 'root', title: '项目' }),
    makePage({ id: 'child', title: '记录', parentId: 'root' }),
  ],
});

test('a top-level page becomes a space during normalization and a child does not', () => {
  const workspace = normalizeWorkspace(base());
  const root = workspace.pages.find((page) => page.id === 'root')!;
  const child = workspace.pages.find((page) => page.id === 'child')!;
  assert.equal(root.space, true);
  assert.deepEqual(root.folders, []);
  assert.deepEqual(root.files, []);
  assert.equal(child.space, undefined);
  assert.ok(workspace.spaces?.root);
  assert.equal(workspace.spaces!.root.engine, 'claude');
  assert.equal(workspace.spaces!.root.agent.status, 'idle');
});

test('a top-level database owns a space while its child remains within that space', () => {
  const workspace = base();
  workspace.pages[0] = { ...workspace.pages[0], database: { columns: [], view: 'table' } as any };
  const normalized = normalizeWorkspace(workspace);
  assert.equal(normalized.pages.find((page) => page.id === 'root')!.space, true);
  assert.equal(normalized.pages.find((page) => page.id === 'child')!.space, undefined);
  assert.equal(Object.keys(normalized.spaces || {}).length, 1);
  assert.equal(normalized.spaces!.root.engine, 'claude');
});

test('space.create builds a top-level space page bound to an engine', () => {
  const workspace = normalizeWorkspace(base());
  const operation = executeWorkspaceCommand(workspace, 'space.create', {
    color: 'white',
    title: '研究',
    engine: 'codex',
  });
  const created = operation.result;
  const page = operation.workspace!.pages.find((value) => value.id === created.id)!;
  assert.equal(page.parentId, null);
  assert.equal(page.space, true);
  assert.equal(operation.workspace!.spaces![created.id].engine, 'codex');
  assert.equal(operation.workspace!.spaces![created.id].agent.engine, 'codex');
});

test('folders nest, move and reject moving into their own subtree', () => {
  let workspace = normalizeWorkspace(base());
  const created = executeWorkspaceCommand(workspace, 'space.create', { color: 'white', title: '空间' });
  const pageId = created.result.id as string;
  workspace = created.workspace!;
  const parent = executeWorkspaceCommand(workspace, 'folder.create', { pageId, name: '文档' });
  workspace = parent.workspace!;
  const child = executeWorkspaceCommand(workspace, 'folder.create', {
    pageId,
    name: '2026',
    parentId: parent.result.id,
  });
  workspace = child.workspace!;
  const page = workspace.pages.find((value) => value.id === pageId)!;
  assert.equal(page.folders!.length, 2);
  assert.equal(page.folders!.find((folder) => folder.id === child.result.id)!.parentId, parent.result.id);

  assert.throws(
    () =>
      executeWorkspaceCommand(workspace, 'folder.move', {
        pageId,
        folderId: parent.result.id,
        parentId: child.result.id,
      }),
    /移动/,
  );
});

test('deleting a folder removes its contents and needs confirmation when non-empty', () => {
  let workspace = normalizeWorkspace(base());
  const created = executeWorkspaceCommand(workspace, 'space.create', { color: 'white', title: '空间' });
  const pageId = created.result.id as string;
  workspace = created.workspace!;
  const folder = executeWorkspaceCommand(workspace, 'folder.create', { pageId, name: '文档' });
  workspace = folder.workspace!;
  const file = executeWorkspaceCommand(workspace, 'file.record', {
    pageId,
    name: 'a.txt',
    url: 'asset://local/a.txt',
    folderId: folder.result.id,
    bytes: 3,
  });
  workspace = file.workspace!;
  assert.throws(
    () => executeWorkspaceCommand(workspace, 'folder.delete', { pageId, folderId: folder.result.id }),
    /confirm/,
  );
  const deleted = executeWorkspaceCommand(workspace, 'folder.delete', {
    pageId,
    folderId: folder.result.id,
    confirm: true,
  });
  const page = deleted.workspace!.pages.find((value) => value.id === pageId)!;
  assert.equal(page.folders!.length, 0);
  assert.equal(page.files!.length, 0);
});

test('validation rejects a child page marked as a space and folders that escape', () => {
  const childSpace = normalizeWorkspace(base());
  childSpace.pages = childSpace.pages.map((page) => (page.id === 'child' ? { ...page, space: true } : page));
  assert.throws(() => validateDomain(childSpace), /顶层/);

  const badFolder = normalizeWorkspace(base());
  badFolder.pages = badFolder.pages.map((page) =>
    page.id === 'root' ? { ...page, folders: [{ id: 'f1', name: '../etc', parentId: null }] } : page,
  );
  assert.throws(() => validateDomain(badFolder), /文件夹名称/);

  const orphan = normalizeWorkspace(base());
  orphan.pages = orphan.pages.map((page) =>
    page.id === 'root' ? { ...page, folders: [{ id: 'f1', name: 'ok', parentId: 'missing' }] } : page,
  );
  assert.throws(() => validateDomain(orphan), /文件夹父级/);
});

test('normalization drops dangling files and repairs orphaned folders', () => {
  const workspace = base();
  workspace.spaces = {};
  workspace.pages = workspace.pages.map((page) =>
    page.id === 'root'
      ? {
          ...page,
          space: true,
          folders: [{ id: 'f1', name: 'ok', parentId: 'ghost' }],
          files: [
            { id: 'x', name: 'a.txt', url: 'asset://local/a.txt', bytes: 1, folderId: 'nope', createdAt: 1 },
          ],
        }
      : page,
  );
  const normalized = normalizeWorkspace(workspace);
  const root = normalized.pages.find((page) => page.id === 'root')!;
  assert.equal(root.folders![0].parentId, null);
  assert.equal(root.files![0].folderId, null);
});

test('purging a space page removes its space metadata', () => {
  let workspace = normalizeWorkspace(base());
  const created = executeWorkspaceCommand(workspace, 'space.create', { color: 'white', title: '空间' });
  const pageId = created.result.id as string;
  workspace = created.workspace!;
  assert.ok(workspace.spaces![pageId]);
  const purged = executeWorkspaceCommand(workspace, 'page.purge', { pageId, confirm: true });
  assert.equal(purged.workspace!.spaces![pageId], undefined);
});

test('every top-level page is a space, and converting one is idempotent', () => {
  const workspace = normalizeWorkspace(base());
  const converted = executeWorkspaceCommand(workspace, 'space.convert', { pageId: 'root', engine: 'claude' });
  const page = converted.workspace!.pages.find((value) => value.id === 'root')!;
  assert.equal(page.space, true);
  assert.equal(converted.workspace!.spaces!.root.engine, 'claude');
  assert.equal(page.title, '项目');
  assert.throws(() => executeWorkspaceCommand(workspace, 'space.convert', { pageId: 'child' }), /顶层/);
});

test('two spaces cannot share the same native Agent session', () => {
  const first = normalizeWorkspace(base());
  const operation = executeWorkspaceCommand(first, 'space.create', { color: 'white', title: '另一个空间' });
  const workspace = structuredClone(operation.workspace!);
  workspace.spaces!.root.agent.sessionId = 'shared';
  workspace.spaces![operation.result.id].agent.sessionId = 'shared';
  assert.throws(() => validateDomain(workspace), /会话不能绑定多个空间/);
});
