import fs from 'node:fs';
import path from 'node:path';
import { CommandError } from '../core/errors';
import { syncedReferences } from '../content/references';
import type { Page, Workspace } from '../types';

export const ROOT_DOCUMENT = 'index.mininotion.json';
export const PAGE_LAYOUT = 'page-folder-tree/v2';
export type FolderEntry = {
  id: string; hash: string; stamp: string; kind: string;
  trash?: string; externalParentId?: string; missing?: boolean;
};
export type FolderIndex = { files: Record<string, FolderEntry> };
export const posixPath = (value: string) => value.split(path.sep).join('/');

function directoryName(page: Page) {
  const title = page.title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim();
  const name = [...title].slice(0, 64).join('') || `Untitled-${page.id.slice(0, 8)}`;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name.startsWith('.') ? `Page-${name}` : name;
}

/** Existing folders are never renamed for title changes. Legacy document paths
 * remain untouched until an explicit fs.organize request. */
export function planPagePaths(root: string, workspace: Workspace, index: FolderIndex, previous?: Workspace | null, organize = false) {
  const pages = new Map(workspace.pages.map(page => [page.id, page]));
  const before = new Map((previous?.pages || []).map(page => [page.id, page]));
  const known = new Map(Object.entries(index.files).filter(([, entry]) => entry.kind === 'native').map(([relative, entry]) => [entry.id, { relative, entry }]));
  const paths = new Map<string, string>();
  const visiting = new Set<string>();
  const reserved = new Map<string, Set<string>>();
  const namesIn = (directory: string) => {
    if (!reserved.has(directory)) {
      const absolute = path.resolve(root, directory);
      reserved.set(directory, new Set(fs.existsSync(absolute) ? fs.readdirSync(absolute).map(name => name.normalize('NFC').toLowerCase()) : []));
    }
    return reserved.get(directory)!;
  };
  const allocate = (page: Page, parent = '.', basename = directoryName(page)) => {
    const used = namesIn(parent); let name = basename;
    for (let suffix = 2; used.has(name.normalize('NFC').toLowerCase()); suffix++) name = `${basename} (${suffix})`;
    used.add(name.normalize('NFC').toLowerCase());
    return path.posix.join(parent, name, ROOT_DOCUMENT);
  };
  const resolve = (page: Page): string => {
    if (paths.has(page.id)) return paths.get(page.id)!;
    if (visiting.has(page.id)) throw new CommandError('INVALID_PARENT', '页面层级不能包含循环');
    visiting.add(page.id);
    const saved = known.get(page.id);
    const parentId = page.subItemOf || page.parentId;
    const parent = parentId ? pages.get(parentId) : undefined;
    const old = before.get(page.id);
    let relative: string;
    // A projected root in an employee scope retains the parent stored on disk.
    // It must not move out of its bound directory just because that parent is absent.
    if (!saved && old?.sourceFile?.kind === 'directory') relative = path.posix.join(old.sourceFile.path, ROOT_DOCUMENT);
    else if (saved?.relative === ROOT_DOCUMENT) relative = ROOT_DOCUMENT;
    else if (saved && !organize && path.posix.basename(saved.relative) !== ROOT_DOCUMENT && (old?.subItemOf || old?.parentId) === parentId)
      relative = saved.relative;
    else if (page.syncedSource) {
      const owners = syncedReferences(workspace, page.id, true)
        .map(reference => pages.get(reference.pageId)).filter((candidate): candidate is Page => !!candidate && !candidate.syncedSource);
      const owner = owners.find(candidate => saved && path.posix.dirname(resolve(candidate)) === path.posix.dirname(saved.relative)) || owners[0];
      relative = owner ? path.posix.join(path.posix.dirname(resolve(owner)), `${page.id}.mininotion.json`)
        : saved?.relative || path.posix.join('Shared content', `${page.id}.mininotion.json`);
    }
    else {
      const directory = !parent ? '.' : parent.sourceFile?.kind === 'directory' ? parent.sourceFile.path : parent.sourceFile ? path.posix.dirname(parent.sourceFile.path) : path.posix.dirname(resolve(parent));
      const oldDirectory = saved && path.posix.basename(saved.relative) === ROOT_DOCUMENT ? path.posix.dirname(saved.relative) : undefined;
      if (oldDirectory && path.posix.dirname(oldDirectory) === directory) relative = saved!.relative;
      else if (oldDirectory && (old?.subItemOf || old?.parentId) === parentId) {
        relative = path.posix.join(directory, path.posix.basename(oldDirectory), ROOT_DOCUMENT);
        namesIn(directory).add(path.posix.basename(oldDirectory).normalize('NFC').toLowerCase());
      } else relative = allocate(page, directory, oldDirectory ? path.posix.basename(oldDirectory) : directoryName(page));
    }
    paths.set(page.id, path.posix.normalize(relative));
    visiting.delete(page.id);
    return relative;
  };
  for (const page of workspace.pages) if (!page.sourceFile) resolve(page);
  return paths;
}
