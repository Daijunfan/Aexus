import type { Workspace, Page } from '../types.ts';
import type { ActionStep, ButtonConfig, DatabaseAutomation, ActionRun } from './types.ts';
import { requirePage, requireDatabase, requireEditable } from '../core/access.ts';
import { CommandError } from '../core/errors.ts';
import { flattenBlocks, getBlock } from '../core/blocks.ts';
import { diffWorkspace } from '../core/patch.ts';
import {
  normalizeActions,
  validateActions,
  validateActionFilters,
  runActions,
  appendRun,
  type Dispatcher,
} from './engine.ts';
import { validateRepeat } from '../scheduling/recurrence.ts';
import { defaultRule } from '../scheduling/commands.ts';
import { isReadOnlyProperty } from '../database/propertySchema.ts';

export function buttonConfig(props: Record<string, unknown> = {}): ButtonConfig {
  try {
    return {
      label: String(props.label || '按钮'),
      confirmation: String(props.confirmation || ''),
      actions: normalizeActions(JSON.parse(String(props.actions || '[]'))),
    };
  } catch {
    throw new CommandError('INVALID_BUTTON', '按钮动作配置不是有效 JSON');
  }
}
export function findButton(workspace: Workspace, params: Record<string, any>) {
  const page = requirePage(workspace, params.pageId);
  if (params.propertyId) {
    const owner = page.database ? page : requireDatabase(workspace, page.parentId);
    const column = owner.database!.columns.find(
      (column) => column.id === params.propertyId && column.type === 'button',
    );
    if (!column) throw new CommandError('BUTTON_NOT_FOUND', '未找到按钮属性');
    return {
      page,
      owner,
      column,
      config: {
        label: column.button?.label || column.name,
        confirmation: column.button?.confirmation || '',
        actions: column.button?.actions || [],
      },
    };
  }
  const block = getBlock(page.blocks, params.blockId);
  if (block.type !== 'button') throw new CommandError('NOT_A_BUTTON', '此内容块不是按钮');
  return { page, owner: page, block, config: buttonConfig(block.props) };
}
export function validateAutomation(rule: DatabaseAutomation) {
  if (
    !rule.id ||
    typeof rule.name !== 'string' ||
    typeof rule.enabled !== 'boolean' ||
    !Array.isArray(rule.triggers) ||
    !['any', 'all'].includes(rule.triggerMode || 'any')
  )
    throw new CommandError('INVALID_AUTOMATION', '自动化定义无效');
  if (rule.schedule) {
    validateRepeat(rule.schedule);
    if (rule.triggers.length) throw new CommandError('INVALID_AUTOMATION', '定时触发不能与属性触发混用');
    if (rule.actions.some((step) => step.type === 'set' && (!step.target || step.target === 'current')))
      throw new CommandError('INVALID_ACTION', '定时触发没有当前记录，请使用「修改筛选出的页面」');
  } else if (
    !rule.triggers.length ||
    rule.triggers.some(
      (trigger) =>
        !trigger.id ||
        !['created', 'property'].includes(trigger.type) ||
        (trigger.type === 'property' && !trigger.propertyId),
    )
  )
    throw new CommandError('INVALID_TRIGGER', '请设置有效的触发条件');
  if (!rule.actions.length) throw new CommandError('EMPTY_ACTIONS', '自动化至少需要一个动作');
  validateActions(rule.actions, true);
}
function validateScope(rule: DatabaseAutomation, owner: Page) {
  validateActionFilters(rule.filters, owner.database!);
  for (const trigger of rule.triggers)
    if (
      trigger.type === 'property' &&
      trigger.propertyId !== 'title' &&
      !owner.database!.columns.some(
        (column) => column.id === trigger.propertyId && !isReadOnlyProperty(column),
      )
    )
      throw new CommandError('PROPERTY_NOT_FOUND', '触发属性不存在或是只读属性，请重新配置');
  if (rule.viewId && !owner.database!.views?.some((view) => view.id === rule.viewId))
    throw new CommandError('VIEW_NOT_FOUND', '触发范围的视图已移除，请重新配置');
}
export function executeActionCommand(
  workspace: Workspace,
  method: string,
  params: Record<string, any>,
  dispatch: Dispatcher,
) {
  if (!method.startsWith('button.') && !method.startsWith('automation.') && method !== 'action.history')
    return;
  const result = (data: any, changed = false) => ({ workspace, result: data, changed });
  const perform = (method: string, params: any) => {
    const operation = dispatch(workspace, method, params);
    if (operation.workspace) workspace = operation.workspace;
    return operation.result;
  };
  if (method === 'action.history')
    return result(
      (workspace.actionRuns || [])
        .filter(
          (run) =>
            (!params.pageId || run.sourceId === params.pageId) &&
            (!params.ownerId || run.ownerId === params.ownerId),
        )
        .slice()
        .reverse(),
    );
  if (method === 'button.list')
    return result(
      workspace.pages
        .filter((page) => !page.trashedAt && (!params.pageId || page.id === params.pageId))
        .flatMap((page) => [
          ...flattenBlocks(page.blocks)
            .filter(({ block }) => block.type === 'button')
            .map(({ block }) => ({ pageId: page.id, blockId: block.id, config: buttonConfig(block.props) })),
          ...(page.database?.columns
            .filter((column) => column.type === 'button')
            .map((column) => ({
              pageId: page.id,
              propertyId: column.id,
              config: column.button || { label: column.name, actions: [] },
            })) || []),
        ]),
    );
  if (method === 'button.create') {
    const actions = normalizeActions(params.actions || []);
    validateActions(actions);
    const config: ButtonConfig = {
      label: params.label || '按钮',
      confirmation: params.confirmation || '',
      actions,
    };
    if (params.property) {
      const column = perform('property.add', {
        databaseId: params.pageId,
        definition: { id: crypto.randomUUID(), name: params.label || '按钮', type: 'button', button: config },
      });
      return result({ pageId: params.pageId, propertyId: column.id, config }, true);
    }
    const blocks = perform('block.append', {
      pageId: params.pageId,
      blocks: [
        {
          type: 'button',
          props: { label: config.label, confirmation: config.confirmation, actions: JSON.stringify(actions) },
        },
      ],
      beforeId: params.beforeId,
      afterId: params.afterId,
    });
    return result({ pageId: params.pageId, blockId: blocks[0].id, config }, true);
  }
  if (method.startsWith('button.')) {
    const found = findButton(workspace, params);
    if (method === 'button.get')
      return result({
        pageId: found.page.id,
        ownerId: found.owner.id,
        blockId: found.block?.id,
        propertyId: found.column?.id,
        config: found.config,
      });
    if (method === 'button.configure') {
      requireEditable(found.owner);
      const config = {
        ...found.config,
        ...params.config,
        ...(params.label !== undefined ? { label: params.label } : {}),
        ...(params.actions ? { actions: params.actions } : {}),
      };
      config.actions = normalizeActions(config.actions);
      validateActions(config.actions);
      if (found.column)
        perform('property.update', {
          databaseId: found.owner.id,
          propertyId: found.column.id,
          changes: { button: config },
        });
      else
        perform('block.update', {
          pageId: found.page.id,
          blockId: found.block!.id,
          changes: {
            props: {
              label: config.label,
              confirmation: config.confirmation || '',
              actions: JSON.stringify(config.actions),
            },
          },
        });
      return result(config, true);
    }
    if (method === 'button.run' || method === 'button.preview') {
      requireEditable(found.page);
      requireEditable(found.owner);
      if (found.column && found.page.database)
        throw new CommandError('RECORD_REQUIRED', '运行属性按钮时请选择具体记录');
      const config =
        method === 'button.preview' && params.config ? { ...found.config, ...params.config } : found.config;
      if (method === 'button.run' && config.confirmation && !params.confirm)
        throw new CommandError('CONFIRMATION_REQUIRED', config.confirmation, { config });
      if (params.expectedConfig && JSON.stringify(params.expectedConfig) !== JSON.stringify(found.config))
        throw new CommandError('BUTTON_CHANGED', '按钮配置已改变，请重新确认');
      const execution = runActions(
        workspace,
        normalizeActions(config.actions),
        { pageId: found.page.id, ownerId: found.owner.id, buttonBlockId: found.block?.id },
        dispatch,
      );
      const changes = diffWorkspace(workspace, execution.workspace);
      workspace = execution.workspace;
      if (method === 'button.run')
        workspace = appendRun(workspace, {
          id: crypto.randomUUID(),
          at: Date.now(),
          kind: 'button',
          name: config.label || '按钮',
          ownerId: found.owner.id,
          sourceId: found.page.id,
          status: 'success',
          steps: execution.steps,
        });
      return result(
        { config, steps: execution.steps, effects: execution.effects, changes },
        method === 'button.run',
      );
    }
  }
  if (method === 'automation.list')
    return result(
      workspace.pages
        .filter(
          (page) => page.database && !page.trashedAt && (!params.databaseId || page.id === params.databaseId),
        )
        .flatMap((page) =>
          (page.database!.automations || []).map((rule) => ({
            databaseId: page.id,
            ...rule,
            clock: workspace.automationClocks?.[rule.id] || null,
          })),
        ),
    );
  if (method.startsWith('automation.')) {
    const owner = requireDatabase(workspace, params.databaseId),
      rules = owner.database.automations || [],
      old =
        rules.find((rule) => rule.id === params.automationId) ||
        (method === 'automation.preview' && params.rule
          ? ({
              ...params.rule,
              id: params.automationId,
              actions: normalizeActions(params.rule.actions || []),
              triggers: (params.rule.triggers || []).map((trigger: any) => ({
                ...trigger,
                id: trigger.id || crypto.randomUUID(),
              })),
            } as DatabaseAutomation)
          : undefined);
    if (method === 'automation.get') {
      if (!old) throw new CommandError('AUTOMATION_NOT_FOUND', '未找到自动化');
      return result(old);
    }
    if (method === 'automation.create' || method === 'automation.update') {
      requireEditable(owner);
      if (method === 'automation.update' && !old)
        throw new CommandError('AUTOMATION_NOT_FOUND', '未找到自动化');
      const rule: DatabaseAutomation = {
        id: old?.id || crypto.randomUUID(),
        name: '新自动化',
        enabled: true,
        triggers: [],
        actions: [],
        ...old,
        ...params.rule,
      };
      rule.id = old?.id || rule.id;
      if (rule.schedule)
        rule.schedule = {
          ...defaultRule(),
          ...old?.schedule,
          ...rule.schedule,
          enabled: true,
          id: old?.schedule?.id || crypto.randomUUID(),
        };
      rule.actions = normalizeActions(rule.actions);
      rule.triggers = rule.triggers.map((trigger) => ({ ...trigger, id: trigger.id || crypto.randomUUID() }));
      validateAutomation(rule);
      validateScope(rule, owner);
      delete rule.disabledReason;
      perform('page.update', {
        pageId: owner.id,
        changes: {
          database: {
            ...owner.database,
            automations: old ? rules.map((value) => (value.id === old.id ? rule : value)) : [...rules, rule],
          },
        },
      });
      return result(rule, true);
    }
    if (!old) throw new CommandError('AUTOMATION_NOT_FOUND', '未找到自动化');
    if (['automation.pause', 'automation.resume', 'automation.delete'].includes(method)) {
      if (method === 'automation.resume') validateScope(old, owner);
      const automations =
        method === 'automation.delete'
          ? rules.filter((rule) => rule.id !== old.id)
          : rules.map((rule) =>
              rule.id === old.id
                ? { ...rule, enabled: method === 'automation.resume', disabledReason: undefined }
                : rule,
            );
      perform('page.update', { pageId: owner.id, changes: { database: { ...owner.database, automations } } });
      return result({ id: old.id }, true);
    }
    if (method === 'automation.run' || method === 'automation.preview') {
      requireEditable(owner);
      const page = requirePage(workspace, params.pageId || owner.id),
        definition = params.rule ? { ...old, ...params.rule } : old;
      validateAutomation(definition);
      if (!definition.schedule && page.parentId !== owner.id)
        throw new CommandError('RECORD_REQUIRED', '请选择此数据库中的触发记录');
      const execution = runActions(
          workspace,
          definition.actions,
          { pageId: page.id, ownerId: owner.id, automationId: old.id },
          dispatch,
        ),
        changes = diffWorkspace(workspace, execution.workspace);
      workspace = execution.workspace;
      if (method === 'automation.run')
        workspace = appendRun(workspace, {
          id: crypto.randomUUID(),
          at: Date.now(),
          kind: 'automation',
          name: old.name,
          ownerId: owner.id,
          sourceId: page.id,
          status: 'success',
          steps: execution.steps,
        });
      return result(
        { steps: execution.steps, effects: execution.effects, changes },
        method === 'automation.run',
      );
    }
  }
  throw new CommandError('METHOD_NOT_FOUND', `未知动作方法 ${method}`);
}
