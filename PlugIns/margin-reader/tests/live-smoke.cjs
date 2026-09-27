'use strict';
// Explicit network test; not part of npm test. Downloads are temporary and never committed.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createPlugin } = require('../runtime.cjs');
const { download } = require('../lib/network.cjs');
async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'margin-reader-live-'));
  const runtime = await createPlugin({ workspace }), results = [];
  const api = async (method, params = {}) => {
    const reply = await runtime.request({ jsonrpc: '2.0', id: 1, method, params });
    assert(!reply.error, JSON.stringify(reply.error)); return reply.result;
  };
  const pass = data => { results.push(data); console.log('PASS ' + JSON.stringify(data)); };
  try {
    const article = await api('web.import', { url: 'https://example.com' });
    const saved = await fs.readFile(path.join(workspace, article.path), 'utf8');
    assert.match(saved, /Example Domain/); assert.match(saved, /Content-Security-Policy/);
    assert.match((await api('document.content', { id: article.id })).text, /Example Domain/);
    pass({ test: 'public webpage becomes self-contained offline HTML', path: article.path });
    for (const [format, url] of [['mobi', 'https://www.gutenberg.org/ebooks/11.kindle.images'], ['azw3', 'https://www.gutenberg.org/ebooks/11.kf8.images']]) {
      const downloaded = await download(url); const filename = 'public-domain-test.' + format;
      await fs.writeFile(path.join(workspace, filename), downloaded.bytes);
      const doc = await api('document.open', { path: filename });
      const search = await api('document.search', { id: doc.id, query: 'Alice' });
      assert(doc.sectionCount > 1 && doc.toc.length > 1 && search.matches.length > 0);
      for (const chapter of doc.toc) await api('reader.position.set', { id: doc.id, locator: chapter.locator });
      pass({ test: format + ' real public-domain book', bytes: downloaded.bytes.length, sections: doc.sectionCount, chapters: doc.toc.length, searchableMatches: search.matches.length, allChapterTargetsValid: true, warnings: doc.warnings });
    }
    console.log(`LIVE PASS=${results.length} FAIL=0`);
  } finally {
    await fs.mkdir(path.resolve(__dirname, '../artifacts'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, '../artifacts/live-test-results.json'), JSON.stringify(results, null, 2));
    await runtime.close(); await fs.rm(workspace, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
