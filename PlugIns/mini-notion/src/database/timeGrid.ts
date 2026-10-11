import { propertyDateValue } from './propertySchema.ts';
import { Temporal } from '@js-temporal/polyfill';
import type { DatabaseView, Page } from '../types.ts';
import { dateParts, hasTime, localTimeZone, zonedDate } from './dateValue.ts';
import { scheduleFields, scheduledRange, scheduledTimes, viewPeriod } from './dates.ts';

export type TimeGridEvent = {
  id: string;
  start: string;
  end: string;
  hasEnd: boolean;
  sourceStart: number;
  sourceEnd: number;
  minuteStart: number;
  minuteEnd: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  column: number;
  columns: number;
};
export function arrangeTimeEvents(events: TimeGridEvent[], minimumMinutes = 0) {
  const endOf = (event: TimeGridEvent) => Math.max(event.minuteEnd, event.minuteStart + minimumMinutes);
  events.sort(
    (a, b) => a.minuteStart - b.minuteStart || b.minuteEnd - a.minuteEnd || a.id.localeCompare(b.id),
  );
  let group: TimeGridEvent[] = [],
    ends: number[] = [],
    until = -1;
  const finish = () => {
    group.forEach((event) => (event.columns = ends.length));
    group = [];
    ends = [];
  };
  for (const event of events) {
    if (event.minuteStart >= until) finish();
    let column = ends.findIndex((end) => end <= event.minuteStart);
    if (column < 0) column = ends.length;
    ends[column] = endOf(event);
    event.column = column;
    group.push(event);
    until = Math.max(until, endOf(event));
  }
  finish();
  return events;
}
export function timeGridProjection(page: Page, view: DatabaseView, rows: Page[], today = new Date()) {
  const timeZone = view.timeZone || localTimeZone(),
    period = viewPeriod(view, today);
  const fields = scheduleFields(page, view);
  const timed = rows.flatMap((row) => {
    const value = dateParts(propertyDateValue(row, fields.start));
    if (!value || !hasTime(value.start)) return [];
    const times = scheduledTimes(row, fields.start, fields.end);
    if (!Number.isFinite(times.startTimestamp)) return [];
    const hasEnd = Number.isFinite(times.endTimestamp) && times.endTimestamp > times.startTimestamp;
    const end = hasEnd ? times.endTimestamp : times.startTimestamp + 30 * 60000;
    return [{ id: row.id, start: times.startTimestamp, end, hasEnd }];
  });
  const instant = (value: number) =>
    Temporal.Instant.fromEpochMilliseconds(value).toZonedDateTimeISO(timeZone);
  const days = period.dates.map((date) => {
    const first = zonedDate(date, timeZone),
      next = first.add({ days: 1 });
    const startTimestamp = first.epochMilliseconds,
      endTimestamp = next.epochMilliseconds;
    const minutes = (endTimestamp - startTimestamp) / 60000;
    const hours = Array.from({ length: Math.ceil(minutes / 60) }, (_, i) => {
      const hour = first.add({ hours: i });
      return {
        minute: i * 60,
        label: hour.toPlainTime().toString({ smallestUnit: 'minute' }),
        offset: hour.offset,
      };
    });
    const events = arrangeTimeEvents(
      timed
        .filter(
          (event) =>
            event.start < endTimestamp &&
            event.end > startTimestamp &&
            (event.hasEnd || event.start >= startTimestamp),
        )
        .map((event) => ({
          id: event.id,
          start: instant(event.start).toString({ timeZoneName: 'never', smallestUnit: 'minute' }),
          end: instant(event.end).toString({ timeZoneName: 'never', smallestUnit: 'minute' }),
          hasEnd: event.hasEnd,
          sourceStart: event.start,
          sourceEnd: event.end,
          minuteStart: Math.max(0, (event.start - startTimestamp) / 60000),
          minuteEnd: Math.min(minutes, (event.end - startTimestamp) / 60000),
          continuesBefore: event.start < startTimestamp,
          continuesAfter: event.hasEnd && event.end > endTimestamp,
          column: 0,
          columns: 1,
        })),
    );
    const allDay = rows
      .filter((row) => {
        const parts = dateParts(propertyDateValue(row, fields.start));
        const range = scheduledRange(row, fields.start, fields.end);
        return parts && !hasTime(parts.start) && range.start <= date && range.end >= date;
      })
      .map((row) => row.id);
    return { date, startTimestamp, endTimestamp, minutes, hours, allDay, events };
  });
  return {
    timeZone,
    days,
    stepMinutes: 15,
    now: today.getTime(),
    dateProperty: fields.start?.id,
    readonlyDates: fields.start?.type !== 'date' || (!!fields.end && fields.end.type !== 'date'),
    endProperty: fields.end?.id || null,
  };
}

// All pointer positions use elapsed minutes since local midnight. On DST transition
// days the axis has 23 or 25 hours, so repeated/missing local hours remain unambiguous.
export function gridInstant(day: { startTimestamp: number; minutes: number }, minute: number) {
  const snapped = Math.max(0, Math.min(day.minutes - 15, Math.round(minute / 15) * 15));
  return day.startTimestamp + snapped * 60000;
}
export function timeInZone(timestamp: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(timestamp)
    .toZonedDateTimeISO(zone)
    .toString({ timeZoneName: 'never', smallestUnit: 'minute' });
}
