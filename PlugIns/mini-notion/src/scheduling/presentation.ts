import type { DatabaseView, Page, Workspace } from '../types';
import { dateParts, dateWall, dateText, localTimeZone, zonedDate } from '../database/dateValue';
import { isHourlyPlan, planProjection, scheduledTimes } from '../database/dates';
import { propertyDateValue } from '../database/propertySchema';
import { repeatLabel } from './recurrence';
import type { RepeatRule } from './types';

export type EventTone = 'neutral' | 'scheduled' | 'done' | 'warning';
export type EventInfo = {
  title: string; icon?: string; when: string; fullWhen: string;
  status: string; tone: EventTone; repeat: string; reminders: number; owner: string;
};
const indexes = new WeakMap<Page[], Map<string, Page>>();
export function pageIndex(pages: Page[]) {
  let index = indexes.get(pages);
  if (!index) { index = new Map(pages.map(page => [page.id, page])); indexes.set(pages, index); }
  return index;
}
export function repeatSummary(rule: RepeatRule) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const detail = rule.frequency === 'weekly' && rule.weekdays?.length
    ? `周${rule.weekdays.map(day => days[day % 7]).join('、')}`
    : rule.frequency === 'monthly'
      ? rule.monthMode === 'lastDay' ? '月末' : rule.monthMode === 'nthWeekday'
        ? `${rule.ordinal === -1 ? '最后' : `第 ${rule.ordinal}`}个周${days[(rule.weekday || 0) % 7]}`
        : `${rule.monthDay || Number(rule.startDate.slice(-2))} 日`
      : rule.frequency === 'yearly' ? rule.startDate.slice(5).replace('-', '月') + '日' : '';
  return [repeatLabel(rule), detail].filter(Boolean).join(' · ');
}
export function eventSignals(page: Page, pages: Page[]) {
  const origin = page.automationOrigin;
  const template = origin && pageIndex(pages).get(origin.templateId);
  return {
    repeat: origin?.manual ? '手动生成' : origin
      ? template?.repeat ? `循环 · ${repeatSummary(template.repeat)}` : '循环生成 · 原模板已移除'
      : page.repeat ? `循环模板 · ${repeatSummary(page.repeat)}` : '',
    reminders: (page.reminders || []).filter(reminder => reminder.enabled && !reminder.deletedAt).length,
  };
}
/** One text contract for calendars, timelines, cards and their accessible descriptions.
 * A missing end stays missing; layout fallback durations are never presented as real times. */
export function eventDate(start: string, end = '', timeZone = localTimeZone()) {
  if (!start) return { when: '未排期', fullWhen: '未排期' };
  const wall = (value: string) => value.includes('T')
    ? zonedDate(value, timeZone).toPlainDateTime().toString({ smallestUnit: 'minute' }) : value;
  const a = wall(start), b = end ? wall(end) : '';
  const timed = a.includes('T'), multiDay = !!b && a.slice(0, 10) !== b.slice(0, 10);
  const compact = (value: string) => `${value.slice(5, 10).replace('-', '/')} ${value.slice(11, 16)}`.trim();
  const when = timed
    ? `${a.slice(11, 16)}${b ? `–${multiDay ? compact(b) : b.slice(11, 16)}` : ' · 未设结束'}`
    : multiDay ? `${compact(a)}–${compact(b)} · 全天` : '全天';
  const offsets = timed && end ? [zonedDate(start, timeZone).offset, zonedDate(end, timeZone).offset] : [];
  const transition = offsets.length && offsets[0] !== offsets[1] ? ` · UTC${offsets[0]} → UTC${offsets[1]}` : '';
  return { when, fullWhen: `${a.replace('T', ' ')}${b ? ` → ${b.replace('T', ' ')}` : timed ? ' · 未设置结束时间' : ''}${timed ? ` · ${timeZone}${transition}` : ' · 全天'}` };
}
export function eventValue(value: unknown, pages: Page[]): string {
  if (Array.isArray(value)) return value.map(item => eventValue(item, pages)).filter(Boolean).join('、');
  if (value && typeof value === 'object') {
    if ('name' in value) return String(value.name);
    if ('id' in value) return pageIndex(pages).get(String(value.id))?.title || '';
    if ('start' in value) return dateText(value);
    return '';
  }
  if (typeof value === 'string') return pageIndex(pages).get(value)?.title || value;
  return value === true ? '是' : value === false || value == null ? '' : String(value);
}
export function eventDescription(info: EventInfo) {
  return [info.title, info.fullWhen, info.status, info.repeat, info.reminders ? `${info.reminders} 个提醒` : '', info.owner].filter(Boolean).join('\n');
}
/** Build the page/column lookup once per rendered surface, not once per event. */
export function eventPresenter(workspace: Workspace, database?: Page, view?: DatabaseView, now = new Date()) {
  const index = pageIndex(workspace.pages);
  const plans = new Map<string, ReturnType<typeof planProjection>>();
  const cache = new WeakMap<Page, EventInfo>();
  return (row: Page): EventInfo => {
    const saved = cache.get(row); if (saved) return saved;
    const db = database || index.get(row.parentId || '');
    let when = '未排期', fullWhen = when, status = '待办', tone: EventTone = 'neutral', owner = '';
    if (db?.database) {
      const current = view || db.database.views?.find(item => item.id === db.database!.activeViewId)
        || { id: 'event', name: '', type: 'table' as const };
      let plan = plans.get(db.id);
      if (!plan) { plan = planProjection(db, current, [], now); plans.set(db.id, plan); }
      const dates = scheduledTimes(row, plan.dateProperty, plan.endProperty);
      const source = dateParts(propertyDateValue(row, plan.dateProperty));
      const explicitEnd = plan.endProperty ? dateParts(propertyDateValue(row, plan.endProperty))?.start : source?.end;
      const zone = isHourlyPlan(current) ? current.timeZone || dates.timeZone : dates.timeZone;
      ({ when, fullWhen } = eventDate(dates.start, explicitEnd || '', zone));
      const value = plan.doneProperty && row.values[plan.doneProperty.id];
      status = plan.isDone(row) ? '已完成' : typeof value === 'string' && value ? value : dates.start ? '已排期' : '未排期';
      tone = plan.isDone(row) ? 'done' : dates.start ? 'scheduled' : 'neutral';
      if (!plan.isDone(row) && row.blockedBy?.some(id => { const target = index.get(id); return target && !target.trashedAt && !plan!.isDone(target); })) {
        status = `${status} · 有依赖`; tone = 'warning';
      }
      const due = explicitEnd ? dates.endTimestamp : dates.startTimestamp;
      const wallToday = zonedDate(now.toISOString(), zone).toPlainDate().toString();
      const overdue = dates.start.includes('T') ? due < now.getTime() : (explicitEnd || dateWall(source)).slice(0, 10) < wallToday;
      if (dates.start && overdue && plan.doneProperty && !plan.isDone(row) && !/取消|暂停|cancel|paused/i.test(status)) { status = `${status} · 逾期`; tone = 'warning'; }
      const person = db.database.columns.find(column => column.type === 'person')
        || db.database.columns.find(column => column.type === 'text' && /^(负责人|责任人|owner|assignee)$/i.test(column.name));
      const people = person && row.values[person.id];
      owner = Array.isArray(people) ? people.map(value => typeof value === 'object' && value ? (value as { name?: string }).name || '' : String(value)).filter(Boolean).join('、')
        : typeof people === 'string' ? people : '';
    }
    const info = { title: row.title || '无标题', icon: row.icon, when, fullWhen, status, tone, owner, ...eventSignals(row, workspace.pages) };
    cache.set(row, info); return info;
  };
}
