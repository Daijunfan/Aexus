'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createPlugin } = require('../runtime.cjs');
const { assert, safePath, readBounded } = require('./safety.cjs');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.bcmap': 'application/octet-stream' };
async function startServer({ workspace, port = 0, pluginRoot = path.resolve(__dirname, '..') }) {
  assert(Number.isInteger(port) && port >= 0 && port <= 65535, 'INVALID_PARAMS', 'Port must be between 0 and 65535.');
  const runtime = await createPlugin({ workspace, pluginRoot, executable: process.execPath });
  const token = randomUUID(), base = `/${token}/`, clients = new Set(), sockets = new Set();
  const uiRoot = path.join(pluginRoot, 'ui'); let url;
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      if (!requestUrl.pathname.startsWith(base)) { res.writeHead(404); res.end(); return; }
      const target = decodeURIComponent(requestUrl.pathname.slice(base.length));
      if (target === 'rpc' && req.method === 'POST') {
        assert(!req.headers.origin || req.headers.origin === new URL(url).origin, 'SCOPE_DENIED', 'Cross-origin RPC requests are rejected.');
        const chunks = []; let total = 0;
        for await (const chunk of req) { total += chunk.length; assert(total <= 64 * 1024 * 1024, 'TOO_LARGE', 'Request exceeds 64 MiB.'); chunks.push(chunk); }
        const request = JSON.parse(Buffer.concat(chunks).toString('utf8')); const reply = await runtime.request(request);
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(reply)); return;
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
      if (target === 'events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' }); res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
      }
      if (target.startsWith('data/')) {
        const asset = await runtime.readAsset(target.slice(5));
        res.writeHead(200, { 'content-type': asset.mimeType, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" }); res.end(Buffer.from(asset.bytes)); return;
      }
      const file = await safePath(uiRoot, target || 'index.html');
      const bytes = await readBounded(file, 64 * 1024 * 1024);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'" }); res.end(bytes);
    } catch (error) { if (!res.headersSent) res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${server.address().port}${base}index.html`;
  const unsubscribe = await runtime.subscribe(event => { for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`); });
  let closed = false;
  return { url, runtime, async close() {
    if (closed) return; closed = true; unsubscribe(); for (const client of clients) client.end(); for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve)); await runtime.close();
  } };
}
module.exports = { startServer };
