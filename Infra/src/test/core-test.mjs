#!/usr/bin/env node
// Protocol failures and cancellation without paid model calls.
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const temp = mkdtempSync(join(tmpdir(), 'agents-company-core-'))
let checks = 0
const ok = (test, label) => { assert.ok(test, label); checks++; console.log(`PASS  ${label}`) }
try {
  const binary = join(temp, 'codex')
  writeFileSync(binary, `#!/usr/bin/env node
const fs = require('node:fs'); let text = '';
process.stdin.on('data', d => text += d);
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(join(temp, 'args.json'))}, JSON.stringify(process.argv.slice(2)));
  if (text === 'fail') { process.stderr.write('credentials unavailable'); process.exit(9); }
  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: 'test-thread' }) + '\\n');
  if (text === 'hold') { setInterval(() => {}, 1000); return; }
  process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'okay' } }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
});
`, { mode: 0o755 })
  process.env.CODEX_BIN = binary
  await build({ entryPoints: ['Infra/src/main/codex.ts', 'Infra/src/main/approvals.ts'], outdir: temp, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' })
  const { runCodexTurn, mapEvent } = require(join(temp, 'codex.js'))
  const events = []
  const base = { cwd: temp, model: 'gpt-5.6-luna', effort: 'low', sandbox: 'read-only', signal: new AbortController().signal, onEvent: (e) => events.push(e) }
  await runCodexTurn({ ...base, prompt: 'fail' })
  ok(events.some((e) => e.kind === 'notice' && e.text.includes('credentials unavailable')), 'nonzero Codex exit exposes stderr instead of silent success')
  events.length = 0
  await runCodexTurn({ ...base, prompt: 'resume', resumeId: 'stored-thread' })
  const args = JSON.parse(readFileSync(join(temp, 'args.json'), 'utf8'))
  ok(args.slice(-3).join(' ') === 'resume stored-thread -', 'resumed Codex prompts explicitly use stdin')
  ok(args.includes('gpt-5.6-luna') && args.includes('model_reasoning_effort="low"'), 'Codex process receives exact model and effort')
  ok(events.some((e) => e.kind === 'text' && e.text === 'okay'), 'JSONL assistant items become transcript events')
  const controller = new AbortController()
  events.length = 0
  await runCodexTurn({ ...base, prompt: 'hold', signal: controller.signal, onEvent: (e) => { events.push(e); if (e.kind === 'thread') controller.abort() } })
  ok(!events.some((e) => e.kind === 'notice'), 'cancelled Codex child exits without a spurious error')
  ok(mapEvent({ type: 'turn.failed', error: { message: 'limit exceeded' } })[0].text === 'limit exceeded', 'failed-turn protocol events are visible')
  ok(mapEvent({ type: 'item.completed', item: { type: 'file_change', id: 'f', changes: [{ kind: 'add', path: 'a.txt' }], status: 'completed' } })[0].name === 'file_change', 'Codex file changes are represented as tool results')
  const { approvalHandler, approvalsFor, answerApproval, cancelApprovals } = require(join(temp, 'approvals.js'))
  let notifications = 0
  const handler = approvalHandler('session', () => notifications++)
  const control = { signal: new AbortController().signal, toolUseID: 'tool', requestId: 'req' }
  const result = handler('Write', { file_path: 'test.txt' }, control)
  const pending = approvalsFor('session')
  ok(pending.length === 1 && pending[0].tool === 'Write', 'Claude permission request becomes API-visible data')
  assert.throws(() => answerApproval('wrong-session', pending[0].id, true))
  ok(true, 'permission responses are scoped to the correct session')
  answerApproval('session', pending[0].id, true)
  ok((await result).behavior === 'allow' && approvalsFor('session').length === 0, 'allow responds once and removes pending request')
  const denied = handler('Bash', { command: 'test' }, { ...control, toolUseID: 'tool2' })
  cancelApprovals('session')
  ok((await denied).behavior === 'deny', 'session cancellation denies pending permission')
  const abort = new AbortController()
  const cancelled = handler('Bash', {}, { ...control, toolUseID: 'tool3', signal: abort.signal })
  abort.abort()
  ok((await cancelled).behavior === 'deny' && approvalsFor('session').length === 0, 'engine abort clears the permission UI')
  ok(notifications === 6, 'permission changes notify both frontends')
  console.log(`PASS=${checks} FAIL=0`)
} finally { rmSync(temp, { recursive: true, force: true }) }
