'use strict';
const fs=require('node:fs/promises');
const JSZip=require('jszip'),S=require('./safety.cjs');
const MAX=256*1024*1024;
async function create(store,p){
 const rel=S.relative(p.path);S.assert(rel.toLowerCase().endsWith('.mrbackup'),'INVALID_PARAMS','Use a .mrbackup destination.');
 const target=await S.safePath(store.workspace,rel);await require('./files.cjs').parentExists(store.workspace,rel);
 S.assert(!(await S.exists(target)),'ALREADY_EXISTS','Backup destination already exists.');
 return store.transaction(async(state,rollback)=>{
  const zip=new JSZip(),manifest={schema:'margin-reader.backup/v1',createdAt:new Date().toISOString(),revision:state.revision,files:[],directories:[]};let total=0;
  const add=(rel,bytes)=>{S.assert(manifest.files.length<20000,'TOO_LARGE','Backup exceeds 20000 files.');total+=bytes.length;S.assert(total<=MAX,'TOO_LARGE','Backup data exceed 256 MiB. Export selected studies instead.');const sha256=S.digest(bytes),name='blobs/'+sha256;if(!zip.file(name))zip.file(name,bytes);manifest.files.push({path:require('./backup-reader.cjs').allowed(rel),bytes:bytes.length,sha256});};
  const before=[];
  const walk=async(folder,relative='')=>{
   for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=relative?relative+'/'+entry.name:entry.name;
    const protectedName=S.protectedName(entry.name);
    if(name===rel||/\.mrbackup$/i.test(name)||entry.name==='.DS_Store'||['.agents-company','.git'].includes(protectedName))continue;
    if(protectedName==='.margin-reader'&&relative)continue;
    S.assert(protectedName!=='.margin-reader'||entry.name==='.margin-reader','SCOPE_DENIED','The reader metadata directory must retain its canonical name.');
    if(name==='.margin-reader/uploads'||name.includes('state.json.lock')||name.endsWith('.tmp'))continue;
    if(name.startsWith('.margin-reader/')&&!['state.json','study-assets','study-media','versions','databases','trash','cache'].includes(name.split('/')[1]))continue;
    if(name.startsWith('.margin-reader/cache/')&&!/\.json$/.test(name)||name.startsWith('.margin-reader/cache/preview-'))continue;
    const file=await S.safePath(store.workspace,name,{internal:name==='.margin-reader'||name.startsWith('.margin-reader/')}),st=await fs.lstat(file);
    S.assert(!st.isSymbolicLink()&&(!st.isFile()||st.nlink===1),'SCOPE_DENIED','Backup cannot traverse symbolic or hard links.');
    if(st.isDirectory()){if(!name.startsWith('.margin-reader')){S.assert(manifest.directories.length<20000,'TOO_LARGE','Too many backup folders.');manifest.directories.push(name);}await walk(file,name);}
    else{S.assert(st.isFile(),'INVALID_FILE','Backup cannot read special files.');if(name==='.margin-reader/state.json')continue;const bytes=await S.readBounded(file,MAX);before.push({path:name,version:S.version(st)});add(name,bytes);}
   }
  };
  await walk(store.workspace);const saved=structuredClone(state);saved.uploads={};add('.margin-reader/state.json',Buffer.from(JSON.stringify(saved)));
  for(const item of before){const st=await fs.stat(await S.safePath(store.workspace,item.path,{internal:item.path.startsWith('.margin-reader/')}));S.assert(S.version(st)===item.version,'CONFLICT','A file changed while backing up.');}
  zip.file('manifest.json',JSON.stringify(manifest));
  const bytes=require('./study-package.cjs').protect(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}),p.password);
  S.assert(bytes.length<=MAX,'TOO_LARGE','Compressed backup exceeds 256 MiB.');await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));
  return {path:rel,files:manifest.files.length,originalBytes:total,bytes:bytes.length,encrypted:Boolean(p.password),revision:state.revision};
 });
}
async function segmented(store,p){return (await S.exists(await S.safePath(store.workspace,S.relative(p.path))))?.isDirectory();}
module.exports={
 create:(store,p)=>p.format==='segmented'?require('./backup-stream.cjs').create(store,p):create(store,p),
 plan:(store,p)=>require('./backup-stream.cjs').plan(store,p),
 inspect:async(store,p)=>await segmented(store,p)?require('./backup-stream.cjs').inspect(store,p):require('./backup-reader.cjs').inspect(store,p),
 restore:async(store,p)=>await segmented(store,p)?require('./backup-stream.cjs').restore(store,p):require('./backup-restore.cjs').restore(store,p)
};
