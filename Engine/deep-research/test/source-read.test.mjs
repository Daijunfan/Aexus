import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {publicURL, publicAddress, pageText, readSource, previewSource, acquireSources} from '../source-read.mjs';
import {normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport, sourceExcerpt, withinSourceBudget} from '../evidence.mjs';

const candidate = (excerpt, locator = 'Results', url = 'https://evidence.example/article') => ({
  id: 'source', url, title: 'Fixture source', acquisition: {status: 'read', excerpt, locator}
});
const state = () => ({sources: []});

test('bounded page previews expose readable text while source budgets reject other URLs', async () => {
  const html = await previewSource('https://allowed.example/a', {read: async url => ({url, mediaType: 'text/html', body: '<title>Source &amp; title</title><p>One exact public statement.</p>'})});
  assert.equal(html.title, 'Source & title');
  assert.match(html.text, /One exact public statement/);
  const pdf = await previewSource('https://allowed.example/a.pdf', {read: async url => ({url, mediaType: 'application/pdf', data: pdfFixture(['A bounded PDF statement.'])})});
  assert.match(pdf.text, /Page 1: A bounded PDF statement/);
  const candidates = normalizeSources({sources: [candidate('Allowed evidence', 'Body', 'https://allowed.example/a'), candidate('Outside evidence', 'Body', 'https://outside.example/a')]}).sources;
  assert.deepEqual(withinSourceBudget({sources: [], input: {maxSources: 1, sourceUrls: ['https://allowed.example/a']}}, candidates).map(source => source.url), ['https://allowed.example/a']);
});

function pdfFixture(texts, width = 600) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids = [];
  for (const text of texts) {
    const pageId = objects.length + 1, stream = `BT /F1 10 Tf 20 700 Td (${text}) Tj ET`;
    kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} 800] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${pageId + 1} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${texts.length} >>`;
  let body = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(body.length); body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(body);
}

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
  assert.equal(pageText(result.body), 'Retrieved original source body.');
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

test('joined page paragraphs become separate exact proofs, never one fabricated quote', async () => {
  const first = 'Example domains are maintained for documentation purposes.';
  const second = 'They are not available for registration or transfer.';
  const joined = first + ' / ' + second;
  const [checked] = await acquireSources(state(), [candidate(joined)], {
    read: async url => ({url, mediaType: 'text/html', body: `<p>${first}</p><p>${second}</p>`})
  });
  assert.equal(checked.acquisition.status, 'read');
  assert.deepEqual(checked.acquisition.excerpts.map(item => item.excerpt), [first, second]);
  assert.equal(normalizeVerification({verifications: [{sourceId: checked.id, credibilityScore: 1, claims: [first, second].map(excerpt => ({text: 'Exact claim', excerpt}))}]}, [checked])[0].claims.length, 2);
  assert.throws(() => normalizeVerification({verifications: [{sourceId: checked.id, credibilityScore: 1, claims: [{text: 'Combined claim', excerpt: joined}]}]}, [checked]), /片段/);
  const [reused] = await acquireSources({sources: [checked]}, [candidate(joined)], {
    read: async () => { throw Error('Both saved exact excerpts should be reused'); }
  });
  assert.equal(reused.acquisition.status, 'read');
  const [fabricated] = await acquireSources(state(), [candidate(first + ' / ' + second + ' Invented ending.')], {
    read: async url => ({url, mediaType: 'text/html', body: `<p>${first}</p><p>${second}</p>`})
  });
  assert.equal(fabricated.acquisition.status, 'unavailable');
  const [literal] = await acquireSources(state(), [candidate('Policy A / Policy B')], {
    read: async url => ({url, mediaType: 'text/plain', body: 'Policy A / Policy B'})
  });
  assert.deepEqual(literal.acquisition.excerpts.map(item => item.excerpt), ['Policy A / Policy B']);
});

test('the independently retrieved HTML title replaces an agent-supplied title across source merges', async () => {
  const discovered = candidate('The document contains a bounded fact.');
  discovered.title = 'Invented title';
  const research = {sources: [], input: {maxSources: 4}};
  mergeSources(research, [discovered]);
  const [checked] = await acquireSources(research, [discovered], {
    read: async url => ({url, mediaType: 'text/html', body: '<!doctype html><title>Actual &amp; Verified Title</title><p>The document contains a bounded fact.</p>'})
  });
  assert.equal(checked.title, 'Actual & Verified Title');
  assert.equal(checked.acquisition.pageTitle, 'Actual & Verified Title');
  mergeSources(research, [checked]);
  assert.equal(research.sources[0].title, 'Actual & Verified Title');
  assert.equal(research.sources[0].acquisition.pageTitle, 'Actual & Verified Title');
  const [reused] = await acquireSources(research, [discovered], {
    read: async () => { throw Error('Previously checked HTML must not be fetched again'); }
  });
  assert.equal(reused.title, 'Actual & Verified Title');
});

test('already independently acquired excerpts survive recovery without another fetch', async () => {
  const saved = candidate('Policy A applies to new applicants.');
  const first = await acquireSources(state(), [saved], {signal: new AbortController().signal, read: async url => ({url, body: saved.acquisition.excerpt, mediaType: 'text/plain'})});
  const resumed = await acquireSources({sources: first}, [saved], {signal: new AbortController().signal, read: async () => { throw Error('Must not fetch the same checked excerpt again'); }});
  assert.equal(resumed[0].acquisition.status, 'read');
  assert.equal(resumed[0].acquisition.excerpts[0].sha256, first[0].acquisition.excerpts[0].sha256);
});

test('a legacy source ID reuses its verified excerpt through the canonical URL', async () => {
  const saved = candidate('Policy A applies to new applicants.');
  const [checked] = await acquireSources(state(), [saved], {read: async url => ({url, body: saved.acquisition.excerpt, mediaType: 'text/plain'})});
  const legacy = {...checked, id: 'legacy-id', url: checked.url + '?utm_source=old'};
  const [reused] = await acquireSources({sources: [legacy]}, [saved], {read: async () => { throw Error('Same verified excerpt should not be refetched'); }});
  assert.equal(reused.acquisition.status, 'read');
  assert.equal(reused.acquisition.excerpts[0].sha256, checked.acquisition.excerpts[0].sha256);
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

test('PDF HTTP bytes are independently parsed and locate a full excerpt on its real page', async t => {
  const data = pdfFixture(['First page contains a bounded evidence passage.', 'Second page establishes the actual policy.']);
  transport(t, [{body: data, type: 'application/pdf'}]);
  const [source] = await acquireSources(state(), [candidate('Second page establishes the actual policy.', 'Page 999')]);
  assert.equal(source.acquisition.status, 'read');
  const proof = source.acquisition.excerpts[0];
  assert.equal(proof.locator, 'Page 2'); assert.deepEqual(proof.pages, [2]);
  assert.equal(proof.mediaType, 'application/pdf'); assert.equal(proof.sha256, createHash('sha256').update(data).digest('hex'));
  const [verified] = normalizeVerification({verifications: [{sourceId: source.id, credibilityScore: 1, claims: [{text: 'Policy finding', excerpt: proof.excerpt, locator: 'Page 999'}]}]}, [source]);
  assert.equal(verified.claims[0].locator, 'Page 2');
});

test('PDF fabricated excerpts, absent text layers, invalid headers and excessive pages fail without trust elevation', async () => {
  const actual = 'The actual PDF source contains this bounded evidence.';
  for (const [data, excerpt, reason] of [
    [pdfFixture([actual]), actual + ' Fabricated suffix.', /片段/],
    [pdfFixture(['']), actual, /文字|OCR/],
    [Buffer.from('An HTML response masquerading as a PDF.'), actual, /PDF/],
    [pdfFixture(Array(81).fill(actual)), actual, /80 页/],
    [pdfFixture(['First half of the excerpt.', 'Second half of the excerpt.']), 'First half of the excerpt. Second half of the excerpt.', /片段/]
  ]) {
    const [source] = await acquireSources(state(), [candidate(excerpt)], {read: async url => ({url, data, mediaType: 'application/pdf'})});
    assert.equal(source.acquisition.status, 'unavailable'); assert.match(source.acquisition.rejections[0].reason, reason);
  }
});

test('PDF size and owner cancellation remain bounded through the same HTTP reader', async t => {
  transport(t, [{body: Buffer.alloc(8 * 1024 * 1024 + 1), type: 'application/pdf'}]);
  await assert.rejects(readSource('https://evidence.example/article.pdf'), /8 MiB/);
  const controller = new AbortController(), data = pdfFixture(['Only original source text is available.']);
  await assert.rejects(acquireSources(state(), [candidate('Only original source text is available.')], {signal: controller.signal, read: async url => {
    controller.abort(Error('Owner cancelled PDF acquisition')); return {url, data, mediaType: 'application/pdf'};
  }}), /Owner cancelled PDF/);
});

test('PDF text extraction enforces its character budget', {timeout: 10_000}, async () => {
  const oversized = pdfFixture(Array(20).fill('text '.repeat(10_000)), 1_000_000);
  const [source] = await acquireSources(state(), [candidate('text')], {read: async url => ({url, data: oversized, mediaType: 'application/pdf'})});
  assert.equal(source.acquisition.status, 'unavailable'); assert.match(source.acquisition.rejections[0].reason, /800,000/);
});

test('owner cancellation rejects a running PDF parser after cleanup', {timeout: 2_000}, async () => {
  const controller = new AbortController(), data = pdfFixture(Array(80).fill('A bounded PDF source passage. '.repeat(50)));
  const pending = acquireSources(state(), [candidate('A bounded PDF source passage.')], {signal: controller.signal, read: async url => ({url, data, mediaType: 'application/pdf'})});
  setTimeout(() => controller.abort(Error('Owner cancelled running PDF parser')), 1);
  await assert.rejects(pending, /Owner cancelled running PDF/);
});

test('cancelled candidate batches wait for every already started source reader to finish cleanup', async () => {
  const controller = new AbortController(), first = Promise.withResolvers(), second = Promise.withResolvers();
  const candidates = [candidate('First quote.', '', 'https://first.example/article'), candidate('Second quote.', '', 'https://second.example/article')];
  let settled = false;
  const pending = acquireSources(state(), candidates, {signal: controller.signal, read: url => url.includes('first') ? first.promise : second.promise});
  const observed = pending.then(() => {settled = true;}, () => {settled = true;});
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(Error('Owner cancelled source batch')); first.reject(controller.signal.reason);
  await new Promise(resolve => setImmediate(resolve));
  const beforeCleanup = settled;
  second.reject(controller.signal.reason); await observed;
  assert.equal(beforeCleanup, false, 'Cancellation must drain every started source reader');
  await assert.rejects(pending, /Owner cancelled source batch/);
});
