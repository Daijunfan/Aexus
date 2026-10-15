#!/usr/bin/env node
// All acceptance runs use a disposable home and only own their child process.
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const home = mkdtempSync(join(tmpdir(), 'agents-company-test-'))
const projects = mkdtempSync(join(tmpdir(), 'agents-company-projects-'))
const control=join(home,'fixture');mkdirSync(control);writeFileSync(join(control,'release-all'),'')
const binary=join(home,'codex-fixture.cjs');let fixture=readFileSync(join(root,'test/fixtures/initialization-codex.cjs'),'utf8')
const hook="async function readWorkDocument(text){";if(!fixture.includes(hook))throw Error('CLI fixture initialization boundary changed')
fixture=fixture.replace(hook,hook+`
 const proof=text.match(/read ([a-z0-9_-]+-input\\.txt).*create ([a-z0-9_-]+-proof\\.txt)/i)
 if(proof){const value=fs.readFileSync(path.join(cwd,proof[1]),'utf8');fs.writeFileSync(path.join(cwd,proof[2]),value);fs.writeFileSync(path.join(control,employee+'.reply.txt'),value);event('item/completed',{threadId:thread,turnId:turn,item:{id:'fixture-file-copy',type:'commandExecution',command:'fixture file read/write',aggregatedOutput:value,exitCode:0}})}
 await new Promise(resolve=>setTimeout(resolve,300))
`)
writeFileSync(binary,fixture,{mode:0o755})
const env = { ...process.env, CODEX_BIN:binary, CODEX_HOME:join(home,'codex'), AC_INIT_FIXTURE:control, AGENTS_COMPANY_TEST_ENGINES:'codex', AGENTS_COMPANY_TEST_PROJECTS: projects, AGENTS_COMPANY_HOME: home, AGENTS_COMPANY_PROJECTS: projects, AGENTS_COMPANY_CWD: join(home, 'workspace') }
const app = spawn(process.execPath, ['bin/agents', 'serve'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
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
    const test = spawn(process.execPath, ['test/cli-test.mjs'], { cwd: root, env, stdio: 'inherit' })
    test.once('exit', (status) => resolve(status ?? 1))
  })
  if (code) console.error(log.slice(-14000))
} finally {
  app.kill('SIGTERM')
  await stopped
  rmSync(home, { recursive: true, force: true }); rmSync(projects, { recursive: true, force: true })
}
process.exitCode = code
