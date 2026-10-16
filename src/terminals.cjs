const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {StringDecoder} = require('node:string_decoder');
const {randomUUID} = require('node:crypto');
const {TerminalOutput} = require('./terminal-output.cjs');
const registry = require('./registry.cjs');
const ssh = require('./ssh.cjs');
const items = new Map();
const metadata = t => ({id: t.id, employee: t.employee, cwd: t.cwd, host: t.host, running: t.running, exitCode: t.exitCode, runtimeVersion:t.runtimeVersion||1, ...(t.kind ? {kind: t.kind, engine: t.engine} : {})});
function get(id) {const t = items.get(id); if (!t) throw Error('Unknown terminal'); return t;}
function size(cols, rows) {if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 2 || rows > 300) throw Error('Invalid terminal size');}
function openTerminal(employee, cols = 100, rows = 28, options = {}) {
  size(cols, rows); registry.ensure();
  const id = randomUUID(), file = path.join(registry.home, 'terminal-' + id + '.json');
  if(options.tuiToken && (options.engine!=='codex'||options.command!=='codex'||!/^[a-f0-9]{64}$/.test(options.tuiToken)||employee.remote)) throw Error('Invalid local Codex TUI authentication token');
  if(options.tuiTokenFile&&(options.engine!=='codex'||!employee.remote||typeof options.tuiTokenFile!=='string'||/[\0\r\n]/.test(options.tuiTokenFile)))throw Error('Invalid remote Codex TUI token file');
  if(options.environment&&(typeof options.environment!=='object'||Array.isArray(options.environment)||Object.keys(options.environment).some(key=>!/^[A-Z][A-Z0-9_]*$/.test(key)||typeof options.environment[key]!=='string'||/[\0\r\n]/.test(options.environment[key]))))throw Error('Invalid terminal environment');
  fs.writeFileSync(file, JSON.stringify({cwd: employee.remote ? registry.home : employee.cwd, ...(employee.remote ? {remote:ssh.config(employee.remote)} : {}), cols, rows, ...(options.command ? {command:options.command, commandArgs:options.args||[], ...(options.executable ? {executable:options.executable} : {}),...(options.environment ? {environment:options.environment} : {}),...(options.tuiToken ? {tuiToken:options.tuiToken} : {}),...(options.tuiTokenFile?{tuiTokenFile:options.tuiTokenFile}:{})} : {})}), {mode: 0o600});
  const broker = process.platform === 'win32' ? (process.env.CLOUD_HOSTS_CONPTY || path.join(__dirname, '../Windows/ConPtyTerminal.exe')) : (process.env.CLOUD_HOSTS_PYTHON || 'python3');
  const args = process.platform === 'win32' ? [file] : ['-B', '-u', path.join(__dirname, '../Runtime/terminal.py'), file];
  // ConPTY.exe is a console-subsystem helper. Without windowsHide, a board
  // opening several terminals can spawn multiple visible cmd/console windows.
  const child = spawn(broker, args, {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    ...(options.environment ? {env:{...process.env,...options.environment}} : {})});
  const t = {id, employee: employee.id, cwd: employee.remote?.directory || employee.cwd, host: employee.remote?.host || 'local', kind: options.kind, engine: options.engine, runtimeVersion:2, running: true, output: new TerminalOutput(), child, changed: new Set(), pendingInput: new Map(), nextInput: 0, done: new Promise(r => child.once('close', r))};
  const decoder = new StringDecoder('utf8');
  const append = text => {t.output.append(text); if (text) for (const fn of t.changed) fn();};
  createInterface({input: child.stdout}).on('line', line => {try {const event = JSON.parse(line); if (event.data) append(decoder.write(Buffer.from(event.data, 'base64'))); if (event.inputId !== undefined) {t.pendingInput.get(event.inputId)?.resolve(true); t.pendingInput.delete(event.inputId);} if (event.exitCode !== undefined) t.exitCode = event.exitCode;} catch {}});
  child.stderr.on('data', data => append(data.toString())); child.stdin.on('error', () => {});
  child.on('error', error => append('\r\n' + error.message + '\r\n'));
  child.on('close', code => {append(decoder.end()); t.running = false; t.exitCode ??= code ?? 1; for (const input of t.pendingInput.values()) input.reject(Error('Terminal exited before input was written')); t.pendingInput.clear(); for (const fn of t.changed) fn(); fs.rmSync(file, {force: true});options.onClose?.();});
  items.set(id, t); return metadata(t);
}
async function read(id, cursor = 0, waitMs = 0, signal, maxChars) {
  const t = get(id); signal?.throwIfAborted();
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isInteger(waitMs) || waitMs < 0 || waitMs > 15000) throw Error('Invalid terminal cursor or wait');
  if (maxChars !== undefined && (!Number.isInteger(maxChars) || maxChars < 2 || maxChars > 256000)) throw Error('Invalid output frame size');
  if (t.running && cursor === t.output.cursor && waitMs) await new Promise((resolve, reject) => {
    const cleanup = () => {clearTimeout(timer); t.changed.delete(ready); signal?.removeEventListener('abort', aborted);};
    const ready = () => {cleanup(); resolve();}, aborted = () => {cleanup(); reject(signal.reason);};
    const timer = setTimeout(ready, waitMs); t.changed.add(ready); signal?.addEventListener('abort', aborted, {once: true});
  });
  return {...metadata(t), ...t.output.read(cursor,maxChars)};
}
function input(id, data) {
  const t = get(id); if (!t.running) throw Error('Terminal has exited');
  if (typeof data !== 'string' || Buffer.byteLength(data) > 4 * 1024 * 1024) throw Error('Invalid terminal input (maximum 4 MiB)');
  const inputId = ++t.nextInput;
  return new Promise((resolve, reject) => {
    t.pendingInput.set(inputId, {resolve, reject});
    t.child.stdin.write(JSON.stringify({op: 'input', inputId, data}) + '\n', error => {if (error) {t.pendingInput.delete(inputId); reject(error);}});
  });
}
function resize(id, cols, rows) {size(cols, rows); get(id).child.stdin.write(JSON.stringify({op: 'resize', cols, rows}) + '\n'); return true;}
async function close(id) {
  const t = get(id);
  if (t.running) {
    // On Windows the ConPTY helper owns the shell/Agent child. Ask the helper
    // to close its pseudo console first; killing the helper can leave a child
    // process holding the workspace open after an Agent has been removed.
    if (process.platform === 'win32' && t.child.stdin.writable)
      t.child.stdin.write('{"op":"close"}\n', error => {if (error) t.child.kill('SIGTERM');});
    else t.child.kill('SIGTERM');
    const timer = setTimeout(() => t.child.kill('SIGKILL'), 2000);
    await t.done; clearTimeout(timer);
  }
  items.delete(id); return true;
}
const listTerminals = owner => [...items.values()].filter(t => !owner || t.employee === owner).map(metadata);
const closeEmployeeTerminals = async owner => {for (const t of listTerminals(owner)) await close(t.id);};
module.exports = {openTerminal, listTerminals, closeEmployeeTerminals, terminalOwner: id => get(id).employee, read, input, resize, close, shutdown: async () => {for (const id of [...items.keys()]) await close(id);}};
