import { ancestors, descendants, isInternalPage } from '../model';
import type { AgentContext, SpaceFileRecord, Workspace } from '../types';
import { requirePage } from './access';
import { getBlock } from './blocks';
import { CommandError } from './errors';

export type AgentContextItem =
  | { kind: 'page'; id: string; title: string; location: string }
  | { kind: 'file'; id: string; title: string; location: string; file: SpaceFileRecord };

export function listAgentContext(workspace: Workspace, pageId: string, query = ''): AgentContextItem[] {
  const root = requirePage(workspace, pageId);
  if (!root.space) throw new CommandError('NOT_A_SPACE', '此页面不是 Workspace');
  const ids = descendants(workspace.pages, root.id);
  const pages: AgentContextItem[] = workspace.pages
    .filter((page) => ids.has(page.id) && !page.trashedAt && !isInternalPage(page, workspace.pages))
    .map((page) => ({
      kind: 'page',
      id: page.id,
      title: page.title || '无标题',
      location:
        ancestors(workspace.pages, page.id)
          .reverse()
          .map((parent) => parent.title)
          .join(' / ') || root.title,
    }));
  const files: AgentContextItem[] = (root.files || []).map((file) => ({
    kind: 'file',
    id: file.id,
    title: file.name,
    location: root.folders?.find((folder) => folder.id === file.folderId)?.name || root.title,
    file,
  }));
  return [...pages, ...files].filter((item) =>
    `${item.title} ${item.location}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
}

export function resolveAgentContext(workspace: Workspace, rootId: string, values: unknown): AgentContext[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new CommandError('INVALID_ARGUMENT', 'context 必须是页面/块引用数组');
  const ids = descendants(workspace.pages, rootId);
  return values.map((value) => {
    const page = requirePage(workspace, value?.pageId);
    if (!ids.has(page.id)) throw new CommandError('SPACE_ACCESS_DENIED', '上下文引用必须属于当前 Workspace');
    if (value.blockId) getBlock(page.blocks, value.blockId);
    if (value.quote !== undefined && typeof value.quote !== 'string')
      throw new CommandError('INVALID_ARGUMENT', '引用文本必须是字符串');
    return {
      pageId: page.id,
      title: page.title,
      ...(value.blockId ? { blockId: value.blockId } : {}),
      ...(value.quote ? { quote: value.quote } : {}),
    };
  });
}
