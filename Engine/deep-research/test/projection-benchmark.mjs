import { performance } from 'node:perf_hooks';
import { create, describe } from '../model.mjs';
import { applyPlan } from '../graph.mjs';
import { run } from '../runtime.mjs';

const records = [];
for (const [nodeCount, sourceCount] of [[48, 80], [128, 1000]]) {
  const state = create({ topic: 'Measure public research projection cost', maxSources: sourceCount, maxTasks: nodeCount });
  const nodes = Array.from({ length: nodeCount - 2 }, (_, i) => ({ id: 'search-' + i, kind: 'search', role: 'researcher', label: 'Investigate evidence question ' + i, dependencies: i > 1 ? ['search-' + Math.floor((i - 1) / 2)] : [], payload: { query: 'Evidence question ' + i } }));
  nodes.push({ id: 'report', kind: 'write', dependencies: nodes.map(n => n.id) }, { id: 'review', kind: 'review', dependencies: ['report'] });
  applyPlan(state, { nodes, dimensions: [] }, 'Projection benchmark'); state.phase = 'research';
  state.sources = Array.from({ length: sourceCount }, (_, i) => ({ id: 'src-' + i, title: 'Retrieved evidence source ' + i, url: 'https://source-' + i + '.example/evidence', verified: false, acquisition: { status: 'read', method: 'independent-http', excerpts: [{excerpt: 'Measured original evidence passage. '.repeat(60), locator: 'Paragraph 1', sha256: 'a'.repeat(64), accessedAt: 1, finalUrl: 'https://source-' + i + '.example/evidence', match: 'normalized-text'}] } }));
  for (let i = 0; i < 5; i++) describe(state);
  const times = []; let bytes = 0;
  for (let i = 0; i < 30; i++) {
    const start = performance.now(); const summary = describe(state); bytes = Buffer.byteLength(JSON.stringify(summary)); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  records.push({ nodes: nodeCount, sources: sourceCount, publicBytes: bytes, medianMs: Number(times[15].toFixed(2)), p95Ms: Number(times[28].toFixed(2)) });
}
console.log(JSON.stringify({ benchmark: 'describe + JSON serialization, synthetic 2 KB excerpts', records }, null, 2));

const checkpointRecords = [];
for (const [nodeCount, sourceCount, verifyBranches] of [[48, 80, 1], [128, 1000, 1], [128, 1000, 8]]) {
  const state = create({ topic: 'Measure real task prompt and result checkpoint cost', maxSources: sourceCount, maxTasks: nodeCount, autoApprove: true });
  const initial = Array.from({ length: 8 }, (_, i) => ({ id: 'initial-' + i, kind: 'search', role: 'researcher', dependencies: [], payload: { query: 'Initial evidence ' + i } }));
  const followups = Array.from({ length: nodeCount - 10 - verifyBranches }, (_, i) => ({ id: 'followup-' + i, kind: 'search', role: 'researcher', dependencies: initial.map(n => n.id), payload: { query: 'Evidence followup ' + i } }));
  const verifiers = Array.from({length: verifyBranches}, (_, i) => ({id: 'verify-' + i, kind: 'verify', role: 'researcher', dependencies: verifyBranches === 1 ? [...initial, ...followups].map(n => n.id) : [initial[i].id]}));
  const nodes = [...initial, ...followups, ...verifiers, { id: 'report', kind: 'write', role: 'writer', dependencies: [...verifiers, ...followups].map(n => n.id) }, { id: 'review', kind: 'review', role: 'coordinator', dependencies: ['report'] }];
  const evidence = Array.from({ length: sourceCount }, (_, i) => ({ title: 'Synthetic evidence ' + i, url: 'https://source-' + i + '.example/evidence', acquisition: { status: 'read', excerpt: 'Measured original evidence passage. '.repeat(60), locator: 'Paragraph 1' } }));
  const cards = [], transcripts = new Map(), controller = new AbortController();
  const counts = [], measurements = [];
  let latest, failure;
  const ctx = { id: 'checkpoint-benchmark', signal: controller.signal, sourceReader: async url => ({url, mediaType: 'text/plain', body: 'Measured original evidence passage. '.repeat(60)}), checkpoint: async snapshot => {
    latest = snapshot;
    const start = performance.now();
    structuredClone(snapshot);
    const summary = describe(snapshot);
    const bytes = Buffer.byteLength(JSON.stringify({ state: snapshot, summary }));
    measurements.push({ bytes, ms: performance.now() - start });
    if (bytes > 64 * 1024 * 1024) controller.abort(Error('Synthetic checkpoint measurement reached 64 MiB'));
  }, client: { invoke: async (command, args) => {
    if (command === 'engine.check') return { ready: args.engine === 'pi' };
    if (command === 'group.list') return [];
    if (['group.add', 'management.bind', 'management.unbind'].includes(command)) return {};
    if (command === 'session.list') return { sessions: cards };
    if (command === 'card.create') { const card = { ...args, id: 'worker-' + cards.length }; cards.push(card); return card; }
    if (command === 'session.status') return [{ busy: false }];
    if (command === 'session.send') {
      const task = JSON.parse(args.text.split('\n\n')[1]);
      let result;
      if (task.kind === 'scout') result = { sources: evidence.slice(0, 1) };
      else if (task.kind === 'plan') result = { nodes, dimensions: [{ id: 'evidence', query: 'Measure evidence aggregation cost' }] };
      else if (task.kind === 'search') {
        const index = Number(task.taskId.match(/initial-(\d+)/)?.[1]);
        result = { sources: Number.isInteger(index) ? evidence.slice(1 + index * Math.ceil((sourceCount - 1) / 8), 1 + (index + 1) * Math.ceil((sourceCount - 1) / 8)) : [] };
      } else if (task.kind === 'verify') result = { verifications: task.payload.sources.map(s => ({ sourceId: s.id, credibilityScore: 1, claims: [{ text: 'Synthetic finding from ' + s.title, excerpt: s.acquisition.excerpts[0].excerpt, confidence: 1 }] })) };
      else if (task.kind === 'write') result = { report: { title: 'Synthetic benchmark report', sections: [{ heading: 'Measured evidence', content: 'Synthetic benchmark findings only.', citations: task.payload.sources.map(s => s.id) }] } };
      else result = { verdict: 'pass', summary: 'Synthetic review passed', issues: [] };
      counts.push({ kind: task.kind, sources: task.payload.sources?.length ?? 0 });
      transcripts.set(args.employee, [{ role: 'user', text: args.text, outbound: { taskId: task.taskId } }, { role: 'assistant', blocks: [{ kind: 'text', text: JSON.stringify({ taskId: task.taskId, ...result }) }] }]);
      return { messageId: task.taskId };
    }
    if (command === 'session.transcript') return { items: transcripts.get(args.employee) || [] };
    throw Error('Unexpected checkpoint fixture call: ' + command);
  } } };
  try { await run(state, ctx); } catch (error) { failure = error.message; }
  measurements.sort((a, b) => a.ms - b.ms);
  checkpointRecords.push({ nodes: nodeCount, sources: sourceCount, verifyBranches, completed: latest.phase === 'complete', taskRecords: Object.keys(latest.tasks).length, maxCheckpointBytes: Math.max(...measurements.map(m => m.bytes)), taskPromptBytes: Object.values(latest.tasks).reduce((n, t) => n + Buffer.byteLength(t.prompt || ''), 0), medianMs: Number(measurements[Math.floor(measurements.length / 2)].ms.toFixed(2)), p95Ms: Number(measurements[Math.floor(measurements.length * 0.95)].ms.toFixed(2)), failure: failure || null, searchRequests: counts.filter(c => c.kind === 'search').length, searchSourceBodies: counts.filter(c => c.kind === 'search').reduce((sum, c) => sum + c.sources, 0) });
}
console.log(JSON.stringify({ benchmark: 'Native task records + checkpoint clone, describe and JSON serialization; synthetic 2 KB excerpts', records: checkpointRecords }, null, 2));
