// Deterministic verification (no model, no real OpenCode binary) of the
// outer-layer OpenCode permission wiring:
//   src/agent-cli.cjs          opencodePermissionEnvironment helper (JSON parity)
//   src/agent-companion.cjs     openOpenCode -> hosts.processOn environment
//   src/agent-sessions.cjs      native TUI -> terminals.openTerminal environment
//   src/terminals.cjs           writes + validates the terminal environment
//   Runtime/terminal.py         injects environment into the remote TUI command
// The remote TUI injection is exercised end-to-end with a fake `ssh` (via
// CLOUD_HOSTS_SSH) so no real SSH, model, or user host is touched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const agentCli = require('../src/agent-cli.cjs');

const ASKED = ['edit', 'bash', 'task', 'external_directory', 'todowrite', 'webfetch', 'websearch'];
let failures = 0;
function assert(name, cond, got) {
  if (cond) { console.log('PASS', name); return; }
  failures++;
  console.error('FAIL', name, '->', JSON.stringify(got));
}
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function helperParity() {
  // Ask: the official per-process override asks for every dangerous tool in the
  // root permission map and in all four agent modes (parity with the embedded
  // opencode-client.ts opencodePermissionOverride).
  const env = agentCli.opencodePermissionEnvironment('ask');
  assert('ask: single OPENCODE_CONFIG_CONTENT key', Object.keys(env).length === 1 && typeof env.OPENCODE_CONFIG_CONTENT === 'string', env);
  let cfg;
  try { cfg = JSON.parse(env.OPENCODE_CONFIG_CONTENT); } catch { cfg = null; }
  assert('ask: valid JSON override', !!cfg, env.OPENCODE_CONFIG_CONTENT);
  for (const tool of ASKED) assert('ask: permission.' + tool + ' = ask', cfg?.permission?.[tool] === 'ask', cfg?.permission);
  for (const mode of ['build', 'plan', 'general', 'explore']) {
    assert('ask: agent.' + mode + '.permission present', !!cfg?.agent?.[mode]?.permission, cfg?.agent?.[mode]);
    for (const tool of ASKED) assert('ask: agent.' + mode + '.permission.' + tool + ' = ask', cfg?.agent?.[mode]?.permission?.[tool] === 'ask', cfg?.agent?.[mode]?.permission);
  }
  // Full: no override -> the host's native default (Full) stays in effect.
  const full = agentCli.opencodePermissionEnvironment('full');
  assert('full: no override (native default Full)', Object.keys(full).length === 0, full);
}

function sourceWiring() {
  const sessions = read('src/agent-sessions.cjs');
  assert('agent-sessions: opencode ask gate references helper', /item\.engine==='opencode'&&target\.id!=='local'&&item\.permission==='ask'/.test(sessions) && /opencodePermissionEnvironment\('ask'\)/.test(sessions));
  const envIdx = sessions.indexOf("const environment = route ? route.environment");
  const termIdx = sessions.indexOf('terminals.openTerminal(owner');
  assert('agent-sessions: environment computed before openTerminal', envIdx > -1 && termIdx > envIdx, { envIdx, termIdx });
  assert('agent-sessions: environment passed to openTerminal', /\.\.\.\(environment \? \{environment\} : \{\}\)/.test(sessions));

  const companion = read('src/agent-companion.cjs');
  assert('agent-companion: openOpenCode passes helper env to processOn', /opencodePermissionEnvironment\(this\.role\.permission\)/.test(companion) && /hosts\.processOn\(machine,'opencode',\['acp'\],\{cwd,environment\}\)/.test(companion));

  const terminals = read('src/terminals.cjs');
  assert('terminals: validates terminal environment', /Invalid terminal environment/.test(terminals));
  assert('terminals: writes environment into terminal config', /\.\.\.\(options\.environment \? \{environment:options\.environment\} : \{\}\)/.test(terminals));

  const terminalPy = read('Runtime/terminal.py');
  assert('terminal.py: allows opencode engine', /'codex', 'claude', 'cline', 'pi', 'opencode'/.test(terminalPy));
  assert('terminal.py: validates terminal environment', /Invalid terminal environment/.test(terminalPy));
  assert('terminal.py: POSIX export injection', /env_exports = ''.join\('export '/.test(terminalPy));
  assert('terminal.py: Windows $env injection', /env_assign = ''.join\("\$env:"/.test(terminalPy));
}

// The native TUI for a same-host cloud OpenCode role runs through
// Runtime/terminal.py over SSH. A fake ssh (CLOUD_HOSTS_SSH) captures the exact
// argv terminal.py would hand to OpenSSH, proving the per-process override is
// injected into the remote POSIX shell and Windows PowerShell command.
function runTerminal(targetOs) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-terminal-env-'));
    const fakeSsh = path.join(dir, 'ssh');
    const log = path.join(dir, 'argv.log');
    fs.writeFileSync(fakeSsh, '#!/bin/sh\n: > ' + JSON.stringify(log) + '\nfor a in "$@"; do printf \'%s\\n\' "$a" >> ' + JSON.stringify(log) + '; done\nexit 0\n', { mode: 0o700 });
    const cfgFile = path.join(dir, 'cfg.json');
    fs.writeFileSync(cfgFile, JSON.stringify({
      cwd: '/tmp', cols: 80, rows: 24, command: 'opencode', commandArgs: ['--session', 's1'],
      environment: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { edit: 'ask' } }) },
      remote: { host: 'fake-host', directory: '/tmp', os: targetOs },
    }));
    const child = spawn('python3', ['-B', '-u', path.join(__dirname, '..', 'Runtime', 'terminal.py'), cfgFile], {
      env: { ...process.env, CLOUD_HOSTS_SSH: fakeSsh }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    // Keep stdin open: the broker exits through the fake ssh's master EOF, and
    // closing stdin would SystemExit the parent and SIGHUP the child first.
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      let argv = [];
      try { argv = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch {}
      fs.rmSync(dir, { recursive: true, force: true });
      resolve({ code, stderr, argv });
    });
  });
}

(async () => {
  helperParity();
  sourceWiring();

  const posix = await runTerminal('linux');
  const posixLine = posix.argv.find(a => a.includes('export OPENCODE_CONFIG_CONTENT=')) || '';
  assert('terminal.py remote POSIX: export injected into ssh command', posixLine.includes('export OPENCODE_CONFIG_CONTENT=') && posixLine.includes('permission') && posixLine.includes('edit'), posixLine);

  const win = await runTerminal('windows');
  const encoded = win.argv.find(a => a.includes('-EncodedCommand '));
  let decoded = '';
  if (encoded) {
    const b64 = encoded.slice(encoded.indexOf('-EncodedCommand ') + '-EncodedCommand '.length);
    try { decoded = Buffer.from(b64, 'base64').toString('utf16le'); } catch {}
  }
  assert('terminal.py remote Windows: $env injected into PowerShell script', decoded.includes("$env:OPENCODE_CONFIG_CONTENT='") && decoded.includes('permission') && decoded.includes('edit'), decoded.slice(0, 400));

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
