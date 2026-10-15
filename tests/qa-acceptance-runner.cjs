#!/usr/bin/env node
// QA-owned acceptance orchestrator (2026-10-15 full-acceptance round).
// Runs a declared list of acceptance steps with per-step timeouts, keeps one log
// per step plus an incremental status manifest. It only ever signals child
// processes it started itself; it never kills anything by name or pattern.
//
//   node tests/qa-acceptance-runner.cjs --list
//   node tests/qa-acceptance-runner.cjs --group core --concurrency 2
//   node tests/qa-acceptance-runner.cjs --only webkit-agent-board --force
//
// Steps that already finished successfully are skipped on re-run unless --force.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts/full-acceptance-20261015');
const LOGS = path.join(OUT, 'qa-logs');
const MANIFEST = path.join(OUT, 'qa-status.json');
const NODE = process.execPath;
process.env.CLOUD_HOSTS_TEST_BACKEND ||= path.join(ROOT,'artifacts/Aexus.app/Contents/Resources/backend');
process.env.CLOUD_HOSTS_TEST_NODE ||= path.join(path.dirname(process.env.CLOUD_HOSTS_TEST_BACKEND),'node');

const SWIFT_CACHE = path.join(OUT, 'qa-swift-bin');
// Process-group ids of the steps this run started, so an interrupted run can
// still release its own children instead of leaving them behind.
const liveGroups = new Set();
function killLiveGroups(signal) {
  for (const pid of liveGroups) {
    try { process.kill(-pid, signal); } catch {}
  }
}
let shuttingDown = false;
function sweepAndExit(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  killLiveGroups('SIGTERM');
  setTimeout(() => { killLiveGroups('SIGKILL'); process.exit(signal === 'SIGINT' ? 130 : 143); }, 3000).unref();
}
process.on('SIGINT', () => sweepAndExit('SIGINT'));
process.on('SIGTERM', () => sweepAndExit('SIGTERM'));
process.on('exit', () => killLiveGroups('SIGKILL'));
const css = (...parts) => parts.join(' ');
const STYLE = 'dist/ui/style.css';
const AGENT_CSS = 'dist/ui/style.css dist/ui/agent-board.bundle.css';

// Compile a Swift WKWebView harness once, then reuse the binary — but rebuild it
// whenever the harness source is newer, so an edited harness can never be
// silently shadowed by a binary compiled from the previous revision.
function swiftBuildLine(swiftSource, bin) {
  return `if [ ! -x ${JSON.stringify(bin)} ] || [ ${JSON.stringify(swiftSource)} -nt ${JSON.stringify(bin)} ]; then swiftc -parse-as-library ${swiftSource} -framework AppKit -framework WebKit -o ${JSON.stringify(bin)}; fi`;
}
function swiftStep(id, group, swiftSource, binary, fixture, args, extra = {}) {
  const bin = path.join(SWIFT_CACHE, binary);
  const argv = [
    'sh', '-c',
    `set -e\n${swiftBuildLine(swiftSource, bin)}\n${JSON.stringify(bin)} ${args}`,
  ];
  return {id, group, argv, cwd: ROOT, ...extra};
}
const webkitBundle = (id, group, swift, bundle, fixture, cssFiles, options = {}) =>
  swiftStep(id, group, `tests/${swift}`, `wk-${id}`,
    fixture,
    `${bundle} tests/${fixture} ${cssFiles}`,
    {timeoutMs: 180000, requiresBuild: `dist/ui/${bundle}`, ...options});

function shStep(id, group, command, extra = {}) {
  return {id, group, argv: ['sh', '-c', command], cwd: ROOT, ...extra};
}
function nodeStep(id, group, args, extra = {}) {
  return {id, group, argv: [NODE, ...args], cwd: ROOT, ...extra};
}

const STEPS = [
  // ---------------------------------------------------------------- core ----
  // Product-level Node runners that are NOT part of `npm test` (that suite is
  // covered by the 213/213 baseline recorded at /tmp/aexus-full-node-tests.log).
  nodeStep('core-agent-native-fixture', 'core', ['tests/agent-native-fixture.cjs'], {timeoutMs: 240000}),
  nodeStep('core-agent-codex-tui-real', 'core', ['tests/agent-codex-tui-real.cjs'], {timeoutMs: 240000}),
  nodeStep('core-agent-codex-tui-product', 'core', ['tests/agent-codex-tui-product-real.cjs'], {timeoutMs: 300000}),
  nodeStep('core-agent-pi-local-real', 'core', ['tests/agent-pi-local-real.cjs'], {timeoutMs: 240000}),
  nodeStep('core-agent-claude-executor-real', 'core', ['tests/agent-claude-executor-real.cjs'], {timeoutMs: 240000}),
  nodeStep('core-agent-cline-native-real', 'core', ['tests/agent-cline-native-real.cjs'], {timeoutMs: 300000}),
  nodeStep('core-agent-route-io', 'core', ['--test', 'tests/agent-route-io.test.cjs'], {timeoutMs: 120000, redundant: 'in npm test baseline'}),
  // The station round trips drive remote hosts, so they need a backend that can
  // actually serve. While other work is in flight the tree refuses itself
  // (src/release.cjs fingerprint gate), so both suites accept the same pin the
  // WebKit runners use — CLOUD_HOSTS_TEST_BACKEND / CLOUD_HOSTS_TEST_NODE — and
  // the interpreter follows the pin so the backend runs under the node it ships
  // with. Unpinned they drive the working tree, as before.
  shStep('core-station-live', 'core', 'exec "${CLOUD_HOSTS_TEST_NODE:-node}" tests/station-live.cjs', {timeoutMs: 300000}),
  shStep('core-station-folder-live', 'core', 'exec "${CLOUD_HOSTS_TEST_NODE:-node}" tests/station-folder-live.cjs', {timeoutMs: 300000}),
  shStep('core-python-unittest', 'core',
    `python3 -m unittest discover -s tests -p 'test_*.py' -v`, {timeoutMs: 300000}),
  shStep('core-python-fileboard', 'core',
    `cd tests && python3 -m unittest -v test_file_board_edits`, {timeoutMs: 180000}),

  // --------------------------------------------------------------- webkit ---
  shStep('webkit-hosts-board', 'webkit', 'sh tests/run-hosts-board-webkit.sh', {timeoutMs: 240000}),
  shStep('webkit-role-board', 'webkit', 'sh tests/run-role-board-webkit.sh', {timeoutMs: 240000}),
  shStep('webkit-workspace-messages-plan', 'webkit', 'sh tests/run-workspace-native-webkit.sh', {timeoutMs: 240000}),
  // tests/language-webkit.js had no runner of its own; run-hosts-board-webkit.sh
  // takes the fixture as its first argument, so the Aexus rebrand fixture is
  // executed through the same harness that loads the served page.
  shStep('webkit-language-brand', 'webkit', 'sh tests/run-hosts-board-webkit.sh tests/language-webkit.js',
    {timeoutMs: 240000}),
  webkitBundle('webkit-agent-board', 'webkit', 'agent-board-webkit.swift',
    'dist/ui/agent-board.bundle.js', 'agent-board-webkit.js', AGENT_CSS),
  webkitBundle('webkit-board-1to6', 'webkit', 'board-resize-webkit.swift',
    'artifacts/board-native-entry.js', 'board-1to6-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/board-native-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/board-native-entry.js`}),
  // `dist/ui/files.bundle.js` is the Files *loader* bundle (it registers
  // window.cloudClientReady['files'] and never references the pane), so the
  // file-board fixtures cannot run against it — `window.__fileBoardPane` is only
  // exported by the esbuild test entry ui/file-board.js already ships. Bundle
  // that entry to artifacts/ and rebuild it whenever the source is newer, the
  // same way the sibling native entries below are handled.
  webkitBundle('webkit-file-board', 'webkit', 'file-board-webkit.swift',
    'artifacts/file-board-native-entry.js', 'file-board-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/file-board-native-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/file-board-native-entry.js`}),
  // The rest of the file-board family (QA report §4.2 counted 29 + 24 + 24
  // checks). Each gets its own bundle output so the steps never race another
  // concurrent esbuild on one file; artifacts/ is gitignored.
  webkitBundle('webkit-file-board-actions', 'webkit', 'file-board-webkit.swift',
    'artifacts/file-board-actions-entry.js', 'file-board-actions-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/file-board-native-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/file-board-actions-entry.js`}),
  webkitBundle('webkit-file-board-drag', 'webkit', 'file-board-webkit.swift',
    'artifacts/file-board-drag-entry.js', 'file-board-drag-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/file-board-native-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/file-board-drag-entry.js`}),
  webkitBundle('webkit-files-ui', 'webkit', 'file-board-webkit.swift',
    'artifacts/files-ui-entry.js', 'files-ui-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/files-ui-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/files-ui-entry.js`}),
  webkitBundle('webkit-native-rdp-ui', 'webkit', 'native-rdp-ui-webkit.swift',
    'artifacts/native-rdp-ui-entry.js', 'native-rdp-ui-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node_modules/.bin/esbuild tests/native-rdp-ui-entry.js --bundle --format=iife --target=es2022 --outfile=artifacts/native-rdp-ui-entry.js`}),
  webkitBundle('webkit-styled-select', 'webkit', 'styled-select-webkit.swift',
    'artifacts/styled-select-test.bundle.js', 'styled-select-webkit.js', STYLE,
    {timeoutMs: 180000, pre: `node tests/build-styled-select.cjs`}),
  // terminal input needs a different arg convention (bundle, fixture, no css)
  swiftStep('webkit-terminal-input', 'webkit', 'tests/terminal-input-webkit.swift', 'wk-terminal-input',
    'terminal-input.js', `dist/ui/terminal.bundle.js tests/terminal-input.js dist/ui/style.css`),
  shStep('webkit-terminal-lifecycle', 'webkit',
    `${swiftBuildLine('tests/terminal-input-webkit.swift', path.join(SWIFT_CACHE, 'wk-terminal-input'))}\n${JSON.stringify(path.join(SWIFT_CACHE, 'wk-terminal-input'))} dist/ui/terminal.bundle.js tests/terminal-lifecycle.js`,
    {timeoutMs: 180000}),

  // ------------------------------------------------- embedded Aexus Core ---
  // These suites resolve their esbuild entryPoints relative to the embedded
  // package root, so they must run with cwd = AgentBoard/Aexus.
  nodeStep('embedded-handshake', 'embedded', ['test/embedded-core-test.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 240000,
     replacedStaleAssertions: 'used to assert the removed Mini Notion / Margin Reader plugins exist; now proves they are absent and explicitly refused'}),
  // The suite's engine section drives a real codex/claude binary, i.e. billed
  // model turns, which this pass does not authorise; AGENTS_COMPANY_TEST_ENGINES=off
  // runs the deterministic Team/identity/service contract and prints an explicit
  // SKIP line for the engine section. That skip is recorded, not hidden — the
  // per-engine assertions stay untested here.
  nodeStep('embedded-headless-service', 'embedded', ['test/run-headless.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 300000,
     env: {AGENTS_COMPANY_TEST_ENGINES: 'off'}, untestedPaths: 'per-engine real-inference assertions in test/cli-test.mjs'}),
  nodeStep('embedded-core-engine', 'embedded', ['test/core-test.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 300000}),
  nodeStep('embedded-service', 'embedded', ['test/service-test.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 300000}),
  nodeStep('embedded-workspace', 'embedded', ['test/workspace-test.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 300000}),
  nodeStep('embedded-ui', 'embedded', ['test/ui-test.mjs'],
    {cwd: path.join(ROOT, 'AgentBoard/Aexus'), timeoutMs: 300000}),

  // ------------------------------------------------------------- roleboard --
  nodeStep('roleboard-live-ui-deep', 'roleboard', ['tests/role-board-live-ui.cjs'],
    {timeoutMs: 900000, env: {CLOUD_HOSTS_ROLE_DEEP: '1'}}),

  // --------------------------------------------------------------- publish --
  shStep('publish-signature-icon', 'publish', 'node tests/qa-publish-checks.cjs', {timeoutMs: 180000}),
];

function parseArgs(argv) {
  const opts = {group: null, only: null, concurrency: 2, force: false, list: false, dryRun: false};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--group') opts.group = argv[++i];
    else if (a === '--only') opts.only = (opts.only || []).concat(argv[++i]);
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (a === '--force') opts.force = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--include-excluded') opts.includeExcluded = true;
    else if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

// Provenance: what the steps below run against. Steps that use a pinned backend
// resolve it from CLOUD_HOSTS_TEST_BACKEND; everything else runs the source tree.
// The pin is recorded per step and on the manifest so a pass recorded against one
// revision (e.g. the installed 2.11.1) is never reused as evidence for another
// (the candidate). Old entries without a pin never match and therefore re-run.
function readRelease(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'release.json'), 'utf8')); } catch { return null; }
}
// Test and host-UI sources are not in the release manifest. Include their actual
// bytes plus the portable Core fingerprint so unbuilt edits cannot reuse a pass.
function sourceBuildId() {
  const hash = createHash('sha256').update(require('../src/release.cjs').create(ROOT).buildId);
  const walk = directory => {
    for (const item of fs.readdirSync(directory, {withFileTypes: true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.isFile()) hash.update(path.relative(ROOT,file)).update(fs.readFileSync(file));
    }
  };
  for (const directory of ['ui','tests','AgentBoard/Aexus/test']) walk(path.join(ROOT,directory));
  return hash.digest('hex');
}
function provenance() {
  const backend = process.env.CLOUD_HOSTS_TEST_BACKEND || '';
  const tree = readRelease(ROOT);
  const backendRel = backend ? readRelease(backend) : null;
  return {
    backend: backend || null,
    evidenceScope: 'source suites and pinned backend suites; each command identifies its scope',
    backendVersion: backendRel ? backendRel.version : null,
    backendBuildId: backendRel ? backendRel.buildId : null,
    treeVersion: tree ? tree.version : null,
    treeBuildId: tree ? tree.buildId : null,
    sourceBuildId: sourceBuildId(),
    node: process.env.CLOUD_HOSTS_TEST_NODE || null,
  };
}
const RUN_PROVENANCE = provenance();
const CURRENT_PIN = JSON.stringify(RUN_PROVENANCE);

function readManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return {startedAt: new Date().toISOString(), round: '20261015', steps: {}}; }
}
function writeManifest(state) {
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(MANIFEST, JSON.stringify(state, null, 2));
}

function runStep(step, state) {
  return new Promise((resolve) => {
    fs.mkdirSync(LOGS, {recursive: true});
    const logPath = path.join(LOGS, step.id + '.log');
    const log = fs.createWriteStream(logPath);
    const entry = {
      id: step.id, group: step.group,
      command: step.argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' '),
      startedAt: new Date().toISOString(), logPath: path.relative(ROOT, logPath),
      status: 'running', timedOut: false, pin: CURRENT_PIN, provenance: RUN_PROVENANCE,
    };
    state.steps[step.id] = entry;
    writeManifest(state);
    log.write(`$ ${entry.command}\n\n`);

    let argv = step.argv, shellCmd = null;
    if (step.argv[0] === 'sh') { shellCmd = [step.pre, step.argv[2]].filter(Boolean).join('\n'); argv = null; }
    // Every step leads its own process group. `sh -c` and `node` steps both
    // spawn grandchildren (the Swift harness, `bin/agents serve`, python), and
    // signalling only the leader strands them — the leak this runner used to
    // leave behind. Only groups this runner started are ever signalled.
    const child = spawn(shellCmd ? '/bin/sh' : argv[0], shellCmd ? ['-c', shellCmd] : argv.slice(1), {
      cwd: step.cwd || ROOT,
      env: {...process.env, ...(step.env || {})},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    entry.pid = child.pid;
    liveGroups.add(child.pid);
    const signalGroup = (signal) => {
      try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch {} }
    };
    const timer = setTimeout(() => {
      entry.timedOut = true;
      signalGroup('SIGTERM');
      setTimeout(() => signalGroup('SIGKILL'), 5000).unref();
    }, step.timeoutMs || 240000);
    child.stdout.on('data', (d) => log.write(d));
    child.stderr.on('data', (d) => log.write(d));
    child.on('error', (error) => log.write(`\nspawn error: ${error.message}\n`));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // A step is over when its whole group is over: sweep a timed-out group
      // once more so a grandchild cannot outlive the step it belonged to.
      if (entry.timedOut) signalGroup('SIGKILL');
      liveGroups.delete(child.pid);
      entry.exitCode = code; entry.signal = signal || null;
      entry.finishedAt = new Date().toISOString();
      entry.durationMs = Date.parse(entry.finishedAt) - Date.parse(entry.startedAt);
      entry.status = entry.timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed';
      log.end();
      writeManifest(state);
      resolve(entry);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let steps = STEPS;
  if (opts.group) steps = steps.filter((s) => s.group === opts.group);
  if (opts.only) steps = steps.filter((s) => opts.only.includes(s.id));
  if (opts.list) {
    for (const s of steps) console.log(`${s.group.padEnd(10)} ${s.id.padEnd(34)} ${(s.timeoutMs || 240000) / 1000}s`);
    return;
  }
  fs.mkdirSync(SWIFT_CACHE, {recursive: true});
  const state = readManifest();
  const excluded = steps.filter((s) => s.excluded && !opts.includeExcluded);
  if (excluded.length) console.log(`excluded (out of scope): ${excluded.map((s) => s.id).join(', ')}`);
  steps = steps.filter((s) => !excluded.includes(s));
  if (opts.group) steps = steps.filter((s) => s.group === opts.group);
  if (opts.only) steps = steps.filter((s) => opts.only.includes(s.id));
  const pending = steps.filter((s) => opts.force || state.steps[s.id]?.status !== 'passed' || state.steps[s.id]?.pin !== CURRENT_PIN);
  const skipped = steps.length - pending.length;
  console.log(`steps=${steps.length} pending=${pending.length} skipped(passed)=${skipped} concurrency=${opts.concurrency}`);
  if (opts.dryRun) { pending.forEach((s) => console.log('would run', s.id)); return; }

  const queue = pending.slice();
  const results = [];
  const workers = Array.from({length: Math.max(1, Math.min(3, opts.concurrency))}, async () => {
    while (queue.length) {
      const step = queue.shift();
      console.log(`-> ${step.id}`);
      const entry = await runStep(step, state);
      console.log(`<- ${step.id} ${entry.status} exit=${entry.exitCode} ${entry.durationMs}ms`);
      results.push(entry);
    }
  });
  await Promise.all(workers);

  const summary = {passed: 0, failed: 0, timeout: 0};
  for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
  const finalProvenance = provenance();
  const changedDuringRun = JSON.stringify(finalProvenance) !== CURRENT_PIN;
  state.lastRun = {at: new Date().toISOString(), summary, skippedPassed: skipped, provenance: RUN_PROVENANCE, changedDuringRun};
  state.provenance = RUN_PROVENANCE;
  if (changedDuringRun) console.error('Source or candidate changed during acceptance; results require a frozen rerun.');
  state.round = '20261015';
  writeManifest(state);
  console.log('SUMMARY', JSON.stringify(summary), 'pin', CURRENT_PIN, 'manifest', path.relative(ROOT, MANIFEST));
  process.exitCode = summary.failed || summary.timeout || changedDuringRun ? 1 : 0;
}

main();
