import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {publicURL, publicAddress, pageText, readSource, acquireSources} from '../source-read.mjs';
import {normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport, sourceExcerpt} from '../evidence.mjs';

const candidate = (excerpt, locator = 'Results', url = 'https://evidence.example/article') => ({
  id: 'source', url, title: 'Fixture source', acquisition: {status: 'read', excerpt, locator}
});
const state = () => ({sources: []});

function transport(t, responses, address = '93.184.216.34') {
  const requests = [];
  t.mock.method(dns, 'lookup', (_host, _options, callback) => callback(null, [{address, family: address.includes(':') ? 6 : 4}]));
  t.mock.method(https, 'request', (url, options, onResponse) => {
    requests.push(url);
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = error => { request.emit('error', error); request.emit('close'); };
    request.end = () => queueMicrotask(() => options.lookup(new URL(url).hostname, {all: true}, (error) => {
      if (error) return request.destroy(error);
      const spec = responses.shift();
      const response = new PassThrough();
      response.statusCode = spec.status ?? 200;
      response.headers = {'content-type': spec.type ?? 'text/html', ...(spec.location ? {location: spec.location} : {})};
      onResponse(response);
      response.end(spec.body || '');
      response.once('end', () => request.emit('close'));
    }));
    return request;
  });
  return requests;
}

test('public source guards reject encoded loopback, credentials and mapped private addresses', () => {
  for (const value of ['http://127.1/', 'http://0x7f000001/', 'https://user:secret@example.org/', 'http://[::ffff:127.0.0.1]/', 'http://host.local/']) assert.throws(() => publicURL(value));
  assert.equal(publicAddress('93.184.216.34'), true);
  assert.equal(publicAddress('10.0.0.1'), false);
});

test('HTML extraction uses visible parsed text and decodes entities', () => {
  assert.equal(pageText('<p>A &amp; B&nbsp; &#x4e2d;</p><script>fake source</script><style>fake style</style>'), 'A & B 中');
});

test('redirects and actual DNS lookup enforce the public source boundary', async t => {
  const requests = transport(t, [{status: 302, location: 'https://127.0.0.1/private'}]);
  await assert.rejects(readSource('https://evidence.example/article'), /公开|私网/);
  assert.equal(requests.length, 1);
});

test('a hostname resolving to private addresses is rejected before reading its body', async t => {
  transport(t, [{body: '<p>Never read.</p>'}], '192.168.1.1');
  await assert.rejects(readSource('https://evidence.example/article'), /私网/);
});

test('a public redirect retains the final URL and raw response fingerprint', async t => {
  const body = '<p>Retrieved original source body.</p>';
  transport(t, [{status: 302, location: '/final'}, {body}]);
  const result = await readSource('https://evidence.example/article');
  assert.equal(result.url, 'https://evidence.example/final');
  assert.equal(result.sha256, createHash('sha256').update(body).digest('hex'));
  assert.equal(result.text, 'Retrieved original source body.');
});

test('oversized source responses and pre-aborted reads fail explicitly', async t => {
  transport(t, [{body: 'x'.repeat(4 * 1024 * 1024 + 1), type: 'text/plain'}]);
  await assert.rejects(readSource('https://evidence.example/article'), /4 MiB/);
  await assert.rejects(readSource('https://evidence.example/article', {signal: AbortSignal.abort(Error('Owner cancelled'))}), /Owner cancelled/);
});

test('the entire submitted excerpt is checked, including a fabricated suffix', async () => {
  const result = await acquireSources(state(), [candidate('An original source states a bounded finding. Fabricated ending.')], {
    signal: new AbortController().signal,
    read: async url => ({url, body: 'An original source states a bounded finding.', mediaType: 'text/plain'})
  });
  assert.equal(result[0].acquisition.status, 'unavailable');
  assert.match(result[0].acquisition.rejections[0].reason, /原文|片段/);
});

test('one batch reads each URL once and preserves independent proof for its distinct excerpts', async () => {
  let reads = 0;
  const body = 'Policy A applies to new applicants. Price B costs twelve units.';
  const result = await acquireSources(state(), [candidate('Policy A applies to new applicants.', 'Policy'), candidate('Price B costs twelve units.', 'Price')], {
    signal: new AbortController().signal,
    read: async url => { reads++; return {url, body, mediaType: 'text/plain'}; }
  });
  assert.equal(reads, 1);
  assert.ok(result.every(source => source.acquisition.method === 'independent-http'));
  assert.deepEqual(result.map(source => source.acquisition.excerpts[0].locator), ['Policy', 'Price']);
  assert.ok(result.every(source => /^[a-f0-9]{64}$/.test(source.acquisition.excerpts[0].sha256)));
});

test('already independently acquired excerpts survive recovery without another fetch', async () => {
  const saved = candidate('Policy A applies to new applicants.');
  const first = await acquireSources(state(), [saved], {signal: new AbortController().signal, read: async url => ({url, body: saved.acquisition.excerpt, mediaType: 'text/plain'})});
  const resumed = await acquireSources({sources: first}, [saved], {signal: new AbortController().signal, read: async () => { throw Error('Must not fetch the same checked excerpt again'); }});
  assert.equal(resumed[0].acquisition.status, 'read');
  assert.equal(resumed[0].acquisition.excerpts[0].sha256, first[0].acquisition.excerpts[0].sha256);
});

test('aborted source acquisition never accepts a late body', async () => {
  const controller = new AbortController();
  await assert.rejects(acquireSources(state(), [candidate('Policy A applies to new applicants.')], {signal: controller.signal, read: async url => {
    controller.abort(Error('Owner cancelled retrieval')); return {url, body: 'Policy A applies to new applicants.', mediaType: 'text/plain'};
  }}), /Owner cancelled/);
});

test('agent-supplied proof metadata cannot authenticate a fabricated excerpt', async () => {
  const [submitted] = normalizeSources({sources: [{...candidate('A fabricated passage.'), verified: true, acquisition: {
    status: 'read', method: 'independent-http', excerpt: 'A fabricated passage.', sha256: 'agent-hash',
    excerpts: [{excerpt: 'A fabricated passage.', sha256: 'agent-hash', finalUrl: 'https://evidence.example/article'}]
  }}]}).sources;
  assert.equal(submitted.verified, false); assert.equal(submitted.acquisition.method, undefined);
  assert.equal(submitted.acquisition.excerpts, undefined); assert.equal(submitted.acquisition.sha256, undefined);
  const [checked] = await acquireSources(state(), [submitted], {read: async url => ({url, mediaType: 'text/plain', body: 'The real source passage.'})});
  assert.equal(checked.acquisition.status, 'unavailable');
});

test('one URL keeps its real proof and attributed rejected excerpts without accepting a failed node', async () => {
  const research = {sources: [], input: {maxSources: 10}, findings: [], contradictions: []};
  const real = 'The source provides a bounded conclusion.', fake = real + ' Fabricated ending.';
  const [valid, rejected] = await acquireSources(research, [candidate(real), candidate(fake)], {read: async url => ({url, mediaType: 'text/plain', body: real})});
  assert.deepEqual(mergeSources(research, [valid], {id: 'real-node'}), ['source']);
  assert.deepEqual(mergeSources(research, [rejected], {id: 'fake-node'}), []);
  mergeSources(research, [rejected], {id: 'fake-node'});
  const saved = structuredClone(research.sources[0]);
  assert.equal(saved.acquisition.status, 'read'); assert.equal(sourceExcerpt(saved), real);
  assert.equal(saved.acquisition.rejections.length, 1); assert.equal(saved.acquisition.rejections[0].nodeId, 'fake-node');
  assert.equal(saved.acquisition.rejections[0].excerpt, fake); assert.match(saved.acquisition.rejections[0].reason, /片段/);
  const verify = excerpt => ({verifications: [{sourceId: saved.id, credibilityScore: 1, claims: [{text: 'A finding', excerpt}]}]});
  assert.throws(() => normalizeVerification(verify(fake), [saved]), /片段/);
  mergeVerification(research, normalizeVerification(verify(real), research.sources));
  const report = {report: {sections: [{content: 'Evidence-based conclusion.', citations: [saved.id]}]}};
  assert.equal(validateReport(report, research).sections[0].evidence[0].excerpt, real);
  research.findings[0].evidence[0].excerpt = fake;
  assert.throws(() => validateReport(report, research), /片段/);
});

test('verification requires one independently read proof and cannot join separate excerpt boundaries', async () => {
  const body = 'First bounded statement. Second bounded statement.';
  const research = {sources: [], input: {maxSources: 10}};
  const checked = await acquireSources(research, [candidate('First bounded statement.'), candidate('Second bounded statement.')], {read: async url => ({url, mediaType: 'text/plain', body})});
  mergeSources(research, checked);
  const source = research.sources[0];
  const verify = excerpt => ({verifications: [{sourceId: source.id, credibilityScore: 1, claims: [{text: 'A finding', excerpt}]}]});
  assert.throws(() => normalizeVerification(verify('First bounded statement.\n\nSecond bounded statement.'), [source]), /片段/);
  source.acquisition.status = 'unavailable';
  assert.throws(() => normalizeVerification(verify('First bounded statement.'), [source]), /独立|阅读/);
});
