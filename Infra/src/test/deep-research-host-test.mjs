// Real workflows.ts + Engine runtime; authorization, resource discovery and native transport are in-memory fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {create, describe, run} from '../../../Engine/deep-research/runtime.mjs'
import {applyPlan} from '../../../Engine/deep-research/graph.mjs'

const root = path.resolve(import.meta.dirname, '../../..')
const workers = ['coordinator', 'researcher', 'verifier', 'writer'].map(role => ({id: role, specId: role, role, label: role, engine: 'codex', managementRole: role === 'coordinator' ? 'manager' : 'employee', managerIds: []}))
const proposal = version => ({dimensions: [{id: 'd1', query: 'Synthetic evidence and missing assumptions'}], team: workers.map(w => ({...w})), nodes: [
  {id: 'search', kind: 'search', dependencies: [], payload: {query: 'Synthetic initial evidence'}},
  {id: 'verify', kind: 'verify', dependencies: ['search']},
  ...(version > 1 ? [{id: 'followup', kind: 'search', dependencies: ['verify'], payload: {query: 'Synthetic missing assumption'}}] : []),
  {id: 'write-' + version, kind: 'write', dependencies: version > 1 ? ['verify', 'followup'] : ['verify']},
  {id: 'review-' + version, kind: 'review', dependencies: ['write-' + version]}
]})
function prepared(autoApprove = false) {
  const state = create({topic: 'Synthetic Host checkpoint and direction amendment', autoApprove, engines: ['codex']})
  state.phase = 'planning'; state.team = 'Synthetic Research'; state.workers = structuredClone(workers)
  applyPlan(state, proposal(1), 'Synthetic first plan')
  return state
}
function transport({reviseOnce = false} = {}) {
  const records = new Map(), sent = []
  let reviews = 0
  const dispatch = async (name, args = {}) => {
    if (name === 'engine.check') return {ready: true}
    if (name === 'group.list') return ['Synthetic Research']
    if (name === 'session.list') return {sessions: workers}
    if (name === 'session.status') return [{busy: false, initialization: {status: 'ready'}}]
    if (name === 'management.bind' || name === 'management.unbind') return {}
    if (name === 'session.send') {
      const request = JSON.parse(args.text.split('\n\n')[1]), messageId = args.clientMessageId
      sent.push(request)
      let value
      if (request.kind === 'plan') value = proposal(2)
      else if (request.kind === 'search') value = {sources: [{title: 'Synthetic fixture source', url: 'https://example.org/host-fixture', acquisition: {status: 'read', excerpt: 'Synthetic evidence costs 12 units.', locator: 'Synthetic paragraph 1'}}]}
      else if (request.kind === 'verify') value = {verifications: request.payload.sources.map(s => ({sourceId: s.id, credibilityScore: 1, claims: [{text: 'Synthetic evidence costs 12 units.', excerpt: 'Synthetic evidence costs 12 units.', confidence: 1}]}))}
      else if (request.kind === 'write') value = {report: {title: 'Synthetic approved report', sections: [{heading: 'Evidence', content: 'Synthetic evidence costs 12 units.', citations: request.payload.sources.filter(s => s.verified).map(s => s.id)}]}}
      else if (request.kind === 'review') value = reviseOnce && reviews++ === 0 ? {verdict: 'revise', summary: 'Synthetic missing assumption', issues: [{description: 'Synthetic missing assumption', suggestion: 'Investigate a new branch'}]} : {verdict: 'pass', summary: 'Synthetic review fixture', issues: []}
      else throw Error('Unexpected synthetic kind: ' + request.kind)
      records.set(args.employee, {prompt: args.text, messageId, response: {taskId: messageId, ...value}})
      return {messageId}
    }
    if (name === 'session.transcript') {
      const item = records.get(args.employee)
      return {items: [{role: 'user', text: item.prompt, outbound: {taskId: item.messageId}}, {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify(item.response)}]}]}
    }
    throw Error('Unexpected fixture operation, no real agent launched: ' + name)
  }
  return {dispatch, sent}
}
async function fixtureHost(home) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Engine/deep-research/engine.json'), 'utf8'))
  const fixtures = {
    './engine-scope': 'export const currentEngineScope=()=>undefined;export const adoptWorkflowResources=()=>{};',
    '../shared/protocol': 'export const APP_HOME=' + JSON.stringify(home) + ';',
    './authorization': 'export const requestContext=()=>({principal:{kind:"operator"},requestId:"independent-fixture"});export const authorize=()=>{};export const withCaller=(_owner,fn)=>fn();',
    './resources': 'export const applicationRoot=()=>' + JSON.stringify(root) + ';',
    './contract': 'export const installedEngines=()=>({engines:[' + JSON.stringify({...manifest, directory: 'deep-research'}) + ']});export const contractRequest=async(_cmd,args,invoke)=>({data:await invoke(args.command,args.args)});'
  }
  const file = path.join(home, 'host-fixture.mjs')
  await build({entryPoints: [path.join(root, 'Infra/src/main/workflows.ts')], outfile: file, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{name: 'isolated-host-boundaries', setup(b) {
    b.onResolve({filter: /.*/}, args => args.importer.endsWith('/workflows.ts') && args.path in fixtures ? {path: args.path, namespace: 'host-fixture'} : undefined)
    b.onLoad({filter: /.*/, namespace: 'host-fixture'}, args => ({contents: fixtures[args.path], loader: 'js'}))
  }}]})
  return import(pathToFileURL(file).href)
}
const waitFor = async check => {
  for (let i = 0; i < 200; i++) {const value = await check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 5))}
  throw Error('Independent Host checkpoint timed out')
}

test('Current persisted research restarts, pauses, amends, resumes and exports through the actual Host lifecycle', {timeout: 5000}, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-research-host-'))
  const id = 'wf_11111111-1111-4111-8111-111111111111', state = prepared(), fixture = transport()
  const directory = path.join(home, 'workflows', id)
  fs.mkdirSync(directory, {recursive: true})
  fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify({id, engineId: 'deep-research', engineVersion: '2.0.0', owner: {principal: {kind: 'operator'}, requestId: 'independent-fixture'}, state, summary: describe(state), status: 'running', revision: 1, createdAt: Date.now(), updatedAt: Date.now(), files: [], startKey: 'seed', inputHash: 'fixture', answers: {}}))
  const host = await fixtureHost(home)
  try {
    host.startWorkflows(fixture.dispatch, () => {})
    let job = await waitFor(async () => {const j = await host.workflowRequest('workflow.get', {id}); return j.status === 'waiting' && j})
    assert.equal(fixture.sent.length, 0, 'Current checkpoint must reach waiting without a new native request')
    job = await host.workflowRequest('workflow.pause', {id})
    assert.equal(job.status, 'paused'); assert.equal(job.controlPending, false)
    job = await host.workflowRequest('workflow.amend', {id, expectedRevision: job.revision, clientRequestId: 'amend', update: {instructions: 'Synthetic missing assumption must be investigated'}})
    assert.equal(job.status, 'paused')
    await host.workflowRequest('workflow.resume', {id, expectedRevision: job.revision, clientRequestId: 'resume'})
    job = await waitFor(async () => {const j = await host.workflowRequest('workflow.get', {id}); if (j.status === 'failed') throw Error(j.error); return j.status === 'waiting' && j.summary.graph.version === 2 && j})
    assert.equal(fixture.sent.filter(s => s.kind === 'plan').length, 1)
    assert.match(job.summary.planRevisions.at(-1).reason, /missing assumption/)
    const revision = job.revision
    await host.stopWorkflows()
    host.startWorkflows(fixture.dispatch, () => {})
    job = await host.workflowRequest('workflow.get', {id})
    assert.equal(job.status, 'waiting'); assert.equal(job.revision, revision)
    await host.workflowRequest('workflow.respond', {id, expectedRevision: job.revision, clientRequestId: 'approve', answer: {action: 'approve-plan'}})
    job = await waitFor(async () => {const j = await host.workflowRequest('workflow.get', {id}); if (j.status === 'failed') throw Error(j.error); return j.status === 'completed' && j})
    assert.equal(job.files.length, 5)
    const file = await host.workflowRequest('workflow.file', {id, name: 'research-report.html'})
    assert.match(file.content, /Synthetic approved report/)
    assert.match(file.content, /example.org\/host-fixture/)
    assert.equal(new Set(fixture.sent.map(s => s.taskId)).size, fixture.sent.length)
    const out = path.join(root, '.aexus/artifacts/deep-research-independent')
    fs.mkdirSync(out, {recursive: true})
    fs.writeFileSync(path.join(out, 'host.json'), JSON.stringify({passed: true, realModules: ['workflows.ts', 'deep-research/runtime.mjs'], fixtures: ['authorization', 'resource discovery', 'Contract/native transport'], checks: ['current checkpoint restart', 'pause-amend-resume', 'persist waiting plan across restart', 'approve revised DAG', 'five published files and hashed file read'], modelCalls: 0, agentProcesses: 0, productionDataUsed: false}, null, 2))
  } finally {await host.stopWorkflows(); fs.rmSync(home, {recursive: true, force: true})}
})

test('A revise verdict creates a new DAG and final draft while retaining completed research', {timeout: 5000}, async () => {
  const state = prepared(true), fixture = transport({reviseOnce: true})
  const result = await run(state, {id: 'fixture/review-replan', signal: new AbortController().signal, client: {invoke: fixture.dispatch}, checkpoint: async () => {}})
  assert.equal(result.status, 'completed')
  assert.equal(result.state.graph.version, 2)
  assert.equal(result.state.review.verdict, 'pass')
  assert.match(result.state.planRevisions[1].reason, /missing assumption/)
  assert.ok(result.state.graph.nodes.some(n => n.id === 'write-1' && n.active === false && n.status === 'completed'))
  assert.ok(result.state.graph.nodes.some(n => n.id === 'review-1' && n.active === false))
  assert.equal(result.state.graph.nodes.filter(n => n.active && n.kind === 'write').length, 1)
  assert.equal(fixture.sent.filter(s => s.taskId.endsWith('/search-v1')).length, 1)
  assert.equal(fixture.sent.filter(s => s.kind === 'review').length, 2)
  assert.ok(fixture.sent.some(s => s.taskId.endsWith('/followup-v2')))
})
