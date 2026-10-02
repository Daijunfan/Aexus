import fs from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';
import { CommandError } from '../core/errors';
export type DirectoryMove = { from: string; to: string };
const owned = new Set<string>();
const inside = (parent: string, child: string) => child === parent || child.startsWith(parent + path.sep);
export function movedPath(file: string, moves: DirectoryMove[]) {
  const owner = [...moves].sort((a,b)=>b.from.length-a.from.length).find(move=>inside(move.from,file));
  return owner ? path.join(owner.to,path.relative(owner.from,file)) : file;
}
/** Parent and child services cannot observe an intermediate directory move. */
export function assertTreeAvailable(directory: string) {
  for(let at=path.resolve(directory);;at=path.dirname(at)) {
    const lock=path.join(at,'.mininotion-tree-lock');
    if(!owned.has(at) && fs.existsSync(lock) && lockfile.checkSync(at,{lockfilePath:lock,realpath:false,stale:60000}))
      throw new CommandError('FILE_BUSY','页面目录正在移动，请同步后重试');
    if(at===path.dirname(at))break;
  }
}
/** Moves include raw files and attachments. Content and paths both roll back on
 * a failed save. Staging stays on the same volume; power-loss atomicity is not implied. */
export function withDirectoryMoves<T>(root: string, moves: DirectoryMove[], operation: ()=>T): T {
  if(!moves.length)return operation();
  assertTreeAvailable(root);
  let release: ()=>void;
  try {release=lockfile.lockSync(root,{lockfilePath:path.join(root,'.mininotion-tree-lock'),stale:60000})}
  catch {throw new CommandError('FILE_BUSY','页面目录正在移动，请稍后重试')}
  owned.add(root);
  let stage='';const staged: {from:string;to:string;temp:string;placed:boolean}[]=[];
  try {
    for(const move of moves){
      if(move.from===root || !inside(root,move.from) || !inside(root,move.to) || inside(move.from,move.to))throw new CommandError('INVALID_MOVE','不能将页面文件夹移动到自身或其子文件夹');
      if(!fs.statSync(move.from).isDirectory())throw new CommandError('FILE_CONFLICT','来源文件夹已不存在');
      if(fs.existsSync(move.to) && !moves.some(other=>inside(other.from,move.to)))throw new CommandError('FILE_CONFLICT','目标文件夹已经存在');
    }
    stage=fs.mkdtempSync(path.join(root,'.mininotion-moving-'));
    for(const [i,move] of [...moves].sort((a,b)=>b.from.length-a.from.length).entries()){
      const temp=path.join(stage,String(i));fs.renameSync(move.from,temp);staged.push({...move,temp,placed:false});
    }
    for(const item of [...staged].sort((a,b)=>a.to.length-b.to.length)){
      fs.mkdirSync(path.dirname(item.to),{recursive:true});
      if(fs.existsSync(item.to))throw new CommandError('FILE_CONFLICT','目标文件夹已被其他操作创建');
      fs.renameSync(item.temp,item.to);item.placed=true;
    }
    return operation();
  } catch(error) {
    try {
      for(const item of [...staged].sort((a,b)=>b.to.length-a.to.length))if(item.placed){fs.renameSync(item.to,item.temp);item.placed=false;}
      for(const item of [...staged].sort((a,b)=>a.from.length-b.from.length))if(fs.existsSync(item.temp)){fs.mkdirSync(path.dirname(item.from),{recursive:true});fs.renameSync(item.temp,item.from);}
    } catch(recovery) {throw new CommandError('FILE_RECOVERY_REQUIRED',`目录回滚失败，请保留 ${stage}：${String(error)}；${String(recovery)}`)}
    throw error;
  } finally {
    owned.delete(root);release();
    if(stage && fs.existsSync(stage) && !fs.readdirSync(stage).length)fs.rmdirSync(stage);
  }
}
