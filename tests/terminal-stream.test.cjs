const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
const {WebSocket} = require('ws');
const {attach} = require('../src/terminal-stream.cjs');

test('terminal stream preserves input order and verifies the terminal owner', async () => {
  const inputs = [];
  const server = http.createServer();
  const dispatch = async (method, params, signal) => {
    if (params.id !== 'owner' || params.terminal !== 'terminal') throw Error('Wrong owner');
    if (method === 'hosts.terminal-input') {
      await new Promise(resolve => setTimeout(resolve, params.data === 'a' ? 20 : 0));
      inputs.push(params.data); return true;
    }
    if (!params.waitMs) return {cursor: 0, running: true, output: ''};
    await new Promise(resolve => signal.addEventListener('abort', resolve, {once: true}));
    return {cursor: 0, running: true, output: ''};
  };
  const wss = attach(server, '/token/', dispatch);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `ws://127.0.0.1:${server.address().port}`;
  const valid = new WebSocket(base + '/token/terminal-stream?host=owner&terminal=terminal');
  try {
    await once(valid, 'open');
    for (const data of ['a', 'b', '中', 'c']) valid.send(JSON.stringify({op: 'input', data}));
    const closed = once(valid, 'close'); valid.close(); await closed;
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.deepEqual(inputs, ['a', 'b', '中', 'c']);
    for (const [url, options] of [
      ['/token/terminal-stream?host=other&terminal=terminal', {}],
      ['/wrong/terminal-stream?host=owner&terminal=terminal', {}],
      ['/token/terminal-stream?host=owner&terminal=terminal', {origin: 'https://example.invalid'}]
    ]) {
      const rejected = new WebSocket(base + url, options);
      const error = await new Promise(resolve => rejected.once('error', resolve));
      assert.match(error.message, /hang up|closed|Unexpected/);
    }
  } finally {
    if (valid.readyState !== WebSocket.CLOSED) {const closed = once(valid, 'close'); valid.close(); await closed;}
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
