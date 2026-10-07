import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkspaceCommand } from '../src/core/commands.ts';
import { createWorkspace } from '../src/seed.ts';
import { validateSyncedSources, materializeBlocks } from '../src/content/references.ts';
import { plainText, duplicatePage } from '../src/model.ts';
import type { Workspace } from '../src/types.ts';

function fixture() {
  let workspace: Workspace = { ...createWorkspace(), pages: [], activePageId: null };
  const call = (method: string, params: any = {}) => {
    const result = executeWorkspaceCommand(workspace, method, params);
    if (result.changed) {
      validateSyncedSources(result.workspace!);
      workspace = result.workspace!;
    }
    return result.result;
  };
  return {
    call,
    get workspace() {
      return workspace;
    },
  };
}
test('page and block comments support replies, editing, reactions, resolution and reversible deletion', () => {
  const { call } = fixture();
  const page = call('page.create', {
    color: 'white',
    title: '讨论',
    blocks: [{ type: 'paragraph', content: '需要评审的内容' }],
  });
  const thread = call('comment.add', {
    pageId: page.id,
    blockId: page.blocks[0].id,
    text: '请确认范围',
    author: '本地作者',
  });
  assert.equal(thread.quote, '需要评审的内容');
  call('comment.reply', { pageId: page.id, threadId: thread.id, text: '已确认' });
  call('comment.update', {
    pageId: page.id,
    threadId: thread.id,
    commentId: thread.messages[0].id,
    text: '请确认最终范围',
  });
  call('comment.react', {
    pageId: page.id,
    threadId: thread.id,
    commentId: thread.messages[0].id,
    emoji: '👍',
  });
  let result = call('comment.get', { pageId: page.id, threadId: thread.id });
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].text, '请确认最终范围');
  assert.equal(result.messages[0].reactions['👍'], true);
  call('comment.resolve', { pageId: page.id, threadId: thread.id });
  assert.equal(call('comment.list', { pageId: page.id, status: 'open' }).length, 0);
  call('comment.reply', { pageId: page.id, threadId: thread.id, text: '还有一个问题' });
  assert.equal(call('comment.list', { pageId: page.id, status: 'open' }).length, 1);
  call('comment.delete', { pageId: page.id, threadId: thread.id });
  assert.equal(call('comment.list', { pageId: page.id }).length, 0);
  call('comment.restore', { pageId: page.id, threadId: thread.id });
  assert.equal(call('comment.list', { pageId: page.id })[0].messages.length, 3);
  call('block.delete', { pageId: page.id, ids: [page.blocks[0].id] });
  assert.equal(call('comment.get', { pageId: page.id, threadId: thread.id }).quote, '需要评审的内容');
  for (const message of call('comment.get', { pageId: page.id, threadId: thread.id }).messages)
    call('comment.delete', { pageId: page.id, threadId: thread.id, commentId: message.id });
  call('comment.restore', { pageId: page.id, threadId: thread.id });
  assert.equal(call('comment.list', { pageId: page.id })[0].messages.length, 3);
});

test('moving blocks carries their discussions while ordinary page copies start without comments', () => {
  const f = fixture(),
    call = f.call;
  const a = call('page.create', { color: 'white' }),
    b = call('page.create', { color: 'white' });
  const thread = call('comment.add', { pageId: a.id, blockId: a.blocks[0].id, text: '随内容移动' });
  call('block.move', { pageId: a.id, blockId: a.blocks[0].id, targetPageId: b.id });
  assert.equal(call('comment.list', { pageId: a.id }).length, 0);
  assert.equal(call('comment.get', { pageId: b.id, threadId: thread.id }).messages[0].text, '随内容移动');
  const copy = call('page.duplicate', { pageId: b.id });
  assert.deepEqual(copy.comments, []);
  const portable = duplicatePage(f.workspace, b.id, undefined, { comments: true });
  const restored = portable.workspace.pages.find((page) => page.id === portable.id)!;
  assert.notEqual(restored.comments![0].id, thread.id);
  assert.ok(restored.blocks.some((block) => block.id === restored.comments![0].blockId));
});

test('synced content shares edits, moves block comments to the source, and detaches independently', () => {
  const f = fixture(),
    call = f.call;
  const a = call('page.create', {
    color: 'white',
    title: '甲',
    blocks: [
      { type: 'paragraph', content: '共享约定' },
      { type: 'checkListItem', props: { checked: false }, content: '共同待办' },
    ],
  });
  const b = call('page.create', { color: 'white', title: '乙' });
  call('comment.add', { pageId: a.id, blockId: a.blocks[0].id, text: '约定的讨论' });
  const sync = call('sync.create', {
    pageId: a.id,
    blockIds: a.blocks.map((block: any) => block.id),
    name: '共同约定',
  });
  const ref = call('sync.link', { sourceId: sync.sourceId, pageId: b.id });
  assert.equal(call('sync.get', { sourceId: sync.sourceId }).references.length, 2);
  assert.equal(call('page.list').length, 2);
  assert.equal(call('comment.list', { pageId: sync.sourceId }).length, 1);
  call('block.update', { pageId: sync.sourceId, blockId: a.blocks[0].id, text: '更新后的共享约定' });
  assert.match(
    plainText(materializeBlocks(call('page.get', { pageId: b.id }).blocks, f.workspace)),
    /更新后的共享约定/,
  );
  assert.equal(call('search', { query: '更新后的共享约定' }).length, 2);
  call('sync.unlink', { pageId: b.id, blockId: ref.id });
  call('block.update', { pageId: sync.sourceId, blockId: a.blocks[0].id, text: '再次更新' });
  assert.match(plainText(call('page.get', { pageId: b.id }).blocks), /更新后的共享约定/);
  assert.throws(() => call('sync.delete', { sourceId: sync.sourceId }), /仍有引用/);
  call('sync.delete', { sourceId: sync.sourceId, detach: true });
  assert.equal(call('page.get', { pageId: a.id }).blocks[0].content, '再次更新');
});

test('nested synced content rejects cycles and portable copies remap their source dependencies', () => {
  const f = fixture(),
    call = f.call;
  const page = call('page.create', { color: 'white' });
  const first = call('sync.create', { pageId: page.id, blocks: [{ type: 'paragraph', content: '第一层' }] });
  const second = call('sync.create', { pageId: page.id, blocks: [{ type: 'paragraph', content: '第二层' }] });
  call('sync.link', { sourceId: second.sourceId, pageId: first.sourceId });
  const before = structuredClone(f.workspace);
  assert.throws(() => call('sync.link', { sourceId: first.sourceId, pageId: second.sourceId }), /循环/);
  assert.deepEqual(f.workspace, before);
  const copied = duplicatePage(f.workspace, page.id, undefined, { syncedSources: true, comments: true });
  const copy = copied.workspace.pages.find((page) => page.id === copied.id)!;
  const refs = copy.blocks.filter((block) => block.type === 'syncedBlock');
  assert.notEqual(refs[0].props!.sourceId, first.sourceId);
  assert.match(plainText(materializeBlocks(copy.blocks, copied.workspace)), /第一层 第二层/);
});
