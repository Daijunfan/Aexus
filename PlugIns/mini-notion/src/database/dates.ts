import { isSelectProperty, isDateProperty, propertyDateValue } from './propertySchema.ts';
import {
  dateWall,
  dateParts,
  moveDateValue,
  resizeDateValue,
  dateEpoch,
  zonedDate,
  localTimeZone,
} from './dateValue.ts';
import type { DatabaseView, Page, Property } from '../types.ts';

export const dateKey = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const parseDay = (value: unknown) => {
  if (!value) return null;
  const key = dateWall(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(key + 'T12:00:00');
  return Number.isNaN(date.getTime()) || dateKey(date) !== key ? null : date;
};
export const addDays = (date: Date, count: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);
export const timelineScales = {
  week: { days: 42, width: 74 },
  month: { days: 100, width: 30 },
  quarter: { days: 180, width: 15 },
  year: { days: 366, width: 7 },
};
export function scheduleFields(page: Page, view: DatabaseView) {
  const dates = page
    .database!.columns.filter(isDateProperty)
    .sort((a, b) => Number(b.type === 'date') - Number(a.type === 'date'));
  const start =
    dates.find(
      (column) =>
        column.id ===
        (view.calendarBy || page.database!.calendarBy || page.database!.dependencies?.dateProperty),
    ) || dates[0];
  const endId =
    view.timelineEnd !== undefined
      ? view.timelineEnd
      : page.database!.dependencies
        ? page.database!.dependencies.endProperty || ''
        : undefined;
  const end =
    dates.find((column) => column.id === endId && column.id !== start?.id) ||
    (endId === undefined && view.type === 'timeline'
      ? dates.find((column) => column.id !== start?.id)
      : undefined);
  return { start, end };
}
export const planModes: Record<NonNullable<DatabaseView['planMode']>, string> = {
  week: '周计划',
  day: '日计划',
  agenda: '议程',
  hourWeek: '周时间表',
  hourDay: '日时间表',
};
export const isHourlyPlan = (view: DatabaseView) =>
  view.type === 'plan' && ['hourDay', 'hourWeek'].includes(view.planMode || '');
export const isDayPlan = (view: DatabaseView) =>
  view.type === 'plan' && ['day', 'hourDay'].includes(view.planMode || '');
export function scheduledRange(
  row: Page,
  startId: string | Property | undefined,
  endId?: string | Property,
  timeZone?: string,
) {
  const day = (value: unknown, endpoint: 'start' | 'end' = 'start') => {
    const parts = dateParts(value),
      stamp = dateEpoch(value, endpoint);
    return parseDay(
      timeZone && parts?.start.includes('T') && Number.isFinite(stamp)
        ? zonedDate(new Date(stamp).toISOString(), timeZone).toPlainDate().toString()
        : dateWall(value, endpoint),
    );
  };
  const source = propertyDateValue(row, startId),
    endValue = endId ? propertyDateValue(row, endId) : source;
  const endpoint = endId ? 'start' : 'end',
    parts = dateParts(endValue),
    endStamp = dateEpoch(endValue, endpoint);
  const first = day(source);
  let last = day(endValue, endpoint);
  if (parts && (parts[endpoint] || parts.start).includes('T') && endStamp > dateEpoch(source)) {
    const endpointZone = timeZone || parts.timeZone || localTimeZone();
    const end = zonedDate(new Date(endStamp).toISOString(), endpointZone);
    if (end.toPlainTime().toString() === '00:00:00')
      last = parseDay(
        zonedDate(new Date(endStamp - 1).toISOString(), endpointZone)
          .toPlainDate()
          .toString(),
      );
  }
  const start = first ? dateKey(first) : '';
  return { start, end: first && last && last >= first ? dateKey(last) : start };
}
export function moveScheduledRecord(
  row: Page,
  startId: string,
  endId: string | undefined,
  date: string,
  grabbedDate?: string,
) {
  if (!date) return { ...row.values, [startId]: '', ...(endId ? { [endId]: '' } : {}) };
  const target = parseDay(date)!;
  const oldStart = parseDay(row.values[startId]),
    oldEnd = parseDay(row.values[endId || '']);
  const grabbed = parseDay(grabbedDate);
  const start =
    oldStart && grabbed
      ? addDays(oldStart, Math.round((target.getTime() - grabbed.getTime()) / 86400000))
      : target;
  const values = { ...row.values, [startId]: moveDateValue(row.values[startId], dateKey(start)) };
  if (endId && oldStart && oldEnd)
    values[endId] = moveDateValue(
      row.values[endId],
      dateKey(addDays(start, Math.max(0, Math.round((oldEnd.getTime() - oldStart.getTime()) / 86400000)))),
    );

  return values;
}
export function viewPeriod(view: DatabaseView, today = new Date()) {
  const anchor =
    parseDay(view.dateAnchor) ||
    (isHourlyPlan(view)
      ? parseDay(
          zonedDate(today.toISOString(), view.timeZone || localTimeZone())
            .toPlainDate()
            .toString(),
        )!
      : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12));
  let first = new Date(anchor),
    count = 7;
  if (view.type === 'calendar' && view.calendarMode !== 'week') {
    first.setDate(1);
    count = 42;
  }
  if (view.type === 'calendar' || (view.type === 'plan' && !isDayPlan(view)))
    first = addDays(first, -((first.getDay() + 6) % 7));
  if (isDayPlan(view)) count = 1;
  if (view.type === 'timeline') {
    count = timelineScales[view.timelineScale || 'month'].days;
  }
  const dates = Array.from({ length: count }, (_, index) => dateKey(addDays(first, index)));
  return { anchor, first, from: dates[0], to: dates.at(-1)!, dates };
}
export const calendarVisibleSlots = 4;

export function calendarWeeks(page: Page, view: DatabaseView, rows: Page[]) {
  const period = viewPeriod(view),
    fields = scheduleFields(page, view);
  const ranges = rows
    .map((row) => ({
      id: row.id,
      ...scheduledRange(row, fields.start, fields.end),
      startAt: dateEpoch(propertyDateValue(row, fields.start)),
    }))
    .filter((range) => range.start)
    .sort(
      (a, b) =>
        Number(b.end > b.start) - Number(a.end > a.start) || (view.sorts?.length ? 0 : a.startAt - b.startAt),
    );
  return Array.from({ length: period.dates.length / 7 }, (_, index) => {
    const dates = period.dates.slice(index * 7, index * 7 + 7);
    const occupied: boolean[][] = [];
    const events = ranges
      .filter((range) => range.start <= dates[6] && range.end >= dates[0])
      .map((range) => {
        const startColumn = range.start < dates[0] ? 0 : dates.indexOf(range.start);
        const endColumn = range.end > dates[6] ? 6 : dates.indexOf(range.end);
        let slot = occupied.findIndex((row) =>
          row.slice(startColumn, endColumn + 1).every((value) => !value),
        );
        if (slot === -1) {
          slot = occupied.length;
          occupied.push(Array(7).fill(false));
        }
        for (let day = startColumn; day <= endColumn; day++) occupied[slot][day] = true;
        return {
          id: range.id,
          startColumn,
          span: endColumn - startColumn + 1,
          slot,
          continuedBefore: range.start < dates[0],
          continuedAfter: range.end > dates[6],
        };
      });
    const hiddenByDate = Object.fromEntries(
      dates.map((date, column) => [
        date,
        events
          .filter(
            (segment) =>
              segment.slot >= calendarVisibleSlots &&
              segment.startColumn <= column &&
              column < segment.startColumn + segment.span,
          )
          .map((segment) => segment.id),
      ]),
    );
    // Preserve the existing multi-day projection; events is the complete, unified layout.
    const segments = events.filter((event) => event.span > 1 || event.continuedBefore || event.continuedAfter);
    return {
      dates,
      segments,
      slotCount: Math.max(0, ...segments.map((segment) => segment.slot + 1)),
      events,
      totalSlotCount: occupied.length,
      visibleSlotCount: calendarVisibleSlots,
      hiddenByDate,
    };
  });
}
export function navigateViewDate(
  view: DatabaseView,
  direction: 'previous' | 'next' | 'today',
  today = new Date(),
) {
  if (direction === 'today') return { dateAnchor: undefined };
  const period = viewPeriod(view, today),
    sign = direction === 'previous' ? -1 : 1;
  const target =
    view.type === 'calendar' && view.calendarMode !== 'week'
      ? new Date(period.anchor.getFullYear(), period.anchor.getMonth() + sign, 1, 12)
      : addDays(
          view.type === 'timeline' ? period.first : period.anchor,
          sign * (view.type === 'timeline' ? Math.round(period.dates.length / 3) : isDayPlan(view) ? 1 : 7),
        );
  return { dateAnchor: dateKey(target) };
}
export function planProjection(page: Page, view: DatabaseView, rows: Page[], today = new Date()) {
  const columns = page.database!.columns;
  const { start: dateProperty, end: endProperty } = scheduleFields(page, view);
  const usable = (column: Property) =>
    ['checkbox', 'select'].includes(column.type) ||
    (column.type === 'status' && !!column.statusGroups?.done.length);
  const doneProperty =
    columns.find((column) => column.id === view.planDoneBy && usable(column)) ||
    columns.find((column) => column.type === 'status' && usable(column)) ||
    columns.find((column) => column.type === 'checkbox') ||
    columns.find(
      (column) =>
        column.type === 'select' &&
        column.options?.some((value) => /^(完成|已完成|done|complete|completed)$/i.test(value)),
    );
  const doneValue =
    view.planDoneValue ||
    doneProperty?.statusGroups?.done[0] ||
    doneProperty?.options?.find((value) => /^(完成|已完成|done|complete|completed)$/i.test(value)) ||
    '完成';
  const isDone = (row: Page) =>
    !!doneProperty &&
    (doneProperty.type === 'checkbox'
      ? row.values[doneProperty.id] === true
      : doneProperty.type === 'status' && !view.planDoneValue
        ? doneProperty.statusGroups?.done.includes(String(row.values[doneProperty.id])) || false
        : row.values[doneProperty.id] === doneValue);
  const period = viewPeriod(view, today);
  const filtered = view.planHideCompleted ? rows.filter((row) => !isDone(row)) : rows;
  const zone = isHourlyPlan(view) ? view.timeZone || localTimeZone() : undefined;
  const key = (row: Page) => scheduledRange(row, dateProperty, endProperty, zone).start;
  const end = (row: Page) => scheduledRange(row, dateProperty, endProperty, zone).end;
  return {
    ...period,
    dateProperty,
    endProperty,
    doneProperty,
    doneValue,
    isDone,
    rows: filtered,
    days: period.dates.map((date) => ({
      date,
      records: filtered
        .filter((row) => key(row) && key(row) <= date && end(row) >= date)
        .map((row) => row.id),
    })),
    unscheduled: filtered.filter((row) => !key(row)).map((row) => row.id),
    overdue: filtered
      .filter((row) => key(row) && end(row) < period.from && end(row) < dateKey(today) && !isDone(row))
      .map((row) => row.id),
    completed: rows.filter(isDone).length,
  };
}

export function resizeScheduledRecord(row: Page, startId: string, endId: string | undefined, end: string) {
  return {
    ...row.values,
    ...(endId
      ? { [endId]: moveDateValue(row.values[endId], end) }
      : { [startId]: resizeDateValue(row.values[startId], end) }),
  };
}
export function scheduledTimes(row: Page, startId?: string | Property, endId?: string | Property) {
  const value = propertyDateValue(row, startId);
  return {
    start: dateParts(value)?.start || '',
    end: endId
      ? dateParts(propertyDateValue(row, endId))?.start || ''
      : dateParts(value)?.end || dateParts(value)?.start || '',
    timeZone: dateParts(value)?.timeZone,
    startTimestamp: dateEpoch(value),
    endTimestamp: endId ? dateEpoch(propertyDateValue(row, endId)) : dateEpoch(value, 'end'),
  };
}
