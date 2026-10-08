// Independent domain acceptance with labelled synthetic evidence; no provider, process or user state.
import assert from 'node:assert/strict'
import test from 'node:test'
import {normalizeNodes, applyPlan, readyNodes, planProgress} from '../../../Engine/deep-research/graph.mjs'
import {normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport} from '../../../Engine/deep-research/evidence.mjs'
import {create, retry, run} from '../../../Engine/deep-research/runtime.mjs'
import {ask} from '../../../Engine/deep-research/agents.mjs'

const initial = () => ({
  phase: 'scouting', input: {maxTasks: 32, maxSources: 20, autoApprove: false},
  graph: {version: 0, nodes: []}, sources: [], findings: [], contradictions: [],
  visualization: {timeline: []}
})
const plan = () => ({
  nodes: [
    {id: 'policy', kind: 'search', role: 'policy-researcher', dependencies: [], payload: {query: 'Current policy'}},
    {id: 'cost', kind: 'search', role: 'cost-researcher', dependencies: [], payload: {query: 'Current cost'}},
    {id: 'verify', kind: 'verify', dependencies: ['policy', 'cost']},
    {id: 'report', kind: 'write', dependencies: ['verify']},
    {id: 'review', kind: 'review', dependencies: ['report']}
  ], dimensions: []
})
const node = (state, id) => state.graph.nodes.find(n => n.id === id && n.active !== false)
const evidenceFixture = () => normalizeSources({sources: [{
  title: 'Synthetic policy fixture, not a live source', url: 'https://example.org/policy?utm_source=fixture',
  acquisition: {status: 'read', excerpt: 'Synthetic evidence: Standard A applies from 2026-10-01. The price is 12 units.', locator: 'Fixture paragraph 1'}
}]}).sources[0]
const verificationFixture = source => ({verifications: [{
  sourceId: source.id, credibilityScore: 1,
  claims: [{text: 'The synthetic price is 12 units.', excerpt: 'The price is 12 units.', locator: 'Fixture paragraph 1', confidence: 1}]
}]})
const readyEvidence = () => {
  const state = initial(), source = evidenceFixture()
  mergeSources(state, [source], {id: 'policy'})
  mergeVerification(state, normalizeVerification(verificationFixture(source), state.sources))
  return state
}

test('Scouting and planning keep progress unknown; completion is distinct from exhausted tasks', () => {
  const state = initial()
  assert.equal(planProgress(state).percent, null)
  applyPlan(state, plan(), 'Synthetic first plan')
  assert.equal(planProgress(state).total, null)
  state.phase = 'planning'
  assert.equal(planProgress(state).mode, 'indeterminate')
  state.phase = 'research'
  node(state, 'policy').status = 'completed'
  node(state, 'cost').status = 'failed'
  assert.equal(planProgress(state).completed, 1)
  assert.equal(planProgress(state).failed, 1)
  assert.ok(planProgress(state).percent < 100)
  for (const n of state.graph.nodes) n.status = 'completed'
  assert.ok(planProgress(state).percent < 100, 'Artifact delivery has not completed')
  state.phase = 'complete'
  assert.equal(planProgress(state).percent, 100)
})

test('Independent branches are ready together; failed or unfinished dependencies block descendants', () => {
  const state = initial()
  applyPlan(state, plan(), 'Synthetic parallel plan')
  assert.deepEqual(readyNodes(state).map(n => n.id), ['policy', 'cost'])
  node(state, 'policy').status = 'completed'
  node(state, 'cost').status = 'failed'
  assert.deepEqual(readyNodes(state), [])
  node(state, 'cost').status = 'pending'
  assert.deepEqual(readyNodes(state).map(n => n.id), ['cost'])
  node(state, 'cost').status = 'completed'
  assert.deepEqual(readyNodes(state).map(n => n.id), ['verify'])
})

test('Cycles, missing dependencies and review before writing cannot enter the execution graph', () => {
  const cyclic = plan()
  cyclic.nodes[0].dependencies = ['review']
  assert.throws(() => normalizeNodes(cyclic.nodes), /循环/)
  const missing = plan()
  missing.nodes[0].dependencies = ['absent']
  assert.throws(() => normalizeNodes(missing.nodes), /不存在/)
  const premature = plan()
  premature.nodes.at(-1).dependencies = ['verify']
  assert.throws(() => normalizeNodes(premature.nodes), /依赖报告/)
})

test('Mandatory research cannot sit outside the final review dependency closure', () => {
  const orphan = plan()
  orphan.nodes.push({id: 'late-evidence', kind: 'search', dependencies: [], payload: {query: 'Important evidence that the report would miss'}})
  assert.throws(() => normalizeNodes(orphan.nodes), /最终|覆盖|祖先|汇合|依赖/)
  orphan.nodes.find(n => n.id === 'review').dependencies.push('late-evidence')
  assert.throws(() => normalizeNodes(orphan.nodes), /最终|报告|覆盖|祖先|汇合|依赖/, 'Adding late evidence only to review cannot ground the already-written report')
})

test('Replanning preserves completed evidence and archives cancelled pending work', () => {
  const state = initial()
  applyPlan(state, plan(), 'Synthetic first plan')
  Object.assign(node(state, 'policy'), {status: 'completed', sourceIds: ['fixture-source'], resultSummary: 'Policy read'})
  const second = plan()
  second.nodes = second.nodes.filter(n => n.id !== 'cost')
  second.nodes.unshift({id: 'replacement', kind: 'search', dependencies: [], payload: {query: 'New discovery'}})
  second.nodes.find(n => n.id === 'verify').dependencies = ['policy', 'replacement']
  applyPlan(state, second, 'Synthetic discovery changed the cost assumption')
  assert.equal(state.graph.version, 2)
  assert.equal(node(state, 'policy').status, 'completed')
  assert.deepEqual(node(state, 'policy').sourceIds, ['fixture-source'])
  assert.ok(state.graph.nodes.some(n => n.id === 'cost' && !n.active && n.status === 'superseded'))
  assert.equal(state.planRevisions.length, 2)
  assert.match(state.planRevisions[1].reason, /discovery/)
  assert.deepEqual(readyNodes(state).map(n => n.id), ['replacement'])
  const restored = JSON.parse(JSON.stringify(state))
  assert.deepEqual(readyNodes(restored).map(n => n.id), ['replacement'])
  assert.deepEqual(restored.planRevisions, state.planRevisions)
})

test('Replanning cannot overwrite completed work or remove an in-flight branch', () => {
  const state = initial()
  applyPlan(state, plan(), 'Synthetic initial plan')
  node(state, 'policy').status = 'completed'
  const changed = plan()
  changed.nodes[0].payload.query = 'Different question with the same ID'
  const before = JSON.stringify(state)
  assert.throws(() => applyPlan(state, changed, 'Invalid revision'), /不能改写/)
  assert.equal(JSON.stringify(state), before)
  node(state, 'cost').status = 'running'
  const removed = plan()
  removed.nodes = removed.nodes.filter(n => n.id !== 'cost')
  removed.nodes.find(n => n.id === 'verify').dependencies = ['policy']
  assert.throws(() => applyPlan(state, removed, 'Invalid removal'), /在途/)
})

test('Tracking URLs deduplicate; search snippets stay discovered rather than read or verified', () => {
  const state = initial(), read = evidenceFixture()
  const discovered = normalizeSources({sources: [{url: 'https://example.org/policy#section', snippet: 'Search summary alone'}]}).sources[0]
  assert.equal(discovered.id, read.id)
  assert.equal(discovered.acquisition.status, 'discovered')
  mergeSources(state, [discovered], {id: 'first', dimensionId: 'a'})
  mergeSources(state, [read], {id: 'second', dimensionId: 'b'})
  assert.equal(state.sources.length, 1)
  assert.equal(state.sources[0].acquisition.status, 'read')
  assert.equal(state.sources[0].verified, false)
  assert.deepEqual(state.sources[0].nodeIds, ['first', 'second'])
  assert.deepEqual(state.sources[0].dimensionIds, ['a', 'b'])
})

test('Verification rejects fabricated excerpts, unknown sources and excerpts from discovery-only records', () => {
  const source = evidenceFixture(), wrong = verificationFixture(source)
  wrong.verifications[0].claims[0].excerpt = 'The price is 999 units.'
  assert.throws(() => normalizeVerification(wrong, [source]), /片段/)
  const unknown = verificationFixture(source)
  unknown.verifications[0].sourceId = 'nonexistent'
  assert.throws(() => normalizeVerification(unknown, [source]), /未知/)
  const discovered = {...source, acquisition: {...source.acquisition, status: 'discovered'}}
  assert.throws(() => normalizeVerification(verificationFixture(source), [discovered]), /片段/)
})

test('Reports cite verified read sources and retain the exact evidence locator after serialization', () => {
  const state = readyEvidence(), id = state.sources[0].id
  const input = {report: {title: 'Synthetic report fixture', sections: [{heading: 'Cost', content: 'The synthetic price is 12 units.', citations: [id]}]}}
  const report = validateReport(input, state)
  assert.deepEqual(report.citations, [id])
  assert.equal(report.sections[0].evidence[0].excerpt, 'The price is 12 units.')
  assert.equal(report.sections[0].evidence[0].locator, 'Fixture paragraph 1')
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report)
  input.report.sections[0].citations = ['nonexistent']
  assert.throws(() => validateReport(input, state), /未阅读|不存在/)
  input.report.sections[0].citations = [id]
  state.sources[0].verified = false
  assert.throws(() => validateReport(input, state), /未核验/)
})

test('Ambiguous concurrent final drafts are rejected before a review can inspect the wrong dependency', () => {
  const concurrent = {nodes: [
    {id: 'write-a', kind: 'write', role: 'writer-a', dependencies: [], payload: {fixtureTitle: 'Draft A'}},
    {id: 'write-b', kind: 'write', role: 'writer-b', dependencies: [], payload: {fixtureTitle: 'Draft B'}},
    {id: 'review-a', kind: 'review', role: 'reviewer-a', dependencies: ['write-a']},
    {id: 'review-b', kind: 'review', role: 'reviewer-b', dependencies: ['write-b']}
  ]}
  assert.throws(() => normalizeNodes(concurrent.nodes), /一个|一项|单一|最终/)
})

const deferred = () => {
  let resolve
  const promise = new Promise(r => {resolve = r})
  return {promise, resolve}
}

test('Cancellation during a transcript read cannot accept a late successful answer', async () => {
  const state = create({topic: 'Synthetic cancellation while reading transcript'})
  state.workers = [{id: 'fixture-worker', role: 'researcher', label: 'Fixture worker', engine: 'fixture'}]
  const controller = new AbortController(), reading = deferred(), transcript = deferred()
  let prompt, messageId, completedSnapshots = 0
  const ctx = {id: 'fixture/late-cancel', signal: controller.signal, checkpoint: async snapshot => {
    if (Object.values(snapshot.tasks).some(t => t.status === 'completed')) completedSnapshots++
  }, client: {invoke: async (name, args) => {
    if (name === 'session.status') return [{busy: false}]
    if (name === 'session.send') {prompt = args.text; messageId = args.clientMessageId; return {messageId}}
    if (name === 'session.transcript') {reading.resolve(); return transcript.promise}
    throw Error('Unexpected fixture call: ' + name)
  }}}
  const pending = ask(state, ctx, 'late-search', 'researcher', 'search', {}, normalizeSources)
  await reading.promise
  controller.abort(new DOMException('Synthetic owner cancellation', 'AbortError'))
  transcript.resolve({items: [
    {role: 'user', text: prompt, outbound: {taskId: messageId}},
    {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify({taskId: messageId, sources: []})}]}
  ]})
  const outcome = await pending.then(value => ({value}), error => ({error}))
  assert.equal(outcome.error?.name, 'AbortError', 'Late success must not resolve the cancelled task')
  assert.notEqual(state.tasks['late-search'].status, 'completed')
  assert.equal(completedSnapshots, 0)
})

test('Retrying a terminated malformed answer requests fresh work instead of consuming the same bad transcript', async () => {
  const state = create({topic: 'Synthetic retry after malformed terminal answer'})
  state.workers = [{id: 'fixture-worker', role: 'researcher', label: 'Fixture worker', engine: 'fixture'}]
  const sent = [], items = []
  let fixed = false
  const ctx = {id: 'fixture/format-retry', signal: new AbortController().signal, checkpoint: async () => {}, client: {invoke: async (name, args) => {
    if (name === 'session.status') return [{busy: false}]
    if (name === 'session.send') {
      sent.push(args.clientMessageId)
      items.push({role: 'user', text: args.text, outbound: {taskId: args.clientMessageId}},
        {role: 'assistant', blocks: [{kind: 'text', text: fixed ? JSON.stringify({taskId: args.clientMessageId, sources: []}) : 'Synthetic malformed result'}]})
      return {messageId: args.clientMessageId}
    }
    if (name === 'session.transcript') return {items}
    throw Error('Unexpected fixture call: ' + name)
  }}}
  await assert.rejects(ask(state, ctx, 'search', 'researcher', 'search', {}, normalizeSources), /完整 JSON/)
  const before = sent.length
  fixed = true
  retry(state)
  const result = await ask(state, ctx, 'search', 'researcher', 'search', {}, normalizeSources)
  assert.deepEqual(result.sources, [])
  assert.ok(sent.length > before, 'Explicit retry must submit a fresh task after terminal format failure')
  assert.equal(new Set(sent).size, sent.length, 'Retry must not reuse an accepted idempotency key')
})

function researchFixture(state, answer) {
  const sent = [], transcripts = new Map()
  state.workers = ['coordinator', 'researcher', 'verifier', 'synthesizer', 'writer'].flatMap(role =>
    Array.from({length: role === 'researcher' ? 3 : 1}, (_, i) => ({id: role + '-' + i, specId: role === 'coordinator' ? 'coordinator' : role + '-' + i, role, label: role, engine: 'fixture', managerIds: [], managementRole: role === 'coordinator' ? 'manager' : 'employee'})))
  return {sent, ctx: {id: 'fixture/true-dag', signal: new AbortController().signal, checkpoint: async () => {}, client: {invoke: async (name, args) => {
    if (name === 'session.status') return [{busy: false, initialization: {status: 'ready'}}]
    if (name === 'engine.check') return {ready: true}
    if (name === 'group.list') return [state.team]
    if (name === 'management.bind' || name === 'management.unbind') return {}
    if (name === 'session.send') {
      const envelope = JSON.parse(args.text.split('\n\n')[1]), messageId = args.clientMessageId
      sent.push(envelope)
      const response = Promise.resolve().then(() => answer(envelope)).then(value => ({taskId: messageId, ...value}))
      transcripts.set(args.employee, {prompt: args.text, messageId, response})
      return {messageId}
    }
    if (name === 'session.transcript') {
      const record = transcripts.get(args.employee), response = await record.response
      return {items: [{role: 'user', text: record.prompt, outbound: {taskId: record.messageId}}, {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify(response)}]}]}
    }
    throw Error('Unexpected in-memory Contract operation: ' + name)
  }}}}
}

test('A real fork/join DAG honors every parent, reuses a shared result, and advances past an unrelated slow branch', {timeout: 5000}, async () => {
  const state = create({topic: 'Synthetic fork join cross-layer shared DAG acceptance', autoApprove: true, team: {maxConcurrency: 4}})
  state.phase = 'research'
  const graph = {nodes: [
    {id: 'policy', kind: 'search', dependencies: []},
    {id: 'cost', kind: 'search', dependencies: []},
    {id: 'unrelated', kind: 'search', dependencies: []},
    {id: 'join', kind: 'verify', dependencies: ['policy', 'cost']},
    {id: 'shared', kind: 'synthesize', dependencies: ['join']},
    {id: 'followup', kind: 'search', dependencies: ['shared']},
    {id: 'checked', kind: 'verify', dependencies: ['followup', 'unrelated']},
    {id: 'report', kind: 'write', dependencies: ['shared', 'checked', 'policy']},
    {id: 'review', kind: 'review', dependencies: ['report', 'join']}
  ]}
  applyPlan(state, graph, 'Synthetic cross-layer plan')
  const slow = deferred(), followup = deferred()
  const fixture = researchFixture(state, async envelope => {
    const key = envelope.taskId.split('/').at(-1).replace(/-v\d+$/, '')
    const current = node(state, key)
    assert.ok(current.dependencies.every(id => node(state, id).status === 'completed'), key + ' started before its parents')
    if (envelope.kind === 'search') {
      if (key === 'unrelated') await slow.promise
      if (key === 'followup') {
        assert.ok(envelope.payload.dependencyResults.some(r => r.id === 'shared'))
        assert.ok(envelope.payload.synthesis.some(r => r.insights.includes('Shared fixture insight')))
        assert.notEqual(node(state, 'unrelated').status, 'completed')
        followup.resolve()
      }
      return {sources: [evidenceFixture()]}
    }
    if (envelope.kind === 'verify') return verificationFixture(state.sources[0])
    if (envelope.kind === 'synthesize') return {entities: [], relationships: [], insights: ['Shared fixture insight']}
    if (envelope.kind === 'write') {
      assert.ok(envelope.payload.synthesis.some(s => s.insights.includes('Shared fixture insight')))
      return {report: {title: 'Synthetic DAG report', sections: [{heading: 'Evidence', content: 'The synthetic price is 12 units.', citations: [state.sources[0].id]}]}}
    }
    return {verdict: 'pass', summary: 'Synthetic review fixture', issues: []}
  })
  const pending = run(state, fixture.ctx)
  await Promise.race([followup.promise, pending.then(() => {throw Error('Run completed before the followup checkpoint')})])
  slow.resolve()
  const result = await pending
  assert.equal(result.status, 'completed')
  assert.equal(result.state.graph.nodes.filter(n => n.active).length, 9)
  assert.ok(result.state.graph.nodes.every(n => n.status === 'completed'))
  const ids = fixture.sent.map(s => s.taskId)
  assert.equal(new Set(ids).size, ids.length, 'A shared node must not be executed again for each child')
  assert.equal(ids.filter(id => id.endsWith('/shared-v1')).length, 1)
})
