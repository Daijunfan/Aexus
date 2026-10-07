import { Temporal } from '@js-temporal/polyfill';
import type { RepeatRule } from './types.ts';
import { zonedDate } from '../database/dateValue.ts';
import { CommandError } from '../core/errors.ts';

export function validateRepeat(rule: RepeatRule) {
  try {
    if (
      typeof rule.id !== 'string' ||
      !rule.id ||
      typeof rule.enabled !== 'boolean' ||
      !['daily', 'weekly', 'monthly', 'yearly'].includes(rule.frequency) ||
      !Number.isInteger(rule.interval) ||
      rule.interval < 1
    )
      throw Error();
    const start = Temporal.PlainDate.from(rule.startDate);
    if (rule.endDate && Temporal.PlainDate.compare(Temporal.PlainDate.from(rule.endDate), start) < 0)
      throw Error();
    if (!/^\d{2}:\d{2}$/.test(rule.time)) throw Error();
    zonedDate(rule.startDate + 'T' + rule.time, rule.timeZone);
    if (!['latest', 'all', 'skip'].includes(rule.catchUp)) throw Error();
    if (
      rule.frequency === 'weekly' &&
      (!rule.weekdays?.length || rule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    )
      throw Error();
    if (rule.monthMode && !['day', 'lastDay', 'nthWeekday'].includes(rule.monthMode)) throw Error();
    if (
      rule.monthDay !== undefined &&
      (!Number.isInteger(rule.monthDay) || rule.monthDay < 1 || rule.monthDay > 31)
    )
      throw Error();
    if (
      rule.monthMode === 'nthWeekday' &&
      (![1, 2, 3, 4, -1].includes(rule.ordinal!) ||
        !Number.isInteger(rule.weekday) ||
        rule.weekday! < 1 ||
        rule.weekday! > 7)
    )
      throw Error();
    if (
      rule.durationMinutes !== undefined &&
      (!Number.isInteger(rule.durationMinutes) || rule.durationMinutes < 0)
    )
      throw Error();
    if (rule.titlePattern !== undefined && typeof rule.titlePattern !== 'string') throw Error();
    if (rule.dateOffsetDays !== undefined && !Number.isInteger(rule.dateOffsetDays)) throw Error();
  } catch {
    throw new CommandError('INVALID_REPEAT', '循环规则无效，请检查日期、时间、时区和间隔');
  }
}
const monthIndex = (date: Temporal.PlainDate) => date.year * 12 + date.month - 1;
function cycleDates(rule: RepeatRule, cycle: number) {
  const start = Temporal.PlainDate.from(rule.startDate);
  if (rule.frequency === 'daily') return [start.add({ days: cycle * rule.interval })];
  if (rule.frequency === 'weekly') {
    const monday = start.subtract({ days: start.dayOfWeek - 1 }).add({ weeks: cycle * rule.interval });
    return [...new Set(rule.weekdays || [start.dayOfWeek])]
      .sort((a, b) => a - b)
      .map((day) => monday.add({ days: day - 1 }));
  }
  const month = start
    .with({ day: 1 })
    .add(rule.frequency === 'yearly' ? { years: cycle * rule.interval } : { months: cycle * rule.interval });
  if (rule.monthMode === 'lastDay') return [month.with({ day: month.daysInMonth })];
  if (rule.monthMode === 'nthWeekday') {
    if (rule.ordinal === -1) {
      const last = month.with({ day: month.daysInMonth });
      return [last.subtract({ days: (last.dayOfWeek - rule.weekday! + 7) % 7 })];
    }
    return [month.add({ days: ((rule.weekday! - month.dayOfWeek + 7) % 7) + (rule.ordinal! - 1) * 7 })];
  }
  return [month.with({ day: Math.min(rule.monthDay || start.day, month.daysInMonth) })];
}
function nearest(rule: RepeatRule, boundary: number, direction: 1 | -1): number | null {
  const start = Temporal.PlainDate.from(rule.startDate);
  const day = zonedDate(new Date(boundary).toISOString(), rule.timeZone).toPlainDate();
  const units =
    rule.frequency === 'daily'
      ? start.until(day).days
      : rule.frequency === 'weekly'
        ? Math.floor(start.subtract({ days: start.dayOfWeek - 1 }).until(day).days / 7)
        : rule.frequency === 'monthly'
          ? monthIndex(day) - monthIndex(start)
          : day.year - start.year;
  let cycle = Math.floor(units / rule.interval);
  if (direction === 1) cycle = Math.max(0, cycle);
  for (let attempts = 0; attempts < 3 && cycle >= 0; attempts++, cycle += direction) {
    const dates = cycleDates(rule, cycle);
    if (direction === -1) dates.reverse();
    for (const date of dates) {
      if (Temporal.PlainDate.compare(date, start) < 0 || (rule.endDate && date.toString() > rule.endDate))
        continue;
      const at = zonedDate(date.toString() + 'T' + rule.time, rule.timeZone).epochMilliseconds;
      if (direction === 1 ? at > boundary : at <= boundary) return at;
    }
  }
  return null;
}
export const nextOccurrence = (rule: RepeatRule, after: number) => nearest(rule, after, 1);
export function previousOccurrence(rule: RepeatRule, through: number) {
  const end = rule.endDate ? zonedDate(rule.endDate + 'T23:59:59', rule.timeZone).epochMilliseconds : through;
  return nearest(rule, Math.min(through, end), -1);
}
export function repeatOccurrences(rule: RepeatRule, after: number, count = 5, through = Infinity) {
  const result: number[] = [];
  let cursor = after;
  for (let index = 0; index < count; index++) {
    const next = nextOccurrence(rule, cursor);
    if (next === null || next > through) break;
    result.push(next);
    cursor = next;
  }
  return result;
}
export const firstCursor = (rule: RepeatRule) =>
  zonedDate(rule.startDate + 'T00:00', rule.timeZone).epochMilliseconds - 1;
export function repeatLabel(rule: RepeatRule) {
  const unit = { daily: '天', weekly: '周', monthly: '月', yearly: '年' }[rule.frequency];
  return `每${rule.interval === 1 ? '' : rule.interval}${unit} ${rule.time}${rule.enabled ? '' : ' · 已暂停'}`;
}
