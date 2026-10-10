import test from 'node:test';
import assert from 'node:assert/strict';
import {create, run} from '../runtime.mjs';
import {applyPlan} from '../graph.mjs';

test('verify prompts include only assigned independent proof, not the global URL catalog', async () => {
  const state = create({topic: 'Process a thousand source records without repeating every URL', maxSources: 1000,
    team: {maxWorkers: 3, maxManagers: 1, maxConcurrency: 1}, autoApprove: true});
  const team = [{id: 'coordinator', role: 'coordinator', managementRole: 'manager'},
    {id: 'verifier', role: 'verifier'}, {id: 'writer', role: 'writer'}];
  applyPlan(state, {team, nodes: [
    {id: 'verification', kind: 'verify', role: 'verifier', dependencies: []},
    {id: 'write', kind: 'write', role: 'writer', dependencies: ['verification']},
    {id: 'review', kind: 'review', role: 'coordinator', dependencies: ['write']}
  ]}, 'Bounded prompt test');
  state.phase = 'research';
  state.workers = team.map(item => ({...item, specId: item.id, active: true, engine: 'pi', managerIds: []}));
  state.sources = Array.from({length: 1000}, (_, i) => ({
    id: 'src-' + i, url: 'https://provider-' + i + '.example/evidence/' + i,
    title: 'Original ' + i, verified: i === 0, acquisition: {
      status: 'read', method: 'independent-http', excerpts: [{
        excerpt: 'Independently acquired sample passage.', locator: 'Line 1',
        sha256: 'a'.repeat(64), finalUrl: 'https://provider-' + i + '.example/evidence/' + i, accessedAt: 1
      }]
    }
  }));
  state.graph.nodes.find(item => item.id === 'verification').inputSourceIds = ['src-0'];
  const controller = new AbortController();
  let payload;
  const ctx = {id: 'wf_prompt_budget', signal: controller.signal, checkpoint: async () => {},
    client: {invoke: async (command, args) => {
      if (command === 'session.status') return [{busy: false}];
      if (command === 'session.send') {
        payload = JSON.parse(args.text.split('\n\n')[1]).payload;
        controller.abort(Error('Measured native input payload'));
        return {messageId: args.clientMessageId};
      }
      throw Error('Unexpected native command: ' + command);
    }}
  };
  await assert.rejects(run(state, ctx), /Measured native input payload/);
  assert.equal('existingSources' in payload, false);
  assert.deepEqual(payload.sources.map(item => item.id), ['src-0']);
  const duplicatedCatalogBytes = Buffer.byteLength(JSON.stringify(state.sources.map(({id, url}) => ({id, url}))));
  assert.ok(duplicatedCatalogBytes > 50000, 'The omitted global catalog would materially increase token usage');
});
