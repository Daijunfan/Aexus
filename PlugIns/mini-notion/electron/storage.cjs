const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function validateWorkspace(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.pages) ||
    !data.settings ||
    typeof data.name !== 'string' ||
    !Array.isArray(data.expanded) ||
    !Array.isArray(data.recent)
  )
    throw new Error('这不是有效的 Mini Notion 工作空间。');
  const ids = new Set();
  for (const page of data.pages) {
    if (
      typeof page.id !== 'string' ||
      !page.id ||
      ids.has(page.id) ||
      typeof page.title !== 'string' ||
      !Array.isArray(page.blocks) ||
      !page.values
    )
      throw new Error('工作空间中的页面数据无效。');
    ids.add(page.id);
  }
  const pagesById = new Map(data.pages.map(page => [page.id, page]));
  for (const page of data.pages) {
    const seen = new Set([page.id]);
    let parentId = page.parentId;
    while (parentId) {
      if (seen.has(parentId) || !ids.has(parentId)) throw new Error('工作空间的页面层级无效。');
      seen.add(parentId);
      parentId = pagesById.get(parentId).parentId;
    }
  }
  return data;
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  const fd = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(fd, typeof value === 'string' ? value : JSON.stringify(value));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporary, file);
}

class Storage {
  constructor(directory) {
    this.directory = directory;
    this.file = path.join(directory, 'workspace.json');
    this.assets = path.join(directory, 'attachments');
    this.versionDirectory = path.join(directory, 'history');
    this.spacesDirectory = path.join(directory, 'spaces');
    this.agentsDirectory = path.join(directory, 'agents');
    fs.mkdirSync(this.assets, { recursive: true });
    this.current = null;
    this.lastSnapshot = new Map();
    this.backupDay = null;
  }
  load() {
    if (!fs.existsSync(this.file)) return null;
    this.current = validateWorkspace(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    return this.current;
  }
  save(workspace) {
    validateWorkspace(workspace);
    const now = Date.now();
    if (this.current) {
      const day = new Date().toISOString().slice(0, 10);
      if (this.backupDay !== day) {
        atomicWrite(path.join(this.directory, 'backups', `${day}.json`), this.current);
        this.backupDay = day;
        const backups = fs
          .readdirSync(path.join(this.directory, 'backups'))
          .filter((n) => n.endsWith('.json'))
          .sort()
          .reverse();
        for (const file of backups.slice(30)) fs.unlinkSync(path.join(this.directory, 'backups', file));
      }
      const nextById = new Map(workspace.pages.map((p) => [p.id, p]));
      for (const old of this.current.pages) {
        const next = nextById.get(old.id);
        if (
          next &&
          next.updatedAt !== old.updatedAt &&
          now - (this.lastSnapshot.get(old.id) || 0) > 5 * 60_000
        )
          this.snapshot(old);
      }
    }
    this.persist(workspace);
    this.current = workspace;
    return now;
  }
  persist(workspace) {
    atomicWrite(this.file, workspace);
  }
  historyFile(id) {
    return path.join(this.versionDirectory, `${Buffer.from(id).toString('hex')}.json`);
  }
  versions(id) {
    const file = this.historyFile(id);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  }
  snapshot(page) {
    const now = Date.now();
    const entries = this.versions(page.id);
    if (!entries[0] || JSON.stringify(entries[0].page) !== JSON.stringify(page)) {
      entries.unshift({ id: randomUUID(), at: now, page });
      atomicWrite(this.historyFile(page.id), entries.slice(0, 60));
    }
    this.lastSnapshot.set(page.id, now);
  }
  saveAsset(name, bytes) {
    const extension = path
      .extname(name)
      .replace(/[^.a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const filename = randomUUID() + extension;
    fs.writeFileSync(path.join(this.assets, filename), Buffer.from(bytes), { mode: 0o600 });
    return `asset://local/${filename}`;
  }
  assetPath(url) {
    return assetPath(this.directory, url);
  }

  spaceRoot(pageId) {
    if (typeof pageId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(pageId))
      throw new Error('无效的空间页面 ID');
    return path.join(this.spacesDirectory, pageId);
  }
  spaceDirectory(pageId, folderId) {
    const root = this.spaceRoot(pageId);
    if (folderId === null || folderId === undefined) return root;
    if (typeof folderId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(folderId))
      throw new Error('无效的文件夹 ID');
    const folder = this.current?.pages
      .find((page) => page.id === pageId)
      ?.folders?.find((folder) => folder.id === folderId);
    const directory = path.join(root, folder?.path || folderId);
    const resolved = path.resolve(directory);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('无效的空间路径');
    return resolved;
  }
  saveSpaceFile(pageId, folderId, name, bytes) {
    const directory = this.spaceDirectory(pageId, folderId);
    const real = this.resolveWithinSpace(pageId, directory);
    fs.mkdirSync(real, { recursive: true, mode: 0o700 });
    const extension = path
      .extname(name)
      .replace(/[^.a-zA-Z0-9]/g, '')
      .slice(0, 16);
    const filename = randomUUID() + extension;
    fs.writeFileSync(path.join(real, filename), Buffer.from(bytes), { mode: 0o600 });
    return {
      filename,
      path: path.join(real, filename),
      url: `asset://local/spaces/${pageId}/${folderId ? `${folderId}/` : ''}${filename}`,
    };
  }
  resolveWithinSpace(pageId, target) {
    const root = this.spaceRoot(pageId);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const base = fs.realpathSync(root);
    const absolute = path.resolve(target);
    if (
      ![path.resolve(root), base].some(
        (directory) => absolute === directory || absolute.startsWith(directory + path.sep),
      )
    )
      throw new Error('空间路径越界');
    let ancestor = absolute;
    while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) ancestor = path.dirname(ancestor);
    const realAncestor = fs.realpathSync(ancestor);
    if (realAncestor !== base && !realAncestor.startsWith(base + path.sep)) throw new Error('空间路径越界');
    fs.mkdirSync(target, { recursive: true, mode: 0o700 });
    const resolved = fs.realpathSync(target);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error('空间路径越界');
    return resolved;
  }
  removeSpace(pageId) {
    const root = this.spaceRoot(pageId);
    if (root.startsWith(this.spacesDirectory + path.sep))
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
  agentLogFile(pageId, conversationId) {
    if (typeof pageId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(pageId))
      throw new Error('无效的空间页面 ID');
    if (
      conversationId !== undefined &&
      (typeof conversationId !== 'string' || !/^[0-9a-zA-Z_-]{1,64}$/.test(conversationId))
    )
      throw new Error('无效的会话 ID');
    return path.join(this.agentsDirectory, `${pageId}${conversationId ? `.${conversationId}` : ''}.jsonl`);
  }
  appendAgentLog(pageId, entries, conversationId) {
    fs.mkdirSync(this.agentsDirectory, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.agentLogFile(pageId, conversationId), `${JSON.stringify(entries)}\n`, {
      mode: 0o600,
    });
  }
  readAgentLog(pageId, limit = 200, conversationId) {
    const file = this.agentLogFile(pageId, conversationId);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const messages = [];
    for (const line of lines)
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) messages.push(...parsed);
      } catch {
        /* A truncated tail line from a killed process is not worth failing over. */
      }
    return [...new Map(messages.map((message) => [message.id, message])).values()].slice(-limit);
  }
  removeAgentLog(pageId) {
    fs.rmSync(this.agentLogFile(pageId), { force: true });
    if (!fs.existsSync(this.agentsDirectory)) return;
    for (const name of fs.readdirSync(this.agentsDirectory))
      if (name.startsWith(`${pageId}.`) && name.endsWith('.jsonl'))
        fs.rmSync(path.join(this.agentsDirectory, name), { force: true });
  }
}

function assetPath(directory, url, workspaceRoot) {
  if(workspaceRoot){
    const own=assetPath(directory,url);
    const allowed=file=>{if(!fs.realpathSync(file).startsWith(workspaceRoot+path.sep))throw new Error('附件指向工作目录外部');return file};
    if(fs.existsSync(own))return allowed(own);
    // Native documents keep immutable attachment IDs. A parent workspace can
    // resolve those IDs in descendant workspace stores, never in ancestors.
    const find=folder=>{
      const metadata=path.join(folder,'.mininotion');
      if(folder!==workspaceRoot&&fs.existsSync(metadata)&&!fs.lstatSync(metadata).isSymbolicLink()){
        const candidate=assetPath(metadata,url);if(fs.existsSync(candidate))return allowed(candidate);
      }
      for(const entry of fs.readdirSync(folder,{withFileTypes:true}))if(entry.isDirectory()&&!entry.name.startsWith('.')&&!['node_modules','dist','target'].includes(entry.name)){
        const found=find(path.join(folder,entry.name));if(found)return found;
      }
    };
    return find(workspaceRoot)||own;
  }
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.protocol !== 'asset:' || parsed.hostname !== 'local' || !name) throw new Error('无效的附件路径');
  if (/^spaces\/[0-9a-zA-Z_-]{1,64}\//.test(name)) {
    const parts = name.split('/');
    if (
      parts.some(
        (part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'),
      ) ||
      parts.includes('.mininotion-runtime')
    )
      throw new Error('无效的空间文件路径');
    const root = path.join(directory, 'spaces', parts[1]);
    const target = path.join(directory, name);
    if (fs.existsSync(target) && !fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep))
      throw new Error('空间文件路径越界');
    return target;
  }
  if (path.basename(name) !== name || name === '.' || name === '..') throw new Error('无效的附件路径');
  return path.join(directory, 'attachments', name);
}
module.exports = { Storage, atomicWrite, validateWorkspace, assetPath };
