import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSync } from '../src/core/sync.ts';
import { applyWorkspacePatch, diffWorkspace } from '../src/core/patch.ts';
import { createWorkspace } from '../src/seed.ts';
import type { ApiResponse } from '../src/core/protocol.ts';
import { formatBlock } from '../src/core/blocks.ts';
import { plainText } from '../src/model.ts';

test('optimistic GUI edits survive earlier acknowledgements and a simultaneous CLI edit', async () => {
  let server = createWorkspace();
  const queue: { params: any; id?: string; resolve: (response: ApiResponse) => void }[] = [];
  const sync = new WorkspaceSync(
    server,
    async (_method, params, id) => new Promise((resolve) => queue.push({ params, id, resolve })),
  );
  const first = structuredClone(sync.workspace);
  first.pages[0].title = '第一';
  sync.update(first);
  const second = structuredClone(sync.workspace);
  second.pages[0].title = '第二';
  sync.update(second);
  assert.equal(queue.length, 1);
  const cli = structuredClone(server);
  cli.pages[0].icon = '📘';
  server = { ...applyWorkspacePatch(server, diffWorkspace(server, cli)), revision: 1 };
  sync.receive({ type: 'state', workspace: server, revision: 1 });
  assert.equal(sync.workspace.pages[0].title, '第二');
  assert.equal(sync.workspace.pages[0].icon, '📘');
  const acknowledge = async (index: number) => {
    const operation = queue[index];
    server = { ...applyWorkspacePatch(server, operation.params.patch), revision: (server.revision || 0) + 1 };
    sync.receive({ type: 'state', workspace: server, revision: server.revision!, requestId: operation.id });
    operation.resolve({
      jsonrpc: '2.0',
      id: operation.id!,
      result: {},
      workspace: server,
      revision: server.revision!,
    });
    await new Promise((resolve) => setImmediate(resolve));
  };
  await acknowledge(0);
  assert.equal(sync.workspace.pages[0].title, '第二');
  await acknowledge(1);
  await sync.flush();
  assert.equal(server.pages[0].title, '第二');
  assert.equal(server.pages[0].icon, '📘');
  assert.equal(sync.pending.length, 0);
});

test('concurrent block insertion preserves ordering and deletion conflicts retain the local draft', () => {
  const base = createWorkspace();
  base.pages[0].blocks = [
    { id: 'a', type: 'paragraph', content: '甲' },
    { id: 'b', type: 'paragraph', content: '乙' },
  ];
  const left = structuredClone(base),
    right = structuredClone(base);
  left.pages[0].blocks.splice(1, 0, { id: 'x', type: 'paragraph', content: 'GUI' });
  right.pages[0].blocks.splice(1, 0, { id: 'y', type: 'paragraph', content: 'CLI' });
  const merged = applyWorkspacePatch(right, diffWorkspace(base, left));
  assert.equal(merged.pages[0].blocks.length, 4);
  assert.equal(merged.pages[0].blocks[0].id, 'a');
  assert.equal(merged.pages[0].blocks.at(-1)!.id, 'b');
  const deleted = structuredClone(base);
  deleted.pages.shift();
  assert.throws(() => applyWorkspacePatch(deleted, diffWorkspace(base, left)), /另一端发生了修改/);
});

test('formatting a selection inside a link preserves its surrounding link text', () => {
  const block = formatBlock(
    {
      id: 'block',
      type: 'paragraph',
      content: [
        {
          type: 'link',
          href: 'https://example.org',
          content: [{ type: 'text', text: '前中后', styles: {} }],
        },
      ],
    },
    { link: false, bold: true },
    1,
    2,
  );
  assert.equal(block.content[0].href, 'https://example.org');
  assert.equal(block.content[1].text, '中');
  assert.equal(block.content[1].styles.bold, true);
  assert.equal(block.content[2].href, 'https://example.org');
  assert.equal(plainText(block.content), '前中后');
});
