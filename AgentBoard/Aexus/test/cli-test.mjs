#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const run = promisify(execFile)
const CLI = join(import.meta.dirname, '../bin/agents')
const CODEX_MODEL = 'gpt-6-luna'
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
// Creating an employee runs private initialization (src/main/initialization.ts)
// and every inference-bearing call is refused with EMPLOYEE_INITIALIZING until
// it finishes (src/main/initialization-state.ts assertEmployeeReady). Wait for
// the lifecycle state the Core publishes; a populated model catalogue is not it.
async function ready(id) {
  await until(async () => {
    const [status] = await call('session', 'status', '--employee', id)
    if (status?.initialization?.status === 'failed') throw new Error(`${id} initialization failed: ${status.initialization.error ?? 'unknown'}`)
    return status?.initialization?.status === 'ready'
  }, `${id} initialization`)
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
  // Two distinct creation contracts. A managed Team's folder is derived from
  // the Team name (src/shared/directory-names.ts directoryName(name,'team'),
  // so 'Engineering' becomes 'engineering') and created for you; a bound Team
  // reuses a folder that already exists. Both are asserted separately.
  await call('group', 'add', 'Engineering')
  const boundRoots = await call('group', 'list', '--details')
  ok(boundRoots.find((group) => group.name === 'Engineering').root === realpathSync(join(process.env.AGENTS_COMPANY_TEST_PROJECTS, 'engineering')), 'a managed department creates its name-derived folder')
  const designRoot = join(process.env.AGENTS_COMPANY_TEST_PROJECTS, 'existing-design');mkdirSync(designRoot)
  await call('group', 'add', 'Design', '--directory-mode', 'bind', '--root', designRoot)
  ok((await call('group', 'list', '--details')).find((group) => group.name === 'Design').root === realpathSync(designRoot), 'a bound department keeps its pre-existing folder')
  ok((await call('group', 'list')).includes('Design'), 'create departments')
  await call('room', 'place', 'Engineering', '--col', '2', '--row', '1', '--w', '2')
  ok((await call('session', 'list')).rooms.Engineering.w === 2, 'CLI room placement persists')
  // run-headless supplies an isolated deterministic native protocol fixture.
  const engines = (process.env.AGENTS_COMPANY_TEST_ENGINES ?? 'codex').split(',').map((name) => name.trim()).filter(Boolean)
  const authorised = engines.filter((engine) => engine !== 'off')
  if (!authorised.length) console.log(`\nSKIP real-inference section: no engine authorised for this run (AGENTS_COMPANY_TEST_ENGINES=${process.env.AGENTS_COMPANY_TEST_ENGINES ?? ''}). Employee engines, resume IDs and transcript assertions below are UNTESTED here.`)
  for (const engine of authorised) {
    console.log(`\n-- ${engine} --`)
    const created = await call('session', 'new', '--engine', engine, '--title', `${engine} tester`, '--group', 'Engineering', '--model', engine === 'codex' ? CODEX_MODEL : 'haiku', '--effort', 'low', '--permission', 'acceptEdits')
    const cardId = created.sessionId
    let id = cardId
    await until(async () => (await call('session', 'info', id)).models.length > 0, `${engine} model catalogue`)
    await ready(id)
    let info = await call('session', 'info', id)
    ok(info.engine === engine && info.effort === 'low', `${engine}: initial CLI model and effort applied`)
    ok((await call('session', 'open', id)).sessionId === id, `${engine}: opening a live card reuses its session`)
    // An employee's Team and working folder are fixed after creation
    // (src/main/store.ts updateEmployee, moveEmployee), while its display name
    // stays editable and must never rename the folder — the same rule the UI
    // states. Assert both halves instead of an immutable-name rule that is gone.
    const folder = (await call('session', 'info', id)).cwd
    await call('card', 'rename', id, `${engine} renamed`)
    await assert.rejects(() => call('card', 'move', cardId, 'Design'))
    let store = await call('session', 'list')
    ok(store.sessions.find((s) => s.id === id).group === 'Engineering', `${engine}: an employee cannot change Team after creation`)
    ok(store.sessions.find((s) => s.id === id).title === `${engine} renamed` && (await call('session', 'info', id)).cwd === folder, `${engine}: renaming an employee never renames its working folder`)
    ok((await call('session', 'search', 'renamed')).some((s) => s.id === id), `${engine}: search finds employee by its current name`)
    await call('card', 'move', cardId, 'Engineering')
    store = await call('session', 'list')
    ok(store.sessions.find((s) => s.id === cardId).group === 'Engineering', `${engine}: CLI card move reaches correct card`)
    id=(await call('session','open',cardId)).sessionId
    await ready(cardId)
    info=await call('session','info',id)
    if (engine === 'claude') {
      const commands = await call('commands', 'list', id)
      ok(commands.length > 0, 'claude: slash commands discovered')
      ok((await call('commands', 'complete', id, commands[0].name)).completion.startsWith('/'), 'claude: command completion')
      await call('config', 'thinking', id, 'off')
      ok(!(await call('session', 'info', id)).thinking, 'claude: thinking setting round-trips')
    } else {await assert.rejects(()=>call('config', 'thinking', id, 'on'));ok(true,'codex: unsupported thinking toggle explicitly refused')}
    const token = `${engine}-memory-7391`
    const file = `${engine}-proof.txt`
    writeFileSync(join(info.cwd, `${engine}-input.txt`), token)
    let snapshot = await send(id, `Use your file tools to read ${engine}-input.txt in the current workspace and create ${file} containing the same text. Reply with that text. Do not launch apps, browse, use subagents, or do anything else.`)
    ok(readFileSync(join(info.cwd, file), 'utf8').trim() === token, `${engine}: deterministic native file read and write succeeded`)
    ok(assistantText(snapshot).includes(token), `${engine}: deterministic native response recorded`)
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
