const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID, randomBytes, createCipheriv, createDecipheriv} = require('node:crypto');

const home = process.env.CLOUD_HOSTS_HOME || path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Application Support/Toolbox/CloudHosts' : process.platform === 'win32' ? 'AppData/Roaming/Toolbox/CloudHosts' : '.local/share/toolbox/cloud-hosts');
const file = path.join(home, 'hosts.json');
const ensure = () => fs.mkdirSync(home, {recursive: true, mode: 0o700});
const load = () => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
function save(rows) {
  ensure();
  fs.writeFileSync(file + '.tmp', JSON.stringify(rows, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(file + '.tmp', file);
  // Aexus hosted-mode reads this sanitized, revisioned projection only.
  require('./agentboard-host-projection.cjs').publish(rows, home);
}
const publicHost = ({secret, ...host}) => ({...host, hasPassword: !!secret});
function get(value) {
  const host = load().find(h => h.id === value || h.name === value || h.alias === value);
  if (!host) throw Error('Unknown host: ' + value);
  return publicHost(host);
}
function key() {
  ensure();
  const file = path.join(home, 'credential.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32), {mode: 0o600, flag: 'wx'});
  return fs.readFileSync(file);
}
function password(value) {
  const host = load().find(h => h.id === get(value).id);
  if (!host.secret) return '';
  const data = Buffer.from(host.secret, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}
function fields(value, previous) {
  const host = {...previous, ...value};
  host.name = String(host.name || '').trim();
  if (!host.name || !host.host || !host.defaultDirectory) throw Error('name, host and defaultDirectory are required');
  if (!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(host.host) || host.host.startsWith('-')) throw Error('Invalid SSH host');
  if (!['linux', 'windows', 'macos'].includes(host.os)) throw Error('Invalid operating system');
  if (host.port !== undefined && (!Number.isInteger(host.port) || host.port < 1 || host.port > 65535)) throw Error('Invalid SSH port');
  for (const name of ['identityFile', 'knownHosts', 'sshConfig']) {
    if (host[name] && !path.isAbsolute(host[name]) && !host[name].startsWith('~/')) throw Error(name + ' must be an absolute path or ~/');
  }
  if (host.jump && (!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(host.jump) || host.jump.startsWith('-'))) throw Error('Invalid SSH jump host');
  host.id = previous?.id || randomUUID();
  host.createdAt = previous?.createdAt || Date.now();
  host.updatedAt = Date.now();
  if (value.password !== undefined) {
    if (value.password) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
      const data = Buffer.concat([cipher.update(String(value.password), 'utf8'), cipher.final()]);
      host.secret = Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    } else delete host.secret;
  }
  delete host.password;
  delete host.hasPassword;
  // Accept legacy metadata for old callers; it never controls host access or ownership.
  if (host.vm === null) delete host.vm;
  if (host.desktop === null) delete host.desktop;
  if (host.vm && host.vm.hypervisorId === host.id) throw Error('A VM cannot be its own hypervisor');
  if (host.vm && (!host.vm.hypervisorId || !host.vm.name || !host.vm.projectDirectory || !['running', 'stopped', 'paused', 'unknown'].includes(host.vm.state) || !['ssh', 'serial', 'rdp', 'unconfigured'].includes(host.vm.access))) throw Error('Invalid VM metadata');
  if (host.desktop && (!['rdp', 'vnc'].includes(host.desktop.protocol) || !/^[[\w.\]:-]+$/.test(host.desktop.address || '') || host.desktop.address.startsWith('-') || !Number.isInteger(host.desktop.port) || host.desktop.port < 1 || host.desktop.port > 65535)) throw Error('Invalid desktop connection');
  return host;
}
function create(value) {
  const rows = load(), host = fields(value);
  if (rows.some(h => h.name === host.name)) throw Error('Host name already exists');
  rows.push(host); save(rows); return publicHost(host);
}
function update(value, patch) {
  const id = get(value).id, rows = load(), at = rows.findIndex(h => h.id === id);
  const host = fields(patch, rows[at]);
  if (rows.some(h => h.id !== id && h.name === host.name)) throw Error('Host name already exists');
  rows[at] = host; save(rows); return publicHost(host);
}
function remove(value) {
  const id = get(value).id, rows = load();
  if (rows.some(h => h.id !== id && h.desktop?.viaHostId === id)) throw Error('Other hosts still reference this host');
  save(rows.filter(h => h.id !== id)); return {removed: true, id};
}
function target(value, directory) {
  const host = get(value);
  return {...host, directory: directory || host.defaultDirectory, ...(host.hasPassword ? {credentialId: host.id} : {})};
}
function status(value, status) {
  const id = get(value).id, rows = load(), host = rows.find(h => h.id === id);
  host.status = status; save(rows); return status;
}
function reorder(ids) {
  const rows = load();
  if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids).size !== rows.length || ids.some(id => !rows.some(row => row.id === id))) throw Error('Host order must contain every host exactly once');
  save(ids.map(id => rows.find(row => row.id === id)));
  return load().map(publicHost);
}
function workspace(patch = {}) {
  ensure();
  const path_ = path.join(home, 'workspace.json');
  const saved = fs.existsSync(path_) ? JSON.parse(fs.readFileSync(path_, 'utf8')) : {mode: 'single'};
  // The old toolbar exposed four peers. Collapse its two host boards into a
  // single top-level entry without changing either board's saved content.
  const topViews = ['single', 'hosts-board', 'agent-board', 'role-board'];
  const legacyViews = ['single', 'board', 'file-board', 'agent-board'];
  const validLegacyOrder = Array.isArray(saved.viewOrder) && saved.viewOrder.length === 4 &&
    legacyViews.every(id => saved.viewOrder.includes(id)) && new Set(saved.viewOrder).size === 4;
  const oldOrder = validLegacyOrder ? saved.viewOrder.map(id => id === 'board' || id === 'file-board' ? 'hosts-board' : id) : null;
  const previousOrder = oldOrder ? [...new Set(oldOrder)] : (saved.viewOrder || topViews);
  const viewOrder = previousOrder.includes('role-board') ? previousOrder : [...previousOrder, 'role-board'];
  const value = {mode: saved.mode, language: saved.language || 'en', activeBoard: saved.activeBoard || 'default', boards: saved.boards || [{id: 'default', name: '默认工作组', hosts: saved.board || [], modes: saved.boardModes || {}, sizes: {}, columns: 2, cardHeight: 350, initialized: !!saved.boardInitialized}], viewOrder, hostsBoardMode: saved.hostsBoardMode || (saved.mode === 'file-board' ? 'file-board' : 'board'), agentBoard: {hosts: [], columns: 2, hubTab: 'workspace', roleColumns: 3, roleHeight: 270, roleOrder: {}, rolePositions: {}, roleOffsets: {}, initialized: false, ...saved.agentBoard}, fileBoard: {hosts: [], tabs: {}, active: {}, sizes: {}, showHidden: {}, columns: 2, cardHeight: 380, initialized: false, ...saved.fileBoard}};
  const oldRoleTab = ['company','messages','plan'].includes(saved.agentBoard?.hubTab) ? saved.agentBoard.hubTab : null;
  value.roleBoard = {...(saved.roleBoard || {tab:oldRoleTab || 'company'})};
  if (!saved.roleBoard && saved.mode === 'agent-board' && oldRoleTab) value.mode = 'role-board';
  if (patch.roleBoardPatch?.tab !== undefined) value.roleBoard.tab = patch.roleBoardPatch.tab;
  if (patch.language !== undefined) value.language = patch.language;
  if (patch.mode !== undefined) {
    value.mode = patch.mode;
    if (patch.mode === 'board' || patch.mode === 'file-board') value.hostsBoardMode = patch.mode;
  }
  if (patch.hostsBoardMode !== undefined) value.hostsBoardMode = patch.hostsBoardMode;
  if (patch.viewOrder !== undefined) {
    const order = patch.viewOrder;
    // Older clients can still reorder their three known top-level boards.
    value.viewOrder = Array.isArray(order) && order.length === 3 &&
      ['single','hosts-board','agent-board'].every(id => order.includes(id)) ? [...order,'role-board'] : order;
  }
  // Workgroups organize hosts only; native sessions and their layout stay independent.
  const agents = value.agentBoard;
  agents.groups ??= [{id:'default',name:'默认工作组',hosts:agents.hosts,initialized:agents.initialized}];
  agents.activeGroup ??= 'default';
  for (const group of agents.groups) group.columns ??= agents.columns;
  if (patch.createAgentGroup) {
    const group = {id:randomUUID(),name:patch.createAgentGroup.name,hosts:[],columns:2,initialized:true};
    agents.groups.push(group); agents.activeGroup = group.id;
  }
  if (patch.removeAgentGroup) {
    if (!agents.groups.some(group => group.id === patch.removeAgentGroup)) throw Error('Unknown Agent workgroup');
    if (agents.groups.length === 1) throw Error('至少保留一个工作组');
    agents.groups = agents.groups.filter(group => group.id !== patch.removeAgentGroup);
    if (agents.activeGroup === patch.removeAgentGroup) agents.activeGroup = agents.groups[0].id;
  }
  if (patch.activeAgentGroup !== undefined) agents.activeGroup = patch.activeAgentGroup;
  const activeAgentGroup = agents.groups.find(group => group.id === agents.activeGroup);
  const agentGroup = agents.groups.find(group => group.id === (patch.agentGroupId || agents.activeGroup));
  if (!activeAgentGroup || !agentGroup) throw Error('Unknown Agent workgroup');
  for (const field of ['name','columns']) if (patch.agentGroupPatch?.[field] !== undefined) agentGroup[field] = patch.agentGroupPatch[field];
  // Old clients keep reading/writing agentBoard.hosts for the active group.
  for (const field of ['hosts','columns','initialized']) if (patch.agentBoardPatch?.[field] !== undefined) agentGroup[field] = patch.agentBoardPatch[field];
  if (patch.agentBoardPatch) for (const field of ['hubTab','projectViewId','roleColumns','roleHeight','roleOrder','rolePositions','roleOffsets']) if (patch.agentBoardPatch[field] !== undefined) agents[field] = patch.agentBoardPatch[field];
  agents.hosts = activeAgentGroup.hosts; agents.columns = activeAgentGroup.columns; agents.initialized = activeAgentGroup.initialized;
  if (patch.fileBoardPatch) Object.assign(value.fileBoard, patch.fileBoardPatch);
  if (patch.createBoard) {
    const group = {id: randomUUID(), name: patch.createBoard.name, hosts: [], modes: {}, sizes: {}, columns: 2, cardHeight: 350, initialized: true};
    value.boards.push(group); value.activeBoard = group.id;
  }
  if (patch.removeBoard) {
    if (!value.boards.some(b => b.id === patch.removeBoard)) throw Error('Unknown workgroup');
    if (value.boards.length === 1) throw Error('至少保留一个工作组');
    value.boards = value.boards.filter(b => b.id !== patch.removeBoard);
    if (value.activeBoard === patch.removeBoard) value.activeBoard = value.boards[0].id;
  }
  if (patch.activeBoard !== undefined) value.activeBoard = patch.activeBoard;
  const active = value.boards.find(b => b.id === value.activeBoard);
  if (!active) throw Error('Unknown workgroup');
  const group = value.boards.find(b => b.id === (patch.boardId || value.activeBoard));
  if (!group) throw Error('Unknown workgroup');
  for (const field of ['name', 'hosts', 'modes', 'sizes', 'columns', 'cardHeight', 'osHeights', 'initialized']) if (patch.boardPatch?.[field] !== undefined) group[field] = patch.boardPatch[field];
  // Keep the original single-board CLI patch compatible with the active group.
  for (const [legacy, field] of [['board', 'hosts'], ['boardModes', 'modes'], ['boardInitialized', 'initialized']]) if (patch[legacy] !== undefined) group[field] = patch[legacy];
  if (patch.board !== undefined || patch.boardPatch?.hosts !== undefined) group.hosts.forEach(id => {if (id !== 'local') get(id);});
  if (!['single', 'board', 'file-board', 'agent-board', 'role-board'].includes(value.mode)) throw Error('Invalid workspace layout');
  if (!['company','messages','plan'].includes(value.roleBoard.tab)) throw Error('Invalid Role Board tab');
  if (!['board','file-board'].includes(value.hostsBoardMode)) throw Error('Invalid Hosts Board view');
  if (!['en','zh'].includes(value.language)) throw Error('Invalid UI language');
  if (!Array.isArray(value.viewOrder) || value.viewOrder.length !== 4 || new Set(value.viewOrder).size !== 4 || !topViews.every(mode => value.viewOrder.includes(mode))) throw Error('Invalid workspace view order');
  const hostIds = new Set(load().map(h => h.id));
  // Explicitly submitted unknown IDs are user errors. Only prune stale IDs
  // while reading older saved layouts after a host has actually been removed.
  const known = id => id === 'local' || hostIds.has(id);
  for (const ids of [patch.board, patch.boardPatch?.hosts, patch.agentBoardPatch?.hosts, patch.fileBoardPatch?.hosts]) {
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(id => !known(id))))
      throw Error('Board contains an unknown host ID');
  }

  for (const group of agents.groups) {
    group.name = String(group.name || '').trim();
    if (!group.name || group.name.length > 80 || !Array.isArray(group.hosts) || group.hosts.some(id => typeof id !== 'string') || new Set(group.hosts).size !== group.hosts.length) throw Error('Invalid Agent workgroup');
    if (!Number.isInteger(group.columns) || group.columns < 1 || group.columns > 6) throw Error('Invalid Agent workgroup columns');
    group.hosts = group.hosts.filter(known);
  }
  agents.hosts = activeAgentGroup.hosts;
  const agentBoard = value.agentBoard;
  // Migrate the pre-port Workspace tab ID without changing other UI layouts.
  if (agentBoard.hubTab === 'board') agentBoard.hubTab = 'workspace';
  if(!['workspace','company','messages','plan'].includes(agentBoard.hubTab))throw Error('Invalid Agent workspace tab');
  if(agentBoard.projectViewId!==undefined&&(typeof agentBoard.projectViewId!=='string'||agentBoard.projectViewId.length>128))throw Error('Invalid selected Project view');
  if (!Array.isArray(agentBoard.hosts) || agentBoard.hosts.some(id => typeof id !== 'string') || new Set(agentBoard.hosts).size !== agentBoard.hosts.length || !Number.isInteger(agentBoard.columns) || agentBoard.columns < 1 || agentBoard.columns > 6 || !Number.isInteger(agentBoard.roleColumns) || agentBoard.roleColumns < 1 || agentBoard.roleColumns > 6 || !Number.isInteger(agentBoard.roleHeight) || agentBoard.roleHeight < 180 || agentBoard.roleHeight > 600) throw Error('Invalid Agent board');
  if(!agentBoard.roleOrder||typeof agentBoard.roleOrder!=='object'||Array.isArray(agentBoard.roleOrder)||Object.values(agentBoard.roleOrder).some(value=>!Array.isArray(value)||value.some(id=>typeof id!=='string'||id.length>100)||new Set(value).size!==value.length))throw Error('Invalid Agent role order');
  agentBoard.roleOrder=Object.fromEntries(Object.entries(agentBoard.roleOrder).filter(([id])=>id==='local'||hostIds.has(id)));
  const coordinate = point => point && typeof point === 'object' && ['x','y'].every(axis => Number.isFinite(point[axis]) && point[axis] >= 0 && point[axis] <= 1000000);
  const scroll = point => point && typeof point === 'object' && ['left','top'].every(axis => Number.isFinite(point[axis]) && point[axis] >= 0 && point[axis] <= 1000000);
  if (!agentBoard.rolePositions || typeof agentBoard.rolePositions !== 'object' || Array.isArray(agentBoard.rolePositions) || Object.values(agentBoard.rolePositions).some(value => !coordinate(value))) throw Error('Invalid Agent role positions');
  if (!agentBoard.roleOffsets || typeof agentBoard.roleOffsets !== 'object' || Array.isArray(agentBoard.roleOffsets) || Object.values(agentBoard.roleOffsets).some(value => !scroll(value))) throw Error('Invalid Agent host canvas offsets');
  agentBoard.roleOffsets = Object.fromEntries(Object.entries(agentBoard.roleOffsets).filter(([id]) => id === 'local' || hostIds.has(id)));
  agentBoard.hosts = agentBoard.hosts.filter(id => id === 'local' || hostIds.has(id));
  const files = value.fileBoard;
  if (!Array.isArray(files.hosts) || new Set(files.hosts).size !== files.hosts.length || !Number.isInteger(files.columns) || files.columns < 1 || files.columns > 6 || !Number.isInteger(files.cardHeight) || files.cardHeight < 240 || files.cardHeight > 1000) throw Error('Invalid file board');
  files.hosts = files.hosts.filter(id => id === 'local' || hostIds.has(id));
  files.tabs = Object.fromEntries(Object.entries(files.tabs).filter(([id]) => id === 'local' || hostIds.has(id)));
  files.active = Object.fromEntries(Object.entries(files.active).filter(([id]) => id === 'local' || hostIds.has(id)));
  files.sizes = Object.fromEntries(Object.entries(files.sizes).filter(([id]) => id === 'local' || hostIds.has(id)));
  if (!files.showHidden || typeof files.showHidden !== 'object' || Array.isArray(files.showHidden) || Object.values(files.showHidden).some(value => typeof value !== 'boolean')) throw Error('Invalid hidden file visibility');
  files.showHidden = Object.fromEntries(Object.entries(files.showHidden).filter(([id]) => id === 'local' || hostIds.has(id)));
  for (const [id, tabs] of Object.entries(files.tabs)) if (!Array.isArray(tabs) || new Set(tabs.map(tab => tab.id)).size !== tabs.length || tabs.some(tab => typeof tab.id !== 'string' || typeof tab.path !== 'string' || !tab.path.trim())) throw Error('Invalid file tabs for ' + id);
  for (const height of Object.values(files.sizes)) if (!Number.isInteger(height) || height < 240 || height > 1000) throw Error('Invalid file board height');
  for (const board of value.boards) {
    board.name = String(board.name || '').trim();
    if (!board.name || !Array.isArray(board.hosts) || new Set(board.hosts).size !== board.hosts.length) throw Error('Invalid workgroup');

    if (!Number.isInteger(board.columns) || board.columns < 1 || board.columns > 6 || !Number.isInteger(board.cardHeight) || board.cardHeight < 240 || board.cardHeight > 1000) throw Error('Invalid workgroup size');
    for (const [os, height] of Object.entries(board.osHeights || {})) if (!['linux', 'windows', 'macos', 'ubuntu', 'kali', 'debian'].includes(os) || !Number.isInteger(height) || height < 240 || height > 1000) throw Error('Invalid operating system height');
    for (const mode of Object.values(board.modes)) if (!['terminal', 'desktop'].includes(mode)) throw Error('Invalid card view');
    for (const size of Object.values(board.sizes)) if (!Number.isInteger(size.span) || size.span < 1 || size.span > 4 || !Number.isInteger(size.height) || size.height < 240 || size.height > 1000) throw Error('Invalid card size');
    board.hosts = board.hosts.filter(id => id === 'local' || hostIds.has(id));
    for (const field of ['modes', 'sizes']) board[field] = Object.fromEntries(Object.entries(board[field]).filter(([id]) => id === 'local' || hostIds.has(id)));
  }
  if (Object.keys(patch).length) {
    fs.writeFileSync(path_ + '.tmp', JSON.stringify(value), {mode: 0o600});
    fs.renameSync(path_ + '.tmp', path_);
  }
  return {...value, board: active.hosts, boardModes: active.modes, boardInitialized: active.initialized};
}
function migrate(source) {
  source = path.resolve(source);
  if (fs.existsSync(file)) return {migrated: false, home, hosts: load().length};
  if (!fs.existsSync(path.join(source, 'hosts.json'))) throw Error('No host registry at ' + source);
  fs.mkdirSync(path.dirname(home), {recursive: true});
  fs.renameSync(source, home);
  const rows = load();
  for (const h of rows) for (const field of ['identityFile', 'knownHosts', 'sshConfig']) {
    if (h[field]?.startsWith(source + path.sep)) h[field] = home + h[field].slice(source.length);
  }
  save(rows);
  return {migrated: true, home, hosts: rows.length};
}
module.exports = {home, ensure, load, save, get, publicHost, list: () => load().map(publicHost), create, update, remove, password, target, status, migrate, reorder, workspace};
