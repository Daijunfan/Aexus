'use strict';
const JSZip=require('jszip'),S=require('./safety.cjs'),M=require('./study-model.cjs');
const MAX=256*1024*1024;
function allowed(rel){
 S.relative(rel,{internal:true});const parts=rel.split('/');
 S.assert(parts.every((p,i)=>!S.isReserved(p)||(i===0&&p==='.margin-reader')),'SCOPE_DENIED','Backup metadata aliases, employee credentials and Git data are forbidden.');
 if(parts.includes('.margin-reader'))S.assert(parts[0]==='.margin-reader'&&(rel==='.margin-reader/state.json'||['study-assets','study-media','versions','databases','trash','cache'].includes(parts[1]))&&!parts.some(p=>p.endsWith('.lock')||p.endsWith('.tmp')),'INVALID_BACKUP','Unsupported backup metadata.');
 return rel;
}
async function read(store,p){
 const bytes=require('./study-package.cjs').unprotect(await S.readBounded(await S.safePath(store.workspace,S.relative(p.path)),MAX),p.password);let zip;
 try{zip=await JSZip.loadAsync(bytes);}catch{S.fail('INVALID_BACKUP','Backup archive is not readable.');}
 const entries=Object.values(zip.files);S.assert(entries.length<=20002,'TOO_LARGE','Too many backup entries.');let total=0;
 for(const entry of entries){
  S.assert(entry.name==='manifest.json'||entry.name==='blobs/'||/^blobs\/[0-9a-f]{64}$/.test(entry.name),'INVALID_BACKUP','Unexpected archive path.');
  S.assert(!entry.unsafeOriginalName||entry.unsafeOriginalName===entry.name,'SCOPE_DENIED','Archive traversal is forbidden.');
  S.assert((Number(entry.unixPermissions||0)&0xf000)!==0xa000,'SCOPE_DENIED','Archive links are forbidden.');
  total+=entry._data?.uncompressedSize||0;S.assert(total<=MAX,'TOO_LARGE','Expanded backup exceeds 256 MiB.');
 }
 const file=zip.file('manifest.json');S.assert(file&&file._data.uncompressedSize<=8*1024*1024,'INVALID_BACKUP','Missing or oversized backup manifest.');let manifest;
 try{manifest=require('./study-package.cjs').cleanTree(JSON.parse(await file.async('string')));}catch(error){if(error.code)throw error;S.fail('INVALID_BACKUP','Manifest is not valid JSON.');}
 S.assert(manifest.schema==='margin-reader.backup/v1'&&Array.isArray(manifest.files)&&manifest.files.length<=20000,'INVALID_BACKUP','Unsupported backup format.');const paths=new Set(),rows=[];let fileBytes=0;
 S.assert(!manifest.directories||Array.isArray(manifest.directories)&&manifest.directories.length<=20000,'INVALID_BACKUP','Invalid folder list.');for(const directory of manifest.directories||[])S.relative(directory);
 for(const row of manifest.files){
  allowed(row.path);S.assert(!paths.has(row.path)&&/^[a-f0-9]{64}$/.test(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0,'INVALID_BACKUP','Invalid or repeated file record.');paths.add(row.path);fileBytes+=row.bytes;S.assert(fileBytes<=MAX,'TOO_LARGE','Restored files exceed 256 MiB.');
  const entry=zip.file('blobs/'+row.sha256);S.assert(entry&&entry._data.uncompressedSize===row.bytes,'INVALID_BACKUP','Missing backup file.');const data=await entry.async('nodebuffer');S.assert(S.digest(data)===row.sha256,'CHECKSUM_MISMATCH','Backup checksum mismatch.');rows.push({...row,data});
 }
 const stateEntry=rows.find(r=>r.path==='.margin-reader/state.json');S.assert(stateEntry,'INVALID_BACKUP','Backup contains no library state.');let state;
 try{state=require('./study-package.cjs').cleanTree(JSON.parse(stateEntry.data));}catch(error){if(error.code)throw error;S.fail('INVALID_BACKUP','Invalid library state.');}
 validateState(state);
 return {manifest,rows,state};
}
async function inspect(store,p){const {manifest,rows,state}=await read(store,p);return {schema:manifest.schema,createdAt:manifest.createdAt,files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),documents:Object.keys(state.documents).length,studies:Object.values(state.studySets).map(M.summary)};}
function validateState(state){
 S.assert(state?.schemaVersion===1&&Number.isSafeInteger(state.revision)&&state.revision>=0&&state.settings&&state.studySets&&state.documents&&state.trash&&state.uploads,'INVALID_BACKUP','Unsupported library state.');
 for(const field of ['settings','studySets','documents','trash','uploads'])S.assert(typeof state[field]==='object'&&!Array.isArray(state[field]),'INVALID_BACKUP','Invalid library metadata container.');
 const appearance=require('./appearance.cjs');appearance.checkPatch(Object.fromEntries(Object.entries(state.settings).filter(([key])=>appearance.KEYS.includes(key))),'INVALID_BACKUP');
 for(const [id,set] of Object.entries(state.studySets)){S.assert(id===set.id,'INVALID_BACKUP','Study identity does not match its key.');require('./study-package.cjs').validateSet(set);}
 for(const [id,doc] of Object.entries(state.documents)){S.assert(M.UUID.test(id)&&doc.id===id,'INVALID_BACKUP','Invalid document identity.');S.relative(doc.path);require('./package-validation.cjs').documentLayout(doc);}
 require('./study-library.cjs').validate(state,'INVALID_BACKUP');
 return state;
}
module.exports={allowed,read,inspect,validateState};
