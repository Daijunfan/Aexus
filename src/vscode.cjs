const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const registry = require('./registry.cjs');

const alias = host => host.alias || host.name.replace(/[^\w.-]+/g, '-');
const quote = value => '"' + value.replace(/\\/g, '/').replace(/"/g, '\\"') + '"';
function render(hosts, {platform = process.platform, userHome = os.homedir(), dataHome = registry.home} = {}) {
  const sshHome = path.join(userHome, '.ssh').replace(/\\/g, '/');
  const map = file => {
    if (!file) return undefined;
    file = file.replace(/^~\//, os.homedir() + '/');
    if (platform !== process.platform) {
      if (file.startsWith(registry.home + '/')) return dataHome + file.slice(registry.home.length);
      if (file.startsWith(os.homedir() + '/.ssh/')) return sshHome + file.slice((os.homedir() + '/.ssh').length);
    }
    return file;
  };
  const platforms = {}, blocks = [];
  for (const host of hosts) {
    const name = alias(host), [user, address] = host.host.includes('@') ? host.host.split('@') : [null, null];
    let names = [name];
    if (name === 'GPU-server') names.push('bupt208', '10.92.35.208');
    const lines = ['Host ' + names.join(' ')];
    // Alias-only imported hosts keep their existing account and address settings.
    if (address) lines.push('    HostName ' + address);
    if (user) lines.push('    User ' + user);
    if (host.port) lines.push('    Port ' + host.port);
    const key = map(host.identityFile), known = map(host.knownHosts);
    if (key) lines.push('    IdentityFile ' + quote(key), '    IdentitiesOnly yes');
    if (known) lines.push('    UserKnownHostsFile ' + quote(known));
    if (host.jump) lines.push('    ProxyJump ' + host.jump);
    if (name === 'BUPT-Windows') lines.push('    HostName 127.0.0.1', '    User djf', '    Port 12222', '    ProxyJump GPU-server', '    IdentityFile ' + quote(sshHome + '/id_ed25519_bupt_windows'), '    IdentitiesOnly yes', '    HostKeyAlias bupt-windows');
    lines.push('    StrictHostKeyChecking yes', '    ServerAliveInterval 15', '    ServerAliveCountMax 2');
    if (platform === 'win32') lines.push('    Ciphers aes128-ctr');
    blocks.push(lines.join('\n'));
    for (const name of names) platforms[name] = host.os === 'macos' ? 'linux' : host.os;
  }
  return {sshConfig: '# Managed by Toolbox Cloud Hosts. Private keys remain outside this file.\n\n' + blocks.join('\n\n') + '\n', platforms, aliases: hosts.map(alias)};
}
function sync(options = {}) {
  const userHome = options.userHome || os.homedir(), platform = options.platform || process.platform;
  const hosts = registry.list(), content = render(hosts, {...options, userHome, platform});
  if (options.preview) return content;
  if (platform !== process.platform) throw Error('Use preview to generate settings for a different client platform');
  const dir = path.join(userHome, '.ssh'); fs.mkdirSync(dir, {recursive: true, mode: 0o700});
  const generated = path.join(dir, 'toolbox-cloud-hosts.conf'), config = path.join(dir, 'config');
  const original = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '';
  const include = 'Include ' + quote(generated);
  if (!original.split(/\r?\n/).includes(include)) {
    if (fs.existsSync(config) && !fs.existsSync(config + '.before-toolbox-cloud-hosts')) fs.copyFileSync(config, config + '.before-toolbox-cloud-hosts');
    fs.writeFileSync(config, include + '\n' + original, {mode: 0o600});
  }
  fs.writeFileSync(generated, content.sshConfig, {mode: 0o600});
  const settings = options.settingsFile || (platform === 'darwin' ? path.join(userHome, 'Library/Application Support/Code/User/settings.json') : platform === 'win32' ? path.join(userHome, 'AppData/Roaming/Code/User/settings.json') : path.join(userHome, '.config/Code/User/settings.json'));
  // Read the user's VS Code JSON before updating only the Remote SSH keys.
  const value = fs.existsSync(settings) ? JSON.parse(fs.readFileSync(settings, 'utf8')) : {};
  if (fs.existsSync(settings) && !fs.existsSync(settings + '.before-toolbox-cloud-hosts')) fs.copyFileSync(settings, settings + '.before-toolbox-cloud-hosts');
  value['remote.SSH.configFile'] = config;
  value['remote.SSH.remotePlatform'] = {...value['remote.SSH.remotePlatform'], ...content.platforms};
  if (content.aliases.includes('GPU-server')) value['remote.SSH.serverInstallPath'] = {...value['remote.SSH.serverInstallPath'], 'GPU-server': '/home/djf/.vscode-server'};
  fs.mkdirSync(path.dirname(settings), {recursive: true}); fs.writeFileSync(settings, JSON.stringify(value, null, 2) + '\n');
  return {config, generated, settings, hosts: hosts.length, aliases: content.aliases};
}
module.exports = {alias, render, sync};
