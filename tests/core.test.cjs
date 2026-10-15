const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-hosts-tests-'));
process.env.CLOUD_HOSTS_HOME = path.join(tmp, 'home with spaces');
const registry = require('../src/registry.cjs');
const ssh = require('../src/ssh.cjs');
const vscode = require('../src/vscode.cjs');
const {TerminalOutput} = require('../src/terminal-output.cjs');

test('passwords stay encrypted and out of host listing', () => {
  const h = registry.create({name: 'test-host', host: 'user@example.invalid', os: 'linux', defaultDirectory: '/home/user', password: 'test-only-password'});
  assert.equal(h.hasPassword, true); assert.equal(h.password, undefined); assert.equal(h.secret, undefined);
  assert.equal(registry.password(h.id), 'test-only-password');
  assert.ok(!fs.readFileSync(path.join(registry.home, 'hosts.json'), 'utf8').includes('test-only-password'));
  registry.update(h.id, {password: ''}); assert.equal(registry.get(h.id).hasPassword, false);
});
test('only actual desktop tunnels create dependencies; legacy VM metadata never controls a host', () => {
  const parent = registry.get('test-host');
  const child = registry.create({name: 'guest', host: 'lab@127.0.0.1', os: 'linux', defaultDirectory: '/home/lab', jump:'user@jump.invalid', vm: {hypervisorId: parent.id, name: 'guest', projectDirectory: '/vms/guest', state: 'running', access: 'serial'},desktop:{protocol:'vnc',address:'127.0.0.1',port:5900,viaHostId:parent.id}});
  assert.throws(() => registry.remove(parent.id), /reference/);
  registry.update(child.id,{desktop:null});
  assert.equal(registry.remove(parent.id).removed,true);
  assert.equal(registry.target(child.id).host,child.host);
  assert.ok(require('../src/agent-hosts.cjs').list().some(h=>h.id===child.id));
  assert.match(vscode.render([child]).sshConfig,/ProxyJump user@jump.invalid/);
  registry.remove(child.id);
  const self = registry.create({name: 'self-tunnel', host: 'user@example.invalid', os: 'windows', defaultDirectory: 'C:\\'});
  registry.update(self.id, {desktop: {protocol: 'rdp', address: '127.0.0.1', port: 3389, viaHostId: self.id}});
  assert.equal(registry.remove(self.id).removed, true);
});
test('SSH retains fingerprint checking and correctly quotes paths with spaces', () => {
  const args = ssh.args({host: 'lab@127.0.0.1', os: 'linux', directory: '/home/lab', knownHosts: '/home/user/space directory/known_hosts', port: 12231, jump: 'GPU-server'});
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('UserKnownHostsFile="/home/user/space directory/known_hosts"'));
  assert.ok(args.includes('GPU-server')); assert.ok(args.includes('12231'));
  assert.throws(() => registry.create({name: 'bad', host: 'server;touch /tmp/invalid', os: 'linux', defaultDirectory: '/'}), /Invalid SSH/);
});
test('VS Code sync preserves unrelated SSH and editor settings', () => {
  const userHome = path.join(tmp, 'client'); const settingsFile = path.join(userHome, 'settings.json');
  fs.mkdirSync(path.join(userHome, '.ssh'), {recursive: true});
  fs.writeFileSync(path.join(userHome, '.ssh/config'), 'Host personal\n HostName example.invalid\n');
  fs.writeFileSync(settingsFile, JSON.stringify({'editor.fontSize': 17, 'remote.SSH.remotePlatform': {personal: 'linux'}}));
  vscode.sync({userHome, settingsFile}); vscode.sync({userHome, settingsFile});
  const cfg = fs.readFileSync(path.join(userHome, '.ssh/config'), 'utf8');
  assert.equal(cfg.match(/Include /g).length, 1); assert.ok(cfg.includes('Host personal'));
  const value = JSON.parse(fs.readFileSync(settingsFile)); assert.equal(value['editor.fontSize'], 17); assert.equal(value['remote.SSH.remotePlatform'].personal, 'linux');
});
test('terminal cursor history survives truncation and Unicode boundaries', () => {
  const output = new TerminalOutput(6); output.append('12345'); const cursor = output.cursor; output.append('😀XYZ');
  const read = output.read(0); assert.ok(read.reset); assert.ok(!/^[\udc00-\udfff]/.test(read.output));
  assert.equal(output.read(cursor).output, '😀XYZ');
});
test('migration relocates the registry without a shared application link', () => {
  const source = path.join(tmp, 'legacy'), home = path.join(tmp, 'migration-home');
  fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'hosts.json'), '[]');
  const {spawnSync} = require('node:child_process');
  const r = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs'), 'migrate', '--from', source], {env: {...process.env, CLOUD_HOSTS_HOME: home}, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr); assert.equal(fs.existsSync(source), false); assert.ok(fs.existsSync(path.join(home, 'hosts.json')));
  assert.equal(JSON.parse(r.stdout).migrated, true);
});
process.on('exit', () => fs.rmSync(tmp, {recursive: true, force: true}));

test('host ordering and board layout persist without changing SSH settings or credentials',()=>{
 const a=registry.create({name:'order-a',host:'a.invalid',os:'linux',defaultDirectory:'/'});
 const b=registry.create({name:'order-b',host:'b.invalid',os:'windows',defaultDirectory:'C:\\'});
 const ids=registry.list().map(h=>h.id).reverse();
 registry.reorder(ids);assert.deepEqual(registry.list().map(h=>h.id),ids);
 assert.equal(registry.get(a.id).host,'a.invalid');
 assert.throws(()=>registry.reorder([a.id]),/every host/);
 registry.workspace({mode:'board',board:[b.id,a.id],boardModes:{[b.id]:'terminal'}});
 assert.deepEqual(registry.workspace().board,[b.id,a.id]);
 registry.remove(a.id);assert.deepEqual(registry.workspace().board,[b.id]);
});
