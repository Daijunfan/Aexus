import test from "node:test";
import assert from "node:assert/strict";
import {cacheSourceReader} from "../source-cache.mjs";
import {acquireSources} from "../../source-read.mjs";

test("same-run concurrent duplicate URL shares one fetch and original proof fields", async () => {
  const controller = new AbortController();
  let reads = 0;
  const read = async url => {
    reads++;
    await Promise.resolve();
    return {url, body: "原始正文", accessedAt: 1234, sha256: "original-hash", finalUrl: url + "?redirected"};
  };
  const cached = cacheSourceReader(read);
  const options = {signal: controller.signal};
  const first = cached("https://evidence.example/study", options);
  const second = cached("https://evidence.example/study", options);
  assert.strictEqual(first, second);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.strictEqual(a, b);
  assert.deepEqual(await cached("https://evidence.example/study", options), a);
  assert.equal(reads, 1);
  assert.equal(a.accessedAt, 1234);
  assert.equal(a.sha256, "original-hash");
});

test("different owner cancellation signals never share an in-flight request", async () => {
  const one = new AbortController(), two = new AbortController();
  let resolveFirst, resolveSecond, reads = 0;
  const cached = cacheSourceReader(async () => {
    reads++;
    return await new Promise(resolve => {
      if (reads === 1) resolveFirst = resolve;
      else resolveSecond = resolve;
    });
  });
  const first = cached("https://site.example/a", {signal: one.signal});
  await Promise.resolve(); await Promise.resolve();
  const second = cached("https://site.example/a", {signal: two.signal});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(reads, 2);
  one.abort(Error("owner one cancelled"));
  resolveFirst({body: "cancelled-body"});
  resolveSecond({body: "read by owner two", accessedAt: 2});
  await assert.rejects(first, /owner one cancelled/);
  assert.match((await second).body, /owner two/);
  assert.equal((await cached("https://site.example/a", {signal: two.signal})).body, "read by owner two");
});

test("failed and aborted acquisitions are not cached and may be retried", async () => {
  let reads = 0;
  const cached = cacheSourceReader(async () => {
    if (++reads === 1) throw Error("HTTP 403");
    return {body: "retry succeeded", accessedAt: 100};
  });
  await assert.rejects(cached("https://site.example/a"), /403/);
  assert.equal((await cached("https://site.example/a")).body, "retry succeeded");
  assert.equal(reads, 2);
  assert.equal((await cached("https://site.example/a")).body, "retry succeeded");
  assert.equal(reads, 2);
  const controller = new AbortController();
  controller.abort(Error("already stopped"));
  await assert.rejects(cached("https://site.example/a", {signal: controller.signal}), /already stopped/);
});

test("time expiry and size/entry budgets bound per-run memory and freshness", async () => {
  let now = 1000, reads = 0;
  const cached = cacheSourceReader(async url => ({body: url.slice(-2), accessedAt: ++reads}),
    {now: () => now, ttlMs: 100, maxEntries: 2, maxBytes: 4});
  await cached("https://e.example/a1");
  await cached("https://e.example/a2");
  await cached("https://e.example/a1"); // LRU refresh
  await cached("https://e.example/a3"); // evicts a2
  assert.equal(reads, 3);
  await cached("https://e.example/a1");
  assert.equal(reads, 3);
  await cached("https://e.example/a2");
  assert.equal(reads, 4);
  now = 1200;
  await cached("https://e.example/a2");
  assert.equal(reads, 5, "expired documents are fetched again");
  const tiny = cacheSourceReader(async () => ({body: "0123456789"}), {maxBytes: 5});
  let responses = 0;
  const noSpace = cacheSourceReader(async () => ({body: String(++responses).repeat(10)}), {maxBytes: 5});
  await noSpace("https://e.example/large");
  await noSpace("https://e.example/large");
  assert.equal(responses, 2, "content larger than cache byte budget cannot be cached");
  assert.equal((await tiny("https://e.example/large")).body.length, 10);
  let fullReads = 0;
  const dual = cacheSourceReader(async () => {
    fullReads++;
    return {data: Buffer.from("abc"), body: "abc"};
  }, {maxBytes: 5});
  await dual("https://e.example/dual");
  await dual("https://e.example/dual");
  assert.equal(fullReads, 2, "raw bytes and decoded text both count toward memory limits");
});


test("independent acquisition reuses cached raw body while preserving real excerpt hashes and final URL", async () => {
  let fetches = 0;
  const controller = new AbortController();
  const candidate = {
    id: "doc-1", url: "https://evidence.example/research", title: "Research",
    acquisition: {excerpt: "Verified first excerpt.", locator: "Line 999"},
  };
  const read = cacheSourceReader(async url => {
    fetches++;
    const body = "Verified first excerpt. Verified second excerpt.";
    return {url, mediaType: "text/plain", body, data: Buffer.from(body),
      accessedAt: 1_731_234_567_890};
  });
  const options = {signal: controller.signal, read};
  const [a] = await acquireSources({sources: []}, [candidate], options);
  const [b] = await acquireSources({sources: []}, [{
    ...candidate, acquisition: {excerpt: "Verified second excerpt.", locator: "Source claim"},
  }], options);
  assert.equal(fetches, 1, "two actual acquisition batches share a single fetched representation");
  assert.equal(a.acquisition.method, "independent-http");
  assert.equal(b.acquisition.method, "independent-http");
  assert.equal(a.acquisition.excerpts[0].finalUrl, candidate.url);
  assert.equal(b.acquisition.excerpts[0].finalUrl, candidate.url);
  assert.equal(a.acquisition.excerpts[0].accessedAt, 1_731_234_567_890);
  assert.match(a.acquisition.excerpts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(a.acquisition.excerpts[0].sha256, b.acquisition.excerpts[0].sha256);
});

test("representation-specific options bypass cache, and disabled cache does not hold response bodies", async () => {
  let reads = 0;
  const cached = cacheSourceReader(async (url, options) => ({body: String(++reads), scope: options.scope}),
    {ttlMs: 0});
  assert.equal((await cached("https://e.example/item")).body, "1");
  assert.equal((await cached("https://e.example/item")).body, "2");
  assert.equal((await cached("https://e.example/item", {scope: "A"})).body, "3");
  assert.equal((await cached("https://e.example/item", {scope: "B"})).body, "4");
  assert.throws(() => cacheSourceReader(null), /function/);
  assert.throws(() => cacheSourceReader(async () => {}, {maxEntries: -1}), /nonnegative/);
});
