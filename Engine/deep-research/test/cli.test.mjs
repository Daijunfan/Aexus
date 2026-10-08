import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { main } from '../cli.mjs';

test('CLI downloads preserve UTF-8 report bytes instead of comparing character counts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aexus-research-download-'));
  const output = path.join(directory, 'report.html');
  const content = '<h1>中文研究报告</h1>\n<p>来源与证据已核验。</p>';
  const bytes = Buffer.byteLength(content);
  const client = { invoke: async command => {
    if (command === 'workflow.get') return { id: 'workflow', engineId: 'deep-research', status: 'completed', files: [{ name: 'research-report.html' }] };
    if (command === 'workflow.file') return { content, bytes, sha256: 'fixture-hash' };
    throw Error('Unexpected local download fixture call: ' + command);
  } };
  try {
    const result = await main(['download', '--id', 'workflow', '--output', output], client);
    assert.equal(result.bytes, bytes);
    assert.equal(await fs.readFile(output, 'utf8'), content);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
