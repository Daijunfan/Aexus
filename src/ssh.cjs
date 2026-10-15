const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {createInterface} = require('node:readline');
const {randomUUID} = require('node:crypto');
const registry = require('./registry.cjs');
const runtime = path.join(__dirname, '../Runtime');
const expand = file => file?.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file;
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
const psquote = value => "'" + String(value).replace(/'/g, "''") + "'";
const encoded = script => Buffer.from(script, 'utf16le').toString('base64');
// Git for Windows SSH reliably supports redirected stdin/stdout when hidden.
// Windows OpenSSH can hang with pipes in console-less workers on DJF-Windows.
const sshExecutable = (platform = process.platform, environment = process.env, exists = fs.existsSync) => {
  if(environment.CLOUD_HOSTS_SSH)return environment.CLOUD_HOSTS_SSH;
  if(platform === 'win32')for(const folder of [environment.ProgramFiles,environment['ProgramFiles(x86)']]){
    if(!folder)continue;
    const executable = path.win32.join(folder,'Git','usr','bin','ssh.exe');
    if(exists(executable))return executable;
  }
  return 'ssh';
};
function config(target) {
  const value = {host: target.host, os: target.os, directory: target.directory, port: target.port, proxy_jump: target.jump};
  for (const [from, to] of [['identityFile', 'identity_file'], ['knownHosts', 'known_hosts'], ['sshConfig', 'ssh_config']]) if (target[from]) value[to] = expand(target[from]);
  if (target.python) value.python = target.python;
  if (target.credentialId) value.askpass = askpass(target.credentialId);
  return value;
}
function askpass(id) {
  registry.ensure();
  const file = path.join(registry.home, 'askpass-' + id + '.py');
  const source = '#!/usr/bin/env python3\nimport json,urllib.request\nfrom pathlib import Path\ns=json.loads(Path(' + JSON.stringify(path.join(registry.home, 'server.json')) + ').read_text())\nr=urllib.request.Request(s["url"]+"rpc",data=json.dumps({"jsonrpc":"2.0","id":1,"method":"hosts.credentials","params":{"id":' + JSON.stringify(id) + ',"files":False}}).encode(),headers={"Content-Type":"application/json"})\nprint(json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open(r,timeout=8))["result"]["password"])\n';
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== source) fs.writeFileSync(file, source, {mode: 0o700});
  return file;
}
function env(target) {
  const c = config(target);
  return {...process.env, ...(c.askpass ? {SSH_ASKPASS: c.askpass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'cloud-hosts'} : {})};
}
function args(target, tty = false) {
  const c = config(target), result = ['-o', c.askpass ? 'BatchMode=no' : 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', tty ? '-tt' : '-T'];
  for (const [field, flag] of [['port', '-p'], ['identity_file', '-i'], ['ssh_config', '-F'], ['proxy_jump', '-J']]) if (c[field]) result.push(flag, String(c[field]));
  if (c.identity_file) result.push('-o', 'IdentitiesOnly=yes');
  if (c.known_hosts) result.push('-o', 'UserKnownHostsFile=' + JSON.stringify(c.known_hosts));
  if (process.platform === 'win32') result.push('-o', 'Ciphers=aes128-ctr');
  return [...result, c.host];
}
function command(target, text) {
  if (target.os === 'windows') {
    const script = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $global:LASTEXITCODE=0; try { Set-Location -LiteralPath " + psquote(target.directory) + "; & {\n" + text + "\n}; if(!$? -and $LASTEXITCODE -eq 0){$global:LASTEXITCODE=1}; exit $LASTEXITCODE } catch { [Console]::Error.WriteLine($_);exit 1 }";
    return 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' + encoded(script);
  }
  return 'cd -- ' + quote(target.directory) + ' && ' + text;
}
function run(argv, {input, timeout = 120, env} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(sshExecutable(), argv, {env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => {expired = true; child.kill('SIGTERM');}, timeout * 1000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => {stdout += data;}); child.stderr.on('data', data => {stderr += data;});
    child.once('error', error => {clearTimeout(timer); reject(error);});
    child.once('close', code => {clearTimeout(timer); resolve({stdout, stderr, exit_code: expired ? 124 : code ?? 1});});
    child.stdin.on('error', () => {}); child.stdin.end(input);
  });
}
async function execute(value, text, directory, timeout = 120) {
  if (!text?.trim()) throw Error('command must not be empty');
  const target = registry.target(value, directory);
  return {...await run([...args(target), command(target, text)], {timeout, env: env(target)}), cwd: target.directory};
}
const checks = new Map();
let activeChecks = 0;
const waitingChecks = [];
async function check(value) {
  const host = registry.get(value);
  if (checks.has(host.id)) return checks.get(host.id);
  const pending = (async () => {
    if (activeChecks >= 3) await new Promise(resolve => waitingChecks.push(resolve)); else activeChecks++;
    const script = host.os === 'windows' ? "[pscustomobject]@{hostname=[Environment]::MachineName;user=[Environment]::UserName;os='windows';buildNumber=[Environment]::OSVersion.Version.Build;model=(Get-CimInstance Win32_ComputerSystem).Model}|ConvertTo-Json -Compress" : "python3 -c " + quote("import json,socket,getpass,platform;print(json.dumps(dict(hostname=socket.gethostname(),user=getpass.getuser(),os=platform.system().lower())))");
    let status;
    try {
      const reply = await execute(host.id, script, undefined, 20);
      if (reply.exit_code) throw Error(reply.stderr.trim() || 'SSH check failed');
      status = {connected: true, checkedAt: Date.now(), environment: JSON.parse(reply.stdout.trim())};
    } catch (error) {status = {connected: false, checkedAt: Date.now(), error: error.message};}
    try {return registry.status(host.id, status);} finally {const next = waitingChecks.shift(); if (next) next(); else activeChecks--;}
  })();
  checks.set(host.id, pending);
  try {return await pending;} finally {checks.delete(host.id);}
}
// Windows often maps python3.exe to the Microsoft Store launcher even when
// a real python.exe is installed. Use the same interpreter as the Windows
// remote-runtime bootstrap; keep macOS and Linux on python3.
const localPython = (platform = process.platform, configured = process.env.CLOUD_HOSTS_PYTHON) => configured || (platform === 'win32' ? 'python' : 'python3');
class Workspace {
  constructor(value, directory) {
    const target = registry.target(value, directory);
    registry.ensure();
    const folder = path.join(registry.home, 'sessions'); fs.mkdirSync(folder, {recursive: true, mode: 0o700});
    this.file = path.join(folder, randomUUID() + '.json');
    fs.writeFileSync(this.file, JSON.stringify(config(target)), {mode: 0o600});
    this.child = spawn(localPython(), ['-B', '-u', path.join(runtime, 'client.py'), this.file], {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    this.pending = new Map(); this.next = 0; this.stderr = '';
    this.child.stderr.on('data', data => {this.stderr = (this.stderr + data).slice(-4000);});
    createInterface({input: this.child.stdout}).on('line', line => {
      let reply; try {reply = JSON.parse(line);} catch {return;}
      if(reply.method==='native/output'){this.onOutput?.(reply.params);return;}
      const item = this.pending.get(reply.id); if (!item) return;
      clearTimeout(item.timer); this.pending.delete(reply.id);
      reply.error ? item.reject(Error(reply.error.message)) : item.resolve(reply.result);
    });
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => this.fail(error));
    this.child.on('close', () => {this.fail(Error(this.stderr.trim() || 'Remote workspace closed')); fs.rmSync(this.file, {force: true});});
  }
  fail(error) {for (const item of this.pending.values()) {clearTimeout(item.timer); item.reject(error);} this.pending.clear();}
  request(method, params, timeout = 40000) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => {this.pending.delete(id); reject(Error('Remote workspace request timed out')); this.close();}, timeout) : undefined;
      this.pending.set(id, {resolve, reject, timer});
      this.child.stdin.write(JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n');
    });
  }
  async call(name, arguments_) {
    const reply = await this.request('tools/call', {name, arguments: arguments_});
    const result = JSON.parse(reply.content[0].text);
    if (reply.isError) throw Error(result.error || result.stderr || 'Remote file operation failed');
    return result;
  }
  close() {this.child.stdin.end(); this.child.kill('SIGTERM'); fs.rmSync(this.file, {force: true});}
}
async function files(value, operation, arguments_, directory) {
  const worker = new Workspace(value, directory);
  try {await worker.request('initialize', {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'cloud-hosts', version: '2.0.0'}}); return await worker.call(operation, arguments_);} finally {worker.close();}
}
async function fingerprints(value) {
  const target = registry.target(value);
  if (target.jump) throw Error('Jump-host fingerprints must be verified using the existing known_hosts configuration');
  const result = await new Promise((resolve, reject) => {
    const child = spawn('ssh-keyscan', ['-T', '5', '-p', String(target.port || 22), target.host.split('@').at(-1)], {stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true});
    let output = ''; child.stdout.on('data', d => {output += d;}); child.on('error', reject); child.on('close', () => resolve(output));
  });
  return result.split('\n').filter(line => line && !line.startsWith('#')).map(line => {
    const [, algorithm, data] = line.split(/\s+/);
    return {line, algorithm, fingerprint: 'SHA256:' + createHash('sha256').update(Buffer.from(data, 'base64')).digest('base64').replace(/=+$/, '')};
  });
}
module.exports = {args, command, config, env, execute, check, files, fingerprints, quote, psquote, encoded, Workspace, localPython, sshExecutable};
