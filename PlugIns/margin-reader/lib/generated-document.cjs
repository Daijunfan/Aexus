'use strict';
const fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),D=require('./documents.cjs');
async function prepare(store,filename,bytes){
 const rel=S.relative(filename);
 S.assert(rel.toLowerCase().endsWith('.pdf'),'INVALID_PARAMS','Generated documents require a .pdf filename.');
 S.assert(bytes.length<=512*1024*1024,'TOO_LARGE','Generated document exceeds 512 MiB.');
 const parsed=await require('./parse.cjs').parseInWorker(store,{bytes,filename:rel});
 return {rel,bytes,parsed};
}
async function save(store,state,prepared,rollback,extra={}){
 const {rel,bytes,parsed}=prepared,file=await S.safePath(store.workspace,rel);
 await require('./files.cjs').parentExists(store.workspace,rel);
 S.assert(!Object.values(state.documents).some(d=>!d.trashed&&d.path===rel),'ALREADY_EXISTS','Destination is already registered.');
 await S.writeNew(file,bytes);const sourceVersion=S.version(await fs.stat(file));
 rollback(async()=>{const stat=await S.exists(file);if(stat&&S.version(stat)===sourceVersion)await fs.rm(file,{force:true});});
 const id=randomUUID(),hash=S.digest(bytes),cacheKey=id+'-'+hash,cache=await store.meta('cache/'+cacheKey+'.json');
 await S.writeNew(cache,JSON.stringify(parsed));rollback(()=>fs.rm(cache,{force:true}));
 const now=new Date().toISOString();
 const doc={id,path:rel,title:parsed.title,format:parsed.format,kind:parsed.kind,hash,cacheKey,sourceVersion,revision:1,toc:structuredClone(parsed.toc),customOutline:false,bookmarks:[],foldedPages:[],foldRegions:[],position:{page:1},createdAt:now,updatedAt:now,...extra};
 state.documents[id]=doc;return {doc,descriptor:D.descriptor(doc,parsed)};
}
module.exports={prepare,save};
