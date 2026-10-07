import { folderDataDirectory } from './paths';
import { assertTreeAvailable, movedPath, withDirectoryMoves, type DirectoryMove } from './folderMoves';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, validateWorkspace, assetPath } from '../../electron/storage.cjs';
import { validateDomain } from '../core/validate';
import { makePage } from '../model';
import { executeWorkspaceCommand } from '../core/commands';
import { normalizeWorkspace } from '../core/normalize';
import { CommandError } from '../core/errors';
import { fileHash as digest, fileTransaction, type FileChange } from './folderTransaction';
import { ROOT_DOCUMENT, PAGE_LAYOUT, planPagePaths, posixPath, type FolderIndex } from './folderLayout';
import type { Page, Workspace } from '../types';

export const FOLDER_FORMAT = 'mininotion.page/v1';
const ignoredNames = new Set(['node_modules', '.git', '.mininotion', '.agents-company', '.claude', '.codex', 'dist', 'target']);
export const ignoredFolderPath = (value: string) => value.split(/[\\/]/).some(part => ignoredNames.has(part) || part.startsWith('.')) || /(?:^|[\\/])(?:AGENTS|CLAUDE)\.md$/.test(value) || value.endsWith('.tmp');
const fileId = (value: string) => `disk-${digest(value).slice(0, 24)}`;
export function withinFolder(root: string, value: string, write = false) {
  if (!value || value.includes('\0')) throw new CommandError('INVALID_PATH', '缺少有效文件路径');
  const file = path.resolve(root, value), relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new CommandError('WORKSPACE_BOUNDARY', '路径不属于当前 Workspace');
  let existing = file;
  // lstat also sees broken symlinks: never follow one while creating a target.
  while (!fs.lstatSync(existing, { throwIfNoEntry: false })) existing = path.dirname(existing);
  let resolved: string;
  try { resolved = fs.realpathSync(existing); } catch { throw new CommandError('INVALID_PATH', '路径包含失效的软链接'); }
  if (resolved !== root && !resolved.startsWith(root + path.sep))
    throw new CommandError('WORKSPACE_BOUNDARY', '软链接指向 Workspace 外部');
  if (write && (!relative || relative.split(path.sep).some(part => part === '.mininotion' || part === '.agents-company') || ['AGENTS.md', 'CLAUDE.md'].includes(path.basename(relative))))
    throw new CommandError('MANAGED_PATH', '不能通过文件接口覆盖工作区管理文件');
  return file;
}

export class FolderWorkspace {
  readonly root: string;
  readonly directory: string;
  readonly indexFile: string;
  readonly collectionRoot: string;
  index: FolderIndex = { files: {} };
  errors: { path: string; message: string }[] = [];
  importing = false;
  organizing = false;
  constructor(root: string) {
    this.root = fs.realpathSync(root);
    let collection = this.root;
    for (let candidate = this.root;; candidate = path.dirname(candidate)) {
      if (fs.existsSync(path.join(candidate,'.mininotion','collection.json'))) { collection = candidate; break; }
      if (candidate === path.dirname(candidate)) break;
    }
    this.collectionRoot = collection;
    this.directory = folderDataDirectory(root);
    this.indexFile = path.join(this.directory, 'folder-index.json');
    if (fs.existsSync(this.indexFile)) this.index = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
  }
  private saveIndex() { atomicWrite(this.indexFile, this.index); }
  private relative(file: string) { return posixPath(path.relative(this.root, file)) || '.'; }
  private directoryId(relative: string, workspace?: Workspace | null) {
    return workspace?.pages.find(page => page.sourceFile?.kind === 'directory' && page.sourceFile.path === relative)?.id
      || fileId(`directory:${path.resolve(this.root, relative)}`);
  }
  list(relative = '') {
    const directory = withinFolder(this.root, relative || '.');
    assertTreeAvailable(directory);
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter(entry => !ignoredFolderPath(entry.name) && !entry.isSymbolicLink())
      .map(entry => ({ name: entry.name, path: this.relative(path.join(directory, entry.name)), directory: entry.isDirectory(), bytes: entry.isFile() ? fs.statSync(path.join(directory, entry.name)).size : 0 }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  }
  read(relative: string) {
    const file = withinFolder(this.root, relative), stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
      throw new CommandError('PREVIEW_LIMIT', '文本预览最大支持 4 MB；请下载或使用原始文件');
    const content = fs.readFileSync(file, 'utf8');
    return { path: this.relative(file), content, hash: digest(content), bytes: stat.size };
  }
  write(relative: string, content: string, hash?: string) {
    const file = withinFolder(this.root, relative, true);
    if (Buffer.byteLength(content) > 4 * 1024 * 1024)
      throw new CommandError('PREVIEW_LIMIT', '文本文件接口最大支持 4 MB；较大文件请使用本地文件工具');
    fileTransaction([{ file, content, ...(hash ? { expected: hash } : {}) }]);
    return this.read(relative);
  }
  remove(relative: string) {
    const file = withinFolder(this.root, relative, true);
    relative = this.relative(file);
    if (!fs.statSync(file).isFile()) throw new CommandError('INVALID_PATH', '此接口只移除单个文件');
    const content = fs.readFileSync(file);
    const saved = path.join(this.directory, 'trash', `${randomUUID()}-${path.basename(file)}`);
    const next = structuredClone(this.index);
    if (next.files[relative]) next.files[relative].trash = path.basename(saved);
    fileTransaction([
      { file: saved, content, expected: null },
      { file, content: null, expected: digest(content) },
      { file: this.indexFile, content: JSON.stringify(next) },
    ]);
    this.index = next;
    return { path: relative, trash: saved };
  }
  restore(relative: string) {
    const file = withinFolder(this.root, relative, true);
    relative = this.relative(file);
    const entry = this.index.files[relative];
    if (!entry?.trash) throw new CommandError('FILE_NOT_FOUND', '回收目录中没有此文件');
    const saved = path.join(this.directory, 'trash', path.basename(entry.trash));
    const bytes = fs.readFileSync(saved), next = structuredClone(this.index);
    delete next.files[relative].trash;
    next.files[relative].stamp = '';
    fileTransaction([
      { file, content: bytes, expected: null },
      { file: saved, content: null, expected: digest(bytes) },
      { file: this.indexFile, content: JSON.stringify(next) },
    ]);
    this.index = next;
    return { path: relative };
  }

  location(pageId: string, workspace: Workspace) {
    const page = workspace.pages.find(value => value.id === pageId);
    if (!page) throw new CommandError('PAGE_NOT_FOUND', '未找到页面');
    const known = Object.entries(this.index.files).find(([, entry]) => entry.id === pageId);
    const relative = known?.[0] || page.sourceFile?.path;
    if (!relative) throw new CommandError('FILE_NOT_FOUND', '页面尚未持久保存');
    const directory = page.sourceFile?.kind === 'directory' ? relative : path.posix.dirname(relative);
    const rootEntry = Object.entries(this.index.files).find(([file, entry]) => entry.kind === 'native' && file === path.posix.join(directory, ROOT_DOCUMENT));
    return {
      pageId, path: relative, directory, absolutePath: withinFolder(this.root, relative),
      absoluteDirectory: withinFolder(this.root, directory), rootPageId: rootEntry?.[1].id || null,
      mainPage: path.dirname(withinFolder(this.root,directory)) === this.collectionRoot,
      scopeRoot: relative === ROOT_DOCUMENT, parentPageId: page.subItemOf || page.parentId, parentDirectory: path.posix.dirname(directory),
      depth: path.relative(this.collectionRoot,withinFolder(this.root,directory)).split(path.sep).filter(Boolean).length,
      scopeDepth: directory === '.' ? 0 : directory.split('/').length, layout: PAGE_LAYOUT, collectionRoot: this.collectionRoot,
      legacy: relative.split('/').includes('Documents') && path.posix.basename(relative) !== ROOT_DOCUMENT,
    };
  }
  info(workspace: Workspace | null) {
    return {
      root: this.root, collectionRoot: this.collectionRoot, dataDirectory: this.directory, layout: PAGE_LAYOUT,
      files: this.index.files, errors: this.errors,
      mainPages: workspace ? workspace.pages.filter(page => !page.trashedAt && !page.syncedSource && (!page.sourceFile || page.sourceFile.kind === 'directory')).map(page => ({ title: page.title, ...this.location(page.id, workspace) })).filter(page => page.mainPage) : [],
    };
  }
  audit(workspace: Workspace) {
    const pages = workspace.pages.filter(page => !page.trashedAt && !page.syncedSource && (!page.sourceFile || page.sourceFile.kind === 'directory'));
    const locations = pages.map(page => ({title:page.title,...this.location(page.id,workspace)}));
    const byId = new Map(locations.map(item=>[item.pageId,item]));
    const errors: {pageId:string;message:string}[] = [];
    for(const item of locations){
      const page=pages.find(page=>page.id===item.pageId)!;
      if(!page.sourceFile && path.posix.basename(item.path)!==ROOT_DOCUMENT) errors.push({pageId:item.pageId,message:'旧平铺页面尚未整理到独立文件夹'});
      const parent=item.parentPageId ? byId.get(item.parentPageId) : undefined;
      if(parent && path.dirname(item.absoluteDirectory)!==parent.absoluteDirectory)errors.push({pageId:item.pageId,message:'页面父子关系与物理目录不一致'});
      if(!parent && !item.scopeRoot && path.dirname(item.absoluteDirectory)!==this.root)errors.push({pageId:item.pageId,message:'顶层页面必须位于工作区的直接子文件夹'});
    }
    return {valid:!errors.length && !this.errors.length,layout:PAGE_LAYOUT,root:this.root,pageCount:locations.length,pages:locations,errors:[...errors,...this.errors]};
  }
  bind(relative: string, workspace: Workspace, title?: string, color = 'white') {
    const directory = withinFolder(this.root, relative || '.');
    if (!fs.statSync(directory).isDirectory()) throw new CommandError('INVALID_PATH', '请绑定已有文件夹');
    relative = this.relative(directory);
    if (relative === '.' && fs.existsSync(path.join(this.directory,'collection.json')))
      throw new CommandError('WORKSPACE_CONTAINER','工作区根是页面集合，请新建页面或绑定一个子文件夹');
    if (relative !== '.' && ignoredFolderPath(relative)) throw new CommandError('MANAGED_PATH', '不能将管理文件夹绑定为页面');
    const file = withinFolder(this.root, path.join(directory, ROOT_DOCUMENT), true);
    if (fs.existsSync(file)) {
      const document = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (document.format !== FOLDER_FORMAT || !document.page?.id) throw new CommandError('FILE_CONFLICT', '此文件夹已有不兼容的主页面文件');
      return { pageId: document.page.id, path: this.relative(file), created: false };
    }
    const id = this.directoryId(relative, workspace);
    const projected = workspace.pages.find(value => value.id === id);
    const page = makePage({ id, parentId: projected?.parentId ?? null, title: title ?? path.basename(directory), color: color as Page['color'] });
    const next = normalizeWorkspace({ ...workspace, pages: [...workspace.pages.filter(value => value.id !== id), page] });
    validateWorkspace(next); validateDomain(next);
    fileTransaction([{ file, content: JSON.stringify({ format: FOLDER_FORMAT, page }, null, 2) + '\n', expected: null }]);
    return { pageId: id, path: this.relative(file), created: true };
  }
  /** Directory projections become ordinary native pages on their first explicit
   * edit, including trash. Reading a workspace never creates document files. */
  materializeDirectories(workspace: Workspace, previous: Workspace | null): Workspace {
    if (this.importing || !previous) return workspace;
    const before = new Map(previous.pages.map(page => [page.id, page]));
    return { ...workspace, pages: workspace.pages.map(page => {
      if (page.sourceFile?.kind !== 'directory' || page === before.get(page.id) || JSON.stringify(page) === JSON.stringify(before.get(page.id))) return page;
      const { sourceFile: _source, ...native } = page;
      return native;
    }) };
  }
  organizationPlan(workspace: Workspace) {
    const locations = planPagePaths(this.root, workspace, this.index, workspace, true);
    return [...locations].flatMap(([pageId, to]) => {
      const from = Object.entries(this.index.files).find(([, entry]) => entry.id === pageId && entry.kind === 'native')?.[0];
      return from && from !== to ? [{ pageId, from, to }] : [];
    });
  }

  scan(input: Workspace | null): Workspace | null {
    const previousIndex = this.index;
    this.index = structuredClone(previousIndex);
    try {
      const workspace = input || executeWorkspaceCommand(null, 'workspace.init', { empty: true, name: path.basename(this.root) }).workspace!;
      const pages = new Map(workspace.pages.map(page => [page.id, page]));
      const seen = new Set<string>(), folders = new Set<string>();
      const files: string[] = [], pending = [''];
      let changed = !input;
      this.errors = [];
      // Every visible directory is a page; nested directories define page ancestry.
      while (pending.length) {
        const directory = pending.pop()!;
        for (const entry of this.list(directory)) {
          if (entry.directory) { folders.add(entry.path); pending.push(entry.path); }
          else { files.push(entry.path); seen.add(entry.path); }
        }
      }
      // Native roots first, so raw files can resolve their owning page below.
      files.sort((a, b) => Number(b.endsWith('.mininotion.json')) - Number(a.endsWith('.mininotion.json')) || a.localeCompare(b));
      for (const relative of files) {
        const file = withinFolder(this.root, relative), stat = fs.statSync(file);
        const stamp = `${stat.mtimeMs}:${stat.size}`, previous = this.index.files[relative];
        if (previous?.stamp === stamp && !previous.missing && pages.has(previous.id)) continue;
        try {
          const rich = relative.endsWith('.mininotion.json');
          const content = rich || stat.size <= 4 * 1024 * 1024 ? fs.readFileSync(file) : Buffer.from(stamp);
          const hash = digest(content);
          if (previous?.hash === hash && pages.has(previous.id) && !previous.trash && !previous.missing) { previous.stamp = stamp; continue; }
          let page: Page, kind: string;
          if (rich) {
            const data = JSON.parse(content.toString('utf8'));
            if (data.format !== FOLDER_FORMAT || !data.page || typeof data.page.title !== 'string')
              throw new Error('原生页面文件格式须为 mininotion.page/v1，并包含 page.title');
            if (previous && data.page.id && previous.id !== data.page.id) throw new Error('已有页面 ID 不可原地更改，请为副本创建新文件');
            const id = previous?.id || data.page.id || fileId(path.resolve(this.root, relative));
            for (const [other, entry] of Object.entries(this.index.files)) if (other !== relative && entry.id === id) {
              if (seen.has(other) || entry.trash) throw new Error('其他文件已使用同一页面 ID');
              delete this.index.files[other]; // External rename, not a second page.
            }
            page = makePage({ ...data.page, id, sourceFile: undefined, updatedAt: Math.max(Number(data.page.updatedAt) || 0, stat.mtimeMs) });
            kind = 'native';
          } else {
            const extension = path.extname(relative).toLowerCase();
            kind = ['.md', '.markdown'].includes(extension) ? 'markdown' : extension === '.csv' ? 'csv' : /\.(png|jpe?g|gif|webp|svg)$/.test(extension) ? 'image' : extension === '.pdf' ? 'pdf' : /\.(txt|json|ya?ml|[cm]?js|tsx?|jsx|py|rs|go|java|css|html?|sh|toml|xml|log)$/.test(extension) ? 'text' : 'binary';
            const id = previous?.id || fileId(path.resolve(this.root, relative)), old = pages.get(id);
            page = makePage({ ...old, id, title: path.basename(relative), locked: true, blocks: [], sourceFile: { path: relative, kind, hash }, trashedAt: undefined });
          }
          this.index.files[relative] = { id: page.id, hash, stamp, kind };
          pages.set(page.id, page); changed = true;
        } catch (error) { this.errors.push({ path: relative, message: String((error as Error).message) }); }
      }
      for (const [relative, entry] of Object.entries(this.index.files)) {
        if (seen.has(relative)) continue;
        entry.missing = true;
        const page = pages.get(entry.id);
        if (page && !page.trashedAt) { pages.set(page.id, { ...page, trashedAt: Date.now() }); changed = true; }
      }
      // Removing an index file must not make its retained physical folder reappear
      // as a new page. Purge markers survive cache rebuilds.
      const ownedRoots = new Map(Object.entries(this.index.files)
        .filter(([file, entry]) => entry.kind === 'native' && path.posix.basename(file) === ROOT_DOCUMENT && pages.has(entry.id))
        .map(([file, entry]) => [path.posix.dirname(file), entry.id]));
      const purged = new Set([...folders].filter(folder => !ownedRoots.has(folder) && fs.existsSync(path.join(this.root, folder, '.mininotion', 'page-tombstone.json'))));
      const parentForDirectory = (directory: string): string | null => {
        if (purged.has(directory)) {
          const marker = JSON.parse(fs.readFileSync(path.join(this.root, directory, '.mininotion', 'page-tombstone.json'), 'utf8'));
          return pages.has(marker.pageId) ? marker.pageId : parentForDirectory(path.posix.dirname(directory));
        }
        return ownedRoots.get(directory) || (directory === '.' ? null : this.directoryId(directory, workspace));
      };
      for (const folder of folders) {
        const id = this.directoryId(folder, workspace);
        if (ownedRoots.has(folder) || purged.has(folder)) {
          if (ownedRoots.get(folder) !== id && pages.get(id)?.sourceFile) { pages.delete(id); changed = true; }
          continue;
        }
        const parentId = parentForDirectory(path.posix.dirname(folder));
        const old = pages.get(id);
        if (!old || old.locked || old.parentId !== parentId) {
          pages.set(id, makePage({ ...old, id, parentId, title: old?.title ?? path.posix.basename(folder), locked: false, sourceFile: { path: folder, kind: 'directory', hash: '' } }));
          changed = true;
        }
      }
      for (const page of pages.values()) {
        if (!page.sourceFile || page.trashedAt) continue;
        if (page.sourceFile.kind === 'directory') {
          if (!folders.has(page.sourceFile.path)) { pages.delete(page.id); changed = true; }
        } else {
          const parentId = parentForDirectory(path.posix.dirname(page.sourceFile.path));
          if (page.parentId !== parentId) { pages.set(page.id, { ...page, parentId }); changed = true; }
        }
      }
      // Physical ancestry is authoritative for per-folder documents. A Team or
      // employee view never flattens an extra directory level in the collection.
      for (const [relative, entry] of Object.entries(this.index.files)) {
        const page = pages.get(entry.id);
        if (entry.kind !== 'native' || !page || page.syncedSource || path.posix.basename(relative) !== ROOT_DOCUMENT || relative === ROOT_DOCUMENT) continue;
        const physicalParentId = parentForDirectory(path.posix.dirname(path.posix.dirname(relative)));
        const physicalParent = physicalParentId ? pages.get(physicalParentId) : undefined;
        const subItemOf = page.subItemOf && physicalParent && !physicalParent.database && pages.get(physicalParent.parentId || '')?.database ? physicalParentId : null;
        const parentId = subItemOf ? physicalParent!.parentId : physicalParentId;
        if (page.parentId !== parentId || (page.subItemOf || null) !== subItemOf) {
          pages.set(page.id, { ...page, parentId, ...(page.subItemOf ? {subItemOf} : {}) }); changed = true;
        }
        delete entry.externalParentId;
      }
      // Keep the external parent on disk; projecting a smaller employee scope
      // must not detach records or rewrite the global hierarchy.
      for (const entry of Object.values(this.index.files)) {
        const page = pages.get(entry.id);
        if (entry.kind !== 'native' || !page) continue;
        if (page.parentId && !pages.has(page.parentId)) {
          entry.externalParentId = page.parentId;
          pages.set(page.id, { ...page, parentId: null }); changed = true;
        } else if (entry.externalParentId && pages.has(entry.externalParentId)) {
          pages.set(page.id, { ...page, parentId: entry.externalParentId });
          delete entry.externalParentId; changed = true;
        }
      }
      const next = changed ? normalizeWorkspace({ ...workspace, pages: [...pages.values()] }, false, input) : null;
      if (next) { validateWorkspace(next); validateDomain(next, input); }
      if (JSON.stringify(this.index) !== JSON.stringify(previousIndex)) this.saveIndex();
      return next;
    } catch (error) { this.index = previousIndex; throw error; }
  }

  save(next: Workspace, previous: Workspace | null, persist: () => void) {
    if (this.importing) { persist(); return; }
    if (previous && !this.organizing && next.pages.length === previous.pages.length && next.pages.every((page, index) => page === previous.pages[index])) { persist(); return; }
    const locations = planPagePaths(this.root, next, this.index, previous, this.organizing);
    const allMoves: DirectoryMove[] = [...locations].flatMap(([id, relative]) => {
      const known = Object.entries(this.index.files).find(([,entry])=>entry.id===id && entry.kind==='native');
      if (!known || known[1].trash || known[0]===relative || path.posix.basename(known[0])!==ROOT_DOCUMENT || path.posix.basename(relative)!==ROOT_DOCUMENT) return [];
      return [{from:withinFolder(this.root,path.posix.dirname(known[0])),to:withinFolder(this.root,path.posix.dirname(relative),true)}];
    });
    const moves=allMoves.filter(move=>!allMoves.some(parent=>parent!==move && move.from.startsWith(parent.from+path.sep) && movedPath(move.from,[parent])===move.to));
    const originalIndex=this.index;
    try {
      withDirectoryMoves(this.root,moves,()=>{
        if(moves.length){
          const relocate=(relative:string)=>this.relative(movedPath(path.resolve(this.root,relative),moves));
          this.index={...this.index,files:Object.fromEntries(Object.entries(this.index.files).map(([relative,entry])=>[relocate(relative),entry]))};
          next.pages=next.pages.map(page=>page.sourceFile ? {...page,sourceFile:{...page.sourceFile,path:relocate(page.sourceFile.path)}} : page);
        }
        this.saveFiles(next,previous,persist,locations);
      });
    } catch(error) {this.index=originalIndex;throw error;}
  }

  private saveFiles(next: Workspace, previous: Workspace | null, persist: ()=>void, locations: Map<string,string>) {
    const nextIndex = structuredClone(this.index);
    const changes: FileChange[] = [];
    const assets = new Map<string, FileChange>();
    const oldPages = new Map((previous?.pages || []).map(page => [page.id, page]));
    const knownPages = new Map(Object.entries(this.index.files).map(([relative, entry]) => [entry.id, { relative, entry }]));
    const copyAssets = (page: Page, relative: string) => {
      // Only resource-bearing fields reference attachments. Technical prose and
      // code may describe asset:// syntax without referring to any actual file.
      const urls = new Set<string>();
      const visit = (value: unknown) => {
        if (Array.isArray(value)) { for (const item of value) visit(item); return; }
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          if (['url', 'href', 'icon', 'cover', 'emoji'].includes(key) && typeof item === 'string' && item.startsWith('asset://local/')) urls.add(item);
          else if (typeof item === 'object') visit(item);
        }
      };
      visit(page);
      if (!urls.size) return;
      const metadata = folderDataDirectory(path.dirname(withinFolder(this.root, relative, true)));
      for (const url of urls) {
        const source = assetPath(this.directory, url, this.root);
        if (!fs.existsSync(source)) continue; // Broken references remain visible and editable.
        withinFolder(this.root, source);
        const target = assetPath(metadata, url);
        withinFolder(this.root, target);
        if (path.resolve(source) === path.resolve(target) || assets.has(target)) continue;
        const bytes = fs.readFileSync(source);
        if (fs.existsSync(target)) {
          if (digest(fs.readFileSync(target)) !== digest(bytes)) throw new CommandError('ASSET_CONFLICT', '同一附件 ID 对应不同内容，不会覆盖');
        } else assets.set(target, { file: target, content: bytes, expected: null });
      }
    };
    for (const page of next.pages) {
      const old = oldPages.get(page.id), known = knownPages.get(page.id);
      if (page.sourceFile) {
        if (!known) continue;
        const file = withinFolder(this.root, known.relative, true);
        if (page.trashedAt && !old?.trashedAt && fs.existsSync(file)) {
          const content = fs.readFileSync(file), trash = `${randomUUID()}-${path.basename(file)}`;
          const expected = content.length > 4 * 1024 * 1024 && known.entry.kind !== 'native' ? digest(content) : known.entry.hash;
          changes.push({ file: path.join(this.directory, 'trash', trash), content, expected: null }, { file, content: null, expected });
          nextIndex.files[known.relative].trash = trash;
        } else if (!page.trashedAt && old?.trashedAt && known.entry.trash) {
          const saved = path.join(this.directory, 'trash', path.basename(known.entry.trash)), content = fs.readFileSync(saved);
          changes.push({ file, content, expected: null }, { file: saved, content: null, expected: digest(content) });
          delete nextIndex.files[known.relative].trash;
          nextIndex.files[known.relative].stamp = '';
        }
        continue;
      }
      const relative = locations.get(page.id)!;
      if (old && (old === page || JSON.stringify(old) === JSON.stringify(page)) && known?.relative === relative) continue;
      const file = withinFolder(this.root, relative, true);
      const externalParentId = page.parentId ? undefined : known?.entry.externalParentId;
      const stored = externalParentId ? { ...page, parentId: externalParentId } : page;
      const content = JSON.stringify({ format: FOLDER_FORMAT, page: stored }, null, 2) + '\n';
      let source = known ? withinFolder(this.root, known.relative, true) : undefined;
      if (known?.entry.trash) source = path.join(this.directory, 'trash', path.basename(known.entry.trash));
      changes.push({ file, content, expected: source === file ? known!.entry.hash : null });
      if (source && source !== file) {
        if (known && path.posix.basename(known.relative) === ROOT_DOCUMENT && !known.entry.trash) {
          changes.push({ file: path.join(path.dirname(source), '.mininotion', 'page-tombstone.json'), content: JSON.stringify({ pageId: page.id, movedAt: Date.now() }) });
        }
        changes.push({ file: source, content: null, expected: known!.entry.hash });
        delete nextIndex.files[known!.relative];
      }
      nextIndex.files[relative] = { id: page.id, hash: digest(content), stamp: '', kind: 'native', ...(externalParentId ? { externalParentId } : {}) };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      copyAssets(page, relative);
    }
    const remaining = new Set(next.pages.map(page => page.id));
    for (const old of previous?.pages || []) if (!remaining.has(old.id)) {
      const known = knownPages.get(old.id);
      if (!known) continue;
      const file = known.entry.trash ? path.join(this.directory, 'trash', path.basename(known.entry.trash)) : withinFolder(this.root, known.relative, true);
      if (fs.existsSync(file)) {
        const expected = known.entry.kind !== 'native' && fs.statSync(file).size > 4 * 1024 * 1024 ? digest(fs.readFileSync(file)) : known.entry.hash;
        changes.push({ file, content: null, expected });
      }
      if (known.entry.kind === 'native' && path.posix.basename(known.relative) === ROOT_DOCUMENT) {
        const marker = path.join(path.dirname(withinFolder(this.root, known.relative, true)), '.mininotion', 'page-tombstone.json');
        changes.push({ file: marker, content: JSON.stringify({ pageId: old.id, purgedAt: Date.now() }) });
      }
      delete nextIndex.files[known.relative];
    }
    if (!changes.length) { persist(); return; }
    fileTransaction([...assets.values(), ...changes, { file: this.indexFile, content: JSON.stringify(nextIndex) }], persist);
    this.index = nextIndex;
  }
}
