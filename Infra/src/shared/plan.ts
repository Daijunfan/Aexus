import type {ScheduledJob,ScheduleRun} from './scheduler'
import type {PrincipalRef} from './management'

export const PLAN_STATES=['scheduled','running','paused','completed','attention'] as const
export const PLAN_PRIORITIES=['low','normal','high','urgent'] as const
/** Same layout IDs as the source-versioned MiniNotion database catalog. */
export const PLAN_LAYOUTS=['table','board','timeline','calendar','plan','list','gallery','chart','feed','form'] as const
export const PLAN_LAYOUT_CATALOG=[
  {id:'table',label:'Table',icon:'table',description:'All schedule properties in rows and columns.'},
  {id:'board',label:'Board',icon:'layout',description:'Group schedules by state, employee or priority.'},
  {id:'timeline',label:'Timeline',icon:'git-compare',description:'Estimated work spans and actual run durations on a time axis.'},
  {id:'calendar',label:'Calendar',icon:'calendar',description:'Upcoming occurrences and recorded runs by date.'},
  {id:'plan',label:'Planner',icon:'checklist',description:'Day, week and agenda views of scheduled work.'},
  {id:'list',label:'List',icon:'list-unordered',description:'A compact list of schedules.'},
  {id:'gallery',label:'Gallery',icon:'preview',description:'Visual task cards with people, prompts and notes.'},
  {id:'chart',label:'Chart',icon:'graph',description:'Authorized totals across all pages, with explicit schedule/run metrics.'},
  {id:'feed',label:'Feed',icon:'history',description:'Actual execution activity; no fabricated future updates.'},
  {id:'form',label:'Form',icon:'edit',description:'Create a real schedule through the same validated Core API.'}
] as const
export const PLAN_RUN_STATES=['running','succeeded','failed','skipped','cancelled','timed_out','interrupted'] as const
export type PlanState=typeof PLAN_STATES[number]
export type PlanLayout=typeof PLAN_LAYOUTS[number]
export type PlanFilter={search?:string;employee?:string;team?:string;channel?:string;states?:PlanState[];priorities?:typeof PLAN_PRIORITIES[number][];tags?:string[]}
export type PlanViewOptions={
  timezone?:string
  timelineScale?:'day'|'week'|'month'
  plannerMode?:'day'|'week'|'agenda'
  chartMetric?:'schedules'|'runs'
  chartGroupBy?:'status'|'employee'|'team'|'priority'
  chartType?:'bar'|'horizontal'|'line'|'donut'
}
export type PlanViewSpec={name:string;layout:PlanLayout;groupBy:'status'|'employee'|'priority';filter:PlanFilter;sort:'nextAt'|'name'|'updatedAt'|'priority';direction:'asc'|'desc';options?:PlanViewOptions}
export type PlanView=PlanViewSpec&{id:string;owner?:PrincipalRef;revision:number;builtin?:boolean}
export type PlanEmployee={id:string;title:string;team:string;avatar?:string;color?:string;engine:string;role?:import('./roles').ManagementRole}
export type PlanRow=ScheduledJob&{status:PlanState;employee:PlanEmployee|null;lastRun?:ScheduleRun;target?:{id:string;exists:boolean;role:string|null;title:string|null;team:string|null;engine:string};timing?:{timezone:string|null;kind:ScheduledJob['rule']['kind'];nextAt:string|null;until:string|null;window:ScheduledJob['window']};allowedActions?:string[];blockedActions?:Record<string,string>}
export type PlanQuery={now?:string;hostTimezone?:string;rows:PlanRow[];total:number;offset:number;hasMore:boolean;counts:Record<PlanState,number>;facets?:{tags:string[]}}
export type PlanTimeEvent={
  id:string;jobId:string;runId?:string;name:string;employeeId:string;employee:PlanEmployee|null
  at:string;date:string;startAt:string;endAt:string|null;status:string
  kind:'forecast'|'run';durationKind:'estimate'|'actual'|'elapsed'|'point'
  estimatedMinutes?:number;jobAvailable:boolean;jobRevision?:number;canReschedule:boolean
  trigger?:ScheduleRun['trigger'];message?:string;scheduledAt?:string
}
export type PlanTimeline={events:PlanTimeEvent[];timezone:string;from:string;to:string;truncated:boolean;retainedHistoryLimit:number}
export type PlanFeedEntry=ScheduleRun&{employee:PlanEmployee|null;jobAvailable:boolean;plan?:ScheduledJob['plan']}
export type PlanFeed={entries:PlanFeedEntry[];hasMore:boolean;nextCursor:string|null;retainedHistoryLimit:number}
export type PlanAnalytics={metric:'schedules'|'runs';groupBy:'status'|'employee'|'team'|'priority';total:number;buckets:{key:string;label:string;value:number}[];scope:string;retainedHistoryLimit?:number}
export function planState(job:ScheduledJob,run?:ScheduleRun):PlanState{
  if(run?.status==='running')return 'running'
  if(job.disabledReason)return 'attention'
  if(!job.enabled)return 'paused'
  if(run&&['failed','timed_out','interrupted'].includes(run.status))return 'attention'
  if(job.rule.kind==='event'&&(!job.until||Date.parse(job.until)>Date.now())&&(!job.maxOccurrences||(job.occurrences??0)<job.maxOccurrences))return 'scheduled'
  if(!job.nextAt)return 'completed'
  return 'scheduled'
}
export const BUILTIN_PLAN_VIEWS:PlanView[]=PLAN_LAYOUT_CATALOG.map(item=>({id:item.id,name:item.label,layout:item.id,groupBy:'status',filter:{},sort:'nextAt',direction:'asc',revision:1,builtin:true}))
