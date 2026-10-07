import type { Database, Page, Workspace } from '../types.ts';
import { CommandError, requiredString } from './errors.ts';

export function requirePage(workspace: Workspace, id: unknown, includeTrash = false): Page {
  const page = workspace.pages.find((page) => page.id === requiredString(id, 'pageId'));
  if (!page) throw new CommandError('PAGE_NOT_FOUND', `未找到页面 ${id}`);
  if (page.trashedAt && !includeTrash) throw new CommandError('PAGE_IN_TRASH', '页面在回收站中，请先恢复');
  return page;
}
export function requireDatabase(workspace: Workspace, id: unknown) {
  const page = requirePage(workspace, id);
  if (!page.database) throw new CommandError('NOT_A_DATABASE', '目标页面不是数据库');
  return page as Page & { database: Database };
}
export function requireEditable(page: Page) {
  if (page.locked) throw new CommandError('PAGE_LOCKED', '页面已锁定，请先解锁');
}
export function requireRecord(workspace: Workspace, id: string) {
  const page = requirePage(workspace, id);
  if (!page.parentId) throw new CommandError('NOT_A_RECORD', '目标必须是数据库记录');
  requireDatabase(workspace, page.parentId);
  return page;
}
