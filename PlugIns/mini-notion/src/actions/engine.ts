import type { Page, Property, Workspace, FilterGroup, Database } from '../types.ts';
import type { ActionStep, ActionValue, ActionEffect, DatabaseAutomation, ActionRun } from './types.ts';
import { requirePage, requireDatabase } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';
import { normalizeBlocks } from '../core/blocks.ts';
import { evaluateFormula, formulaText, type FormulaValue } from '../database/formula.ts';
import { contextFor } from '../database/propertiesModel.ts';
import { makeDateValue, localTimeZone } from '../database/dateValue.ts';
import { relationIds } from '../database/relations.ts';
import { queryRows, matchesFilters, getViews } from '../database/model.ts';
import { isTemplatePage, isInternalPage } from '../model.ts';
import { isReadOnlyProperty } from '../database/propertySchema.ts';
import { normalizePropertyValue } from '../database/propertyData.ts';

export type Dispatcher = (
  workspace: Workspace,
  method: string,
  params: Record<string, any>,
) => { workspace: Workspace | null; result: any };
export type ActionContext = {
  pageId: string;
  ownerId: string;
  buttonBlockId?: string;
  now?: number;
  automationId?: string;
  triggeredAt?: number;
};
export const actionTypes = {
  set: '修改页面属性',
  create: '新建数据库页面',
  edit: '修改筛选出的页面',
  insert: '插入内容块',
  notify: '发送本地通知',
  reminder: '添加页面提醒',
  variable: '定义变量',
  open: '打开页面',
  trash: '移到回收站',
};
export const normalizeActions = (steps: ActionStep[]) =>
  steps.map((step) => ({ ...step, id: step.id || crypto.randomUUID() }));
export const filterProperties = (group?: FilterGroup): string[] =>
  group?.rules.flatMap((rule) => ('rules' in rule ? filterProperties(rule) : [rule.property])) || [];
export function validateActionFilters(group: FilterGroup | undefined, database: Database) {
  for (const id of filterProperties(group))
    if (
      !['title', 'createdAt', 'updatedAt'].includes(id) &&
      !database.columns.some((column) => column.id === id)
    )
      throw new CommandError('PROPERTY_NOT_FOUND', `筛选属性 ${id} 已移除，请重新配置条件`);
}
export function validateActions(steps: ActionStep[], automatic = false) {
  if (!Array.isArray(steps)) throw new CommandError('INVALID_ACTIONS', '动作需要数组');
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step || !Object.hasOwn(actionTypes, step.type) || !step.id || ids.has(step.id))
      throw new CommandError('INVALID_ACTION', '动作类型或 ID 无效');
    ids.add(step.id);
    if (automatic && step.type === 'open') throw new CommandError('INVALID_ACTION', '后台自动化不能打开窗口');
    if (
      ['set', 'edit'].includes(step.type) &&
      step.title === undefined &&
      !Object.keys(step.values || {}).length &&
      !Object.keys(step.operations || {}).length
    )
      throw new CommandError('EMPTY_ACTION', '请选择要修改的属性');
    if (['create', 'edit'].includes(step.type) && !step.databaseId)
      throw new CommandError('INVALID_ACTION', '请选择目标数据库');
    if (step.type === 'insert' && !step.blocks?.length)
      throw new CommandError('INVALID_ACTION', '请添加要插入的内容');
    if (step.type === 'notify' && step.text === undefined)
      throw new CommandError('INVALID_ACTION', '请填写通知内容');
    if (step.type === 'reminder' && step.at === undefined)
      throw new CommandError('INVALID_ACTION', '请设置提醒时间');
    if (
      step.type === 'variable' &&
      (step.value === undefined ||
        !step.name ||
        !/^[_\p{L}][_\p{L}\p{N}]*$/u.test(step.name) ||
        ['trigger', 'current', 'created', 'triggerTime', 'true', 'false', 'empty', 'null'].includes(
          step.name,
        ))
    )
      throw new CommandError(
        'INVALID_VARIABLE',
        '请填写变量值；变量名需以字母开头，且不能覆盖 trigger/current/created',
      );
    if (
      step.operations &&
      Object.values(step.operations).some(
        (value) => !['set', 'add', 'remove', 'clear', 'toggle'].includes(value),
      )
    )
      throw new CommandError('INVALID_ACTION', '属性操作无效');
  }
}
const expression = (value: unknown): value is { formula: string } =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === 1 &&
  typeof (value as any).formula === 'string';
export function runActions(
  workspace: Workspace,
  actions: ActionStep[],
  context: ActionContext,
  dispatch: Dispatcher,
) {
  validateActions(actions);
  if (!actions.length) throw new CommandError('EMPTY_ACTIONS', '请先配置按钮动作');
  let candidate = workspace,
    lastCreated: string | undefined;
  const now = context.now ?? Date.now(),
    variables: Record<string, FormulaValue> = {},
    effects: ActionEffect[] = [],
    results: { id: string; type: string; result: unknown }[] = [];
  const targetId = (target?: string) =>
    !target || target === 'current'
      ? context.pageId
      : target === 'created'
        ? lastCreated ||
          (() => {
            throw new CommandError('NO_CREATED_PAGE', '此动作之前还没有创建页面');
          })()
        : target;
  const formulaContext = (id: string) => ({
    ...contextFor(requirePage(candidate, id), candidate.pages),
    now: new Date(now),
    variables: {
      ...variables,
      triggerTime: new Date(context.triggeredAt ?? now),
      trigger: { kind: 'page' as const, id: context.pageId },
      current: { kind: 'page' as const, id },
      ...(lastCreated ? { created: { kind: 'page' as const, id: lastCreated } } : {}),
    },
  });
  const resolve = (value: ActionValue, id = context.pageId): any =>
    expression(value) ? evaluateFormula(value.formula, formulaContext(id)) : value;
  const text = (value: ActionValue, id = context.pageId) => {
    const valueResolved = resolve(value, id);
    return typeof valueResolved === 'object' && valueResolved !== null
      ? formulaText(valueResolved as FormulaValue, formulaContext(id))
      : String(valueResolved ?? '');
  };
  const convert = (value: any, column: Property, page: Page): Page['values'][string] => {
    if (column.type === 'person' || column.type === 'files')
      return normalizePropertyValue(value, column, candidate);
    if (value === null || value === undefined)
      return column.type === 'checkbox'
        ? false
        : column.type === 'multiSelect' || column.type === 'relation'
          ? []
          : '';
    if (value instanceof Date) return makeDateValue(value.toISOString(), undefined, localTimeZone());
    if (value?.kind === 'dateRange')
      return makeDateValue(value.start.toISOString(), value.end.toISOString(), localTimeZone());
    if (column.type === 'relation') {
      const ids = (Array.isArray(value) ? value : [value]).map((item) =>
        item?.kind === 'page' ? item.id : String(item),
      );
      for (const id of ids) {
        const target = requirePage(candidate, id);
        if (target.parentId !== column.relationTo || isInternalPage(target, candidate.pages))
          throw new CommandError('INVALID_RELATION', `「${column.name}」请选择关联数据库中的记录`);
      }
      return [...new Set(ids)];
    }
    if (column.type === 'multiSelect') return Array.isArray(value) ? value.map(String) : [String(value)];
    if (column.type === 'number') {
      const number = Number(value);
      if (value !== '' && !Number.isFinite(number))
        throw new CommandError('INVALID_NUMBER', `「${column.name}」需要数字`);
      return value === '' ? '' : number;
    }
    if (column.type === 'checkbox') {
      if (typeof value !== 'boolean')
        throw new CommandError('INVALID_CHECKBOX', `「${column.name}」需要 true/false`);
      return value;
    }
    if (value && typeof value === 'object' && 'kind' in value)
      return formulaText(value, formulaContext(page.id));
    return value;
  };
  const perform = (method: string, params: any) => {
    const result = dispatch(candidate, method, params);
    if (result.workspace) candidate = result.workspace;
    return result.result;
  };
  const assignments = (page: Page, step: ActionStep) => {
    const database = page.parentId
      ? candidate.pages.find((parent) => parent.id === page.parentId)?.database
      : undefined;
    const values: Page['values'] = {};
    for (const id of new Set([...Object.keys(step.values || {}), ...Object.keys(step.operations || {})])) {
      const column = database?.columns.find((column) => column.id === id);
      if (!column) throw new CommandError('PROPERTY_NOT_FOUND', `目标页面没有属性 ${id}`);
      if (isReadOnlyProperty(column))
        throw new CommandError('READ_ONLY_PROPERTY', `「${column.name}」不能由动作写入`);
      const operation = step.operations?.[id] || 'set',
        before = column.type === 'relation' ? relationIds(page, column, candidate.pages) : page.values[id];
      if (operation === 'clear') {
        values[id] = convert(null, column, page);
        continue;
      }
      if (operation === 'toggle') {
        if (column.type !== 'checkbox') throw new CommandError('INVALID_ACTION', '切换操作只支持复选框');
        values[id] = !before;
        continue;
      }
      const value = convert(resolve(step.values?.[id], page.id), column, page);
      if (operation === 'add' || operation === 'remove') {
        if (!['relation', 'multiSelect', 'person', 'files'].includes(column.type))
          throw new CommandError('INVALID_ACTION', '追加和移除只支持多选、关联、人员或文件');
        const old = Array.isArray(before) ? before : [],
          items = value as any[];
        const key = (item: any) => (typeof item === 'object' ? item.id : item);
        values[id] = (
          operation === 'add'
            ? [...old, ...items.filter((item) => !old.some((value) => key(value) === key(item)))]
            : old.filter((item) => !items.some((value) => key(value) === key(item)))
        ) as Page['values'][string];
      } else values[id] = value;
    }
    return values;
  };
  for (const step of actions) {
    try {
      let result: unknown;
      if (step.type === 'variable') {
        variables[step.name!] = resolve(step.value);
        result = { name: step.name, value: variables[step.name!] };
      }
      if (step.type === 'create') {
        const database = requireDatabase(candidate, step.databaseId);
        const prototype = { ...requirePage(candidate, context.pageId), parentId: database.id, values: {} };
        const values = assignments(prototype, { ...step, operations: undefined });
        const created = perform('record.create', {
          color: candidate.pages.find((page) => page.id === (step.templateId || database.database.defaultTemplateId))?.color || 'blue',
          databaseId: database.id,
          templateId: step.templateId,
          ...(step.title === undefined ? {} : { title: text(step.title) }),
          values,
        });
        lastCreated = created.id;
        result = { pageId: created.id, title: created.title };
      }
      if (step.type === 'set') {
        const page = requirePage(candidate, targetId(step.target));
        result = perform('page.update', {
          pageId: page.id,
          ...(step.title === undefined ? {} : { title: text(step.title, page.id) }),
          values: assignments(page, step),
        });
        result = { pageId: page.id };
      }
      if (step.type === 'edit') {
        const database = requireDatabase(candidate, step.databaseId);
        validateActionFilters(step.filters, database.database);
        const rows = queryRows(
          database,
          { id: 'actions', name: '', type: 'table', subItemDisplay: 'flat', filters: step.filters },
          candidate.pages,
        );
        const selected = rows.filter(
          (row) =>
            !step.filterFormula || evaluateFormula(step.filterFormula, formulaContext(row.id)) === true,
        );
        for (const row of selected)
          perform('page.update', {
            pageId: row.id,
            ...(step.title === undefined ? {} : { title: text(step.title, row.id) }),
            values: assignments(requirePage(candidate, row.id), step),
          });
        result = { pageIds: selected.map((row) => row.id), count: selected.length };
      }
      if (step.type === 'insert') {
        const page = requirePage(candidate, targetId(step.target)),
          blocks = normalizeBlocks(structuredClone(step.blocks!), true);
        result = perform('block.append', {
          pageId: page.id,
          blocks,
          ...(step.position === 'start' && page.blocks[0]
            ? { beforeId: page.blocks[0].id }
            : step.position === 'beforeButton' && context.buttonBlockId && page.id === context.pageId
              ? { beforeId: context.buttonBlockId }
              : step.position === 'afterButton' && context.buttonBlockId && page.id === context.pageId
                ? { afterId: context.buttonBlockId }
                : {}),
        });
        result = { pageId: page.id, blockIds: (result as any[]).map((block) => block.id) };
      }
      if (step.type === 'notify') {
        const page = requirePage(candidate, context.pageId),
          item = {
            id: crypto.randomUUID(),
            kind: 'automation' as const,
            pageId: page.id,
            title: page.title || '无标题',
            text: text(step.text),
            scheduledFor: new Date(now).toISOString(),
            createdAt: now,
            automationId: context.automationId,
          };
        candidate = { ...candidate, inbox: [...(candidate.inbox || []), item] };
        result = { notificationId: item.id };
      }
      if (step.type === 'reminder') {
        const id = targetId(step.target);
        const at = resolve(step.at, id);
        result = perform('reminder.add', {
          pageId: id,
          at: at instanceof Date ? at.toISOString() : String(at),
          text: step.text === undefined ? '' : text(step.text, id),
        });
      }
      if (step.type === 'open') {
        const id = targetId(step.target);
        requirePage(candidate, id);
        effects.push({ type: 'open', pageId: id, mode: step.mode });
        result = { pageId: id };
      }
      if (step.type === 'trash') {
        const id = targetId(step.target);
        perform('page.trash', { pageId: id });
        result = { pageId: id };
      }
      results.push({ id: step.id, type: step.type, result });
    } catch (error) {
      throw new CommandError(
        error instanceof CommandError ? error.code : 'ACTION_FAILED',
        `第 ${results.length + 1} 步「${actionTypes[step.type]}」：${error instanceof Error ? error.message : String(error)}`,
        { stepId: step.id, stepIndex: results.length },
      );
    }
  }
  return { workspace: candidate, steps: results, effects };
}
export function appendRun(workspace: Workspace, run: ActionRun): Workspace {
  return { ...workspace, actionRuns: [...(workspace.actionRuns || []), run].slice(-300) };
}
export type TriggerMemory = Record<string, Record<string, number>>;
export function triggeredAutomations(
  before: Workspace,
  after: Workspace,
  now = Date.now(),
  memory: TriggerMemory = {},
) {
  const previous = new Map(before.pages.map((page) => [page.id, page]));
  const propertyValue = (page: Page, id: string, workspace: Workspace) => {
    if (id === 'title') return page.title;
    const column = workspace.pages
      .find((owner) => owner.id === page.parentId)
      ?.database?.columns.find((column) => column.id === id);
    return column?.type === 'relation'
      ? relationIds(page, column, workspace.pages)
      : column?.type === 'person'
        ? ((page.values[id] || []) as { id: string }[]).map((person) => person.id)
        : page.values[id];
  };
  const signals: TriggerMemory = Object.fromEntries(
    Object.entries(memory)
      .map(([key, values]) => [
        key,
        Object.fromEntries(Object.entries(values).filter(([, at]) => now - at <= 3000)),
      ])
      .filter(([, values]) => Object.keys(values).length),
  );
  const jobs: { owner: Page; rule: DatabaseAutomation; page: Page }[] = [];
  for (const owner of after.pages.filter(
    (page) => page.database?.automations?.length && !page.trashedAt && !isTemplatePage(page, after.pages),
  )) {
    const rules = owner.database!.automations!;
    for (const rule of rules)
      if (
        JSON.stringify(
          previous.get(owner.id)?.database?.automations?.find((value) => value.id === rule.id),
        ) !== JSON.stringify(rule)
      )
        for (const key of Object.keys(signals)) if (key.startsWith(rule.id + ':')) delete signals[key];
    for (const page of after.pages.filter(
      (page) => page.parentId === owner.id && !page.trashedAt && !isTemplatePage(page, after.pages),
    )) {
      const old = previous.get(page.id),
        created = !old || old.parentId !== owner.id;
      if (!old && page.automationOrigin) continue;
      for (const rule of rules) {
        if (!rule.enabled || rule.schedule || !rule.triggers.length) continue;
        const hit = rule.triggers.filter((trigger) =>
          trigger.type === 'created'
            ? created
            : !created &&
              !!old &&
              JSON.stringify(propertyValue(old, trigger.propertyId || '', before)) !==
                JSON.stringify(propertyValue(page, trigger.propertyId || '', after)),
        );
        if (!hit.length) continue;
        if (rule.triggerMode === 'all') {
          const key = `${rule.id}:${page.id}`,
            current = { ...signals[key], ...Object.fromEntries(hit.map((trigger) => [trigger.id, now])) };
          signals[key] = current;
          if (!rule.triggers.every((trigger) => current[trigger.id] !== undefined)) continue;
          delete signals[key];
        }
        if (!matchesFilters(page, rule.filters, owner.database!, after.pages)) continue;
        const view = rule.viewId
          ? getViews(owner.database!).find((view) => view.id === rule.viewId)
          : undefined;
        if (rule.viewId && (!view || !matchesFilters(page, view.filters, owner.database!, after.pages)))
          continue;
        jobs.push({ owner, rule, page });
      }
    }
  }
  return { jobs, signals };
}
export function applyAutomations(
  before: Workspace,
  after: Workspace,
  dispatch: Dispatcher,
  now = Date.now(),
  prepare: (before: Workspace, after: Workspace) => Workspace = (_, after) => after,
  memory: TriggerMemory = {},
) {
  let workspace = after;
  const effects: ActionEffect[] = [];
  const triggered = triggeredAutomations(before, after, now, memory);
  for (const job of triggered.jobs) {
    const base: ActionRun = {
      id: crypto.randomUUID(),
      at: now,
      kind: 'automation',
      name: job.rule.name,
      ownerId: job.owner.id,
      sourceId: job.page.id,
      status: 'success',
    };
    try {
      if (job.owner.locked) throw new CommandError('PAGE_LOCKED', '数据库已锁定');
      const result = runActions(
        workspace,
        job.rule.actions,
        { pageId: job.page.id, ownerId: job.owner.id, now, automationId: job.rule.id },
        dispatch,
      );
      workspace = appendRun(prepare(workspace, result.workspace), { ...base, steps: result.steps });
      effects.push(...result.effects);
    } catch (error) {
      workspace = appendRun(workspace, {
        ...base,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { workspace, effects, signals: triggered.signals };
}
