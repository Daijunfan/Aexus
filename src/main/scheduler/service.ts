import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_HOME } from '../../shared/protocol'
import type { ScheduleSpec, ScheduledJob, ScheduleRun, ScheduledAction } from '../../shared/scheduler'
import { readStore } from '../store'
import { executeTask } from './execute'
import { instant, validateRule, validateWindow, nextOccurrence, preview, inWindow, windowEnd } from './time'

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
}
function job(id: string) {
  const found = state.jobs.find(job => job.id === id)
  if (!found) throw new Error('Unknown schedule')
  return found
}
function validate(input: ScheduleSpec): ScheduleSpec {
  if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Schedule name is required')
  const a = input.action, card = readStore().sessions.find(card => card.id === a?.employeeId)
  if (!card) throw new Error('Unknown employee')
  if (a.type !== 'agent') throw new Error('action.type must be agent; prompt contains the instruction or CLI command for the employee')
  if (a.engine && a.engine !== card.engine) throw new Error('Schedule engine must match the employee')
  if (typeof a.prompt !== 'string' || !a.prompt.trim()) throw new Error('action.prompt is required')
  if (a.model !== undefined && (typeof a.model !== 'string' || !a.model.trim())) throw new Error('model must be a nonempty string')
  if (a.effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(a.effort)) throw new Error('Invalid effort level')
  if (a.thinking !== undefined && (typeof a.thinking !== 'boolean' || card.engine !== 'claude')) throw new Error('thinking must be boolean and is only supported by Claude; Codex uses effort')
  const action: ScheduledAction = { type: 'agent', employeeId: card.id, engine: card.engine, prompt: a.prompt, model: a.model, effort: a.effort, thinking: a.thinking }
  const timeoutSeconds = input.timeoutSeconds ?? 1800, graceSeconds = input.graceSeconds ?? 60
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 86400) throw new Error('timeoutSeconds must be 1..86400')
  if (!Number.isInteger(graceSeconds) || graceSeconds < 1 || graceSeconds > 86400) throw new Error('graceSeconds must be 1..86400')
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean')
  if (input.source !== undefined && (typeof input.source !== 'string' || !input.source.trim())) throw new Error('source must be a namespace string')
  return { name: input.name.trim(), action, rule: validateRule(input.rule), window: validateWindow(input.window), until: input.until ? instant(input.until) : undefined, timeoutSeconds, graceSeconds, enabled: input.enabled ?? true, source: input.source }
}
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
  const employees = new Set(readStore().sessions.map(card => card.id))
  let changed = false
  for (const item of state.jobs) if (!employees.has(item.action.employeeId) && item.disabledReason !== 'employee_removed') {
    Object.assign(item, { enabled: false, nextAt: null, disabledReason: 'employee_removed', updatedAt: stamp() }); changed = true
  }
  for (const run of state.runs) if (run.status === 'running' && !employees.has(run.action.employeeId)) active.get(run.id)?.controller.abort(new Error('Employee removed'))
  if (changed) save()
}
function record(item: ScheduledJob, trigger: ScheduleRun['trigger'], scheduledAt: string): ScheduleRun {
  const run: ScheduleRun = { id: `run_${randomUUID()}`, jobId: item.id, jobName: item.name, action: { ...item.action }, trigger, scheduledAt, startedAt: stamp(), status: 'running' }
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
      await executeTask(run.action, run.id, controller.signal, id => { run.sessionId = id; save() })
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
      item.nextAt = nextOccurrence(item, now)
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
    version: 1, action: { type: 'agent', employeeId: 'required saved employee ID', engine: 'inferred on create, pinned afterwards', prompt: 'required instruction; shell/CLI commands are performed by this employee', model: 'optional engine model ID', effort: ['low','medium','high','xhigh','max'], thinking: 'optional boolean, Claude only' },
    rule: { once: {at:'ISO timestamp with offset'}, interval:{everySeconds:'integer 1..31536000',anchor:'ISO timestamp with offset'}, weekly:{time:'HH:mm',days:'1=Monday..7=Sunday',timezone:'IANA zone'} },
    window: {start:'HH:mm inclusive',end:'HH:mm exclusive; may cross midnight',days:'optional weekdays of window start',timezone:'IANA zone'},
    defaults:{timeoutSeconds:1800,graceSeconds:60,enabled:true}, source:'optional plugin/caller namespace', until:'optional exclusive ISO end time',
    policies:{busy:'skip, never interrupt manual work',late:'skip outside grace; never replay a backlog',restart:'interrupted runs are not replayed',manual:'run ignores calendar/window, keeps timeout',window:'scheduled turns stop when their window or until ends',permission:'inherits employee and Team; never escalated',overrides:'temporary model/effort/thinking, original preferences restored'},
    commands:['status','list','get','create','update','pause','resume','delete','preview','run','history','cancel'], documentation:'SCHEDULER.md'
  }
  if (method === 'status') return { running: ready && !loadError, error: loadError, jobs: state.jobs.length, enabled: state.jobs.filter(j => j.enabled && j.nextAt).length, active: [...active.keys()], file }
  requireReady()
  switch (method) {
    case 'list': return state.jobs.filter(j => (!args.employee || j.action.employeeId === args.employee) && (!args.source || j.source === args.source))
    case 'get': return job(args.id)
    case 'create': {
      const spec = validate(args.spec), nextAt = future(spec), now = stamp()
      const item: ScheduledJob = { ...spec, id: `job_${randomUUID()}`, createdAt: now, updatedAt: now, nextAt }
      state.jobs.push(item); save(); return item
    }
    case 'update': {
      const item = job(args.id)
      if (state.runs.some(r => r.jobId === item.id && r.status === 'running')) throw new Error('Cancel the active run before updating its schedule')
      const spec = validate({ ...item, ...args.patch }), nextAt = future(spec)
      Object.assign(item, spec, { nextAt, updatedAt: stamp(), disabledReason: undefined }); save(); return item
    }
    case 'pause': { const item = job(args.id); item.enabled = false; item.updatedAt = stamp(); save(); return item }
    case 'resume': {
      const item = job(args.id), spec = validate({ ...item, enabled: true }), nextAt = future(spec)
      Object.assign(item, spec, { nextAt, updatedAt: stamp(), disabledReason: undefined }); save(); return item
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
      const spec = args.id ? job(args.id) : validate(args.spec)
      return { times: preview(spec, args.after ? Date.parse(instant(args.after)) : Date.now(), args.count ?? 5) }
    }
    case 'run': {
      const item = job(args.id)
      validate(item)
      if (state.runs.some(r => r.status === 'running' && r.action.employeeId === item.action.employeeId)) throw new Error('Employee already has a scheduled task')
      const run = record(item, 'manual', stamp()); save(); launch(item, run); return { ...run }
    }
    case 'history': return state.runs.filter(r => (!args.id || r.jobId === args.id) && (!args.employee || r.action.employeeId === args.employee)).slice(-(Math.max(1, Math.min(1000, Number(args.limit) || 50)))).reverse()
    case 'cancel': return cancel(args.id)
    default: throw new Error('Unknown scheduler method')
  }
}
async function cancel(id: string) {
  const run = state.runs.find(r => r.id === id)
  if (!run) throw new Error('Unknown run')
  const task = active.get(id)
  if (task) { task.controller.abort(new Error('Cancelled by user')); await task.done }
  return run
}
