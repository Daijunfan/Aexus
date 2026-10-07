#!/usr/bin/env node
// All acceptance runs use a disposable home and only own their child process.
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'agents-company-test-'))
const projects = mkdtempSync(join(tmpdir(), 'agents-company-projects-'))
const env = { ...process.env, AGENTS_COMPANY_TEST_PROJECTS: projects, AGENTS_COMPANY_HOME: home, AGENTS_COMPANY_PROJECTS: projects, AGENTS_COMPANY_CWD: join(home, 'workspace') }
const app = spawn(process.execPath, ['Infra/src/cli/agents', 'serve'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
app.stdout.on('data', (d) => { log += d })
app.stderr.on('data', (d) => { log += d })
const stopped = new Promise((resolve) => app.once('exit', resolve))
let code = 1
try {
  const deadline = Date.now() + 15_000
  while (!existsSync(join(home, 'agents.sock'))) {
    if (app.exitCode !== null || Date.now() > deadline) throw new Error(`Service did not start: ${log}`)
    await new Promise((r) => setTimeout(r, 100))
  }
  console.log(`Isolated CLI service: ${home}`)
  code = await new Promise((resolve) => {
    const test = spawn(process.execPath, ['Infra/src/test/cli-test.mjs'], { cwd: root, env, stdio: 'inherit' })
    test.once('exit', (status) => resolve(status ?? 1))
  })
  if (code) console.error(log.slice(-14000))
} finally {
  app.kill('SIGTERM')
  await stopped
  rmSync(home, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true })
}
process.exitCode = code
