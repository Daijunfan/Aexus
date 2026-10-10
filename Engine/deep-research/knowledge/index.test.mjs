import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import {create, describe} from '../model.mjs';
import {
  independentlyRead, independentlyVerified, projectFindings, mergeSynthesis, projectTopics, projectGaps, projectDisputes, projectReportLinks, compareResearch, projectKnowledge, projectPublicKnowledge,
} from './index.mjs';

const source = (id, extra = {}) => ({
  id, verified: true,
  acquisition: { status: 'read', method: 'independent-http', excerpts: [
    { excerpt: id + ' independently read primary evidence confirms the result.',
      sha256: 'a'.repeat(64), finalUrl: 'https://example.org/' + id,
      accessedAt: 1790000000000, locator: 'Page 1' },
  ] }, ...extra,
});
const finding = (id = 'f1', src = 's1', extra = {}) => ({
  id, claim: 'An observed claim about ' + src, sourceIds: [src],
  evidence: [{ sourceId: src, excerpt: src + ' independently read primary evidence', locator: 'Untrusted page' }],
  ...extra,
});
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) deepFreeze(member);
    Object.freeze(value);
  }
  return value;
};

test('only independently obtained, verified excerpts link findings; legacy flags do not', () => {
  const verified = source('s1');
  const legacy = { id: 's2', verified: true, acquisition: { status: 'read', excerpt: 'old agent assertion' } };
  const candidate = source('s3', { verified: false });
  assert.equal(independentlyVerified(verified), true);
  assert.equal(independentlyVerified(legacy), false);
  assert.equal(independentlyVerified(candidate), false);
  assert.equal(independentlyRead(candidate), true);
  assert.equal(independentlyRead(legacy), false);
  const findings = [
    finding('proof', 's1'),
    finding('old', 's2', { evidence: [{ sourceId: 's2', excerpt: 'old agent assertion' }] }),
    finding('candidate', 's3'),
    finding('mismatch', 's1', { evidence: [{ sourceId: 's1', excerpt: 'unseen assertion' }] }),
    finding('missing-source', 's1', { sourceIds: [], evidence: [{ sourceId: 's1', excerpt: 's1 independently read' }] }),
  ];
  const result = projectFindings(deepFreeze([verified, legacy, candidate]), deepFreeze(findings));
  assert.deepEqual(result.map(item => item.status), ['linked', 'unlinked', 'unlinked', 'unlinked', 'unlinked']);
  assert.deepEqual(result[0].sourceIds, ['s1']);
  assert.equal(result[0].evidence[0].locator, 'Page 1');
  assert.deepEqual(result[1].sourceIds, []);
  assert.equal(result.length, findings.length);
});

test('proof metadata and excerpt matching stay attached to one source', () => {
  const faulty = source('s1');
  faulty.acquisition.excerpts[0].sha256 = 'invalid';
  assert.equal(independentlyVerified(faulty), false);
  assert.equal(projectFindings([faulty], [finding()])[0].status, 'unlinked');
  const other = source('s2');
  const misleading = finding('f1', 's1', {
    evidence: [{ sourceId: 's1', excerpt: other.acquisition.excerpts[0].excerpt }],
  });
  assert.deepEqual(projectFindings([source('s1'), other], [misleading])[0].sourceIds, []);
});

test('branch-local entity IDs are scoped; identical verified concepts and edges merge', () => {
  const proof = projectFindings([source('s1')], [finding()]);
  const analyses = deepFreeze([
    { nodeId: 'branch-A', result: {
      entities: [
        { id: 'e1', name: 'Solar', type: 'Concept', description: 'Panels', findingIds: ['f1'] },
        { id: 'e2', name: 'Battery', type: 'Concept', description: 'Storage' },
      ],
      relationships: [{ from: 'e1', to: 'e2', type: 'supplies', findingIds: ['f1'] }],
    } },
    { nodeId: 'branch-B', result: {
      entities: [
        { id: 'e1', name: 'Battery', type: 'concept', description: 'Storage' },
        { id: 'e2', name: 'ＳＯＬＡＲ', type: 'CONCEPT', description: 'Panels', findingIds: ['f1'] },
      ],
      relationships: [{ from: 'e2', to: 'e1', type: 'supplies' }],
    } },
  ]);
  const output = mergeSynthesis(analyses, proof);
  assert.equal(output.entities.length, 2);
  assert.equal(output.relationships.length, 1);
  assert.deepEqual(output.relationships[0].originNodeIds, ['branch-A', 'branch-B']);
  assert.equal(output.relationships[0].evidenceStatus, 'linked');
  assert.deepEqual(output.relationships[0].findingIds, ['f1']);
  assert.equal(output.issues.length, 0);
  const reordered = mergeSynthesis([...analyses].reverse(), proof);
  assert.deepEqual(output.entities.map(e => e.id).sort(), reordered.entities.map(e => e.id).sort());
  assert.deepEqual(output.relationships.map(r => r.id).sort(), reordered.relationships.map(r => r.id).sort());
});

test('name collision with incompatible descriptions remains separate; relation cycles are legal', () => {
  const result = mergeSynthesis([
    { nodeId: 'one', entities: [
      { id: 'e1', name: 'Mercury', type: 'concept', description: 'Planet' },
      { id: 'e2', name: 'Venus', type: 'concept' },
    ], relationships: [
      { from: 'e1', to: 'e2', type: 'observed-with' },
      { from: 'e2', to: 'e1', type: 'compared-to' },
    ] },
    { nodeId: 'two', entities: [
      { id: 'e1', name: 'Mercury', type: 'concept', description: 'Chemical element' },
    ], relationships: [] },
  ]);
  assert.equal(result.entities.length, 3);
  assert.equal(result.relationships.length, 2);
  assert.ok(result.relationships.every(edge => edge.evidenceStatus === 'unlinked'));
  assert.ok(result.relationships[0].from === result.relationships[1].to);
  assert.ok(result.relationships[0].to === result.relationships[1].from);
});

test('invalid endpoints, duplicate local IDs and fabricated finding references are not endorsed', () => {
  const output = mergeSynthesis([{ nodeId: 'x', entities: [
    { id: 'e1', name: 'Item', type: 'concept', findingIds: ['fake'] },
    { id: 'e1', name: 'Another', type: 'concept' },
  ], relationships: [
    { from: 'e1', to: 'missing', type: 'contradicts' },
    { from: 'e1', to: 'e1', type: 'same-as', findingIds: ['fake'] },
  ] }], []);
  assert.equal(output.entities.length, 1);
  assert.equal(output.relationships.length, 1);
  assert.equal(output.relationships[0].evidenceStatus, 'unlinked');
  assert.deepEqual(output.issues.map(issue => issue.kind), [
    'unverified-finding', 'invalid-entity', 'invalid-relationship', 'unverified-finding',
  ]);
  assert.deepEqual(output.entities[0].findingIds, []);
});

test('partially grounded findings must not certify a knowledge relationship', () => {
  const partial = projectFindings([source('s1'),source('s2',{verified:false})],[finding('partial','s1',{
    sourceIds:['s1','s2'],
    evidence:[
      {sourceId:'s1',excerpt:'s1 independently read primary evidence'},
      {sourceId:'s2',excerpt:'s2 independently read primary evidence'},
    ],
  })]);
  assert.equal(partial[0].status,'linked', 'one source is still accessible');
  assert.deepEqual(partial[0].sourceIds,['s1']);
  assert.deepEqual(partial[0].issues.map(item=>item.kind),['source-not-verified']);
  const merged=mergeSynthesis([{nodeId:'synthesis',result:{
    entities:[{id:'a',name:'A',type:'concept'}, {id:'b',name:'B',type:'concept'}],
    relationships:[{from:'a',to:'b',type:'depends-on',findingIds:['partial']}],
  }}],partial);
  assert.equal(merged.relationships[0].evidenceStatus,'unlinked');
  assert.deepEqual(merged.relationships[0].findingIds,[]);
  assert.deepEqual(merged.issues.map(item=>item.kind),['unverified-finding']);
});

test('partly substantiated findings stay visible but cannot certify coverage or report navigation', () => {
  const state=deepFreeze({
    dimensions:[{id:'d',query:'Are the costs confirmed?'}],
    sources:[source('s1',{dimensionId:'d'}),source('s2',{verified:false})],
    findings:[finding('partial','s1',{
      dimensionIds:['d'],sourceIds:['s1','s2'],
      evidence:[
        {sourceId:'s1',excerpt:'s1 independently read primary evidence'},
        {sourceId:'s2',excerpt:'s2 independently read primary evidence'},
      ],
    })],
    report:{sections:[{id:'chapter',heading:'Partial claim',evidence:[{
      claim:'An observed claim about s1',sourceId:'s1',
      excerpt:'s1 independently read primary evidence',
    }]}]},
  });
  const projection=projectKnowledge(state);
  assert.equal(projection.findings[0].status,'linked','the real s1 evidence stays browsable');
  assert.deepEqual(projection.diagnostics.partiallyLinkedFindingIds,['partial']);
  assert.equal(projection.topics[0].status,'verified-material');
  assert.deepEqual(projection.topics[0].findingIds,[]);
  assert.deepEqual(projection.sectionLinks[0].findingIds,[]);
});

test('topic coverage shows only observed material and explicit associations; gaps remain unquantified', () => {
  const a = source('s1', { dimensionId: 'd1' });
  const b = { id: 's2', dimensionId: 'd2', verified: false, acquisition: { status: 'discovered' } };
  const state = deepFreeze({
    dimensions: [{ id: 'd1', query: 'Costs' }, { id: 'd2', query: 'Safety' }, { id: 'd3', query: 'Regulation' }],
    graph: { nodes: [
      { id: 'node1', kind: 'search', dimensionId: 'd1', sourceIds: ['s1'], status: 'completed' },
      { id: 'node2', kind: 'search', dimensionId: 'd2', sourceIds: ['s2'], status: 'completed' },
    ] },
    sources: [a, b],
    findings: [
      finding('explicit', 's1', { dimensionIds: ['d1'] }),
      finding('no-link', 's1'),
    ],
    scouting: { gaps: ['Price by region', ' price by region ', 'Missing safety tests'] },
    report: { limitations: ['No regional breakdown', 'No regional breakdown'] },
  });
  const projection = projectKnowledge(state);
  assert.deepEqual(projection.topics.map(t => t.status), ['linked-findings', 'candidates-only', 'unassessed']);
  assert.deepEqual(projection.topics[0].findingIds, ['explicit']);
  assert.deepEqual(projection.topics[0].verifiedSourceIds, ['s1']);
  assert.deepEqual(projection.topics[1].verifiedSourceIds, []);
  assert.deepEqual(projection.gaps.map(item => item.text), ['Price by region', 'Missing safety tests']);
  assert.deepEqual(projection.limitations, ['No regional breakdown']);
  assert.ok(!('percent' in projection));
  assert.ok(!('coverage' in projection.topics[0]));
});

test('explicitly attributed finding exposes the exact cited source even without a search dimension', () => {
  const state = deepFreeze({
    dimensions:[{id:'d1',query:'Which materials directly support the answer?'},
                {id:'d2',query:'Unrelated other question'}],
    sources:[source('s1')],
    findings:[finding('f1','s1',{topicIds:['d1']})],
  });
  const result=projectTopics(state);
  assert.equal(result.topics[0].status,'linked-findings');
  assert.deepEqual(result.topics[0].findingIds,['f1']);
  assert.deepEqual(result.topics[0].candidateSourceIds,['s1']);
  assert.deepEqual(result.topics[0].verifiedSourceIds,['s1']);
  assert.equal(result.topics[1].status,'unassessed');
  assert.deepEqual(result.topics[1].candidateSourceIds,[]);
});

test('separates independently read material from verified material without guessing findings', () => {
  const verified = source('s1', { dimensionId: 'd1' });
  const waiting = source('s2', { dimensionId: 'd2', verified: false });
  const unavailable = {id: 's3', dimensionId: 'd3', acquisition: {status: 'unavailable'}};
  const state = {
    dimensions: [
      {id: 'd1', query: 'Reviewed'}, {id: 'd2', query: 'Read, pending review'},
      {id: 'd3', query: 'Discovered only'}, {id: 'd4', query: 'Unassessed'},
    ],
    sources: [verified, waiting, unavailable],
    findings: [finding('unattributed','s1')],
  };
  const topics = projectTopics(deepFreeze(state)).topics;
  assert.deepEqual(topics.map(topic => topic.status),
    ['verified-material', 'read-pending-verification', 'candidates-only', 'unassessed']);
  assert.deepEqual(topics[1].candidateSourceIds, ['s2']);
  assert.deepEqual(topics[1].readSourceIds, ['s2']);
  assert.deepEqual(topics[1].verifiedSourceIds, []);
  assert.deepEqual(topics[2].readSourceIds, []);
});

test('index projection preserves original source order across overlapping node and dimension links', () => {
  const state = {
    dimensions: [{id: 'd1', query: 'Scope one'}, {id: 'd2', query: 'Scope two'}],
    graph: {nodes: [
      {id: 'n1', kind: 'search', dimensionId: 'd1', sourceIds: ['s3','s1','missing']},
      {id: 'n2', kind: 'search', dimensionId: 'd2', sourceIds: ['s2','s3']},
      {id: 'obsolete', kind: 'search', status: 'superseded', sourceIds: ['s1']},
    ]},
    sources: [
      source('s1', {dimensionId:'d2'}), source('s2', {dimensionIds:['d2','d1']}),
      source('s3'), {id:'missing2', acquisition:{status:'discovered'}},
    ],
  };
  const first = projectTopics(deepFreeze(state)).topics;
  assert.deepEqual(first.map(topic => topic.candidateSourceIds), [
    ['s1','s2','s3'],['s1','s2','s3'],
  ]);
  assert.deepEqual(first.map(topic => topic.readSourceIds), [
    ['s1','s2','s3'],['s1','s2','s3'],
  ]);
  assert.deepEqual(first.map(topic => topic.nodeIds), [['n1'],['n2']]);
});

test('dimension IDs beginning with node: do not lose sources or merge unrelated search nodes', () => {
  const state = {
    dimensions: [{id: 'node:x', query: 'User question'}],
    graph: {nodes: [
      {id: 'x', kind: 'search', label:'Independent search', sourceIds:['s2']},
      {id: 'y', kind: 'search', dimensionId:'node:x', sourceIds:['s1']},
    ]},
    sources: [source('s1',{dimensionId:'node:x'}),source('s2')],
  };
  const projection = projectTopics(deepFreeze(state));
  assert.equal(projection.topics.length, 2);
  const dimension = projection.topics.find(topic => topic.id === 'node:x');
  const search = projection.topics.find(topic => topic.id === 'search:x');
  assert.deepEqual(dimension.nodeIds, ['y']);
  assert.deepEqual(dimension.candidateSourceIds, ['s1']);
  assert.deepEqual(search.nodeIds, ['x']);
  assert.deepEqual(search.candidateSourceIds, ['s2']);
});

test('collects explicit current search gaps without reviving superseded or failed attempts', () => {
  const state = deepFreeze({
    scouting: {gaps: ['Missing prices', ' Missing prices ', 'Unknown regulation']},
    graph: {nodes: [
      {id:'a', kind:'search', status:'completed', taskKey:'a-v2'},
      {id:'b', kind:'search', status:'completed', taskKey:'b-v1'},
      {id:'c', kind:'search', status:'completed', taskKey:'c-v1', active:false},
      {id:'d', kind:'search', status:'pending', taskKey:'d-v1'},
      {id:'e', kind:'search', status:'failed', taskKey:'e-v1'},
      {id:'r', kind:'review', status:'completed', taskKey:'r-v1'},
    ]},
    tasks: {
      'a-v2': {status:'completed', result:{gaps:['Missing prices','Unclear emissions']}},
      'b-v1': {status:'completed', result:{gaps:['Stale result']}},
      'b-v1-retry-2-format-fix': {status:'completed', result:{gaps:['Safety by country']}},
      'c-v1': {status:'completed', result:{gaps:['Superseded only']}},
      'd-v1': {status:'completed', result:{gaps:['Pending only']}},
      'e-v1': {status:'failed', result:{gaps:['Failed only']}},
      'r-v1': {status:'completed', result:{gaps:['Review only']}},
    },
    taskAttempts:{'b-v1':2},
  });
  const gaps = projectGaps(state);
  assert.deepEqual(gaps.map(g => g.text), [
    'Missing prices', 'Unknown regulation', 'Unclear emissions', 'Safety by country',
  ]);
  assert.deepEqual(gaps[0].originNodeIds, ['a']);
  assert.equal(gaps[0].origin, 'scouting');
  assert.deepEqual(gaps[1].originNodeIds, []);
  assert.equal(gaps[2].origin, 'search');
  assert.deepEqual(gaps[3].originNodeIds, ['b']);
  assert.equal(gaps[3].id, projectGaps(state)[3].id);
  assert.equal(projectKnowledge(state).gaps.length, 4);
});

test('finding linked to a source does not automatically answer every question using that source', () => {
  const state = {
    graph: { nodes: [{ id: 'search1', kind: 'search', label: 'What happened?', sourceIds: ['s1'] }] },
    sources: [source('s1')], findings: [finding()],
  };
  const topics = projectTopics(state);
  assert.equal(topics.topics.length, 1);
  assert.equal(topics.topics[0].status, 'verified-material');
  assert.deepEqual(topics.topics[0].findingIds, []);
  assert.equal(topics.topics[0].title, 'What happened?');
});

test('disputes retain exact source references without claiming semantic resolution', () => {
  const claimed = [
    { id: 'd1', description: 'Different measurements', sources: ['s1', 's2'] },
    { id: 'd2', description: 'Single uncorroborated assertion', sources: ['s1', 'missing'] },
  ];
  const projected = projectDisputes([source('s1'), source('s2')], deepFreeze(claimed));
  assert.deepEqual(projected[0], {
    id: 'd1', description: 'Different measurements', sourceIds: ['s1', 's2'],
    availableSourceIds: ['s1', 's2'], status: 'sources-ready',
  });
  assert.equal(projected[1].status, 'needs-sources');
  assert.deepEqual(projected[1].availableSourceIds, ['s1']);
  assert.ok(!('verdict' in projected[0]));
});

test('duplicate source identities from one page cannot be presented as two independent dispute documents', () => {
  const first=source('s1',{url:'https://example.org/article#start'});
  const mirror=source('s2',{url:'https://other.example.org/redirect'});
  mirror.acquisition.excerpts[0].finalUrl=first.acquisition.excerpts[0].finalUrl+'#paragraph';
  const same=projectDisputes([first,mirror],[{
    id:'d1',description:'Two entry URLs redirect to one document',sources:['s1','s2'],
  }])[0];
  assert.deepEqual(same.availableSourceIds,['s1','s2']);
  assert.equal(same.status,'needs-sources');
  const different=structuredClone(mirror);
  different.acquisition.excerpts[0].finalUrl='https://independent.example.org/article';
  const two=projectDisputes([first,different],[{
    id:'d1',description:'Two different pages',sources:['s1','s2'],
  }])[0];
  assert.equal(two.status,'sources-ready');
  different.acquisition.excerpts.push({...different.acquisition.excerpts[0],
    finalUrl:first.acquisition.excerpts[0].finalUrl,
    accessedAt:different.acquisition.excerpts[0].accessedAt+1000});
  assert.equal(projectDisputes([first,different],[{
    id:'d1',description:'Old proof overlaps with the first page',sources:['s1','s2'],
  }])[0].status,'needs-sources');
  assert.ok(!('confirmedContradiction' in two));
});

test('report links match an actual finding, source and excerpt exactly', () => {
  const linked = projectFindings([source('s1')], [finding()]);
  const original = {
    sections: [
      { id: 'chapter-1', heading: 'Evidence', evidence: [
        { claim: linked[0].claim, sourceId: 's1', excerpt: linked[0].evidence[0].excerpt },
        { claim: 'Fabricated claim', sourceId: 's1', excerpt: linked[0].evidence[0].excerpt },
      ] },
      { id: 'chapter-2', heading: 'Invalid source', evidence: [
        { claim: linked[0].claim, sourceId: 'fake', excerpt: linked[0].evidence[0].excerpt },
      ] },
    ],
  };
  const output = projectReportLinks(deepFreeze(original), linked);
  assert.deepEqual(output[0], {
    id: 'chapter-1', heading: 'Evidence', findingIds: ['f1'], sourceIds: ['s1'],
  });
  assert.deepEqual(output[1].findingIds, []);
  assert.deepEqual(output[1].sourceIds, []);
});

test('report-to-finding navigation refuses unversioned claims after conflicting rereads', () => {
  const current = source('s1');
  const changed = {...current.acquisition.excerpts[0],
    sha256: 'b'.repeat(64), accessedAt: current.acquisition.excerpts[0].accessedAt + 10};
  current.acquisition.excerpts.push(changed);
  const rawFinding = finding();
  const pinned = structuredClone(rawFinding);
  pinned.evidence[0].sha256 = changed.sha256;
  const linked = projectFindings([current], [pinned]);
  const report = { sections:[{
    id:'section-one',heading:'Evaluation',evidence:[{
      sourceId:'s1',claim:linked[0].claim,excerpt:pinned.evidence[0].excerpt,
    }],
  }] };
  assert.deepEqual(projectReportLinks(report,linked,[current])[0].findingIds,[],
    'no guessed report version when one sentence appears under two page hashes');
  report.sections[0].evidence[0].sha256 = changed.sha256;
  assert.deepEqual(projectReportLinks(report,linked,[current])[0].findingIds,['f1']);
  report.sections[0].evidence[0].sha256 = 'c'.repeat(64);
  assert.deepEqual(projectReportLinks(report,linked,[current])[0].findingIds,[]);
  report.sections[0].evidence[0].sha256 = changed.sha256;
  const view = projectKnowledge({sources:[current],findings:[pinned],report});
  assert.deepEqual(view.sectionLinks[0].findingIds,['f1']);
  const unpinned = projectKnowledge({sources:[current],findings:[rawFinding],report});
  assert.deepEqual(unpinned.sectionLinks[0].findingIds,[]);
});

test('unresolved version provenance cannot be presented as a confirmed changed source', () => {
  const original=source('s1'), newer=structuredClone(original);
  newer.acquisition.excerpts.push({...newer.acquisition.excerpts[0],
    sha256:'b'.repeat(64),accessedAt:newer.acquisition.excerpts[0].accessedAt+100});
  const before=projectFindings([original],[finding()]);
  const after=projectFindings([newer],[finding()]);
  assert.deepEqual(compareResearch(before,after).changes.map(change=>change.kind),
    ['provenance-unresolved']);
  const revision=projectFindings([newer],[finding('f1','s1',{claim:'A revised finding'})]);
  const diff=compareResearch(before,revision);
  assert.equal(diff.changes[0].kind,'wording-changed');
  assert.equal(diff.changes[0].provenanceUnresolved,true);
  assert.equal(compareResearch(after,after).changes[0].kind,'provenance-unresolved');
});

test('archived syntheses are ignored; older unscoped graph is never invented as verified', () => {
  const state = deepFreeze({
    graph: { nodes: [
      { id: 'old', kind: 'synthesize', active: false, result: {
        entities: [{ id: 'e1', name: 'Archived', type: 'concept' }], relationships: [],
      } },
      { id: 'new', kind: 'synthesize', result: {
        entities: [{ id: 'e1', name: 'Current', type: 'concept' }], relationships: [],
      } },
    ] },
    knowledgeGraph: { entities: [{ id: 'e1', name: 'Old flattened entity' }], relationships: [] },
  });
  const value = projectKnowledge(state);
  assert.deepEqual(value.entities.map(e => e.name), ['Current']);
  assert.deepEqual(value.entities[0].originNodeIds, ['new']);
  assert.equal(value.version, 1);
});

test('pending or failed synthesis results cannot leak outdated relationships into current research', () => {
  const make=(id,status) => ({id,kind:'synthesize',status,active:true,result:{
    entities:[{id:'e1',name:id,type:'concept'}],
    relationships:[],
  }});
  const state = deepFreeze({graph:{nodes:[
    make('done','completed'), make('pending','pending'), make('failed','failed'),
    make('retired','superseded'), make('old-running','running'),
  ]}});
  const result=projectKnowledge(state);
  assert.deepEqual(result.entities.map(entity=>entity.name),['done']);
  assert.deepEqual(result.entities[0].originNodeIds,['done']);
  assert.equal(result.issues.length,0);
});

test('version comparison separates evidence changes from wording and absent observations', () => {
  const before = deepFreeze([
    { id: 'a', claim: 'An unchanged claim', sourceIds: ['s1'] },
    { id: 'b', claim: 'Version one', sourceIds: ['s1'] },
    { id: 'c', claim: 'Missing this time', sourceIds: ['s2'] },
    { id: 'd', claim: 'Spacing\tcase', sourceIds: [] },
  ]);
  const after = deepFreeze([
    { id: 'a', claim: 'An unchanged claim', sourceIds: ['s2'] },
    { id: 'b', claim: 'Version two', sourceIds: ['s1'] },
    { id: 'new', claim: 'New observation', sourceIds: ['s3'] },
    { id: 'new-id', claim: 'Spacing case', sourceIds: [] },
  ]);
  const compared = compareResearch(before, after);
  assert.equal(compared.retained, 1);
  assert.deepEqual(compared.changes.map(c => c.kind),
    ['evidence-changed', 'wording-changed', 'new', 'not-observed']);
  assert.deepEqual(compared.changes[0].previousSourceIds, ['s1']);
  assert.deepEqual(compared.changes[0].sourceIds, ['s2']);
  assert.equal(compared.changes[1].previous, 'Version one');
  assert.equal(compared.changes[3].text, 'Missing this time');
});

test('history matching is stable across reordered duplicate claims and regenerated IDs', () => {
  const make = (id, sourceId, sha) => ({
    id, claim: 'The conclusion is shared by independent reports',
    sourceIds: [sourceId],
    evidence: [{sourceId, excerpt: 'Independently reviewed observation', sha256: sha.repeat(64),
      finalUrl: 'https://example.org/' + sourceId}],
  });
  const previous = deepFreeze([make('legacy-one','s1','a'), make('legacy-two','s2','b')]);
  const current = deepFreeze([make('new-two','s2','b'), make('new-one','s1','a')]);
  assert.deepEqual(compareResearch(previous, current), {retained: 2, changes: []});
  assert.deepEqual(compareResearch(current, previous), {retained: 2, changes: []});
  assert.deepEqual(compareResearch(previous, [current[1],current[0]]),
    {retained: 2, changes: []}, 'result must be insensitive to shuffled duplicate-claim observations');
});

test('ambiguous duplicate claims never create invented evidence-change links', () => {
  const before=deepFreeze([
    {id:'old-a',claim:'Similar observation',sourceIds:['s1']},
    {id:'old-b',claim:'Similar observation',sourceIds:['s2']},
  ]);
  const after=deepFreeze([{id:'new-c',claim:'Similar observation',sourceIds:['s3']}]);
  const compared=compareResearch(before,after);
  assert.equal(compared.retained,0);
  assert.deepEqual(compared.changes.map(change=>change.kind),
    ['new','not-observed','not-observed']);
  assert.deepEqual(compared.changes.map(change=>change.id),
    ['new-c','old-a','old-b']);
  assert.ok(!compared.changes.some(change=>change.kind==='evidence-changed'),
    'neither old independent observation can be singled out as the updated source');
});

test('unique persistent identities take precedence while duplicate IDs never reuse one prior record', () => {
  const previous=deepFreeze([
    {id:'persistent',claim:'Old wording',sourceIds:['s1']},
    {id:'other',claim:'Unchanged observation',sourceIds:['s2']},
  ]);
  const renamed=deepFreeze([
    {id:'persistent',claim:'New wording',sourceIds:['s1']},
    {id:'new-id',claim:'Unchanged observation',sourceIds:['s2']},
  ]);
  assert.deepEqual(compareResearch(previous,renamed).changes.map(change=>change.kind),
    ['wording-changed']);
  const single=deepFreeze([{id:'same',claim:'Observation',sourceIds:['s1']}]);
  const repeats=deepFreeze([
    {id:'same',claim:'Observation',sourceIds:['s1']},
    {id:'same',claim:'Observation',sourceIds:['s1']},
  ]);
  const result=compareResearch(single,repeats);
  assert.equal(result.retained,1);
  assert.deepEqual(result.changes.map(change=>change.kind),['new']);
});

test('reacquired versions with identical excerpt cannot silently select the old hash', () => {
  const current = source('s1');
  const newer = {...current.acquisition.excerpts[0],
    sha256: 'b'.repeat(64), accessedAt: current.acquisition.excerpts[0].accessedAt + 1000};
  current.acquisition.excerpts.push(newer);
  const originalFinding = finding('history', 's1');
  const legacy = projectFindings([deepFreeze(current)], [deepFreeze(originalFinding)])[0];
  assert.equal(legacy.status, 'unlinked', 'legacy finding has no version-level proof identity');
  assert.deepEqual(legacy.sourceIds, []);
  assert.deepEqual(legacy.issues.map(issue => issue.kind), ['ambiguous-proof']);
  const pinned = structuredClone(originalFinding);
  pinned.evidence[0].sha256 = newer.sha256;
  const newerLinked = projectFindings([current], [pinned])[0];
  assert.equal(newerLinked.status, 'linked');
  assert.equal(newerLinked.evidence[0].sha256, 'b'.repeat(64));
  assert.equal(newerLinked.evidence[0].accessedAt, newer.accessedAt);
  assert.deepEqual(newerLinked.issues, []);
  const wrong = structuredClone(originalFinding);
  wrong.evidence[0].sha256 = 'c'.repeat(64);
  assert.equal(projectFindings([current], [wrong])[0].issues[0].kind, 'proof-not-found',
    'explicit but wrong evidence identity must not fall back to a convenient old proof');
  const projection = projectKnowledge({sources: [current], findings: [originalFinding]});
  assert.deepEqual(projection.diagnostics.ambiguousEvidenceFindingIds, ['history']);
  assert.deepEqual(projection.diagnostics.unattributedFindingIds, []);
});

test('stale locator cannot silently select a different body version of identical wording', () => {
  const page=source('s1');
  const second={...page.acquisition.excerpts[0],
    sha256:'b'.repeat(64), locator:'Line 98',
    accessedAt:page.acquisition.excerpts[0].accessedAt+3000};
  page.acquisition.excerpts.push(second);
  const original = finding('versioned','s1');
  original.evidence[0].locator='Page 1';
  const unresolved=projectFindings([page],[original])[0];
  assert.equal(unresolved.status,'unlinked');
  assert.deepEqual(unresolved.issues.map(issue=>issue.kind),['ambiguous-proof'],
    'exact old locator must not claim the first hash is the answer');
  const pinned={...original,evidence:[{...original.evidence[0],sha256:second.sha256}]};
  const chosen=projectFindings([page],[pinned])[0];
  assert.equal(chosen.status,'linked');
  assert.equal(chosen.evidence[0].sha256,second.sha256);
  assert.equal(chosen.evidence[0].locator,'Line 98');
});

test('legacy evidence is usable when page proof signatures remain identical across rereads', () => {
  const twice = source('s1');
  twice.acquisition.excerpts.push({
    ...twice.acquisition.excerpts[0],
    accessedAt: twice.acquisition.excerpts[0].accessedAt + 1_000,
  });
  const result = projectFindings([deepFreeze(twice)], [finding()])[0];
  assert.equal(result.status, 'linked');
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].sha256, 'a'.repeat(64));
  assert.deepEqual(result.issues, []);
  const moved = source('s2');
  moved.acquisition.excerpts.push({
    ...moved.acquisition.excerpts[0], finalUrl: 'https://archive.example.org/s2',
    accessedAt: moved.acquisition.excerpts[0].accessedAt + 1_000,
  });
  assert.equal(projectFindings([moved], [finding('moved', 's2')])[0].status, 'unlinked');
  const exact = finding('moved', 's2', {
    evidence: [{sourceId:'s2',excerpt:'s2 independently read primary evidence',
      finalUrl:'https://archive.example.org/s2'}],
  });
  const selected = projectFindings([moved], [exact])[0];
  assert.equal(selected.status, 'linked');
  assert.equal(selected.evidence[0].finalUrl, 'https://archive.example.org/s2');
});

test('question attribution diagnoses missing and invalid explicit references without guessing by shared sources', () => {
  const state = deepFreeze({
    dimensions: [{id:'cost',query:'Pricing'}],
    sources: [source('s1',{dimensionId:'cost'})],
    findings: [
      finding('costFinding','s1',{dimensionIds:['cost']}),
      finding('unassigned','s1'),
      finding('oldDimension','s1',{topicIds:['historical-topic']}),
    ],
    graph: {nodes:[{id:'n1',kind:'synthesize',result:{
      entities:[{id:'e1',name:'Base',type:'concept'},{id:'e2',name:'Dependent',type:'concept'}],
      relationships:[{from:'e1',to:'e2',type:'depends-on'}],
    }}]},
  });
  const result = projectKnowledge(state);
  assert.deepEqual(result.topics[0].findingIds,['costFinding']);
  assert.deepEqual(result.diagnostics.attributedFindingIds,['costFinding']);
  assert.deepEqual(result.diagnostics.unattributedFindingIds,['unassigned','oldDimension']);
  assert.deepEqual(result.diagnostics.invalidTopicRefs,[
    {findingId:'oldDimension',topicId:'historical-topic'},
  ]);
  assert.equal(result.diagnostics.unlinkedRelationIds.length,1);
  assert.ok(!('coveragePercentage' in result));
});

test('source content-hash changes are visible even when URL, finding text and excerpt are identical', () => {
  const beforeSource = source('s1');
  const before = projectFindings([beforeSource], [finding()]);
  assert.equal(before[0].evidence[0].sha256, 'a'.repeat(64));
  assert.equal(before[0].evidence[0].finalUrl, 'https://example.org/s1');
  const reRead = structuredClone(beforeSource);
  reRead.acquisition.excerpts[0].accessedAt += 60_000;
  assert.deepEqual(compareResearch(before, projectFindings([reRead], [finding()])),
    {retained: 1, changes: []}, 'Re-fetch date alone must not be treated as changed evidence');
  const changedBody = structuredClone(reRead);
  changedBody.acquisition.excerpts[0].sha256 = 'b'.repeat(64);
  const changedEvidence = compareResearch(before, projectFindings([changedBody], [finding()]));
  assert.equal(changedEvidence.retained, 0);
  assert.deepEqual(changedEvidence.changes.map(c => c.kind), ['evidence-changed']);
  assert.deepEqual(changedEvidence.changes[0].previousSourceIds, ['s1']);
  assert.deepEqual(changedEvidence.changes[0].sourceIds, ['s1']);
  const changedText = compareResearch(before, projectFindings([changedBody], [
    finding('f1', 's1', {claim: 'A revised statement'}),
  ]));
  assert.equal(changedText.changes[0].kind, 'wording-changed');
  assert.equal(changedText.changes[0].evidenceChanged, true);
});

test('projects the real public workflow summary without a duplicate checkpoint or new Contract', () => {
  const state = create({topic:'Verifiable public knowledge projection'});
  state.sources = [source('s1',{dimensionId:'d1'})];
  state.findings = [finding('f1','s1',{dimensionIds:['d1']})];
  state.dimensions = [{id:'d1',query:'Question one'}];
  state.graph = {version:1,nodes:[
    {id:'n1',kind:'search',active:true,status:'completed',dimensionId:'d1',sourceIds:['s1'],dependencies:[]},
    {id:'n2',kind:'synthesize',active:true,status:'completed',dependencies:['n1'],result:{
      entities:[{id:'local',name:'Verified topic',type:'concept',findingIds:['f1']}],
      relationships:[],
    }},
  ]};
  const publicView = describe(state);
  const projection = projectPublicKnowledge(deepFreeze(publicView));
  assert.equal(projection.topics[0].status,'linked-findings');
  assert.deepEqual(projection.topics[0].findingIds,['f1']);
  assert.equal(projection.entities[0].evidenceStatus,'linked');
  assert.deepEqual(projection.entities[0].originNodeIds,['n2']);
  assert.deepEqual(projection.gaps,[]);
  assert.deepEqual(projection, projectKnowledge(state));
  const withGaps = projectPublicKnowledge({...publicView,researchGaps:['Research gap']});
  assert.deepEqual(withGaps.gaps.map(item=>item.text),['Research gap']);
  assert.equal(withGaps.gaps[0].origin, 'reported', 'A public string has no proven stage');
  const structured = projectPublicKnowledge({...publicView, researchGaps: [
    {text:'Need confirmation',origin:'search',originNodeIds:['n1']},
    {text:' need confirmation ',origin:'search',originNodeIds:['n2']},
    {text:'Unlinked search gap',origin:'search',originNodeIds:['nonexistent']},
    'Standalone concern',
  ]});
  assert.deepEqual(structured.gaps.map(item => item.origin), ['search','reported','reported']);
  assert.deepEqual(structured.gaps[0].originNodeIds, ['n1'],
    'synthesis nodes cannot masquerade as source-search gap origins');
  assert.deepEqual(structured.gaps[1].originNodeIds, []);
  assert.equal(structured.gaps.length, 3);
  assert.deepEqual(projectPublicKnowledge(null).topics,[]);
});

test('knowledge projector bundles for the browser without Node runtime or polyfills', async () => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('./index.mjs', import.meta.url))],
    bundle: true, platform: 'browser', format: 'esm', write: false,
  });
  assert.equal(bundled.outputFiles.length, 1);
  const code = bundled.outputFiles[0].text;
  assert.match(code, /projectKnowledge/);
  assert.doesNotMatch(code, /node:crypto|require\("crypto"\)/);
});

test('large branches preserve stable identities without quadratic cross-branch reference searches', () => {
  const analyses = Array.from({ length: 400 }, (_, i) => ({
    nodeId: 'branch-' + i, entities: [
      { id: 'e1', type: 'concept', name: 'Common' },
      { id: 'e2', type: 'concept', name: 'Specific-' + i },
    ],
    relationships: [{ from: 'e1', to: 'e2', type: 'includes' }],
  }));
  const graph = mergeSynthesis(analyses);
  assert.equal(graph.entities.length, 401);
  assert.equal(graph.relationships.length, 400);
  assert.equal(new Set(graph.relationships.map(r => r.id)).size, 400);
  assert.ok(graph.relationships.every(r => r.evidenceStatus === 'unlinked'));
});
