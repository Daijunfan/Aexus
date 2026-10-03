import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {directoryName,needsDirectoryName} from '../shared/directory-names'

export type DirectoryRename={from:string;to:string;inode:number;device:number}
export type DirectoryPlan={roots:string[];renames:DirectoryRename[]}
export {needsDirectoryName} from '../shared/directory-names'
export async function planDirectoryNames(input:string[]):Promise<DirectoryPlan>{
 const roots:string[]=[]
 for(const value of input){try{const root=await fs.realpath(value);if(!roots.includes(root))roots.push(root)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
 const sources=roots.filter(root=>!roots.some(parent=>parent!==root&&root.startsWith(parent+path.sep))),directories:string[]=[]
 const walk=async(folder:string)=>{directories.push(folder);for(const entry of await fs.readdir(folder,{withFileTypes:true}))if(entry.isDirectory()&&entry.name!=='.agents-company'&&!entry.name.startsWith('.agents-transfer-'))await walk(path.join(folder,entry.name))}
 for(const root of sources)await walk(root)
 const siblings=new Map<string,Set<string>>(),renames:DirectoryRename[]=[]
 for(const from of directories.sort((a,b)=>b.length-a.length)){
  const name=path.basename(from);if(!needsDirectoryName(name,from))continue
  const parent=path.dirname(from);let used=siblings.get(parent)
  if(!used){used=new Set((await fs.readdir(parent)).map(name=>process.platform==='linux'?name:name.toLowerCase()));siblings.set(parent,used)}
  const base=directoryName(name),fold=(name:string)=>process.platform==='linux'?name:name.toLowerCase();let next=base,index=0
  while(used.has(fold(next)))next=base+'-'+createHash('sha256').update(from).digest('hex').slice(0,8)+(index++?'-'+index:'')
  used.add(fold(next));const stat=await fs.lstat(from);renames.push({from,to:path.join(parent,next),inode:stat.ino,device:stat.dev})
 }
 return {roots,renames}
}
/** Rebase stored paths through a deepest-first rename plan, without touching logical identities. */
export function migratedPath(value:string,plan:DirectoryPlan){
 for(const item of plan.renames)if(value===item.from||value.startsWith(item.from+path.sep))value=item.to+value.slice(item.from.length)
 return value
}
export async function rollbackDirectoryNames(plan:DirectoryPlan){
 for(const item of [...plan.renames].reverse()){await fs.unlink(item.from);await fs.rename(item.to,item.from)}
}
export async function applyDirectoryNames(plan:DirectoryPlan){
 const completed:DirectoryRename[]=[]
 try{
  for(const item of plan.renames){
   const stat=await fs.lstat(item.from);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.ino!==item.inode||stat.dev!==item.device)throw Error('Directory changed since migration preview: '+item.from)
   try{await fs.lstat(item.to);throw Error('Migration target already exists: '+item.to)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   await fs.rename(item.from,item.to)
   try{await fs.symlink(path.basename(item.to),item.from,'dir')}catch(error){await fs.rename(item.to,item.from);throw error}
   completed.push(item)
  }
  return {renamed:completed.length,paths:plan.roots.map(from=>({from,to:migratedPath(from,plan)}))}
 }catch(error){
  for(const item of completed.reverse()){await fs.unlink(item.from);await fs.rename(item.to,item.from)}
  throw error
 }
}
