import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMatrixProposal, acceptMatrixProposal, projectFindings} from './index.mjs';

const proof = () => ({
  id: 's1', verified: true,
  acquisition: {status: 'read',method: 'independent-http',excerpts:[{
    excerpt:'Published price 0元 for A.',
    locator:'Line 11',sha256:'a'.repeat(64),
    finalUrl:'https://example.org/a',accessedAt:1790000000000,
  }]},
});
const verified = () => projectFindings([proof()], [{
  id:'f1',claim:'Published price 0元 for A.',sourceIds:['s1'],
  evidence:[{sourceId:'s1',excerpt:'Published price 0元 for A.'}],
}]);
const matrix = () => ({
  id:'custom',title:'Cost comparison',columns:['A','B'],
  rows:[{label:'Price',values:['','100元']},{label:'Notes',values:['reviewed','']}],
});
const candidate = (overrides = {}) => ({
  matrixId:'custom',rowLabel:'Price',columnLabel:'A',
  expectedRaw:'',proposedRaw:'0元',findingIds:['f1'],...overrides,
});
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
};

test('safe candidate reports exact cell and supporting source without silently editing data', () => {
  const original = freeze(matrix()), proposal=freeze(candidate()), findings=freeze(verified());
  const assessment=assessMatrixProposal(original,proposal,findings);
  const expectedRef={findingId:'f1',sourceId:'s1',excerpt:'Published price 0元 for A.',
    locator:'Line 11',sha256:'a'.repeat(64),
    finalUrl:'https://example.org/a',accessedAt:1790000000000};
  assert.deepEqual(assessment,{
    status:'ready-for-review',matrixId:'custom',rowIndex:0,columnIndex:0,
    rowLabel:'Price',columnLabel:'A',expectedRaw:'',proposedRaw:'0元',
    findingIds:['f1'],sourceIds:['s1'],proofRefs:[expectedRef],
  });
  assert.equal(original.rows[0].values[0],'');
  const pending=acceptMatrixProposal(original,proposal,findings);
  assert.equal(pending.status,'not-approved');
  assert.equal(pending.matrix,original);
  const confirmed=acceptMatrixProposal(original,
    {...proposal,reviewedProofRefs:assessment.proofRefs},findings,true);
  assert.equal(confirmed.status,'applied');
  assert.equal(confirmed.matrix.rows[0].values[0],'0元');
  assert.equal(original.rows[0].values[0],'');
  assert.deepEqual(confirmed.provenance,{
    matrixId:'custom',rowLabel:'Price',columnLabel:'A',previousRaw:'',
    proposedRaw:'0元',findingIds:['f1'],sourceIds:['s1'],proofRefs:[expectedRef],
  });
  assert.notEqual(confirmed.matrix.rows[0],original.rows[0]);
  assert.equal(confirmed.matrix.rows[1],original.rows[1],
    'unrelated rows are structurally shared, no full state clone');
  assert.equal(acceptMatrixProposal(confirmed.matrix,proposal,findings,true).status,'conflict',
    'a second acceptance with a stale cell snapshot cannot overwrite edits');
});

test('user edits, renamed columns and duplicate labels block target overwriting', () => {
  const data=matrix(), findings=verified(), request=candidate();
  data.rows[0].values[0]='My own note';
  const conflict=assessMatrixProposal(data,request,findings);
  assert.equal(conflict.status,'conflict');
  assert.equal(conflict.actualRaw,'My own note');
  assert.equal(acceptMatrixProposal(data,request,findings,true).matrix,data);
  data.rows[0].values[0]='';
  data.columns[0]='Renamed';
  assert.equal(assessMatrixProposal(data,request,findings).status,'cell-not-unique');
  data.columns[0]='A';
  data.columns.push('A');
  assert.equal(assessMatrixProposal(data,request,findings).status,'cell-not-unique');
  data.columns.pop();
  data.rows.push({label:'Price',values:['','']});
  assert.equal(assessMatrixProposal(data,request,findings).status,'cell-not-unique');
});

test('unknown and non-verifiable claims cannot create a ready candidate', () => {
  const data=matrix();
  assert.equal(assessMatrixProposal(data,candidate(),[]).status,'needs-evidence');
  assert.equal(assessMatrixProposal(data,candidate({findingIds:['f1','fake']}),verified()).status,'needs-evidence');
  assert.equal(assessMatrixProposal(data,candidate({findingIds:[]}),verified()).status,'needs-evidence');
  const noProof=[{...verified()[0],status:'unlinked',sourceIds:[]}];
  assert.equal(assessMatrixProposal(data,candidate(),noProof).status,'needs-evidence');
  assert.equal(acceptMatrixProposal(data,candidate(),noProof,true).matrix,data);
});

test('partially substantiated finding cannot update user-owned cells', () => {
  const partial={...verified()[0],issues:[{sourceId:'s2',kind:'source-not-verified'}]};
  assert.equal(partial.status,'linked');
  assert.equal(assessMatrixProposal(matrix(),candidate(),[partial]).status,'needs-evidence');
  const rejected=acceptMatrixProposal(matrix(),candidate(),[partial],true);
  assert.equal(rejected.status,'needs-evidence');
  assert.equal(rejected.matrix.rows[0].values[0],'');
});

test('approved matrix changes carry exact proven source snapshots and reject stale review', () => {
  const current=verified(), data=freeze(matrix());
  const assessment=assessMatrixProposal(data,candidate(),current);
  assert.equal(assessment.status,'ready-for-review');
  const reviewed=candidate({reviewedProofRefs:structuredClone(assessment.proofRefs)});
  const first=acceptMatrixProposal(data,reviewed,current,true);
  assert.equal(first.status,'applied');
  assert.deepEqual(first.provenance.proofRefs,assessment.proofRefs);
  assert.equal(first.provenance.proofRefs[0].accessedAt,1790000000000);
  const changed=current.map(finding=>({...finding,evidence:finding.evidence.map(ref=>({
    ...ref,sha256:'b'.repeat(64),
  }))}));
  const stale=acceptMatrixProposal(data,reviewed,changed,true);
  assert.equal(stale.status,'stale-evidence');
  assert.equal(stale.assessment.reason,'evidence-changed-since-review');
  assert.equal(stale.matrix,data);
  const identicalReFetch=current.map(finding=>({...finding,evidence:finding.evidence.map(ref=>({
    ...ref,accessedAt:ref.accessedAt+900,
  }))}));
  const rerun=acceptMatrixProposal(data,reviewed,identicalReFetch,true);
  assert.equal(rerun.status,'applied','same original body must not be invalidated by a later fetch time');
  assert.equal(rerun.provenance.proofRefs[0].accessedAt,1790000000900);
  assert.equal(assessMatrixProposal(data,candidate({reviewedProofRefs:'invalid'}),current).status,'invalid');
});

test('unverifiable or partial proof metadata cannot authorize a matrix overwrite', () => {
  const data=matrix(), raw=verified()[0];
  const fake={...raw,evidence:[{sourceId:'s1',excerpt:'Published price 0元 for A.'}]};
  assert.deepEqual(assessMatrixProposal(data,candidate(),[fake]),{
    status:'needs-evidence',reason:'incomplete-proof-identity',
  });
  assert.equal(acceptMatrixProposal(data,candidate(),[fake],true).matrix,data);
  const missingSource={...raw,sourceIds:['s1','unsubstantiated']};
  assert.equal(assessMatrixProposal(data,candidate(),[missingSource]).status,'needs-evidence');
  const broken={...raw,evidence:raw.evidence.map(ref=>({...ref,sha256:'invalid'}))};
  assert.equal(assessMatrixProposal(data,candidate(),[broken]).status,'needs-evidence');
  const invalidUrl={...raw,evidence:raw.evidence.map(ref=>({...ref,finalUrl:'http:garbage'}))};
  assert.equal(assessMatrixProposal(data,candidate(),[invalidUrl]).status,'needs-evidence');
  const protocol={...raw,evidence:raw.evidence.map(ref=>({...ref,finalUrl:'file:///tmp/excerpt'}))};
  assert.equal(assessMatrixProposal(data,candidate(),[protocol]).status,'needs-evidence');
});

test('the same custom matrix ID in two studies cannot accept another study\'s follow-up', () => {
  const parent='study-owner-A';
  const proposal=candidate({researchId:parent});
  const otherStudy={researchId:'study-owner-B'};
  const data=freeze(matrix()), findings=freeze(verified());
  assert.equal(assessMatrixProposal(data,proposal,findings).status,'wrong-research',
    'a scoped request requires the caller to supply the active owner research');
  assert.equal(assessMatrixProposal(data,proposal,findings,otherStudy).status,'wrong-research');
  assert.equal(acceptMatrixProposal(data,proposal,findings,true,otherStudy).status,'wrong-research');
  assert.equal(acceptMatrixProposal(data,proposal,findings,true,otherStudy).matrix,data);
  assert.equal(assessMatrixProposal(data,candidate(),findings,{researchId:parent}).status,'wrong-research',
    'a scoped call must not accept a legacy unscoped proposal');
  const sameStudy={researchId:parent};
  const ready=assessMatrixProposal(data,proposal,findings,sameStudy);
  assert.equal(ready.status,'ready-for-review');
  assert.equal(ready.researchId,parent);
  const applied=acceptMatrixProposal(data,
    {...proposal,reviewedProofRefs:ready.proofRefs},findings,true,sameStudy);
  assert.equal(applied.status,'applied');
  assert.equal(applied.provenance.researchId,parent);
  assert.equal(applied.matrix.rows[0].values[0],'0元');
  assert.equal(data.rows[0].values[0],'');
});

test('no fabricated unit conversion or inferred numeric value; explicit nonempty raw values only', () => {
  const data=matrix(), findings=verified();
  const result=assessMatrixProposal(data,candidate({proposedRaw:'$3.00'}),findings);
  assert.equal(result.status,'needs-value-support');
  assert.equal(result.reason,'number-not-in-linked-original-excerpt');
  assert.equal(acceptMatrixProposal(data,candidate({proposedRaw:'$3.00'}),findings,true).status,'needs-value-support');
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:''}),findings).status,'invalid');
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:'   '}),findings).status,'invalid');
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:'x'.repeat(2100)}),findings).status,'invalid');
  assert.equal(assessMatrixProposal(data,candidate({matrixId:'other'}),findings).status,'invalid');
  const unchanged=assessMatrixProposal(data,candidate({expectedRaw:'100元',proposedRaw:'100元',columnLabel:'B'}),findings);
  assert.equal(unchanged.status,'unchanged');
  assert.equal(assessMatrixProposal(data,candidate({expectedRaw:'',proposedRaw:'1元',columnLabel:'B'}),findings).status,'conflict');
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:'0'}),findings).status,'ready-for-review');
  const different=verified().map(item => ({...item,evidence:[{...item.evidence[0],excerpt:'Item is 10元, no other price.'}]}));
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:'0'}),different).status,'needs-value-support',
    '0 must not match the final digit of 10');
  assert.equal(assessMatrixProposal(data,candidate({proposedRaw:'0元'}),different).status,'needs-value-support');
});
