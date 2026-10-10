import test from 'node:test';
import assert from 'node:assert/strict';

test('runtime verifies two independent excerpts on one unscoped URL using one HTTP response', async () => {
  const {create, run} = await import('../runtime.mjs');
  const {applyPlan} = await import('../graph.mjs');
  const state = create({topic: 'Cross-branch source response reuse', autoApprove: true,
    maxSources: 1, team: {maxWorkers: 4, maxManagers: 1, maxConcurrency: 2}});
  applyPlan(state, {nodes: [
    {id: 'branch-one', kind: 'search', role: 'researcher', dependencies: [], payload: {query: 'one'}},
    {id: 'branch-two', kind: 'search', role: 'researcher', dependencies: [], payload: {query: 'two'}},
    {id: 'write', kind: 'write', role: 'writer', dependencies: ['branch-one','branch-two']},
    {id: 'review', kind: 'review', role: 'coordinator', dependencies: ['write']}
  ]}, 'Concurrent discovery');
  state.phase = 'research';
  state.independentEvidence = true;
  state.workers = [
    {id: 'researcher-one', role: 'researcher'}, {id: 'researcher-two', role: 'researcher'},
    {id: 'writer', role: 'writer'}, {id: 'coordinator', role: 'coordinator'}
  ].map(worker => ({...worker, active: true, engine: 'pi', managerIds: []}));
  const url = 'https://independent.example/report', proofOne = 'First independent finding.', proofTwo = 'Second independent finding.';
  const transcript = new Map(), controller = new AbortController();
  let httpCalls = 0;
  const ctx = {
    id: 'wf_reused_source', signal: controller.signal,
    sourceReader: async value => {
      assert.equal(value, url);
      httpCalls++;
      return {url, mediaType: 'text/plain', body: proofOne + ' ' + proofTwo, accessedAt: 123};
    },
    checkpoint: async snapshot => {
      if (snapshot.graph.nodes.filter(node => node.kind === 'search' && node.status === 'completed').length === 2) {
        controller.abort(Error('Both search branches completed'));
      }
    },
    client: {invoke: async (command, args) => {
      if (command === 'session.status') return [{busy: false}];
      if (command === 'session.send') {
        const task = JSON.parse(args.text.split('\n\n')[1]);
        const excerpt = task.payload.query === 'one' ? proofOne : proofTwo;
        transcript.set(args.employee, {prompt: args.text, id: args.clientMessageId,
          response: {taskId: task.taskId, sources: [{title: 'Independent report', url,
            acquisition: {status: 'read', excerpt}}], gaps: []}});
        return {messageId: args.clientMessageId};
      }
      if (command === 'session.transcript') {
        const item = transcript.get(args.employee);
        return {items: [{role: 'user', text: item.prompt, outbound: {taskId: item.id}},
          {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify(item.response)}]}]};
      }
      throw Error('Unexpected command: ' + command);
    }}
  };
  await assert.rejects(run(state, ctx), /Both search branches completed/);
  assert.equal(httpCalls, 1);
  assert.equal(state.sources.length, 1);
  assert.deepEqual(new Set(state.sources[0].acquisition.excerpts.map(item => item.excerpt)), new Set([proofOne, proofTwo]));
  assert.deepEqual(state.sources[0].acquisition.excerpts.map(item => item.accessedAt), [123, 123]);
  assert.deepEqual(state.graph.nodes.filter(node => node.kind === 'search').map(node => node.sourceIds),
    [[state.sources[0].id], [state.sources[0].id]]);
});
