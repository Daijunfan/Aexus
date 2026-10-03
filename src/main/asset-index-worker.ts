import fs from 'node:fs/promises'
import path from 'node:path'
import {parentPort,workerData} from 'node:worker_threads'
import {DatabaseSync} from 'node:sqlite'
import type {AssetOwner} from '../shared/asset-schema'
import {directoryPath,migrationLink} from './directory-aliases'

type Root={id:string;root:string;remote?:boolean;readOnly?:boolean;key:string;owner:AssetOwner;members?:Record<string,string>}
type Binding={source:Root;prefix:string}
const db=new DatabaseSync(workerData.file)
db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS files(root TEXT,path TEXT,name TEXT,bytes INTEGER,modified REAL,hidden INTEGER,owner TEXT,PRIMARY KEY(root,path));CREATE INDEX IF NOT EXISTS files_name ON files(name);CREATE TABLE IF NOT EXISTS directories(root TEXT,path TEXT,files INTEGER,visibleFiles INTEGER,folders INTEGER,visibleFolders INTEGER,PRIMARY KEY(root,path));`)
let roots:Root[]=[],sources:Root[]=[],bindings=new Map<string,Binding>(),generation=0,indexing=false,errors:string[]=[]
const insert=db.prepare('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?)'),directory=db.prepare('INSERT OR REPLACE INTO directories VALUES(?,?,?,?,?,?)')
const relative=(root:string,file:string)=>path.posix.relative(root.replaceAll('\\','/'),file.replaceAll('\\','/'))
const covers=(a:Root,b:Root)=>a.key===b.key&&(a.root===b.root||b.root.startsWith(a.root.replace(/\/$/,'')+'/'))
const owner=(root:Root,value:string)=>{
 const full=root.root.replace(/\/$/,'')+'/'+value,matched=roots.filter(candidate=>candidate.key===root.key&&(full.startsWith(candidate.root.replace(/\/$/,'')+'/')||full===candidate.root)).sort((a,b)=>b.root.length-a.root.length)[0]??root
 const member=root.members?.[value.split('/')[0]]
 return member?{...matched.owner,employee:member,label:matched.owner.label+' / '+value.split('/')[0]}:matched.owner
}
async function scan(root:Root,token:number){
 const walk=async(value:string,hidden:boolean):Promise<[number,number]>=>{
  if(token!==generation)return [0,0]
  const filename=path.join(root.root,value);let entries
  try{entries=await fs.readdir(filename,{withFileTypes:true})}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')errors.push(root.owner.label+': '+(error as Error).message);directory.run(root.id,value,0,0,0,0);return [0,0]}
  let count=0,visible=0,folders=0,visibleFolders=0
  directory.run(root.id,value,null,null,null,null)
  for(const entry of entries){
   if(token!==generation)return [0,0]
   if(entry.name==='.agents-company'||entry.name.startsWith('.agents-transfer-')||entry.isSymbolicLink())continue
   const child=[value,entry.name].filter(Boolean).join('/'),privateEntry=hidden||entry.name.startsWith('.')
   if(entry.isDirectory()){const [all,shown]=await walk(child,privateEntry);count+=all;visible+=shown;folders+=Number(all>0);visibleFolders+=Number(shown>0)}
   else if(entry.isFile()){try{const stat=await fs.lstat(path.join(root.root,child));insert.run(root.id,child,entry.name,stat.size,stat.mtimeMs,Number(privateEntry),JSON.stringify(owner(root,child)));count++;if(!privateEntry)visible++}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')errors.push(root.owner.label+': '+(error as Error).message)}}
  }
  directory.run(root.id,value,count,visible,folders,visibleFolders);return [count,visible]
 }
 await walk('',false)
}
function stats(id:string,value='',hidden=false){const binding=bindings.get(id);if(!binding)return {};const prefix=[binding.prefix,value==='.'?'':value].filter(Boolean).join('/'),row=db.prepare('SELECT * FROM directories WHERE root=? AND path=?').get(binding.source.id,prefix) as any;return row&&row.files!==null?{fileCount:hidden?row.files:row.visibleFiles,nonemptyFolders:hidden?row.folders:row.visibleFolders}:{}}
parentPort!.on('message',async({id,operation,args})=>{
 try{
  let result:unknown
  if(operation==='configure'){
   roots=args.roots;sources=[];bindings=new Map();errors=[];const token=++generation
   for(const root of [...roots].sort((a,b)=>a.root.length-b.root.length)){let source=sources.find(source=>covers(source,root));if(!source){source=root;sources.push(root)}bindings.set(root.id,{source,prefix:relative(source.root,root.root)})}
   db.exec('DELETE FROM files;DELETE FROM directories');indexing=true;parentPort!.postMessage({id,result:{indexing:true,remoteSources:sources.filter(root=>root.remote).map(root=>root.id)}})
   for(const root of sources)if(!root.remote)await scan(root,token)
   if(token===generation){indexing=false;parentPort!.postMessage({event:'complete',errors})}return
  }else if(operation==='status')result={indexing,errors}
  else if(operation==='stats')result=args.nodes.map((node:any)=>({...node,...stats(node.location.asset,node.location.path,args.hidden)}))
  else if(operation==='children'){
   const root=roots.find(root=>root.id===args.root);if(!root||root.remote)throw Error('Unknown local asset workspace')
   const base=await fs.realpath(root.root),folder=await fs.realpath(path.resolve(base,directoryPath(base,args.path??'.'))),part=path.relative(base,folder)
   if(part==='..'||part.startsWith('..'+path.sep)||path.isAbsolute(part))throw Error('Asset path is outside its workspace')
   const entries=(await fs.readdir(folder,{withFileTypes:true})).filter(entry=>(args.hidden||!entry.name.startsWith('.'))&&(args.hidden||!migrationLink(base,path.relative(base,path.join(folder,entry.name))))&&entry.name!=='.agents-company'&&!entry.name.startsWith('.agents-transfer-')).sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)),selected=entries.slice(args.offset??0,(args.offset??0)+(args.limit??500))
   const page=(await Promise.all(selected.map(async entry=>{const file=path.join(folder,entry.name);try{const stat=await fs.lstat(file);return {name:entry.name,path:path.relative(base,file).split(path.sep).join('/'),directory:entry.isDirectory(),symlink:entry.isSymbolicLink(),bytes:stat.size,modifiedAt:stat.mtimeMs}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}))).filter(Boolean)
   result={entries:page,total:entries.length,nextOffset:(args.offset??0)+selected.length<entries.length?(args.offset??0)+selected.length:null}
  }
  else if(operation==='remote'){
   const binding=bindings.get(args.root);if(!binding)throw Error('Remote workspace changed')
   for(const entry of args.entries)if(!entry.symlink)insert.run(binding.source.id,[binding.prefix,entry.path].filter(Boolean).join('/'),entry.name,entry.bytes,entry.modifiedAt,Number(entry.path.split('/').some((part:string)=>part.startsWith('.'))),JSON.stringify(owner(binding.source,entry.path)))
   for(const row of args.directories??[])directory.run(binding.source.id,row.path,row.files,row.visibleFiles,row.folders,row.visibleFolders)
   result={indexed:args.entries.length}
  }else if(operation==='search'){
   const clauses:string[]=[],values:any[]=[]
   if(!args.hidden)clauses.push('hidden=0')
   if(args.query){clauses.push('(name LIKE ? OR path LIKE ? OR owner LIKE ?)');for(let i=0;i<3;i++)values.push('%'+args.query+'%')}
   if(args.root){const binding=bindings.get(args.root);if(!binding)throw Error('Unknown asset filter');clauses.push('root=?');values.push(binding.source.id);if(binding.prefix){clauses.push('substr(path,1,?)=?');values.push(binding.prefix.length+1,binding.prefix+'/')}}
   const where=clauses.length?' WHERE '+clauses.join(' AND '):'',total=(db.prepare('SELECT COUNT(*) AS count FROM files'+where).get(...values) as any).count
   const entries=(db.prepare('SELECT * FROM files'+where+' ORDER BY name COLLATE NOCASE,root,path LIMIT ? OFFSET ?').all(...values,args.limit??100,args.offset??0) as any[]).map(row=>({id:row.root+'|'+encodeURIComponent(row.path),name:row.name,directory:false,locked:!!sources.find(root=>root.id===row.root)?.readOnly,readOnly:!!sources.find(root=>root.id===row.root)?.readOnly,bytes:row.bytes,modifiedAt:row.modified,owner:JSON.parse(row.owner),location:{asset:row.root,path:row.path}}))
   result={entries,total,offset:args.offset??0,indexing,errors}
  }else throw Error('Unknown asset index operation')
  parentPort!.postMessage({id,result})
 }catch(error){parentPort!.postMessage({id,error:(error as Error).message})}
})
