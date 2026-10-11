import type { Workspace } from '../../types';
import { descendants } from '../../model';
import { CommandError } from '../../core/errors';
import { executeWorkspaceCommand, type Execution } from '../../core/commands';
import { applyWorkspacePatch, diffWorkspace } from '../../core/patch';
import type { CommandParams } from '../../core/protocol';

export function scopedWorkspace(workspace: Workspace, rootId: string): Workspace {
  const ids = descendants(workspace.pages, rootId);
  const pages = workspace.pages.filter((page) => ids.has(page.id));
  const repeatIds = new Set(pages.flatMap((page) => (page.repeat ? [page.repeat.id] : [])));
  const reminderIds = new Set(pages.flatMap((page) => (page.reminders || []).map((reminder) => reminder.id)));
  return {
    ...workspace,
    pages,
    scheduler: workspace.scheduler && {
      repeats: Object.fromEntries(
        Object.entries(workspace.scheduler.repeats).filter(([id]) => repeatIds.has(id)),
      ),
      reminders: Object.fromEntries(
        Object.entries(workspace.scheduler.reminders).filter(([id]) => reminderIds.has(id)),
      ),
      runs: workspace.scheduler.runs.filter((run) => ids.has(run.templateId)),
    },
    uniqueIds:
      workspace.uniqueIds &&
      Object.fromEntries(Object.entries(workspace.uniqueIds).filter(([id]) => ids.has(id))),
    spaces: {
      [rootId]: {
        ...workspace.spaces![rootId],
        agent: {
          ...workspace.spaces![rootId].agent,
          messages: [],
          options: undefined,
          capabilities: undefined,
          queue: [],
          sessions: undefined,
        },
      },
    },
    activePageId: rootId,
    recent: workspace.recent.filter((id) => ids.has(id)),
    expanded: workspace.expanded.filter((id) => ids.has(id)),
    inbox: workspace.inbox?.filter((item) => ids.has(item.pageId)),
    actionRuns: workspace.actionRuns?.filter((run) => ids.has(run.ownerId || '')),
  };
}

export function executeScoped(
  workspace: Workspace,
  rootId: string,
  method: string,
  params: CommandParams,
): Execution {
  if (method === 'batch') {
    if (!Array.isArray(params.operations))
      throw new CommandError('INVALID_ARGUMENT', 'operations 必须是数组');
    let next = workspace;
    const results = [];
    for (const operation of params.operations) {
      const result = executeScoped(next, rootId, operation.method, operation.params || {});
      next = result.workspace!;
      results.push(result.result);
    }
    return { workspace: next, result: results, changed: next !== workspace };
  }
  const allowed =
    /^(page|block|database|record|form|view|property|template|comment|synced|relation|subitem|dependency|button|automation|repeat|reminder|inbox|folder)\./.test(
      method,
    ) ||
    [
      'schema',
      'search',
      'workspace.get',
      'agent.context',
      'space.get',
      'space.list',
      'space.configure',
      'action.history',
      'scheduler.status',
      'person.list',
      'file.list',
      'file.get',
      'file.record',
      'file.rename',
      'file.move',
      'file.remove',
    ].includes(method);
  if (!allowed)
    throw new CommandError('SPACE_ACCESS_DENIED', 'Agent 只能操作绑定空间；系统管理请使用 Professional CLI');
  if (
    ['page.move', 'page.trash', 'page.purge', 'page.duplicate'].includes(method) &&
    params.pageId === rootId
  )
    throw new CommandError('SPACE_ACCESS_DENIED', 'Agent 不可删除、移动或复制其主页面');
  const scoped = scopedWorkspace(workspace, rootId);
  const result = executeWorkspaceCommand(scoped, method, params);
  if (!result.changed || !result.workspace) return { ...result, workspace };
  const next = result.workspace;
  const root = next.pages.find((page) => page.id === rootId);
  const previousRoot = workspace.pages.find((page) => page.id === rootId)!;
  if (
    !root ||
    root.parentId !== null ||
    root.trashedAt !== previousRoot.trashedAt ||
    next.spaces?.[rootId]?.engine !== workspace.spaces?.[rootId]?.engine
  )
    throw new CommandError('SPACE_ACCESS_DENIED', '主页面与 Workspace 的绑定不可改变');
  const ids = descendants(next.pages, rootId);
  // Synced content sources are internal pages; keep them under this Workspace too.
  for (const page of next.pages) {
    if (page.syncedSource && page.parentId === null) {
      page.parentId = rootId;
      ids.add(page.id);
    }
    if (!ids.has(page.id)) throw new CommandError('SPACE_ACCESS_DENIED', '所有页面必须位于绑定空间内');
  }
  return { ...result, workspace: applyWorkspacePatch(workspace, diffWorkspace(scoped, next)) };
}
