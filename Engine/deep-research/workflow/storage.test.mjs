import test from 'node:test';
import assert from 'node:assert/strict';
import {create, run, retry} from '../runtime.mjs';
import {applyPlan} from '../graph.mjs';
import {projectKnowledge} from '../knowledge/index.mjs';

function prepared() {
  const state = create({topic: 'Checkpoint only the authoritative research result', autoApprove: true,
    team: {maxConcurrency: 1}});
  applyPlan(state, {nodes: [
    {id: 'original', kind: 'search', role: 'researcher', dependencies: []},
    {id: 'verify', kind: 'verify', role: 'verifier', dimensionId: 'd1', dependencies: ['original']},
    {id: 'synthesize', kind: 'synthesize', role: 'analyst', dependencies: ['verify']},
    {id: 'write', kind: 'write', role: 'writer', dependencies: ['synthesize']},
    {id: 'review', kind: 'review', role: 'coordinator', dependencies: ['write']}
  ]}, 'Canonical checkpoint');
  const original = state.graph.nodes.find(node => node.id === 'original');
  Object.assign(original, {status: 'completed', sourceIds: ['src-original']});
  state.phase = 'research';
  state.dimensions = [{id: 'd1', query: 'Examine the sample'}];
  state.independentEvidence = true;
  state.scouting = {sourceIds: ['src-original']};
  state.sources = [{
    id: 'src-original', url: 'https://example.org/original', title: 'Authoritative page', verified: false,
    acquisition: {status: 'read', method: 'independent-http', excerpts: [{
      excerpt: 'A directly verified statement about the research question.',
      locator: 'Line 12', sha256: 'f'.repeat(64), accessedAt: 1, finalUrl: 'https://example.org/original'
    }]}
  }];
  state.workers = ['verifier', 'analyst', 'writer', 'coordinator'].map(role => ({
    id: role, role, active: true, engine: 'pi', managerIds: []
  }));
  return state;
}

function fixture(onCheckpoint, options = {}) {
  const turns = new Map(), calls = [];
  const signal = new AbortController();
  return {
    ctx: {id: 'wf_canonical', signal: signal.signal, checkpoint: async state => onCheckpoint?.(structuredClone(state)),
      client: {invoke: async (command, args) => {
        if (command === 'session.status') return [{busy: false}];
        if (command === 'session.send') {
          const request = JSON.parse(args.text.split('\n\n')[1]);
          calls.push(request);
          let result;
          if (request.kind === 'verify') result = {verifications: [{
            sourceId: 'src-original', credibilityScore: 0.95, claims: [{
              text: 'Evidence-backed statement', excerpt: 'A directly verified statement about the research question.'
            }]
          }]};
          else if (request.kind === 'synthesize') result = options.synthesis || {
            entities: [{id: 'e1', name: 'Evidence', type: 'concept', findingIds: request.payload.findings.map(item => item.id)}], relationships: [], insights: ['Grounded analysis']
          };
          else if (request.kind === 'write') result = {report: {
            title: 'Verified research result', sections: [{
              heading: 'Result', content: 'Evidence-backed statement', findingIds: request.payload.findings.map(item => item.id)
            }]
          }};
          else if (request.kind === 'review') result = {verdict: 'pass', summary: 'Approved', issues: []};
          else throw Error('Unexpected task kind: ' + request.kind);
          turns.set(args.employee, {prompt: args.text, id: args.clientMessageId, response: {taskId: request.taskId, ...result}});
          return {messageId: args.clientMessageId};
        }
        if (command === 'session.transcript') {
          const record = turns.get(args.employee);
          return {items: [{role: 'user', text: record.prompt, outbound: {taskId: record.id}},
            {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify(record.response)}]}]};
        }
        throw Error('Unexpected command: ' + command);
      }}
    },
    calls, signal
  };
}

test('completed native results are compacted only after canonical node data exists', async () => {
  const snapshots = [];
  const f = fixture(state => snapshots.push(state));
  const done = await run(prepared(), f.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(done.artifacts.length, 5);
  assert.equal(done.state.findings.length, 1);
  assert.deepEqual(done.state.findings[0].dimensionIds, ['d1']);
  assert.equal(done.state.findings[0].evidence[0].sha256, 'f'.repeat(64));
  assert.deepEqual(projectKnowledge(done.state).topics[0].findingIds, [done.state.findings[0].id]);
  assert.equal(done.state.knowledgeGraph.entities.length, 1);
  assert.equal(projectKnowledge(done.state).entities[0].evidenceStatus, 'linked');
  assert.equal(done.state.report.sections.length, 1);
  assert.equal(done.state.report.sections[0].evidence[0].sha256, 'f'.repeat(64));
  assert.deepEqual(projectKnowledge(done.state).sectionLinks[0].findingIds, [done.state.findings[0].id]);
  assert.equal(done.state.review.verdict, 'pass');

  for (const kind of ['verify', 'synthesize', 'write']) {
    const task = Object.values(done.state.tasks).find(item => item.label === kind);
    assert.equal(task.status, 'completed');
    assert.equal(task.result, undefined);
    assert.ok(task.receipt?.messageId, 'Receipt identity is retained');
    assert.ok(snapshots.some(snapshot =>
      Object.values(snapshot.tasks).some(item => item.label === kind && item.status === 'completed' && item.result)),
      'The native result is checkpointed before the canonical node completion');
  }
  const synthesisRequest = f.calls.find(task => task.kind === 'synthesize');
  assert.match(synthesisRequest.payload.evidenceLinkGuidance, /findingIds/);
  const review = Object.values(done.state.tasks).find(item => item.label === 'review');
  assert.equal(review.result.verdict, 'pass', 'Review remains readable by the UI projection');
  assert.equal(done.state.graph.nodes.find(node => node.id === 'synthesize').result.entities[0].id, 'e1');
  assert.equal(done.state.graph.nodes.find(node => node.id === 'write').result.sections[0].heading, 'Result');
});

test('an interrupted canonical checkpoint resumes using retained accepted native result', async () => {
  let checkpoint;
  const first = fixture(state => {
    if (!checkpoint && state.tasks['verify-v1']?.status === 'completed' &&
        state.graph.nodes.find(node => node.id === 'verify')?.status === 'running') {
      checkpoint = state;
      throw Error('Injected crash before canonical completion');
    }
  });
  await assert.rejects(run(prepared(), first.ctx), /Injected crash/);
  assert.ok(checkpoint.tasks['verify-v1'].result);
  assert.equal(checkpoint.graph.nodes.find(node => node.id === 'verify').status, 'running');
  const replay = fixture();
  const actual = retry(checkpoint);
  // The native result has been checkpointed, so an accepted task is not re-dispatched.
  const done = await run(actual, replay.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(replay.calls.some(item => item.kind === 'verify'), false);
  assert.equal(done.state.tasks['verify-v1'].result, undefined);
});

test('malformed synthesis arrays fail explicitly before a false completed graph is published', async () => {
  const checkpoints = [];
  const invalid = {entities: [{id: 'e1', name: 'Evidence', type: 'concept'}],
    relationships: {from: 'e1', to: 'e1', type: 'guessed'}, insights: []};
  const f = fixture(snapshot => checkpoints.push(snapshot), {synthesis: invalid});
  await assert.rejects(run(prepared(), f.ctx), /relationships 必须是数组/);
  assert.equal(f.calls.filter(task => task.kind === 'synthesize').length, 2,
    'Only the existing one-time format correction is attempted');
  const last = checkpoints.at(-1);
  assert.equal(last.graph.nodes.find(node => node.id === 'synthesize').status, 'failed');
  assert.equal(last.knowledgeGraph.entities.length, 0);
  assert.equal(last.report, null);
});
