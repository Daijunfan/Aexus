#!/usr/bin/env node
// Bounded headless runner for the embedded Core's inherited renderer suites.
//
// The previous acceptance round excluded ~140 `AgentBoard/Aexus/test/*-ui-test.mjs`
// suites as "requires Electron / Playwright renderer shell or a browser download".
// That exclusion is not accurate on this machine: Electron 44.4.4 and Playwright
// 1.58.2 with cached Chromium are installed, and 61 of the suites default to an
// offscreen headless Chromium against `bin/agents serve --web` (the same binding the
// Aexus host embeds) with a disposable `fixtureCore` home. This runner executes them
// as they are, two at a time, with a hard per-suite timeout, retained per-suite logs
// and no writes to product source, git, the installed app or user state.
//
// Usage:
//   node tests/qa-business-ui-runner.cjs --list
//   node tests/qa-business-ui-runner.cjs --group messages
//   node tests/qa-business-ui-runner.cjs --group all --concurrency 2 --timeout 420000
//   node tests/qa-business-ui-runner.cjs --only message-attachments
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const {createHash}=require('node:crypto')

const repo = path.resolve(__dirname, '..')
const core = process.env.QA_BUSINESS_CORE || path.join(repo, 'AgentBoard', 'Aexus')
const testDir = path.join(core, 'test')
const outRoot = process.env.QA_BUSINESS_OUT || path.join(repo, 'artifacts', 'full-acceptance-20261015', 'business-ui')
const logDir = path.join(outRoot, 'logs')
const candidatePin=process.env.QA_BUSINESS_PIN?JSON.parse(fs.readFileSync(process.env.QA_BUSINESS_PIN,'utf8')):null
const liveGroups=new Set();let stopping=false
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(stopping)return;stopping=true;for(const pid of liveGroups)try{process.kill(-pid,'SIGTERM')}catch{};setTimeout(()=>{for(const pid of liveGroups)try{process.kill(-pid,'SIGKILL')}catch{};process.exit(signal==='SIGINT'?130:143)},3000)})
const bindingKinds=JSON.parse(fs.readFileSync(path.join(repo,'artifacts/full-acceptance-20261015/business-ui/binding-breakdown.json'),'utf8')).bySuite

// ---------------------------------------------------------------------------
// Scope. Surfaces assigned to this worker, then the rest of the inherited suites
// as extended coverage so the excluded broad surfaces are actually executed.
// ---------------------------------------------------------------------------
const GROUPS = {
  messages: [
    'messages', 'messenger', 'messenger-draft-recovery', 'private-send-recovery',
    'chat-editing', 'chat-editing-projections', 'chat-scroll',
    'message-attachments', 'message-action-rail', 'message-action-scope',
    'message-categories', 'message-code-block', 'message-collaboration',
    'message-expression', 'message-gallery', 'message-history', 'message-identity',
    'message-library-refresh', 'message-order', 'message-reading', 'message-receipt',
    'message-refinement', 'message-source', 'message-view-memory', 'message-wallpaper',
    'forward-recovery', 'conversation-controls', 'conversation-directory',
    'conversation-workspaces', 'communication-highlight', 'gallery-history',
    'layout-unread', 'receipt-resilience', 'media-controls', 'media-lifecycle',
    'media-playback', 'background-audio', 'audio-subscriptions', 'files-reveal',
    'shared-locator', 'image-paste'
  ],
  group: [
    'group-chat', 'group-avatar-layout', 'group-delivery', 'group-publishing',
    'cross-team', 'mentions-engines', 'connector', 'connector-segments',
    'connector-terminals'
  ],
  plan: [
    'plan', 'plan-parity', 'plan-polish', 'plan-readability', 'plan-authority',
    'secretary-plan'
  ],
  company: [
    'creation-form', 'team-views', 'team-room-drag', 'canvas-overview', 'room-resize',
    'bulk-edit', 'management', 'management-bindings', 'manager-local-only',
    'native-initialization-bind', 'employee-badge-icons', 'employee-features',
    'employee-initialization', 'employee-language', 'employee-profile',
    'employee-remove-workspace', 'employee-team-selection', 'employee-view-refresh',
    'fate-avatars', 'pet-catalog', 'engine-controls', 'model-catalog',
    'process-engines', 'color-schemes', 'theme-picker', 'view-appearance', 'language',
    'screenshot-privacy', 'performance', 'slimming-events', 'asset-workbench',
    'asset-workbench-recovery', 'assets', 'assets-transfer', 'team-appearance',
    'interaction'
    // `employee-lifecycle` was listed here and is now EXCLUDED (removed mininotion
    // plugin, verified by execution) — see the exclusion table.
  ],
  channels: [
    'channels', 'channels-source', 'channel-administrators',
    'channel-author-management', 'channel-avatar', 'channel-avatar-layout',
    'channel-composer-recovery', 'channel-discussion', 'channel-documents',
    'channel-engines', 'channel-post-detail', 'channel-post-views',
    'channel-publisher', 'channel-reading'
    // `discussion-phase-prompt` was listed here by mistake: the file on disk is
    // `discussion-phase-prompt-test.mjs`, which does not match the `-ui-test.mjs`
    // collection rule, so it is not a renderer suite and cannot be selected.
  ],
  // Empty: the five suites that used to sit here are all excluded — see EXCLUDED for
  // why. The group is kept so the inventory output still shows the bucket.
  extended: [],
  // Needs AGENTS_COMPANY_TEST_APP pointing at a real packaged .app: this is the
  // only inherited suite that exercises the hosted bundle binding itself.
  bundle: ['secretary-role-bundle']
}

// Removed products (Mini Notion, Margin Reader, Cloud Hosts plugin, Guardian) and
// the plugin window shell they need. AGENTS.md forbids restoring them.
const EXCLUDED = [
  [/^mininotion/, 'removed plugin product (Mini Notion)'],
  [/^notion$/, 'removed plugin product (Mini Notion)'],
  [/^plugin-window$/, 'removed plugin window shell'],
  [/^plugin$/, 'removed plugin shell'],
  [/^preferences-plugin$/, 'removed plugin preferences'],
  [/^navigation$/, 'drives the removed plugin directory'],
  [/^modes$/, 'drives the removed plugin directory'],
  [/^web$/, 'asserts the removed plugin web surfaces'],
  [/^team-header$/, 'installs the removed margin-reader/cloud-hosts plugins'],
  [/^team-lifecycle$/, 'asserts the removed team-plugin value'],
  [/^secretary-role$/, 'installs the removed mininotion plugin'],
  [/^workbench$/, 'installs the removed mininotion plugin'],
  [/^cloud-engine-form$/, 'uses the removed margin-reader plugin'],
  [/^files-library$/, 'requires the removed margin-reader pdf-lib build'],
  [/^guardian$/, 'removed Guardian product'],
  [/^ui-test$/, 'obsolete standalone Electron shell runner; unified packaged WK/app acceptance is the supported replacement'],
  [/^secretary-role-bundle$/, 'expects retired standalone Electron app.asar and obsolete profile/role editor; unified package Role Board and current role/Plan suites cover supported behavior'],
  [/^mininotion-color-themes$/, 'removed plugin product (Mini Notion)'],
  // Verified by execution, not by reading: both abort with
  //   `agents group add … --plugin cloud-hosts` -> {"ok":false,"error":"Plugin not installed: cloud-hosts"}
  // and `locator('.plugin-directory [data-plugin="cloud-hosts"]')` never appears.
  // The embedded Core ships no `build/plugins` output at all; Cloud Hosts is now an
  // Aexus host feature (`src/main/cloud-hosts.ts`), not an installable Core plugin.
  [/^shared$/, 'installs the removed cloud-hosts Core plugin (Cloud Hosts is now a host feature)'],
  [/^web-vnc$/, 'drives the removed cloud-hosts plugin directory'],
  // Host-management and VM Lab surfaces. AGENTS.md keeps these independent of the
  // embedded Core boards this worker covers, so they are handed to the host worker
  // rather than claimed as pass or fail here. Observed when they did run:
  // cloud-hosts "electronApplication.waitForEvent: Target page, context or browser has
  // been closed"; cloud-workbench "Timeout 30000ms exceeded while waiting for event
  // window"; cloud-native-worker deep-equal assertion at :40. Logs retained.
  [/^cloud-hosts$/, 'Aexus host / Cloud Hosts surface, owned by the host worker'],
  [/^cloud-workbench$/, 'Aexus host VM Lab surface, owned by the host worker'],
  [/^cloud-native-worker$/, 'host worker surfaces, owned by the host worker'],
  // These two must never run in an acceptance sweep: one is gated behind an explicit
  // opt-in and reads registered remote hosts; the other reads the developer's real
  // sessions file with no isolation at all —
  //   const original=JSON.parse(fs.readFileSync(path.join(os.homedir(),'AgentsCompany/sessions.json'),'utf8'))
  // — which contradicts "tests use isolated data" and risks touching user state.
  [/^cloud-workbench-live$/, 'opt-in live test (AGENTS_CLOUD_WORKBENCH_LIVE) against registered remote hosts'],
  [/^windows-workbench-live$/, 'reads the real ~/AgentsCompany/sessions.json and live Windows host state; no isolation'],
  // Verified by execution: dies at line 27 on
  //   `agents group add Planning --mode work --plugin mininotion --json`
  //   -> {"ok":false,"error":"Plugin not installed: mininotion"}
  // so it covers nothing. Same class as `shared`/`web-vnc`, but the filename does not
  // carry the product name, which is why a name-only exclusion table missed it.
  // `interaction` performs the same call at line 39 but fails earlier, on a real
  // layout assertion, so it stays in the suite — see the report.
  [/^employee-lifecycle$/, 'installs the removed mininotion Core plugin (verified: "Plugin not installed: mininotion")']
]

function allTestFiles() {
  return fs.readdirSync(testDir)
    .filter((name) => /-ui-test\.mjs$/.test(name) || name === 'ui-test.mjs')
    .sort()
}

// Derived copies live outside the Core so the original inherited suites stay
// untouched; see tests/qa-business-derive.cjs for what changed and why.
function derivedTestFiles() {
  const dir = path.join(outRoot, 'derived')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => name.endsWith('.qa.mjs')).sort()
    .map((name) => ({ name: 'qa-derived/' + name.replace(/\.qa\.mjs$/, ''), file: path.join(dir, name), group: 'derived', excluded: false, absolute: true }))
}

function suiteName(file) {
  return file.replace(/-ui-test\.mjs$/, '').replace(/\.mjs$/, '')
}

function classify(file) {
  const name = suiteName(file)
  for (const [re, reason] of EXCLUDED) {
    if (re.test(name)) return { name, file, excluded: true, reason }
  }
  for (const [group, members] of Object.entries(GROUPS)) {
    if (members.includes(name)) return { name, file, group, excluded: false }
  }
  return { name, file, group: 'unassigned', excluded: false }
}

function parseArgs(argv) {
  const options = { group: 'all', concurrency: 2, timeout: 420000, only: null, list: false, includeExcluded: false, json: null, rerunFailed: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--list') options.list = true
    else if (arg === '--group') options.group = argv[++i]
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i])
    else if (arg === '--timeout') options.timeout = Number(argv[++i])
    else if (arg === '--only') options.only = new RegExp(argv[++i])
    else if (arg === '--include-excluded') options.includeExcluded = true
    else if (arg === '--json') options.json = argv[++i]
    // Re-run exactly the suites that failed in one or more earlier result files. Used
    // for the confirmation pass at a lower concurrency: several suites run a full
    // electron-vite build inside `profileApplication`, and two of those in parallel is
    // enough to cause build timeouts that look like product failures.
    // Variadic: every following argument up to the next `--flag` is a result file.
    else if (arg === '--rerun-failed') {
      const files = []
      while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) files.push(argv[++i])
      if (!files.length) { console.error('--rerun-failed needs at least one result file'); process.exit(2) }
      options.rerunFailed = (options.rerunFailed || []).concat(files)
    }
    else if (arg === '--dry-run') options.dryRun = true
    else { console.error('unknown argument: ' + arg); process.exit(2) }
  }
  return options
}

function runSuite(entry, timeout) {
  return new Promise((resolve) => {
    const logPath = path.join(logDir, entry.name.replace(/[\\/]/g, '__') + '.log')
    const log = fs.createWriteStream(logPath)
    const started = Date.now()
    // detached:true gives the suite its own process group so a timeout kill also
    // reaps the disposable Core, Electron and Chromium it spawned.
    const fixtureDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-business-fixture-'));
    const control=path.join(fixtureDirectory,'control');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');
    const env={...process.env,CODEX_BIN:path.join(core,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(fixtureDirectory,'codex'),CLAUDE_CONFIG_DIR:path.join(fixtureDirectory,'claude'),AC_INIT_FIXTURE:control,AGENTS_COMPANY_WORKSPACES:path.join(fixtureDirectory,'work'),AGENTS_COMPANY_TEST_ARTIFACTS:path.join(outRoot,'fixtures',entry.name),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_OFFSCREEN:'1'};
    for(const key of Object.keys(env))if(key.startsWith('ANTHROPIC_')||['OPENAI_API_KEY','OPENAI_BASE_URL','DEEPSEEK_API_KEY'].includes(key))delete env[key];
    const inputFile=entry.absolute?entry.file:path.join(testDir,entry.file),sourceHash=createHash('sha256').update(fs.readFileSync(inputFile)).digest('hex');
    const child = spawn(process.execPath, [inputFile], {cwd:core,detached:true,stdio:['ignore','pipe','pipe'],env})
    liveGroups.add(child.pid)
    let timedOut = false,killTimer
    let timer = setTimeout(() => {
      timedOut = true
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
      killTimer=setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 8000)
    }, timeout)
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    child.once('close', (code, signal) => {
      clearTimeout(timer);clearTimeout(killTimer);liveGroups.delete(child.pid)
      log.end()
      fs.rmSync(fixtureDirectory,{recursive:true,force:true})
      resolve({
        name: entry.name,
        sourceHash,
        application:process.env.AGENTS_COMPANY_PROFILE_APPLICATION||null,
        coreEntry:process.env.AGENTS_COMPANY_TEST_CORE_ENTRY||null,
        evidenceKind:candidatePin?(bindingKinds[entry.name]?.kind==='coreWebMode'?'packaged-Core-and-renderer':bindingKinds[entry.name]?.kind==='electronLaunched'?'candidate-derived-Electron-test-shell':bindingKinds[entry.name]?.kind==='appFromSource'?'candidate-profile-Web-and-Electron-fixture':'candidate-source-component-fixture'):'isolated-source-test',
        bindingKind:bindingKinds[entry.name]?.kind??'inspect-command',
        candidate:candidatePin?{app:candidatePin.app,buildId:candidatePin.buildId,version:candidatePin.version}:null,
        file: entry.file,
        group: entry.group,
        code,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        log: path.relative(repo, logPath)
      })
    })
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const all = allTestFiles().map(classify)
  if (options.group === 'derived') {
    const derived = derivedTestFiles()
    fs.mkdirSync(logDir, { recursive: true })
    if (options.list || options.dryRun) { for (const entry of derived) console.log(`${entry.name}  derived`); return }
    const results = []
    let index = 0
    await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, async () => {
      while (index < derived.length) {
        const entry = derived[index++]
        const result = await runSuite(entry, options.timeout)
        results.push(result)
        console.log(`${(result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'PASS' : 'FAIL').padEnd(7)} ${String(result.durationMs).padStart(7)}ms  ${result.name}`)
      }
    }))
    const passed = results.filter((entry) => entry.code === 0 && !entry.timedOut).length
    fs.writeFileSync(options.json ? path.resolve(options.json) : path.join(outRoot, 'results-derived.json'),
      JSON.stringify({ ranAt: new Date().toISOString(), selected: derived.length, passed, failed: results.length - passed, results }, null, 2))
    console.log(`\nselected=${derived.length} passed=${passed} failed=${results.length - passed}`)
    process.exitCode = passed === derived.length ? 0 : 1
    return
  }
  // Names that failed in the referenced result files, so a confirmation pass re-tests
  // what actually failed. An EXCLUDED suite is never re-selected, even when an earlier
  // result file names it: the exclusion is a data-safety decision (`windows-workbench-live`
  // reads the developer's real ~/AgentsCompany/sessions.json) and must outrank a rerun
  // list. Dropped names are reported rather than silently ignored.
  let rerun = null
  const rerunDropped = []
  if (options.rerunFailed) {
    rerun = new Set()
    const failedNames = new Set()
    for (const file of options.rerunFailed) {
      const summary = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
      for (const result of summary.results) if (result.code !== 0 || result.timedOut) failedNames.add(result.name)
    }
    for (const name of failedNames) {
      const entry = all.find((candidate) => candidate.name === name)
      if (entry?.excluded) rerunDropped.push({ name, reason: entry.reason })
      else rerun.add(name)
    }
    if (rerunDropped.length) {
      console.log(`rerun: refusing ${rerunDropped.length} excluded suite(s)`)
      for (const dropped of rerunDropped) console.log(`  ${dropped.name} — ${dropped.reason}`)
    }
  }
  let selected = all.filter((entry) => {
    if (rerun) return rerun.has(entry.name)
    if (entry.excluded && !options.includeExcluded) return false
    if (options.only) return options.only.test(entry.name)
    if (options.group === 'all') {
      // `bundle` asserts against a packaged .app; only run it when one was named.
      if (entry.group === 'bundle' && !process.env.AGENTS_COMPANY_TEST_APP) return false
      return !entry.excluded
    }
    return entry.group === options.group
  })

  if (options.list || options.dryRun) {
    const width = Math.max(...all.map((entry) => entry.name.length))
    for (const entry of all) {
      const mark = entry.excluded ? 'EXCLUDED' : 'runnable'
      const where = entry.excluded ? entry.reason : entry.group
      console.log(`${entry.name.padEnd(width)}  ${mark.padEnd(9)} ${where}`)
    }
    console.log(`\ntotal=${all.length} runnable=${all.filter((entry) => !entry.excluded).length} excluded=${all.filter((entry) => entry.excluded).length}`)
    for (const [group, members] of Object.entries(GROUPS)) {
      const found = all.filter((entry) => entry.group === group).length
      console.log(`  ${group.padEnd(10)} declared=${String(members.length).padStart(3)} found=${found}`)
    }
    const unassigned = all.filter((entry) => !entry.excluded && entry.group === 'unassigned')
    if (unassigned.length) console.log(`  unassigned: ${unassigned.map((entry) => entry.name).join(', ')}`)
    if (options.list) return
    // `--dry-run` prints exactly what would execute and then stops, so a selection can
    // be reviewed — in particular that no excluded suite slipped into a rerun list —
    // without launching a browser.
    console.log(`\nselected=${selected.length}`)
    for (const entry of selected) console.log(`  would run  ${entry.name}  [${entry.group}]`)
    return
  }

  fs.mkdirSync(logDir, { recursive: true })
  const started = Date.now()
  const results = []
  let index = 0
  const workers = Array.from({ length: Math.max(1, options.concurrency) }, async () => {
    while (index < selected.length) {
      const entry = selected[index++]
      const result = await runSuite(entry, options.timeout)
      results.push(result)
      fs.writeFileSync(path.join(outRoot,'progress.json'),JSON.stringify({candidate:candidatePin,selected:selected.length,completed:results.length,results},null,2)+'\n')
      const verdict = result.timedOut ? 'TIMEOUT' : result.code === 0 ? 'PASS' : 'FAIL'
      console.log(`${verdict.padEnd(7)} ${String(result.durationMs).padStart(7)}ms  ${result.name}`)
    }
  })
  await Promise.all(workers)

  results.sort((a, b) => a.name.localeCompare(b.name))
  const summary = {
    ranAt: new Date().toISOString(),
    candidate:candidatePin,
    core: path.relative(repo, core),
    concurrency: options.concurrency,
    timeoutMs: options.timeout,
    wallMs: Date.now() - started,
    selected: selected.length,
    passed: results.filter((entry) => entry.code === 0 && !entry.timedOut).length,
    failed: results.filter((entry) => entry.code !== 0 && !entry.timedOut).length,
    timedOut: results.filter((entry) => entry.timedOut).length,
    rerunDropped,
    excluded:all.filter(entry=>entry.excluded).map(({name,reason})=>({name,reason})),
    unselected:all.filter(entry=>!entry.excluded&&!selected.includes(entry)).map(({name,group})=>({name,group,status:'not-run-in-this-invocation'})),
    results
  }
  const jsonPath = options.json ? path.resolve(options.json) : path.join(outRoot, 'runner-results.json')
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2))
  console.log(`\nselected=${summary.selected} passed=${summary.passed} failed=${summary.failed} timeout=${summary.timedOut} wall=${(summary.wallMs / 1000).toFixed(1)}s`)
  console.log('results: ' + path.relative(repo, jsonPath))
  process.exitCode = summary.failed + summary.timedOut > 0 ? 1 : 0
}

module.exports={inventory:()=>allTestFiles().map(classify)}
if(require.main===module)main().catch((error) => { console.error(error); process.exit(1) })
