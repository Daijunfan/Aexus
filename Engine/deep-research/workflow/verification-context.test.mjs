import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../model.mjs';
import {mergeSources, mergeVerification, normalizeVerification} from '../evidence.mjs';
import {projectKnowledge} from '../knowledge/index.mjs';
import {attributeVerification} from './verification-context.mjs';

const quote = 'A published study reports 0 faults from its documented sample.';
const url = 'https://example.org/study';
const source = (sha, accessedAt = 1790000000000) => ({
  id: 'src-study', title: 'Original study', url,
  acquisition: {status: 'read', method: 'independent-http', excerpts: [{
    excerpt: quote, locator: 'Line 9', sha256: sha.repeat(64), finalUrl: url, accessedAt
  }]}
});
const inputs = () => ({
  verifications: [{sourceId: 'src-study', credibilityScore: 0.8, claims: [{
    text: 'Study reports zero faults.', excerpt: quote, confidence: 0.8
  }]}]
});
function setup() {
  const state = create({topic: 'Understand study accuracy'});
  state.dimensions = [{id: 'd1', query: 'Documented sample', status: 'completed'}];
  state.graph = {version: 1, nodes: [{id: 'verify-d1', kind: 'verify', dimensionId: 'd1', status: 'running', active: true}]};
  mergeSources(state, [source('a')], {id: 'search'});
  return state;
}
function verify(state, observed = state.sources) {
  const normalized = normalizeVerification(inputs(), observed);
  mergeVerification(state, normalized);
  attributeVerification(state, normalized, state.graph.nodes[0], observed);
  return normalized;
}

test('runtime verification links a finding to its explicit dimension and exact independently read version', () => {
  const state = setup();
  verify(state);
  state.graph.nodes[0].status = 'completed';
  const projected = projectKnowledge(state);
  assert.equal(projected.diagnostics.unattributedFindingIds.length, 0);
  assert.deepEqual(projected.topics[0].findingIds, [state.findings[0].id]);
  assert.deepEqual(state.findings[0].dimensionIds, ['d1']);
  assert.deepEqual(state.findings[0].evidence[0].sha256, 'a'.repeat(64));
  assert.equal(state.findings[0].evidence[0].finalUrl, url);
  assert.equal(state.findings[0].evidence[0].accessedAt, 1790000000000);
  assert.equal(projected.findings[0].status, 'linked');
  assert.equal(projected.findings[0].issues.length, 0);
});

test('new page versions cannot overwrite a verified quote with a guessed hash', () => {
  const state = setup();
  verify(state);
  const old = structuredClone(state.findings[0].evidence[0]);
  mergeSources(state, [source('b', 1790000000100)], {id: 'search'});
  // A shared sentence now appears in two independent snapshots.
  verify(state);
  assert.deepEqual(state.findings[0].evidence, [old]);
  assert.equal(projectKnowledge(state).findings[0].status, 'linked', 'old explicit proof is still traceable');
});

test('two possible versions keep their missing hash explicit and refuse spurious linkage', () => {
  const state = setup();
  mergeSources(state, [source('b', 1790000000100)], {id: 'search'});
  verify(state);
  assert.equal(state.findings[0].evidence[0].sha256, undefined);
  const projected = projectKnowledge(state);
  assert.deepEqual(projected.findings[0].issues.map(issue => issue.kind), ['ambiguous-proof']);
  assert.equal(projected.topics[0].findingIds.length, 0);
});

test('invalid node dimensions or malformed proof data are not inferred', () => {
  const state = setup();
  state.graph.nodes[0].dimensionId = 'missing-dimension';
  state.sources[0].acquisition.excerpts[0].sha256 = 'not-a-hash';
  verify(state);
  assert.equal(state.findings[0].dimensionIds, undefined);
  assert.equal(state.findings[0].evidence[0].sha256, undefined);
});
