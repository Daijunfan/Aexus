// Disposable Host fixture: workflow history paging and cancellation reconciliation.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

const root = path.resolve(import.meta.dirname, '../../..')
const id = 'wf_33333333-3333-4333-8333-333333333333'

async function fixture({running = false, failCancel = true, summary, error} = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-workflow-lifecycle-'))
  const appRoot = path.join(home, 'app')
  const runtimeRoot = path.join(appRoot, 'Engine', 'fixture-engine')
  fs.mkdirSync(runtimeRoot, {recursive: true})
  fs.writeFileSync(path.join(runtimeRoot, 'runtime.mjs'), [
    'export const create = input => input',
    'export const describe = state => ({phase: state.phase, cancelAttempts: state.cancelAttempts ?? 0, cleaned: !!state.cleaned})',
    'export const respond = state => state',
    'export async function run(state, {signal}) {',
    '  if (state.phase === "waiting") return {status: "waiting", state}',
    '  await new Promise((_, reject) => {',
    '    if (signal.aborted) return reject(signal.reason)',
    '    signal.addEventListener("abort", () => reject(signal.reason), {once: true})',
    '  })',
    '}',
    'export async function cancel(state) {',
    '  state.cancelAttempts = (state.cancelAttempts ?? 0) + 1',
    '  if (state.failCancel && state.cancelAttempts === 1) throw Error("injected cleanup failure")',
    '  state.cleaned = true',
    '}'
  ].join('\n'))
  const folder = path.join(home, 'workflows', id)
  fs.mkdirSync(folder, {recursive: true})
  fs.writeFileSync(path.join(folder, 'state.json'), JSON.stringify({
    id, engineId: 'fixture-engine', engineVersion: '1.0.0',
    owner: {principal: {kind: 'operator'}, requestId: 'isolated-fixture'},
    state: {phase: running ? 'running' : 'waiting', failCancel}, summary: summary ?? {phase: running ? 'running' : 'waiting'},
    status: running ? 'running' : 'waiting', revision: 12, createdAt: 1, updatedAt: 12, files: [],
    startKey: 'seed', inputHash: 'fixture', answers: {}, ...(error ? {error} : {}),
    events: Array.from({length: 12}, (_, i) => ({
      revision: i + 1, at: i + 1, status: 'waiting', phase: 'phase-' + (i + 1)
    }))
  }))
  const manifest = {id: 'fixture-engine', version: '1.0.0', runtime: 'runtime.mjs', directory: 'fixture-engine', requiredCommands: []}
  const stubs = {
    './engine-scope': 'export const currentEngineScope=()=>undefined;export const adoptWorkflowResources=()=>{};',
    '../shared/protocol': 'export const APP_HOME=' + JSON.stringify(home) + ';',
    './authorization': 'export const requestContext=()=>({principal:{kind:"operator"},requestId:"isolated-fixture"});export const authorize=()=>{};export const withCaller=(_owner,work)=>work();',
    './resources': 'export const applicationRoot=()=>' + JSON.stringify(appRoot) + ';',
    './contract': 'export const installedEngines=()=>({engines:[' + JSON.stringify(manifest) + ']});export const contractRequest=async()=>{throw Error("Unexpected Infra request in lifecycle fixture")};'
  }
  const outfile = path.join(home, 'host.mjs')
  await build({
    entryPoints: [path.join(root, 'Infra/src/main/workflows.ts')],
    outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{name: 'isolated-workflow-boundaries', setup(plugin) {
      plugin.onResolve({filter: /.*/}, args =>
        args.importer.endsWith('/workflows.ts') && args.path in stubs
          ? {path: args.path, namespace: 'fixture'} : undefined)
      plugin.onLoad({filter: /.*/, namespace: 'fixture'}, args =>
        ({contents: stubs[args.path], loader: 'js'}))
    }}]
  })
  return {home, host: await import(pathToFileURL(outfile).href)}
}

test('revision cursor returns chronological pages without skipping earlier retained events', async () => {
  const {home, host} = await fixture()
  try {
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    const recent = await host.workflowRequest('workflow.events', {id, limit: 5})
    assert.deepEqual(recent.events.map(event => event.revision), [8, 9, 10, 11, 12])
    const first = await host.workflowRequest('workflow.events', {id, afterRevision: 0, limit: 5})
    const middle = await host.workflowRequest('workflow.events', {id, afterRevision: 5, limit: 5})
    const last = await host.workflowRequest('workflow.events', {id, afterRevision: 10, limit: 5})
    assert.deepEqual(first.events.map(event => event.revision), [1, 2, 3, 4, 5])
    assert.deepEqual(middle.events.map(event => event.revision), [6, 7, 8, 9, 10])
    assert.deepEqual(last.events.map(event => event.revision), [11, 12])
  } finally {
    await host.stopWorkflows()
    fs.rmSync(home, {recursive: true, force: true})
  }
})

test('brief workflow lists omit heavyweight evidence without changing existing full projections', async () => {
  const source = 'Independent source excerpt. '.repeat(80)
  const summary = {
    title: 'Evidence archive', topic: 'A large study', phase: 'research',
    sources: Array.from({length: 1000}, (_, i) => ({id: 'source-' + i, excerpt: source})),
    graph: {nodes: [{id: 'original', payload: {privateContent: source}}]},
  }
  const {home, host} = await fixture({summary, error: 'Sensitive diagnostic data '.repeat(1000)})
  try {
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    const full = await host.workflowRequest('workflow.list', {engineId: 'fixture-engine'})
    assert.deepEqual(full.jobs[0].summary, summary, 'default list projection stays fully compatible')
    const brief = await host.workflowRequest('workflow.list', {engineId: 'fixture-engine', brief: true})
    assert.equal(brief.total, full.total)
    assert.equal(brief.hasMore, full.hasMore)
    assert.equal(brief.jobs[0].id, full.jobs[0].id)
    assert.equal(brief.jobs[0].status, full.jobs[0].status)
    assert.deepEqual(brief.jobs[0].summary, {title: summary.title, topic: summary.topic, phase: summary.phase})
    assert.deepEqual(brief.jobs[0].files, [])
    assert.equal(brief.jobs[0].error, undefined, 'diagnostics belong in an explicitly requested workflow detail')
    assert.ok(JSON.stringify(brief).length < 1500, 'brief list must not transfer source bodies or graph data')
    await assert.rejects(host.workflowRequest('workflow.list', {brief: 'yes'}), /brief/)
  } finally {
    await host.stopWorkflows()
    fs.rmSync(home, {recursive: true, force: true})
  }
})

test('active cancellation waits for run exit and reconciles a native task only once', async () => {
  const {home, host} = await fixture({running: true, failCancel: false})
  try {
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    const stopped = await host.workflowRequest('workflow.cancel', {id})
    assert.equal(stopped.status, 'cancelled')
    assert.equal(stopped.controlPending, false)
    assert.equal(stopped.summary.cancelAttempts, 1, 'the run and Stop handler must not both cancel the same task')
    assert.equal(stopped.summary.cleaned, true)
    await host.stopWorkflows()
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    assert.equal((await host.workflowRequest('workflow.get', {id})).summary.cancelAttempts, 1)
  } finally {
    await host.stopWorkflows()
    fs.rmSync(home, {recursive: true, force: true})
  }
})

test('failed non-research cancellation stays pending and can be reconciled after restart', async () => {
  const {home, host} = await fixture()
  try {
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    const pending = await host.workflowRequest('workflow.cancel', {id})
    assert.equal(pending.status, 'cancelled')
    assert.equal(pending.controlPending, true, 'unverified cancellation must remain retryable')
    assert.match(pending.error, /injected cleanup failure/)
    assert.equal((await host.workflowRequest('workflow.get', {id})).controlPending, true)
    await host.stopWorkflows()
    host.startWorkflows(() => {throw Error('No external execution allowed')}, () => {})
    assert.equal((await host.workflowRequest('workflow.get', {id})).controlPending, true)
    const resolved = await host.workflowRequest('workflow.cancel', {id})
    assert.equal(resolved.status, 'cancelled')
    assert.equal(resolved.controlPending, false)
    assert.equal(resolved.summary.cancelAttempts, 2)
    assert.equal(resolved.summary.cleaned, true)
    const repeated = await host.workflowRequest('workflow.cancel', {id})
    assert.equal(repeated.revision, resolved.revision, 'confirmed cancellation is idempotent')
  } finally {
    await host.stopWorkflows()
    fs.rmSync(home, {recursive: true, force: true})
  }
})
