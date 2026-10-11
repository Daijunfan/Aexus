import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { CommandError } from '../core/errors';
import { assertTreeAvailable } from './folderMoves';

export const fileHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export type FileChange = { file: string; content: string | Buffer | null; expected?: string | null };

// Parent and employee services have different metadata stores, but lock the same
// physical document directories. Do not wait synchronously or overwrite a live writer.
function acquire(directory: string) {
  assertTreeAvailable(directory);
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.mininotion-write-lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lock, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); } finally { fs.closeSync(fd); }
      return () => fs.unlinkSync(lock);
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      let dead = false;
      try {
        const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); } catch (failure: any) { dead = failure.code === 'ESRCH'; }
        }
      } catch { /* An incomplete lock is not proof that its writer has exited. */ }
      if (dead && attempt === 0) { fs.unlinkSync(lock); continue; }
      throw new CommandError('FILE_BUSY', '另一个工作区正在保存此文件夹，请稍后重新读取并重试');
    }
  }
  throw new CommandError('FILE_BUSY', '无法获得文件夹写入锁');
}

function replace(file: string, bytes: string | Buffer) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}

/** Preflight the complete write set; roll back files when persistence fails.
 * This is process-failure rollback, not a claim of crash-atomic multi-file storage.
 * Files remain the source of truth and are re-indexed after an interrupted process.
 */
export function fileTransaction(changes: FileChange[], persist: () => void = () => {}) {
  const unique = new Map<string, FileChange>();
  for (const change of changes) {
    if (unique.has(change.file)) throw new CommandError('FILE_CONFLICT', `重复的写入目标：${change.file}`);
    unique.set(change.file, change);
  }
  const releases: (() => void)[] = [];
  const originals = new Map<string, Buffer | null>();
  const applied: string[] = [];
  try {
    for (const directory of [...new Set(changes.map(change => path.dirname(change.file)))].sort())
      releases.push(acquire(directory));
    for (const change of changes) {
      const exists = fs.existsSync(change.file);
      const bytes = exists ? fs.readFileSync(change.file) : null;
      if (change.expected === null && exists)
        throw new CommandError('FILE_CONFLICT', `目标文件已存在：${change.file}`);
      if (typeof change.expected === 'string' && (!bytes || fileHash(bytes) !== change.expected))
        throw new CommandError('FILE_CONFLICT', `文件已发生外部修改，请同步后重试：${change.file}`);
      originals.set(change.file, bytes);
    }
    for (const change of changes) {
      if (change.content === null) fs.rmSync(change.file, { force: true });
      else replace(change.file, change.content);
      applied.push(change.file);
    }
    persist();
  } catch (error) {
    let rollbackError: unknown;
    for (const file of applied.reverse()) {
      try {
        const bytes = originals.get(file);
        if (bytes === null) fs.rmSync(file, { force: true });
        else if (bytes) replace(file, bytes);
      } catch (failure) { rollbackError = failure; }
    }
    if (rollbackError)
      throw new CommandError('FILE_RECOVERY_REQUIRED', `保存失败且回滚未完成，请备份工作区后检查文件：${String(error)}；${String(rollbackError)}`);
    throw error;
  } finally {
    for (const release of releases.reverse()) release();
  }
}
