// Real native OpenCode TUI through the real Agent Board engine path (same-host),
// on the Mac controller, GPU-server (bupt208 Linux) and DJF-Windows. Verifies the
// actual screen becomes ready, a write + execute turn lands in the chosen workspace,
// and stop/disconnect then resume keeps the SAME native session id. No standalone ACP
// probes substitute for the TUI path; the native session id is asserted, not inferred.
// Isolated Core registry plus (local only) isolated XDG OpenCode storage; remote hosts
// keep their host-native OpenCode auth/config untouched. Local uses
// deepseek/deepseek-flash; remote uses the host-native default model for one tiny turn.
// Usage: node tests/opencode-tui-native-live.cjs local|gpu|windows
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const kind = process.argv[2];
if (!['local', 'gpu', 'windows'].includes(kind)) throw Error('local|gpu|windows required');
const windows = kind === 'windows';
const tag = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const marker = 'TUI-OK-' + kind;
const cwd = kind === 'local'
  ? fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-tui-local-')))
  : windows
    ? 'C:\\Users\\djf\\AppData\\Local\\Temp\\opencode-tui-native-' + tag
    : '/tmp/opencode-tui-native-' + tag;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhosts-opencode-tui-'));
process.env.CLOUD_HOSTS_HOME = path.join(temp, 'core');
const evidenceDir = path.resolve(__dirname, '..', 'artifacts', 'role-parity-20261016', 'opencode-tui-native');
fs.mkdirSync(evidenceDir, {recursive: true});

// Local only: isolated XDG storage keeps the real user OpenCode history out of the
// test and pins the small DeepSeek model. The native auth.json deepseek key is copied
// (never printed) so the CLI/IDE credential remains the single source of truth.
let xdgConfig, xdgData;
if (kind === 'local') {
  const realAuth = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
  assert.ok(fs.existsSync(realAuth), 'real OpenCode auth.json missing: ' + realAuth);
  const auth = JSON.parse(fs.readFileSync(realAuth, 'utf8'));
  assert.ok(auth.deepseek && auth.deepseek.type === 'api' && auth.deepseek.key, 'real DeepSeek native auth missing');
  xdgConfig = path.join(temp, 'xdg-config');
  xdgData = path.join(temp, 'xdg-data');
  fs.mkdirSync(path.join(xdgConfig, 'opencode'), {recursive: true});
  fs.mkdirSync(path.join(xdgData, 'opencode'), {recursive: true});
  fs.writeFileSync(path.join(xdgConfig, 'opencode', 'opencode.json'), JSON.stringify({enabled_providers: ['deepseek'], model: 'deepseek/deepseek-flash'}));
  fs.writeFileSync(path.join(xdgData, 'opencode', 'auth.json'), JSON.stringify({deepseek: {type: 'api', key: auth.deepseek.key}}), {mode: 0o600});
  process.env.XDG_CONFIG_HOME = xdgConfig;
  process.env.XDG_DATA_HOME = xdgData;
}

const {spawnSync} = require('node:child_process');
const quote = text => "'" + String(text).replaceAll("'", "'\\''") + "'";
const powershell = text => 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' + Buffer.from(text, 'utf16le').toString('base64');
// Direct SSH for workspace setup/teardown only (the TUI itself goes through the
// real terminal broker path below). Reuses the same ssh config aliases.
const remoteSetup = (win, linux) => {
  const cmd = windows ? powershell(win) : linux;
  const options = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', ...(windows ? ['-J', 'bupt208'] : []), windows ? 'DJF-Windows' : 'bupt208', cmd];
  const result = spawnSync('ssh', options, {encoding: 'utf8', timeout: 60000});
  if (result.status !== 0) throw Error('remote setup failed: ' + (result.stderr || result.stdout).slice(-800));
};

const agents = require('../src/agent-sessions.cjs');
const registry = require('../src/registry.cjs');
const terminals = require('../src/terminals.cjs');
const hosts = require('../src/agent-hosts.cjs');
const ssh = require('../src/ssh.cjs');

const strip = text => String(text).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
const evidence = (stage, raw) => {
  fs.writeFileSync(path.join(evidenceDir, kind + '-' + tag + '-' + stage + '.raw.txt'), raw, 'utf8');
  fs.writeFileSync(path.join(evidenceDir, kind + '-' + tag + '-' + stage + '.txt'), strip(raw), 'utf8');
};

async function readFiles() {
  if (kind === 'local') {
    const ok = fs.existsSync(path.join(cwd, 'tui-ok.txt')) ? fs.readFileSync(path.join(cwd, 'tui-ok.txt'), 'utf8').trim() : '';
    const ex = fs.existsSync(path.join(cwd, 'tui-exec.txt')) ? fs.readFileSync(path.join(cwd, 'tui-exec.txt'), 'utf8') : '';
    return {ok, ex};
  }
  const cmd = windows
    ? "if (Test-Path -LiteralPath tui-ok.txt) { Get-Content -LiteralPath tui-ok.txt -Raw }; Write-Output '@@'; if (Test-Path -LiteralPath tui-exec.txt) { Get-Content -LiteralPath tui-exec.txt -Raw }"
    : "cat tui-ok.txt 2>/dev/null; printf '@@'; cat tui-exec.txt 2>/dev/null";
  const result = await ssh.execute(hostId, cmd, cwd, 30);
  const parts = result.stdout.split('@@');
  return {ok: (parts[0] || '').trim(), ex: parts[1] || ''};
}

async function untilReady(terminalId, label, ms) {
  const deadline = Date.now() + ms;
  let screen = '', raw = '';
  while (Date.now() < deadline) {
    const frame = await terminals.read(terminalId, 0, 250);
    if (!frame.running) throw Error(label + ' TUI exited before ready. Last screen:\n' + strip(frame.output).slice(-1200));
    raw = frame.output; screen = strip(raw);
    // 1.19.0 renders the main view footer ("Build · <model>") and its bottom
    // command bar; the empty input box has no visible placeholder in this build.
    if (/Ask anything|Build\s*·/.test(screen)) return {screen, raw};
    await settle(120);
  }
  throw Error(label + ' TUI not ready in ' + ms + 'ms. Last screen:\n' + screen.slice(-2000));
}

async function waitForFiles(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const files = await readFiles();
    if (files.ok === marker && files.ex.includes('EXEC-OK')) return files;
    await settle(1500);
  }
  const files = await readFiles();
  throw Error('workspace files not produced: tui-ok=[' + files.ok + '] tui-exec=[' + files.ex.slice(0, 60) + ']');
}

async function exportSession(sessionId) {
  const child = hosts.processOn(hosts.get(hostId), 'opencode', ['export', sessionId], {cwd});
  let out = '', err = '';
  child.stdout.on('data', data => {out = (out + data).slice(-4 * 1024 * 1024);});
  child.stderr.on('data', data => {err = (err + data).slice(-2000);});
  child.stdin.on('error', () => {});
  child.stdin.end();
  const code = await new Promise(resolve => child.once('close', resolve));
  if (code) throw Error('opencode export failed (' + code + '): ' + err.slice(-400));
  return out;
}

const taskText = 'Create a file named tui-ok.txt in the current directory with the exact content ' + marker + '. Then run the shell command `echo EXEC-OK > tui-exec.txt`. Do not add commentary.';
let hostId, role, originalSessionId, originalTerminalId;
(async () => {
  if (kind === 'local') {
    hostId = 'local';
  } else {
    remoteSetup(
      "New-Item -ItemType Directory -Path '" + cwd + "' -Force | Out-Null",
      'mkdir -p -- ' + quote(cwd));
    hostId = registry.create({name: 'OpenCode Native TUI QA', host: windows ? 'DJF-Windows' : 'bupt208',
      ...(windows ? {jump: 'bupt208'} : {}), os: windows ? 'windows' : 'linux', defaultDirectory: cwd}).id;
  }
  try {
    role = await agents.open({engineHostId: hostId, targetHostId: hostId, engine: 'opencode', directory: cwd,
      name: 'Isolated OpenCode Native TUI', permission: 'full', creationId: 'opencode-tui-native-' + tag});
    assert.equal(role.running, true, 'role must be running after open');
    assert.equal(role.engineHostId, role.targetHostId, 'same-host native TUI only');
    assert.ok(role.terminalId, 'role must have a terminal');
    originalSessionId = role.nativeSessionId;
    originalTerminalId = role.terminalId;
    assert.ok(originalSessionId, 'native OpenCode session id must be allocated');
    console.log('[' + kind + '] opened role', role.id, 'session', originalSessionId, 'terminal', originalTerminalId);

    const ready = await untilReady(originalTerminalId, kind, kind === 'local' ? 60000 : 120000);
    evidence('ready', ready.raw);
    const modelLine = ready.screen.match(/DeepSeek[^\r\n]{0,40}/i);
    console.log('[' + kind + '] TUI ready; model footer: ' + (modelLine ? modelLine[0].replace(/\s+/g, ' ') : '(not shown)'));

    await settle(2000);
    await terminals.input(originalTerminalId, taskText + '\r');
    console.log('[' + kind + '] task submitted');
    const files = await waitForFiles(240000);
    assert.equal(files.ok, marker, 'write tool must produce exact content');
    assert.ok(files.ex.includes('EXEC-OK'), 'exec tool must produce EXEC-OK');
    if (kind !== 'local') assert.ok(!fs.existsSync(cwd), 'cloud workspace must not exist on the local Mac: ' + cwd);
    console.log('[' + kind + '] write+execute landed in workspace: ' + cwd);

    await settle(3500);
    const doneScreen = strip((await terminals.read(originalTerminalId, 0, 0)).output);
    evidence('after-task', doneScreen);
    if (!/Done\./.test(doneScreen)) console.log('[' + kind + '] note: "Done." marker not yet visible; files are the authoritative result');

    await agents.close({id: hostId, session: role.id});
    assert.equal(agents.sessions(hostId)[0].running, false, 'role must be stopped after close');
    await settle(1500);

    const exported = await exportSession(originalSessionId);
    assert.ok(exported.includes(marker), 'native export must contain the exact session work (same session id)');
    console.log('[' + kind + '] native export confirms session ' + originalSessionId + ' holds the turn');

    const resumed = await agents.activate({id: hostId, session: role.id});
    assert.equal(resumed.running, true, 'role must be running after resume');
    assert.equal(resumed.nativeSessionId, originalSessionId, 'resume must keep the SAME native session id');
    assert.ok(resumed.terminalId && resumed.terminalId !== originalTerminalId, 'resume opens a fresh terminal');
    console.log('[' + kind + '] resumed; native session id preserved: ' + resumed.nativeSessionId);

    const resumedReady = await untilReady(resumed.terminalId, kind + ' resume', kind === 'local' ? 60000 : 120000);
    evidence('resumed', resumedReady.raw);
    // Collapse whitespace so line-wrapping/ANSI can never produce a false negative.
    const screen = resumedReady.screen.replace(/\s+/g, ' ');
    const historyVisible = /tui-ok\.txt|TUI-OK-|EXEC-OK/.test(screen);
    // Resume integrity is proven by the SAME native session id plus a complete export
    // that contains the exact turn work — not by what the TUI re-renders on screen.
    // opencode 1.19.0 resume shows an empty message area (footer + command bar), so a
    // blank resumed screen is an expected UI observation, never a pass criterion.
    console.log('[' + kind + '] resumed TUI ready; prior history rendered on screen: ' + historyVisible + ' (resume proven by nativeSessionId=' + resumed.nativeSessionId + ' + export, not by screen replay)');
    console.log('OPC_TUI_NATIVE=' + kind.toUpperCase() + '_PASS sessionPreserved=yes nativeSessionId=' + originalSessionId);
  } finally {
    if (role) {
      try {
        await agents.close({id: hostId, session: role.id});
        await agents.remove({id: hostId, session: role.id, confirm: true});
      } catch (error) {console.error('[' + kind + '] close/remove cleanup:', error.message);}
    }
    await agents.shutdown();
    await terminals.shutdown();
    if (kind !== 'local') {
      try {
        remoteSetup(
          "Remove-Item -LiteralPath '" + cwd + "' -Recurse -Force -ErrorAction SilentlyContinue",
          'rm -rf -- ' + quote(cwd));
      } catch (error) {console.error('[' + kind + '] remote cleanup:', error.message);}
    }
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(error => {console.error('[' + kind + '] FAIL:', error); process.exitCode = 1;});
