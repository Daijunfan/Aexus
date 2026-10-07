import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Storage, atomicWrite, validateWorkspace } from '../../electron/storage.cjs';
import type { Page, Workspace } from '../types';

type Manifest = { format: 'mininotion.snapshot/v2'; workspace: Omit<Workspace, 'pages'>; pages: { id: string; hash: string }[] };
const digest = (body: string) => createHash('sha256').update(body).digest('hex');

/** Durable materialized cache for folder mode. Native page files remain the
 * interchange format; a commit writes changed cache objects and one small manifest.
 * Objects are immutable, so a crash before manifest publication retains the old
 * complete snapshot. Legacy workspace.json is read without destructive migration. */
export class FolderStorage extends Storage {
  private manifestFile: string;
  private objects: string;
  private cached = new WeakMap<Page, { id: string; hash: string }>();
  private known = new Set<string>();
  private commits = 0;
  constructor(directory: string) {
    super(directory);
    this.manifestFile = path.join(directory, 'workspace-manifest.json');
    this.objects = path.join(directory, 'cache', 'pages');
  }
  get initialized() { return fs.existsSync(this.manifestFile); }
  load(): Workspace | null {
    if (!fs.existsSync(this.manifestFile)) return super.load();
    const manifest = JSON.parse(fs.readFileSync(this.manifestFile, 'utf8')) as Manifest;
    if (manifest.format !== 'mininotion.snapshot/v2' || !Array.isArray(manifest.pages))
      throw new Error('MiniNotion 页面快照索引无效；原生页面文件未被覆盖');
    const pages = manifest.pages.map(entry => {
      if (!/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error('MiniNotion 页面快照标识无效');
      const body = fs.readFileSync(path.join(this.objects, entry.hash + '.json'), 'utf8');
      if (digest(body) !== entry.hash) throw new Error('MiniNotion 页面快照校验失败');
      const page = JSON.parse(body) as Page;
      if (page.id !== entry.id) throw new Error('MiniNotion 页面快照身份不一致');
      this.cached.set(page, entry); this.known.add(entry.hash);
      return page;
    });
    this.current = validateWorkspace({ ...manifest.workspace, pages });
    return this.current;
  }
  persist(workspace: Workspace) {
    fs.mkdirSync(this.objects, { recursive: true });
    const pages = workspace.pages.map(page => {
      let entry = this.cached.get(page);
      if (!entry || !this.known.has(entry.hash)) {
        const body = JSON.stringify(page), hash = digest(body);
        entry = { id: page.id, hash };
        if (!this.known.has(hash)) {
          const file = path.join(this.objects, hash + '.json');
          if (!fs.existsSync(file)) atomicWrite(file, body);
          else if (digest(fs.readFileSync(file, 'utf8')) !== hash) throw new Error('MiniNotion 页面缓存对象损坏');
          this.known.add(hash);
        }
        this.cached.set(page, entry);
      }
      return entry;
    });
    const { pages: _pages, ...metadata } = workspace;
    const manifest: Manifest = { format: 'mininotion.snapshot/v2', workspace: metadata, pages };
    if (fs.existsSync(this.manifestFile)) atomicWrite(this.manifestFile + '.previous', fs.readFileSync(this.manifestFile, 'utf8'));
    atomicWrite(this.manifestFile, manifest);
    // Housekeeping is never part of commit success. Keep both published snapshots.
    if (++this.commits % 64 === 0) { try { this.collect(); } catch { /* retry later */ } }
  }
  collect() {
    const keep = new Set<string>();
    for (const file of [this.manifestFile, this.manifestFile + '.previous']) {
      if (!fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest;
      for (const page of manifest.pages) keep.add(page.hash);
    }
    for (const name of fs.readdirSync(this.objects)) {
      if (/^[a-f0-9]{64}\.json$/.test(name) && !keep.has(name.slice(0, -5))) {
        fs.unlinkSync(path.join(this.objects, name)); this.known.delete(name.slice(0, -5));
      }
    }
  }
}
