import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { DataService } from './service';
import type { CommandParams } from '../core/protocol';
import type { Page, Workspace, FileValue } from '../types';
import { CommandError, requiredString } from '../core/errors';
import { executeWorkspaceCommand, requirePage } from '../core/commands';
import { flattenBlocks, normalizeBlocks } from '../core/blocks';
import { normalizeWorkspace } from '../core/normalize';
import { descendants, duplicatePage, makePage, readProperty } from '../model';
import { csvPages, databaseCSV, portableBlocks } from '../transfer';
import { validateWorkspace } from '../../electron/storage.cjs';
import { validateDomain } from '../core/validate';
import { newView } from '../database/model';
import { sourceClosure } from '../content/references';

export const mimeType = (name: string) =>
  ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
  })[path.extname(name).toLowerCase()] || 'application/octet-stream';

export function spaceFilePath(
  service: DataService,
  pageId: string,
  file: import('../types').SpaceFileRecord,
) {
  const source = file.url.startsWith('asset://local/spaces/')
    ? service.storage.assetPath(file.url)
    : path.join(
        service.storage.spaceDirectory(pageId, file.folderId),
        path.basename(service.storage.assetPath(file.url)),
      );
  const root = fs.realpathSync(service.storage.spaceRoot(pageId));
  if (!fs.existsSync(source)) throw new CommandError('FILE_NOT_FOUND', '空间文件已不存在');
  if (!fs.realpathSync(source).startsWith(root + path.sep))
    throw new CommandError('SPACE_ACCESS_DENIED', '文件不属于此空间');
  return source;
}

const DISK_METHODS = new Set([
  'space.upload',
  'space.remove-file',
  'space.purge',
  'space.reveal',
  'space.sync',
  'file.read',
  'file.resolve',
  'file.create',
  'file.write-content',
]);
/** Include arbitrary Workspace files; private engine credentials and symlinks never enter backups. */
function spaceArchiveEntries(directory: string, prefix = 'spaces'): string[] {
  const entries: string[] = [];
  const walk = (relative: string) => {
    const absolute = path.join(directory, relative);
    if (!fs.existsSync(absolute)) return;
    for (const item of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (item.name === '.mininotion-runtime' || item.isSymbolicLink()) continue;
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) walk(name);
      else if (item.isFile()) entries.push(name);
    }
  };
  walk(prefix);
  return entries;
}
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 160) || '无标题';
const escapeHTML = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const filePath = (value: unknown) => path.resolve(requiredString(value, 'path'));
const write = (file: string, data: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data, { mode: 0o600 });
};
const converter = () =>
  import(pathToFileURL(path.join(__dirname, 'converter.mjs')).href) as Promise<typeof import('./converter')>;

export function copyExportAssets(service: DataService, content: string, output: string, absolute = false) {
  const folder = `${path.basename(output, path.extname(output))}.assets`;
  for (const url of new Set(content.match(/asset:\/\/local\/[a-zA-Z0-9_./-]+/g) || [])) {
    const source = service.storage.assetPath(url);
    if (!fs.existsSync(source)) throw new CommandError('ASSET_NOT_FOUND', `找不到附件 ${url}`);
    const destination = path.join(path.dirname(output), folder, path.basename(source));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    content = content.replaceAll(
      url,
      absolute ? pathToFileURL(destination).href : `${encodeURIComponent(folder)}/${path.basename(source)}`,
    );
  }
  return content;
}

function importAssets(service: DataService, content: string, source: string) {
  const directory = path.dirname(source);
  const importURL = (url: string) => {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(url)) return url;
    const referenced = path.resolve(directory, decodeURIComponent(url));
    if (
      !referenced.startsWith(directory + path.sep) ||
      !fs.existsSync(referenced) ||
      !fs.statSync(referenced).isFile()
    )
      return url;
    if(service.folder&&!fs.realpathSync(referenced).startsWith(service.folder.root+path.sep))throw new CommandError('WORKSPACE_BOUNDARY','附件链接指向 Workspace 外部');
    return service.storage.saveAsset(path.basename(referenced), fs.readFileSync(referenced));
  };
  if (source.endsWith('.json')) {
    return JSON.stringify(
      JSON.parse(content, (_key, value) =>
        typeof value === 'string' && /^[^/]+\.assets\//.test(value) ? importURL(value) : value,
      ),
    );
  }
  content = content.replace(
    /(!?\[[^\]]*\]\()([^\s)]+)(\))/g,
    (_, prefix, url, suffix) => prefix + importURL(url) + suffix,
  );
  return content.replace(
    /((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi,
    (_, prefix, url, suffix) => prefix + importURL(url) + suffix,
  );
}

async function pdf(document: string | { workspace: Workspace; dataDirectory: string }, output: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-pdf-'));
  const input = path.join(directory, typeof document === 'string' ? 'page.html' : 'page.json');
  write(input, typeof document === 'string' ? document : JSON.stringify(document));
  const executable =
    process.env.MINI_NOTION_EXECUTABLE ||
    (process.versions.electron ? process.execPath : require('electron'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        executable,
        [path.join(__dirname, '..'), '--mini-notion-pdf', input, output, directory],
        { env, stdio: ['ignore', 'ignore', 'pipe'] },
      );
      let error = '';
      child.stderr.on('data', (data) => {
        error += data;
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new CommandError('PDF_TIMEOUT', 'PDF 导出超时'));
      }, 60000);
      child.on('error', (reason) => {
        clearTimeout(timer);
        reject(reason);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new CommandError('PDF_FAILED', error || `PDF 进程退出：${code}`));
      });
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function backup(service: DataService, output: string) {
  const zip = new JSZip();
  zip.file('workspace.json', JSON.stringify(service.workspace));
  zip.file('changes.json', JSON.stringify(service.changes.export()));
  for (const folder of ['attachments', 'history', 'conflicts', 'agents']) {
    const directory = path.join(service.storage.directory, folder);
    if (fs.existsSync(directory))
      for (const name of fs.readdirSync(directory)) {
        if (fs.statSync(path.join(directory, name)).isFile())
          zip.file(`${folder}/${name}`, fs.readFileSync(path.join(directory, name)));
      }
  }
  for (const name of spaceArchiveEntries(service.storage.directory))
    zip.file(name, fs.readFileSync(path.join(service.storage.directory, name)));
  write(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { path: output, bytes: fs.statSync(output).size };
}

export async function runFileCommand(
  service: DataService,
  method: string,
  params: CommandParams,
): Promise<{ result: any; workspace?: Workspace } | undefined> {
  const workspace = service.workspace;
  if (!['history', 'asset', 'file', 'backup'].includes(method.split('.')[0]) && !DISK_METHODS.has(method) && !['page.write-markdown', 'page.read-markdown'].includes(method))
    return;
  if (!workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
  if (method === 'page.write-markdown' || method === 'page.read-markdown') {
    const page = requirePage(workspace, params.pageId);
    if (page.sourceFile) throw new CommandError('NATIVE_PAGE_REQUIRED', '请先 page.create 创建原生页面；原始文件使用 fs.read/write');
    const hash = (blocks: Page['blocks']) => createHash('sha256').update(JSON.stringify(blocks)).digest('hex');
    const currentHash = hash(page.blocks);
    if (method === 'page.read-markdown') return { result: { pageId: page.id, title: page.title, parentId: page.parentId, hash: currentHash, blockCount: flattenBlocks(page.blocks).length, markdown: await (await converter()).serializeDocument(portableBlocks(page.blocks, workspace), 'md'), projection: true } };
    if (typeof params.markdown !== 'string') throw new CommandError('INVALID_ARGUMENT', 'markdown 必须是字符串；长文通过 --data @request.json 或 stdin 提交');
    if (Buffer.byteLength(params.markdown, 'utf8') > 4 * 1024 * 1024) throw new CommandError('PREVIEW_LIMIT', '单次 Markdown 正文最大 4 MB；可分段追加');
    const mode = params.mode ?? 'replace';
    if (!['replace', 'append'].includes(mode)) throw new CommandError('INVALID_ARGUMENT', 'mode 必须为 replace 或 append');
    if (params.expectedHash !== undefined && params.expectedHash !== currentHash) throw new CommandError('CONFLICT', '页面正文已变化，请先 page.read-markdown 重新读取并合并', { currentHash });
    const blocks = normalizeBlocks(await (await converter()).parseDocument(params.markdown, 'md'), true);
    const operation = executeWorkspaceCommand(workspace, mode === 'append' ? 'block.append' : 'block.replace', { pageId: page.id, blocks });
    const updated = operation.workspace!.pages.find(item => item.id === page.id)!;
    return { workspace: operation.workspace!, result: { pageId: page.id, mode, hash: hash(updated.blocks), blockCount: flattenBlocks(updated.blocks).length, addedBlockCount: flattenBlocks(blocks).length } };
  }
  if (method === 'file.resolve') {
    const page = requirePage(workspace, params.pageId);
    if (!page.space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
    const reference = requiredString(params.path, 'path');
    const position = reference.match(/(?:#L|:)(\d+)(?::\d+)?(?:-L?\d+)?$/);
    if (position && Number(position[1]) < 1) throw new CommandError('INVALID_ARGUMENT', '文件行号从 1 开始');
    const name = position ? reference.slice(0, position.index) : reference;
    const root = fs.realpathSync(service.storage.spaceRoot(page.id));
    const target = path.resolve(
      root,
      name.startsWith('file://')
        ? fileURLToPath(name)
        : name.startsWith('asset://local/')
          ? service.storage.assetPath(name)
          : name,
    );
    if (!target.startsWith(root + path.sep))
      throw new CommandError('SPACE_ACCESS_DENIED', '文件链接不属于此 Workspace');
    const synced = await runFileCommand(service, 'space.sync', { pageId: page.id });
    const file = (synced!.result.files as import('../types').SpaceFileRecord[]).find(
      (file) => path.resolve(service.storage.assetPath(file.url)) === target,
    );
    if (!file) throw new CommandError('FILE_NOT_FOUND', '找不到此 Workspace 中的文件');
    const resolved = spaceFilePath(service, page.id, file);
    return {
      workspace: synced?.workspace,
      result: {
        pageId: page.id,
        fileId: file.id,
        path: resolved,
        ...(position ? { line: Number(position[1]) } : {}),
      },
    };
  }
  if (method === 'space.sync') {
    const page = requirePage(workspace, params.pageId);
    if (!page.space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
    const root = service.storage.spaceRoot(page.id);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const folders = (page.folders || []).filter(
      (folder) => !folder.path || fs.existsSync(path.join(root, folder.path)),
    );
    const files = (page.files || [])
      .filter((file) => fs.existsSync(service.storage.assetPath(file.url)))
      .map((file) => ({ ...file }));
    const scan = (relative: string, parentId: string | null) => {
      for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
        if (entry.name === '.mininotion-runtime' || entry.name === '.git' || entry.isSymbolicLink()) continue;
        const name = path.join(relative, entry.name);
        if (page.removedFolderPaths?.includes(name)) continue;
        if (entry.isDirectory()) {
          let folder = folders.find((folder) => (folder.path || folder.id) === name);
          if (!folder) {
            folder = { id: crypto.randomUUID(), name: entry.name, path: name, parentId };
            folders.push(folder);
          }
          scan(name, folder.id);
        } else if (entry.isFile()) {
          const url = `asset://local/spaces/${page.id}/${name.split(path.sep).map(encodeURIComponent).join('/')}`;
          if (
            page.removedFileUrls?.some((removed) => decodeURIComponent(removed) === decodeURIComponent(url))
          )
            continue;
          const current = files.find((file) => decodeURIComponent(file.url) === decodeURIComponent(url));
          const stat = fs.statSync(path.join(root, name));
          if (current) {
            current.bytes = stat.size;
            current.modifiedAt = stat.mtimeMs;
          } else
            files.push({
              id: crypto.randomUUID(),
              name: entry.name,
              url,
              bytes: stat.size,
              folderId: parentId,
              mimeType: mimeType(entry.name),
              createdAt: stat.birthtimeMs || stat.mtimeMs,
              modifiedAt: stat.mtimeMs,
            });
        }
      }
    };
    scan('', null);
    const changed =
      JSON.stringify([page.folders || [], page.files || []]) !== JSON.stringify([folders, files]);
    return {
      result: { path: root, folders, files },
      ...(changed
        ? {
            workspace: {
              ...workspace,
              pages: workspace.pages.map((value) =>
                value.id === page.id ? { ...value, folders, files } : value,
              ),
            },
          }
        : {}),
    };
  }
  if (method === 'space.upload' || method === 'file.create') {
    const page = requirePage(workspace, params.pageId);
    if (!page.space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
    if (params.folderId && !page.folders?.some((folder) => folder.id === params.folderId))
      throw new CommandError('FOLDER_NOT_FOUND', '找不到文件夹');
    const name =
      method === 'space.upload'
        ? params.name || path.basename(filePath(params.path))
        : requiredString(params.name, 'name');
    const bytes =
      method === 'space.upload'
        ? fs.readFileSync(filePath(params.path))
        : Buffer.from(String(params.content ?? ''), params.encoding === 'base64' ? 'base64' : 'utf8');
    const file = service.storage.saveSpaceFile(page.id, params.folderId ?? null, name, bytes);
    const operation = executeWorkspaceCommand(workspace, 'file.record', {
      pageId: page.id,
      name,
      url: file.url,
      bytes: bytes.length,
      folderId: params.folderId ?? null,
      mimeType: params.mimeType || mimeType(name),
    });
    return { result: operation.result, workspace: operation.workspace! };
  }
  if (method === 'file.read' || method === 'file.write-content' || method === 'space.remove-file') {
    const page = requirePage(workspace, params.pageId);
    const record = (page.files || []).find((file) => file.id === params.fileId);
    if (!record) throw new CommandError('FILE_NOT_FOUND', '找不到文件');
    const source = spaceFilePath(service, page.id, record);
    if (method === 'space.remove-file') {
      // Keep the bytes for undo and backups; permanent page deletion removes the directory.
      const operation = executeWorkspaceCommand(workspace, 'file.remove', params);
      return { result: operation.result, workspace: operation.workspace! };
    }
    if (method === 'file.write-content') {
      const bytes = Buffer.from(
        String(params.content ?? ''),
        params.encoding === 'base64' ? 'base64' : 'utf8',
      );
      write(source, bytes);
      const updated = { ...record, bytes: bytes.length, modifiedAt: fs.statSync(source).mtimeMs };
      return {
        result: updated,
        workspace: {
          ...workspace,
          pages: workspace.pages.map((value) =>
            value.id === page.id
              ? {
                  ...value,
                  files: value.files!.map((file) =>
                    file.id === record.id ? updated : file,
                  ),
                  updatedAt: Date.now(),
                }
              : value,
          ),
        },
      };
    }
    return {
      result: {
        ...record,
        path: source,
        content: fs.readFileSync(source).toString(params.encoding === 'base64' ? 'base64' : 'utf8'),
      },
    };
  }
  if (method === 'space.purge') {
    if (workspace.pages.some((page) => page.id === params.pageId))
      throw new CommandError('NOT_PURGED', '请先使用 page.purge 永久删除页面');
    service.storage.removeSpace(String(params.pageId));
    service.storage.removeAgentLog(String(params.pageId));
    return { result: { purged: params.pageId } };
  }
  if (method === 'space.reveal') {
    const page = requirePage(workspace, params.pageId);
    return { result: { path: service.storage.spaceRoot(page.id) } };
  }
  if (method.startsWith('history.')) {
    const page = requirePage(workspace, params.pageId, true);
    if (method === 'history.list') return { result: service.storage.versions(page.id) };
    if (method === 'history.snapshot') {
      service.storage.snapshot(page);
      return { result: service.storage.versions(page.id)[0] };
    }
    if (method === 'history.restore') {
      const version = service.storage.versions(page.id).find((version) => version.id === params.versionId);
      if (!version) throw new CommandError('VERSION_NOT_FOUND', '未找到历史版本');
      service.storage.snapshot(page);
      const { title, blocks, icon, cover, coverPosition, font, smallText, fullWidth, database, values } =
        version.page;
      const restored = {
        ...page,
        title,
        blocks: normalizeBlocks(blocks),
        icon,
        cover,
        coverPosition,
        font,
        smallText,
        fullWidth,
        database,
        values,
        showDescription: version.page.showDescription,
        subItemOf:
          workspace.pages.some((parent) => parent.id === page.parentId && parent.database) &&
          workspace.pages.some(
            (parent) =>
              parent.id === version.page.subItemOf && parent.parentId === page.parentId && !parent.trashedAt,
          )
            ? version.page.subItemOf
            : null,
        blockedBy: workspace.pages.some((parent) => parent.id === page.parentId && parent.database)
          ? (version.page.blockedBy || []).filter((id) =>
              workspace.pages.some((target) => target.id === id && target.parentId === page.parentId),
            )
          : [],
        updatedAt: Date.now(),
      };
      return {
        result: restored,
        workspace: {
          ...workspace,
          pages: workspace.pages.map((item) => (item.id === page.id ? restored : item)),
        },
      };
    }
  }
  if (method === 'asset.list')
    return {
      result: fs.readdirSync(service.storage.assets).map((name) => ({
        name,
        url: `asset://local/${name}`,
        bytes: fs.statSync(path.join(service.storage.assets, name)).size,
      })),
    };
  if (method === 'asset.add') {
    const file = filePath(params.path);
    return {
      result: {
        url: service.storage.saveAsset(path.basename(file), fs.readFileSync(file)),
        name: path.basename(file),
      },
    };
  }
  if (method === 'asset.get') {
    const source = service.storage.assetPath(requiredString(params.url, 'url'));
    const output = params.output ? filePath(params.output) : source;
    if (output !== source) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.copyFileSync(source, output);
    }
    return { result: { path: output, bytes: fs.statSync(output).size } };
  }
  if (method === 'file.import') {
    const source = params.path
      ? filePath(params.path)
      : path.join(service.storage.directory, 'imports', requiredString(params.name, 'name'));
    const content = importAssets(service, params.content ?? fs.readFileSync(source, 'utf8'), source);
    const type = path.extname(source).slice(1).toLowerCase();
    let pages: Page[];
    let primaryPageId: string | undefined;
    let omittedDependencies = 0;
    if (type === 'csv') pages = csvPages(path.basename(source), content);
    else if (type === 'json') {
      const data = JSON.parse(content);
      if (!data.page)
        throw new CommandError('INVALID_DOCUMENT', '页面 JSON 缺少 page；工作空间请使用 backup restore');
      const original = makePage({ ...data.page, parentId: data.databaseContext?.id || null });
      let imported = [original, ...(data.children || []), ...(data.syncedSources || [])] as Page[];
      let root = original;
      if (data.databaseContext) {
        const view = newView('table');
        root = makePage({
          id: requiredString(data.databaseContext.id, 'databaseContext.id'),
          title: `${original.title || '记录'}（导入）`,
          icon: '📋',
          fullWidth: true,
          database: {
            ...data.databaseContext.definition,
            view: 'table',
            views: [view],
            activeViewId: view.id,
            defaultTemplateId: null,
          },
        });
        imported = [root, ...imported];
      }
      const byId = new Map(imported.map((page) => [page.id, page]));
      imported = imported.map((page) => {
        const blockedBy = page.blockedBy?.filter(
          (id) => byId.get(id)?.parentId === page.parentId && byId.get(page.parentId || '')?.database,
        );
        omittedDependencies += (page.blockedBy?.length || 0) - (blockedBy?.length || 0);
        const values = { ...page.values };
        for (const column of byId.get(page.parentId || '')?.database?.columns || [])
          if (column.system && Array.isArray(values[column.id]))
            values[column.id] = (values[column.id] as string[]).filter(
              (id) => byId.get(id)?.parentId === page.parentId,
            );
        return {
          ...page,
          values,
          ...(page.subItemOf && byId.get(page.subItemOf)?.parentId !== page.parentId
            ? { subItemOf: null }
            : {}),
          ...(page.blockedBy ? { blockedBy } : {}),
        };
      });
      const sourceWorkspace = { ...workspace, pages: imported };
      validateWorkspace(sourceWorkspace);
      const duplicate = duplicatePage(sourceWorkspace, root.id, undefined, {
        comments: true,
        syncedSources: true,
      });
      pages = duplicate.workspace.pages
        .slice(sourceWorkspace.pages.length)
        .map((page) => ({ ...page, title: page.id === duplicate.id ? root.title : page.title }));
      primaryPageId = data.databaseContext ? pages[1]?.id : duplicate.id;
    } else {
      if (!['md', 'markdown', 'txt', 'html', 'htm'].includes(type))
        throw new CommandError('UNSUPPORTED_FORMAT', `不支持 ${type} 导入`);
      const blocks =
        type === 'txt'
          ? content.split(/\r?\n/).map((text) => ({ type: 'paragraph', content: text }))
          : await (await converter()).parseDocument(content, type);
      pages = [makePage({ title: path.basename(source, path.extname(source)), blocks })];
    }
    if (params.pageId) {
      const page = requirePage(workspace, params.pageId);
      if (page.locked) throw new CommandError('PAGE_LOCKED', '页面已锁定');
      if (pages.length !== 1 || pages[0].database)
        throw new CommandError('INVALID_IMPORT', '数据库不能追加到正文；请导入为新页面');
      const updated = {
        ...page,
        blocks: [...page.blocks, ...normalizeBlocks(pages[0].blocks, true)],
        updatedAt: Date.now(),
      };
      return {
        result: { pages: [updated.id] },
        workspace: {
          ...workspace,
          pages: workspace.pages.map((value) => (value.id === page.id ? updated : value)),
        },
      };
    }
    if (params.parentId && params.parentId !== 'root') {
      requirePage(workspace, params.parentId);
      pages[0].parentId = params.parentId;
    }
    return {
      result: {
        pages: primaryPageId
          ? [primaryPageId, ...pages.filter((page) => page.id !== primaryPageId).map((page) => page.id)]
          : pages.map((page) => page.id),
        omittedDependencies,
      },
      workspace: normalizeWorkspace({ ...workspace, pages: [...workspace.pages, ...pages] }),
    };
  }
  if (method === 'file.export' || method === 'file.write') {
    const page = method === 'file.export' ? requirePage(workspace, params.pageId) : undefined;
    const type = params.type || (params.output ? path.extname(params.output).slice(1) : 'md');
    if (!['md', 'html', 'json', 'csv', 'pdf'].includes(type))
      throw new CommandError('UNSUPPORTED_FORMAT', `不支持 ${type} 导出`);
    const output = filePath(params.output || `${safeName(page?.title || '笔记')}.${type}`);
    if (page && type === 'pdf') {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await pdf(
        {
          workspace: {
            ...workspace,
            activePageId: page.id,
            settings: { ...workspace.settings, theme: 'light' },
          },
          dataDirectory: service.storage.directory,
        },
        output,
      );
      return { result: { path: output, type, bytes: fs.statSync(output).size } };
    }
    let content = params.content as string;
    if (page) {
      if (type === 'json') {
        const ids = descendants(workspace.pages, page.id);
        const sources = new Set(
          workspace.pages
            .filter((page) => ids.has(page.id))
            .flatMap((page) => [...sourceClosure(workspace.pages, page.blocks)]),
        );
        content = JSON.stringify(
          {
            format: 'mini-notion-page',
            version: 1,
            page,
            ...(workspace.pages.find((parent) => parent.id === page.parentId)?.database
              ? {
                  databaseContext: {
                    id: page.parentId,
                    definition: workspace.pages.find((parent) => parent.id === page.parentId)!.database,
                  },
                }
              : {}),
            children: workspace.pages.filter((value) => value.id !== page.id && ids.has(value.id)),
            syncedSources: workspace.pages.filter((value) => sources.has(value.id) && !ids.has(value.id)),
          },
          null,
          2,
        );
      } else if (type === 'csv') {
        if (!page.database) throw new CommandError('NOT_A_DATABASE', 'CSV 导出需要数据库页面');
        content = databaseCSV(page, workspace);
      } else {
        const columns = workspace.pages.find((owner) => owner.id === page.parentId)?.database?.columns || [];
        const properties = columns.map((column) => ({
          type: 'paragraph',
          content: [
            { type: 'text', text: column.name + ': ', styles: { bold: true } },
            ...(column.type === 'files'
              ? ((page.values[column.id] || []) as FileValue[]).flatMap((file, index) => [
                  ...(index ? [{ type: 'text', text: ', ', styles: {} }] : []),
                  { type: 'link', href: file.url, content: [{ type: 'text', text: file.name, styles: {} }] },
                ])
              : [{ type: 'text', text: String(readProperty(page, column, workspace.pages)), styles: {} }]),
          ],
        }));
        content = await (
          await converter()
        ).serializeDocument(
          [...properties, ...portableBlocks(page.blocks, workspace)],
          type === 'md' ? 'md' : 'html',
        );
        if (type === 'md') content = `# ${page.title || '无标题'}\n\n${content}`;
        else
          content = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file: data:; media-src file:; style-src 'unsafe-inline'"><title>${escapeHTML(page.title || '无标题')}</title><style>body{max-width:900px;margin:48px auto;font:16px/1.7 -apple-system,sans-serif;color:#37352f;padding:0 24px}img,video{max-width:100%}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}blockquote{border-left:3px solid #aaa;padding-left:16px}pre{background:#f5f5f5;padding:16px;white-space:pre-wrap}[data-content-type=columnList]{display:flex;gap:24px}[data-content-type=column]{flex:1;min-width:0}@media print{body{margin:0;max-width:none}h1,h2,h3{break-after:avoid}}</style><body><h1>${escapeHTML(page.title || '无标题')}</h1>${content}</body></html>`;
      }
    }
    if (typeof content !== 'string') throw new CommandError('INVALID_ARGUMENT', '缺少导出内容');
    if (type === 'pdf') {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-notion-assets-'));
      try {
        content = copyExportAssets(service, content, path.join(directory, 'page.html'), true);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        await pdf(content, output);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    } else write(output, copyExportAssets(service, content, output));
    return { result: { path: output, type, bytes: fs.statSync(output).size } };
  }
  if (method === 'backup.export') return { result: await backup(service, filePath(params.path)) };
  if (method === 'backup.restore') {
    if (!params.confirm) throw new CommandError('CONFIRMATION_REQUIRED', '恢复备份需要 confirm=true');
    const source = filePath(params.path);
    const data = fs.readFileSync(source);
    const zip = source.endsWith('.json') ? null : await JSZip.loadAsync(data);
    const next = normalizeWorkspace(
      validateWorkspace(
        JSON.parse(zip ? await zip.file('workspace.json')!.async('string') : data.toString('utf8')),
      ),
      true,
    );
    validateDomain(next);
    const changes = zip?.file('changes.json')
      ? JSON.parse(await zip.file('changes.json')!.async('string'))
      : [];
    const before = path.join(service.storage.directory, 'backups', `before-restore-${Date.now()}.mininotion`);
    await backup(service, before);
    if (zip)
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || name.includes('..')) continue;
        const allowed =
          /^(attachments|history|conflicts|agents)\/[^/]+$/.test(name) ||
          (/^spaces\/[0-9a-zA-Z_-]{1,64}\//.test(name) &&
            !name.split('/').includes('.mininotion-runtime') &&
            !name.includes('\\'));
        if (allowed) write(path.join(service.storage.directory, name), await entry.async('nodebuffer'));
      }
    service.changes.restore(changes);
    return { result: { restored: true, previousBackup: before }, workspace: next };
  }
  return;
}
