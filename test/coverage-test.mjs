#!/usr/bin/env node
// Static coverage check. Needs no running app and opens no window.
//
// It reads the renderer's interactive controls and the CLI's command surface,
// then reports anything the interface can do that the terminal cannot. This is
// the mechanical half of the rule "every GUI action must be reachable from the
// CLI" — the running half is in cli-test.mjs.
//
//   npm run test:coverage

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transform } from 'esbuild'
import {spawnSync} from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
let fail = 0
const failures = []

function ok(cond, label, detail = '') {
  if (cond) {
    console.log(`PASS  ${label}`)
    pass++
  } else {
    console.log(`FAIL  ${label}${detail ? `  (${detail})` : ''}`)
    fail++
    failures.push(label)
  }
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// ---- what the interface exposes ----

const rendererFiles = walk(join(ROOT, 'src', 'renderer', 'src')).filter((f) =>
  /\.tsx?$/.test(f)
)
const renderer = rendererFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

// ---- what the terminal exposes ----

const server = readFileSync(join(ROOT, 'src', 'main', 'server.ts'), 'utf8')
const cli = readFileSync(join(ROOT, 'bin', 'agents'), 'utf8')
const protocol = readFileSync(join(ROOT, 'src', 'shared', 'api-registry.ts'), 'utf8')

// Most commands are `case 'x.y':`, but streaming ones are `if (req.cmd === 'x.y')`.
const serverCommands = new Set([
  ...[...server.matchAll(/case '([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1]),
  ...[...server.matchAll(/req\.cmd === '([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1])
])
const cliCommands = new Set(
  [...cli.matchAll(/case '([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1])
)
const {COMMANDS}=await import('../src/shared/api-registry.ts')
const declared=new Set(COMMANDS.map(command=>command.name))
const managerGuide=readFileSync(join(ROOT,'docs','managers','API.md'),'utf8')

console.log('CLI / GUI coverage — static check\n')

console.log('-- the surfaces line up --')
const registry=JSON.parse(readFileSync(join(ROOT,'docs/managers/commands.json'),'utf8'))
ok(registry.every(command=>typeof command.permission==='string'&&typeof command.target==='string'),'every API declares an authorization policy and resource target')
ok(serverCommands.size > 0, `the server handles commands (${serverCommands.size})`)
ok(cliCommands.size > 0, `the CLI exposes commands (${cliCommands.size})`)

const missingOnServer = [...cliCommands].filter((c) => !serverCommands.has(c))
ok(
  missingOnServer.length === 0,
  'every command the CLI sends is handled by the server',
  missingOnServer.join(', ')
)

const missingInCli=[...serverCommands].filter(command=>!cliCommands.has(command))
ok(missingInCli.length===0,'every shared Core operation has a CLI entrypoint',missingInCli.join(', '))

const undocumented = [...serverCommands].filter((c) => !declared.has(c))
ok(
  undocumented.length === 0,
  'every server command is declared in the protocol registry',
  undocumented.join(', ')
)
const missingInGuide=[...declared].filter(command=>!managerGuide.includes(`<code>agents ${command.replace('.', ' ')}</code>`))
ok(missingInGuide.length===0,`Manager handbook indexes every CLI command (${declared.size})`,missingInGuide.join(', '))
const documentation=spawnSync(process.execPath,[join(ROOT,'scripts','sync-manager-docs.mjs'),'--check'],{cwd:ROOT,encoding:'utf8'})
ok(documentation.status===0,'Manager API, scheduler and supporting docs match their sources',documentation.stderr.trim())
const rendererCommands = new Set([...renderer.matchAll(/(?:act|configure|api\.call(?:<[^>]+>)?)\('([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1]))
for (const command of rendererCommands) {
  ok(cliCommands.has(command) && serverCommands.has(command), `frontend API call → ${command}`)
}

const requiredBusiness=['group.add','group.configure','card.create','card.update','session.open','session.send','session.transcript','session.interrupt','config.engine','config.model','config.permission','config.thinking','config.effort','plugin.call','workspace.write','terminal.input','schedule.create','schedule.run','schedule.cancel','schedule.history','schedule.preview','schedule.schema']
for(const command of requiredBusiness)ok(cliCommands.has(command)&&declared.has(command)&&serverCommands.has(command),`CLI-first business contract → ${command}`)

// ---- the GUI controls that must have an equivalent ----

console.log('\n-- GUI controls have CLI equivalents --')

// Capabilities the interface offers, each paired with a command that must exist.
const REQUIRED = [
  ['opening a card', /onOpen\(card\)/, 'session.open'],
  ['creating a session', /onCreate\(/, 'session.new'],
  ['renaming a card', /startRename|onRename\(/, 'card.rename'],
  ['moving a card between departments', /onMove\(/, 'card.move'],
  ['reordering by dragging', /onReorder\(/, 'card.move'],
  ['adding a department', /onAddGroup/, 'group.add'],
  ['removing a department', /onDeleteGroup/, 'group.remove'],
  ['sending a message', /void send\(\)/, 'session.send'],
  ['stopping a turn', /void stop\(\)/, 'session.interrupt'],
  ['toggling thinking', /toggleThinking/, 'config.thinking'],
  ['changing model', /pickModel/, 'config.model'],
  ['changing permission', /pickPermission/, 'config.permission'],
  ['changing effort', /pickEffort/, 'config.effort'],
  ['clearing effort to Default', /clearEffort/, 'config.effort']
]

for (const [label, pattern, command] of REQUIRED) {
  const inUi = pattern.test(renderer)
  if (!inUi) continue // the control does not exist; nothing to cover
  ok(cliCommands.has(command), `${label} → ${command}`)
}

// ---- the CLI must be able to see the UI and read data ----

console.log('\n-- the CLI can observe, not just act --')
const OBSERVE = [
  ['read the screen', 'ui.view'],
  ['query elements', 'ui.dom'],
  ['read visible text', 'ui.text'],
  ['click an element', 'ui.click'],
  ['type into an input', 'ui.type'],
  ['wait for an element', 'ui.wait'],
  ['read a session’s own state', 'session.info'],
  ['read a conversation', 'session.transcript'],
  ['list the slash commands', 'commands.list']
]
for (const [label, command] of OBSERVE) {
  ok(cliCommands.has(command) && serverCommands.has(command), `${label} → ${command}`)
}

// ---- commands exist for both engines ----

console.log('\n-- both engines are reachable --')
const sessions = readFileSync(join(ROOT, 'src', 'main', 'sessions.ts'), 'utf8')
const adapters=readFileSync(join(ROOT,'src/main/engines/runtime.ts'),'utf8')
ok(/codex:openCodex/.test(adapters)&&/claude:openClaude/.test(adapters)&&/openEngine\(/.test(sessions),'both engines use registered runtime adapters')
ok(
  declared.size >= serverCommands.size,
  'the registry covers the command surface',
  `${declared.size} declared, ${serverCommands.size} handled`
)

// Vite emits invalid CSS as warnings, so a successful build alone is insufficient.
for(const file of walk(join(ROOT,'src','renderer','src')).filter(f=>f.endsWith('.css'))){
 try{const result=await transform(readFileSync(file,'utf8'),{loader:'css'});ok(result.warnings.length===0,'valid CSS → '+file.slice(ROOT.length+1),result.warnings.map(w=>w.text).join('; '))}
 catch(error){ok(false,'valid CSS → '+file.slice(ROOT.length+1),error.message)}
}
console.log(`\nPASS=${pass} FAIL=${fail}`)
if (fail) {
  console.log('\nuncovered:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail ? 1 : 0)
