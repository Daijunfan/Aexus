'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),S=require('./safety.cjs');
async function restore(store,p){
 const backup=await require('./backup-reader.cjs').read(store,p),rel=S.relative(p.folder),destination=await S.safePath(store.workspace,rel);
 await require('./files.cjs').parentExists(store.workspace,rel);S.assert(!(await S.exists(destination)),'ALREADY_EXISTS','Restore into a new folder; the current library is never replaced.');
 return store.transaction(async(_state,rollback)=>{
  S.assert(!(await S.exists(destination)),'ALREADY_EXISTS','Restore folder was created by another client.');
  await fs.mkdir(destination);rollback(()=>fs.rm(destination,{recursive:true,force:true}));
  const state=backup.state;state.uploads={};const caches=new Map();
  for(const directory of backup.manifest.directories||[])await fs.mkdir(await S.safePath(destination,directory),{recursive:true});
  for(const row of backup.rows){
   if(row.path==='.margin-reader/state.json')continue;
   const file=await S.safePath(destination,row.path,{internal:row.path.startsWith('.margin-reader/')});await fs.mkdir(path.dirname(file),{recursive:true});let bytes=row.data;
   if(row.path.startsWith('.margin-reader/cache/')&&row.path.endsWith('.json')){
    let parsed;try{parsed=require('./study-package.cjs').cleanTree(JSON.parse(bytes));}catch{continue;}
    if(!['pdf','flow'].includes(parsed.kind)||!Array.isArray(parsed.sections)||parsed.sections.length>20000)continue;
    if(parsed.kind==='flow'){
     const normalized=[];for(const [index,section] of parsed.sections.entries())normalized.push(await require('./html.cjs').normalizeSection(String(section.html||''),index,{title:section.title}));parsed.sections=normalized;
    }
    bytes=Buffer.from(JSON.stringify(parsed));caches.set(path.basename(row.path,'.json'),parsed);
   }
   await S.writeNew(file,bytes);
  }
  for(const doc of Object.values(state.documents)){
   if(doc.trashed)continue;const file=await S.safePath(destination,doc.path),st=await S.exists(file);if(!st?.isFile())continue;
   const bytes=await S.readBounded(file,256*1024*1024);if(S.digest(bytes)===doc.hash)doc.sourceVersion=S.version(st);
   if(caches.has(doc.cacheKey))for(const node of doc.toc||[])try{require('./outline.cjs').validateLocator(node.locator,caches.get(doc.cacheKey));}catch{node.unresolved=true;}
  }
  await fs.mkdir(path.join(destination,'.margin-reader'),{recursive:true});
  await S.writeNew(await S.safePath(destination,'.margin-reader/state.json',{internal:true}),JSON.stringify(state));
  return {folder:rel,files:backup.rows.length,documents:Object.keys(state.documents).length,studies:Object.keys(state.studySets).length,workspaceRelative:rel};
 });
}
module.exports={restore};
