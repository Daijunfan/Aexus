import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StringDecoder } from 'node:string_decoder';
import { EventStreamDecoder } from '../src/backend/eventStream';

test('SSE frames survive every character boundary, CRLF, comments and multiple data lines', () => {
  const received: string[] = [], decoder = new EventStreamDecoder(value => received.push(value));
  const input = ': connected\r\nevent: state\r\nid: 1\r\ndata: {"title":\r\ndata: "文档🙂"}\r\n\r\ndata:{"next":true}\n\ndata\n\n';
  for (const character of input) decoder.push(character);
  assert.deepEqual(received, ['{"title":\n"文档🙂"}', '{"next":true}', '']);
  assert.deepEqual(JSON.parse(received[0]), { title: '文档🙂' });
});

test('SSE works with UTF-8 byte chunks and preserves an unfinished event until its delimiter', () => {
  const received: string[] = [], decoder = new EventStreamDecoder(value => received.push(value));
  const utf8 = new StringDecoder('utf8');
  for (const byte of Buffer.from('data: {"text":"中文🙂𠮷"}\n')) decoder.push(utf8.write(Buffer.from([byte])));
  decoder.push(utf8.end()); assert.equal(received.length, 0);
  decoder.push('\n'); assert.deepEqual(JSON.parse(received[0]), { text: '中文🙂𠮷' });
  decoder.push('data: unfinished'); assert.equal(received.length, 1);
});

test('a notebook-sized initial event is processed incrementally, without quadratic prefix scanning', () => {
  const received: string[] = [], decoder = new EventStreamDecoder(value => received.push(value));
  const data = JSON.stringify({ pages: '中🙂text'.repeat(2_000_000) }), wire = 'data: ' + data + '\n\ndata: {"revision":2}\n\n';
  const started = performance.now();
  for (let offset = 0; offset < wire.length; offset += 1024) decoder.push(wire.slice(offset, offset + 1024));
  assert.deepEqual(received, [data, '{"revision":2}']);
  assert.ok(performance.now() - started < 1500, 'framing a large notebook exceeded the 1.5 s regression budget');
});
