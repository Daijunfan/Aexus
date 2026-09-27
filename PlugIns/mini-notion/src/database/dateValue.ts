import { Temporal } from '@js-temporal/polyfill';
import type { DateValue } from '../types.ts';
import { CommandError } from '../core/errors.ts';

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const isDateValue = (value: unknown): value is DateValue =>
  !!value && typeof value === 'object' && !Array.isArray(value) && 'start' in value;
export function dateParts(value: unknown): DateValue | null {
  if (isDateValue(value)) return value.start ? value : null;
  return typeof value === 'string' && value ? { start: value } : null;
}
export const hasTime = (value: string) => value.includes('T');
const hasOffset = (value: string) => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
export function zonedDate(value: string, zone = localTimeZone()) {
  if (hasOffset(value)) return Temporal.Instant.from(value).toZonedDateTimeISO(zone);
  return Temporal.PlainDateTime.from(hasTime(value) ? value : value + 'T00:00').toZonedDateTime(zone);
}
export function dateWall(value: unknown, endpoint: 'start' | 'end' = 'start') {
  const parts = dateParts(value);
  if (!parts) return '';
  const text = parts[endpoint] || parts.start;
  if (!hasTime(text)) return text;
  try {
    return zonedDate(text, parts.timeZone).toPlainDateTime().toString({ smallestUnit: 'minute' });
  } catch {
    return '';
  }
}
export function dateEpoch(value: unknown, endpoint: 'start' | 'end' = 'start'): number {
  const parts = dateParts(value);
  if (!parts) return NaN;
  try {
    return zonedDate(parts[endpoint] || parts.start, parts.timeZone).epochMilliseconds;
  } catch {
    return NaN;
  }
}
export function validateDateValue(value: unknown) {
  if (value === '' || value === null || value === undefined) return;
  const parts = dateParts(value);
  try {
    if (!parts || typeof parts.start !== 'string') throw Error();
    if (parts.timeZone) Temporal.Now.zonedDateTimeISO(parts.timeZone);
    for (const text of [parts.start, parts.end].filter(Boolean) as string[]) {
      if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text))
        throw Error();
      Temporal.PlainDate.from(text.slice(0, 10));
      if (hasTime(text)) zonedDate(text, parts.timeZone);
    }
    if (
      parts.end &&
      (hasTime(parts.start) !== hasTime(parts.end) || dateEpoch(parts, 'end') < dateEpoch(parts))
    )
      throw Error();
  } catch {
    throw new CommandError('INVALID_DATE', '日期、时区或范围无效；结束时间不能早于开始时间');
  }
}
export function makeDateValue(start: string, end?: string | null, timeZone?: string): string | DateValue {
  if (!start) return '';
  const zone = hasTime(start) ? timeZone || localTimeZone() : undefined;
  const canonical = (text: string) =>
    hasTime(text) ? zonedDate(text, zone).toString({ timeZoneName: 'never', smallestUnit: 'minute' }) : text;
  const raw = { start, ...(end ? { end } : {}), ...(zone ? { timeZone: zone } : {}) };
  validateDateValue(raw);
  const value = { ...raw, start: canonical(start), ...(end ? { end: canonical(end) } : {}) };
  return !end && !zone ? start : value;
}
export function dateText(value: unknown) {
  const parts = dateParts(value);
  if (!parts) return '';
  const start = dateWall(value).replace('T', ' '),
    end = parts.end ? dateWall(value, 'end').replace('T', ' ') : '';
  return (
    start + (end ? ` → ${end}` : '') + (parts.timeZone && hasTime(parts.start) ? ` (${parts.timeZone})` : '')
  );
}
export function moveDateValue(value: unknown, day: string): string | DateValue {
  if (!day) return '';
  const parts = dateParts(value);
  if (!parts) return day;
  const oldDay = dateWall(value).slice(0, 10);
  const shift = Temporal.PlainDate.from(oldDay).until(Temporal.PlainDate.from(day)).days;
  const move = (text: string, endpoint: 'start' | 'end') => {
    if (!isDateValue(value) && !hasOffset(text))
      return Temporal.PlainDate.from(text.slice(0, 10)).add({ days: shift }).toString() + text.slice(10);
    if (!hasTime(text)) return Temporal.PlainDate.from(text).add({ days: shift }).toString();
    return zonedDate(parts[endpoint] || parts.start, parts.timeZone)
      .add({ days: shift })
      .toString({ timeZoneName: 'never', smallestUnit: 'minute' });
  };
  if (!isDateValue(value)) return move(parts.start, 'start');
  return {
    ...parts,
    start: move(parts.start, 'start'),
    ...(parts.end ? { end: move(parts.end, 'end') } : {}),
  };
}
export function resizeDateValue(value: unknown, end: string): string | DateValue {
  const parts = dateParts(value);
  if (!parts) return '';
  const old = dateWall(value, 'end');
  return makeDateValue(
    parts.start,
    end ? end + (hasTime(end) ? '' : old.slice(10)) : undefined,
    parts.timeZone,
  );
}
