import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../model.mjs';
import {applyPlan} from '../graph.mjs';
import {run} from '../runtime.mjs';
import {createSourceAcquisitionCoordinator} from './source-budget.mjs';

const candidate = (name, excerpt = name) => ({
  id: 'src-' + name, url: 'https://' + name + '.example/evidence',
  acquisition: {status: 'read', excerpt}
});

test('real concurrent research branches never fetch sources outside the shared budget', async () => {
  const state = create({topic: 'Bounded native search branches', maxSources: 1, autoApprove: true,
    team: {maxWorkers: 4, maxManagers: 1, maxConcurrency: 2}});
  const team = [
    {id: 'coordinator', role: 'coordinator', label: 'Coordinator', managementRole: 'manager'},
    {id: 'researcher-a', role: 'researcher', label: 'Researcher A'},
    {id: 'researcher-b', role: 'researcher', label: 'Researcher B'},
    {id: 'writer', role: 'writer', label: 'Writer'}
  ];
  applyPlan(state, {team, nodes: [
    {id: 'a', kind: 'search', role: 'researcher', dependencies: [], payload: {query: 'a'}},
    {id: 'b', kind: 'search', role: 'researcher', dependencies: [], payload: {query: 'b'}},
    {id: 'write', kind: 'write', role: 'writer', dependencies: ['a', 'b']},
    {id: 'review', kind: 'review', role: 'coordinator', dependencies: ['write']}
  ]}, 'Fixed concurrency test');
  state.phase = 'research';
  state.workers = team.map(item => ({...item, id: item.id, specId: item.id, active: true, engine: 'pi', managerIds: []}));

  const controller = new AbortController(), turns = new Map(), requests = [];
  const ctx = {
    id: 'wf_budget_test', signal: controller.signal,
    sourceReader: async url => {
      requests.push(url);
      await new Promise(resolve => setTimeout(resolve, 20));
      return {url, mediaType: 'text/plain', body: 'Quote ' + new URL(url).hostname.split('.')[0]};
    },
    checkpoint: async snapshot => {
      if (snapshot.graph.nodes.filter(node => ['a', 'b'].includes(node.id) && node.status === 'completed').length === 2)
        controller.abort(Error('Both search branches completed'));
    },
    client: {invoke: async (command, args) => {
      if (command === 'session.status') return [{busy: false}];
      if (command === 'session.send') {
        const task = JSON.parse(args.text.split('\n\n')[1]);
        assert.equal(task.kind, 'search');
        const name = task.payload.query;
        const output = {taskId: task.taskId, sources: [{
          title: name, url: candidate(name).url,
          acquisition: {status: 'read', excerpt: 'Quote ' + name}
        }], gaps: []};
        turns.set(args.employee, {id: task.taskId, prompt: args.text, output});
        return {messageId: task.taskId};
      }
      if (command === 'session.transcript') {
        const record = turns.get(args.employee);
        return {items: [{role: 'user', text: record.prompt, outbound: {taskId: record.id}},
          {role: 'assistant', blocks: [{kind: 'text', text: JSON.stringify(record.output)}]}]};
      }
      throw Error('Unexpected native command: ' + command);
    }}
  };

  await assert.rejects(run(state, ctx), /Both search branches completed/);
  assert.equal(requests.length, 1, 'The second unknown source must not consume an HTTP request');
  assert.equal(state.sources.length, 1);
  assert.ok(state.graph.nodes.filter(node => ['a', 'b'].includes(node.id)).every(node => node.status === 'completed'));
  assert.equal(state.graph.nodes.filter(node => ['a', 'b'].includes(node.id) &&
    node.resultSummary?.includes('1 条候选来源受预算限制')).length, 1);
});
const deferred = () => {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return {promise, release};
};

test('parallel branches cannot reserve more independent URLs than the source budget', async () => {
  const state = create({topic: 'Source budget under parallel research', maxSources: 1});
  const gate = deferred(), received = [];
  const collect = createSourceAcquisitionCoordinator(state, async (batch, node) => {
    received.push({node: node.id, urls: batch.map(item => item.url)});
    if (node.id === 'first') await gate.promise;
    state.sources.push(...batch);
    return batch.map(item => item.id);
  });

  const first = collect([candidate('first')], {id: 'first'});
  const second = collect([candidate('second')], {id: 'second'});
  assert.deepEqual(received.map(record => record.node), ['first']);
  gate.release();
  assert.deepEqual(await first, ['src-first']);
  assert.deepEqual(await second, []);
  assert.deepEqual(state.sources.map(item => item.id), ['src-first']);
});

test('waiting on the same URL preserves both branch excerpts and one source identity', async () => {
  const state = create({topic: 'Share a source across two branches', maxSources: 1});
  const gate = deferred(), source = candidate('shared'), admitted = [];
  const collect = createSourceAcquisitionCoordinator(state, async (batch, node) => {
    admitted.push(node.id);
    if (node.id === 'first') await gate.promise;
    for (const item of batch) {
      const existing = state.sources.find(saved => saved.url === item.url);
      if (existing) existing.excerpts.push(item.acquisition.excerpt);
      else state.sources.push({...item, excerpts: [item.acquisition.excerpt]});
    }
    return batch.map(item => item.id);
  });

  const first = collect([source], {id: 'first'});
  const second = collect([candidate('shared', 'second excerpt')], {id: 'second'});
  assert.deepEqual(admitted, ['first'], 'Second branch waits for the first merge');
  gate.release();
  assert.deepEqual(await first, ['src-shared']);
  assert.deepEqual(await second, ['src-shared']);
  assert.deepEqual(admitted, ['first', 'second']);
  assert.deepEqual(state.sources[0].excerpts, ['shared', 'second excerpt']);
  assert.equal(state.sources.length, 1);
});

test('already-known URLs serialize overlapping proof reads without consuming fresh-source slots', async () => {
  const state = create({topic: 'Reuse an existing source under concurrency', maxSources: 1});
  state.sources = [candidate('shared', 'original')];
  const gate = deferred(), seen = [];
  const collect = createSourceAcquisitionCoordinator(state, async (batch, node) => {
    seen.push(node.id);
    if (node.id === 'first') await gate.promise;
    return batch.map(item => item.id);
  });
  const first = collect([candidate('shared', 'first new excerpt')], {id: 'first'});
  const second = collect([candidate('shared', 'second new excerpt')], {id: 'second'});
  assert.deepEqual(seen, ['first']);
  gate.release();
  assert.deepEqual(await first, ['src-shared']);
  assert.deepEqual(await second, ['src-shared']);
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(state.sources.length, 1);
});

test('scope restrictions and known-source enrichment remain valid at a full budget', async () => {
  const state = create({topic: 'Only explicitly permitted source pages', maxSources: 1,
    sourceUrls: ['https://allowed.example/evidence']});
  state.sources.push(candidate('allowed', 'previous'));
  const seen = [];
  const collect = createSourceAcquisitionCoordinator(state, async batch => {
    seen.push(...batch.map(item => item.url));
    return batch.map(item => item.id);
  });
  const collected = await collect([candidate('blocked'), candidate('allowed', 'additional')], {id: 'check'});
  assert.deepEqual(collected, ['src-allowed']);
  assert.deepEqual(seen, [candidate('allowed').url]);
});

test('a reserved URL skipped by an earlier capacity decision becomes reusable after merge', async () => {
  const state = create({topic: 'Allow existing evidence after a concurrent reservation', maxSources: 1});
  const gate = deferred(), seen = [];
  const collect = createSourceAcquisitionCoordinator(state, async (batch, node) => {
    seen.push({node: node.id, urls: batch.map(item => item.url)});
    if (node.id === 'first') await gate.promise;
    for (const item of batch) if (!state.sources.some(saved => saved.url === item.url)) state.sources.push(item);
    return batch.map(item => item.id);
  });

  const first = collect([candidate('shared')], {id: 'first'});
  // The unknown URL cannot displace a source another branch has reserved.
  const second = collect([candidate('unknown'), candidate('shared')], {id: 'second'});
  assert.deepEqual(seen.map(item => item.node), ['first']);
  gate.release();
  assert.deepEqual(await first, ['src-shared']);
  assert.deepEqual(await second, ['src-shared']);
  assert.deepEqual(seen[1].urls, [candidate('shared').url]);
  assert.equal(state.sources.length, 1);
});

test('budget omissions are reported to the original DAG branch without inventing evidence', async () => {
  const state = create({topic: 'Explain why discovered sources were omitted', maxSources: 1});
  state.sources = [candidate('known')];
  const omitted = [], calls = [];
  const collect = createSourceAcquisitionCoordinator(state, async batch => {
    calls.push(batch.map(item => item.url));
    return batch.map(item => item.id);
  }, undefined, (node, count) => omitted.push({nodeId: node.id, count}));
  const ids = await collect([candidate('unknown-one'), candidate('unknown-two'), candidate('known')], {id: 'branch-one'});
  assert.deepEqual(ids, ['src-known']);
  assert.deepEqual(omitted, [{nodeId: 'branch-one', count: 2}]);
  assert.deepEqual(calls, [[candidate('known').url]]);
});

test('cancellation while waiting for another branch does not acquire stale sources', async () => {
  const state = create({topic: 'Avoid late acquisition after cancellation', maxSources: 1});
  const gate = deferred(), controller = new AbortController(), admitted = [];
  const collect = createSourceAcquisitionCoordinator(state, async (batch, node) => {
    admitted.push(node.id);
    if (node.id === 'first') await gate.promise;
    return batch.map(item => item.id);
  }, controller.signal);

  const first = collect([candidate('shared')], {id: 'first'});
  const second = collect([candidate('shared')], {id: 'second'});
  controller.abort(Error('Research stopped'));
  gate.release();
  await first;
  await assert.rejects(second, /Research stopped/);
  assert.deepEqual(admitted, ['first']);
});

test('deterministic concurrency stress never oversubscribes source capacity or loses admitted identities', async () => {
  for (let seed = 1; seed <= 64; seed++) {
    const maxSources = 1 + seed % 6;
    const state = create({topic: 'Synthetic stress case ' + seed, maxSources});
    const collect = createSourceAcquisitionCoordinator(state, async batch => {
      await new Promise(resolve => setTimeout(resolve, (seed + batch.length) % 3));
      const ids = [];
      for (const item of batch) {
        let old = state.sources.find(source => source.url === item.url);
        if (!old) { old = {...item}; state.sources.push(old); }
        ids.push(old.id);
      }
      return ids;
    });
    const results = await Promise.all(Array.from({length: 16}, (_, index) => {
      const urls = Array.from({length: 5}, (_, offset) =>
        candidate('source-' + ((seed * 3 + index * 5 + offset * 7) % 23)));
      return collect(urls, {id: 'branch-' + index});
    }));
    assert.ok(state.sources.length <= maxSources, 'Source budget exceeded at seed ' + seed);
    assert.equal(new Set(state.sources.map(item => item.url)).size, state.sources.length);
    const retained = new Set(state.sources.map(item => item.id));
    assert.ok(results.flat().every(id => retained.has(id)), 'Unknown admitted ID at seed ' + seed);
  }
});
