import type { Page, Workspace } from '../types';
import { ancestors, isInternalPage, plainText } from '../model';
import { activeView } from '../database/model';
import { addDays, dateKey, isHourlyPlan, planProjection, scheduledRange, parseDay } from '../database/dates';
import { dateEpoch, dateParts, dateText, dateWall, localTimeZone } from '../database/dateValue';
import { propertyDateValue } from '../database/propertySchema';
import { flattenBlocks } from './blocks';
import { reminderDue } from '../scheduling/engine';
import { CommandError } from './errors';

export type OverviewConfig = {
  view: 'agenda' | 'calendar' | 'board' | 'table' | 'timeline';
  date: string;
  scope: 'all' | 'today' | 'upcoming' | 'overdue' | 'unscheduled';
  spaceId: string;
  query: string;
  hideCompleted: boolean;
};
export type OverviewItem = {
  color: Page['color'];
  textColor: Page['textColor'];
  id: string;
  pageId: string;
  blockId?: string;
  databaseId?: string;
  spaceId: string;
  spaceTitle: string;
  title: string;
  kind: 'record' | 'todo' | 'reminder';
  start: string;
  end: string;
  time?: string;
  dateLabel?: string;
  done: boolean;
  status: string;
  url: string;
  doneProperty?: string;
  doneValue?: unknown;
  openValue?: unknown;
};
export function validateOverviewConfig(config: Partial<OverviewConfig>) {
  if (config.view && !['agenda', 'calendar', 'board', 'table', 'timeline'].includes(config.view))
    throw new CommandError('INVALID_VIEW', '综合页面视图无效');
  if (config.scope && !['all', 'today', 'upcoming', 'overdue', 'unscheduled'].includes(config.scope))
    throw new CommandError('INVALID_ARGUMENT', '综合页面范围无效');
  if (config.date && !parseDay(config.date)) throw new CommandError('INVALID_DATE', '日期需要 YYYY-MM-DD');
  if (config.query !== undefined && typeof config.query !== 'string')
    throw new CommandError('INVALID_ARGUMENT', 'query 必须是文本');
  if (config.hideCompleted !== undefined && typeof config.hideCompleted !== 'boolean')
    throw new CommandError('INVALID_ARGUMENT', 'hideCompleted 必须是布尔值');
}
export function overviewProjection(workspace: Workspace, changes: Partial<OverviewConfig> = {}) {
  const config: OverviewConfig = {
    view: 'agenda',
    date: dateKey(new Date()),
    scope: 'all',
    spaceId: '',
    query: '',
    hideCompleted: true,
    ...workspace.settings.overview,
    ...changes,
  };
  const items: OverviewItem[] = [];
  validateOverviewConfig(config);
  const pages = workspace.pages.filter((page) => !page.trashedAt && !isInternalPage(page, workspace.pages));
  for (const page of pages) {
    const root = [page, ...ancestors(workspace.pages, page.id)].find((parent) => parent.space);
    if (!root) continue;
    const base = {
      pageId: page.id,
      color: page.color,
      textColor: page.textColor,
      spaceId: root.id,
      spaceTitle: root.title,
      title: page.title || '无标题',
      url: `mininotion://page/${page.id}`,
    };
    const database = pages.find((parent) => parent.id === page.parentId && parent.database);
    if (database) {
      const view = activeView(database.database!);
      const plan = planProjection(database, view, [page]);
      const zone = isHourlyPlan(view) ? view.timeZone || localTimeZone() : undefined;
      const range = scheduledRange(page, plan.dateProperty, plan.endProperty, zone);
      const displayDate = (value: unknown) => {
        const parts = dateParts(value);
        if (!parts?.start.includes('T') || !zone) return parts;
        return {
          ...parts,
          start: new Date(dateEpoch(value)).toISOString(),
          ...(parts.end ? { end: new Date(dateEpoch(value, 'end')).toISOString() } : {}),
          timeZone: zone,
        };
      };
      const source = displayDate(propertyDateValue(page, plan.dateProperty));
      const end = plan.endProperty && displayDate(propertyDateValue(page, plan.endProperty));
      const displayStart = source && { ...source, ...(end ? { end: null } : {}) };
      const displayEnd = end && { ...end, end: null };
      const property = plan.doneProperty;
      const done = plan.isDone(page);
      items.push({
        ...base,
        id: page.id,
        kind: 'record',
        databaseId: database.id,
        start: range.start || '',
        end: range.end || '',
        time: dateWall(displayStart).slice(11, 16),
        dateLabel: dateText(displayStart) + (displayEnd ? ` → ${dateText(displayEnd)}` : ''),
        done,
        status: done
          ? '已完成'
          : property && page.values[property.id] && property.type !== 'checkbox'
            ? String(page.values[property.id])
            : '待办',
        doneProperty: property?.id,
        doneValue: property?.type === 'checkbox' ? true : plan.doneValue,
        openValue:
          property?.type === 'checkbox'
            ? false
            : property?.statusGroups?.todo[0] ||
              property?.options?.find((value) => value !== plan.doneValue) ||
              '',
      });
    }
    for (const { block } of flattenBlocks(page.blocks)) {
      if (block.type !== 'checkListItem' || !block.id) continue;
      items.push({
        ...base,
        id: `${page.id}:${block.id}`,
        blockId: block.id,
        title: plainText([block]) || '待办',
        kind: 'todo',
        start: '',
        end: '',
        done: !!block.props?.checked,
        status: block.props?.checked ? '已完成' : '待办',
      });
    }
    for (const reminder of page.reminders || []) {
      if (!reminder.enabled || reminder.deletedAt) continue;
      const due = reminderDue(page, reminder, workspace);
      if (!due) continue;
      const date = new Date(due),
        start = dateKey(date);
      items.push({
        ...base,
        id: reminder.id,
        title: reminder.text || page.title,
        kind: 'reminder',
        start,
        end: start,
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        done: !!workspace.scheduler?.reminders[reminder.id]?.deliveredAt,
        status: '提醒',
      });
    }
  }
  const today = config.date;
  const matches = items.filter(
    (item) =>
      (!config.spaceId || item.spaceId === config.spaceId) &&
      (!config.query ||
        `${item.title} ${item.spaceTitle} ${item.status}`.toLowerCase().includes(config.query.toLowerCase())),
  );
  const counts = {
    today: matches.filter((i) => !i.done && i.start && i.start <= today && i.end >= today).length,
    overdue: matches.filter((i) => !i.done && i.end && i.end < today).length,
    upcoming: matches.filter((i) => !i.done && i.start > today).length,
    unscheduled: matches.filter((i) => !i.done && !i.start).length,
  };
  const filtered = matches
    .filter(
      (i) =>
        (!config.hideCompleted || !i.done) &&
        (config.scope === 'all' ||
          (config.scope === 'today' && i.start && i.start <= today && i.end >= today) ||
          (config.scope === 'upcoming' && i.start > today) ||
          (config.scope === 'overdue' && i.end && i.end < today) ||
          (config.scope === 'unscheduled' && !i.start)),
    )
    .sort(
      (a, b) =>
        (a.start || '9999').localeCompare(b.start || '9999') ||
        (a.time || '').localeCompare(b.time || '') ||
        a.title.localeCompare(b.title),
    );
  const grouped = new Map<string, OverviewItem[]>();
  for (const item of filtered) {
    const key = config.view === 'board' ? item.status : item.start || '未排期';
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }
  const groups = [...grouped].map(([name, items]) => ({ name, items }));
  const anchor = parseDay(config.date) || new Date();
  const month = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const first = addDays(month, -((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = dateKey(addDays(first, index));
    return { date, items: filtered.filter((item) => item.start && item.start <= date && item.end >= date) };
  });
  return {
    config,
    counts,
    items: filtered,
    groups,
    days,
    spaces: pages.filter((page) => page.space).map((page) => ({ id: page.id, title: page.title })),
  };
}
