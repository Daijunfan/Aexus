#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const run = promisify(execFile)
const CLI = join(import.meta.dirname, '../bin/agents')
const CODEX_MODEL = 'gpt-5.6-luna'
let passed = 0
const ok = (condition, message) => { assert.ok(condition, message); console.log(`PASS  ${message}`); passed++ }
async function call(...args) {
  const { stdout } = await run(process.execPath, [CLI, ...args, '--json'], { timeout: 25_000, maxBuffer: 8 << 20 })
  const result = JSON.parse(stdout)
  assert.ok(result.ok, result.error)
  return result.data
}
async function until(check, label, timeout = 90_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Timed out: ${label}`)
}
function follow(id) {
  const child = spawn(process.execPath, [CLI, 'session', 'follow', id, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d) => { output += d })
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('follow did not exit')) }, 90_000)
    child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error(`follow exited ${code}`)) })
  })
}
async function send(id, text) {
  const before = await call('session', 'info', id)
  // This guard precedes EVERY inference-bearing Codex call. No fallback model.
  if (before.engine === 'codex') {
    assert.equal(before.model, CODEX_MODEL)
    assert.equal(before.effort, 'low')
  }
  await call('session', 'send', id, text)
  ok((await call('session', 'info', id)).busy, `${before.engine}: busy immediately after send`)
  await follow(id)
  const snapshot = await call('session', 'snapshot', id)
  assert.equal(snapshot.busy, false)
  assert.ok(!snapshot.error, snapshot.error)
  const failures = snapshot.items.filter((i) => i.role === 'notice' && i.tone === 'error')
  assert.equal(failures.length, 0, JSON.stringify(failures))
  return snapshot
}
function assistantText(snapshot) {
  return snapshot.items.filter((i) => i.role === 'assistant').flatMap((i) => i.blocks).filter((b) => b.kind === 'text').map((b) => b.text).join('\n')
}
async function main() {
  assert.ok(process.env.AGENTS_COMPANY_HOME?.includes('agents-company-test-'), 'Run via test:headless to protect real data')
  const status = await call('status')
  ok(status.running, 'pure Node service runs without Electron or windows')
  ok(status.home.startsWith(process.env.AGENTS_COMPANY_HOME), 'test application state is isolated')
  for (const group of ['Engineering', 'Design']) { const root=join(process.env.AGENTS_COMPANY_TEST_PROJECTS,group);mkdirSync(root);await call('group','add',group,'--root',root) }
  ok((await call('group', 'list')).includes('Design'), 'create departments')
  await call('room', 'place', 'Engineering', '--col', '2', '--row', '1', '--w', '2')
  ok((await call('session', 'list')).rooms.Engineering.w === 2, 'CLI room placement persists')
  for (const engine of (process.env.AGENTS_COMPANY_TEST_ENGINES || 'codex,claude').split(',')) {
    console.log(`\n-- ${engine} --`)
    const created = await call('session', 'new', '--engine', engine, '--title', `${engine} tester`, '--group', 'Engineering', '--model', engine === 'codex' ? CODEX_MODEL : 'haiku', '--effort', 'low', '--permission', 'acceptEdits')
    const cardId = created.sessionId
    let id = cardId
    await until(async () => (await call('session', 'info', id)).models.length > 0, `${engine} initialization`)
    let info = await call('session', 'info', id)
    ok(info.engine === engine && info.effort === 'low', `${engine}: initial CLI model and effort applied`)
    ok((await call('session', 'open', id)).sessionId === id, `${engine}: opening a live card reuses its session`)
    await assert.rejects(()=>call('card', 'rename', id, `${engine} renamed`))
    await call('card', 'move', cardId, 'Design')
    let store = await call('session', 'list')
    ok(store.sessions.find((s) => s.id === id).group === 'Design', `${engine}: CLI card move reaches correct card`)
    ok((await call('session', 'search', 'tester')).some((s) => s.id === id), `${engine}: search finds employee by its immutable name`)
    await call('card', 'move', cardId, 'Engineering')
    id=(await call('session','open',cardId)).sessionId
    await until(async ()=>(await call('session','info',id)).models.length>0,'reopen after transfer')
    info=await call('session','info',id)
    if (engine === 'claude') {
      const commands = await call('commands', 'list', id)
      ok(commands.length > 0, 'claude: slash commands discovered')
      ok((await call('commands', 'complete', id, commands[0].name)).completion.startsWith('/'), 'claude: command completion')
      await call('config', 'thinking', id, 'off')
      ok(!(await call('session', 'info', id)).thinking, 'claude: thinking setting round-trips')
    } else ok(!(await call('config', 'thinking', id, 'on')).ok, 'codex: unsupported thinking toggle explicitly refused')
    const token = `${engine}-memory-7391`
    const file = `${engine}-proof.txt`
    writeFileSync(join(info.cwd, `${engine}-input.txt`), token)
    let snapshot = await send(id, `Use your file tools to read ${engine}-input.txt in the current workspace and create ${file} containing the same text. Reply with that text. Do not launch apps, browse, use subagents, or do anything else.`)
    ok(readFileSync(join(info.cwd, file), 'utf8').trim() === token, `${engine}: real file read and write succeeded`)
    ok(assistantText(snapshot).includes(token), `${engine}: real assistant response recorded`)
    ok(snapshot.items.some((i) => i.role === 'assistant' && i.blocks.some((b) => b.kind === 'tool')), `${engine}: tool events rendered in transcript`)
    store = await call('session', 'list')
    const saved = store.sessions.find((s) => s.id === cardId)
    ok(!!(engine === 'codex' ? saved.threadId : saved.claudeSessionId), `${engine}: engine resume ID persisted with no frontend`)
    ok(saved.model === (engine === 'codex' ? CODEX_MODEL : 'haiku') && saved.effort === 'low', `${engine}: settings persist on card`)
    await call('session', 'close', id)
    ok(!(await call('session', 'list', '--live')).some((s) => s.id === id), `${engine}: close removes live process`)
    id = (await call('session', 'open', cardId)).sessionId
    await until(async () => (await call('session', 'info', id)).models.length > 0, 'resume metadata')
    snapshot = await call('session', 'snapshot', id)
    ok(assistantText(snapshot).includes(token), `${engine}: transcript restored after close/open`)
    snapshot = await send(id, 'Without using any tools, repeat the exact text you read and wrote in our previous turn. Reply with that text only.')
    const last = snapshot.items.filter((i) => i.role === 'assistant').at(-1)
    ok(last.blocks.some((b) => b.kind === 'text' && b.text.includes(token)), `${engine}: resumed engine remembers earlier turn`)
    ok(snapshot.items.filter((i) => i.role === 'user').length === 2, `${engine}: no duplicate user messages`)
    await call('session', 'interrupt', id)
    ok(!(await call('session', 'info', id)).busy, `${engine}: idle interruption is safe`)
    await follow(id)
    ok(true, `${engine}: following completed turn exits immediately`)
    await call('session', 'close', id)
    await call('card', 'remove', cardId)
    ok(!(await call('session', 'list')).sessions.some((s) => s.id === cardId), `${engine}: remove card`)
  }
  await call('group', 'remove', 'Engineering')
  ok(!(await call('session', 'list')).rooms.Engineering, 'department removal clears room layout')
  console.log(`\nPASS=${passed} FAIL=0`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
