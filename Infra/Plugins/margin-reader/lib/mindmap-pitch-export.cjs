'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),S=require('./safety.cjs'),M=require('./study-model.cjs');
async function exportPitch(store,p){
 S.assert(['pdf','pptx'].includes(p.format)&&p.path.toLowerCase().endsWith('.'+p.format),'INVALID_PARAMS','Choose a PDF or PPTX path for the presentation.');
 const target=await S.safePath(store.workspace,p.path);await require('./files.cjs').parentExists(store.workspace,p.path);S.assert(!(await S.exists(target)),'ALREADY_EXISTS','Export destination already exists.');
 const state=await store.load(),raw=M.findSet(state,p.setId);M.revision(raw,p.expectedRevision);const set=await M.describe(store,state,raw);if(p.rootId){const ids=M.subtree(set.cards,p.rootId);M.card(set,p.rootId);set.cards=set.cards.filter(c=>ids.has(c.id));}
 let total=0;const sourceVersions=new Map();
 for(const c of set.cards)if(c.image&&p.includeImages!==false){const bytes=(await require('./study-capture.cjs').cardImage(store,set.id,c.id)).bytes;total+=bytes.length;S.assert(total<=32*1024*1024,'TOO_LARGE','Presentation images exceed 32 MiB; narrow the exported branch.');sourceVersions.set(c.id,S.digest(bytes));c.imageBytes=bytes;}
 const jobs=require('./worker-jobs.cjs').createWorkerJobs(path.join(__dirname,'mindmap-pitch-worker.cjs'),{timeout:120000,memory:512});let result;
 try{result=await jobs.run({set,format:p.format,includeImages:p.includeImages!==false});}finally{await jobs.close();}
 const bytes=Buffer.from(result.bytes);S.assert(bytes.length<=128*1024*1024,'TOO_LARGE','Presentation export exceeds 128 MiB.');
 await store.transaction(async(fresh,rollback)=>{M.revision(M.findSet(fresh,p.setId),p.expectedRevision);for(const [id,hash]of sourceVersions)S.assert(S.digest((await require('./study-capture.cjs').cardImage(store,set.id,id)).bytes)===hash,'CONFLICT','A slide image changed during export.');await S.safePath(store.workspace,p.path);await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));});
 const {bytes:_,...details}=result;return {path:p.path,format:p.format,bytes:bytes.length,topics:set.cards.length,content:'pitch',...details};
}
module.exports={exportPitch};
