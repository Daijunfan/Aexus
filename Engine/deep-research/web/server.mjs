#!/usr/bin/env node
/**
 * Simple HTTP server for Deep Research Web UI
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeClient } from '../../../Contract/node-client.mjs';
import { ENGINE_ID } from '../model.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const client = createNodeClient();

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendHTML(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { ok: false, error: message });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Serve index.html
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      sendHTML(res, html);
      return;
    }

    // API: Start research
    if (url.pathname === '/api/research/start' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { topic, scope = 'comprehensive' } = JSON.parse(body);

          if (!topic) {
            sendError(res, 400, 'Missing topic');
            return;
          }

          const result = await client.invoke('workflow.start', {
            engineId: ENGINE_ID,
            input: { topic, scope },
            clientRequestId: 'web-' + Date.now()
          });

          sendJSON(res, 200, { ok: true, data: result });
        } catch (error) {
          sendError(res, 500, error.message);
        }
      });
      return;
    }

    // API: Get research status
    if (url.pathname.startsWith('/api/research/') && req.method === 'GET') {
      const id = url.pathname.split('/').pop();

      if (!id) {
        sendError(res, 400, 'Missing research ID');
        return;
      }

      const result = await client.invoke('workflow.get', { id });
      sendJSON(res, 200, { ok: true, data: result });
      return;
    }

    // API: List research jobs
    if (url.pathname === '/api/research' && req.method === 'GET') {
      const result = await client.invoke('workflow.list', {
        engineId: ENGINE_ID
      });
      sendJSON(res, 200, { ok: true, data: result });
      return;
    }

    // 404
    sendError(res, 404, 'Not found');

  } catch (error) {
    console.error('Request error:', error);
    sendError(res, 500, error.message);
  }
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔬 Deep Research Web UI                                 ║
║                                                            ║
║   Server running at: http://localhost:${PORT}               ║
║                                                            ║
║   Open your browser and start researching!                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGINT', () => {
  console.log('\n\n✓ Server stopped');
  process.exit(0);
});
