import { requiredPageColor } from '../core/appearance.ts';
import type { Database, DatabaseView, Page, Property, Workspace } from '../types.ts';
import { descendants, isTemplatePage } from '../model.ts';
import { requireDatabase, requireEditable, requirePage, requireRecord as record } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';
import { createTemplateRecord } from './templatesModel.ts';
import type { CommandParams } from '../core/protocol.ts';
import { assignSystemRelation, validateRelationships } from './relations.ts';
import { subItemDisplay } from './model.ts';
export { subItemDisplay } from './model.ts';

const roleNames = { parentItem: '父项目', subItems: '子项目', blockedBy: '被阻挡', blocking: '正在阻挡' };
export function configureDatabase(
  workspace: Workspace,
  databaseId: string,
  changes: { subItems?: boolean; dependencies?: Partial<NonNullable<Database['dependencies']>> },
) {
  const page = requireDatabase(workspace, databaseId);
  requireEditable(page);
  const database = { ...page.database, columns: [...page.database.columns] };
  const addRoles = (roles: Property['system'][]) => {
    for (const system of roles)
      if (!database.columns.some((column) => column.system === system))
        database.columns.push({
          id: crypto.randomUUID(),
          name: roleNames[system!],
          type: 'relation',
          relationTo: page.id,
          system,
        });
  };
  if (changes.subItems !== undefined) {
    database.subItems = !!changes.subItems;
    if (database.subItems) addRoles(['parentItem', 'subItems']);
  }
  if (changes.dependencies !== undefined) {
    let dateProperty =
      changes.dependencies.dateProperty ||
      database.dependencies?.dateProperty ||
      database.columns.find((column) => column.type === 'date')?.id;
    if (!dateProperty && changes.dependencies.enabled !== false) {
      dateProperty = crypto.randomUUID();
      database.columns.push({ id: dateProperty, name: '日期', type: 'date' });
    }
    database.dependencies = {
      enabled: true,
      dateProperty: dateProperty || '',
      shift: 'none',
      ...database.dependencies,
      ...changes.dependencies,
    };
    if (!['none', 'overlap', 'maintain'].includes(database.dependencies.shift))
      throw new CommandError('INVALID_DEPENDENCY_CONFIG', 'shift 必须是 none / overlap / maintain');
    if (database.dependencies.enabled) {
      if (
        !database.columns.some(
          (column) => column.id === database.dependencies!.dateProperty && column.type === 'date',
        )
      )
        throw new CommandError('INVALID_DATE_PROPERTY', '依赖开始日期必须是日期属性');
      if (
        database.dependencies.endProperty &&
        !database.columns.some(
          (column) => column.id === database.dependencies!.endProperty && column.type === 'date',
        )
      )
        throw new CommandError('INVALID_DATE_PROPERTY', '依赖结束日期必须是日期属性');
      if (database.dependencies.endProperty === database.dependencies.dateProperty)
        throw new CommandError('INVALID_DATE_PROPERTY', '开始与结束日期需要使用不同属性');
      addRoles(['blockedBy', 'blocking']);
    }
  }
  return {
    ...workspace,
    pages: workspace.pages.map((value) =>
      value.id === page.id ? { ...page, database, updatedAt: Date.now() } : value,
    ),
  };
}
export function setSystemRelation(
  workspace: Workspace,
  pageId: string,
  system: NonNullable<Property['system']>,
  ids: string[],
) {
  let next = assignSystemRelation(workspace, pageId, system, ids);
  const page = record(next, pageId),
    database = requireDatabase(next, page.parentId!).database;
  if (system === 'parentItem' || system === 'subItems')
    next = configureDatabase(next, page.parentId!, { subItems: database.subItems ?? true });
  else if (!database.dependencies)
    next = configureDatabase(next, page.parentId!, { dependencies: { enabled: true, shift: 'none' } });
  return next;
}
export type HierarchyRow = { page: Page; depth: number; childCount: number; expanded: boolean };
export function hierarchyRows(rows: Page[], view: DatabaseView, enabled = true): HierarchyRow[] {
  if (!enabled || subItemDisplay(view) !== 'nested')
    return rows.map((page) => ({ page, depth: 0, childCount: 0, expanded: true }));
  const ids = new Set(rows.map((row) => row.id));
  const visit = (page: Page, depth: number): HierarchyRow[] => {
    const children = rows.filter((row) => row.subItemOf === page.id),
      expanded = !view.collapsedItems?.includes(page.id);
    return [
      { page, depth, childCount: children.length, expanded },
      ...(expanded ? children.flatMap((child) => visit(child, depth + 1)) : []),
    ];
  };
  return rows.filter((page) => !page.subItemOf || !ids.has(page.subItemOf)).flatMap((page) => visit(page, 0));
}

export function executeStructureCommand(workspace: Workspace, method: string, params: CommandParams) {
  if (
    ![
      'database.configure',
      'subitem.create',
      'subitem.set',
      'subitem.children',
      'dependency.set',
      'dependency.add',
      'dependency.remove',
      'dependency.list',
      'relation.set',
    ].includes(method)
  )
    return;
  const result = (data: any, changed = false) => ({ workspace, result: data, changed });
  if (method === 'database.configure') {
    workspace = configureDatabase(workspace, params.databaseId, {
      ...params.changes,
      ...(params.subItems === undefined ? {} : { subItems: params.subItems }),
      ...(params.dependencies === undefined ? {} : { dependencies: params.dependencies }),
    });
    return result(requireDatabase(workspace, params.databaseId), true);
  }
  if (method === 'subitem.create') {
    const parent = record(workspace, params.pageId);
    requireEditable(parent);
    workspace = configureDatabase(workspace, parent.parentId!, { subItems: true });
    const created = createTemplateRecord(
      workspace,
      parent.parentId!,
      {
        ...(params.title === undefined ? {} : { title: params.title }),
        color: requiredPageColor(params),
        ...(params.textColor === undefined ? {} : { textColor: params.textColor }),
        values: params.values || {},
        subItemOf: parent.id,
      },
      params.templateId === undefined && isTemplatePage(parent, workspace.pages) ? 'none' : params.templateId,
    );
    workspace = created.workspace;
    return result(created.page, true);
  }
  if (method === 'subitem.set') {
    workspace = setSystemRelation(
      workspace,
      params.pageId,
      'parentItem',
      params.parentId && params.parentId !== 'none' ? [params.parentId] : [],
    );
    return result(requirePage(workspace, params.pageId), true);
  }
  if (method === 'subitem.children') {
    const page = record(workspace, params.pageId);
    const ids = params.recursive
      ? descendants(workspace.pages, page.id)
      : new Set(workspace.pages.filter((value) => value.subItemOf === page.id).map((page) => page.id));
    return result(
      workspace.pages.filter(
        (value) =>
          value.id !== page.id && value.parentId === page.parentId && ids.has(value.id) && !value.trashedAt,
      ),
    );
  }
  if (method === 'dependency.set') {
    if (!Array.isArray(params.blockedBy))
      throw new CommandError('INVALID_ARGUMENT', 'blockedBy 必须是记录 ID 数组');
    workspace = setSystemRelation(workspace, params.pageId, 'blockedBy', params.blockedBy);
    return result(requirePage(workspace, params.pageId), true);
  }
  if (method === 'dependency.add' || method === 'dependency.remove') {
    const page = record(workspace, params.pageId);
    const ids =
      method === 'dependency.add'
        ? [...new Set([...(page.blockedBy || []), params.predecessorId])]
        : (page.blockedBy || []).filter((id) => id !== params.predecessorId);
    workspace = setSystemRelation(workspace, page.id, 'blockedBy', ids);
    return result(requirePage(workspace, page.id), true);
  }
  if (method === 'dependency.list') {
    const database = requireDatabase(workspace, params.databaseId);
    return result(
      workspace.pages
        .filter(
          (page) =>
            page.parentId === database.id && !page.trashedAt && (!params.pageId || page.id === params.pageId),
        )
        .flatMap((page) =>
          (page.blockedBy || [])
            .filter((id) => workspace.pages.some((page) => page.id === id && !page.trashedAt))
            .map((id) => ({ from: id, to: page.id })),
        ),
    );
  }
  if (method === 'relation.set') {
    const page = record(workspace, params.pageId),
      database = requireDatabase(workspace, page.parentId!);
    const column = database.database.columns.find((column) => column.id === params.propertyId);
    if (!column || column.type !== 'relation') throw new CommandError('NOT_A_RELATION', '目标属性不是关联');
    if (!Array.isArray(params.ids)) throw new CommandError('INVALID_ARGUMENT', 'ids 必须是数组');
    if (column.system && !page.templateFor)
      workspace = setSystemRelation(workspace, page.id, column.system, params.ids);
    else {
      requireEditable(page);
      for (const id of params.ids)
        if (requirePage(workspace, id).parentId !== column.relationTo)
          throw new CommandError('INVALID_RELATION', '记录不属于目标数据库');
      workspace = {
        ...workspace,
        pages: workspace.pages.map((value) =>
          value.id === page.id
            ? {
                ...page,
                values: { ...page.values, [column.id]: [...new Set(params.ids)] as string[] },
                updatedAt: Date.now(),
              }
            : value,
        ),
      };
    }
    return result(requirePage(workspace, page.id), true);
  }
}
