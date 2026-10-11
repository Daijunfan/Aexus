import type { Page, Workspace } from '../types.ts';
import type { CommandParams } from '../core/protocol.ts';
import { requireEditable, requirePage } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';
import { deleteBlocks, flattenBlocks, getBlock, insertBlocks, normalizeBlocks } from '../core/blocks.ts';
import { makePage, plainText } from '../model.ts';
import { syncedReferences, validateSyncedSources } from './references.ts';

function sourcePage(workspace: Workspace, id: string) {
  const page = requirePage(workspace, id);
  if (!page.syncedSource) throw new CommandError('NOT_A_SYNC_SOURCE', '目标不是同步内容');
  return page;
}
function replace(workspace: Workspace, page: Page) {
  return {
    ...workspace,
    pages: workspace.pages.map((value) =>
      value.id === page.id ? { ...page, updatedAt: Date.now() } : value,
    ),
  };
}
export function executeSyncedCommand(workspace: Workspace, method: string, params: CommandParams) {
  if (!method.startsWith('sync.')) return;
  const result = (data: any, changed = false) => {
    if (changed) validateSyncedSources(workspace);
    return { workspace, result: data, changed };
  };
  if (method === 'sync.list')
    return result(
      workspace.pages
        .filter((page) => page.syncedSource && (params.trash || !page.trashedAt))
        .map((page) => ({
          id: page.id,
          title: page.title,
          preview: plainText(page.blocks).slice(0, 180),
          references: syncedReferences(workspace, page.id),
          trashedAt: page.trashedAt,
        })),
    );
  if (method === 'sync.create') {
    const page = requirePage(workspace, params.pageId);
    requireEditable(page);
    const flat = flattenBlocks(page.blocks);
    const requested = new Set<string>(params.blockIds || []);
    for (const id of requested) getBlock(page.blocks, id);
    const selected = flat.filter(
      (item) =>
        requested.has(item.block.id!) &&
        !flat.some(
          (parent) =>
            requested.has(parent.block.id!) &&
            flattenBlocks(parent.block.children || []).some((child) => child.block.id === item.block.id),
        ),
    );
    if (
      selected.length &&
      selected.some(
        (item) =>
          item.parentId !== selected[0].parentId ||
          item.index < selected[0].index ||
          item.index >= selected[0].index + selected.length,
      )
    )
      throw new CommandError('INVALID_BLOCK_SELECTION', '请选择同一层级的连续内容块');
    const content = params.blocks
      ? normalizeBlocks(params.blocks)
      : selected.length
        ? selected.map((item) => item.block)
        : normalizeBlocks([{ type: 'paragraph', content: '' }]);
    const blockIds = new Set(flattenBlocks(content).map((item) => item.block.id));
    const comments = (page.comments || []).filter((thread) => thread.blockId && blockIds.has(thread.blockId));
    const source = makePage({
      title: params.name || plainText(content).slice(0, 40) || '同步内容',
      syncedSource: true,
      blocks: content,
      comments,
      fullWidth: true,
    });
    const block = normalizeBlocks([{ type: 'syncedBlock', props: { sourceId: source.id } }])[0];
    const inserted = selected.length
      ? insertBlocks(page.blocks, [block], { beforeId: selected[0].block.id })
      : insertBlocks(page.blocks, [block], {
          parentId: params.parentId,
          beforeId: params.beforeId,
          afterId: params.afterId,
        });
    workspace = replace(workspace, {
      ...page,
      blocks: deleteBlocks(
        inserted,
        selected.map((item) => item.block.id!),
      ),
      comments: (page.comments || []).filter((thread) => !comments.some((value) => value.id === thread.id)),
    });
    workspace = { ...workspace, pages: [...workspace.pages, source] };
    return result({ sourceId: source.id, pageId: page.id, block }, true);
  }
  if (method === 'sync.unlink') {
    const page = requirePage(workspace, params.pageId, true);
    requireEditable(page);
    const block = getBlock(page.blocks, params.blockId);
    if (block.type !== 'syncedBlock') throw new CommandError('NOT_SYNCED', '此块不是同步块');
    const source = sourcePage(workspace, String(block.props?.sourceId || ''));
    const blocks = normalizeBlocks(source.blocks, true);
    workspace = replace(workspace, {
      ...page,
      blocks: deleteBlocks(insertBlocks(page.blocks, blocks, { beforeId: block.id }), [block.id!]),
    });
    return result({ pageId: page.id, blocks }, true);
  }
  const source = sourcePage(workspace, params.sourceId);
  if (method === 'sync.get') return result({ ...source, references: syncedReferences(workspace, source.id) });
  if (method === 'sync.update') {
    requireEditable(source);
    const next = {
      ...source,
      ...(params.name !== undefined ? { title: String(params.name) } : {}),
      ...(params.blocks ? { blocks: normalizeBlocks(params.blocks) } : {}),
    };
    workspace = replace(workspace, next);
    return result(next, true);
  }
  if (method === 'sync.link') {
    const page = requirePage(workspace, params.pageId);
    requireEditable(page);
    const block = normalizeBlocks([{ type: 'syncedBlock', props: { sourceId: source.id } }])[0];
    let blocks = insertBlocks(page.blocks, [block], {
      parentId: params.parentId,
      beforeId: params.beforeId,
      afterId: params.afterId,
    });
    if (params.replaceEmptyId) {
      const empty = getBlock(page.blocks, params.replaceEmptyId);
      if (empty.type === 'paragraph' && !plainText(empty.content)) blocks = deleteBlocks(blocks, [empty.id!]);
    }
    workspace = replace(workspace, { ...page, blocks });
    return result(block, true);
  }
  if (method === 'sync.delete') {
    requireEditable(source);
    const refs = syncedReferences(workspace, source.id, true);
    if (refs.length && !params.detach)
      throw new CommandError('SYNC_IN_USE', '同步内容仍有引用；detach=true 会先把各处转换为独立内容');
    for (const ref of refs) workspace = executeSyncedCommand(workspace, 'sync.unlink', ref)!.workspace;
    workspace = replace(workspace, { ...source, trashedAt: Date.now() });
    return result({ sourceId: source.id, detached: refs.length }, true);
  }
  throw new CommandError('METHOD_NOT_FOUND', `未知同步块方法 ${method}`);
}
