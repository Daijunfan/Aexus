import test from 'node:test';
import assert from 'node:assert/strict';
import { create, describe, respond, run, retry, cancel, pause, amend } from '../runtime.mjs';
import { upgradeState, parseAnswer } from '../model.mjs';
import { normalizeSources } from '../evidence.mjs';
import { applyPlan, normalizeNodes, planProgress } from '../graph.mjs';
import { ask } from '../agents.mjs';
import { generateArtifacts } from '../reports.mjs';

const source = (name = 'seed') => ({ title: name, url: 'https://' + name + '.example/research', acquisition: { status: 'read', excerpt: name + ' actual retrieved body demonstrates the result.', locator: 'Results' } });
const team = [
  { id: 'coordinator', role: 'coordinator', managementRole: 'manager' },
  { id: 'deputy', role: 'deputy', managementRole: 'manager' },
  { id: 'r1', role: 'researcher', managerIds: ['coordinator', 'deputy'] },
  { id: 'r2', role: 'researcher', managerIds: ['deputy'] },
  { id: 'writer', role: 'writer', managerIds: ['coordinator'] }
];
const plan = () => ({ dimensions: [{ id: 'd1', query: 'First evidence question' }, { id: 'd2', query: 'Second independent evidence question' }], strategy: 'Compare independent evidence', team,
  nodes: [
    { id: 's1', kind: 'search', role: 'researcher', dimensionId: 'd1', dependencies: [], payload: { query: 'first' } },
    { id: 's2', kind: 'search', role: 'researcher', dimensionId: 'd2', dependencies: [], payload: { query: 'second' } },
    { id: 'v1', kind: 'verify', role: 'researcher', dependencies: ['s1', 's2'] },
    { id: 'w1', kind: 'write', role: 'writer', dependencies: ['v1'] },
    { id: 'review', kind: 'review', role: 'coordinator', dependencies: ['w1'] }
  ] });

function fixture(options = {}) {
  const cards = [], turns = new Map(), calls = [], checkpoints = [];
  let active = 0, maxActive = 0, message = 0;
  const signal = new AbortController();
  const client = { async invoke(command, args) {
    const call = { command, args }; calls.push(call);
    if (command === 'engine.check') return { ready: args.engine === 'pi' };
    if (command === 'group.list') return [];
    if (command === 'group.add' || command === 'management.bind') return {};
    if (command === 'session.list') return { sessions: cards };
    if (command === 'card.create') { const card = { ...args, id: 'employee-' + cards.length }; cards.push(card); return card; }
    if (command === 'session.status') return [{ busy: false, initialization: { status: 'ready' } }];
    if (command === 'session.send') {
      const match = args.text.match(/\[AEXUS_DEEP_RESEARCH_TASK\]\n+([^\n]+)/);
      const task = JSON.parse(match[1]);
      call.task = task;
      active++; maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, options.delay?.(task) ?? (task.kind === 'search' ? 15 : 1))); active--;
      let result;
      if (options.respond) result = await options.respond(task);
      if (!result) {
        if (task.kind === 'scout') result = { sources: [source()] };
        else if (task.kind === 'plan') result = plan();
        else if (task.kind === 'search') result = { sources: [source(task.payload.query)] };
        else if (task.kind === 'verify') result = { verifications: task.payload.sources.filter(s => !s.verified).map(s => ({ sourceId: s.id, credibilityScore: 0.9, claims: [{ text: s.title + ' finding', excerpt: s.acquisition.excerpt, confidence: 0.8 }], notes: 'Read and compared original body' })) };
        else if (task.kind === 'write') result = { report: { title: 'Evidence-backed detailed report', abstract: 'Summary based on independent evidence', sections: [{ heading: 'Detailed findings', content: task.payload.findings.map(f => f.claim).join('\n\n'), citations: task.payload.sources.filter(s => s.verified).map(s => s.id) }], conclusion: 'Action follows evidence', limitations: ['Fixture evidence only'] } };
        else result = { verdict: 'pass', summary: 'Independent review passed', issues: [] };
      }
      const receipt = { messageId: 'message-' + message++ };
      const history = turns.get(args.employee) || [];
      history.push({ role: 'user', text: args.text, outbound: { taskId: receipt.messageId } }, { role: 'assistant', blocks: [{ kind: 'text', text: JSON.stringify({ taskId: task.taskId, ...result }) }] });
      turns.set(args.employee, history); return receipt;
    }
    if (command === 'session.transcript') return { items: turns.get(args.employee) || [] };
    if (command === 'session.interrupt' || command === 'session.dequeue') return {};
    throw Error('Unexpected public command: ' + command);
  } };
  return { ctx: { id: 'wf_test', client, signal: signal.signal, checkpoint: async state => { checkpoints.push(structuredClone(state)); options.checkpoint?.(state); } }, calls, cards, checkpoints, signal, maxActive: () => maxActive };
}

test('first scouting has unknown progress and autoApprove is retained', () => {
  const state = create({ topic: 'Detailed independent research question', autoApprove: true });
  assert.equal(state.input.autoApprove, true);
  assert.equal(describe(state).progress.percent, null);
  assert.equal(describe(state).progress.totalTasks, null);
});

test('dynamic DAG completes with distinct concurrent workers, real manager turns and cited artifacts', async () => {
  const f = fixture(), state = create({ topic: 'Detailed independent research question', autoApprove: true, team: { maxConcurrency: 2 } });
  const result = await run(state, f.ctx);
  assert.equal(result.status, 'completed');
  assert.equal(f.maxActive(), 2);
  assert.equal(f.cards.length, 5);
  assert.equal(f.cards.filter(c => c.managementRole === 'manager').length, 2);
  const searches = f.calls.filter(c => c.task?.kind === 'search');
  assert.equal(new Set(searches.map(c => c.args.employee)).size, 2);
  assert.ok(f.calls.some(c => c.command === 'management.bind'));
  assert.ok(result.state.managerReviews.some(r => r.stage === 'final'));
  assert.equal(result.artifacts.length, 5);
  assert.match(result.artifacts[0].content, /Detailed findings/);
  assert.match(result.artifacts[0].content, /actual retrieved body/);
  assert.equal(describe(result.state).progress.percent, 100);
  assert.ok(f.checkpoints.some(s => s.phase === 'scouting' && describe(s).progress.percent === null));
  const firstVerify = f.calls.findIndex(c => c.task?.kind === 'verify');
  const lastSearch = f.calls.findLastIndex(c => c.task?.kind === 'search');
  assert.ok(firstVerify > lastSearch);
});

test('plan approval waits, then resumes without another scouting or planning turn', async () => {
  const f = fixture();
  const waiting = await run(create({ topic: 'Interactive independent research question' }), f.ctx);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.state.phase, 'planning');
  const sendsBefore = f.calls.filter(c => c.command === 'session.send').length;
  const done = await run(respond(waiting.state, { action: 'approve-plan' }), f.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(f.calls.filter(c => c.task?.kind === 'scout').length, 1);
  assert.ok(f.calls.filter(c => c.command === 'session.send').length > sendsBefore);
});

test('DAG rejects cycles, missing dependencies and review before report', () => {
  assert.throws(() => normalizeNodes([{ id: 'w', kind: 'write', dependencies: ['r'] }, { id: 'r', kind: 'review', dependencies: ['w'] }]), /循环/);
  assert.throws(() => normalizeNodes([{ id: 'w', kind: 'write', dependencies: ['missing'] }, { id: 'r', kind: 'review', dependencies: ['w'] }]), /不存在/);
  assert.throws(() => normalizeNodes([{ id: 'w', kind: 'write' }, { id: 'r', kind: 'review' }]), /依赖报告/);
  assert.throws(() => normalizeNodes([{ id: 'w', kind: 'write' }, { id: 'w2', kind: 'write' }, { id: 'r', kind: 'review', dependencies: ['w'] }]), /一个最终报告/);
  assert.throws(() => normalizeNodes([{ id: 'late-evidence', kind: 'search' }, { id: 'w', kind: 'write' }, { id: 'r', kind: 'review', dependencies: ['w', 'late-evidence'] }]), /late-evidence/);
});

test('a fast branch unlocks its dependent work while another independent branch is still running', async () => {
  const events = [];
  const f = fixture({
    delay: task => task.kind === 'search' && task.payload.query === 'second' ? 80 : 1,
    respond: task => {
      events.push(task.kind + ':' + task.payload.query);
      if (task.kind === 'plan') {
        const p = plan(); p.nodes.splice(2, 0, { id: 'short-followup', kind: 'search', role: 'researcher', dependencies: ['s1'], payload: { query: 'followup' } });
        p.nodes.find(n => n.id === 'v1').dependencies.push('short-followup'); return p;
      }
    }
  });
  const done = await run(create({ topic: 'Fast branch schedules while slow branch runs', autoApprove: true, team: { maxConcurrency: 2 } }), f.ctx);
  assert.equal(done.status, 'completed');
  assert.ok(events.indexOf('search:followup') < events.indexOf('search:second'));
});

test('cross-layer DAG joins only its parents and shares one synthesis across multiple descendants', async () => {
  const events = [];
  const f = fixture({
    delay: task => task.kind === 'search' && task.payload.query === 'unrelated-slow' ? 100 : 1,
    respond: task => {
      events.push({ kind: task.kind, payload: task.payload });
      if (task.kind === 'plan') return {
        dimensions: ['Question about policy', 'Question about cost', 'Question about independent history'],
        team,
        nodes: [
          { id: 'policy', kind: 'search', role: 'researcher', payload: { query: 'policy' } },
          { id: 'cost', kind: 'search', role: 'researcher', payload: { query: 'cost' } },
          { id: 'unrelated', kind: 'search', role: 'deputy', payload: { query: 'unrelated-slow' } },
          { id: 'join', kind: 'verify', role: 'researcher', dependencies: ['policy', 'cost'] },
          { id: 'shared', kind: 'synthesize', role: 'researcher', dependencies: ['join'] },
          { id: 'followup', kind: 'search', role: 'researcher', dependencies: ['shared'], payload: { query: 'followup' } },
          { id: 'checked', kind: 'verify', role: 'researcher', dependencies: ['followup', 'unrelated'] },
          { id: 'report', kind: 'write', role: 'writer', dependencies: ['shared', 'checked', 'policy'] },
          { id: 'review', kind: 'review', role: 'coordinator', dependencies: ['report', 'join'] }
        ]
      };
      if (task.kind === 'synthesize') return { entities: [{ id: 'shared-fact', name: 'Shared verified fact', type: 'concept' }], relationships: [], insights: ['A shared analysis consumed by several descendants'] };
    }
  });
  const result = await run(create({ topic: 'Cross-layer multi-parent research execution graph', autoApprove: true, team: { maxConcurrency: 3 } }), f.ctx);
  assert.equal(result.status, 'completed');
  assert.equal(events.filter(e => e.kind === 'synthesize').length, 1);
  const joinIndex = events.findIndex(e => e.kind === 'verify');
  const slowFinish = events.findIndex(e => e.kind === 'search' && e.payload.query === 'unrelated-slow');
  assert.ok(joinIndex < slowFinish, 'Join does not wait for an unrelated slow source branch');
  const followup = events.find(e => e.kind === 'search' && e.payload.query === 'followup');
  const write = events.find(e => e.kind === 'write');
  assert.equal(followup.payload.synthesis[0].entities[0].id, 'shared-fact');
  assert.equal(write.payload.synthesis[0].entities[0].id, 'shared-fact');
  assert.ok(result.state.graph.nodes.find(n => n.id === 'report').dependencies.includes('policy'), 'Cross-layer source-to-report edge is retained');
});

test('revision retains completed work and evidence while replacing only pending tasks', () => {
  const state = create({ topic: 'Revision preserves completed evidence' });
  applyPlan(state, plan(), 'Initial plan'); state.phase = 'research';
  const first = state.graph.nodes.find(n => n.id === 's1'); first.status = 'completed'; first.sourceIds = ['retained'];
  state.sources.push(...normalizeSources({ sources: [source()] }).sources);
  const next = plan(); next.nodes = next.nodes.filter(n => n.id !== 's2'); next.nodes.find(n => n.id === 'v1').dependencies = ['s1'];
  applyPlan(state, next, 'Second question already answered');
  assert.equal(state.graph.nodes.find(n => n.id === 's1').status, 'completed');
  assert.equal(state.graph.nodes.find(n => n.id === 's2').status, 'superseded');
  assert.equal(planProgress(state).totalTasks, 4);
  assert.equal(state.sources.length, 1);
  assert.equal(state.planRevisions[1].reason, 'Second question already answered');
  next.nodes[0].payload.query = 'Changed completed query';
  assert.throws(() => applyPlan(state, next, 'illegal'), /不能改写/);
});

test('a completed node may update its label but cannot silently change its research objective', () => {
  const state = create({ topic: 'Completed research identity includes the actual question' });
  const initial = plan(); initial.nodes[0].objective = 'Determine the original policy scope';
  applyPlan(state, initial, 'Initial objective'); state.graph.nodes.find(n => n.id === 's1').status = 'completed';
  const renamed = structuredClone(initial); renamed.nodes[0].label = 'Policy scope evidence';
  applyPlan(state, renamed, 'Clarify display name');
  assert.equal(state.graph.nodes.find(n => n.id === 's1').status, 'completed');
  assert.equal(state.graph.nodes.find(n => n.id === 's1').label, 'Policy scope evidence');
  const changed = structuredClone(renamed); changed.nodes[0].objective = 'Determine a different policy question';
  assert.throws(() => applyPlan(state, changed, 'New research goal needs a new node'), /不能改写/);
});

test('a node objective and its query are delivered to the assigned employee', async () => {
  const f = fixture({ respond: task => {
    if (task.kind === 'plan') {
      const next = plan(); Object.assign(next.nodes[0], { objective: 'Check the current policy scope using primary evidence', label: 'Policy investigation', payload: {} }); return next;
    }
    if (task.kind === 'search') return { sources: [source(task.taskId.endsWith('/s1-v1') ? 'first' : 'second')] };
  } });
  const done = await run(create({ topic: 'The visible research objective governs actual employee work', autoApprove: true }), f.ctx);
  assert.equal(done.status, 'completed');
  const sent = f.calls.find(c => c.task?.kind === 'search' && c.task.taskId.endsWith('/s1-v1')).task.payload;
  assert.equal(sent.objective, 'Check the current policy scope using primary evidence'); assert.equal(sent.query, sent.objective);
});

test('review-driven replanning archives the first draft and delivers a new reviewed report without repeated research', async () => {
  let drafts = 0, reviews = 0, plans = 0;
  const f = fixture({ respond: task => {
    if (task.kind === 'plan') {
      const next = plan(); plans++;
      if (plans > 1) {
        next.nodes.find(n => n.id === 'w1').id = 'w2';
        const review = next.nodes.find(n => n.id === 'review'); review.id = 'review2'; review.dependencies = ['w2'];
      }
      return next;
    }
    if (task.kind === 'write') {
      drafts++;
      return { report: { title: 'Draft ' + drafts, sections: [{ heading: 'Evidence findings', content: task.payload.findings.map(f => f.claim).join('\n'), citations: task.payload.sources.filter(s => s.verified).map(s => s.id) }] } };
    }
    if (task.kind === 'review') {
      reviews++;
      return reviews === 1 ? { verdict: 'revise', summary: 'Explain limitations more clearly', issues: [{ description: 'Expand methodology', suggestion: 'Tie methods to evidence' }] } : { verdict: 'pass', summary: 'Revised report accepted', issues: [] };
    }
  } });
  const done = await run(create({ topic: 'Research changes plans after independent critique', autoApprove: true }), f.ctx);
  assert.equal(done.status, 'completed'); assert.equal(done.state.report.title, 'Draft 2');
  assert.equal(plans, 2); assert.equal(drafts, 2); assert.equal(reviews, 2);
  assert.equal(f.calls.filter(c => c.task?.kind === 'search').length, 2);
  assert.equal(done.state.graph.nodes.find(n => n.id === 'w1').active, false);
  assert.equal(done.state.graph.nodes.find(n => n.id === 'w1').result.title, 'Draft 1');
  assert.equal(done.state.planRevisions.length, 2);
  assert.match(done.state.planRevisions[1].reason, /Expand methodology/);
  assert.equal(done.state.graph.nodes.filter(n => n.kind === 'write' && n.active !== false).length, 1);
});

test('replanning budget exhaustion finishes current work and waits for a rejected review without spinning', async () => {
  const f = fixture({ respond: task => task.kind === 'review' ? { verdict: 'revise', summary: 'Additional primary evidence required', issues: [] } : undefined });
  const waiting = await run(create({ topic: 'A review can reject delivery when budget is exhausted', autoApprove: true, maxReplans: 0 }), f.ctx);
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.state.review.verdict, 'revise');
  assert.equal(waiting.state.phase, 'review');
  assert.equal(describe(waiting.state).review.summary, 'Additional primary evidence required');
  assert.ok(describe(waiting.state).progress.percent < 100);
});

test('persisted in-flight task recovers the same receipt and avoids duplicate sends', async () => {
  const f = fixture();
  const waiting = await run(create({ topic: 'Resume native task without duplication' }), f.ctx);
  respond(waiting.state, { action: 'approve-plan' });
  let persisted;
  f.ctx.checkpoint = async state => {
    if (state.tasks['s1-v1']?.status === 'completed' && !persisted) { persisted = structuredClone(state); f.signal.abort(Error('Simulated shutdown')); }
  };
  await assert.rejects(run(waiting.state, f.ctx), /Simulated shutdown/);
  const s1Sends = () => f.calls.filter(c => c.command === 'session.send' && c.args.clientMessageId.endsWith('/s1-v1')).length;
  assert.equal(s1Sends(), 1);
  const resumedCtx = { ...f.ctx, signal: new AbortController().signal, workerLeases: new Set(), checkpoint: async () => {} };
  const done = await run(retry(persisted), resumedCtx);
  assert.equal(done.status, 'completed'); assert.equal(s1Sends(), 1);
});

test('cancel identifies only owned native receipts', async () => {
  const calls = [], state = create({ topic: 'Cancel keeps unrelated work intact' });
  let interrupted = false;
  state.tasks = { ours: { status: 'running', employeeId: 'employee-owned', receipt: { messageId: 'ours' } }, unrelated: { status: 'running', employeeId: 'employee-other', receipt: { messageId: 'old' } } };
  await cancel(state, { client: { invoke: async (command, args) => { calls.push({ command, args }); if (command === 'session.interrupt') interrupted = true; return command === 'session.status' ? [{ busy: args.employee === 'employee-owned' ? !interrupted : true, currentTask: { messageId: args.employee === 'employee-owned' ? 'ours' : 'new-unrelated' } }] : {}; } } });
  assert.deepEqual(calls.filter(c => c.command === 'session.interrupt').map(c => c.args.expectedMessageId), ['ours']);
});

test('legacy verified sources without original body are reopened for honest acquisition', () => {
  const state = create({ topic: 'Resume a prior research checkpoint honestly' });
  state.version = 1; state.phase = 'writing'; state.plan = { dimensions: [{ id: 'd1', query: 'Existing evidence question' }] };
  state.dimensions = [{ id: 'd1', query: 'Existing evidence question', status: 'completed' }];
  state.sources = [{ id: 'legacy-source', url: 'https://seed.example/research', verified: true }];
  state.findings = [{ id: 'old', claim: 'Prior untraceable finding', sourceIds: ['legacy-source'] }];
  state.report = { title: 'Historical draft', sections: [] };
  upgradeState(state);
  assert.equal(state.sources[0].verified, false);
  assert.equal(state.sources[0].acquisition.status, 'discovered');
  assert.equal(state.report, null); assert.equal(state.historicalReport.title, 'Historical draft');
  assert.ok(state.graph.nodes.every(n => n.status === 'pending'));
  assert.equal(state.findings.length, 0); assert.equal(state.historicalFindings.length, 1);
});

test('amend uses the existing paused revision control without discarding evidence', () => {
  const state = create({ topic: 'A revised research scope preserves evidence' });
  state.sources = normalizeSources({ sources: [source()] }).sources;
  amend(state, { instructions: 'Expand primary evidence for comparison' });
  assert.equal(state.phase, 'planning'); assert.equal(state.sources.length, 1);
  assert.equal(state.revisionRequest.instructions, 'Expand primary evidence for comparison');
});

for (const kind of ['scout', 'plan']) test('pause during ' + kind + ' resumes with a fresh native request', async () => {
  let paused = false;
  const f = fixture({ checkpoint: state => {
    if (!paused && Object.values(state.tasks).some(t => t.label === kind && t.status === 'running')) {
      paused = true; f.signal.abort(Error('Owner paused ' + kind));
    }
  } });
  const state = create({ topic: 'Owner pause must restart interrupted non-DAG work', autoApprove: true });
  await assert.rejects(run(state, f.ctx), /Owner paused/);
  const resumedCtx = { ...f.ctx, signal: new AbortController().signal, checkpoint: async () => {} };
  await pause(state, resumedCtx);
  const done = await run(retry(state), resumedCtx);
  assert.equal(done.status, 'completed');
  const sends = f.calls.filter(c => c.task?.kind === kind);
  assert.equal(sends.length, 2, 'A cancelled request needs a fresh attempt');
  assert.notEqual(sends[0].args.clientMessageId, sends[1].args.clientMessageId);
});

test('a persisted completed format correction repairs its base task without another send', async () => {
  const state = create({ topic: 'Recover a completed format correction after shutdown' });
  state.workers = [{ id: 'worker', role: 'researcher', engine: 'fixture' }];
  let persisted, sends = 0;
  const controller = new AbortController(), items = [];
  const ctx = { id: 'format-recovery', signal: controller.signal, checkpoint: async snapshot => {
    if (snapshot.tasks['search-format-fix']?.status === 'completed') {
      persisted = structuredClone(snapshot); controller.abort(Error('Shutdown after corrected result checkpoint'));
    }
  }, client: { invoke: async (command, args) => {
    if (command === 'session.status') return [{ busy: false }];
    if (command === 'session.send') {
      sends++;
      items.push({ role: 'user', text: args.text, outbound: { taskId: args.clientMessageId } }, { role: 'assistant', blocks: [{ kind: 'text', text: sends === 1 ? 'Invalid JSON' : JSON.stringify({ taskId: args.clientMessageId, sources: [] }) }] });
      return { messageId: args.clientMessageId };
    }
    if (command === 'session.transcript') return { items };
    throw Error('Unexpected format recovery command: ' + command);
  } } };
  await assert.rejects(ask(state, ctx, 'search', 'researcher', 'search', {}, normalizeSources), /Shutdown/);
  assert.equal(persisted.tasks.search.status, 'failed');
  const result = await ask(retry(persisted), { ...ctx, signal: new AbortController().signal, workerLeases: new Set(), checkpoint: async () => {} }, 'search', 'researcher', 'search', {}, normalizeSources);
  assert.deepEqual(result.sources, []); assert.equal(sends, 2);
  assert.equal(persisted.tasks.search.status, 'completed');
});

test('aborting a DAG waits for every started node and rejects late source results', async () => {
  let releaseSlow, startedSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  const started = new Promise(resolve => { startedSlow = resolve; });
  let slowFinished = false, settled = false;
  const f = fixture({
    delay: task => task.kind === 'search' && task.payload.query === 'first' ? 20 : 1,
    respond: task => {
      if (task.kind === 'search' && task.payload.query === 'second') { startedSlow(); return slow.then(() => { slowFinished = true; return { sources: [source('late-result')] }; }); }
    },
    checkpoint: state => { if (state.graph.nodes.find(n => n.id === 's1')?.status === 'completed') f.signal.abort(Error('Abort concurrent DAG')); }
  });
  const state = create({ topic: 'Abort all concurrent nodes before returning to the host', autoApprove: true, team: { maxConcurrency: 2 } });
  const pending = run(state, f.ctx).then(() => { settled = true; }, error => { settled = true; return error; });
  await started;
  await new Promise(resolve => setTimeout(resolve, 40));
  const settledBeforeRelease = settled;
  releaseSlow();
  const error = await pending;
  assert.equal(settledBeforeRelease, false, 'Owner lifecycle must wait for all started operations');
  assert.match(error.message, /Abort concurrent DAG/); assert.equal(slowFinished, true);
  assert.ok(!state.sources.some(s => s.title === 'late-result'));
});

test('parallel verifiers validate their original shared input after another verifier completes', async () => {
  const f = fixture({
    delay: task => task.kind === 'verify' && task.payload.query === 'slow-verify' ? 30 : 1,
    respond: task => {
      if (task.kind === 'plan') {
        const next = plan();
        next.nodes.find(n => n.id === 'v1').payload = { query: 'fast-verify' };
        next.nodes.splice(3, 0, { id: 'v2', kind: 'verify', role: 'researcher', dependencies: ['s1', 's2'], payload: { query: 'slow-verify' } });
        next.nodes.find(n => n.id === 'w1').dependencies.push('v2');
        return next;
      }
    }
  });
  const done = await run(create({ topic: 'Concurrent verifiers retain the exact submitted evidence set', autoApprove: true, team: { maxConcurrency: 2 } }), f.ctx);
  assert.equal(done.status, 'completed');
  const checks = f.calls.filter(c => c.task?.kind === 'verify');
  assert.equal(checks.length, 2);
  assert.deepEqual(checks[0].task.payload.sources.map(s => s.id), checks[1].task.payload.sources.map(s => s.id));
});

test('independent verification branches receive their ancestors plus common scouting evidence', async () => {
  const state = create({ topic: 'Independent evidence branches keep their source inputs isolated', autoApprove: true, team: { maxConcurrency: 2 } });
  let prepared = false;
  const f = fixture({
    checkpoint: snapshot => {
      if (snapshot.phase === 'research' && !prepared) {
        prepared = true;
        for (const [id, name] of [['s1', 'first'], ['s2', 'second']]) {
          const evidence = normalizeSources({ sources: [source(name)] }).sources[0]; state.sources.push(evidence);
          Object.assign(state.graph.nodes.find(n => n.id === id), { status: 'completed', sourceIds: [evidence.id] });
        }
      }
    },
    respond: task => {
      if (task.kind === 'plan') {
        const next = plan();
        Object.assign(next.nodes.find(n => n.id === 'v1'), { dependencies: ['s1'], payload: { query: 'first-branch' } });
        next.nodes.splice(3, 0, { id: 'v2', kind: 'verify', role: 'researcher', dependencies: ['s2'], payload: { query: 'second-branch' } });
        next.nodes.find(n => n.id === 'w1').dependencies.push('v2');
        return next;
      }
    }
  });
  const outcome = await run(state, f.ctx).catch(error => error);
  const checks = f.calls.filter(c => c.task?.kind === 'verify');
  for (const [query, own, other] of [['first-branch', 'first', 'second'], ['second-branch', 'second', 'first']]) {
    const inputs = checks.find(c => c.task.payload.query === query).task.payload.sources.map(s => s.title);
    assert.ok(inputs.includes(own)); assert.ok(inputs.includes('seed'));
    assert.ok(!inputs.includes(other), 'A verifier cannot consume unrelated branch evidence');
  }
  assert.equal(outcome.status, 'completed');
});

test('verification recovery uses the persisted request inputs after global evidence changes', async () => {
  let persisted;
  const f = fixture({ checkpoint: snapshot => {
    if (!persisted && snapshot.tasks['v1-v1']?.status === 'running') {
      persisted = structuredClone(snapshot); f.signal.abort(Error('Shutdown with verification receipt'));
    }
  } });
  await assert.rejects(run(create({ topic: 'Verification resumes its submitted inputs after a restart', autoApprove: true }), f.ctx), /Shutdown/);
  const submitted = f.calls.find(c => c.task?.kind === 'verify').task.payload.sources.map(s => s.id);
  const verifier = persisted.graph.nodes.find(n => n.id === 'v1');
  delete verifier.inputSourceIds;
  for (const s of persisted.sources) s.verified = true;
  persisted.sources.push(...normalizeSources({ sources: [source('unrelated-new-source')] }).sources);
  const done = await run(retry(persisted), { ...f.ctx, signal: new AbortController().signal, workerLeases: new Set(), checkpoint: async () => {} });
  assert.equal(done.status, 'completed');
  assert.equal(f.calls.filter(c => c.task?.kind === 'verify').length, 1);
  assert.deepEqual(verifier.inputSourceIds, submitted); assert.deepEqual(verifier.sourceIds, submitted);
});

test('search prompts keep dependency context without duplicating source bodies and completed reports', async () => {
  const f = fixture({ respond: task => {
    if (task.kind === 'plan') {
      const next = plan(); next.nodes.splice(2, 0, { id: 'followup', kind: 'search', role: 'researcher', dependencies: ['s1'], payload: { query: 'followup' } });
      next.nodes.find(n => n.id === 'v1').dependencies.push('followup'); return next;
    }
  } });
  const done = await run(create({ topic: 'Search tasks retain only their necessary research context', autoApprove: true }), f.ctx);
  assert.equal(done.status, 'completed');
  const followup = f.calls.find(c => c.task?.kind === 'search' && c.task.payload.query === 'followup').task.payload;
  assert.ok(followup.existingSources.length > 0); assert.ok(followup.dependencyResults.some(n => n.id === 's1'));
  for (const key of ['sources', 'report', 'plan']) assert.equal(key in followup, false, key + ' is unnecessary search context');
  assert.ok(!JSON.stringify(followup).includes('actual retrieved body'));
});

test('one Manager revision blocks auto-approval even when another passes, and a revised plan gets fresh reviews', async () => {
  const f = fixture({ respond: task => {
    if (task.kind === 'plan') { const next = plan(); next.team = [...team, { id: 'methods', role: 'methods', managementRole: 'manager' }]; return next; }
    if (task.kind === 'plan-review' && task.taskId.endsWith('manager-plan-deputy-v1')) return { verdict: 'revise', summary: 'Clarify the primary evidence scope', issues: [{ description: 'Scope unclear', suggestion: 'Add an explicit scope' }] };
  } });
  const waiting = await run(create({ topic: 'Conflicting Manager opinions require an explicit revised plan', autoApprove: true }), f.ctx);
  assert.equal(waiting.status, 'waiting'); assert.equal(waiting.state.phase, 'planning'); assert.equal(waiting.state.planApproved, false);
  assert.deepEqual(waiting.state.managerReviews.map(r => r.verdict), ['revise', 'pass']);
  assert.equal(f.calls.filter(c => c.task?.kind === 'search').length, 0);
  const done = await run(respond(waiting.state, { action: 'revise', instructions: 'Explicitly bound primary evidence before execution' }), f.ctx);
  assert.equal(done.status, 'completed'); assert.equal(done.state.graph.version, 2);
  assert.equal(f.calls.filter(c => c.task?.kind === 'plan-review').length, 4);
  assert.equal(done.state.managerReviews.filter(r => r.planVersion === 2 && !r.stage).length, 2);
});

test('HTML exports render GFM structure while keeping untrusted HTML and unsafe links inert', async () => {
  const content = '| Evidence | State |\n| --- | --- |\n| Original source | Read |\n\n- First finding\n- Second finding\n\n1. Check source\n2. Verify quote\n\n```js\nconst source = "read";\n```\n\n> A quoted conclusion\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))';
  const f = fixture({ respond: task => task.kind === 'write' ? { report: { title: 'Structured Markdown report', sections: [{ heading: 'Evidence formats', content, citations: task.payload.sources.filter(s => s.verified).map(s => s.id) }] } } : undefined });
  const done = await run(create({ topic: 'Final HTML preserves report Markdown structure safely', autoApprove: true }), f.ctx);
  const html = generateArtifacts(done.state).find(a => a.name === 'research-report.html').content;
  for (const element of ['<table>', '<th>Evidence</th>', '<td>Original source</td>', '<ul>', '<ol>', '<pre><code', '<blockquote>']) assert.ok(html.includes(element), element + ' must render as structure');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(generateArtifacts(done.state).find(a => a.name === 'research-report.md').content.includes(content), true);
});

test('JSON report bodies retain inner code fences and complete JSON wrappers remain supported', () => {
  const result = { taskId: 'code-report', report: { sections: [{ content: '```mermaid\ngraph LR\nA-->B\n```' }] } };
  const raw = JSON.stringify(result);
  assert.deepEqual(parseAnswer(raw, 'code-report'), result);
  assert.deepEqual(parseAnswer('```json\n' + raw + '\n```', 'code-report'), result);
  assert.deepEqual(parseAnswer('Result:\n```json\n' + raw + '\n```\nEnd.', 'code-report'), result);
});
