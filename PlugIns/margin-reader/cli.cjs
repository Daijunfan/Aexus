#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { createPlugin } = require('./runtime.cjs');
const { ReaderError, assert, errorResponse } = require('./lib/safety.cjs');
const schema = require('./schema.json');
const HELP = `Margin Reader — CLI-first document reader\n\n  margin-reader --workspace DIR api METHOD --data JSON|@file|- [--text]\n  margin-reader --workspace DIR import FILE --to relative/file.pdf\n  margin-reader --workspace DIR open relative/file.pdf\n  margin-reader --workspace DIR list [FOLDER]\n  margin-reader --workspace DIR tree [FOLDER]\n  margin-reader --workspace DIR mkdir FOLDER\n  margin-reader --workspace DIR url https://example.com/article --folder FOLDER\n  margin-reader --workspace DIR search DOCUMENT_ID QUERY\n  margin-reader --workspace DIR read DOCUMENT_ID --page 1 --text\n  margin-reader --workspace DIR serve [--port 0]\n  margin-reader schema [METHOD]\n  margin-reader help METHOD\n\nAll business commands, including outline editing and file operations, are\navailable through api METHOD. Run schema or read API.md for parameters.\nJSON-RPC responses go to stdout. Errors return a nonzero exit code.\nThe original input file is never moved by import.\n`;
async function createClient(workspace, options) {
  const mailbox = process.env.AGENTS_COMPANY_PLUGIN_RPC;
  if (mailbox) return require('./lib/mailbox.cjs').mailboxClient(workspace, mailbox, options);
  assert(!process.env.AGENTS_COMPANY_EMPLOYEE, 'HOST_UNAVAILABLE', 'An employee must use its assigned plugin mailbox. Reopen the employee; standalone fallback is disabled.');
  return createPlugin({ workspace, pluginRoot: __dirname, executable: process.execPath });
}
function describeCommand(name) {
  const command = schema.commands.find(item => item.method === name);
  assert(command, 'METHOD_NOT_FOUND', `Unknown API method: ${name}. Run schema to list all commands.`);
  return { pluginId: schema.pluginId, version: schema.version, transport: schema.transport, ...command };
}
async function main() {
  const { values: options, positionals } = parseArgs({ options: { workspace: { type: 'string' }, data: { type: 'string' }, to: { type: 'string' }, folder: { type: 'string' }, page: { type: 'string' }, section: { type: 'string' }, port: { type: 'string' }, password: { type: 'string' }, text: { type: 'boolean' }, help: { type: 'boolean' }, json: { type: 'boolean' } }, allowPositionals: true, strict: true });
  const [command, ...rest] = positionals;
  if ((command === 'help' || command === 'schema') && rest.length) {
    assert(rest.length === 1, 'INVALID_PARAMS', 'Usage: help METHOD or schema METHOD');
    process.stdout.write(JSON.stringify(describeCommand(rest[0]), null, 2) + '\n'); return;
  }
  if (options.help || !command || command === 'help') { process.stdout.write(HELP); return; }
  if (command === 'schema') { process.stdout.write(JSON.stringify(schema, null, 2) + '\n'); return; }
  const workspaceInput = options.workspace || process.env.AGENTS_WORKSPACE;
  assert(workspaceInput, 'INVALID_WORKSPACE', '--workspace DIR is required, or use AGENTS_WORKSPACE.');
  if (process.env.AGENTS_WORKSPACE) assert(path.resolve(workspaceInput) === path.resolve(process.env.AGENTS_WORKSPACE), 'SCOPE_DENIED', 'Cannot override the assigned AGENTS_WORKSPACE.');
  const workspace = process.env.AGENTS_COMPANY_PLUGIN_RPC ? path.resolve(workspaceInput) : await fs.realpath(workspaceInput);
  if (command === 'serve') {
    assert(!process.env.AGENTS_COMPANY_PLUGIN_RPC && !process.env.AGENTS_COMPANY_EMPLOYEE, 'SCOPE_DENIED', 'A sandboxed employee must use its assigned mailbox, not start another transport.');
    const server = await require('./lib/server.cjs').startServer({ workspace, port: Number(options.port || 0) });
    process.stdout.write(JSON.stringify({ url: server.url, workspace }) + '\n');
    const stop = async () => { await server.close(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop); return;
  }
  const client = await createClient(workspace);
  const rpc = async (method, params = {}) => client.request({ jsonrpc: '2.0', id: randomUUID(), method, params });
  const must = async (method, params) => { const reply = await rpc(method, params); if (reply.error) { const error = new ReaderError(reply.error.data?.code || 'RPC_ERROR', reply.error.message, reply.error.data?.details); throw error; } return reply.result; };
  try {
    let reply;
    if (command === 'import') {
      assert(rest.length === 1 && options.to, 'INVALID_PARAMS', 'Usage: import FILE --to workspace/filename');
      const handle = await fs.open(path.resolve(rest[0]), 'r'); let upload;
      try {
        const st = await handle.stat(); assert(st.isFile(), 'INVALID_FILE', 'Import source must be a regular file.');
        upload = await must('import.begin', { path: options.to, totalBytes: st.size });
        const hash = createHash('sha256'); const buffer = Buffer.alloc(upload.chunkSize); let offset = 0;
        for (;;) {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset); if (!bytesRead) break;
          const bytes = buffer.subarray(0, bytesRead); hash.update(bytes);
          await must('import.chunk', { uploadId: upload.uploadId, offset, contentBase64: bytes.toString('base64') }); offset += bytesRead;
        }
        reply = await rpc('import.finish', { uploadId: upload.uploadId, sha256: hash.digest('hex'), ...(options.password ? { password: options.password } : {}) });
      } catch (e) { if (upload) await rpc('import.abort', { uploadId: upload.uploadId }).catch(() => {}); throw e; }
      finally { await handle.close(); }
    } else if (command === 'api') {
      assert(rest.length === 1, 'INVALID_PARAMS', 'Usage: api METHOD --data JSON|@file|-');
      let raw = options.data || '{}';
      if (raw === '-') raw = fsSync.readFileSync(0, 'utf8'); else if (raw.startsWith('@')) raw = await fs.readFile(raw.slice(1), 'utf8');
      let params; try { params = JSON.parse(raw); } catch { throw new ReaderError('INVALID_PARAMS', '--data must contain valid JSON.'); }
      reply = await rpc(rest[0], params);
    } else {
      const aliases = {
        link: ['link.open', { uri: rest[0] }],
        open: ['document.open', { path: rest[0], ...(options.password ? { password: options.password } : {}) }],
        list: ['fs.list', { path: rest[0] || '.' }], tree: ['fs.tree', { path: rest[0] || '.' }], mkdir: ['fs.mkdir', { path: rest[0] }],
        url: ['web.import', { url: rest[0], folder: options.folder || '.' }],
        search: ['document.search', { id: rest[0], query: rest.slice(1).join(' ') }],
        read: ['document.content', { id: rest[0], ...(options.page ? { page: Number(options.page) } : {}), ...(options.section ? { section: Number(options.section) } : {}) }]
      };
      assert(Object.hasOwn(aliases, command), 'INVALID_PARAMS', `Unknown command: ${command}. Run help for usage.`);
      reply = await rpc(...aliases[command]);
    }
    process.stdout.write(options.text && !reply.error && typeof reply.result?.text === 'string' ? reply.result.text + '\n' : JSON.stringify(reply) + '\n');
    if (reply.error) process.exitCode = 1;
  } finally { await client.close(); }
}
if (require.main === module) main().catch(error => { process.stdout.write(JSON.stringify(errorResponse(null, error)) + '\n'); process.exitCode = 1; });
module.exports = { createClient, describeCommand, main };
