import assert from 'node:assert/strict';
import test from 'node:test';
import { indexSources, filterSources, matchedFields, sourcePage, sourcePageNumber, SOURCE_PAGE_SIZE } from '../source-browser.ts';

// Synthetic in-memory evidence; never fetched, published, or mixed with a real study.
const proof = (excerpt, locator = 'Line 2') => ({ excerpt, locator, sha256: 'a'.repeat(64), accessedAt: 1_700_000_000_000, finalUrl: 'https://official.example/policy' });
const read = (excerpts, verified = false) => ({ verified, acquisition: { status: 'read', method: 'independent-http', excerpts: excerpts.map(text => proof(text)) } });
function fixture() {
  const sources = [
    { id: 'a', title: 'Market A', url: 'https://www.official.example/a', snippet: 'An unverified candidate summary.', ...read(['储能容量为 １０ kWh。'], true) },
    { id: 'b', title: 'Capacity record', url: 'https://official.example/b', ...read(['Battery capacity requires further review.']) },
    { id: 'c', title: 'Candidate', url: 'https://other.example/c', summary: 'legacy summary searchable', verified: false, acquisition: { status: 'discovered' } },
    { id: 'd', title: 'Historical', url: 'https://other.example/d', verified: true, acquisition: { status: 'read', method: 'agent-reported', excerpt: 'An old unproven passage.' } },
    { id: 'e', title: 'Unavailable', url: 'invalid-url', verified: false, acquisition: { status: 'unavailable', rejections: [{ excerpt: 'Rejected sentence', reason: 'Not in the original' }] } },
  ];
  const findings = [
    { id: 'f1', sourceIds: ['a', 'a'], claim: '十千瓦时的电池', evidence: [{ sourceId: 'a', excerpt: '储能容量为 １０ kWh。', locator: 'Line 2' }] },
    { id: 'old', sourceIds: ['d'], claim: 'Legacy assertion', evidence: [] },
    { id: 'missing', sourceIds: ['unknown'], claim: 'A missing source must not create a row.', evidence: [] },
  ];
  return { sources, findings };
}
const filters = (query = '', status = 'all', host = '') => ({ query, status, host });
const ids = result => result.entries.map(entry => entry.source.id);

function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

test('source projection preserves identity and groups findings without changing domain data', () => {
  const data = freeze(fixture());
  const before = structuredClone(data);
  const index = indexSources(data.sources, data.findings);
  assert.equal(index.entries.length, 5);
  assert.equal(index.byId.get('a').source, data.sources[0]);
  assert.equal(index.byId.get('a').claims.length, 1);
  assert.equal(index.byId.get('a').summary, '十千瓦时的电池');
  assert.match(index.byId.get('b').summary, /^已读取片段/);
  assert.equal(index.byId.get('c').summary, '候选摘要 · legacy summary searchable');
  assert.deepEqual(data, before);
});

test('status filters never promote historical flags or unavailable candidates', () => {
  const { sources, findings } = fixture();
  const index = indexSources(sources, findings);
  assert.deepEqual(ids(filterSources(index, filters('', 'verified'))), ['a']);
  assert.deepEqual(ids(filterSources(index, filters('', 'reading'))), ['b']);
  assert.deepEqual(ids(filterSources(index, filters('', 'unread'))), ['c', 'd', 'e']);
  assert.deepEqual(filterSources(index, filters()).counts, { all: 5, verified: 1, reading: 1, unread: 3 });
  assert.equal(index.byId.get('d').source.verified, true, 'the UI must not rewrite historical state');
});

test('search spans source metadata, saved excerpts and linked findings with Unicode normalization', () => {
  const { sources, findings } = fixture();
  const index = indexSources(sources, findings);
  for (const query of ['ｍＡｒＫｅｔ　１０', 'market 储能', 'official.example 十千瓦时', '  储能   储能  ']) {
    assert.deepEqual(ids(filterSources(index, filters(query))), ['a'], query);
  }
  assert.deepEqual(ids(filterSources(index, filters('legacy summary'))), ['c']);
  const result = filterSources(index, filters('market 储能'));
  assert.deepEqual(matchedFields(result.entries[0], result.terms), ['标题', '已读取片段']);
});

test('historical search matches remain visibly unverified and rejected excerpts are not evidence fields', () => {
  const { sources, findings } = fixture();
  const index = indexSources(sources, findings);
  const old = filterSources(index, filters('unproven'));
  assert.deepEqual(ids(old), ['d']);
  assert.deepEqual(matchedFields(old.entries[0], old.terms), ['历史片段 · 未独立验证']);
  const oldClaim = filterSources(index, filters('assertion'));
  assert.deepEqual(matchedFields(oldClaim.entries[0], oldClaim.terms), ['关联论断 · 待核验']);
  assert.deepEqual(ids(filterSources(index, filters('Rejected sentence'))), []);
});

test('site filters are exact and status counts describe the current query and website', () => {
  const { sources, findings } = fixture();
  const index = indexSources(sources, findings);
  assert.deepEqual(index.hosts, [{ host: 'official.example', count: 2 }, { host: 'other.example', count: 2 }]);
  const result = filterSources(index, filters('', 'reading', 'official.example'));
  assert.deepEqual(ids(result), ['b']);
  assert.deepEqual(result.counts, { all: 2, verified: 1, reading: 1, unread: 0 });
  assert.deepEqual(ids(filterSources(index, filters('', 'all', 'example'))), []);
  assert.deepEqual(ids(filterSources(index, filters('capacity', 'all', 'official.example'))), ['b']);
});

test('empty, literal and malformed-looking search strings stay local and do not throw', () => {
  const { sources, findings } = fixture();
  const index = indexSources(sources, findings);
  assert.equal(filterSources(index, filters(' \n\t')).entries.length, 5);
  for (const query of ['[a-z].*', '<script>alert(1)</script>', '"', '\\', 'https://missing.example']) {
    assert.equal(filterSources(index, filters(query)).entries.length, 0);
  }
  assert.equal(index.byId.get('e').host, '');
  assert.equal(filterSources(indexSources([], []), filters()).entries.length, 0);
});

test('one thousand sources remain reachable in bounded pages with stable numbering', () => {
  const sources = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), title: 'Source ' + i, url: `https://site${i % 3}.example/${i}`, verified: false }));
  sources.indexOf = () => { throw Error('Do not scan the source array for every row number'); };
  const index = indexSources(sources, []);
  const all = [];
  for (let page = 1; page <= 25; page++) {
    const result = sourcePage(index.entries, page);
    assert.equal(result.entries.length, SOURCE_PAGE_SIZE);
    all.push(...result.entries.map(entry => entry.source.id));
  }
  assert.deepEqual(all, sources.map(source => source.id));
  const filtered = filterSources(index, filters('', 'all', 'site2.example'));
  assert.equal(filtered.entries[0].number, 3);
  assert.equal(sourcePageNumber(index.entries, '999'), 25);
  assert.equal(sourcePageNumber(filtered.entries, '999'), null);
});

test('paging clamps stale, invalid and empty page requests safely', () => {
  const { sources } = fixture();
  const index = indexSources(sources, []);
  for (const page of [-100, 0, 1.5, 99, NaN, Infinity]) assert.equal(sourcePage(index.entries, page).page, 1);
  assert.deepEqual(sourcePage([], 50), { page: 1, pages: 1, start: 0, entries: [] });
  assert.equal(sourcePageNumber([], 'missing'), null);
});
