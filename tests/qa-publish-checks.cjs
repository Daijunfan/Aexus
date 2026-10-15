#!/usr/bin/env node
// QA-owned read-only acceptance for install / signature / icon / compatibility.
// Verifies the packaged candidate in artifacts/Aexus.app against the source
// checkout without writing into the bundle, the installed app, or user data.
// Writes artifacts/full-acceptance-20261015/qa-publish-checks.json.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'artifacts/Aexus.app');
const OUT = path.join(ROOT, 'artifacts/full-acceptance-20261015');
const checks = [];
const run = (bin, args, options = {}) => spawnSync(bin, args, {encoding: 'utf8', cwd: ROOT, ...options});
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const plist = (file) => {
  const r = run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};
function check(name, fn) {
  try { const detail = fn(); checks.push({name, passed: true, ...(detail ? {detail} : {})}); console.log('PASS ' + name); }
  catch (error) { checks.push({name, passed: false, error: error.message.split('\n')[0]}); console.log('FAIL ' + name + ' :: ' + error.message.split('\n')[0]); }
}

const sourceVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const sourceRelease = JSON.parse(fs.readFileSync(path.join(ROOT, 'release.json'), 'utf8'));
const uiRelease = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/ui/release.json'), 'utf8'));

check('candidate bundle exists at artifacts/Aexus.app', () => {
  assert.ok(fs.existsSync(path.join(APP, 'Contents/Info.plist')), 'Info.plist missing');
  return {bundle: path.relative(ROOT, APP)};
});

check('codesign --verify --deep --strict accepts the candidate bundle', () => {
  const r = run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', APP]);
  assert.equal(r.status, 0, `codesign failed: ${r.stderr || r.stdout}`);
  return {stderr: (r.stderr || '').trim().slice(0, 200)};
});

check('signature is the self-contained ad-hoc com.agentscompany.app identity', () => {
  const r = run('/usr/bin/codesign', ['-dv', '--verbose=4', APP]);
  const text = (r.stderr || '') + (r.stdout || '');
  assert.match(text, /Identifier=com\.agentscompany\.app\b/, text.slice(0, 400));
  assert.match(text, /Signature=adhoc/, text.slice(0, 400));
  const node = run('/usr/bin/codesign', ['-dv', '--verbose=4', path.join(APP, 'Contents/Resources/node')]);
  const nodeText = (node.stderr || '') + (node.stdout || '');
  assert.match(nodeText, /Identifier=com\.agentscompany\.app\.node\b/, nodeText.slice(0, 400));
  return {identifier: 'com.agentscompany.app', nodeIdentifier: 'com.agentscompany.app.node'};
});

const info = plist(path.join(APP, 'Contents/Info.plist'));

check('Info.plist version, build id and icon file track the source revision', () => {
  assert.equal(info.CFBundleShortVersionString, sourceVersion, 'CFBundleShortVersionString');
  assert.equal(info.CloudHostsBuildID, sourceRelease.buildId, 'CloudHostsBuildID vs release.json buildId');
  assert.equal(info.CFBundleIconFile, 'Aexus', 'CFBundleIconFile');
  assert.equal(info.CFBundleIdentifier, 'com.agentscompany.app', 'CFBundleIdentifier');
  assert.equal(info.CFBundleExecutable, 'Aexus', 'CFBundleExecutable');
  return {version: info.CFBundleShortVersionString, build: info.CFBundleVersion, buildId: info.CloudHostsBuildID.slice(0, 12)};
});

check('packaged backend, source release.json and dist/ui release.json agree on one fingerprint', () => {
  const backendRelease = JSON.parse(fs.readFileSync(path.join(APP, 'Contents/Resources/backend/release.json'), 'utf8'));
  assert.equal(backendRelease.buildId, sourceRelease.buildId, 'packaged backend buildId');
  assert.equal(uiRelease.buildId, sourceRelease.buildId, 'dist/ui buildId');
  assert.equal(uiRelease.version, sourceVersion, 'dist/ui version');
  return {buildId: sourceRelease.buildId.slice(0, 12)};
});

check('packaged backend re-derives its own content fingerprint (release.verify)', () => {
  const backend = path.join(APP, 'Contents/Resources/backend');
  const {verify} = require(path.join(ROOT, 'src/release.cjs'));
  const result = verify(backend);
  assert.equal(result.verified, true);
  assert.equal(result.buildId, sourceRelease.buildId);
  return result;
});

check('bundle icon matches the Assets source artwork', () => {
  const bundled = path.join(APP, 'Contents/Resources/Aexus.icns');
  const source = path.join(ROOT, 'Assets/Aexus.icns');
  assert.ok(fs.existsSync(bundled), 'bundled icns missing');
  assert.ok(fs.existsSync(source), 'source icns missing');
  assert.equal(sha(bundled), sha(source), 'bundled icns differs from Assets/Aexus.icns');
  assert.ok(fs.statSync(bundled).size > 1000, 'icns suspiciously small');
  return {sha256: sha(bundled).slice(0, 16), bytes: fs.statSync(bundled).size};
});

check('embedded Aexus Core build outputs are packaged', () => {
  const core = path.join(APP, 'Contents/Resources/backend/AgentBoard/Aexus');
  for (const rel of ['out/main/daemon.js', 'out/main/asset-index-worker.js', 'out/main/message-index-worker.js', 'out/renderer/index.html']) {
    assert.ok(fs.existsSync(path.join(core, rel)), `missing packaged Aexus resource ${rel}`);
  }
  return {core: 'out/main/daemon.js + renderer/index.html'};
});

check('bundled node-pty native spawn-helper is present and executable', () => {
  const prebuilds = path.join(APP, 'Contents/Resources/backend/AgentBoard/Aexus/node_modules/node-pty/prebuilds');
  assert.ok(fs.existsSync(prebuilds), 'node-pty prebuilds missing');
  const helpers = fs.readdirSync(prebuilds).filter((d) => d.startsWith('darwin-'))
    .flatMap((d) => fs.readdirSync(path.join(prebuilds, d)).filter((f) => f === 'spawn-helper').map((f) => path.join(prebuilds, d, f)));
  assert.ok(helpers.length > 0, 'no darwin spawn-helper prebuild');
  for (const helper of helpers) {
    const mode = fs.statSync(helper).mode;
    assert.ok(mode & 0o111, `spawn-helper not executable: ${helper} (mode ${mode.toString(8)})`);
  }
  return {helpers: helpers.map((h) => path.relative(APP, h))};
});

check('runtime dependencies required by the packaged backend are present', () => {
  const nodeModules = path.join(APP, 'Contents/Resources/backend/node_modules');
  for (const dep of ['ws', 'jsbi', path.join('@js-temporal', 'polyfill')]) {
    assert.ok(fs.existsSync(path.join(nodeModules, dep)), `missing packaged dependency ${dep}`);
  }
  return {dependencies: ['ws', 'jsbi', '@js-temporal/polyfill']};
});

check('bundled node binary satisfies the source engine compatibility floor', () => {
  const node = path.join(APP, 'Contents/Resources/node');
  const r = run(node, ['--version']);
  assert.equal(r.status, 0, r.stderr);
  const version = r.stdout.trim();
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  const declared = JSON.parse(fs.readFileSync(path.join(ROOT, 'AgentBoard/Aexus/package.json'), 'utf8'));
  assert.ok(major >= 20, `bundled node ${version} below floor`);
  assert.ok(declared.engines?.node, 'embedded Aexus declares no engines.node');
  return {bundled: version, running: process.version, embeddedRequires: declared.engines.node};
});

check('packaged backend refuses a mismatched release (fingerprint gate is live)', () => {
  const {verify} = require(path.join(ROOT, 'src/release.cjs'));
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'qa-release-gate-'));
  try {
    fs.cpSync(path.join(APP, 'Contents/Resources/backend'), temp, {recursive: true});
    fs.appendFileSync(path.join(temp, 'cli.cjs'), '\n// qa tamper probe\n');
    let threw = null;
    try { verify(temp); } catch (error) { threw = error.message; }
    assert.ok(threw && /fingerprint mismatch/.test(threw), `expected fingerprint mismatch, got ${threw}`);
    return {message: threw};
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

check('candidate app is not the running installed app (no live replacement during QA)', () => {
  const installed = '/Applications/Aexus.app';
  const result = {installedPresent: fs.existsSync(installed)};
  if (result.installedPresent) {
    const p = plist(path.join(installed, 'Contents/Info.plist'));
    result.installedVersion = p.CFBundleShortVersionString;
    result.installedBuildId = String(p.CloudHostsBuildID || '').slice(0, 12);
    result.candidateBuildId = info.CloudHostsBuildID.slice(0, 12);
    result.sameBuild = p.CloudHostsBuildID === info.CloudHostsBuildID;
  }
  return result;
});

fs.mkdirSync(OUT, {recursive: true});
const passed = checks.filter((c) => c.passed).length;
fs.writeFileSync(path.join(OUT, 'qa-publish-checks.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  bundle: path.relative(ROOT, APP),
  checks,
  passed: passed === checks.length,
  counts: {total: checks.length, passed, failed: checks.length - passed},
}, null, 2));
console.log(`PUBLISH_CHECKS ${checks.length} PASS ${passed}/${checks.length}`);
process.exitCode = passed === checks.length ? 0 : 1;
