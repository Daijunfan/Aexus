import type { JsonBlock, Page, Workspace } from '../types.ts';
import { flattenBlocks } from '../core/blocks.ts';
import { CommandError } from '../core/errors.ts';

export function syncedReferences(workspace: Workspace, sourceId: string, includeTrash = false) {
  return workspace.pages
    .filter((page) => includeTrash || !page.trashedAt)
    .flatMap((page) =>
      flattenBlocks(page.blocks)
        .filter((item) => item.block.type === 'syncedBlock' && item.block.props?.sourceId === sourceId)
        .map((item) => ({ pageId: page.id, title: page.title, blockId: item.block.id! })),
    );
}
export function sourceClosure(pages: Page[], blocks: JsonBlock[]): Set<string> {
  const found = new Set<string>();
  const visit = (items: JsonBlock[]) => {
    for (const { block } of flattenBlocks(items))
      if (block.type === 'syncedBlock') {
        const id = String(block.props?.sourceId || '');
        if (found.has(id)) continue;
        const source = pages.find((page) => page.id === id && page.syncedSource);
        if (!source) continue;
        const owned = new Set([id]);
        for (let changed = true; changed;) {
          changed = false;
          for (const page of pages)
            if (
              !owned.has(page.id) &&
              ((page.parentId && owned.has(page.parentId)) || (page.subItemOf && owned.has(page.subItemOf)))
            ) {
              owned.add(page.id);
              changed = true;
            }
        }
        for (const sourceId of owned) found.add(sourceId);
        for (const page of pages.filter((page) => owned.has(page.id))) visit(page.blocks);
      }
  };
  visit(blocks);
  return found;
}
export function materializeBlocks(
  blocks: JsonBlock[],
  workspace: Pick<Workspace, 'pages'>,
  chain = new Set<string>(),
): JsonBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === 'syncedBlock') {
      const id = String(block.props?.sourceId || '');
      if (chain.has(id)) return [{ type: 'paragraph', content: '[同步内容循环引用]' }];
      const source = workspace.pages.find((page) => page.id === id && page.syncedSource && !page.trashedAt);
      return source
        ? materializeBlocks(source.blocks, workspace, new Set([...chain, id]))
        : [{ type: 'paragraph', content: '[同步内容已删除]' }];
    }
    return [
      {
        ...block,
        ...(block.children ? { children: materializeBlocks(block.children, workspace, chain) } : {}),
      },
    ];
  });
}
export function validateSyncedSources(workspace: Workspace) {
  const sources = new Map(workspace.pages.filter((page) => page.syncedSource).map((page) => [page.id, page]));
  const done = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (done.has(id) || !sources.has(id)) return;
    if (active.has(id)) throw new CommandError('SYNC_CYCLE', '同步内容不能引用自身或形成循环');
    active.add(id);
    for (const { block } of flattenBlocks(sources.get(id)!.blocks))
      if (block.type === 'syncedBlock') visit(String(block.props?.sourceId || ''));
    active.delete(id);
    done.add(id);
  };
  sources.forEach((source) => visit(source.id));
}
