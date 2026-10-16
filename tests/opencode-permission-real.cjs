// Real local OpenCode probe (one model round). Proves the outer-layer Ask
// permission wiring end-to-end with native auth — no injected provider/key:
//   1. hosts.processOn(local,'opencode',['acp'],{environment}) with
//      opencodePermissionEnvironment('ask') delivers the official per-process
//      OPENCODE_CONFIG_CONTENT override to the ACP process (the exact
//      agent-companion openOpenCode path).
//   2. A fresh session is allocated, then RE-LOADED on a new connection with
//      the same id (same-ID reconnect recovery, no model call).
//   3. One DeepSeek prompt asks for `echo`, which fires the native
//      session/request_permission approval event; allow_once is chosen and the
//      tool completes.
// Full is covered deterministically (no override -> native default) in
// opencode-permission.test.cjs, so no second model round is made here.
// Requires the opencode CLI locally (CLOUD_HOSTS_OPENCODE overrides the path).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hosts = require('../src/agent-hosts.cjs');
const { opencodePermissionEnvironment } = require('../src/agent-cli.cjs');

const OUT = path.join(__dirname, '..', 'artifacts', 'role-parity-20261015', 'inventory', 'native-opencode-approval-probe.json');
const PROBE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-approval-probe-'));

function mask(v) {
  const s = JSON.stringify(v ?? null);
  return JSON.parse(s.replace(/(["']?(?:apiKey|key|token|secret|authorization|authToken)["']?\s*[:=]\s*["']?)[^"'\s,}]{6,}/gi, '$1***'));
}

function connect(environment, log) {
  const child = hosts.processOn(hosts.local(), 'opencode', ['acp'], { cwd: PROBE_DIR, environment });
  let buffer = ''; let seq = 0; const pending = new Map(); let stderr = ''; let closed = false;
  const done = new Promise(resolve => { child.on('close', () => { closed = true; if (stderr) log.stderr = (log.stderr || '') + stderr.slice(0, 2000); resolve(); }); });
  const send = (method, params, timeoutMs) => {
    const id = String(++seq);
    return new Promise((res, rej) => {
      const t = setTimeout(() => { pending.delete(id); rej(Error(method + ' timeout')); }, timeoutMs);
      pending.set(id, { res, rej, t });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: Number(id), method, params }) + '\n');
    });
  };
  const reply = (id, result) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const onLine = line => {
    let v; try { v = JSON.parse(line); } catch { return; }
    if (v.id !== undefined && v.method === undefined) {
      const p = pending.get(String(v.id));
      if (p) { pending.delete(String(v.id)); clearTimeout(p.t); v.error ? p.rej(Error(v.error.message || JSON.stringify(v.error))) : p.res(v.result); }
      log.requests.push({ dir: 'response', id: v.id, ok: !v.error, result: mask(v.result) });
      return;
    }
    if (v.id !== undefined && v.method !== undefined) {
      log.requests.push({ dir: 'request', id: v.id, method: v.method, params: mask(v.params) });
      if (v.method === 'session/request_permission') {
        const opts = v.params?.options || [];
        const opt = opts.find(o => /allow_once|once/i.test(o.kind || '')) || opts.find(o => /allow_always|always/i.test(o.kind || '')) || opts[0];
        log.permissionEvents.push({ toolTitle: v.params?.toolCall?.title, tool: v.params?.toolCall?.tool, toolCallId: v.params?.toolCall?.toolCallId, options: mask(opts), chosen: opt ? opt.kind : null });
        reply(v.id, opt ? { outcome: { outcome: 'selected', optionId: opt.optionId ?? opt.id } } : { outcome: { outcome: 'cancelled' } });
      } else {
        reply(v.id, {});
      }
      return;
    }
    log.events.push({ method: v.method, params: mask(v.params) });
  };
  child.stdout.on('data', d => { buffer += d.toString('utf8'); for (let e; (e = buffer.indexOf('\n')) >= 0;) { const line = buffer.slice(0, e).trim(); buffer = buffer.slice(e + 1); if (line) onLine(line); } });
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
  child.on('error', e => { log.error = e.message; });
  return { send, reply, notify, done, close: () => { if (!closed) child.kill('SIGTERM'); } };
}
async function stop(conn) {
  conn.close();
  await Promise.race([conn.done, new Promise(r => setTimeout(r, 5000))]);
}

(async () => {
  const log = { startedAt: new Date().toISOString(), probeDir: PROBE_DIR, events: [], requests: [], permissionEvents: [] };
  const environment = { ...opencodePermissionEnvironment('ask'), OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true' };
  log.environment = environment;
  try {
    // Phase A1: allocate a fresh session identity (no model prompt).
    const first = connect(environment, log);
    await first.send('initialize', { protocolVersion: 1, clientInfo: { name: 'aexus-native-opencode-probe', version: '1' }, clientCapabilities: {} }, 60000);
    const created = await first.send('session/new', { cwd: PROBE_DIR, mcpServers: [] }, 90000);
    log.sessionId = created?.sessionId;
    log.newOk = !!created?.sessionId;
    await stop(first);

    // Phase A2: reconnect a fresh ACP process and load the same id (recovery).
    const second = connect(environment, log);
    await second.send('initialize', { protocolVersion: 1, clientInfo: { name: 'aexus-native-opencode-probe', version: '1' }, clientCapabilities: {} }, 60000);
    const loaded = await second.send('session/load', { cwd: PROBE_DIR, sessionId: log.sessionId, mcpServers: [] }, 90000);
    log.loadOk = true;
    log.loadedSessionId = typeof loaded === 'object' && loaded && 'sessionId' in loaded ? loaded.sessionId : undefined;
    log.sameIdRecovered = !log.loadedSessionId || log.loadedSessionId === log.sessionId;

    // Phase B: one DeepSeek round that must fire the native approval event.
    await second.send('session/prompt', { sessionId: log.sessionId, prompt: [{ type: 'text', text: 'Run the shell command `echo native-opencode-approval-ok` and report its output. Do not use any other tools.' }] }, 90000);
    const deadline = Date.now() + 120000;
    let completed;
    while (Date.now() < deadline && !completed) {
      await new Promise(r => setTimeout(r, 1000));
      completed = log.events.find(e => e.params?.update?.sessionUpdate === 'tool_call_update' && e.params?.update?.status === 'completed');
    }
    log.toolCompleted = !!completed;
    if (completed) log.toolOutput = completed.params.update.rawOutput || completed.params.update.content;
    second.notify('session/cancel', { sessionId: log.sessionId });
    await stop(second);
  } catch (e) {
    log.error = e.message;
  }

  const verdict = {
    newOk: !!log.newOk,
    sameIdRecovered: !!log.sameIdRecovered,
    approvalEventFired: log.permissionEvents.length > 0,
    toolCompleted: !!log.toolCompleted,
  };
  verdict.pass = verdict.newOk && verdict.sameIdRecovered && verdict.approvalEventFired && verdict.toolCompleted;
  log.verdict = verdict;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2) + '\n');
  console.log('error=' + (log.error || 'none'));
  console.log('newOk=' + !!log.newOk + ' sameIdRecovered=' + !!log.sameIdRecovered);
  console.log('approvalEvents=' + log.permissionEvents.length + ' toolCompleted=' + !!log.toolCompleted);
  for (const p of log.permissionEvents) console.log('  tool=' + p.toolTitle + ' chosen=' + p.chosen + ' options=' + (p.options || []).map(o => o.kind).join(','));
  console.log('verdict=' + (verdict.pass ? 'PASS' : 'FAIL'));
  console.log('wrote ' + OUT);
  fs.rmSync(PROBE_DIR, { recursive: true, force: true });
  process.exit(verdict.pass ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
