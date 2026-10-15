#!/usr/bin/env node
// QA-owned sweep of the embedded Aexus Core business tests that are runnable in
// this checkout. The embedded package is a carry-over from standalone Aexus and
// still contains Electron desktop, plugin and removed-product suites; those are
// excluded here with an explicit reason and are never restored by QA.
//
//   node tests/qa-embedded-suite.cjs --concurrency 3
//   node tests/qa-embedded-suite.cjs --list
//
// Writes artifacts/full-acceptance-20261015/qa-embedded-suite.json and one log
// per suite under artifacts/full-acceptance-20261015/qa-logs/embedded/.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PKG = path.join(ROOT, 'AgentBoard/Aexus');
const TEST = path.join(PKG, 'test');
const OUT = path.join(ROOT, 'artifacts/full-acceptance-20261015');
const LOGS = path.join(OUT, 'qa-logs/embedded');
const REPORT = path.join(OUT, 'qa-embedded-suite.json');

// Products the user explicitly removed from the shipping product. Suites that
// require them are stale harnesses, not product regressions.
const REMOVED_PRODUCT = /mininotion|margin-reader|marginreader|guardian|notion|plugin-|PlugIns/i;
// Suites that need a GUI shell or browser download; out of scope for a headless pass.
const NEEDS_GUI = /playwright|electron|BrowserWindow|chrome-launcher|Downloading Electron/i;

// Business areas the migration acceptance matrix actually covers.
const RELEVANT = /(messag|chat|group|conversation|reply|replies|quote|mention|attachment|draft|receipt|forward|deliver|ack|plan|schedul|compan|team|employe|manager|report|relation|delegat|permission|authority|secretary|task|session|language|theme|performance|asset|gallery|media|files|cloud-connection)/i;

// A comment is not a dependency. Repaired fixtures explain which product was
// removed or which shared document replaced the per-employee handbook, and a
// source-wide match on that prose used to drop those (passing) suites out of the
// sweep without a run — the exact "stale script vs true pass" confusion this
// report must avoid. Comment text is therefore removed before the dependency
// test, so only code that really needs the removed products is excluded.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[^\S\n]*\/\/.*$/gm, '')
  .replace(/([^:'"`])\/\/[^\n]*$/gm, '$1');

function discover() {
  const files = fs.readdirSync(TEST).filter((f) => /-test\.mjs$/.test(f)).sort();
  const selected = [], excluded = [];
  for (const file of files) {
    const full = path.join(TEST, file);
    const source = stripComments(fs.readFileSync(full, 'utf8'));
    if (REMOVED_PRODUCT.test(source) || REMOVED_PRODUCT.test(file)) {
      excluded.push({file, reason: 'references a product the user removed (Mini Notion / Margin Reader / Cloud Hosts / Guardian plugin)'});
    } else if (NEEDS_GUI.test(source) || /-ui-test\.mjs$/.test(file)) {
      excluded.push({file, reason: 'requires Electron/Playwright GUI shell or a browser download'});
    } else if (!RELEVANT.test(file)) {
      excluded.push({file, reason: 'outside the migrated feature matrix (no Company/Messages/Plan/Role/Agent surface)'});
    } else {
      selected.push(file);
    }
  }
  return {selected, excluded};
}

function runSuite(file, timeoutMs) {
  return new Promise((resolve) => {
    fs.mkdirSync(LOGS, {recursive: true});
    const logPath = path.join(LOGS, file.replace(/\.mjs$/, '.log'));
    const log = fs.createWriteStream(logPath);
    const started = Date.now();
    const child = spawn(process.execPath, [path.join('test', file)], {cwd: PKG, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    const collect = (d) => { output += d; log.write(d); if (output.length > 400000) output = output.slice(-200000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true; try { child.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => log.write(`\nspawn error: ${error.message}\n`));
    child.on('close', (code, signal) => {
      clearTimeout(timer); log.end();
      resolve({
        file, code, signal: signal || null, timedOut, ms: Date.now() - started,
        status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed',
        log: path.relative(ROOT, logPath),
        tail: output.trim().split('\n').slice(-6).join('\n'),
      });
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const concurrencyAt = argv.indexOf('--concurrency');
  const concurrency = concurrencyAt >= 0 ? Number(argv[concurrencyAt + 1]) : 3;
  const timeoutAt = argv.indexOf('--timeout');
  const timeoutMs = timeoutAt >= 0 ? Number(argv[timeoutAt + 1]) * 1000 : 120000;
  const {selected, excluded} = discover();
  if (argv.includes('--list')) {
    console.log(`selected ${selected.length}, excluded ${excluded.length}`);
    selected.forEach((f) => console.log('  RUN ' + f));
    excluded.forEach((e) => console.log('  SKIP ' + e.file + ' :: ' + e.reason));
    return;
  }
  console.log(`embedded sweep: selected=${selected.length} excluded=${excluded.length} concurrency=${concurrency} timeout=${timeoutMs / 1000}s`);
  const queue = selected.slice();
  const results = [];
  await Promise.all(Array.from({length: Math.max(1, Math.min(4, concurrency))}, async () => {
    while (queue.length) {
      const file = queue.shift();
      const result = await runSuite(file, timeoutMs);
      results.push(result);
      console.log(`${result.status.toUpperCase().padEnd(7)} ${file} (${result.ms}ms)`);
    }
  }));
  const counts = results.reduce((acc, r) => (acc[r.status] = (acc[r.status] || 0) + 1, acc), {});
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(REPORT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    cwd: path.relative(ROOT, PKG),
    counts, results: results.sort((a, b) => a.file.localeCompare(b.file)), excluded,
  }, null, 2));
  console.log('COUNTS', JSON.stringify(counts), '->', path.relative(ROOT, REPORT));
  process.exitCode = counts.failed || counts.timeout ? 1 : 0;
}

main();
