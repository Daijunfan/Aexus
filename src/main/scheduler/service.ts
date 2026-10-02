import {taskViewId} from '../task-view'
import {beginManagementInteraction} from '../management-activity'
import {assertEmployeeReady} from '../initialization-state'
import {authorize,canReadEmployee,requestContext,isGlobal,delegationFor,validateDelegation} from '../authorization'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID,createHash } from 'node:crypto'
import {SCHEDULE_SPEC_SCHEMA} from '../../shared/schedule-schema'
import {PLAN_PRIORITIES} from '../../shared/plan'
import { APP_HOME } from '../../shared/protocol'
import type { ScheduleSpec, ScheduledJob, ScheduleRun, ScheduledAction } from '../../shared/scheduler'
import { readStore } from '../store'
import { executeTask } from './execute'
import { instant, validateRule, validateWindow, nextOccurrence, preview, forecastSchedule, inWindow, windowEnd } from './time'

const file = join(APP_HOME, 'schedules.json')
type State = { version: 1; jobs: ScheduledJob[]; runs: ScheduleRun[] }
let state: State = { version: 1, jobs: [], runs: [] }
let timer: NodeJS.Timeout | undefined, ready = false, loadError: string | undefined
const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
let emit: (channel: string, payload: unknown) => void = () => {}
const stamp = () => new Date().toISOString()
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
function requireReady() { if (!ready || loadError) throw new Error(loadError || 'Scheduler is not running') }
function save() {
  // Bounded local audit, with all active runs retained. Transcripts stay with the employee.
  const recent = new Set(state.runs.filter(run => run.status !== 'running').slice(-1000).map(run => run.id))
  state.runs = state.runs.filter(run => run.status === 'running' || recent.has(run.id))
  mkdirSync(APP_HOME, { recursive: true })
  writeFileSync(file + '.tmp', JSON.stringify(state, null, 2), { mode: 0o600 })
  renameSync(file + '.tmp', file)
  emit('schedule:changed', {})
}
function job(id: string) {
  const found = state.jobs.find(job => job.id === id)
  if (!found) throw new Error('Unknown schedule')
  return found
}
function validate(input: ScheduleSpec): ScheduleSpec {
  if (!input || typeof input.name !== 'string' || !input.name.trim()||input.name.length>160) throw new Error('Schedule name must contain 1–160 characters')
  const a = input.action, card = readStore().sessions.find(card => card.id === a?.employeeId)
  if (!card) throw new Error('Unknown employee')
  if (a.type !== 'agent') throw new Error('action.type must be agent; prompt contains the instruction or CLI command for the employee')
  if (a.engine && a.engine !== card.engine) throw new Error('Schedule engine must match the employee')
  if (typeof a.prompt !== 'string' || !a.prompt.trim()||a.prompt.length>64000) throw new Error('action.prompt must contain 1–64000 characters')
  if (a.model !== undefined && (typeof a.model !== 'string' || !a.model.trim())) throw new Error('model must be a nonempty string')
  if (a.effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(a.effort)) throw new Error('Invalid effort level')
  if (a.thinking !== undefined && (typeof a.thinking !== 'boolean' || card.engine==='codex' || (card.engine==='cline'||card.engine==='pi')&&a.thinking)) throw new Error('thinking must be boolean; Cline/Pi support off only, Codex uses effort')
  const action: ScheduledAction = { type: 'agent', employeeId: card.id, engine: card.engine, prompt: a.prompt, model: a.model, effort: a.effort, thinking: a.thinking, viewId:taskViewId(card.id,a.viewId,true) }
  const timeoutSeconds = input.timeoutSeconds ?? 1800, graceSeconds = input.graceSeconds ?? 60
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86400) throw new Error('timeoutSeconds must be 1..86400')
  if (!Number.isInteger(graceSeconds) || graceSeconds < 1 || graceSeconds > 86400) throw new Error('graceSeconds must be 1..86400')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean')
  if (input.source !== undefined && (typeof input.source !== 'string' || !input.source.trim())) throw new Error('source must be a namespace string')
  if(input.maxOccurrences!=null&&(!Number.isInteger(input.maxOccurrences)||input.maxOccurrences<1||input.maxOccurrences>1000000))throw Error('maxOccurrences must be 1..1000000 or null')
  const plan=input.plan
  if(plan!==undefined){
    if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(key=>!['priority','tags','notes','durationMinutes'].includes(key)))throw Error('Invalid Plan metadata')
    if(plan.priority!==undefined&&!PLAN_PRIORITIES.includes(plan.priority))throw Error('Invalid priority')
    if(plan.tags!==undefined&&(!Array.isArray(plan.tags)||plan.tags.length>20||plan.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>40)))throw Error('Tags must contain at most 20 names of 1–40 characters')
    if(plan.durationMinutes!==undefined&&(!Number.isInteger(plan.durationMinutes)||plan.durationMinutes<1||plan.durationMinutes>43200))throw Error('Planned duration must be 1–43200 minutes')
    if(plan.notes!==undefined&&(typeof plan.notes!=='string'||plan.notes.length>16000))throw Error('Notes must be at most 16000 characters')
  }
  return { plan:plan?{priority:plan.priority??'normal',tags:[...new Set((plan.tags??[]).map(tag=>tag.trim()))],notes:plan.notes??'',...(plan.durationMinutes===undefined?{}:{durationMinutes:plan.durationMinutes})}:undefined,maxOccurrences:input.maxOccurrences??undefined,name: input.name.trim(), action, rule: validateRule(input.rule), window: validateWindow(input.window), until: input.until ? instant(input.until) : undefined, timeoutSeconds, graceSeconds, enabled: input.enabled ?? true, source: input.source }
}
// Resolve relative times and self at the authenticated Core boundary.
function normalizeInput(input:Record<string,any>,partial=false):Record<string,any>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Provide a schedule object')
  for(const key of Object.keys(input))if(!Object.hasOwn(SCHEDULE_SPEC_SCHEMA.properties,key))throw Error('Unknown schedule field: '+key)
  const value={...input}
  if(value.action){
    if(typeof value.action!=='object'||Array.isArray(value.action))throw Error('Invalid scheduled action')
    for(const key of Object.keys(value.action))if(!Object.hasOwn(SCHEDULE_SPEC_SCHEMA.properties.action.properties,key))throw Error('Unknown action field: '+key)
    value.action={...value.action}
    if(value.action.employeeId==='self'){
      const principal=requestContext().principal
      if(principal.kind!=='agent')throw Error('self requires an authenticated employee; the user must specify an employee ID')
      value.action.employeeId=principal.employeeId
    }
  }
  if(value.afterSeconds!==undefined){
    if(value.rule!==undefined)throw Error('Choose rule or afterSeconds, not both')
    if(!Number.isInteger(value.afterSeconds)||value.afterSeconds<1||value.afterSeconds>31536000)throw Error('afterSeconds must be 1..31536000')
    value.rule={kind:'once',at:new Date(Date.now()+value.afterSeconds*1000).toISOString()};delete value.afterSeconds
  }
  if(value.rule?.kind==='interval'&&value.rule.anchor===undefined&&Number.isInteger(value.rule.everySeconds))value.rule={...value.rule,anchor:new Date(Date.now()+value.rule.everySeconds*1000).toISOString()}
  if(!partial&&!value.rule)throw Error('Provide rule or afterSeconds')
  return value
}
function scheduleDelegation(employeeId:string){
  const context=requestContext()
  if(context.principal.kind==='agent'&&context.principal.employeeId===employeeId){
    authorize('schedule.create',{},employeeId,context)
    return {requestedBy:context.principal,requestId:context.requestId,credentialHash:context.credentialHash,selfSchedule:true as const}
  }
  return delegationFor(employeeId)
}
function revisionCheck(item:ScheduledJob,value:unknown){
  if(value!==undefined&&(!Number.isSafeInteger(value)||value!==(item.revision??0)))throw Error('Schedule changed; reload before saving')
}
const bump=(item:ScheduledJob)=>{item.revision=(item.revision??0)+1;item.updatedAt=stamp()}
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value
function future(spec: ScheduleSpec) {
  const next = nextOccurrence(spec, Date.now())
  if (spec.enabled && !next) throw new Error('Schedule has no future occurrence in its window or end date')
  return next
}
export function startScheduler(broadcast: typeof emit) {
  emit = broadcast; loadError = undefined
  try {
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.jobs) || !Array.isArray(data.runs)) throw new Error('Unsupported schedule store')
      state = data
      let changed = false
      for (const run of state.runs) if (run.status === 'running') {
        Object.assign(run, { status: 'interrupted', finishedAt: stamp(), message: 'Service stopped before completion; this occurrence will not be replayed' }); changed = true
      }
      if (changed) save()
    }
    ready = true
    reconcileSchedules()
    timer = setInterval(tick, 250)
    tick()
  } catch (error) { loadError = `Cannot load schedules: ${errorText(error)}`; console.error(loadError) }
}
export function reconcileSchedules() {
  if (!ready || loadError) return
  const employees = new Set(readStore().sessions.filter(card=>!card.deleting).map(card => card.id))
  let changed = false
  for (const item of state.jobs) if (!employees.has(item.action.employeeId) && item.disabledReason !== 'employee_removed') {
    Object.assign(item, { enabled: false, nextAt: null, disabledReason: 'employee_removed', updatedAt: stamp() }); changed = true
  }
  for (const run of state.runs) if (run.status === 'running' && !employees.has(run.action.employeeId)) active.get(run.id)?.controller.abort(new Error('Employee removed'))
  for(const item of state.jobs)try{validateDelegation(item.delegation,item.action.employeeId)}catch{if(item.enabled||item.disabledReason!=='authorization_revoked'){Object.assign(item,{enabled:false,nextAt:null,disabledReason:'authorization_revoked',updatedAt:stamp()});changed=true}}
  for(const run of state.runs)if(run.status==='running')try{validateDelegation(run.delegation,run.action.employeeId)}catch{active.get(run.id)?.controller.abort(new Error('Delegation revoked'))}
  if (changed) save()
}
function record(item: ScheduledJob, trigger: ScheduleRun['trigger'], scheduledAt: string): ScheduleRun {
  const run: ScheduleRun = { id: `run_${randomUUID()}`, jobId: item.id, jobName: item.name, delegation:item.delegation, action: { ...item.action }, trigger, scheduledAt, startedAt: stamp(), status: 'running' }
  state.runs.push(run)
  return run
}
function finish(run: ScheduleRun, status: ScheduleRun['status'], message?: string) {
  Object.assign(run, { status, message, finishedAt: stamp() })
  save(); emit('schedule:run', { ...run })
}
function launch(item: ScheduledJob, run: ScheduleRun) {
  const controller = new AbortController()
  let timedOut = false
  const now = Date.now()
  const deadline = Math.min(now + item.timeoutSeconds * 1000,
    run.trigger === 'scheduled' && item.window ? windowEnd(item.window, now) : Infinity,
    run.trigger === 'scheduled' && item.until ? Date.parse(item.until) : Infinity)
  const timeout = setTimeout(() => { timedOut = true; controller.abort(new Error('Task reached its timeout or permitted time window ended')) }, Math.max(1, deadline - now))
  const done = Promise.resolve().then(async () => {
    try {
      validateDelegation(run.delegation,run.action.employeeId)
      await executeTask(run.action, run.id, controller.signal, id => { run.sessionId = id; save() },run.delegation)
      finish(run, controller.signal.aborted ? timedOut ? 'timed_out' : 'cancelled' : 'succeeded', controller.signal.aborted ? errorText(controller.signal.reason) : undefined)
    } catch (error) {
      finish(run, controller.signal.aborted ? timedOut ? 'timed_out' : 'cancelled' : /Employee is (busy|reserved)/.test(errorText(error)) ? 'skipped' : 'failed', errorText(controller.signal.aborted ? controller.signal.reason : error))
    } finally { clearTimeout(timeout); active.delete(run.id) }
  })
  active.set(run.id, { controller, done })
  emit('schedule:run', { ...run })
}
function tick() {
  if (!ready || loadError) return
  try {
    const now = Date.now()
    for (const item of state.jobs) {
      if (!item.enabled || !item.nextAt || Date.parse(item.nextAt) > now) continue
      const due = item.nextAt
      // Advance and persist the claim BEFORE executing any external command.
      item.occurrences=(item.occurrences??0)+1
      item.nextAt = item.maxOccurrences&&item.occurrences>=item.maxOccurrences?null:nextOccurrence(item, now)
      bump(item)
      const run = record(item, 'scheduled', due)
      const skip = now - Date.parse(due) > item.graceSeconds * 1000 ? 'missed: occurrence outside graceSeconds'
        : item.until && now >= Date.parse(item.until) ? 'schedule ended'
        : !inWindow(item.window, now) ? 'outside permitted window'
        : state.runs.some(other => other !== run && other.status === 'running' && other.action.employeeId === item.action.employeeId) ? 'employee already has a scheduled task' : undefined
      if (skip) finish(run, 'skipped', skip)
      else { save(); launch(item, run) }
    }
  } catch (error) { loadError = `Scheduler stopped: ${errorText(error)}`; console.error(loadError) }
}
export async function stopScheduler() {
  ready = false; clearInterval(timer); timer = undefined
  for (const item of active.values()) item.controller.abort(new Error('Service is stopping'))
  await Promise.all([...active.values()].map(item => item.done))
}

export async function scheduleRequest(method: string, args: Record<string, any>) {
  if (method === 'schema') return {
    version: 1, inputSchema:SCHEDULE_SPEC_SCHEMA,hostTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,now:stamp(),selfScheduling:'All employees may schedule themselves; other targets require the existing Manager/Governor control scope',relativeTime:'afterSeconds is resolved by Core once; use clientRequestId for retry-safe creation',maxOccurrences:'Optional limit on scheduled occurrences including skips; manual runs do not consume it',action: { type: 'agent', employeeId: 'required saved employee ID', engine: 'inferred on create, pinned afterwards', prompt: 'required instruction; shell/CLI commands are performed by this employee', model: 'optional engine model ID', effort: ['low','medium','high','xhigh','max'], thinking: 'optional boolean, Claude only', viewId:'required for Governor tasks; explicit stable Team view ID, never resolved from the active tab at execution' },
    rule: { once: {at:'ISO timestamp with offset'}, interval:{everySeconds:'integer 1..31536000',anchor:'ISO timestamp with offset'}, weekly:{time:'HH:mm',days:'1=Monday..7=Sunday; all days means daily',timezone:'IANA zone'},monthly:{time:'HH:mm',day:'1..31 or last; missing dates skip that month',timezone:'IANA zone'} },
    window: {start:'HH:mm inclusive',end:'HH:mm exclusive; may cross midnight',days:'optional weekdays of window start',timezone:'IANA zone'},
    defaults:{timeoutSeconds:1800,graceSeconds:60,enabled:true}, source:'optional plugin/caller namespace', until:'optional exclusive ISO end time',
    policies:{busy:'skip, never interrupt manual work',late:'skip outside grace; never replay a backlog',restart:'interrupted runs are not replayed',manual:'run ignores calendar/window, keeps timeout',window:'scheduled turns stop when their window or until ends',permission:'inherits employee and Team; never escalated',overrides:'temporary model/effort/thinking, original preferences restored'},
    commands:['status','list','get','create','update','pause','resume','delete','preview','run','history','cancel'], documentation:'SCHEDULER.md'
  }
  if(method==='preview'&&args.id!==undefined&&args.spec!==undefined)throw Error('Choose a saved schedule ID or a spec, not both')
  if(method==='preview'&&args.patch!==undefined&&args.id===undefined)throw Error('A draft preview patch requires a saved schedule ID')
  const rawSpec=args.spec
  if(args.spec)args={...args,spec:normalizeInput(args.spec)}
  if(args.patch)args={...args,patch:normalizeInput(args.patch,true)}
  const context=requestContext(),global=isGlobal(context.principal)
  if(args.employee==='self'){if(context.principal.kind!=='agent')throw Error('self requires an employee identity');args={...args,employee:context.principal.employeeId}}
  const visible=(item:ScheduledJob|ScheduleRun)=>global&&canReadEmployee(context.principal,item.action.employeeId)||item.delegation?.requestedBy.kind==='agent'&&context.principal.kind==='agent'&&item.delegation.requestedBy.employeeId===context.principal.employeeId
  const target=args.id?(method==='cancel'?state.runs.find(run=>run.id===args.id):state.jobs.find(job=>job.id===args.id)):undefined
  if(target){if(!visible(target))throw Error('Forbidden schedule');authorize('schedule.'+method,args,target.action.employeeId,context)}
  if(args.spec?.action?.employeeId)authorize('schedule.'+method,args,args.spec.action.employeeId,context)
  if(args.patch?.action?.employeeId)authorize('schedule.'+method,args,args.patch.action.employeeId,context)
  if(target&&method!=='cancel')revisionCheck(target as ScheduledJob,args.expectedRevision)
  const finishInteraction=beginManagementInteraction('schedule.'+method,args.spec?.action?.employeeId??target?.action.employeeId??args.employee,context)
  try{
  if(method==='status'&&context.principal.kind!=='operator')return {running:ready&&!loadError,jobs:state.jobs.filter(visible).length,active:state.runs.filter(run=>visible(run)&&run.status==='running').map(run=>run.id)}
  if (method === 'status') return { running: ready && !loadError, error: loadError, jobs: state.jobs.length, enabled: state.jobs.filter(j => j.enabled && j.nextAt).length, active: [...active.keys()], file }
  requireReady()
  switch (method) {
    case 'list': return state.jobs.filter(visible).filter(j => (!args.employee || j.action.employeeId === args.employee) && (!args.source || j.source === args.source))
    case 'get': return job(args.id)
    case 'create': {
      assertEmployeeReady(args.spec?.action?.employeeId)
      const key=args.clientRequestId
      if(key!==undefined&&(typeof key!=='string'||!key.trim()||key.length>160))throw Error('clientRequestId must be 1–160 characters')
      const fingerprint=createHash('sha256').update(JSON.stringify(stable(rawSpec))).digest('hex')
      if(key){
        const previous=state.jobs.find(item=>item.clientRequestId===key&&JSON.stringify(item.createdBy??item.delegation?.requestedBy??{kind:'operator'})===JSON.stringify(context.principal))
        if(previous){if(!visible(previous))throw Error('Creation key belongs to a schedule outside your current scope');if(previous.requestFingerprint!==fingerprint)throw Error('clientRequestId already used with different content');return previous}
      }
      const spec = validate(args.spec), nextAt = future(spec), now = stamp()
      const item: ScheduledJob = { ...spec, delegation:scheduleDelegation(spec.action.employeeId),id: `job_${randomUUID()}`,createdAt:now,updatedAt:now,nextAt,revision:1,occurrences:0,createdBy:context.principal,...(key?{clientRequestId:key,requestFingerprint:fingerprint}:{}) }
      state.jobs.push(item); save(); return item
    }
    case 'update': {
      const item = job(args.id)
      if (state.runs.some(r => r.jobId === item.id && r.status === 'running')) throw new Error('Cancel the active run before updating its schedule')
      const spec = validate({ ...item, ...args.patch })
      const timing = (value: ScheduleSpec) => JSON.stringify(stable([value.rule,value.window??null,value.until??null,value.maxOccurrences??null,value.enabled]))
      const rescheduled = timing(spec) !== timing(item)
      const nextAt = rescheduled ? future(spec) : item.nextAt
      if(rescheduled&&spec.maxOccurrences&&(item.occurrences??0)>=spec.maxOccurrences&&spec.enabled)throw Error('Occurrence limit reached; increase or clear maxOccurrences to resume')
      Object.assign(item, spec, { delegation:scheduleDelegation(spec.action.employeeId),nextAt, disabledReason: undefined }); bump(item);save(); return item
    }
    case 'pause': { const item = job(args.id); item.enabled = false; bump(item);save(); return item }
    case 'resume': {
      validateDelegation(job(args.id).delegation,job(args.id).action.employeeId)
      const item = job(args.id), spec = validate({ ...item, enabled: true }), nextAt = future(spec)
      if(item.maxOccurrences&&(item.occurrences??0)>=item.maxOccurrences)throw Error('Occurrence limit reached; increase or clear maxOccurrences first')
      Object.assign(item, spec, { nextAt, disabledReason: undefined });bump(item); save(); return item
    }
    case 'delete': {
      const item = job(args.id)
      // Disable before awaiting cancellation so a due tick cannot claim another occurrence.
      item.enabled = false; item.nextAt = null; save()
      const running = state.runs.filter(r => r.jobId === item.id && r.status === 'running')
      await Promise.all(running.map(r => cancel(r.id)))
      state.jobs = state.jobs.filter(j => j.id !== item.id); save(); return { deleted: true }
    }
    case 'preview': {
      if(args.patch&&!args.id)throw Error('A draft preview patch requires a saved schedule ID')
      const saved = args.id ? job(args.id) : undefined
      const spec = saved ? (args.patch ? validate({...saved,...args.patch}) : saved) : validate(args.spec)
      const count=args.count??5
      if(!Number.isInteger(count)||count<1||count>100)throw Error('count must be 1..100')
      const remaining=spec.maxOccurrences?Math.max(0,spec.maxOccurrences-((spec as ScheduledJob).occurrences??0)):count
      const now=Date.now(),after=args.after?Date.parse(instant(args.after)):now
      if(saved){
        const projected={...saved,...spec,...(args.patch?{nextAt:nextOccurrence(spec,now)}:{})}
        return {times:forecastSchedule(projected,after,count,now)}
      }
      return {times:remaining?preview(spec,after,Math.min(count,remaining)):[]}
    }
    case 'run': {
      const item = job(args.id)
      assertEmployeeReady(item.action.employeeId)
      validate(item);validateDelegation(item.delegation,item.action.employeeId)
      if (state.runs.some(r => r.status === 'running' && r.action.employeeId === item.action.employeeId)) throw new Error('Employee already has a scheduled task')
      const run = record(item, 'manual', stamp()); save(); launch(item, run); return { ...run }
    }
    case 'history': return state.runs.filter(visible).filter(r => (!args.id || r.jobId === args.id) && (!args.employee || r.action.employeeId === args.employee)).slice(-(Math.max(1, Math.min(1000, Number(args.limit) || 50)))).reverse()
    case 'cancel': return cancel(args.id)
    default: throw new Error('Unknown scheduler method')
  }
  }finally{finishInteraction()}
}
async function cancel(id: string) {
  const run = state.runs.find(r => r.id === id)
  if (!run) throw new Error('Unknown run')
  const task = active.get(id)
  if (task) { task.controller.abort(new Error('Cancelled by user')); await task.done }
  return run
}
