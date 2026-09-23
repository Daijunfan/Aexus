#!/usr/bin/env node
import {nativeFixture} from './native-fixture.mjs'
// Exercise persistent socket/lifecycle behavior against a deterministic CLI fixture.
import { spawn, execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, renameSync, symlinkSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
const run = promisify(execFile)
const root = join(import.meta.dirname, '..')
const home = mkdtempSync(join(tmpdir(), 'agents-company-service-'))
const projects=mkdtempSync(join(tmpdir(),'agents-company-service-roots-'))
const fake = join(home, 'codex-fixture')
writeFileSync(fake, `#!/usr/bin/env node
let prompt = ''; process.stdin.on('data', d => prompt += d);
process.stdin.on('end', () => {
  const emit = e => process.stdout.write(JSON.stringify(e) + '\\n');
  emit({ type: 'thread.started', thread_id: 'fixture-thread' });
  emit({ type: 'turn.started' });
  if (prompt === 'hold') { setInterval(() => {}, 1000); return; }
  emit({ type: 'item.completed', item: { id: 'message', type: 'agent_message', text: 'Fixture reply: ' + prompt } });
  emit({ type: 'turn.completed' });
});
`, { mode: 0o755 })
const env = { ...process.env, AGENTS_COMPANY_HOME: home, AGENTS_COMPANY_PROJECTS: projects, AGENTS_COMPANY_CWD: join(home, 'workspace'), CODEX_BIN: nativeFixture(fake) }
const start = () => {
  const child = spawn(process.execPath, ['bin/agents', 'serve'], { cwd: root, env, stdio: 'ignore' })
  child.done = new Promise((r) => child.once('exit', r))
  return child
}
const stop = async (child) => { child.kill('SIGTERM'); await child.done }
async function cli(...args) {
  const { stdout } = await run(process.execPath, ['bin/agents', ...args, '--json'], { cwd: root, env, timeout: 7000 })
  const response = JSON.parse(stdout)
  assert.ok(response.ok, response.error)
  return response.data
}
async function follow(id) {
  const child = spawn(process.execPath, ['bin/agents', 'session', 'follow', id, '--json'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const done = new Promise((resolve, reject) => child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`follow exit ${code}`))))
  await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject) })
  return { done }
}
async function until(check) {
  for (let i = 0; i < 50; i++) {
    try { if (await check()) return } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Service check timed out')
}
let count = 0
const ok = (value, label) => { assert.ok(value, label); count++; console.log(`PASS  ${label}`) }
let service = start()
try {
  await until(async () => (await cli('status')).running)
  const duplicate = start()
  ok(await duplicate.done === 1, 'a second service refuses to take over the active socket')
  ok((await cli('status')).running, 'original service remains reachable after duplicate start')
  for(const name of ['Studio','Runtime']){const dir=join(projects,name);mkdirSync(dir);await cli('group','add',name,'--root',dir)}
  await assert.rejects(()=>cli('session','new','--engine','codex','--model','gpt-5.6-luna','--effort','low'))
  await assert.rejects(()=>cli('card','create','--title','Escape','--group','Runtime','--cwd',home))
  ok(true,'session and employee creation reject missing Team and application-owned directories')
  const employee = await cli('card', 'create', '--engine', 'codex', '--title', 'Editable colleague', '--avatar', 'rabbit', '--color', '#92b9df', '--role', 'Designer', '--group', 'Studio')
  ok(!(await cli('session', 'list', '--live')).length, 'creating employee stores a card without running an engine')
  await cli('room', 'design', 'Studio', '--theme', 'rose', '--wall', 'panels', '--desk', 'oak', '--plants', 'off')
  await assert.rejects(()=>cli('group', 'rename', 'Studio', 'Creative'))
  await cli('card', 'update', employee.id, '--avatar', 'fox', '--accessory', 'glasses', '--group', 'Studio')
  const edited = (await cli('session', 'list')).sessions.find(c => c.id === employee.id)
  ok(edited.avatar === 'fox' && edited.accessory === 'glasses' && edited.group === 'Studio', 'CLI edits independent appearance and team membership')
  ok(edited.orderIndex === undefined, 'saving appearance in the same team does not reorder employee')
  await assert.rejects(() => cli('card', 'create', '--title', 'Invalid avatar', '--avatar', 'invalid'))
  ok((await cli('session', 'list')).sessions.length === 1, 'invalid appearance cannot create a partial employee')
  const card = await cli('session', 'new', '--engine', 'codex', '--model', 'gpt-5.6-luna', '--effort', 'low', '--title', 'Persistent employee','--group','Runtime','--cwd','worker')
  let id = card.sessionId
  await cli('session', 'send', id, 'persist me')
  await (await follow(id)).done
  await cli('config', 'permission', id, 'acceptEdits')
  const first = await cli('session', 'snapshot', id)
  ok(first.items.some((i) => i.role === 'assistant'), 'fixture response goes through real socket and reducer')
  await cli('room','bounds','Runtime','--x','-900','--y','1200','--width','800','--height','550','--shape','hexagon')
  await cli('card','place',card.sessionId,'--x','120','--y','80')
  await cli('canvas','set','--x','900','--y','-200','--zoom','0.75')
  await stop(service)
  service = start()
  await until(async () => (await cli('status')).running)
  const persisted = await cli('session', 'list')
  ok(persisted.viewport.zoom===0.75 && persisted.viewport.y===-200 && persisted.rooms.Runtime.bounds.x===-900 && persisted.sessions.find(c=>c.id===card.sessionId).position.x===120,'viewport, signed Team bounds and free employee positions survive service restart')
  ok(persisted.rooms.Studio.design.wall === 'panels' && persisted.rooms.Studio.design.plants === false, 'room edits and immutable Team name survive service restart')
  ok(persisted.sessions.find(c => c.id === employee.id).avatar === 'fox', 'employee appearance survives service restart')
  await cli('card', 'remove', employee.id)
  await cli('group', 'remove', 'Studio')
  id = (await cli('session', 'open', card.sessionId)).sessionId
  const resumed = await cli('session', 'snapshot', id)
  ok(resumed.items.length === first.items.length && resumed.threadId === first.threadId, 'service restart restores transcript and native engine identity')
  ok(resumed.model === 'gpt-5.6-luna' && resumed.effort === 'low' && resumed.permissionMode === 'acceptEdits', 'service restart restores model, effort, and permission')
  await cli('session', 'send', id, 'hold')
  await until(async () => (await cli('session', 'info', id)).busy)
  await assert.rejects(() => cli('session', 'send', id, 'cannot interleave'))
  ok(true, 'overlapping turns are rejected before recording another user message')
  const alternative=join(projects,'alternative');mkdirSync(alternative)
  await assert.rejects(()=>cli('group','root','Runtime',alternative))
  await assert.rejects(()=>cli('card','update',card.sessionId,'--cwd','another-child'))
  ok(!existsSync(join(projects,'Runtime','another-child')),'active work cannot move roots or create a new child folder before stopping')
  const following = await follow(id)
  await cli('session', 'interrupt', id)
  await following.done
  await until(async () => !(await cli('session', 'info', id)).busy)
  ok(true, 'interrupt stops the active child and releases stream followers')
  const cwd=(await cli('session','info',id)).cwd
  const beforeBad=(await cli('session','transcript',id)).items.length
  renameSync(cwd,cwd+'.saved');symlinkSync(alternative,cwd)
  await assert.rejects(()=>cli('session','send',id,'must never reach the engine'))
  ok((await cli('session','transcript',id)).items.length===beforeBad,'send rechecks the workspace and rejects a replaced outward symlink before recording a turn')
  unlinkSync(cwd);renameSync(cwd+'.saved',cwd)
  await cli('session', 'send', id, 'hold')
  const closing = await follow(id)
  await cli('session', 'close', id)
  await closing.done
  ok((await cli('session', 'list', '--live')).length === 0, 'closing a busy session releases its followers and live state')
  await assert.rejects(() => cli('card', 'rename', 'missing-card', 'Invalid'))
  ok((await cli('session', 'list')).sessions.length === 1, 'invalid card mutations cannot create phantom employees')
  console.log(`PASS=${count} FAIL=0 — no model calls`)
} finally { await stop(service); rmSync(home, { recursive: true, force: true });rmSync(projects,{recursive:true,force:true}) }
