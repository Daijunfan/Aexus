import test from 'node:test';
import assert from 'node:assert/strict';
import { create, describe, respond, run, retry, cancel, pause, amend, fork } from '../runtime.mjs';
import { upgradeState, parseAnswer } from '../model.mjs';
import { normalizeSources } from '../evidence.mjs';
import { applyPlan, normalizeNodes, planProgress, planTeam } from '../graph.mjs';
import { ask, provision } from '../agents.mjs';
import { generateArtifacts } from '../reports.mjs';
import { acquireSources } from '../source-read.mjs';

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
        else if (task.kind === 'verify') result = { verifications: task.payload.sources.filter(s => !s.verified).map(s => ({ sourceId: s.id, credibilityScore: 0.9, claims: [{ text: s.title + ' finding', excerpt: s.acquisition.excerpts[0].excerpt, confidence: 0.8 }], notes: 'Read and compared original body' })) };
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
  return { ctx: { id: 'wf_test', client, signal: signal.signal, sourceReader: async url => { const name = new URL(url).hostname.split('.')[0]; return {url, mediaType: 'text/plain', body: source(name).acquisition.excerpt}; }, checkpoint: async state => { checkpoints.push(structuredClone(state)); await options.checkpoint?.(state); } }, calls, cards, checkpoints, signal, maxActive: () => maxActive };
}

test('short questions and a single-source budget are valid research requests', () => {
  const state = create({ topic: '301', scope: 'quick', maxSources: 1 });
  assert.equal(state.input.topic, '301');
  assert.equal(state.input.maxSources, 1);
  assert.equal(describe(state).progress.percent, null);
  assert.throws(() => create({ topic: '   ' }), /请输入研究主题/);
});

test('quick research uses smaller default caps while explicit budgets remain authoritative', () => {
  const quick = create({topic: 'A narrow comparison question', scope: 'quick'});
  assert.equal(quick.input.maxSources, 6);
  assert.deepEqual(quick.input.team, {maxWorkers: 4, maxManagers: 1, maxConcurrency: 2});
  assert.equal(quick.input.maxTasks, 16);
  assert.equal(quick.input.maxReplans, 1);
  const custom = create({topic: 'A narrow comparison question', scope: 'quick', maxSources: 2,
    team: {maxWorkers: 2, maxConcurrency: 1}, maxTasks: 4, maxReplans: 0});
  assert.equal(custom.input.maxSources, 2);
  assert.deepEqual(custom.input.team, {maxWorkers: 2, maxManagers: 1, maxConcurrency: 1});
  assert.equal(custom.input.maxTasks, 4);
  assert.equal(custom.input.maxReplans, 0);
});

test('oversized teams receive the exact headcount and role-reuse correction', () => {
  const oversized = plan();
  oversized.team = team.filter(member => ['coordinator', 'r1', 'writer'].includes(member.id));
  assert.throws(
    () => planTeam(oversized, {maxWorkers: 2, maxManagers: 1, maxConcurrency: 1}),
    /3\/2 人.*coordinator.*同一非管理角色/,
  );
  const reused = plan();
  reused.team = [team[0], {...team[2], managerIds: ['coordinator']}];
  reused.nodes.find(node => node.kind === 'write').role = 'researcher';
  assert.equal(planTeam(reused, {maxWorkers: 2, maxManagers: 1, maxConcurrency: 1}).length, 2);
});

test('CSV export treats untrusted source titles as text instead of spreadsheet formulas', () => {
  const state = create({topic: 'CSV source export'}), title = '=HYPERLINK("https://example.org", "open")';
  state.sources = [{id: 'src-1', type: 'web', title, url: 'https://example.org', acquisition: {status: 'discovered', excerpt: ''}}];
  state.report = {title: 'CSV export', abstract: '', sections: [{id: 's1', heading: 'Result', content: 'Result', citations: ['src-1'], evidence: []}], citations: ['src-1'], limitations: []};
  const files = generateArtifacts(state);
  assert.match(files.find(file => file.name === 'sources.csv').content, /"'=HYPERLINK\(""https:\/\/example\.org""/);
  assert.equal(JSON.parse(files.find(file => file.name === 'evidence.json').content).sources[0].title, title);
});

test('scouting does not fetch candidates beyond the source budget', async () => {
  const f = fixture({respond: task => task.kind === 'scout' ? {sources: [source('seed'), source('surplus'), source('extra')]} : null});
  const read = f.ctx.sourceReader, fetched = [];
  f.ctx.sourceReader = url => { fetched.push(url); return read(url); };
  const result = await run(create({topic: 'Bounded scouting with three candidate sources', maxSources: 1}), f.ctx);
  assert.equal(result.status, 'waiting');
  assert.deepEqual(fetched, [source('seed').url]);
  assert.equal(result.state.sources.length, 1);
});

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

test('a completed report forks into fresh research with historical context but no inherited proof', async () => {
  const parent = await run(create({topic: 'Initial evidence question', scope: 'quick', autoApprove: true, engines: ['pi'], team: {maxWorkers: 5, maxManagers: 2, maxConcurrency: 2}}), fixture().ctx);
  const snapshot = JSON.stringify(parent.state);
  const child = fork(parent.state, {topic: 'Which assumptions changed?'});
  assert.equal(child.phase, 'init');
  assert.equal(child.input.scope, 'quick');
  assert.equal(child.input.maxSources, parent.state.input.maxSources);
  assert.deepEqual(child.input.engines, parent.state.input.engines);
  assert.equal(child.input.autoApprove, false);
  assert.match(child.input.materials.at(-1).content, /Initial evidence question/);
  assert.match(child.input.materials.at(-1).content, /重新独立核验/);
  assert.match(child.input.materials.at(-1).content, /https:\/\/seed\.example\/research/);
  assert.deepEqual({workers: child.workers, tasks: child.tasks, sources: child.sources, findings: child.findings, nodes: child.graph.nodes}, {workers: [], tasks: {}, sources: [], findings: [], nodes: []});
  assert.equal(child.report, null);
  assert.equal(JSON.stringify(parent.state), snapshot, 'Fork does not mutate the completed parent');
});

test('large completed reports label omitted bodies instead of copying an oversized prompt', () => {
  const parent = create({topic: 'Large previous research'});
  parent.phase = 'complete';
  parent.report = {title: 'A long report', abstract: 'Bounded summary', conclusion: 'Bounded conclusion', citations: [], sections: [{heading: 'Full investigation', content: 'Evidence-backed paragraph. '.repeat(10000)}]};
  const child = fork(parent, {topic: 'A narrower follow-up'});
  const context = child.input.materials.at(-1).content;
  assert.match(context, /原报告正文超出背景预算/);
  assert.ok(context.length < 200000);
  assert.ok(!context.includes('Evidence-backed paragraph.'));
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

test('planned topology does not duplicate execution results in persisted state', () => {
  const state = create({topic: 'Keep execution results in the graph once'});
  applyPlan(state, plan(), 'Initial plan');
  const executed = state.graph.nodes.find(node => node.id === 's1');
  executed.resultSummary = 'Measured research finding';
  executed.result = {body: 'Evidence payload '.repeat(1000)};
  assert.equal('result' in state.plan.nodes.find(node => node.id === 's1'), false);
  assert.equal(JSON.stringify(state.plan).includes('Evidence payload'), false);
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

test('replanning retains completed work when payload keys and dependency order change only', () => {
  const state = create({topic: 'Equivalent research tasks survive replanning'});
  const first = plan(); first.nodes[0].payload = {query: 'first', language: 'en'};
  applyPlan(state, first, 'Initial plan');
  for (const node of state.graph.nodes.filter(node => ['s1', 's2', 'v1'].includes(node.id))) node.status = 'completed';
  const revised = structuredClone(first);
  revised.nodes[0].payload = {language: 'en', query: 'first'};
  revised.nodes.find(node => node.id === 'v1').dependencies.reverse();
  applyPlan(state, revised, 'Same evidence, expanded later tasks');
  assert.equal(state.graph.nodes.find(node => node.id === 's1').status, 'completed');
  assert.equal(state.graph.nodes.find(node => node.id === 'v1').status, 'completed');
  assert.ok(state.planRevisions[1].retainedNodeIds.includes('v1'));
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

test('pausing a running DAG retains its node as pending for an explicit resume', async () => {
  const state = create({topic: 'Pause a running research branch'});
  state.graph.nodes = [{id: 'research', kind: 'search', status: 'running', active: true, dependencies: []}];
  state.tasks.research = {status: 'running', employeeId: 'researcher', receipt: {messageId: 'accepted'}};
  await pause(state, {client: {invoke: async command => command === 'session.status' ? [{busy: false}] : {}}});
  assert.equal(state.tasks.research.status, 'cancelled');
  assert.equal(state.graph.nodes[0].status, 'pending');
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
    checkpoint: async snapshot => {
      if (snapshot.phase === 'research' && !prepared) {
        prepared = true;
        for (const [id, name] of [['s1', 'first'], ['s2', 'second']]) {
          const candidates = normalizeSources({ sources: [source(name)] }).sources;
          const [evidence] = await acquireSources(state, candidates, {signal: f.ctx.signal, read: f.ctx.sourceReader}); state.sources.push(evidence);
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
  const proof = done.state.sources.find(source => source.verified).acquisition.excerpts[0];
  assert.ok(html.includes(proof.sha256), 'The standalone report keeps the acquired body fingerprint beside its citation');
  assert.ok(html.includes(proof.finalUrl), 'The standalone report names the independently retrieved final URL');
  const markdownReport = generateArtifacts(done.state).find(a => a.name === 'research-report.md').content;
  assert.ok(markdownReport.includes(proof.sha256), 'The editable report keeps the same source fingerprint');
  assert.ok(markdownReport.includes(proof.finalUrl), 'The editable report keeps the same final URL');
  const sourcesCsv = generateArtifacts(done.state).find(a => a.name === 'sources.csv').content;
  assert.ok(sourcesCsv.includes(proof.sha256), 'The source table retains the acquired body fingerprint');
  assert.ok(sourcesCsv.includes(proof.finalUrl), 'The source table retains the final URL');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;'));
  const tampered = structuredClone(done.state);
  tampered.sources[0].url = 'javascript:alert(1)';
  tampered.sources[0].acquisition.excerpts[0].finalUrl = 'javascript:alert(2)';
  assert.ok(!generateArtifacts(tampered).find(a => a.name === 'research-report.html').content.includes('href="javascript:'));
  tampered.sources[0].url = 'https://user:secret@example.org/original';
  assert.ok(!generateArtifacts(tampered).find(a => a.name === 'research-report.html').content.includes('user:secret'));
  assert.ok(!generateArtifacts(tampered).find(a => a.name === 'research-report.md').content.includes('user:secret'));
  const historical = structuredClone(done.state);
  const downgraded = historical.sources.find(source => source.id === done.state.sources.find(source => source.verified).id);
  downgraded.acquisition.method = 'agent-reported';
  downgraded.verified = false;
  assert.ok(!generateArtifacts(historical).find(a => a.name === 'research-report.html').content.includes(proof.sha256));
  assert.equal(generateArtifacts(done.state).find(a => a.name === 'research-report.md').content.includes(content), true);
});

test('JSON report bodies retain inner code fences and complete JSON wrappers remain supported', () => {
  const result = { taskId: 'code-report', report: { sections: [{ content: '```mermaid\ngraph LR\nA-->B\n```' }] } };
  const raw = JSON.stringify(result);
  assert.deepEqual(parseAnswer(raw, 'code-report'), result);
  assert.deepEqual(parseAnswer('```json\n' + raw + '\n```', 'code-report'), result);
  assert.deepEqual(parseAnswer('Result:\n```json\n' + raw + '\n```\nEnd.', 'code-report'), result);
});

test('different verifier scopes retain both claims for one source without a second claim store', async () => {
  const f = fixture({ respond: task => {
    if (task.kind === 'plan') {
      const next = plan(); next.nodes.find(n => n.id === 'v1').payload = { query: 'policy-scope' };
      next.nodes.splice(3, 0, { id: 'v2', kind: 'verify', role: 'researcher', dependencies: ['s1', 's2'], payload: { query: 'price-scope' } });
      next.nodes.find(n => n.id === 'w1').dependencies.push('v2'); return next;
    }
    if (task.kind === 'verify') return { verifications: task.payload.sources.map(s => ({ sourceId: s.id, credibilityScore: 1, claims: [{ text: task.payload.query + ' finding for ' + s.title, excerpt: s.acquisition.excerpts[0].excerpt, locator: task.payload.query, confidence: 1 }] })) };
  } });
  const done = await run(create({ topic: 'Two verifier scopes share one source and preserve both claims', autoApprove: true, team: { maxConcurrency: 2 } }), f.ctx);
  assert.equal(done.status, 'completed');
  const view = describe(done.state), seed = view.sources.find(s => s.title === 'seed');
  const claims = view.findingsDetails.filter(f => f.sourceIds.includes(seed.id));
  assert.equal(claims.length, 2); assert.ok(claims.some(f => f.claim.startsWith('policy-scope'))); assert.ok(claims.some(f => f.claim.startsWith('price-scope')));
  assert.equal('extractedClaims' in seed, false);
});

test('a revised team cannot leave a retained native task waiting forever for its former owner', async () => {
  const state = create({ topic: 'A revised team keeps an accepted task attached to its real owner' });
  const initial = plan(); applyPlan(state, initial, 'Initial team');
  state.workers = team.map(spec => ({ ...spec, specId: spec.id, id: 'employee-' + spec.id, engine: 'pi', managerIds: [], active: true }));
  state.tasks['s1-v1'] = { logicalKey: 's1-v1', status: 'failed', failureKind: 'transport', employeeId: 'employee-r1', receipt: { messageId: 'original-request' } };
  const next = plan(); next.team = team.filter(spec => spec.id !== 'r1');
  applyPlan(retry(state), next, 'Remove one researcher while retaining the same question');
  const f = fixture(), ctx = { ...f.ctx, signal: AbortSignal.timeout(100) };
  await provision(state, ctx, next.team);
  assert.equal(state.workers.find(worker => worker.specId === 'r1').active, false);
  assert.ok(state.workers.some(worker => worker.role === 'researcher' && worker.active));
  await assert.rejects(ask(state, ctx, 's1-v1', 'researcher', 'search', {}, normalizeSources), /原员工|所属员工/);
  assert.equal(f.calls.filter(call => call.command === 'session.send').length, 0);
  assert.equal(state.tasks['s1-v1'].receipt.messageId, 'original-request');
});

test('public projection retains canonical detail without repeating plan nodes, report bodies and revision history', async () => {
  const f = fixture(), done = await run(create({ topic: 'One public copy of each large research result', autoApprove: true }), f.ctx);
  const view = describe(done.state);
  assert.equal(view.plan.strategy, done.state.plan.strategy);
  assert.equal(view.graph.nodes.length, done.state.graph.nodes.length);
  assert.equal(view.deliverable.sections[0].content, done.state.report.sections[0].content);
  assert.deepEqual(view.planRevisions, done.state.planRevisions);
  assert.equal(view.report.sections, done.state.report.sections.length);
  assert.equal('nodes' in view.plan, false);
  assert.equal('content' in view.report, false);
  assert.equal('planHistory' in view, false);
  assert.equal('excerpt' in view.sources[0].acquisition, false);
  assert.equal('excerpt' in f.calls.find(call => call.task?.kind === 'verify').task.payload.sources[0].acquisition, false);
});

test('unfinished older checkpoints reacquire saved search excerpts without repeating native research or deleting history', async () => {
  const first = fixture(), done = await run(create({ topic: 'Saved evidence is reacquired before publishing a resumed report', autoApprove: true }), first.ctx);
  const state = structuredClone(done.state); state.phase = 'review'; delete state.independentEvidence; delete state.artifacts;
  for (const source of state.sources) source.acquisition = {status: 'read', excerpt: source.acquisition.excerpts[0].excerpt, locator: source.acquisition.excerpts[0].locator};
  const previousReport = structuredClone(state.report), priorTasks = Object.keys(state.tasks);
  const resumed = fixture();
  const result = await run(state, resumed.ctx);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.state.historicalReport, previousReport); assert.ok(result.state.historicalFindings.length > 0);
  assert.ok(priorTasks.every(key => result.state.tasks[key]));
  assert.equal(resumed.calls.filter(call => call.task?.kind === 'search').length, 0);
  assert.ok(result.state.sources.filter(source => source.verified).every(source => source.acquisition.method === 'independent-http'));
});

test('dimension-only saved plans reacquire finished search evidence before rebuilding later tasks', async () => {
  const f = fixture(), done = await run(create({topic: 'Migrate a dimension-only checkpoint with saved original excerpts', autoApprove: true}), f.ctx);
  const state = structuredClone(done.state); state.phase = 'review'; delete state.independentEvidence; delete state.artifacts;
  state.graph = {version: 0, nodes: []}; state.plan = {dimensions: [{id: 'd1', query: 'first'}]};
  state.dimensions = [{id: 'd1', query: 'first', status: 'completed'}];
  const savedSearch = structuredClone(state.tasks['s1-v1']);
  state.tasks['research-d1'] = savedSearch;
  state.workers.push(...['verifier', 'synthesizer'].map(role => ({id: 'legacy-' + role, specId: role, role, engine: 'pi', active: true, managerIds: []})));
  for (const source of state.sources) source.acquisition = {status: 'read', excerpt: source.acquisition.excerpts[0].excerpt};
  const resumed = fixture({respond: task => task.kind === 'synthesize' ? {entities: [], relationships: [], insights: []} : undefined});
  const result = await run(state, resumed.ctx);
  assert.equal(result.status, 'completed');
  assert.equal(resumed.calls.filter(call => call.task?.kind === 'search').length, 0);
  assert.ok(result.state.sources.some(source => source.verified && source.acquisition.method === 'independent-http'));
});

test('completed historical research keeps its report and artifacts without claiming independent verification', async () => {
  const f = fixture(), done = await run(create({topic: 'Completed historical research remains available as historical evidence', autoApprove: true}), f.ctx);
  const state = structuredClone(done.state); delete state.independentEvidence;
  state.artifacts = structuredClone(done.artifacts);
  for (const source of state.sources) source.acquisition = {status: 'read', excerpt: source.acquisition.excerpts[0].excerpt};
  const oldReport = structuredClone(state.report), oldArtifacts = structuredClone(state.artifacts);
  const historical = await run(state, {...f.ctx, sourceReader: async () => {throw Error('Historical completion must not refetch');}});
  assert.deepEqual(historical.state.report, oldReport); assert.deepEqual(historical.artifacts, oldArtifacts);
  const view = describe(historical.state);
  assert.equal(view.progress.sources.read, 0); assert.equal(view.progress.sources.verified, 0);
});

test('describing an older waiting plan preserves its approval action and resumes evidence after approval', async () => {
  const first = fixture(), waiting = await run(create({topic: 'An older waiting plan keeps the same visible and executable approval state'}), first.ctx);
  const state = structuredClone(waiting.state); delete state.independentEvidence;
  for (const source of state.sources) source.acquisition = {status: 'read', excerpt: source.acquisition.excerpts[0].excerpt};
  const before = structuredClone(state);
  assert.equal(describe(state).phase, 'planning'); assert.deepEqual(state, before);
  const approved = respond(state, {action: 'approve-plan'});
  const resumed = fixture(), done = await run(approved, resumed.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(resumed.calls.filter(call => call.task?.kind === 'plan' || call.task?.kind === 'scout').length, 0);
  assert.ok(done.state.sources.every(source => source.acquisition.method === 'independent-http'));
});

test('planners see the actual reply budget and oversized verification fails without repeating the same huge task', async () => {
  const f = fixture({respond: task => task.kind === 'verify' ? {verifications: [], padding: 'x'.repeat(500_001)} : undefined});
  const state = create({topic: 'An evidence-heavy plan must respect the native reply size limit', autoApprove: true});
  const outcome = await run(state, f.ctx).catch(error => error);
  assert.equal(f.calls.find(call => call.task?.kind === 'plan').task.payload.budget.maxAgentReplyChars, 500_000);
  assert.match(outcome.message, /拆分核验任务/);
  assert.equal(f.calls.filter(call => call.task?.kind === 'verify').length, 1);
  assert.equal(Object.values(state.tasks).find(task => task.label === 'verify').failureKind, 'size');
});

test('accepted receipts checkpoint their frozen inputs without retaining a second copy of the task prompt', async () => {
  const f = fixture(), done = await run(create({topic: 'Native receipt identities replace redundant persisted task prompts', autoApprove: true}), f.ctx);
  assert.equal(done.status, 'completed');
  for (const snapshot of f.checkpoints) for (const task of Object.values(snapshot.tasks)) {
    if (task.receipt) assert.equal('prompt' in task, false);
    else assert.equal(typeof task.prompt, 'string');
  }
  const verifier = Object.values(done.state.tasks).find(task => task.label === 'verify');
  assert.deepEqual(verifier.inputSourceIds, f.calls.find(call => call.task?.kind === 'verify').task.payload.sources.map(source => source.id));
});

test('a failed receipt checkpoint retains accepted ownership and resumes without another native send', async () => {
  const f = fixture(), state = create({topic: 'An accepted native receipt survives a local checkpoint write failure'});
  state.workers = [{id: 'employee-owned', role: 'researcher', engine: 'pi', managerIds: [], active: true}];
  let failed = false;
  const checkpoint = async () => {if (state.tasks.search?.receipt && !failed) {failed = true; throw Error('Simulated receipt checkpoint failure');}};
  await assert.rejects(ask(state, {...f.ctx, checkpoint}, 'search', 'researcher', 'search', {}, normalizeSources), /checkpoint failure/);
  const receipt = structuredClone(state.tasks.search.receipt);
  const saved = structuredClone(state);
  const result = await ask(retry(saved), {...f.ctx, workerLeases: new Set(), checkpoint: async () => {}}, 'search', 'researcher', 'search', {}, normalizeSources);
  assert.equal(result.sources.length, 1); assert.deepEqual(saved.tasks.search.receipt, receipt);
  assert.equal(f.calls.filter(call => call.command === 'session.send').length, 1);
  assert.equal('prompt' in saved.tasks.search, false);
});

test('completed research returns final artifacts to the Host without persisting duplicate file bodies', async () => {
  const f = fixture(), done = await run(create({topic: 'Final delivery file bytes are owned by the Host publication boundary', autoApprove: true}), f.ctx);
  assert.equal(done.status, 'completed'); assert.equal(done.artifacts.length, 5);
  assert.equal('artifacts' in done.state, false);
  assert.ok(f.checkpoints.filter(snapshot => snapshot.phase === 'complete').every(snapshot => !('artifacts' in snapshot)));
});

test('a crash after the final Engine checkpoint regenerates byte-identical files without native research', async () => {
  let persisted;
  const f = fixture({checkpoint: snapshot => {
    if (snapshot.phase === 'complete') {persisted = structuredClone(snapshot); throw Error('Crash before Host publication');}
  }});
  await assert.rejects(run(create({topic: 'Final checkpoint can recover without a second retained file-body store', autoApprove: true}), f.ctx), /Crash before Host publication/);
  assert.equal('artifacts' in persisted, false);
  const expected = generateArtifacts(persisted), resumed = fixture();
  const done = await run(persisted, resumed.ctx);
  assert.deepEqual(done.artifacts, expected); assert.equal(resumed.calls.length, 0);
  assert.equal('artifacts' in done.state, false);
});

test('invalid DAG is corrected before the planner reply becomes a reusable completed task', async () => {
  let plans = 0;
  const f = fixture({respond(task) {
    if (task.kind !== 'plan') return;
    const next = plan();
    if (plans++ === 0) next.nodes[0].dependencies = ['unknown-parent'];
    return next;
  }});
  const done = await run(create({topic:'计划错误应当在保存成功前修正',autoApprove:true}), f.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(plans, 2);
  const correction = f.calls.find(call => call.task?.kind === 'plan' && call.task.payload.formatCorrection);
  assert.match(correction.task.payload.formatCorrection, /不存在/);
  assert.ok(!done.state.plan.nodes.some(node => node.dependencies.includes('unknown-parent')));
});

test('invalid contradiction sources are corrected before any evidence mutation', async () => {
  let verifications = 0;
  const f = fixture({respond(task) {
    if (task.kind !== 'verify') return;
    const invalid = verifications++ === 0;
    return {verifications: task.payload.sources.map(source => ({sourceId: source.id, credibilityScore: 0.9,
      claims: [{text: source.title + ' verified finding', excerpt: source.acquisition.excerpts[0].excerpt}],
      contradictions: invalid ? [{sourceIds: [source.id, 'invented-source'], description:'Invalid relationship'}] : []
    }))};
  }});
  const done = await run(create({topic:'错误反证来源不可污染已核验状态',autoApprove:true}), f.ctx);
  assert.equal(done.status, 'completed');
  assert.equal(verifications, 2);
  assert.equal(done.state.contradictions.length, 0);
  assert.ok(f.checkpoints.every(state => !state.contradictions.some(c => c.sources.includes('invented-source'))));
});

test('native provider failure is surfaced without a format-correction model request', async () => {
  const state = create({topic: 'Explain the provider transport failure'});
  state.workers = [{id: 'researcher-1', role: 'researcher', label: '研究员', engine: 'codex', active: true}];
  let checks = 0, sends = 0;
  const ctx = {id: 'provider-failure', signal: new AbortController().signal, checkpoint: async () => {},
    client: {invoke: async command => {
      if (command === 'session.status') return [{busy: false, ...(checks++ ? {error: 'Provider stream disconnected'} : {})}];
      if (command === 'session.send') {sends++; return {messageId: 'native-turn'};}
      throw Error('Transcript or corrective model calls must not run after a native failure');
    }}};
  await assert.rejects(ask(state, ctx, 'source-check', 'researcher', 'search', {query: 'bounded'}, value => value), /Provider stream disconnected/);
  assert.equal(sends, 1);
  assert.equal(state.tasks['source-check'].failureKind, 'native-terminal');
});

test('a persisted native failure is not mistaken for a malformed JSON answer after restart', async () => {
  const state = create({topic: 'Recover an interrupted provider without repeating a failed transcript'});
  state.workers = [{id: 'researcher-1', role: 'researcher', label: '研究员', engine: 'codex', active: true}];
  state.tasks['source-check'] = {taskId: 'wf/source-check', logicalKey: 'source-check', role: 'researcher', label: 'search', employeeId: 'researcher-1', engine: 'codex', status: 'running', receipt: {messageId: 'native-turn'}};
  const ctx = {id: 'wf', signal: new AbortController().signal, checkpoint: async () => {}, client: {invoke: async command => {
    if (command === 'session.status') return [{busy: false}];
    if (command === 'session.transcript') return {items: [
      {role: 'user', outbound: {taskId: 'native-turn'}},
      {role: 'assistant', blocks: [{kind: 'text', text: '{"partial":'}]},
      {role: 'notice', tone: 'error', text: 'Provider stream disconnected'}
    ]};
    throw Error('A failed native turn must not request a format correction');
  }}};
  await assert.rejects(ask(state, ctx, 'source-check', 'researcher', 'search', {query: 'bounded'}, value => value), /Provider stream disconnected/);
  assert.equal(state.tasks['source-check'].failureKind, 'native-terminal');
  retry(state);
  assert.equal(state.taskAttempts['source-check'], 1, 'explicit Resume starts a fresh native attempt');
});
