import { Temporal } from '@js-temporal/polyfill'
import type { ScheduleRule, ScheduleWindow, ScheduleSpec, ScheduledJob } from '../../shared/scheduler'

export function instant(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Time must be an ISO timestamp with UTC offset')
  return Temporal.Instant.from(value).toString()
}
const ms = (value: string) => Temporal.Instant.from(value).epochMilliseconds
const local = (at: number, zone: string) => Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(zone)
function clock(value: unknown): string {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Time of day must be HH:mm')
  return value
}
function zone(value: unknown): string {
  if (typeof value !== 'string' || /^[+-]/.test(value)) throw new Error('Use an IANA timezone, e.g. Asia/Shanghai')
  local(0, value)
  return value
}
function days(value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('days must contain weekdays 1 (Monday) to 7 (Sunday)')
  return [...new Set(value)].sort()
}
export function validateRule(value: ScheduleRule): ScheduleRule {
  if (value?.kind === 'once') return { kind: 'once', at: instant(value.at) }
  if (value?.kind === 'interval') {
    if (!Number.isInteger(value.everySeconds) || value.everySeconds < 1 || value.everySeconds > 31536000) throw new Error('everySeconds must be 1..31536000')
    return { kind: 'interval', everySeconds: value.everySeconds, anchor: instant(value.anchor) }
  }
  if (value?.kind === 'weekly') return { kind: 'weekly', time: clock(value.time), days: days(value.days), timezone: zone(value.timezone) }
  if(value?.kind==='monthly'){
    if(value.day!=='last'&&(!Number.isInteger(value.day)||value.day<1||value.day>31))throw Error('Monthly day must be 1..31 or last')
    return {kind:'monthly',day:value.day,time:clock(value.time),timezone:zone(value.timezone)}
  }
  if(value?.kind==='event'){
    if(!['signal','channel.posted'].includes(value.event))throw Error('Choose signal or channel.posted')
    if(Object.keys(value).some(key=>!['kind','event','channelId','cooldownSeconds'].includes(key)))throw Error('Unknown event rule field')
    if(value.event==='channel.posted'?(typeof value.channelId!=='string'||!value.channelId.trim()):value.channelId!==undefined)throw Error('channelId is required only for channel.posted')
    const cooldownSeconds=value.cooldownSeconds??60
    if(!Number.isInteger(cooldownSeconds)||cooldownSeconds<0||cooldownSeconds>86400)throw Error('Event cooldown must be 0–86400 seconds')
    return {kind:'event',event:value.event,...(value.channelId?{channelId:value.channelId}:{}),cooldownSeconds}
  }
  throw new Error('rule.kind must be once, interval, weekly, monthly or event')
}
export function validateWindow(value?: ScheduleWindow | null): ScheduleWindow | undefined {
  if (value == null) return undefined
  const result = { start: clock(value.start), end: clock(value.end), timezone: zone(value.timezone), days: value.days ? days(value.days) : undefined }
  if (result.start === result.end) throw new Error('Window start and end must differ; omit window for all day')
  return result
}
/** Overnight windows belong to the day they start; end is exclusive. */
export function inWindow(window: ScheduleWindow | null | undefined, at: number): boolean {
  if (!window) return true
  const now = local(at, window.timezone), time = now.toPlainTime().toString().slice(0, 5)
  const overnight = window.start > window.end
  const day = overnight && time < window.end ? now.subtract({ days: 1 }).dayOfWeek : now.dayOfWeek
  return (!window.days || window.days.includes(day)) && (overnight ? time >= window.start || time < window.end : time >= window.start && time < window.end)
}
/** Current window deadline; caller first verifies inWindow. */
export function windowEnd(window: ScheduleWindow, at: number): number {
  const now = local(at, window.timezone), time = now.toPlainTime().toString().slice(0, 5)
  let date = now.toPlainDate()
  if (window.start > window.end && time >= window.start) date = date.add({ days: 1 })
  return date.toZonedDateTime({ timeZone: window.timezone, plainTime: window.end }).epochMilliseconds
}

/** Start of the next allowed window. Zoned arithmetic handles DST and calendar days. */
function nextWindow(window: ScheduleWindow, after: number): number {
  const date = local(after, window.timezone).toPlainDate()
  for (let offset = 0; offset <= 8; offset++) {
    const day = date.add({ days: offset })
    if (window.days && !window.days.includes(day.dayOfWeek)) continue
    const start = day.toZonedDateTime({ timeZone: window.timezone, plainTime: window.start }).epochMilliseconds
    if (start > after) return start
  }
  throw new Error('No matching schedule window')
}
/** Strictly after the supplied instant. DST gap is shifted forward; overlap runs once, earlier offset. */
function nextRule(rule: ScheduleRule, after: number): number | null {
  if(rule.kind==='event')return null
  if (rule.kind === 'once') return ms(rule.at) > after ? ms(rule.at) : null
  if (rule.kind === 'interval') {
    const anchor = ms(rule.anchor), period = rule.everySeconds * 1000
    return anchor + Math.max(0, Math.floor((after - anchor) / period) + 1) * period
  }
  const date = local(after, rule.timezone).toPlainDate()
  if(rule.kind==='monthly'){
    const month=date.with({day:1})
    for(let offset=0;offset<14;offset++){
      const candidate=month.add({months:offset}),day=rule.day==='last'?candidate.daysInMonth:rule.day
      if(day>candidate.daysInMonth)continue
      const next=candidate.with({day}).toZonedDateTime({timeZone:rule.timezone,plainTime:rule.time}).epochMilliseconds
      if(next>after)return next
    }
    return null
  }
  for (let offset = 0; offset <= 7; offset++) {
    const day = date.add({ days: offset })
    if (!rule.days.includes(day.dayOfWeek)) continue
    const next = day.toZonedDateTime({ timeZone: rule.timezone, plainTime: rule.time }).epochMilliseconds
    if (next > after) return next
  }
  return null
}
export function nextOccurrence(spec: Pick<ScheduleSpec, 'rule' | 'window' | 'until'>, after: number): string | null {
  let cursor = after
  // Bounded horizon for incompatible weekly rules/windows; interval jumps by window, not by second.
  const horizon = after + 366 * 86400000
  for (;;) {
    const next = nextRule(spec.rule, cursor)
    if (next === null || (spec.window && next > horizon) || (spec.until && next >= ms(spec.until))) return null
    if (inWindow(spec.window, next)) return new Date(next).toISOString()
    if (spec.rule.kind === 'once') return null
    cursor = spec.window ? nextWindow(spec.window, next) - 1 : next
  }
}
export function preview(spec: Pick<ScheduleSpec, 'rule' | 'window' | 'until'>, after: number, count = 5): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('count must be 1..100')
  const result: string[] = []
  while (result.length < count) {
    const next = nextOccurrence(spec, after)
    if (!next) break
    result.push(next); after = ms(next)
  }
  return result
}

/** Project a saved schedule without replenishing its remaining quota when the viewport advances.
 * Forecasts assume the Core continues running; they do not claim execution took place. */
export function forecastSchedule(job: ScheduledJob, after: number, count = 5, now = Date.now()): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('count must be 1..100')
  let remaining = job.maxOccurrences == null ? Infinity : Math.max(0, job.maxOccurrences - (job.occurrences ?? 0))
  if (!remaining) return []
  let cursor = Math.max(now - 1, job.nextAt ? ms(job.nextAt) - 1 : now - 1)
  if (remaining !== Infinity && after > cursor) {
    // Interval runs within one permitted window can be counted arithmetically.
    // The work is bounded by calendar windows, never by every-second occurrences.
    for (let step = 0; ; step++) {
      const next = nextOccurrence(job, cursor)
      if (!next) return []
      const at = ms(next)
      if (at > after) break
      if (step >= 10000) throw Error('Preview range is too distant; choose a closer date range')
      let skipped = 1
      if (job.rule.kind === 'interval') {
        const end = Math.min(after, job.until ? ms(job.until) - 1 : Infinity, job.window ? windowEnd(job.window, at) - 1 : Infinity)
        skipped = Math.floor((end - at) / (job.rule.everySeconds * 1000)) + 1
        cursor = at + (skipped - 1) * job.rule.everySeconds * 1000
      } else cursor = at
      remaining -= skipped
      if (remaining <= 0) return []
    }
  }
  return preview(job, Math.max(after, cursor), Math.min(count, remaining))
}
