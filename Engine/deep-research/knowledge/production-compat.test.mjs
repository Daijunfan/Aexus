import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '../model.mjs';
import {mergeSources, mergeVerification, normalizeVerification} from '../evidence.mjs';
import {projectKnowledge} from './index.mjs';

const quote='The official dataset reports 0 faults for the documented trial.';
const page = (hash, accessedAt) => ({
  id: 's1', url:'https://example.org/trial',title:'Trial summary',
  verified:false,
  acquisition: {status:'read',method:'independent-http',excerpts:[{
    excerpt:quote,locator:'Line 12',sha256:hash.repeat(64),
    finalUrl:'https://example.org/trial',accessedAt,
  }]},
});
const verification = () => ({
  verifications:[{sourceId:'s1',credibilityScore:0.8,notes:'Limits apply',
    claims:[{text:'Trial recorded zero faults.',excerpt:quote,locator:'Line 12',confidence:0.8}],
    contradictions:[]}],
});

test('real verifier and source merger expose unsupported question linkage without guessing', () => {
  const state=create({topic:'Find reliable evidence'});
  state.dimensions=[{id:'d1',query:'Evidence',status:'completed'}];
  state.graph={version:1,nodes:[
    {id:'n1',kind:'search',active:true,status:'completed',dimensionId:'d1',sourceIds:['s1']},
  ]};
  mergeSources(state,[page('a',1790000000000)],state.graph.nodes[0]);
  mergeVerification(state,normalizeVerification(verification(),state.sources));
  const first=projectKnowledge(state);
  assert.equal(first.findings.length,1);
  assert.equal(first.findings[0].status,'linked');
  assert.deepEqual(first.findings[0].sourceIds,['s1']);
  assert.deepEqual(first.topics[0].verifiedSourceIds,['s1']);
  assert.deepEqual(first.diagnostics.unattributedFindingIds,[first.findings[0].id],
    'current verification stores no explicit topic ID even when search task belongs to d1');
  assert.deepEqual(first.topics[0].findingIds,[]);
  assert.equal(first.findings[0].evidence[0].sha256,'a'.repeat(64));

  mergeSources(state,[page('b',1790000000100)],state.graph.nodes[0]);
  assert.equal(state.sources[0].verified,false,'new unreviewed content resets source verification');
  mergeVerification(state,normalizeVerification(verification(),state.sources));
  assert.equal(state.sources[0].verified,true);
  assert.equal(state.sources[0].acquisition.excerpts.length,2);
  assert.equal(state.findings[0].evidence.length,1,
    'production finding evidence has no source-proof identity for the second reading');
  const rerun=projectKnowledge(state);
  assert.equal(rerun.findings[0].status,'unlinked');
  assert.deepEqual(rerun.findings[0].issues.map(item=>item.kind),['ambiguous-proof']);
  assert.deepEqual(rerun.diagnostics.ambiguousEvidenceFindingIds,[first.findings[0].id]);
  assert.equal(rerun.topics[0].status,'verified-material',
    'material is verified, but the exact finding provenance is now unresolved');
  assert.deepEqual(rerun.topics[0].findingIds,[]);
});
