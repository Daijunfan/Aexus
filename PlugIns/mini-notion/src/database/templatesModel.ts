import { requiredPageColor, pageColorChanges } from '../core/appearance.ts';
import type { Database, DatabaseView, Page, Workspace } from '../types.ts';
import { duplicatePage, makePage, trashPage } from '../model.ts';
import { activeView, getViews, updateView } from './model.ts';
import { requireDatabase, requireEditable, requirePage } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';
import { normalizeBlocks } from '../core/blocks.ts';
import type { CommandParams } from '../core/protocol.ts';
import { applySystemValues, relationIds } from './relations.ts';
import { mapLinkedViews } from './linked.ts';

export function databaseTemplates(workspace: Workspace, databaseId: string) {
  return workspace.pages.filter(
    (page) => page.templateFor === databaseId && page.parentId === databaseId && !page.trashedAt,
  );
}
export function defaultTemplateId(database: Database, view: DatabaseView = activeView(database)) {
  return view.defaultTemplateId === undefined ? database.defaultTemplateId || null : view.defaultTemplateId;
}
function requireTemplate(workspace: Workspace, id: string) {
  const page = requirePage(workspace, id);
  if (!page.templateFor || page.parentId !== page.templateFor)
    throw new CommandError('NOT_A_TEMPLATE', '目标页面不是数据库模板');
  requireDatabase(workspace, page.templateFor);
  return page;
}
export function createTemplateRecord(
  workspace: Workspace,
  databaseId: string,
  overrides: Partial<Page> = {},
  selected?: string | null,
  viewId?: string,
) {
  const database = requireDatabase(workspace, databaseId);
  requireEditable(database);
  const view = viewId
    ? getViews(database.database).find((view) => view.id === viewId)
    : activeView(database.database);
  if (viewId && !view) throw new CommandError('VIEW_NOT_FOUND', '未找到视图');
  const id = selected === undefined ? defaultTemplateId(database.database, view) : selected;
  if (!id || id === 'none') {
    const page = makePage({ ...overrides, parentId: databaseId });
    const next = applySystemValues({ ...workspace, pages: [...workspace.pages, page] }, page.id, page.values);
    return { workspace: next, page: next.pages.find((value) => value.id === page.id)! };
  }
  const template = requireTemplate(workspace, id);
  if (template.templateFor !== databaseId)
    throw new CommandError('TEMPLATE_DATABASE_MISMATCH', '模板只能用于所属数据库');
  const copy = duplicatePage(workspace, template.id, overrides.id);
  const original = copy.workspace.pages.find((page) => page.id === copy.id)!;
  const page = {
    ...original,
    ...overrides,
    id: original.id,
    parentId: databaseId,
    templateFor: undefined,
    repeat: undefined,
    title: overrides.title ?? template.title,
    values: { ...template.values, ...overrides.values },
    blocks: overrides.blocks ? normalizeBlocks(overrides.blocks) : original.blocks,
    locked: false,
  };
  for (const column of database.database.columns)
    if (
      (column.system === 'parentItem' && overrides.subItemOf !== undefined) ||
      (column.system === 'blockedBy' && overrides.blockedBy !== undefined)
    )
      delete page.values[column.id];
  const next = applySystemValues(
    { ...copy.workspace, pages: copy.workspace.pages.map((value) => (value.id === page.id ? page : value)) },
    page.id,
    page.values,
  );
  return { workspace: next, page: next.pages.find((value) => value.id === page.id)! };
}

export function executeTemplateCommand(workspace: Workspace, method: string, params: CommandParams) {
  if (!method.startsWith('template.')) return;
  const result = (data: any, changed = false) => ({ workspace, result: data, changed });
  const replace = (page: Page) => {
    workspace = {
      ...workspace,
      pages: workspace.pages.map((value) =>
        value.id === page.id ? { ...page, updatedAt: Date.now() } : value,
      ),
    };
  };
  if (method === 'template.list') {
    if (!params.databaseId) return;
    const database = requireDatabase(workspace, params.databaseId);
    return result(
      databaseTemplates(workspace, database.id).map((page) => ({
        id: page.id,
        title: page.title,
        name: page.title,
        icon: page.icon,
        color: page.color,
        textColor: page.textColor,
        databaseId: database.id,
        default: database.database.defaultTemplateId === page.id,
        values: page.values,
      })),
    );
  }
  if (method === 'template.create') {
    const database = requireDatabase(workspace, params.databaseId);
    requireEditable(database);
    let page: Page;
    if (params.fromPageId) {
      const source = requirePage(workspace, params.fromPageId);
      if (source.id === database.id)
        throw new CommandError('INVALID_TEMPLATE', '不能把数据库自身保存为其模板');
      const originalCount = workspace.pages.length;
      const copy = duplicatePage(workspace, source.id);
      workspace = copy.workspace;
      workspace = {
        ...workspace,
        pages: workspace.pages.map((value, index) =>
          index >= originalCount && value.subItemOf && value.parentId === source.parentId
            ? { ...value, parentId: database.id }
            : value,
        ),
      };
      page = workspace.pages.find((page) => page.id === copy.id)!;
      page = {
        ...page,
        title: params.title || source.title || '新模板',
        color: params.color === undefined ? source.color : requiredPageColor(params),
        textColor: params.textColor ?? source.textColor,
        parentId: database.id,
        templateFor: database.id,
        subItemOf: undefined,
        blockedBy: undefined,
        locked: false,
      };
      if (source.parentId === database.id)
        for (const column of database.database.columns)
          if (column.system === 'parentItem' || column.system === 'blockedBy')
            page.values[column.id] = relationIds(source, column, workspace.pages);
      replace(page);
    } else {
      page = makePage({
        color: requiredPageColor(params),
        textColor: params.textColor,
        parentId: database.id,
        templateFor: database.id,
        title: params.title || '新模板',
        icon: params.icon || '',
        blocks: params.blocks || [{ type: 'paragraph', content: '' }],
        values: params.values || {},
      });
      workspace = { ...workspace, pages: [...workspace.pages, page] };
    }
    return result(page, true);
  }
  if (method === 'template.default') {
    const page = requireDatabase(workspace, params.databaseId);
    requireEditable(page);
    const id = params.templateId && params.templateId !== 'none' ? String(params.templateId) : null;
    if (id && requireTemplate(workspace, id).templateFor !== page.id)
      throw new CommandError('TEMPLATE_DATABASE_MISMATCH', '请选择此数据库的模板');
    let database = page.database;
    if (params.viewId) {
      if (!getViews(database).some((view) => view.id === params.viewId))
        throw new CommandError('VIEW_NOT_FOUND', '未找到视图');
      database = updateView(database, params.viewId, { defaultTemplateId: id });
    } else database = { ...database, defaultTemplateId: id };
    replace({ ...page, database });
    return result({ databaseId: page.id, viewId: params.viewId || null, templateId: id }, true);
  }
  if (
    method === 'template.use' &&
    !workspace.pages.some((page) => page.id === params.templateId && page.templateFor)
  )
    return;
  if (
    ![
      'template.get',
      'template.update',
      'template.duplicate',
      'template.delete',
      'template.use',
      'template.apply',
    ].includes(method)
  )
    return;
  const template = requireTemplate(workspace, params.templateId);
  if (method === 'template.get') return result(template);
  if (method === 'template.use') {
    const created = createTemplateRecord(
      workspace,
      template.templateFor!,
      {
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(params.color === undefined ? {} : { color: requiredPageColor(params) }),
        ...(params.textColor === undefined ? {} : { textColor: params.textColor }),
        ...(params.values ? { values: params.values } : {}),
      },
      template.id,
    );
    workspace = created.workspace;
    return result(created.page, true);
  }
  requireEditable(template);
  if (method === 'template.update') {
    const changes = pageColorChanges({
      ...params.changes,
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.values ? { values: { ...template.values, ...params.values } } : {}),
      ...(params.blocks ? { blocks: normalizeBlocks(params.blocks) } : {}),
    });
    const next = {
      ...template,
      ...changes,
      id: template.id,
      parentId: template.parentId,
      templateFor: template.templateFor,
    };
    replace(next);
    return result(next, true);
  }
  if (method === 'template.duplicate') {
    const copy = duplicatePage(workspace, template.id);
    workspace = copy.workspace;
    return result(
      workspace.pages.find((page) => page.id === copy.id),
      true,
    );
  }
  if (method === 'template.delete') {
    workspace = trashPage(workspace, template.id);
    const owner = requireDatabase(workspace, template.templateFor!);
    replace({
      ...owner,
      database: {
        ...owner.database,
        defaultTemplateId:
          owner.database.defaultTemplateId === template.id ? null : owner.database.defaultTemplateId,
        views: getViews(owner.database).map((view) =>
          view.defaultTemplateId === template.id ? { ...view, defaultTemplateId: null } : view,
        ),
      },
    });
    workspace = mapLinkedViews(workspace, owner.id, (view) =>
      view.defaultTemplateId === template.id ? { ...view, defaultTemplateId: null } : view,
    );
    return result({ trashed: template.id }, true);
  }
  if (method === 'template.apply') {
    const page = requirePage(workspace, params.pageId);
    requireEditable(page);
    if (page.parentId !== template.templateFor || page.templateFor)
      throw new CommandError('TEMPLATE_DATABASE_MISMATCH', '模板只能应用到所属数据库的记录');
    if (params.mode && !['append', 'replace'].includes(params.mode))
      throw new CommandError('INVALID_ARGUMENT', 'mode 必须是 append 或 replace');
    const existingPages = workspace.pages;
    const existingIds = new Set(existingPages.map((page) => page.id));
    const instantiated = createTemplateRecord(
      { ...workspace, pages: workspace.pages.filter((value) => value.id !== page.id) },
      page.parentId!,
      { id: page.id },
      template.id,
    );
    const created = instantiated.page;
    const prefix =
      params.mode === 'replace' ||
      page.blocks.every((block) => block.type === 'paragraph' && (!block.content || !block.content.length))
        ? []
        : page.blocks;
    const values = {
      ...created.values,
      ...Object.fromEntries(
        Object.entries(page.values).filter(
          ([, value]) => value !== '' && !(Array.isArray(value) && !value.length),
        ),
      ),
    };
    workspace = {
      ...workspace,
      pages: [
        ...existingPages.map(
          (value) => instantiated.workspace.pages.find((item) => item.id === value.id) || value,
        ),
        ...instantiated.workspace.pages.filter((value) => !existingIds.has(value.id)),
      ],
    };
    replace({
      ...page,
      title: page.title || template.title,
      icon: page.icon || template.icon,
      cover: page.cover || template.cover,
      database: created.database || page.database,
      subItemOf: page.subItemOf || created.subItemOf,
      blockedBy: page.blockedBy?.length ? page.blockedBy : created.blockedBy,
      values,
      blocks: [...prefix, ...created.blocks],
    });
    return result(requirePage(workspace, page.id), true);
  }
}
