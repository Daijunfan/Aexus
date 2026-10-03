import type {Delegation} from './management'
/** Host-owned scheduling contract. No renderer or plugin dependencies. */
export type ScheduleRule =
  | { kind: 'once'; at: string }
  | { kind: 'interval'; everySeconds: number; anchor: string }
  | { kind: 'weekly'; time: string; days: number[]; timezone: string }
  | { kind: 'monthly'; time: string; day: number | 'last'; timezone: string }
  | { kind: 'event'; event: 'signal' | 'channel.posted'; channelId?: string; cooldownSeconds: number }
export type ScheduleWindow = { start: string; end: string; timezone: string; days?: number[] }
export type ScheduledAction = {
  type: 'agent'
  employeeId: string
  engine: import('./types').Engine
  prompt: string
  viewId?: string
  /** Explicit employee publishing destination; membership is checked again at execution. */
  channelId?: string
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  thinking?: boolean
}
export type PlanMetadata = { priority: 'low' | 'normal' | 'high' | 'urgent'; tags: string[]; notes: string; /** Presentation estimate only. Never a timeout or automatic stop rule. */ durationMinutes?: number }
export type ScheduleSpec = {
  name: string
  action: ScheduledAction
  rule: ScheduleRule
  window?: ScheduleWindow | null
  /** Absolute end of the schedule, exclusive. */
  until?: string | null
  timeoutSeconds: number
  /** Late occurrences beyond this grace are skipped, never replayed in a burst. */
  graceSeconds: number
  enabled: boolean
  /** Optional caller namespace, e.g. a future plugin ID. Does not grant permission. */
  source?: string
  plan?: PlanMetadata
  /** Maximum scheduled occurrences, including skipped ones. Manual runs do not consume this limit. */
  maxOccurrences?: number | null
}
export type ScheduledJob = ScheduleSpec & { delegation?:Delegation; id: string; createdAt: string; updatedAt: string; nextAt: string | null; disabledReason?: string; revision?:number; occurrences?:number; clientRequestId?:string; requestFingerprint?:string; createdBy?:import('./management').PrincipalRef; eventClaims?:Array<{id:string;at:string}> }
export type ScheduleRun = {
  delegation?:Delegation
  id: string
  jobId: string
  jobName: string
  action: ScheduledAction
  trigger: 'scheduled' | 'manual' | 'event'
  event?: {id:string;type:'signal'|'channel.posted';channelId?:string}
  scheduledAt: string
  startedAt: string
  finishedAt?: string
  status: 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled' | 'timed_out' | 'interrupted'
  sessionId?: string
  message?: string
}
