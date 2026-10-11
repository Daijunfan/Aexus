import type { Page, Property, Workspace } from '../types.ts';
import { requireEditable, requireRecord } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';

export function relationIds(page: Page, column: Property, pages: Page[]): string[] {
  const value = page.values[column.id];
  let ids: string[];
  if (page.templateFor && Object.hasOwn(page.values, column.id))
    ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  else if (column.system === 'parentItem') ids = page.subItemOf ? [page.subItemOf] : [];
  else if (column.system === 'subItems')
    ids = pages.filter((value) => value.subItemOf === page.id).map((page) => page.id);
  else if (column.system === 'blockedBy') ids = page.blockedBy || [];
  else if (column.system === 'blocking')
    ids = pages.filter((value) => value.blockedBy?.includes(page.id)).map((page) => page.id);
  else ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return ids.filter((id) => pages.some((page) => page.id === id && !page.trashedAt));
}
export function validateRelationships(workspace: Workspace) {
  const pages = new Map(workspace.pages.map((page) => [page.id, page]));
  for (const page of workspace.pages) {
    if (page.subItemOf) {
      const parent = pages.get(page.subItemOf);
      if (!parent || parent.parentId !== page.parentId || !pages.get(page.parentId || '')?.database)
        throw new CommandError('INVALID_SUBITEM', '父项目必须是同一个数据库的记录');
      const seen = new Set([page.id]);
      let current: Page | undefined = parent;
      while (current) {
        if (seen.has(current.id)) throw new CommandError('SUBITEM_CYCLE', '子项目不能形成循环层级');
        seen.add(current.id);
        current = pages.get(current.subItemOf || '');
      }
    }
    for (const id of page.blockedBy || []) {
      const dependency = pages.get(id);
      if (!dependency || dependency.parentId !== page.parentId || !pages.get(page.parentId || '')?.database)
        throw new CommandError('INVALID_DEPENDENCY', '依赖必须是同一数据库的记录');
    }
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (page: Page) => {
    if (visited.has(page.id)) return;
    if (visiting.has(page.id)) throw new CommandError('DEPENDENCY_CYCLE', '依赖关系不能形成循环');
    visiting.add(page.id);
    for (const id of page.blockedBy || []) visit(pages.get(id)!);
    visiting.delete(page.id);
    visited.add(page.id);
  };
  workspace.pages.forEach(visit);
}
export function assignSystemRelation(
  workspace: Workspace,
  pageId: string,
  system: NonNullable<Property['system']>,
  ids: string[],
): Workspace {
  const page = requireRecord(workspace, pageId);
  requireEditable(page);
  if (system === 'parentItem' && ids.length > 1)
    throw new CommandError('MULTIPLE_PARENTS', '一个子项目只能有一个父项目');
  for (const id of ids) {
    const target = requireRecord(workspace, id);
    requireEditable(target);
    if (target.parentId !== page.parentId)
      throw new CommandError('INVALID_RELATION', '请选择同一数据库中的记录');
  }
  const now = Date.now();
  const next = {
    ...workspace,
    pages: workspace.pages.map((value) => {
      if (system === 'parentItem' && value.id === page.id)
        return { ...value, subItemOf: ids[0] || null, updatedAt: now };
      if (system === 'blockedBy' && value.id === page.id)
        return { ...value, blockedBy: [...new Set(ids)], updatedAt: now };
      if (system === 'subItems' && (value.subItemOf === page.id || ids.includes(value.id))) {
        requireEditable(value);
        return { ...value, subItemOf: ids.includes(value.id) ? page.id : null, updatedAt: now };
      }
      if (system === 'blocking' && (value.blockedBy?.includes(page.id) || ids.includes(value.id))) {
        requireEditable(value);
        return {
          ...value,
          blockedBy: ids.includes(value.id)
            ? [...new Set([...(value.blockedBy || []), page.id])]
            : value.blockedBy?.filter((id) => id !== page.id),
          updatedAt: now,
        };
      }
      return value;
    }),
  };
  validateRelationships(next);
  return next;
}
export function applySystemValues(workspace: Workspace, pageId: string, values: Page['values']) {
  const page = workspace.pages.find((page) => page.id === pageId)!;
  if (page.templateFor) return workspace;
  const columns = workspace.pages.find((parent) => parent.id === page.parentId)?.database?.columns || [];
  const configured = columns.filter((column) => column.system && Object.hasOwn(values, column.id));
  if (!configured.length) return workspace;
  for (const column of configured) {
    const value = values[column.id];
    workspace = assignSystemRelation(
      workspace,
      pageId,
      column.system!,
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : value
          ? [String(value)]
          : [],
    );
  }
  const systemIds = new Set(configured.map((column) => column.id));
  return {
    ...workspace,
    pages: workspace.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            values: Object.fromEntries(Object.entries(page.values).filter(([id]) => !systemIds.has(id))),
          }
        : page,
    ),
  };
}
