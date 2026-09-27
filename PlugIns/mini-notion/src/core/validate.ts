import { CommandError } from './errors.ts';
import { validateProperty } from '../database/propertySchema.ts';
import { validateBlocks } from './blocks.ts';
import { planModes } from '../database/dates.ts';
import { viewNames } from '../database/model.ts';
import type { DatabaseView, Page, Workspace } from '../types.ts';
import { validateRelationships } from '../database/relations.ts';
import { validateDateValue } from '../database/dateValue.ts';
import { validateRepeat } from '../scheduling/recurrence.ts';
import { validateReminder } from '../scheduling/commands.ts';
import { validateAutomation, buttonConfig } from '../actions/commands.ts';
import { validateActions } from '../actions/engine.ts';
import { flattenBlocks } from './blocks.ts';
import { validateSyncedSources } from '../content/references.ts';
import { validateOverviewConfig } from './overview.ts';
import { validateAppearance, validatePageColor } from './appearance.ts';
import { validateIcon } from './icons.ts';

export function validateDomain(workspace: Workspace) {
  validateAppearance(workspace.settings.appearance, 'application');
  if (workspace.settings.pageTabs !== undefined && (!Array.isArray(workspace.settings.pageTabs) || !workspace.settings.pageTabs.length || workspace.settings.pageTabs.some(id => id !== null && typeof id !== 'string')))
    throw new CommandError('INVALID_SETTINGS', 'pageTabs 需要非空页面 ID/null 数组');
  if (workspace.settings.activeTab !== undefined && (!Number.isInteger(workspace.settings.activeTab) || workspace.settings.activeTab < 0 || workspace.settings.activeTab >= (workspace.settings.pageTabs?.length || 1)))
    throw new CommandError('INVALID_SETTINGS', 'activeTab 超出标签页范围');
  if (workspace.settings.overview) validateOverviewConfig(workspace.settings.overview);
  if (
    workspace.settings.desktopNotifications !== undefined &&
    typeof workspace.settings.desktopNotifications !== 'boolean'
  )
    throw new CommandError('INVALID_SETTINGS', 'desktopNotifications 需要布尔值');
  validateRelationships(workspace);
  validateSyncedSources(workspace);
  if (workspace.scheduler) {
    const state = workspace.scheduler;
    const map = (value: unknown) => !!value && typeof value === 'object' && !Array.isArray(value);
    if (
      !map(state.repeats) ||
      !map(state.reminders) ||
      !Array.isArray(state.runs) ||
      Object.values(state.repeats).some((value) => !value || !Number.isFinite(value.cursor)) ||
      Object.values(state.reminders).some((value) => !value || typeof value.key !== 'string')
    )
      throw new CommandError('INVALID_SCHEDULER', '调度状态无效');
  }
  if (
    workspace.inbox &&
    (!Array.isArray(workspace.inbox) ||
      workspace.inbox.some(
        (item) =>
          !item.id ||
          !item.pageId ||
          (!item.reminderId && item.kind !== 'automation') ||
          typeof item.title !== 'string' ||
          typeof item.text !== 'string',
      ))
  )
    throw new CommandError('INVALID_INBOX', '收件箱数据无效');
  const position = workspace.settings.agentPanelPosition;
  if (
    position &&
    (!Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.y < 0)
  )
    throw new CommandError('INVALID_SETTINGS', 'Agent 面板位置需要非负数坐标');
  if (!['light', 'dark', 'system'].includes(workspace.settings.theme))
    throw new CommandError('INVALID_THEME', '主题无效');
  const scheduleIds = new Set<string>();
  for (const page of workspace.pages) {
    validateIcon(page.icon);
    validatePageColor(page.color);
    validatePageColor(page.textColor, 'textColor');
    validateAppearance(page.appearance, 'page');
    for (const { block } of flattenBlocks(page.blocks)) {
      if (block.type === 'callout' && block.props?.emoji !== undefined) validateIcon(block.props.emoji);
      if (block.type !== 'databaseView' || !block.props?.viewState) continue;
      let state;
      try { state = JSON.parse(String(block.props.viewState)); } catch { continue; }
      if (Array.isArray(state?.views))
        for (const view of state.views) validateAppearance(view?.appearance, 'view');
    }
    validateBlocks(page.blocks);
    for (const { block } of flattenBlocks(page.blocks))
      if (block.type === 'button') validateActions(buttonConfig(block.props).actions);
    if (page.reminders != null && !Array.isArray(page.reminders))
      throw new CommandError('INVALID_REMINDER', '提醒需要数组');
    if (page.repeat) validateRepeat(page.repeat);
    for (const reminder of page.reminders || []) validateReminder(reminder);
    for (const id of [
      ...(page.repeat ? [page.repeat.id] : []),
      ...(page.reminders || []).map((reminder) => reminder.id),
    ]) {
      if (scheduleIds.has(id)) throw new CommandError('DUPLICATE_SCHEDULE_ID', '循环和提醒的 ID 不得重复');
      scheduleIds.add(id);
    }
    const parent = workspace.pages.find((value) => value.id === page.parentId);
    for (const column of parent?.database?.columns || [])
      if (column.type === 'date') validateDateValue(page.values[column.id]);
    if (
      page.comments &&
      (!Array.isArray(page.comments) ||
        page.comments.some(
          (thread) =>
            typeof thread.id !== 'string' ||
            !Array.isArray(thread.messages) ||
            thread.messages.some(
              (message) =>
                typeof message.id !== 'string' ||
                typeof message.text !== 'string' ||
                typeof message.author !== 'string',
            ),
        ))
    )
      throw new CommandError('INVALID_COMMENTS', '评论数据无效');
    validateSpaceFields(page);
    if (!page.database) continue;
    const columns = page.database.columns;
    if (!Array.isArray(columns) || new Set(columns.map((column) => column.id)).size !== columns.length)
      throw new CommandError('INVALID_PROPERTIES', '属性定义需要数组且 ID 不得重复');
    for (const rule of page.database.automations || []) validateAutomation(rule);
    for (const column of columns) {
      if (column.button) validateActions(column.button.actions);
      validateProperty(column);
    }
    for (const view of page.database.views || []) validateView(view);
  }
  const roots = new Set(workspace.pages.filter((page) => page.space).map((page) => page.id));
  const sessions = new Map<string, string>();
  for (const [id, space] of Object.entries(workspace.spaces || {})) {
    if (!roots.has(id)) throw new CommandError('INVALID_SPACE', '空间必须对应一个顶层页面');
    if (!['claude', 'codex'].includes(space.engine))
      throw new CommandError('INVALID_SPACE', '空间引擎必须是 claude 或 codex');
    if (!space.agent || space.agent.engine !== space.engine)
      throw new CommandError('INVALID_SPACE', 'Agent 引擎必须与空间一致');
    if (!['idle', 'running', 'error', 'stopped'].includes(space.agent.status))
      throw new CommandError('INVALID_SPACE', 'Agent 状态无效');
    for (const agent of [
      space.agent,
      ...(space.agent.sessions || []).map((session) => session.state || { sessionId: session.id }),
    ]) {
      if (
        'conversationId' in agent &&
        agent.conversationId !== undefined &&
        (typeof agent.conversationId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(agent.conversationId))
      )
        throw new CommandError('INVALID_SPACE', '会话 ID 无效');
      if (!agent.sessionId) continue;
      const session = `${space.engine}:${agent.sessionId}`;
      if (typeof agent.sessionId !== 'string' || (sessions.has(session) && sessions.get(session) !== id))
        throw new CommandError('INVALID_SPACE', '同一个 Agent 会话不能绑定多个空间');
      sessions.set(session, id);
    }
    if (!Array.isArray(space.agent.messages) || space.agent.messages.length > 50)
      throw new CommandError('INVALID_SPACE', 'Agent 消息需要数组且不超过 50 条');
    for (const message of space.agent.messages)
      if (
        typeof message.id !== 'string' ||
        !['user', 'agent', 'system'].includes(message.role) ||
        !['text', 'activity'].includes(message.kind) ||
        typeof message.at !== 'number'
      )
        throw new CommandError('INVALID_SPACE', 'Agent 消息格式无效');
  }
}
function validateSpaceFields(page: Page) {
  if (page.space !== undefined && page.space !== true)
    throw new CommandError('INVALID_SPACE', 'space 只能为 true');
  if (page.space && page.parentId !== null) throw new CommandError('INVALID_SPACE', '只有顶层页面才能是空间');
  if (page.folders !== undefined) {
    if (!Array.isArray(page.folders)) throw new CommandError('INVALID_SPACE', '文件夹需要数组');
    const ids = new Set<string>();
    for (const folder of page.folders) {
      if (
        folder.path !== undefined &&
        (typeof folder.path !== 'string' ||
          folder.path.startsWith('/') ||
          folder.path.split('/').includes('..') ||
          folder.path.includes('\\') ||
          folder.path.includes('\0'))
      )
        throw new CommandError('INVALID_SPACE', '文件夹物理路径必须位于 Workspace 内');
      if (typeof folder.id !== 'string' || !folder.id || ids.has(folder.id))
        throw new CommandError('INVALID_SPACE', '文件夹 ID 不得为空或重复');
      ids.add(folder.id);
      if (typeof folder.name !== 'string' || !folder.name || /[\\/:*?"<>|\x00-\x1f]|\.\./.test(folder.name))
        throw new CommandError('INVALID_SPACE', '文件夹名称无效');
    }
    for (const folder of page.folders) {
      if (folder.parentId !== null && !ids.has(folder.parentId))
        throw new CommandError('INVALID_SPACE', '文件夹父级无效');
      const seen = new Set([folder.id]);
      let parentId = folder.parentId;
      while (parentId) {
        if (seen.has(parentId)) throw new CommandError('INVALID_SPACE', '文件夹层级存在循环');
        seen.add(parentId);
        parentId = page.folders.find((value) => value.id === parentId)!.parentId;
      }
    }
  }
  if (page.files !== undefined) {
    if (!Array.isArray(page.files)) throw new CommandError('INVALID_SPACE', '文件需要数组');
    const folderIds = new Set((page.folders || []).map((folder) => folder.id));
    const fileIds = new Set<string>();
    for (const file of page.files) {
      if (typeof file.id !== 'string' || !file.id || fileIds.has(file.id))
        throw new CommandError('INVALID_SPACE', '文件 ID 不得为空或重复');
      fileIds.add(file.id);
      if (typeof file.name !== 'string' || !file.name || typeof file.url !== 'string')
        throw new CommandError('INVALID_SPACE', '文件名称或地址无效');
      if (file.folderId !== null && !folderIds.has(file.folderId))
        throw new CommandError('INVALID_SPACE', '文件的文件夹不存在');
    }
  }
}
function validateView(view: DatabaseView) {
  validateAppearance(view?.appearance, 'view');
  if (!view || typeof view.id !== 'string' || typeof view.name !== 'string' || !viewNames[view.type])
    throw new CommandError('INVALID_VIEW', '视图 ID、名称或类型无效');
  if (view.planMode && !Object.hasOwn(planModes, view.planMode))
    throw new CommandError('INVALID_VIEW', '计划布局无效');
  if (view.timeZone) validateDateValue({ start: '2000-01-01T00:00', timeZone: view.timeZone });
  if (view.planShowBacklog !== undefined && typeof view.planShowBacklog !== 'boolean')
    throw new CommandError('INVALID_VIEW', 'planShowBacklog 必须是 boolean');
  const enums = {
    cardSize: ['small', 'medium', 'large'],
    cardPreview: ['none', 'cover', 'content'],
    openPagesIn: ['side', 'center', 'full'],
    calendarMode: ['month', 'week'],
    timelineScale: ['week', 'month', 'quarter', 'year'],
    chartType: ['bar', 'horizontal', 'line', 'donut'],
    subItemDisplay: ['nested', 'flat', 'card'],
    subItemFilter: ['all', 'parents', 'children'],
  };
  for (const [field, values] of Object.entries(enums))
    if ((view as any)[field] !== undefined && !values.includes((view as any)[field]))
      throw new CommandError('INVALID_VIEW', `${field} 必须是 ${values.join('/')}`);
  const filters = (group: any) => {
    if (!group || !Array.isArray(group.rules) || !['and', 'or'].includes(group.conjunction))
      throw new CommandError('INVALID_FILTER', '筛选组需要 conjunction: and/or 和 rules 数组');
    for (const rule of group.rules) {
      if ('rules' in rule) filters(rule);
      else if (
        typeof rule.property !== 'string' ||
        ![
          'is',
          'is_not',
          'contains',
          'not_contains',
          'starts_with',
          'ends_with',
          'empty',
          'not_empty',
          'gt',
          'gte',
          'lt',
          'lte',
          'before',
          'after',
          'on_or_before',
          'on_or_after',
        ].includes(rule.operator)
      )
        throw new CommandError('INVALID_FILTER', '筛选条件或运算符无效');
    }
  };
  if (view.filters) filters(view.filters);
  if (
    view.sorts &&
    (!Array.isArray(view.sorts) ||
      view.sorts.some(
        (sort) => typeof sort.property !== 'string' || !['asc', 'desc'].includes(sort.direction),
      ))
  )
    throw new CommandError('INVALID_SORT', '排序需要 property 和 direction: asc/desc');
  for (const field of [
    'hiddenProperties',
    'propertyOrder',
    'hiddenGroups',
    'collapsedGroups',
    'groupOrder',
    'formRequired',
  ] as const)
    if (view[field] !== undefined && !Array.isArray(view[field]))
      throw new CommandError('INVALID_VIEW', `${field} 必须是数组`);
}
