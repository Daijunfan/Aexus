import test from 'node:test';
import assert from 'node:assert/strict';
import {create, run} from '../runtime.mjs';

const url = 'https://recovered.example/evidence';
const recorded = () => ({
  id: 'src-recovered', title: 'Previously read original',
  url, verified: true, acquisition: {status: 'read', method: 'independent-http', excerpts: [
    {excerpt: 'Previously verified original sentence.', locator: 'Paragraph 1',
      finalUrl: url, sha256: 'a'.repeat(64), accessedAt: 1}
  ]}
});

const stateWithProof = () => {
  const state = create({topic: 'Retain verified source identity during historical replay'});
  state.phase = 'complete';
  state.independentEvidence = true;
  state.sources = [recorded()];
  state.artifacts = [{name: 'fixture.txt', mediaType: 'text/plain', content: 'Historical result', description: 'Fixture'}];
  return state;
};

const context = () => ({
  id: 'wf_historical_replay',
  signal: new AbortController().signal,
  checkpoint: async () => {},
  sourceReader: async () => { throw Error('An exact persisted independent proof must not trigger a fresh request'); },
  client: {invoke: async command => { throw Error('Unexpected native request: ' + command); }}
});

test('scout replay rebuilds source IDs when completed native replies are not retained', async () => {
  const state = stateWithProof();
  state.reacquireScout = true;
  state.scouting = {sourceIds: ['src-recovered']};
  const done = await run(state, context());
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.state.scouting.sourceIds, ['src-recovered']);
  assert.equal(done.state.sources[0].acquisition.method, 'independent-http');
});

test('replaying a completed DAG search preserves original proof and provenance', async () => {
  const state = stateWithProof();
  state.graph = {version: 1, nodes: [{
    id: 'archived-search', role: 'researcher', kind: 'search', active: true,
    dependencies: [], sourceIds: ['src-recovered'], status: 'completed', reacquire: true
  }]};
  const done = await run(state, context());
  assert.deepEqual(done.state.graph.nodes[0].sourceIds, ['src-recovered']);
  assert.equal(done.state.graph.nodes[0].reacquire, undefined);
  assert.equal(done.state.sources.length, 1);
});
