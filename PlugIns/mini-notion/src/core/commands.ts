import { agentGuide } from './agentGuide';
import { isSelectProperty, isReadOnlyProperty, isDateProperty } from '../database/propertySchema.ts';
import type { Database, DatabaseView, JsonBlock, Page, Property, ViewType, Workspace } from '../types.ts';
import {
  ancestors,
  defaultDatabase,
  descendants,
  duplicatePage,
  makePage,
  movePage,
  plainText,
  readProperty,
  restorePage,
  searchPages,
  trashPage,
} from '../model.ts';
import { createWorkspace, templates, filterTemplates } from '../seed.ts';
import {
  activeView,
  aggregateRows,
  getViews,
  groupRows,
  newView,
  queryRows,
  selectView,
  updateView,
  viewNames,
  visibleColumns,
  removeViewProperty,
} from '../database/model.ts';
import {
  dateParts,
  dateEpoch,
  dateWall,
  hasTime,
  makeDateValue,
  validateDateValue,
} from '../database/dateValue.ts';
import { computeProperty } from '../database/propertiesModel.ts';
import {
  navigateViewDate,
  isHourlyPlan,
  planModes,
  parseDay,
  planProjection,
  viewPeriod,
  scheduleFields,
  scheduledRange,
  calendarWeeks,
  moveScheduledRecord,
  resizeScheduledRecord,
  scheduledTimes,
} from '../database/dates.ts';
import { timeGridProjection } from '../database/timeGrid.ts';
import { localTimeZone } from '../database/dateValue.ts';
import { formulaFunctions } from '../database/formula.ts';
import { applyWorkspacePatch, type WorkspacePatch } from './patch.ts';
import {
  blockTypes,
  blockFields,
  inlineContentTypes,
  deleteBlocks,
  flattenBlocks,
  formatBlock,
  getBlock,
  insertBlocks,
  normalizeBlocks,
  selectedBlocks,
  updateBlock,
  validateBlocks,
} from './blocks.ts';
import { isSpaceRoot, normalizeWorkspace } from './normalize.ts';
import { CommandError, requiredString } from './errors.ts';
import { commands } from './catalog.ts';
import { pageLink } from './links.ts';
import { searchMatch } from './search.ts';
import { iconSchema } from './icons.ts';
import { overviewProjection } from './overview.ts';
import { viewFields, validateViewFields } from './viewSchema.ts';
import { listAgentContext } from './agentContext.ts';
import type { CommandParams } from './protocol.ts';
import { requirePage, requireDatabase, requireEditable } from './access.ts';
export { requirePage, requireDatabase } from './access.ts';
import { createTemplateRecord, executeTemplateCommand } from '../database/templatesModel.ts';
import { isTemplatePage, isInternalPage } from '../model.ts';
import { executeStructureCommand, configureDatabase, hierarchyRows } from '../database/structure.ts';
import { applySystemValues } from '../database/relations.ts';
import { appearanceSchema, validateAppearance, requiredPageColor, pageColorChanges } from './appearance.ts';
import { mapLinkedViews } from '../database/linked.ts';
import { executeActionCommand } from '../actions/commands.ts';
import { actionTypes, filterProperties } from '../actions/engine.ts';
import { executeSchedulingCommand, clearScheduleProperty } from '../scheduling/commands.ts';
import { executeCommentCommand } from '../content/comments.ts';
import { executeSpaceCommand, spacePagesRemoved } from './spaces.ts';
import { executeSyncedCommand } from '../content/synced.ts';
import { syncedReferences } from '../content/references.ts';
import { finalizeProperties, updateOptionValues } from '../database/propertyData.ts';
import { propertyTypes, normalizeProperty, statusGroupOrder } from '../database/propertySchema.ts';
import { executePersonCommand } from '../database/people.ts';
import { renameOptionReferences } from '../database/optionReferences.ts';
export { propertyTypes } from '../database/propertySchema.ts';

export type Execution = { workspace: Workspace | null; result: any; changed: boolean };
export function pageSummary(page: Page) {
  return {
    id: page.id,
    title: page.title,
    icon: page.icon,
    color: page.color,
    textColor: page.textColor,
    parentId: page.parentId,
    subItemOf: page.subItemOf || null,
    blockedBy: page.blockedBy || [],
    templateFor: page.templateFor || null,
    syncedSource: !!page.syncedSource,
    database: !!page.database,
    favorite: page.favorite,
    trashedAt: page.trashedAt,
    updatedAt: page.updatedAt,
    blockCount: flattenBlocks(page.blocks).length,
    ...(page.sourceFile ? {sourceFile:page.sourceFile} : {}),
  };
}

function requireView(page: Page, id?: string) {
  const view = id ? getViews(page.database!).find((view) => view.id === id) : activeView(page.database!);
  if (!view) throw new CommandError('VIEW_NOT_FOUND', `未找到视图 ${id}`);
  return view;
}
const parentId = (id: unknown) =>
  id === undefined || id === null || id === 'root' || id === '' ? null : String(id);
function checkParent(workspace: Workspace, id: string | null) {
  if (id) requirePage(workspace, id);
}
function pick(source: CommandParams, fields: string[]): any {
  return Object.fromEntries(
    fields.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]]),
  );
}
function replacePage(workspace: Workspace, page: Page): Workspace {
  return {
    ...workspace,
    pages: workspace.pages.map((value) =>
      value.id === page.id ? { ...page, updatedAt: Date.now() } : value,
    ),
  };
}

export function viewProjection(
  page: Page,
  view: DatabaseView,
  workspace: Workspace,
  params: CommandParams = {},
) {
  let rows = queryRows(page, view, workspace.pages, params.query || '');
  const fields = scheduleFields(page, view);
  const dateProperty = fields.start;
  if ((params.from && !parseDay(params.from)) || (params.to && !parseDay(params.to)))
    throw new CommandError('INVALID_DATE', '日期范围需要 YYYY-MM-DD');
  if (params.from || params.to)
    rows = rows.filter((row) => {
      const range = scheduledRange(
        row,
        dateProperty,
        fields.end,
        isHourlyPlan(view) ? view.timeZone || localTimeZone() : undefined,
      );
      return (
        range.start && (!params.from || range.end >= params.from) && (!params.to || range.start <= params.to)
      );
    });
  const columns = visibleColumns(page.database!, view);
  const records = rows.map((row) => ({
    ...pageSummary(row),
    values: Object.fromEntries(
      columns.map((column) => [column.id, readProperty(row, column, workspace.pages)]),
    ),
  }));
  const result: Record<string, unknown> = {
    databaseId: page.id,
    name: page.title,
    view,
    columns,
    count: rows.length,
    records,
  };
  const calculations = (items: Page[]) =>
    Object.fromEntries(
      Object.entries(view.calculations || {}).map(([id, operation]) => [
        id,
        { operation, value: aggregateRows(items, id, operation, page.database!, workspace.pages) },
      ]),
    );
  result.calculations = calculations(rows);
  if (page.database!.subItems)
    result.hierarchy = hierarchyRows(rows, view).map((item) => ({
      id: item.page.id,
      parentId: item.page.subItemOf || null,
      depth: item.depth,
      childCount: item.childCount,
      expanded: item.expanded,
    }));
  if (page.database!.dependencies?.enabled)
    result.dependencies = rows.flatMap((row) =>
      (row.blockedBy || []).map((id) => ({
        from: id,
        to: row.id,
        fromTitle: workspace.pages.find((page) => page.id === id)?.title || id,
        toTitle: row.title,
      })),
    );
  if (view.type === 'board' || view.groupBy)
    result.groups = groupRows(
      rows,
      view.groupBy || page.database!.columns.find((column) => isSelectProperty(column))?.id,
      page.database!,
      workspace.pages,
      view,
    ).map((group) => ({
      key: group.key,
      name: group.label,
      records: group.rows.map((row) => row.id),
      calculations: calculations(group.rows),
    }));
  if (['calendar', 'timeline', 'plan'].includes(view.type)) {
    const period = viewPeriod(view);
    result.period = { from: period.from, to: period.to };
    if (view.type === 'plan') {
      const plan = planProjection(page, view, rows);
      result.days = plan.days;
      result.unscheduled = plan.unscheduled;
      result.overdue = plan.overdue;
      result.completed = plan.completed;
      result.records = records.filter((record) => plan.rows.some((row) => row.id === record.id));
      result.count = plan.rows.length;
      if (isHourlyPlan(view)) {
        const timeGrid = timeGridProjection(page, view, plan.rows);
        result.timeGrid = timeGrid;
        result.days = timeGrid.days.map((day) => ({
          date: day.date,
          records: [...day.allDay, ...day.events.map((event) => event.id)],
        }));
      }
    }
    if (view.type === 'calendar') {
      result.weeks = calendarWeeks(page, view, rows);
      result.days = period.dates.map((date) => ({
        date,
        records: rows
          .filter((row) => {
            const range = scheduledRange(
              row,
              dateProperty,
              fields.end,
              isHourlyPlan(view) ? view.timeZone || localTimeZone() : undefined,
            );
            return range.start && range.start <= date && range.end >= date;
          })
          .map((row) => row.id),
      }));
      result.unscheduled = rows
        .filter((row) => !scheduledRange(row, dateProperty).start)
        .map((row) => row.id);
    }
    result.dateProperty = dateProperty?.id;
    result.endProperty = fields.end?.id || null;
    result.schedule = rows.map((row) => ({
      id: row.id,
      title: row.title,
      ...scheduledTimes(row, dateProperty, fields.end),
    }));
  }
  if (view.type === 'chart')
    result.series = groupRows(
      rows,
      view.chartGroup || page.database!.columns.find((column) => isSelectProperty(column))?.id || 'title',
      page.database!,
      workspace.pages,
      { ...view, hideEmptyGroups: true },
    ).map((group) => ({
      name: group.label,
      value: aggregateRows(
        group.rows,
        view.chartValue || 'title',
        view.chartAggregation || 'count',
        page.database!,
        workspace.pages,
      ),
      records: group.rows.map((row) => row.id),
    }));
  if (view.type === 'feed') result.entries = rows.map((row) => ({ ...pageSummary(row), blocks: row.blocks }));
  if (view.type === 'form')
    result.form = {
      title: view.name,
      description: view.formDescription || '',
      fields: [
        { id: 'title', name: '名称', type: 'text', required: true },
        ...columns
          .filter((column) => !isReadOnlyProperty(column) && column.type !== 'relation')
          .map((column) => ({ ...column, required: !!view.formRequired?.includes(column.id) })),
      ],
      submitLabel: view.formSubmitLabel || '提交',
    };
  return result;
}

export function executeWorkspaceCommand(
  input: Workspace | null,
  method: string,
  params: CommandParams = {},
  context: { folderMode?: boolean; folderRootId?: string } = {},
): Execution {
  const operation = executeCommand(input, method, params, context);
  if (!operation.changed || !operation.workspace) return operation;
  if (!context.folderMode && !['workspace.replace', 'history.restore'].includes(method))
    for (const id of Object.keys(input?.spaces || {})) {
      const page = operation.workspace.pages.find((page) => page.id === id);
      if (page && !isSpaceRoot(page))
        throw new CommandError('IMMUTABLE_SPACE', '主页面固定绑定空间，不能移动为子页面或移除空间绑定');
      if (page && operation.workspace.spaces?.[id]?.engine !== input!.spaces![id].engine)
        throw new CommandError('IMMUTABLE_ENGINE', '空间与 Agent 引擎固定绑定');
    }
  const workspace = normalizeWorkspace(finalizeProperties(input, operation.workspace, method), false, input);
  let result =
    operation.result?.id && Array.isArray(operation.result?.blocks)
      ? workspace.pages.find((page) => page.id === operation.result.id) || operation.result
      : operation.result;
  if (['property.add', 'property.update'].includes(method))
    result =
      workspace.pages
        .find((page) => page.id === params.databaseId)
        ?.database?.columns.find((column) => column.id === result.id) || result;
  return { ...operation, workspace, result };
}
function executeCommand(input: Workspace | null, method: string, params: CommandParams = {}, context: { folderMode?: boolean; folderRootId?: string } = {}): Execution {
  if (context.folderRootId && ['page.create','database.create','page.move'].includes(method) && (!params.parentId || params.parentId === 'root') && params.pageId !== context.folderRootId)
    params = {...params, parentId: context.folderRootId};
  const dispatch = (state: Workspace | null, name: string, data: CommandParams = {}) => executeWorkspaceCommand(state, name, data, context);
  const finish = (workspace: Workspace | null, result: any, changed = false): Execution => ({
    workspace,
    result,
    changed,
  });
  if (method === 'guide') return finish(input, agentGuide(params.topic));
  if (method === 'block.validate') {
    const blocks = normalizeBlocks(params.blocks);
    validateBlocks(blocks);
    return finish(input, { valid: true, blockCount: flattenBlocks(blocks).length, blocks });
  }
  if (method === 'schema') {
    const definition = params.method
      ? commands.find((command) => command.method === params.method)
      : undefined;
    if (params.method && !definition) throw new CommandError('METHOD_NOT_FOUND', `未知方法 ${params.method}`);
    return finish(
      input,
      (definition ? { ...definition, ...(definition.method.startsWith('block.') ? { blockTypes, blockFields, inlineContentTypes } : {}), ...(['view.create', 'view.update'].includes(definition.method) ? { fields: viewFields } : {}), ...(['page.create', 'database.create', 'record.create', 'page.update', 'settings.set', 'view.update', 'block.update'].includes(definition.method) && !params.compact ? { appearance: appearanceSchema, icons: iconSchema } : {}) } : {
        apiVersion: 1,
        commands,
        blockTypes,
        blockFields,
        inlineContentTypes,
        propertyTypes,
        viewTypes: viewNames,
        viewFields,
        ...(!params.compact ? { appearance: appearanceSchema, icons: iconSchema } : {}),
        planModes,
        formulaFunctions,
        actionTypes,
      }),
    );
  }
  if (method === 'workspace.get') return finish(input, input);
  if (method === 'workspace.init') {
    if (input) throw new CommandError('ALREADY_INITIALIZED', '工作空间已存在，不会覆盖现有笔记');
    const workspace = createWorkspace();
    if (params.empty) {
      workspace.pages = [];
      workspace.expanded = [];
      workspace.recent = [];
      workspace.activePageId = null;
    }
    if (params.name) workspace.name = String(params.name);
    return finish(
      normalizeWorkspace(workspace),
      { name: workspace.name, pages: workspace.pages.length },
      true,
    );
  }
  if (!input && method !== 'workspace.replace')
    throw new CommandError('NOT_INITIALIZED', '工作空间尚未初始化，请执行 workspace init');
  let workspace = input!;
  const result = (data: any, changed = false) => finish(workspace, data, changed);
  const recordValues = (parent: string | null, values: Page['values']) => {
    const columns = workspace.pages.find((page) => page.id === parent)?.database?.columns;
    if (!columns) return values;
    const resolved: Page['values'] = {};
    for (const [key, value] of Object.entries(values)) {
      const byId = columns.find((column) => column.id === key);
      const matches = byId ? [byId] : columns.filter((column) => column.name === key);
      if (matches.length !== 1)
        throw new CommandError('INVALID_PROPERTY', `属性「${key}」不存在或名称不唯一，请使用 property.list 返回的属性 ID`);
      const id = matches[0].id;
      if (Object.hasOwn(resolved, id))
        throw new CommandError('INVALID_PROPERTY', `属性「${key}」被重复赋值，请只使用属性 ID 或名称之一`);
      resolved[id] = value;
    }
    return resolved;
  };
  const savePage = (page: Page) => {
    workspace = replacePage(workspace, page);
    workspace = applySystemValues(workspace, page.id, page.values);
    return result(
      workspace.pages.find((value) => value.id === page.id),
      true,
    );
  };
  if (
    params.ownerPageId &&
    params.blockId &&
    (method.startsWith('view.') || ['record.list', 'record.create', 'form.submit'].includes(method))
  ) {
    const owner = requirePage(workspace, params.ownerPageId),
      block = getBlock(owner.blocks, params.blockId);
    if (block.type !== 'databaseView' || !block.props?.linked || block.props.databaseId !== params.databaseId)
      throw new CommandError('INVALID_LINKED_VIEW', '目标不是此数据库的关联视图');
    const source = requireDatabase(workspace, params.databaseId);
    const state = block.props.viewState
      ? JSON.parse(String(block.props.viewState))
      : { views: [newView('table')] };
    const shadow = {
      ...workspace,
      pages: workspace.pages.map((page) =>
        page.id === source.id ? { ...page, database: { ...page.database!, ...state } } : page,
      ),
    };
    const { ownerPageId, blockId, ...options } = params;
    const operation = dispatch(shadow, method, options);
    if (!operation.changed) return result(operation.result);
    const database = operation.workspace!.pages.find((page) => page.id === source.id)!.database!;
    workspace = {
      ...operation.workspace!,
      pages: operation.workspace!.pages.map((page) => (page.id === source.id ? source : page)),
    };
    if (method.startsWith('view.')) {
      requireEditable(owner);
      const viewState = JSON.stringify({
        views: getViews(database),
        activeViewId: activeView(database).id,
        view: database.view,
      });
      workspace = replacePage(workspace, {
        ...owner,
        blocks: updateBlock(owner.blocks, block.id!, { props: { ...block.props, viewState } }),
      });
    }
    return result(operation.result, true);
  }
  if (method === 'workspace.replace') {
    if (input && !params.confirm)
      throw new CommandError('CONFIRMATION_REQUIRED', '替换工作空间需要 confirm=true');
    if (input && params.revision !== (input.revision || 0))
      throw new CommandError('CONFLICT', '工作空间版本已发生变化');
    if (!params.workspace || !Array.isArray(params.workspace.pages))
      throw new CommandError('INVALID_WORKSPACE', '缺少有效的工作空间');
    workspace = normalizeWorkspace(params.workspace);
    return result({ replaced: true }, true);
  }
  if (method === 'workspace.patch') {
    const patch = structuredClone(params.patch) as WorkspacePatch;
    if (patch.meta) {
      delete patch.meta.before.uniqueIds;
      delete patch.meta.after.uniqueIds;
    }
    workspace = applyWorkspacePatch(workspace, patch, !!params.force);
    for (const change of patch.pages)
      if (change.after && !input!.pages.some((page) => page.id === change.id)) requiredPageColor(change.after);
    for (const change of (params.patch as WorkspacePatch).pages)
      if (change.after && workspace.pages.some((page) => page.id === change.id))
        workspace = applySystemValues(workspace, change.id, change.after.values);
    return result({ applied: params.patch?.id }, true);
  }
  if (method === 'workspace.rename') {
    workspace = { ...workspace, name: requiredString(params.name, 'name') };
    return result(workspace.name, true);
  }
  if (method === 'settings.get') return result(workspace.settings);
  if (method === 'agent.context') return result(listAgentContext(workspace, params.pageId, params.query || ''));
  if (method === 'overview.get' || method === 'overview.render') return result(overviewProjection(workspace, params));
  if (method === 'overview.configure') {
    workspace = { ...workspace, settings: { ...workspace.settings, overview: { ...workspace.settings.overview, ...params.changes } } };
    return result(overviewProjection(workspace), true);
  }
  if (method === 'settings.set') {
    const changes = { ...params.changes, ...pick(params, ['theme']) };
    if (changes.theme && !['light', 'dark', 'system'].includes(changes.theme))
      throw new CommandError('INVALID_THEME', 'theme 必须是 light、dark 或 system');
    workspace = { ...workspace, settings: { ...workspace.settings, ...changes } };
    return result(workspace.settings, true);
  }
  if (method === 'search')
    return result(
      searchPages(workspace.pages, String(params.query || ''), params)
        .slice(0, params.limit || 100)
        .map((page) => ({ ...pageSummary(page), ...searchMatch(page, String(params.query || ''), workspace.pages), ...(params.titleOnly ? { blockId: undefined } : {}) })),
    );
  const syncedOperation = executeSyncedCommand(workspace, method, params);
  if (syncedOperation) return syncedOperation;
  const personOperation = executePersonCommand(workspace, method, params);
  if (personOperation) return personOperation;
  const actionOperation = executeActionCommand(workspace, method, params, dispatch);
  if (actionOperation) return actionOperation;
  const schedulingOperation = executeSchedulingCommand(workspace, method, params);
  if (schedulingOperation) return schedulingOperation;
  const commentOperation = executeCommentCommand(workspace, method, params);
  if (commentOperation) return commentOperation;
  const spaceOperation = executeSpaceCommand(workspace, method, params);
  if (spaceOperation)
    return finish(spaceOperation.workspace, spaceOperation.result, spaceOperation.workspace !== workspace);
  const structureOperation = executeStructureCommand(workspace, method, params);
  if (structureOperation) return structureOperation;
  const templateOperation = executeTemplateCommand(workspace, method, params);
  if (templateOperation) return templateOperation;
  if (method === 'template.list') return result(filterTemplates(String(params.query || ''), String(params.category || '')));
  if (method === 'template.use') {
    const template = templates.find((template) => template.id === params.templateId);
    if (!template) throw new CommandError('TEMPLATE_NOT_FOUND', '未找到模板');
    const parent = parentId(params.parentId);
    checkParent(workspace, parent);
    const page = makePage({
      title: params.title || template.name,
      icon: template.icon,
      ...pick(template, ['appearance', 'cover', 'font', 'fullWidth']),
      color: params.color === undefined ? template.color : requiredPageColor(params),
      textColor: params.textColor ?? template.textColor,
      parentId: parent,
      blocks: normalizeBlocks(structuredClone(template.blocks), true),
      ...(template.id === 'database' ? { database: defaultDatabase(), fullWidth: true } : {}),
    });
    workspace = { ...workspace, pages: [...workspace.pages, page] };
    return result(page, true);
  }
  if (method === 'page.list') {
    let pages = workspace.pages.filter(
      (page) =>
        (params.trash || !page.trashedAt) &&
        (params.internal ||
          (!page.syncedSource && (params.templates || !isTemplatePage(page, workspace.pages)))),
    );
    if (Object.hasOwn(params, 'parentId'))
      pages = pages.filter((page) => page.parentId === parentId(params.parentId));
    if (params.favorites) pages = pages.filter((page) => page.favorite);
    if (params.databases) pages = pages.filter((page) => page.database);
    return result(params.full ? pages : pages.map(pageSummary));
  }
  if (method === 'page.audit') {
    const root = requirePage(workspace, params.pageId);
    const children = new Map<string, Page[]>();
    for (const page of workspace.pages) if (page.parentId && !page.trashedAt) children.set(page.parentId, [...(children.get(page.parentId) || []), page]);
    const queue = [{ page: root, depth: 1 }], seen = new Set<string>();
    const pages: any[] = [], databases: any[] = [];
    for (let index = 0; index < queue.length; index++) {
      const { page, depth } = queue[index];
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      const nested = children.get(page.id) || [], characters = plainText(page.blocks).trim().length;
      pages.push({ id: page.id, title: page.title, parentId: page.parentId, depth, characters, blockCount: flattenBlocks(page.blocks).length, childCount: nested.length, database: !!page.database, native: !page.sourceFile });
      if (page.database) databases.push({ id: page.id, title: page.title, recordCount: nested.filter(item => !item.templateFor).length, views: getViews(page.database).map(view => ({ id: view.id, name: view.name, type: view.type })) });
      for (const child of nested) queue.push({ page: child, depth: depth + 1 });
    }
    return result({ rootId: root.id, pageCount: pages.length, maxDepth: pages.reduce((max, page) => Math.max(max, page.depth), 0), totalCharacters: pages.reduce((sum, page) => sum + page.characters, 0), emptyLeafPages: pages.filter(page => page.native && !page.database && !page.childCount && !page.characters).map(page => page.id), pages, databases });
  }
  if (method === 'page.tree') {
    const visit = (id: string | null): any[] =>
      workspace.pages
        .filter(
          (page) =>
            (page.subItemOf || page.parentId) === id &&
            (!context.folderMode || params.files || !page.sourceFile || page.sourceFile.kind === 'directory') &&
            (params.trash || !page.trashedAt) &&
            (params.internal ||
              (!page.syncedSource && (params.templates || !isTemplatePage(page, workspace.pages)))),
        )
        .map((page) => ({ ...pageSummary(page), children: visit(page.id) }));
    return result(visit(parentId(params.parentId)));
  }
  if (method === 'database.embed') {
    const owner = requirePage(workspace, params.pageId);
    requireEditable(owner);
    let source = params.databaseId ? requireDatabase(workspace, params.databaseId) : undefined;
    if (!source) {
      const created = dispatch(workspace, 'database.create', {
        title: params.title || '新数据库',
        parentId: owner.id,
        view: params.view || 'table',
        color: requiredPageColor(params),
      });
      workspace = created.workspace!;
      source = requireDatabase(workspace, created.result.id);
    }
    const view = newView(params.view || 'table');
    if (!viewNames[view.type]) throw new CommandError('INVALID_VIEW_TYPE', '视图类型无效');
    const linked = !!params.databaseId;
    const block = normalizeBlocks([
      {
        type: 'databaseView',
        props: {
          databaseId: source.id,
          title: source.title,
          linked,
          viewState: linked ? JSON.stringify({ views: [view], activeViewId: view.id, view: view.type }) : '',
        },
      },
    ])[0];
    workspace = replacePage(workspace, {
      ...owner,
      blocks: insertBlocks(owner.blocks, [block], {
        afterId: params.afterId,
        beforeId: params.beforeId,
        parentId: params.parentBlockId,
      }),
    });
    return result({ databaseId: source.id, ownerPageId: owner.id, block }, true);
  }
  if (method === 'page.create' || method === 'database.create' || method === 'record.create') {
    params = { ...pageColorChanges(params), color: requiredPageColor(params) };
    const parent =
      method === 'record.create'
        ? requireDatabase(workspace, params.databaseId).id
        : parentId(params.parentId);
    checkParent(workspace, parent);
    if (parent) requireEditable(requirePage(workspace, parent));
    if (params.values) params = { ...params, values: recordValues(parent, params.values) };
    let page = makePage({
      ...pick(params, ['id', 'title', 'icon', 'cover', 'blocks', 'values', 'favorite', 'fullWidth', 'appearance', 'color', 'textColor']),
      parentId: parent,
    });
    if (workspace.pages.some((value) => value.id === page.id))
      throw new CommandError('DUPLICATE_PAGE_ID', '页面 ID 已存在');
    if (method === 'database.create') {
      page.icon ||= '📋';
      page.fullWidth = true;
      page.database = defaultDatabase();
      if (params.columns)
        page.database.columns = params.columns.map((column: Property) => ({
          ...column,
          id: column.id || crypto.randomUUID(),
        }));
      if (params.view) {
        if (!viewNames[params.view as ViewType]) throw new CommandError('INVALID_VIEW_TYPE', '视图类型无效');
        const view = newView(params.view);
        page.database = { ...page.database, views: [view], activeViewId: view.id, view: view.type };
      }
    }
    if (
      method !== 'database.create' &&
      parent &&
      workspace.pages.find((value) => value.id === parent)?.database &&
      !params.templateFor
    ) {
      const overrides = {
        ...pick(params, ['title', 'icon', 'cover', 'blocks', 'values', 'favorite', 'fullWidth', 'appearance', 'color', 'textColor']),
        id: page.id,
      };
      const created = createTemplateRecord(workspace, parent, overrides, params.templateId, params.viewId);
      workspace = created.workspace;
      page = created.page;
    } else workspace = { ...workspace, pages: [...workspace.pages, page] };
    validateBlocks(page.blocks);
    return result(page, true);
  }
  if (method === 'page.get') {
    const page = requirePage(workspace, params.pageId, true);
    return result({ ...page, ancestors: ancestors(workspace.pages, page.id).map(pageSummary) });
  }
  if (method === 'page.update' || method === 'record.update') {
    const page = requirePage(workspace, params.pageId);
    const changes = pageColorChanges({
      ...params.changes,
      ...pick(params, ['title', 'icon', 'cover', 'font', 'fullWidth', 'smallText', 'locked', 'color', 'textColor']),
    });
    if (['createdAt', 'createdBy', 'editedBy', 'uniqueId'].some((key) => Object.hasOwn(changes, key)))
      throw new CommandError('READ_ONLY_PROPERTY', '创建时间、作者和编号由系统管理');
    if (
      page.locked &&
      changes.locked !== false &&
      Object.keys(changes).some((key) => ['title', 'blocks', 'values'].includes(key))
    )
      requireEditable(page);
    const valueParent = changes.parentId === undefined ? page.parentId : parentId(changes.parentId);
    if (changes.values) changes.values = recordValues(valueParent, changes.values);
    if (params.values) {
      requireEditable(page);
      changes.values = { ...(changes.values || page.values), ...recordValues(valueParent, params.values) };
    }
    if (changes.id && changes.id !== page.id) throw new CommandError('IMMUTABLE_ID', '不能修改页面 ID');
    if (changes.parentId !== undefined && changes.parentId !== page.parentId) {
      const parent = parentId(changes.parentId);
      if (parent && descendants(workspace.pages, page.id).has(parent))
        throw new CommandError('INVALID_MOVE', '不能形成循环页面层级');
      checkParent(workspace, parent);
      changes.parentId = parent;
    }
    if (changes.blocks) {
      changes.blocks = normalizeBlocks(changes.blocks);
      validateBlocks(changes.blocks);
    }
    return savePage({ ...page, ...changes, id: page.id });
  }
  if (method === 'record.schedule') {
    const page = requirePage(workspace, params.pageId);
    requireEditable(page);
    const database = requireDatabase(workspace, page.parentId);
    for (const id of [params.startProperty, params.endProperty].filter(Boolean))
      if (!database.database.columns.some((column) => column.id === id && isDateProperty(column)))
        throw new CommandError('INVALID_DATE_PROPERTY', '请选择有效的日期属性');
    const view = {
      ...requireView(database, params.viewId),
      ...(params.startProperty ? { calendarBy: params.startProperty } : {}),
      ...(params.endProperty !== undefined ? { timelineEnd: params.endProperty } : {}),
    };
    const fields = scheduleFields(database, view);
    if (!fields.start) throw new CommandError('NO_DATE_PROPERTY', '数据库没有可用日期属性');
    if (fields.start.type !== 'date' || (fields.end && fields.end.type !== 'date'))
      throw new CommandError('READ_ONLY_PROPERTY', '系统时间不可重新排期');
    const date = params.date === 'none' ? '' : requiredString(params.date, 'date');
    if (date && !parseDay(date)) throw new CommandError('INVALID_DATE', '日期需要 YYYY-MM-DD');
    let values = moveScheduledRecord(page, fields.start.id, fields.end?.id, date.slice(0, 10));
    const prior = dateParts(page.values[fields.start.id]);
    const zone = params.timeZone || prior?.timeZone;
    if (date && hasTime(date)) {
      const start = makeDateValue(date, undefined, zone);
      const old = scheduledTimes(page, fields.start.id, fields.end?.id);
      const duration = old.endTimestamp - old.startTimestamp;
      const end =
        params.end !== undefined
          ? params.end
          : Number.isFinite(duration) && (prior?.end || (fields.end && page.values[fields.end.id]))
            ? new Date(dateEpoch(start) + Math.max(0, duration)).toISOString()
            : undefined;
      values[fields.start.id] = makeDateValue(date, fields.end ? undefined : end, zone);
      if (fields.end && end !== undefined) values[fields.end.id] = makeDateValue(end, undefined, zone);
    } else if (params.end !== undefined) {
      if (params.end && (!parseDay(params.end) || !date || params.end.slice(0, 10) < date))
        throw new CommandError('INVALID_DATE_RANGE', '结束日期不能早于开始日期');
      values = resizeScheduledRecord({ ...page, values }, fields.start.id, fields.end?.id, params.end);
    }
    if (params.allDay && date) {
      const end = fields.end
        ? undefined
        : dateParts(values[fields.start.id])?.end
          ? dateWall(values[fields.start.id], 'end').slice(0, 10)
          : undefined;
      values[fields.start.id] = makeDateValue(dateWall(values[fields.start.id]).slice(0, 10), end);
      if (fields.end) values[fields.end.id] = dateWall(values[fields.end.id]).slice(0, 10);
    }
    validateDateValue(values[fields.start.id]);
    if (fields.end) {
      validateDateValue(values[fields.end.id]);
      if (values[fields.end.id] && dateEpoch(values[fields.end.id]) < dateEpoch(values[fields.start.id]))
        throw new CommandError('INVALID_DATE_RANGE', '结束日期不能早于开始日期');
    }
    return savePage({ ...page, values });
  }
  if (method === 'record.bulk') {
    if (!Array.isArray(params.ids) || !params.values)
      throw new CommandError('INVALID_ARGUMENT', '需要 ids 和 values');
    params.ids.forEach((id: string) => requireEditable(requirePage(workspace, id)));
    workspace = {
      ...workspace,
      pages: workspace.pages.map((page) =>
        params.ids.includes(page.id)
          ? { ...page, values: { ...page.values, ...recordValues(page.parentId, params.values) }, updatedAt: Date.now() }
          : page,
      ),
    };
    for (const id of params.ids)
      workspace = applySystemValues(workspace, id, requirePage(workspace, id).values);
    return result({ updated: params.ids.length }, true);
  }
  if (method === 'page.move') {
    const page = requirePage(workspace, params.pageId);
    const parent = parentId(params.parentId);
    if (page.templateFor && parent !== page.templateFor)
      throw new CommandError('TEMPLATE_MOVE', '模板属于固定数据库；可在目标数据库从此模板创建副本');
    checkParent(workspace, parent);
    if (parent && descendants(workspace.pages, page.id).has(parent))
      throw new CommandError('INVALID_MOVE', '不能把页面移动到自身或子页面内');
    const ids = descendants(workspace.pages, page.id);
    if (
      parent &&
      workspace.pages.find((value) => value.id === parent)?.database &&
      workspace.pages.some(
        (value) => ids.has(value.id) && value.subItemOf && value.parentId === page.parentId,
      )
    )
      workspace = configureDatabase(workspace, parent, { subItems: true });
    workspace = movePage(workspace, page.id, parent, params.beforeId);
    return result(pageSummary(requirePage(workspace, page.id)), true);
  }
  if (method === 'page.duplicate') {
    requirePage(workspace, params.pageId);
    const sourceSpace = workspace.spaces?.[params.pageId];
    const duplicate = duplicatePage(workspace, params.pageId);
    workspace = duplicate.workspace;
    if (sourceSpace)
      workspace = {
        ...workspace,
        spaces: {
          ...workspace.spaces,
          [duplicate.id]: {
            engine: sourceSpace.engine,
            title: requirePage(workspace, duplicate.id).title,
            agent: { engine: sourceSpace.engine, status: 'idle', messages: [] },
          },
        },
      };
    return result(requirePage(workspace, duplicate.id), true);
  }
  if (method === 'page.favorite') {
    const page = requirePage(workspace, params.pageId);
    return savePage({ ...page, favorite: !params.remove });
  }
  if (method === 'page.trash') {
    const page = requirePage(workspace, params.pageId);
    if (page.templateFor)
      return executeTemplateCommand(workspace, 'template.delete', { templateId: page.id })!;
    workspace = trashPage(workspace, params.pageId);
    return result({ trashed: params.pageId }, true);
  }
  if (method === 'page.restore') {
    requirePage(workspace, params.pageId, true);
    workspace = restorePage(workspace, params.pageId);
    return result({ restored: params.pageId }, true);
  }
  if (method === 'page.purge') {
    if (!params.confirm) throw new CommandError('CONFIRMATION_REQUIRED', '永久删除需要 confirm=true');
    const purged = requirePage(workspace, params.pageId, true);
    if (purged.syncedSource && syncedReferences(workspace, purged.id, true).length)
      throw new CommandError('SYNC_IN_USE', '请先取消此同步内容的全部引用');
    const ids = descendants(workspace.pages, params.pageId);
    workspace = {
      ...workspace,
      pages: workspace.pages
        .filter((page) => !ids.has(page.id))
        .map((page) => ({
          ...page,
          ...(page.blockedBy ? { blockedBy: page.blockedBy.filter((id) => !ids.has(id)) } : {}),
          ...(page.database
            ? {
                database: {
                  ...page.database,
                  defaultTemplateId: ids.has(page.database.defaultTemplateId || '')
                    ? null
                    : page.database.defaultTemplateId,
                  views: page.database.views?.map((view) =>
                    ids.has(view.defaultTemplateId || '') ? { ...view, defaultTemplateId: null } : view,
                  ),
                },
              }
            : {}),
        })),
      activePageId: ids.has(workspace.activePageId || '') ? null : workspace.activePageId,
      recent: workspace.recent.filter((id) => !ids.has(id)),
      expanded: workspace.expanded.filter((id) => !ids.has(id)),
    };
    workspace = spacePagesRemoved(workspace, ids);
    return result({ deleted: [...ids] }, true);
  }
  if (method.startsWith('block.')) {
    const page = requirePage(workspace, params.pageId);
    if (method === 'block.list')
      return result(
        params.flat
          ? flattenBlocks(page.blocks).map((item) => ({
              ...item.block,
              parentId: item.parentId,
              index: item.index,
            }))
          : page.blocks,
      );
    if (method === 'block.get') return result({ ...getBlock(page.blocks, params.blockId), url: pageLink(page.id, params.blockId) });
    requireEditable(page);
    let blocks = page.blocks;
    let output: any;
    if (method === 'block.append') {
      const added = normalizeBlocks(
        params.blocks || [
          {
            type: params.type || 'paragraph',
            content: params.text || '',
            props: params.props || {},
            ...(params.children ? { children: params.children } : {}),
          },
        ],
      );
      blocks = insertBlocks(blocks, added, {
        parentId: parentId(params.parentId),
        beforeId: params.beforeId,
        afterId: params.afterId,
      });
      output = added;
    } else if (method === 'block.update') {
      const selection = selectedBlocks(blocks, params.ids || [params.blockId]);
      for (const block of selection) {
        const changes = {
          ...params.changes,
          ...pick(params, ['type']),
          ...(params.text !== undefined ? { content: params.text } : {}),
          ...(params.props ? { props: { ...block.props, ...params.props } } : {}),
        };
        blocks = updateBlock(blocks, block.id!, changes);
      }
      output = params.ids ? selection.map(block => getBlock(blocks, block.id!)) : getBlock(blocks, params.blockId);
    } else if (method === 'block.replace') {
      blocks = normalizeBlocks(params.blocks);
      output = blocks;
    } else if (method === 'block.delete') {
      if (!Array.isArray(params.ids)) throw new CommandError('INVALID_ARGUMENT', 'ids 必须是块 ID 数组');
      params.ids.forEach((id: string) => getBlock(blocks, id));
      blocks = deleteBlocks(blocks, params.ids);
      output = { deleted: params.ids };
    } else if (method === 'block.duplicate') {
      const selection = selectedBlocks(blocks, params.ids || [params.blockId]);
      const copies = normalizeBlocks(structuredClone(selection), true);
      blocks = insertBlocks(blocks, copies, { afterId: selection.at(-1)!.id });
      output = params.ids ? copies : copies[0];
    } else if (method === 'block.format') {
      const block = formatBlock(
        getBlock(blocks, params.blockId),
        params.styles || {},
        params.from,
        params.to,
      );
      blocks = updateBlock(blocks, block.id!, block);
      output = block;
    } else if (method === 'block.move') {
      const placement = {
        parentId: parentId(params.parentId),
        beforeId: params.beforeId,
        afterId: params.afterId,
      };
      const moved = selectedBlocks(blocks, params.ids || [params.blockId]);
      const movedIds = new Set(flattenBlocks(moved).map(item => item.block.id));
      if ([placement.parentId, placement.beforeId, placement.afterId].some(id => id && movedIds.has(id)))
        throw new CommandError('INVALID_MOVE', '不能移动到选区或其子块中');
      if (params.targetPageId && params.targetPageId !== page.id) {
        const target = requirePage(workspace, params.targetPageId);
        requireEditable(target);
        const next = insertBlocks(target.blocks, moved, placement);
        validateBlocks(next);
        const comments = (page.comments || []).filter(
          (thread) => thread.blockId && movedIds.has(thread.blockId),
        );
        workspace = replacePage(workspace, {
          ...target,
          blocks: next,
          comments: [...(target.comments || []), ...comments],
        });
        workspace = replacePage(workspace, {
          ...page,
          comments: (page.comments || []).filter(
            (thread) => !comments.some((value) => value.id === thread.id),
          ),
        });
        blocks = deleteBlocks(blocks, moved.map(block => block.id!));
      } else {
        blocks = insertBlocks(deleteBlocks(blocks, moved.map(block => block.id!)), moved, placement);
      }
      output = params.ids ? moved : moved[0];
    } else throw new CommandError('METHOD_NOT_FOUND', `未知方法 ${method}`);
    if (!blocks.length) blocks = normalizeBlocks([{ type: 'paragraph', content: '' }]);
    validateBlocks(blocks);
    workspace = replacePage(workspace, { ...requirePage(workspace, page.id), blocks });
    return result(output, true);
  }
  if (method === 'formula.evaluate') {
    const page = requirePage(workspace, params.pageId);
    const column = params.propertyId
      ? workspace.pages
          .find((parent) => parent.id === page.parentId)
          ?.database?.columns.find((column) => column.id === params.propertyId)
      : {
          id: '__evaluate__',
          name: '公式',
          type: 'formula' as const,
          formula: requiredString(params.expression, 'expression'),
        };
    if (!column) throw new CommandError('PROPERTY_NOT_FOUND', '未找到公式属性');
    const calculated = computeProperty(page, column, workspace.pages);
    if (!calculated.ok) throw new CommandError('FORMULA_ERROR', calculated.error);
    return result(calculated.value);
  }
  if (
    [
      'database.get',
      'record.list',
      'property.list',
      'property.add',
      'property.update',
      'property.delete',
      'view.list',
      'view.create',
      'view.update',
      'view.select',
      'view.duplicate',
      'view.delete',
      'view.reorder',
      'view.render',
      'view.navigate',
      'form.submit',
    ].includes(method)
  ) {
    const page = requireDatabase(workspace, params.databaseId);
    let database = page.database;
    if (method === 'database.get')
      return result({ id: page.id, title: page.title, ...database, views: getViews(database) });
    if (method === 'property.list') return result(database.columns);
    if (method === 'view.list') return result(getViews(database));
    if (method === 'record.list' || method === 'view.render') {
      if (params.date && !parseDay(params.date))
        throw new CommandError('INVALID_DATE', 'date 需要 YYYY-MM-DD');
      const view = {
        ...requireView(page, params.viewId),
        ...pick(params, ['filters', 'sorts']),
        ...(params.date ? { dateAnchor: params.date } : {}),
      };
      if (method === 'view.render') return result(viewProjection(page, view, workspace, params));
      const rows = queryRows(page, view, workspace.pages, params.query || '');
      return result(
        rows.map((row) => ({
          ...(params.full ? row : pageSummary(row)),
          values: row.values,
          computed: Object.fromEntries(
            database.columns.map((column) => [column.id, readProperty(row, column, workspace.pages)]),
          ),
        })),
      );
    }
    if (method === 'form.submit') {
      requireEditable(page);
      const view = requireView(page, params.viewId);
      if (view.type !== 'form') throw new CommandError('NOT_A_FORM', '目标视图不是表单');
      const title = requiredString(params.title, 'title');
      const values = params.values || {};
      for (const id of view.formRequired || [])
        if (
          values[id] === undefined ||
          values[id] === '' ||
          values[id] === false ||
          (Array.isArray(values[id]) && !values[id].length)
        )
          throw new CommandError(
            'REQUIRED_FIELD',
            `必填项未填写：${database.columns.find((column) => column.id === id)?.name || id}`,
          );
      const created = createTemplateRecord(workspace, page.id, { title, values }, undefined, view.id);
      workspace = created.workspace;
      return result(created.page, true);
    }
    if (!['view.select', 'view.update', 'view.navigate'].includes(method)) requireEditable(page);
    let output: any;
    if (method === 'view.navigate') {
      const view = requireView(page, params.viewId);
      if (!['calendar', 'timeline', 'plan'].includes(view.type))
        throw new CommandError('INVALID_VIEW_TYPE', '只有日历、时间线和计划视图支持日期导航');
      if (params.date && !parseDay(params.date))
        throw new CommandError('INVALID_DATE', '日期无效，请使用 YYYY-MM-DD');
      if (!params.date && !['previous', 'next', 'today'].includes(params.direction))
        throw new CommandError('INVALID_ARGUMENT', '需要 date 或 direction: previous / next / today');
      const changes = params.date ? { dateAnchor: params.date } : navigateViewDate(view, params.direction);
      database = updateView(database, view.id, changes);
      output = getViews(database).find((value) => value.id === view.id);
    } else if (method === 'property.add') {
      const column = {
        id: crypto.randomUUID(),
        name: params.name || '属性',
        type: params.type || 'text',
        ...params.definition,
        ...pick(params, ['options', 'formula']),
      } as Property;
      if (!propertyTypes.includes(column.type))
        throw new CommandError('INVALID_PROPERTY_TYPE', '属性类型无效');
      if (database.columns.some((value) => value.id === column.id || value.name === column.name))
        throw new CommandError('DUPLICATE_PROPERTY', '属性 ID 或名称已存在');
      database = { ...database, columns: [...database.columns, column] };
      output = column;
    } else if (method === 'property.update') {
      const old = database.columns.find((column) => column.id === params.propertyId);
      if (!old) throw new CommandError('PROPERTY_NOT_FOUND', '未找到属性');
      let column = {
        ...old,
        ...params.changes,
        ...pick(params, ['name', 'type', 'formula', 'options']),
        id: old.id,
      };
      if (
        column.type === 'status' &&
        (params.options || params.changes?.options) &&
        !params.changes?.statusGroups
      ) {
        const options = column.options || [],
          groups = old.statusGroups || { todo: [], doing: [], done: [] };
        column.statusGroups = Object.fromEntries(
          statusGroupOrder.map((group) => [
            group,
            options.filter(
              (value: string) =>
                groups[group].includes(value) ||
                (group === 'todo' && !statusGroupOrder.some((key) => groups[key].includes(value))),
            ),
          ]),
        );
      }
      if (!propertyTypes.includes(column.type))
        throw new CommandError('INVALID_PROPERTY_TYPE', '属性类型无效');
      if (
        old.system &&
        (column.type !== 'relation' || column.relationTo !== page.id || column.system !== old.system)
      )
        throw new CommandError('SYSTEM_PROPERTY', '子项目和依赖属性由数据库结构设置管理');
      if (database.columns.some((value) => value.id !== old.id && value.name === column.name))
        throw new CommandError('DUPLICATE_PROPERTY', '属性名称已存在');
      if (
        column.type !== 'date' &&
        database.dependencies?.enabled &&
        [database.dependencies.dateProperty, database.dependencies.endProperty].includes(old.id)
      )
        throw new CommandError('DEPENDENCY_DATE_PROPERTY', '请先在子项目与依赖设置中更换日期属性或停用依赖');
      database = {
        ...database,
        columns: database.columns.map((value) => (value.id === old.id ? column : value)),
      };
      if (old.type === 'date' && column.type !== 'date')
        workspace = clearScheduleProperty(workspace, page.id, old.id);
      column = normalizeProperty(column);
      database = {
        ...database,
        columns: database.columns.map((value) => (value.id === old.id ? column : value)),
        ...(isReadOnlyProperty(column) && database.automations
          ? {
              automations: database.automations.map((rule) =>
                rule.triggers.some((trigger) => trigger.propertyId === column.id)
                  ? { ...rule, enabled: false, disabledReason: '触发属性已改为只读类型，请重新设置触发条件' }
                  : rule,
              ),
            }
          : {}),
      };
      workspace = updateOptionValues(workspace, page.id, column, params.optionRenames);
      if (params.optionRenames) {
        workspace = {
          ...workspace,
          pages: workspace.pages.map((value) => (value.id === page.id ? { ...value, database } : value)),
        };
        workspace = renameOptionReferences(workspace, page.id, column.id, params.optionRenames);
        database = requireDatabase(workspace, page.id).database;
      }
      output = column;
    } else if (method === 'property.delete') {
      if (!database.columns.some((column) => column.id === params.propertyId))
        throw new CommandError('PROPERTY_NOT_FOUND', '未找到属性');
      database = {
        ...database,
        columns: database.columns.filter((column) => column.id !== params.propertyId),
        ...(database.automations
          ? {
              automations: database.automations.map((rule) => {
                const view = getViews(database).find((view) => view.id === rule.viewId);
                return rule.triggers.some((trigger) => trigger.propertyId === params.propertyId) ||
                  [...filterProperties(rule.filters), ...filterProperties(view?.filters)].includes(
                    params.propertyId,
                  )
                  ? {
                      ...rule,
                      enabled: false,
                      disabledReason: '使用的属性已删除，请检查触发条件和筛选后重新启用',
                    }
                  : rule;
              }),
            }
          : {}),
        views: getViews(database).map((view) => removeViewProperty(view, params.propertyId)),
        ...(database.dependencies
          ? {
              dependencies: {
                ...database.dependencies,
                ...(database.dependencies.dateProperty === params.propertyId
                  ? { enabled: false, dateProperty: '' }
                  : {}),
                ...(database.dependencies.endProperty === params.propertyId
                  ? { endProperty: undefined }
                  : {}),
              },
            }
          : {}),
      };
      workspace = mapLinkedViews(workspace, page.id, (view) => removeViewProperty(view, params.propertyId));
      workspace = clearScheduleProperty(workspace, page.id, params.propertyId);
      output = { deleted: params.propertyId };
    } else if (method === 'view.create') {
      validateAppearance(params.config?.appearance, 'view');
      validateViewFields(params.config);
      if (!viewNames[(params.type || 'table') as ViewType])
        throw new CommandError('INVALID_VIEW_TYPE', '视图类型无效');
      const view = {
        ...newView(params.type || 'table', params.name),
        ...params.config,
        id: crypto.randomUUID(),
      };
      if (!viewNames[view.type as ViewType]) throw new CommandError('INVALID_VIEW_TYPE', '视图类型无效');
      if (view.type === 'board')
        view.groupBy ||= database.columns.find((column) => isSelectProperty(column))?.id;
      database = {
        ...database,
        views: [...getViews(database), view],
        activeViewId: view.id,
        view: view.type,
      };
      output = view;
    } else if (method === 'view.update') {
      validateAppearance(params.changes?.appearance, 'view');
      validateViewFields(params.changes);
      if (params.changes?.id && params.changes.id !== params.viewId) throw new CommandError('IMMUTABLE_ID', '不能修改视图 ID');
      requireView(page, params.viewId);
      if (params.changes?.type && !viewNames[params.changes.type as ViewType])
        throw new CommandError('INVALID_VIEW_TYPE', '视图类型无效');
      database = updateView(database, params.viewId, params.changes || {});
      if (params.unset) {
        if (!Array.isArray(params.unset) || params.unset.some((key: unknown) => typeof key !== 'string' || ['id', 'name', 'type'].includes(key)))
          throw new CommandError('INVALID_ARGUMENT', 'unset 必须是可选视图字段名称数组');
        database = { ...database, views: getViews(database).map((view) => view.id === params.viewId ? Object.fromEntries(Object.entries(view).filter(([key]) => !params.unset.includes(key))) as DatabaseView : view) };
      }
      output = getViews(database).find((view) => view.id === params.viewId);
    } else if (method === 'view.select') {
      const view = requireView(page, params.viewId);
      database = selectView(database, view.id);
      output = view;
    } else if (method === 'view.duplicate') {
      const old = requireView(page, params.viewId);
      const view = {
        ...structuredClone(old),
        id: crypto.randomUUID(),
        name: params.name || `${old.name}（副本）`,
      };
      database = {
        ...database,
        views: [...getViews(database), view],
        activeViewId: view.id,
        view: view.type,
      };
      output = view;
    } else if (method === 'view.delete') {
      requireView(page, params.viewId);
      const views = getViews(database).filter((view) => view.id !== params.viewId);
      if (!views.length) throw new CommandError('LAST_VIEW', '至少需要保留一个视图');
      const next = views.find((view) => view.id === activeView(database).id) || views[0];
      database = { ...database, views, activeViewId: next.id, view: next.type };
      output = { deleted: params.viewId };
    } else if (method === 'view.reorder') {
      const views = getViews(database);
      if (
        !Array.isArray(params.ids) ||
        params.ids.length !== views.length ||
        new Set(params.ids).size !== views.length ||
        params.ids.some((id: string) => !views.some((view) => view.id === id))
      )
        throw new CommandError('INVALID_ORDER', 'ids 必须包含全部视图且不能重复');
      database = {
        ...database,
        views: params.ids.map((id: string) => views.find((view) => view.id === id)!),
      };
      output = database.views;
    }
    workspace = replacePage(workspace, { ...requirePage(workspace, page.id), database });
    return result(output, true);
  }
  throw new CommandError('METHOD_NOT_FOUND', `未知数据方法：${method}`);
}
