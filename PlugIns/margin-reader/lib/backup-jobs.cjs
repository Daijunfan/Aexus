'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');
const S = require('./safety.cjs');
const Source = require('./backup-stream-source.cjs');
const Format = require('./backup-stream-format.cjs');
const Job = require('./backup-job-store.cjs');
const methods = new Set(['library.backup.job.create','library.backup.job.list','library.backup.job.get','library.backup.job.step','library.backup.job.publish','library.backup.job.discard']);
async function create(store,p) {
  return Job.locked(store,p.jobId,async(directory,assertLease)=>{
    if (await S.exists(directory)) {
      const existing=await Job.read(store,p);
      try { S.assert(existing.journal.path===p.path&&Boolean(existing.secret)===Boolean(p.password),'CONFLICT','This job UUID already belongs to a different backup request.');return {...Job.summary(existing),resumed:true}; }
      finally { existing.secret?.fill(0); }
    }
    const jobs=await fs.readdir(await store.meta('backup-jobs'));
    S.assert(jobs.filter(name=>Job.UUID.test(name)).length<32,'TOO_LARGE','Keep at most 32 resumable backup jobs; discard completed checkpoints before starting another.');
    const plan=await Source.plan(store,p);S.assert(plan.sufficientSpace,'DISK_FULL','Not enough free space for this backup.',plan);
    const state=await store.load(),snapshot=Source.snapshot(state),inventory=await Source.inventory(store,plan.path);
    S.assert((await store.load()).revision===state.revision,'CONFLICT','Library metadata changed while preparing the snapshot. Start again.');
    const h={...Format.header(p.password),id:p.jobId,jobSchema:Job.SCHEMA},secret=await Format.key(h,p.password);
    const snapshotHash=S.digest(snapshot);
    const rows=inventory.files.map(row=>({...row,sha256:null,segments:[]}));
    rows.push({path:'.margin-reader/state.json',bytes:snapshot.length,version:snapshotHash.slice(0,24),sha256:snapshotHash,segments:[]});
    const journal={schema:Job.SCHEMA,jobId:p.jobId,path:plan.path,revision:1,sourceRevision:state.revision,phase:'copying',files:rows,directories:inventory.directories,totalBytes:inventory.bytes+snapshot.length,copiedBytes:0,copyIndex:0,verifyIndex:0,verifiedChunks:{}};
    const job={directory,header:h,secret,journal,assertLease};let reserved=false;
    try {
      Job.validate(journal,p.jobId);assertLease();
      await fs.mkdir(directory,{mode:0o700});reserved=true;
      await fs.mkdir(path.join(directory,'package/chunks'),{recursive:true,mode:0o700});
      await S.writeNew(path.join(directory,'job-header.json'),JSON.stringify(h));
      await S.writeNew(path.join(directory,'snapshot.bin'),Format.seal(snapshot,h,secret,'job-snapshot'));
      await Job.save(job);await Job.syncDirectory(directory);
      return {...Job.summary(job),resumed:false};
    } catch(error) { if(reserved)await fs.rm(directory,{recursive:true,force:true});throw error; }
    finally { secret?.fill(0);snapshot.fill(0); }
  });
}
async function list(store,p) {
  const root=await store.meta('backup-jobs');if(!(await S.exists(root)))return {jobs:[],total:0,nextOffset:null};
  const names=(await fs.readdir(root)).filter(name=>Job.UUID.test(name)).sort(),offset=p.offset||0,limit=p.limit||32,jobs=[];
  for(const id of names.slice(offset,offset+limit)){
    try{const {header}=await Job.header(store,id);jobs.push({jobId:id,createdAt:header.createdAt,encrypted:header.encryption!=='none',requiresPassword:header.encryption!=='none'});}
    catch(error){jobs.push({jobId:id,error:{code:error.code||'INVALID_BACKUP_JOB',message:'This checkpoint is unavailable or damaged. Originals and published backups are separate.'}});}
  }
  return {jobs,total:names.length,nextOffset:offset+limit<names.length?offset+limit:null};
}
async function published(store,job) {
  const j=job.journal,destination=await S.safePath(store.workspace,j.path);
  if(!(await S.exists(destination))?.isDirectory())return false;
  const headerPath=await S.safePath(destination,'header.json');
  if(!(await S.exists(headerPath))?.isFile())return false;
  const h=Job.parse(await S.readBounded(headerPath,4096));
  return h.schema===Format.SCHEMA&&h.id===j.jobId&&h.manifestSha256===j.manifestSha256;
}
async function get(store,p) {
  const job=await Job.read(store,p);
  try {
    const result=Job.summary(job);
    if(['publishing','complete'].includes(job.journal.phase)){
      result.outputAvailable=await published(store,job);
      const packageMissing=!(await S.exists(await S.safePath(job.directory,'package')));
      if(result.outputAvailable&&packageMissing){result.phase='complete';result.published=true;result.receiptRecovered=job.journal.phase!=='complete';}
    }
    return result;
  } finally { job.secret?.fill(0); }
}
async function original(store,row) {
  const file=await S.safePath(store.workspace,row.path,{internal:row.path.startsWith('.margin-reader/')});
  const stat=await S.exists(file);
  S.assert(stat?.isFile()&&stat.nlink===1&&S.version(stat)===row.version,'CONFLICT','A not-yet-copied original changed. This snapshot cannot silently switch to the new file.',{path:row.path});
  return file;
}
async function readSegment(file,row,offset,length) {
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    const stat=await handle.stat();S.assert(stat.isFile()&&stat.nlink===1&&S.version(stat)===row.version,'CONFLICT','Original file changed before this chunk.');
    const data=Buffer.allocUnsafe(length);let read=0;
    while(read<length){const result=await handle.read(data,read,length-read,offset+read);S.assert(result.bytesRead>0,'CONFLICT','Original was truncated while copying.');read+=result.bytesRead;}
    S.assert(S.version(await handle.stat())===row.version,'CONFLICT','Original file changed during this chunk.');return data;
  } finally { await handle.close(); }
}
async function writeChunk(job,bytes,committed) {
  const hash=S.digest(bytes),encoded=Format.seal(bytes,job.header,job.secret,hash),relative='package/chunks/'+Format.chunkName(job.header,job.secret,hash);
  const target=await S.safePath(job.directory,relative),stat=await S.exists(target);
  if(stat){
    const old=await S.readBounded(target,Format.CHUNK_BYTES+28);
    let valid=false;
    try{const plain=Format.unseal(old,job.header,job.secret,hash);valid=plain.length===bytes.length&&S.digest(plain)===hash;}catch(error){if(error.code!=='CHECKSUM_MISMATCH')throw error;}
    if(!valid){
      S.assert(!committed.has(hash),'CHECKSUM_MISMATCH','A previously committed backup chunk was damaged. Discard this job or restore the intact checkpoint.');
      // A crash before checkpoint commit may leave an incomplete orphan chunk.
      // It is not a referenced user document and may be replaced deterministically.
      await S.atomicWrite(target,encoded);
    }
  }else await S.writeNew(target,encoded);
  return {sha256:hash,bytes:bytes.length};
}
async function frozenSnapshot(job) {
  const raw=await S.readBounded(await S.safePath(job.directory,'snapshot.bin'),Source.MAX_METADATA+28);
  const data=Format.unseal(raw,job.header,job.secret,'job-snapshot');
  const stateRow=job.journal.files.at(-1);S.assert(data.length===stateRow.bytes&&S.digest(data)===stateRow.sha256,'CHECKSUM_MISMATCH','Frozen library metadata changed.');
  return data;
}
async function step(store,p) {
  return Job.locked(store,p.jobId,async(_directory,assertLease)=>{
    const job=await Job.read(store,p);job.assertLease=assertLease;let frozen;
    try {
      Job.revision(job,p.expectedRevision);
      const j=job.journal;
      if(['ready','publishing','complete'].includes(j.phase))return Job.summary(job);
      if(j.phase==='copying'){
        const committed=new Set(j.files.flatMap(row=>row.segments.map(segment=>segment.sha256)));
        let budget=p.maxChunks||8,visited=0;
        while(j.copyIndex<j.files.length&&budget>0&&visited++<256){
          assertLease();const row=j.files[j.copyIndex],snapshot=row.path==='.margin-reader/state.json';
          const file=snapshot?null:await original(store,row);
          if(!row.sha256)row.sha256=await Source.hashFile(file,row);
          if(snapshot)frozen??=await frozenSnapshot(job);
          const offset=row.segments.length*Format.CHUNK_BYTES;
          if(offset<row.bytes){
            const wanted=Math.min(Format.CHUNK_BYTES,row.bytes-offset);
            const bytes=snapshot?frozen.subarray(offset,offset+wanted):await readSegment(file,row,offset,wanted);
            row.segments.push(await writeChunk(job,bytes,committed));j.copiedBytes+=wanted;budget--;
          }
          if(row.segments.length===Math.ceil(row.bytes/Format.CHUNK_BYTES))j.copyIndex++;
        }
        if(j.copyIndex===j.files.length)j.phase='verifying';
      }else{
        // Verification resumes at whole-file boundaries. Native SHA-256 avoids
        // trusting serialized cryptographic state or introducing custom crypto.
        const limit=Math.min(j.files.length,j.verifyIndex+(p.maxFiles||1));
        const backup={directory:await S.safePath(job.directory,'package'),header:job.header,secret:job.secret};
        for(;j.verifyIndex<limit;j.verifyIndex++){
          assertLease();const row=j.files[j.verifyIndex],before=new Map();
          for(const segment of row.segments){const file=await S.safePath(backup.directory,'chunks/'+Format.chunkName(job.header,job.secret,segment.sha256));const stat=await S.exists(file);S.assert(stat?.isFile(),'CHECKSUM_MISMATCH','A backup chunk is missing.');before.set(segment.sha256,{file,version:S.version(stat)});}
          for await(const _bytes of Format.rowChunks(backup,row)){assertLease();}
          for(const [hash,receipt] of before){const stat=await S.exists(receipt.file);S.assert(stat&&S.version(stat)===receipt.version,'CHECKSUM_MISMATCH','A chunk changed during verification.');j.verifiedChunks[hash]=receipt.version;}
        }
        if(j.verifyIndex===j.files.length)j.phase='ready';
      }
      j.revision++;await Job.save(job);return Job.summary(job);
    } finally { frozen?.fill(0);job.secret?.fill(0); }
  });
}
function manifest(job) {
  const j=job.journal;
  return {schema:Format.SCHEMA,revision:j.sourceRevision,createdAt:job.header.createdAt,directories:j.directories,originalBytes:j.totalBytes,
    files:j.files.map(({path,bytes,sha256,segments})=>({path,bytes,sha256,segments}))};
}
async function publish(store,p) {
  return Job.locked(store,p.jobId,async(_directory,assertLease)=>{
    const job=await Job.read(store,p);job.assertLease=assertLease;
    try {
      const j=job.journal,staging=await S.safePath(job.directory,'package');
      if(['publishing','complete'].includes(j.phase)&&!(await S.exists(staging))&&await published(store,job)){
        j.phase='complete';j.revision++;await Job.save(job);return {...Job.summary(job),alreadyPublished:true};
      }
      Job.revision(job,p.expectedRevision);S.assert(['ready','publishing'].includes(j.phase),'INVALID_STATE','Complete copying and verification before publishing.');
      for(const [hash,version] of Object.entries(j.verifiedChunks)){
        const file=await S.safePath(staging,'chunks/'+Format.chunkName(job.header,job.secret,hash)),stat=await S.exists(file);
        S.assert(stat?.isFile()&&S.version(stat)===version,'CHECKSUM_MISMATCH','A verified chunk changed before publication. No backup was published.');
      }
      const m=manifest(job);Format.validateManifest(require('./study-package.cjs').cleanTree(m));
      const metadata=Buffer.from(JSON.stringify(m));S.assert(metadata.length<=Source.MAX_METADATA,'TOO_LARGE','Backup manifest exceeds 64 MiB.');
      const bytes=Format.seal(metadata,job.header,job.secret,'manifest');
      const h={...job.header,manifestSha256:S.digest(bytes)};delete h.jobSchema;
      await S.atomicWrite(await S.safePath(staging,'manifest.bin'),bytes);
      await S.atomicWrite(await S.safePath(staging,'header.json'),JSON.stringify(h));
      await Job.syncDirectory(await S.safePath(staging,'chunks'));await Job.syncDirectory(staging);
      j.phase='publishing';j.manifestSha256=h.manifestSha256;j.revision++;await Job.save(job);
      await require('./files.cjs').parentExists(store.workspace,j.path);
      const destination=await S.safePath(store.workspace,j.path);let reservation;
      try{await fs.mkdir(destination,{mode:0o700});reservation=await fs.lstat(destination);}catch(error){if(error.code==='EEXIST')S.fail('ALREADY_EXISTS','Backup destination already exists; no directory was replaced.');throw error;}
      let renamed=false;
      try{assertLease();await fs.rename(staging,destination);renamed=true;await Job.syncDirectory(path.dirname(destination));}
      catch(error){
        if(renamed){error.publicationMayHaveCompleted=true;error.message+=' The output directory was moved before synchronization failed. Read this backup job UUID to determine publication status.';}
        // Remove only the empty directory reserved by this request, never an
        // unrelated replacement or a successfully published package.
        const current=await S.exists(destination);
        if(current?.dev===reservation.dev&&current?.ino===reservation.ino&&(await fs.readdir(destination)).length===0)await fs.rmdir(destination);
        throw error;
      }
      j.phase='complete';j.revision++;
      try{await Job.save(job);}catch(error){error.publicationMayHaveCompleted=true;error.message+=' The complete package may already be published; call library.backup.job.get with the same UUID before retrying.';throw error;}
      return {...Job.summary(job),alreadyPublished:false};
    } finally { job.secret?.fill(0); }
  });
}
async function discard(store,p) {
  return Job.locked(store,p.jobId,async(directory,assertLease)=>{
    const existing=await S.exists(directory);assertLease();
    if(existing)await fs.rm(directory,{recursive:true,force:true});
    return {jobId:p.jobId,discarded:true,alreadyAbsent:!existing,originalsPreserved:true,publishedBackupsPreserved:true};
  });
}
async function request(store,method,p) {
  const action=method.slice('library.backup.job.'.length);
  try{
    if(action==='create')return await create(store,p);
    if(action==='list')return await list(store,p);
    if(action==='get')return await get(store,p);
    if(action==='step')return await step(store,p);
    if(action==='publish')return await publish(store,p);
    if(action==='discard')return await discard(store,p);
    S.fail('METHOD_NOT_FOUND','Unsupported resumable backup operation.');
  }catch(error){throw Job.explain(error);}
}
module.exports={methods,request,manifest,readSegment,writeChunk};
