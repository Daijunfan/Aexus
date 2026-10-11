import { Temporal } from '@js-temporal/polyfill';
import type { Page, Workspace } from '../types.ts';
import type { InboxItem, Reminder, RepeatRun, SchedulerState } from './types.ts';
import { createTemplateRecord } from '../database/templatesModel.ts';
import {
  dateEpoch,
  dateParts,
  dateWall,
  hasTime,
  localTimeZone,
  makeDateValue,
  moveDateValue,
  zonedDate,
} from '../database/dateValue.ts';
import { isTemplatePage } from '../model.ts';
import { CommandError } from '../core/errors.ts';
import { firstCursor, nextOccurrence, previousOccurrence, repeatOccurrences } from './recurrence.ts';

export const emptyScheduler = (): SchedulerState => ({ repeats: {}, reminders: {}, runs: [] });
export const reminderTimeZone = (page: Page, reminder: Reminder) =>
  reminder.timeZone || dateParts(page.values[reminder.propertyId || ''])?.timeZone || localTimeZone();
export function reminderDue(page: Page, reminder: Reminder, workspace: Workspace): string | null {
  if (!reminder.enabled || reminder.deletedAt || page.trashedAt || isTemplatePage(page, workspace.pages))
    return null;
  if (reminder.at) return new Date(zonedDate(reminder.at, reminder.timeZone).epochMilliseconds).toISOString();
  const column = workspace.pages
    .find((parent) => parent.id === page.parentId)
    ?.database?.columns.find((column) => column.id === reminder.propertyId && column.type === 'date');
  const value = column ? page.values[column.id] : undefined,
    parts = dateParts(value);
  if (!parts) return null;
  const zone = reminderTimeZone(page, reminder);
  const date = hasTime(parts.start)
    ? zonedDate(new Date(dateEpoch(value)).toISOString(), zone)
    : zonedDate(parts.start + 'T' + (reminder.dayTime || '09:00'), zone);
  const due = date.subtract(
    reminder.unit === 'days' ? { days: reminder.offset || 0 } : { minutes: reminder.offset || 0 },
  );
  return new Date(due.epochMilliseconds).toISOString();
}
export function createRepeatInstance(
  workspace: Workspace,
  template: Page,
  occurrence: number,
  now = Date.now(),
  manual = false,
) {
  const rule = template.repeat;
  if (!rule || !template.templateFor || template.parentId !== template.templateFor)
    throw new CommandError('NOT_REPEATING', '请先为数据库模板设置循环');
  const owner = workspace.pages.find((page) => page.id === template.templateFor && !page.trashedAt);
  if (!owner?.database) throw new CommandError('DATABASE_NOT_FOUND', '模板所属数据库不可用');
  if (
    rule.dateProperty &&
    !owner.database.columns.some((column) => column.id === rule.dateProperty && column.type === 'date')
  )
    throw new CommandError('PROPERTY_NOT_FOUND', '循环计划的日期属性已不存在');
  const date = zonedDate(new Date(occurrence).toISOString(), rule.timeZone).add({
    days: rule.dateOffsetDays || 0,
  });
  const day = date.toPlainDate().toString();
  const tokens: Record<string, string> = {
    date: day,
    time: date.toPlainTime().toString({ smallestUnit: 'minute' }),
    weekday: ['一', '二', '三', '四', '五', '六', '日'][date.dayOfWeek - 1],
    year: String(date.year),
    month: String(date.month).padStart(2, '0'),
    day: String(date.day).padStart(2, '0'),
  };
  const title = rule.titlePattern
    ? rule.titlePattern.replace(/\{(date|time|weekday|year|month|day)\}/g, (_, key) => tokens[key])
    : template.title;
  const value = rule.includeTime
    ? makeDateValue(
        date.toString({ timeZoneName: 'never', smallestUnit: 'minute' }),
        rule.durationMinutes
          ? date
              .add({ minutes: rule.durationMinutes })
              .toString({ timeZoneName: 'never', smallestUnit: 'minute' })
          : undefined,
        rule.timeZone,
      )
    : day;
  const created = createTemplateRecord(
    workspace,
    owner.id,
    {
      title,
      values: rule.dateProperty ? { [rule.dateProperty]: value } : {},
      createdAt: now,
      updatedAt: now,
      automationOrigin: {
        templateId: template.id,
        scheduledFor: new Date(occurrence).toISOString(),
        ...(manual ? { manual: true } : {}),
      },
    },
    template.id,
  );
  const ids = new Set(workspace.pages.map((page) => page.id));
  const anchor = rule.dateProperty ? dateWall(template.values[rule.dateProperty]).slice(0, 10) : '';
  const shift =
    rule.shiftDates && anchor ? Temporal.PlainDate.from(anchor).until(Temporal.PlainDate.from(day)).days : 0;
  const pages = created.workspace.pages.map((page) => {
    if (ids.has(page.id)) return page;
    const values = { ...page.values };
    if (shift)
      for (const column of created.workspace.pages.find((parent) => parent.id === page.parentId)?.database
        ?.columns || []) {
        if (
          column.type !== 'date' ||
          !dateParts(values[column.id]) ||
          (page.id === created.page.id && column.id === rule.dateProperty)
        )
          continue;
        const oldDay = dateWall(values[column.id]).slice(0, 10);
        values[column.id] = moveDateValue(
          values[column.id],
          Temporal.PlainDate.from(oldDay).add({ days: shift }).toString(),
        );
      }
    return { ...page, values, createdAt: now, updatedAt: now };
  });
  const run: RepeatRun = {
    id: crypto.randomUUID(),
    templateId: template.id,
    scheduledFor: new Date(occurrence).toISOString(),
    createdAt: now,
    pageId: created.page.id,
    title,
    ...(manual ? { manual: true } : {}),
  };
  return { workspace: { ...created.workspace, pages }, run };
}
export function evaluateSchedules(workspace: Workspace, now = Date.now()) {
  let next = workspace,
    changed = false;
  const state = structuredClone(workspace.scheduler || emptyScheduler()),
    inbox = [...(workspace.inbox || [])];
  const runs: RepeatRun[] = [],
    notifications: InboxItem[] = [];
  for (const template of workspace.pages.filter(
    (page) => page.repeat?.enabled && page.templateFor && !page.trashedAt,
  )) {
    const rule = template.repeat!;
    if (
      !workspace.pages.some((page) => page.id === template.templateFor && page.database && !page.trashedAt) ||
      isTemplatePage(
        workspace.pages.find((page) => page.id === template.templateFor)!,
        workspace.pages,
      )
    )
      continue;
    const previous = state.repeats[rule.id] || { cursor: firstCursor(rule) };
    const latest = previousOccurrence(rule, now);
    if (latest === null || latest <= previous.cursor) continue;
    const due =
      rule.catchUp === 'all'
        ? repeatOccurrences(rule, previous.cursor, 100, now)
        : rule.catchUp === 'skip' && now - latest >= 60000
          ? []
          : [latest];
    let progress = { ...previous };
    try {
      for (const occurrence of due) {
        const created = createRepeatInstance(next, template, occurrence, now);
        next = created.workspace;
        runs.push(created.run);
        progress = {
          cursor: occurrence,
          lastRunAt: now,
          lastPageId: created.run.pageId,
          generated: (progress.generated || 0) + 1,
        };
        changed = true;
      }
      if (!due.length) progress = { ...progress, cursor: latest };
      if (JSON.stringify(progress) !== JSON.stringify(previous)) {
        state.repeats[rule.id] = progress;
        changed = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (progress.error !== message) {
        state.repeats[rule.id] = { ...progress, error: message };
        changed = true;
      }
    }
  }
  for (const page of next.pages)
    for (const reminder of page.reminders || []) {
      const key = reminderDue(page, reminder, next);
      if (!key) continue;
      const previous = state.reminders[reminder.id],
        delivery = previous?.key === key ? previous : { key };
      const due = delivery.snoozedUntil || key;
      if (delivery.deliveredAt !== undefined || Date.parse(due) > now) continue;
      const item: InboxItem = {
        id: crypto.randomUUID(),
        pageId: page.id,
        reminderId: reminder.id,
        reminderKey: key,
        title: page.title || '无标题',
        text: reminder.text || '该查看这项安排了',
        scheduledFor: due,
        createdAt: now,
      };
      state.reminders[reminder.id] = { ...delivery, deliveredAt: now };
      inbox.push(item);
      notifications.push(item);
      changed = true;
    }
  if (runs.length) state.runs = [...state.runs, ...runs].slice(-300);
  const candidate = changed
    ? { ...next, scheduler: state, ...(notifications.length ? { inbox } : {}) }
    : workspace;
  return {
    workspace: candidate,
    changed,
    runs,
    notifications,
    pendingTemplates: schedulingStatus(candidate, now)
      .repeats.filter((item) => item.overdue)
      .map((item) => item.templateId),
  };
}
export function schedulingStatus(workspace: Workspace, now = Date.now()) {
  const state = workspace.scheduler || emptyScheduler();
  return {
    repeats: workspace.pages
      .filter((page) => page.repeat && !page.trashedAt)
      .map((page) => {
        const rule = page.repeat!,
          runtime = state.repeats[rule.id];
        const available =
          !!page.templateFor &&
          page.parentId === page.templateFor &&
          workspace.pages.some(
            (owner) =>
              owner.id === page.templateFor &&
              owner.database &&
              !owner.trashedAt &&
              !isTemplatePage(owner, workspace.pages),
          );
        const next =
          rule.enabled && available ? nextOccurrence(rule, runtime?.cursor ?? firstCursor(rule)) : null;
        return {
          templateId: page.id,
          title: page.title,
          databaseId: page.templateFor,
          rule,
          runtime: runtime || null,
          available,
          nextAt: next === null ? null : new Date(next).toISOString(),
          overdue: next !== null && next <= now,
        };
      }),
    reminders: workspace.pages.flatMap((page) =>
      (page.reminders || [])
        .filter((reminder) => !reminder.deletedAt && !isTemplatePage(page, workspace.pages))
        .map((reminder) => {
          const key = reminderDue(page, reminder, workspace),
            stateFor = state.reminders[reminder.id],
            runtime = stateFor?.key === key ? stateFor : undefined;
          return {
            ...reminder,
            pageId: page.id,
            pageTitle: page.title,
            dueAt: runtime?.snoozedUntil || key,
            displayTimeZone: reminderTimeZone(page, reminder),
            pageTrashed: !!page.trashedAt,
            deliveredAt: runtime?.deliveredAt || null,
            available: !page.trashedAt && !!key,
          };
        }),
    ),
    unread: (workspace.inbox || []).filter((item) => !item.readAt && !item.archivedAt).length,
  };
}
