import { Temporal } from '@js-temporal/polyfill';
import type { Page, Workspace } from '../types.ts';
import type { Reminder, RepeatRule } from './types.ts';
import { requireDatabase, requireEditable, requirePage } from '../core/access.ts';
import { CommandError, requiredString } from '../core/errors.ts';
import type { CommandParams } from '../core/protocol.ts';
import { isTemplatePage } from '../model.ts';
import { localTimeZone, zonedDate } from '../database/dateValue.ts';
import { createRepeatInstance, emptyScheduler, reminderDue, schedulingStatus } from './engine.ts';
import { repeatOccurrences, validateRepeat } from './recurrence.ts';

export function parseScheduleTime(value: unknown, zone = localTimeZone()) {
  try {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return zonedDate(requiredString(value, 'at'), zone || localTimeZone()).epochMilliseconds;
  } catch {
    throw new CommandError('INVALID_TIME', '请输入有效的 ISO 日期时间和时区');
  }
}
export function validateReminder(reminder: Reminder) {
  if (
    typeof reminder.id !== 'string' ||
    !reminder.id ||
    typeof reminder.enabled !== 'boolean' ||
    !!reminder.at === !!reminder.propertyId ||
    (reminder.text !== undefined && typeof reminder.text !== 'string') ||
    (reminder.offset !== undefined && !Number.isInteger(reminder.offset)) ||
    (reminder.unit !== undefined && !['minutes', 'days'].includes(reminder.unit))
  )
    throw new CommandError('INVALID_REMINDER', '提醒需要一个固定时间或日期属性');
  if (reminder.at) parseScheduleTime(reminder.at, reminder.timeZone);
  if (reminder.dayTime && !/^\d{2}:\d{2}$/.test(reminder.dayTime))
    throw new CommandError('INVALID_REMINDER', '全天提醒时间需要 HH:mm');
  try {
    zonedDate('2000-01-01T' + (reminder.dayTime || '09:00'), reminder.timeZone || localTimeZone());
  } catch {
    throw new CommandError('INVALID_REMINDER', '提醒的时区或全天时间无效');
  }
}
function requireTemplate(workspace: Workspace, id: string) {
  const page = requirePage(workspace, id);
  if (!page.templateFor || page.parentId !== page.templateFor)
    throw new CommandError('NOT_A_TEMPLATE', '请选择数据库模板');
  requireDatabase(workspace, page.templateFor);
  return page;
}
export function defaultRule(): RepeatRule {
  const zone = localTimeZone(),
    day = Temporal.Now.zonedDateTimeISO(zone);
  return {
    id: crypto.randomUUID(),
    enabled: true,
    frequency: 'daily',
    interval: 1,
    startDate: day.toPlainDate().toString(),
    time: '09:00',
    timeZone: zone,
    weekdays: [day.dayOfWeek],
    catchUp: 'latest',
  };
}
export function executeSchedulingCommand(workspace: Workspace, method: string, params: CommandParams) {
  if (
    !method.startsWith('repeat.') &&
    !method.startsWith('reminder.') &&
    !method.startsWith('inbox.') &&
    method !== 'scheduler.status'
  )
    return;
  const result = (value: any, changed = false) => ({ workspace, result: value, changed });
  const replace = (page: Page) => {
    workspace = {
      ...workspace,
      pages: workspace.pages.map((item) => (item.id === page.id ? { ...page, updatedAt: Date.now() } : item)),
    };
  };
  if (method === 'scheduler.status') return result(schedulingStatus(workspace));
  if (method === 'repeat.list')
    return result(
      schedulingStatus(workspace).repeats.filter(
        (item) => !params.databaseId || item.databaseId === params.databaseId,
      ),
    );
  if (method === 'repeat.history')
    return result(
      (workspace.scheduler?.runs || [])
        .filter((run) => !params.templateId || run.templateId === params.templateId)
        .slice()
        .reverse(),
    );
  if (method === 'repeat.get') {
    const page = requirePage(workspace, params.templateId, true);
    return result(
      schedulingStatus(workspace).repeats.find((item) => item.templateId === page.id) || {
        templateId: page.id,
        rule: page.repeat || null,
      },
    );
  }
  if (method === 'repeat.preview') {
    const template = requireTemplate(workspace, params.templateId),
      rule = { ...defaultRule(), ...template.repeat, ...params.rule };
    validateRepeat(rule);
    const count = params.count ?? 5;
    if (!Number.isInteger(count) || count < 1 || count > 100)
      throw new CommandError('INVALID_ARGUMENT', 'count 需要 1–100');
    const after = params.after ? parseScheduleTime(params.after, rule.timeZone) : Date.now();
    return result(
      repeatOccurrences(rule, after, count).map((at) => ({
        at: new Date(at).toISOString(),
        local: zonedDate(new Date(at).toISOString(), rule.timeZone).toString({ smallestUnit: 'minute' }),
        timeZone: rule.timeZone,
      })),
    );
  }
  if (method.startsWith('repeat.')) {
    const template = ['repeat.pause', 'repeat.resume', 'repeat.remove'].includes(method)
      ? requirePage(workspace, params.templateId, true)
      : requireTemplate(workspace, params.templateId);
    if (method !== 'repeat.run') requireEditable(template);
    if (method === 'repeat.configure') {
      const owner = requireDatabase(workspace, template.templateFor!);
      requireEditable(owner);
      const rule: RepeatRule = {
        ...defaultRule(),
        ...(template.repeat
          ? {}
          : { dateProperty: owner.database.columns.find((column) => column.type === 'date')?.id }),
        ...template.repeat,
        ...params.rule,
        id: template.repeat?.id || crypto.randomUUID(),
      };
      validateRepeat(rule);
      if (rule.weekdays) rule.weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
      if (
        rule.dateProperty &&
        !owner.database.columns.some((column) => column.id === rule.dateProperty && column.type === 'date')
      )
        throw new CommandError('INVALID_DATE_PROPERTY', '请选择此数据库的日期属性');
      replace({ ...template, repeat: rule });
      return result(rule, true);
    }
    if (!template.repeat) throw new CommandError('NOT_REPEATING', '此模板尚未设置循环');
    if (method === 'repeat.pause' || method === 'repeat.resume') {
      replace({ ...template, repeat: { ...template.repeat, enabled: method === 'repeat.resume' } });
      return result(workspace.pages.find((page) => page.id === template.id)!.repeat, true);
    }
    if (method === 'repeat.remove') {
      const copy = { ...template };
      delete copy.repeat;
      replace(copy);
      return result({ removed: template.id }, true);
    }
    if (method === 'repeat.run') {
      const now = Date.now(),
        occurrence = params.at !== undefined ? parseScheduleTime(params.at, template.repeat.timeZone) : now,
        created = createRepeatInstance(workspace, template, occurrence, now, true);
      const state = structuredClone(workspace.scheduler || emptyScheduler());
      state.runs = [...state.runs, created.run].slice(-300);
      workspace = { ...created.workspace, scheduler: state };
      return result(created.run, true);
    }
  }
  if (method === 'reminder.list')
    return result(
      workspace.pages
        .filter(
          (page) =>
            (!params.pageId || page.id === params.pageId) &&
            (params.all || !page.trashedAt) &&
            (params.pageId || !isTemplatePage(page, workspace.pages)),
        )
        .flatMap((page) =>
          (page.reminders || [])
            .filter((reminder) => params.all || !reminder.deletedAt)
            .map((reminder) => {
              const key = reminderDue(page, reminder, workspace),
                saved = workspace.scheduler?.reminders[reminder.id],
                state = saved?.key === key ? saved : undefined;
              return {
                ...reminder,
                pageId: page.id,
                pageTitle: page.title,
                dueAt: state?.snoozedUntil || key,
                deliveredAt: state?.deliveredAt || null,
              };
            }),
        ),
    );
  if (method.startsWith('reminder.')) {
    const page = requirePage(workspace, params.pageId),
      existing = (page.reminders || []).find((reminder) => reminder.id === params.reminderId);
    if (method !== 'reminder.add' && !existing) throw new CommandError('REMINDER_NOT_FOUND', '未找到提醒');
    if (method === 'reminder.get') return result(existing);
    if (method === 'reminder.snooze') {
      const key = reminderDue(page, existing!, workspace);
      if (!key) throw new CommandError('REMINDER_UNAVAILABLE', '提醒已停用或日期不可用');
      const notification = params.inboxId
        ? workspace.inbox?.find((item) => item.id === params.inboxId)
        : undefined;
      if (notification && notification.reminderKey !== key)
        throw new CommandError('REMINDER_CHANGED', '原提醒的日期已改变，请使用当前提醒');
      const until = parseScheduleTime(params.until, existing!.timeZone);
      if (until <= Date.now()) throw new CommandError('INVALID_TIME', '稍后提醒需要未来的时间');
      const state = structuredClone(workspace.scheduler || emptyScheduler());
      state.reminders[existing!.id] = { key, snoozedUntil: new Date(until).toISOString() };
      workspace = {
        ...workspace,
        scheduler: state,
        inbox: (workspace.inbox || []).map((item) =>
          item.reminderId === existing!.id && item.reminderKey === key
            ? { ...item, readAt: Date.now(), archivedAt: Date.now() }
            : item,
        ),
      };
      return result(state.reminders[existing!.id], true);
    }
    let reminder: Reminder;
    if (method === 'reminder.add' || method === 'reminder.update') {
      const changes = {
        ...params.changes,
        ...Object.fromEntries(
          ['at', 'propertyId', 'offset', 'unit', 'dayTime', 'timeZone', 'text', 'enabled']
            .filter((key) => params[key] !== undefined)
            .map((key) => [key, params[key]]),
        ),
      };
      reminder = { enabled: true, ...existing, ...changes, id: existing?.id || crypto.randomUUID() };
      if (changes.at) {
        reminder.at = new Date(
          parseScheduleTime(
            String(changes.at).includes('T') ? changes.at : changes.at + 'T' + (reminder.dayTime || '09:00'),
            reminder.timeZone,
          ),
        ).toISOString();
        delete reminder.propertyId;
      }
      if (changes.propertyId) delete reminder.at;
      if (
        reminder.enabled &&
        reminder.propertyId &&
        !workspace.pages
          .find((parent) => parent.id === page.parentId)
          ?.database?.columns.some((column) => column.id === reminder.propertyId && column.type === 'date')
      )
        throw new CommandError('INVALID_DATE_PROPERTY', '请选择此记录的日期属性');
      validateReminder(reminder);
    } else if (method === 'reminder.delete') reminder = { ...existing!, deletedAt: Date.now() };
    else if (method === 'reminder.restore') reminder = { ...existing!, deletedAt: null };
    else throw new CommandError('METHOD_NOT_FOUND', `未知提醒方法 ${method}`);
    replace({
      ...page,
      reminders: existing
        ? page.reminders!.map((item) => (item.id === existing.id ? reminder : item))
        : [...(page.reminders || []), reminder],
    });
    return result(reminder, true);
  }
  if (method === 'inbox.list')
    return result(
      (workspace.inbox || [])
        .filter((item) =>
          params.status === 'archived'
            ? !!item.archivedAt
            : params.status === 'all'
              ? true
              : !item.archivedAt && (params.status !== 'unread' || !item.readAt),
        )
        .slice()
        .reverse(),
    );
  if (method === 'inbox.get') {
    const item = workspace.inbox?.find((item) => item.id === params.id);
    if (!item) throw new CommandError('NOTIFICATION_NOT_FOUND', '未找到通知');
    return result(item);
  }
  if (['inbox.read', 'inbox.unread', 'inbox.archive', 'inbox.restore'].includes(method)) {
    if (!params.all && !workspace.inbox?.some((item) => item.id === params.id))
      throw new CommandError('NOTIFICATION_NOT_FOUND', '未找到通知');
    const field = method === 'inbox.read' || method === 'inbox.unread' ? 'readAt' : 'archivedAt',
      value = method === 'inbox.unread' || method === 'inbox.restore' ? null : Date.now();
    let count = 0;
    workspace = {
      ...workspace,
      inbox: (workspace.inbox || []).map((item) => {
        if (!params.all && item.id !== params.id) return item;
        count++;
        return { ...item, [field]: value, ...(method === 'inbox.archive' ? { readAt: Date.now() } : {}) };
      }),
    };
    return result({ updated: count }, !!count);
  }
  throw new CommandError('METHOD_NOT_FOUND', `未知调度方法 ${method}`);
}

export function clearScheduleProperty(
  workspace: Workspace,
  databaseId: string,
  propertyId: string,
): Workspace {
  return {
    ...workspace,
    pages: workspace.pages.map((page) =>
      page.parentId !== databaseId
        ? page
        : {
            ...page,
            ...(page.repeat?.dateProperty === propertyId
              ? { repeat: { ...page.repeat, dateProperty: undefined } }
              : {}),
            ...(page.reminders?.some((reminder) => reminder.propertyId === propertyId)
              ? {
                  reminders: page.reminders.map((reminder) =>
                    reminder.propertyId === propertyId ? { ...reminder, enabled: false } : reminder,
                  ),
                }
              : {}),
          },
    ),
  };
}
