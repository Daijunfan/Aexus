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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

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

const rendererFiles = walk(join(ROOT, 'Infra/src', 'renderer', 'src')).filter((f) =>
  /\.tsx?$/.test(f)
)
const renderer = rendererFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

// ---- what the terminal exposes ----

const server = ['server.ts','contract.ts','channels.ts','conversation-workspaces.ts',...readdirSync(join(ROOT,'Infra/src/main/commands')).filter(name=>name.endsWith('.ts')).map(name=>'commands/'+name)].map(file=>readFileSync(join(ROOT,'Infra/src','main',file),'utf8')).join('\n')
const cli = readFileSync(join(ROOT, 'Infra/src/cli', 'agents'), 'utf8')
const protocol = readFileSync(join(ROOT, 'Infra/src', 'shared', 'api-registry.ts'), 'utf8')

// Most commands are `case 'x.y':`, but streaming ones are `if (req.cmd === 'x.y')`.
const {MESSAGE_COLLABORATION_APIS}=await import('../shared/message-collaboration.ts')
if(!server.includes('return messageCollaborationRequest(req.cmd,a,fileEndpoint)'))throw Error('Message collaboration is not dispatched by Core')
const {CONVERSATION_CONTROL_APIS}=await import('../shared/conversation-control-schema.ts')
if(!server.includes('CONVERSATION_CONTROL_APIS.has(req.cmd)')||!server.includes('return conversationControlRequest(req.cmd,a)'))throw Error('Conversation controls are not dispatched by Core')
const {ENGINE_SCOPE_COMMANDS}=await import('../shared/engine-scope-schema.ts')
const scopeOperations=ENGINE_SCOPE_COMMANDS.map(c=>c.name).filter(name=>name.startsWith('infra.'))
if(!server.includes("if(['infra.scope','infra.bind','infra.unbind'].includes(req.cmd))return scopeRequest(req.cmd,a)"))throw Error('Engine association operations are not dispatched by Core')
const serverCommands = new Set([
  ...CONVERSATION_CONTROL_APIS,...MESSAGE_COLLABORATION_APIS,...scopeOperations,
  ...[...server.matchAll(/case '([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1]),
  ...[...server.matchAll(/(?:req\.cmd|command)\s*===\s*'([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1])
])
const cliCommands = new Set(
  [...[...cli.matchAll(/case '([a-z][a-z-]*\.[a-z][a-z-]*)'/g)].map((m) => m[1]),...Object.keys(JSON.parse(readFileSync(join(ROOT,'Infra/src/cli/command-inputs.json'),'utf8')))]
)
// api.call is local CLI syntax forwarding a chosen canonical command, not a Core endpoint.
cliCommands.delete('api.call')
const {COMMANDS}=await import('../shared/api-registry.ts')
const declared=new Set(COMMANDS.map(command=>command.name))
const managerGuide=readFileSync(join(ROOT,'Infra/src/docs','managers','API.md'),'utf8')

console.log('CLI / GUI coverage — static check\n')

console.log('-- the surfaces line up --')
const registry=JSON.parse(readFileSync(join(ROOT,'Infra/src/docs/managers/commands.json'),'utf8'))
ok(registry.every(command=>typeof command.permission==='string'&&typeof command.target==='string'),'every API declares an authorization policy and resource target')
for(const command of ['messenger.social','schedule.get','status','plan.query']){
 const args=command==='messenger.social'?{platform:'x'}:command==='schedule.get'?{id:'fixture-only'}:command==='plan.query'?{limit:3,filter:{states:['paused']}}:{}
 const parsed=spawnSync(process.execPath,[join(ROOT,'Infra/src/cli/agents'),'api','call',command,'--args',JSON.stringify(args),'--json'],{env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'})
 let request;try{request=JSON.parse(parsed.stdout)}catch{}
 ok(parsed.status===0&&request?.cmd===command&&JSON.stringify(request?.args)===JSON.stringify(args),'raw CLI forwards canonical command → '+command)
}
ok(serverCommands.size > 0, `the server handles commands (${serverCommands.size})`)
ok(cliCommands.size > 0, `the CLI exposes commands (${cliCommands.size})`)

ok(!declared.has('api.call'),'raw CLI uses no duplicate Core route')
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
const documentation=spawnSync(process.execPath,[join(ROOT,'Infra/src/tooling','sync-manager-docs.mjs'),'--check'],{cwd:ROOT,encoding:'utf8'})
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
const sessions = readFileSync(join(ROOT, 'Infra/src', 'main', 'sessions.ts'), 'utf8')
const adapters=readFileSync(join(ROOT,'Infra/src/main/engines/runtime.ts'),'utf8')
ok(/codex:openCodex/.test(adapters)&&/claude:openClaude/.test(adapters)&&/openEngine\(/.test(sessions),'both engines use registered runtime adapters')
ok(
  declared.size >= serverCommands.size,
  'the registry covers the command surface',
  `${declared.size} declared, ${serverCommands.size} handled`
)

// Vite emits invalid CSS as warnings, so a successful build alone is insufficient.
for(const file of walk(join(ROOT,'Infra/src','renderer','src')).filter(f=>f.endsWith('.css'))){
 try{const result=await transform(readFileSync(file,'utf8'),{loader:'css'});ok(result.warnings.length===0,'valid CSS → '+file.slice(ROOT.length+1),result.warnings.map(w=>w.text).join('; '))}
 catch(error){ok(false,'valid CSS → '+file.slice(ROOT.length+1),error.message)}
}
console.log(`\nPASS=${pass} FAIL=${fail}`)
if (fail) {
  console.log('\nuncovered:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail ? 1 : 0)
