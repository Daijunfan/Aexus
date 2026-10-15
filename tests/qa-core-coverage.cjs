#!/usr/bin/env node
// Core-coverage sweep of the embedded Aexus Core business suites that the
// earlier qa-embedded-suite.cjs pass missed. That pass selected 66 suites and
// dropped 319; the reviewer counted ~252 non-renderer suites never run. This
// sweep re-inventories every embedded `*-test.mjs` suite and classifies it by
// what it actually does, not by filename:
//
//   covered        already executed by the qa embedded sweep (not re-run)
//   skip:renderer  Electron/Playwright/browser shell — out of scope for a
//                  non-renderer Core pass
//   skip:removed   a removed-product plugin suite (Mini Notion / Margin Reader /
//                  Guardian / old Cloud Hosts plugin) — must stay removed
//   skip:paid      a real paid model API — separate paid-model coverage
//   skip:live      live acceptance / real remote host or SSH — coverage gap
//   skip:download  downloads official engine binaries (network) — coverage gap
//   skip:build     needs a built desktop executable / packaged app
//   run            isolated non-renderer Core contract — executed here
//
//   node tests/qa-core-coverage.cjs --list
//   node tests/qa-core-coverage.cjs --concurrency 3
//
// Owns artifacts/full-acceptance-20261015/core-coverage/ only.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'AgentBoard/Aexus');
const applicationAt = process.argv.indexOf('--application');
const PKG = applicationAt < 0 ? SOURCE : path.resolve(process.argv[applicationAt + 1]);
if(PKG!==SOURCE)fs.cpSync(path.join(SOURCE,'test'),path.join(PKG,'test'),{recursive:true});
fs.mkdirSync(path.join(PKG,'artifacts'),{recursive:true});
const TEST = path.join(PKG, 'test');
const OUT = path.join(ROOT, 'artifacts/full-acceptance-20261015/core-coverage');
const LOGS = path.join(OUT, 'logs');
const PRIOR = path.join(ROOT, 'artifacts/full-acceptance-20261015/qa-embedded-suite.json');

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[^\S\n]*\/\/.*$/gm, '')
  .replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');

const sha256 = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
};

function priorSelected() {
  try {
    const r = JSON.parse(fs.readFileSync(PRIOR, 'utf8'));
    return new Set((r.results || []).map((e) => e.file));
  } catch { return new Set(); }
}

const PAID = new Set(['deepseek-live-test.mjs', 'avatar-api-live-test.mjs']);
const BUILD_NEEDS = new Set(['secretary-role-core-test.mjs', 'packaged-desktop-smoke-test.mjs', 'mac-launchservices-test.mjs']);
const OPT_IN_ENGINES = new Set(['process-engines-native-test.mjs','cline-provider-native-test.mjs','pi-provider-native-test.mjs']);
// Semantically removed-plugin suites whose filename does not say so: they assert
// the three removed bundled plugins (cloud-hosts / mininotion / margin-reader)
// still exist and open.
const REMOVED_SEMANTIC = new Set(['platform-smoke-test.mjs', 'worker-only-test.mjs', 'cloud-hosts-test.mjs', 'cloud-workbench-test.mjs', 'web-desktop-relay-test.mjs']);
// Native host-machine / VM-Lab / remote-terminal domain. Root AGENTS.md declares
// "主机管理与 VM Lab 独立" — independent of the Company/Messages/Plan/agent/host core.
const HOST_MACHINE = new Set([
  'cloud-host-health-test.mjs', 'cloud-migration-test.mjs', 'cloud-native-worker-test.mjs',
  'cloud-terminal-stress-test.mjs', 'ssh-integration-test.mjs', 'remote-terminal-test.mjs',
]);

function classify(file, source) {
  const name = file;
  const isPrior = priorSelected().has(name);
  if (isPrior && !process.argv.includes('--include-covered')) return { category: 'covered', reason: 'already executed by the qa embedded sweep (qa-embedded-suite.json)' };

  if (/mininotion|margin[-_]?reader|guardian|notion|plugin/i.test(name) || REMOVED_SEMANTIC.has(name)) {
    return { category: 'skip:removed', reason: 'removed-product plugin suite (Mini Notion / Margin Reader / Guardian / old Cloud Hosts plugin)' };
  }
  if (HOST_MACHINE.has(name)) {
    return { category: 'skip:host-machine', reason: 'native host-management / VM Lab / remote-terminal domain — independent per root AGENTS.md; out of Company/Messages/Plan/agent/host core scope' };
  }
  if (PAID.has(name)) {
    return { category: 'skip:paid', reason: 'real paid model API — separate paid-model coverage; explicit gap' };
  }
  if (BUILD_NEEDS.has(name)) {
    return { category: 'skip:build', reason: 'needs a built desktop executable / packaged app (AGENTS_COMPANY_TEST_APP)' };
  }
  if (OPT_IN_ENGINES.has(name)) {
    return { category: 'skip:live', reason: 'opt-in installed-engine protocol test (AGENTS_TEST_CLINE_BIN / AGENTS_TEST_PI_BIN)' };
  }
  if (/-ui-test\.mjs$/.test(name) || /webkit/i.test(name) ||
      /from\s+['"]@playwright|require\(['"]@playwright|_electron|BrowserWindow|chrome-launcher|from\s+['"]electron['"]|require\(['"]electron['"]/.test(source)) {
    return { category: 'skip:renderer', reason: 'Electron/Playwright/browser shell — out of scope for a non-renderer Core pass' };
  }
  if (/-live-test\.mjs$/.test(name) ||
      /AC_HOOK_HOST|example-linux|_LIVE_ACCEPTANCE/.test(source)) {
    return { category: 'skip:live', reason: 'live acceptance / real remote host or SSH — coverage gap (opt-in env or real host)' };
  }
  if (name === 'engine-install-test.mjs' || /Downloads official pinned native binaries/.test(source)) {
    return { category: 'skip:download', reason: 'downloads official engine binaries (network) — not a paid model call but network-bound' };
  }
  return { category: 'run', reason: 'isolated non-renderer Core contract' };
}

function discover() {
  const files = fs.readdirSync(TEST).filter((f) => /-test\.mjs$/.test(f)).sort();
  const rows = files.map((file) => {
    const raw = fs.readFileSync(path.join(TEST, file), 'utf8');
    const s = stripComments(raw);
    const doc = (raw.match(/^\/\*[\s\S]*?\*\//) || [''])[0].replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = classify(file, s);
    return { file, category: c.category, reason: c.reason, doc };
  });
  return rows;
}

function cleanEnv() {
  const env = { ...process.env };
  // Isolate each suite from the invoking shell. The manager's shell carries an
  // Anthropic-compatible DeepSeek relay (ANTHROPIC_BASE_URL /
  // ANTHROPIC_DEFAULT_*_MODEL / ANTHROPIC_AUTH_TOKEN), which flips
  // claude-provider into deepSeekProvider and then rejects the suites'
  // deterministic loopback model names ("fixture-claude" etc.) — and would give
  // a real paid endpoint to any stray call. Strip every provider/relay variable
  // and every AGENTS_COMPANY_* variable; the suites/fixtures set their own.
  for (const key of Object.keys(env)) {
    if (/^(ANTHROPIC|OPENAI|DEEPSEEK|CLAUDE|CODEX|GEMINI|GOOGLE_AI|MISTRAL|XAI|GROQ|TOGETHER|PERPLEXITY|REPLICATE|FIREWORKS|TOGETHERAI|AZURE_OPENAI)_/i.test(key) ||
        /^AGENTS_COMPANY_/.test(key)) {
      delete env[key];
    }
  }
  return env;
}

// These suites use explicit loopback models, or the native /usage-only metadata test.
const NATIVE_LOCAL_FIXTURES = new Set(['cline-provider-native-test.mjs','discussion-claude-native-test.mjs','discussion-codex-native-test.mjs','employee-initialization-engine-test.mjs','employee-lifecycle-test.mjs','manager-agent-test.mjs','manager-bootstrap-engine-test.mjs','manager-claude-test.mjs','model-catalog-test.mjs','native-execution-test.mjs','pi-provider-native-test.mjs','secretary-api-native-test.mjs','shared-engine-config-test.mjs','task-view-claude-test.mjs','native-claude-clone-test.mjs']);
function runSuite(file, timeoutMs, env) {
  return new Promise((resolve) => {
    fs.mkdirSync(LOGS, { recursive: true });
    const logPath = path.join(LOGS, file.replace(/\.mjs$/, '.log'));
    const log = fs.createWriteStream(logPath);
    const profile=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-core-suite-'))),control=path.join(profile,'control');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');
    const isolated={...env,AGENTS_COMPANY_PROFILE_APPLICATION:PKG,CODEX_HOME:path.join(profile,'codex'),CLAUDE_CONFIG_DIR:path.join(profile,'claude'),AC_INIT_FIXTURE:control};
    fs.mkdirSync(isolated.CODEX_HOME);fs.mkdirSync(isolated.CLAUDE_CONFIG_DIR);
    if(!NATIVE_LOCAL_FIXTURES.has(file)){
      const denied=path.join(profile,'unconfigured-claude.cjs');fs.writeFileSync(denied,'#!/usr/bin/env node\nif(process.argv.includes("--version")){console.log("fixture-only")}else{console.error("No deterministic Claude fixture configured for this suite");process.exit(2)}\n',{mode:0o755});
      Object.assign(isolated,{CODEX_BIN:path.join(PKG,'test/fixtures/initialization-codex.cjs'),CLAUDE_BIN:denied,CLINE_BIN:path.join(PKG,'test/fixtures/process-adapter.cjs'),PI_BIN:path.join(PKG,'test/fixtures/process-adapter.cjs')});
    }
    const started = Date.now();
    const child = spawn(process.execPath, [path.join('test', file==='cli-test.mjs'?'run-headless.mjs':file)], {
      cwd: PKG, env:isolated, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let output = '';
    const collect = (d) => { output += d; log.write(d); if (output.length > 400000) output = output.slice(-200000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, timeoutMs);
    child.on('error', (error) => log.write(`\nspawn error: ${error.message}\n`));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // Reap any orphaned grandchildren (e.g. a `bin/agents serve` left behind by
      // a suite that crashed before its own close()). The suite is the process
      // group leader; this signals only processes this runner started.
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000).unref();
      log.end();fs.rmSync(profile,{recursive:true,force:true});
      resolve({
        file, code, signal: signal || null, timedOut, ms: Date.now() - started,
        status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed',
        log: path.relative(ROOT, logPath),
        tail: output.trim().split('\n').slice(-8).join('\n'),
      });
    });
  });
}

function provenance() {
  let git = null, release = null;
  try { git = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}
  try {
    const r = JSON.parse(fs.readFileSync(path.join(ROOT, 'release.json'), 'utf8'));
    release = { version: r.version, buildId: r.buildId };
  } catch {}
  return {
    gitHead: git,
    release,
    commandInputsSha256: sha256(path.join(PKG, 'bin', 'command-inputs.json')),
    apiRegistrySha256: sha256(path.join(PKG, 'src', 'shared', 'api-registry.ts')),
    tool: path.relative(ROOT, __filename),
    node: process.version,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const concurrencyAt = argv.indexOf('--concurrency');
  const concurrency = concurrencyAt >= 0 ? Number(argv[concurrencyAt + 1]) : 3;
  const timeoutAt = argv.indexOf('--timeout');
  const timeoutMs = timeoutAt >= 0 ? Number(argv[timeoutAt + 1]) * 1000 : 180000;
  const rows = discover();
  const counts = {};
  for (const r of rows) counts[r.category] = (counts[r.category] || 0) + 1;

  if (argv.includes('--list')) {
    for (const r of rows) console.log(`${r.category.padEnd(14)} ${r.file} :: ${r.reason}`);
    console.log('\nCOUNTS', JSON.stringify(counts));
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), provenance: provenance(), counts, rows,
  }, null, 2));

  const onlyAt = argv.indexOf('--only');
  const only = onlyAt >= 0 ? new Set(String(argv[onlyAt + 1]).split(',')) : null;
  let queue = rows.filter((r) => r.category === 'run');
  if (only) queue = queue.filter((r) => only.has(r.file));
  console.log(`core-coverage: run=${queue.length} concurrency=${concurrency} timeout=${timeoutMs / 1000}s (${rows.length} suites inventoried${only ? ', --only' : ''})`);
  const env = cleanEnv();
  const results = [];
  await Promise.all(Array.from({ length: Math.max(1, Math.min(3, concurrency)) }, async () => {
    while (queue.length) {
      const row = queue.shift();
      const result = await runSuite(row.file, timeoutMs, env);
      results.push(result);
      console.log(`${result.status.toUpperCase().padEnd(7)} ${result.file} (${result.ms}ms)`);
    }
  }));

  const rcounts = results.reduce((acc, r) => (acc[r.status] = (acc[r.status] || 0) + 1, acc), {});
  const summary = {
    generatedAt: new Date().toISOString(),
    provenance: provenance(),
    inventory: { counts, total: rows.length },
    run: { counts: rcounts, total: results.length, results: results.sort((a, b) => a.file.localeCompare(b.file)) },
    skips: rows.filter((r) => r.category !== 'run' && r.category !== 'covered')
      .map((r) => ({ file: r.file, category: r.category, reason: r.reason })),
    covered: rows.filter((r) => r.category === 'covered').map((r) => r.file),
  };
  fs.writeFileSync(path.join(OUT, only ? 'rerun-results.json' : 'results.json'), JSON.stringify(summary, null, 2));
  console.log('RUN-COUNTS', JSON.stringify(rcounts), '->', path.relative(ROOT, OUT));
  process.exitCode = rcounts.failed || rcounts.timeout ? 1 : 0;
}

main();
