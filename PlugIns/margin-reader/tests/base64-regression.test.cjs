'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { decodeBase64, cleanName, LIMITS } = require('../lib/safety.cjs');

test('full-size upload chunks do not overflow the regexp stack', () => {
  const sample = randomBytes(LIMITS.chunk);
  for (const size of [0, 1, 2, 3, 256 * 1024, LIMITS.chunk - 2, LIMITS.chunk - 1, LIMITS.chunk]) {
    const bytes = sample.subarray(0, size);
    assert.deepEqual(decodeBase64(bytes.toString('base64')), bytes);
  }
});

test('base64 decoding rejects invalid padding, alphabet, whitespace and oversized chunks', () => {
  for (const value of ['a', 'ab', 'aaa', 'AAAA\n', 'AAAA ', '_w==', '/x==', 'Zh==', 'Zm9=', 'AA=A', 'AA==AAAA', '====', null, {}, 12]) {
    assert.throws(() => decodeBase64(value), error => error.code === 'INVALID_PARAMS');
  }
  assert.throws(() => decodeBase64(Buffer.alloc(LIMITS.chunk + 1).toString('base64')), error => error.code === 'INVALID_PARAMS');
});

test('long Chinese article titles leave room for extension and duplicate suffix', () => {
  for (const title of ['中文博客标题'.repeat(100), '📚'.repeat(100), 'x'.repeat(300)]) {
    const name = cleanName(title);
    assert(Buffer.byteLength(name) <= 200);
    assert(Buffer.byteLength(name + ' (10000).html') < 255);
    assert(!name.includes('\ufffd'));
  }
  assert.equal(cleanName('Normal article'), 'Normal article');
});
