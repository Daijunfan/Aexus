import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function defaultDataDirectory() {
  return (
    process.env.MINI_NOTION_DATA_DIR ||
    path.join(os.homedir(), 'Library', 'Application Support', 'Mini Notion')
  );
}
export function canonicalDirectory(directory: string) {
  fs.mkdirSync(path.resolve(directory), { recursive: true, mode: 0o700 });
  return fs.realpathSync(path.resolve(directory));
}
export function socketPath(directory: string) {
  const uid = process.getuid?.() || 0;
  const root = path.join('/tmp', `mini-notion-${uid}`);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid)
    throw new Error('本地 API 套接字目录不属于当前用户');
  fs.chmodSync(root, 0o700);
  return path.join(root, createHash('sha256').update(directory).digest('hex').slice(0, 24) + '.sock');
}

export function folderDataDirectory(root: string) {
  root=fs.realpathSync(path.resolve(root));
  if(!fs.statSync(root).isDirectory()) throw new Error('Workspace 必须是文件夹');
  const directory=path.join(root,'.mininotion');
  if(fs.existsSync(directory)&&fs.lstatSync(directory).isSymbolicLink()) throw new Error('.mininotion 不能是软链接');
  fs.mkdirSync(directory,{recursive:true});return directory;
}
