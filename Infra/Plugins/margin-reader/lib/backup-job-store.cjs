'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const lockfile = require('proper-lockfile');
const S = require('./safety.cjs');
const Source = require('./backup-stream-source.cjs');
const Format = require('./backup-stream-format.cjs');
const SCHEMA = 'margin-reader.backup-job/v1';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const PHASES = ['copying','verifying','ready','publishing','complete'];
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
async function location(store, id) {
  S.assert(typeof id === 'string' && UUID.test(id), 'INVALID_PARAMS', 'Supply a stable backup job UUID.');
  return store.meta('backup-jobs/' + id);
}
function parse(bytes) {
  try { return require('./study-package.cjs').cleanTree(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { if (error.code) throw error; S.fail('INVALID_BACKUP_JOB', 'Backup checkpoint JSON is malformed.'); }
}
function checkHeader(header, id) {
  S.assert(header && header.jobSchema === SCHEMA && header.schema === Format.SCHEMA && header.id === id && UUID.test(header.id), 'INVALID_BACKUP_JOB', 'Unsupported resumable backup header.');
  S.assert(Number.isFinite(Date.parse(header.createdAt)) && header.chunkBytes === Format.CHUNK_BYTES && ['none','aes-256-gcm'].includes(header.encryption), 'INVALID_BACKUP_JOB', 'Invalid backup checkpoint header.');
  S.assert(header.encryption === 'none' ? header.salt === undefined : typeof header.salt === 'string' && /^[a-f0-9]{32}$/.test(header.salt), 'INVALID_BACKUP_JOB', 'Invalid checkpoint key salt.');
  return header;
}
function validate(journal, id) {
  S.assert(journal && journal.schema === SCHEMA && journal.jobId === id && PHASES.includes(journal.phase), 'INVALID_BACKUP_JOB', 'Unsupported resumable checkpoint.');
  S.relative(journal.path); S.assert(journal.path.toLowerCase().endsWith('.mrbackup'), 'INVALID_BACKUP_JOB', 'Invalid backup destination.');
  S.assert(integer(journal.revision,1,Number.MAX_SAFE_INTEGER) && integer(journal.sourceRevision,0,Number.MAX_SAFE_INTEGER) && Array.isArray(journal.files) && journal.files.length > 0 && journal.files.length <= Source.MAX_FILES, 'INVALID_BACKUP_JOB', 'Invalid checkpoint version or file count.');
  S.assert(Array.isArray(journal.directories) && journal.directories.length <= Source.MAX_FILES, 'INVALID_BACKUP_JOB', 'Invalid checkpoint directories.');
  S.assert(integer(journal.copyIndex,0,journal.files.length) && integer(journal.verifyIndex,0,journal.files.length), 'INVALID_BACKUP_JOB', 'Invalid checkpoint position.');
  S.assert(journal.verifiedChunks && typeof journal.verifiedChunks === 'object' && !Array.isArray(journal.verifiedChunks), 'INVALID_BACKUP_JOB', 'Invalid verified chunk receipts.');
  for(const [hash,version] of Object.entries(journal.verifiedChunks))S.assert(HASH.test(hash)&&typeof version==='string'&&/^[a-f0-9]{24}$/.test(version),'INVALID_BACKUP_JOB','Invalid chunk verification receipt.');
  const names = new Set(); let bytes = 0, copied = 0;
  function reserve(name) {
    const canonical = name.normalize('NFC').toLowerCase();
    S.assert(!names.has(canonical), 'INVALID_BACKUP_JOB', 'Checkpoint paths collide.'); names.add(canonical);
  }
  for (const dir of journal.directories) { S.relative(dir); reserve(dir); }
  for (const [index,row] of journal.files.entries()) {
    S.assert(row && typeof row === 'object' && !Array.isArray(row), 'INVALID_BACKUP_JOB', 'Invalid checkpoint file.');
    require('./backup-reader.cjs').allowed(row.path); reserve(row.path);
    S.assert(integer(row.bytes,0,Source.MAX_BYTES) && typeof row.version === 'string' && /^[a-f0-9]{24}$/.test(row.version), 'INVALID_BACKUP_JOB', 'Invalid original file descriptor.');
    S.assert(row.sha256 === null || typeof row.sha256 === 'string' && HASH.test(row.sha256), 'INVALID_BACKUP_JOB', 'Invalid original file checksum.');
    S.assert(Array.isArray(row.segments) && row.segments.length <= Math.ceil(row.bytes / Format.CHUNK_BYTES), 'INVALID_BACKUP_JOB', 'Invalid checkpoint chunk count.');
    for (const [offset,segment] of row.segments.entries()) {
      S.assert(segment && typeof segment.sha256 === 'string' && HASH.test(segment.sha256) && segment.bytes === Math.min(Format.CHUNK_BYTES,row.bytes-offset*Format.CHUNK_BYTES), 'INVALID_BACKUP_JOB', 'Invalid checkpoint chunk.');
      copied += segment.bytes;
    }
    if (index < journal.copyIndex) S.assert(row.sha256 && row.segments.length === Math.ceil(row.bytes/Format.CHUNK_BYTES), 'INVALID_BACKUP_JOB', 'A completed checkpoint file is incomplete.');
    if (index > journal.copyIndex) S.assert(row.segments.length === 0, 'INVALID_BACKUP_JOB', 'Checkpoint file order is inconsistent.');
    if (row.segments.length) S.assert(row.sha256, 'INVALID_BACKUP_JOB', 'Copied chunks require a prevalidated file checksum.');
    bytes += row.bytes;
  }
  const state = journal.files.at(-1);
  S.assert(state.path === '.margin-reader/state.json' && state.bytes <= Source.MAX_METADATA && HASH.test(state.sha256), 'INVALID_BACKUP_JOB', 'Missing or oversized frozen library state.');
  S.assert(bytes <= Source.MAX_BYTES && journal.totalBytes === bytes && journal.copiedBytes === copied, 'INVALID_BACKUP_JOB', 'Checkpoint byte counts are inconsistent.');
  S.assert(journal.verifyIndex <= journal.copyIndex && (journal.phase === 'copying' || journal.copyIndex === journal.files.length), 'INVALID_BACKUP_JOB', 'Verification started before copying completed.');
  if (['ready','publishing','complete'].includes(journal.phase)) {
    S.assert(journal.verifyIndex === journal.files.length, 'INVALID_BACKUP_JOB', 'Publication requires full verification.');
    for(const row of journal.files)for(const segment of row.segments)S.assert(journal.verifiedChunks[segment.sha256],'INVALID_BACKUP_JOB','A verified chunk receipt is missing.');
  }
  if (['publishing','complete'].includes(journal.phase)) S.assert(HASH.test(journal.manifestSha256), 'INVALID_BACKUP_JOB', 'Publication receipt is incomplete.');
  return journal;
}
async function header(store, id) {
  const directory = await location(store,id);
  S.assert((await S.exists(directory))?.isDirectory(), 'NOT_FOUND', 'Backup job does not exist in this workspace.');
  return { directory, header:checkHeader(parse(await S.readBounded(await S.safePath(directory,'job-header.json'),4096)),id) };
}
async function read(store, params) {
  const job = await header(store,params.jobId), secret = await Format.key(job.header,params.password);
  try {
    const raw = await S.readBounded(await S.safePath(job.directory,'checkpoint.bin'),Source.MAX_METADATA+28);
    const journal = validate(parse(Format.unseal(raw,job.header,secret,'job-checkpoint','PASSWORD_REQUIRED')),params.jobId);
    return { ...job, secret, journal };
  } catch(error) { secret?.fill(0); throw error; }
}
async function save(job) {
  job.assertLease?.(); validate(job.journal,job.header.id);
  const bytes=Buffer.from(JSON.stringify(job.journal));
  S.assert(bytes.length<=Source.MAX_METADATA,'TOO_LARGE','Backup checkpoint metadata exceed 64 MiB.');
  await S.atomicWrite(await S.safePath(job.directory,'checkpoint.bin'),Format.seal(bytes,job.header,job.secret,'job-checkpoint'));
  await syncDirectory(job.directory); job.assertLease?.();
}
function summary(job) {
  const j=job.journal;
  return { jobId:j.jobId,revision:j.revision,path:j.path,phase:j.phase,createdAt:job.header.createdAt,encrypted:Boolean(job.secret),sourceRevision:j.sourceRevision,
    files:j.files.length,filesCopied:j.copyIndex,filesVerified:j.verifyIndex,totalBytes:j.totalBytes,copiedBytes:j.copiedBytes,chunkBytes:Format.CHUNK_BYTES,
    ...(j.phase==='complete'?{published:true}:{}),snapshotMode:'frozen-metadata-and-planned-source-versions' };
}
async function locked(store,id,callback) {
  await store.mkdir('backup-jobs'); const directory=await location(store,id);
  const lockTarget=await store.meta('backup-jobs/'+id+'.lease');
  await S.safePath(path.dirname(lockTarget),path.basename(lockTarget)+'.lock');
  let compromised;
  let release;
  try { release=await lockfile.lock(lockTarget,{realpath:false,stale:120000,update:10000,retries:0,onCompromised:error=>{compromised=error;}}); }
  catch(error) { if(error.code==='ELOCKED')S.fail('BUSY','Another request is advancing this backup. Re-read the job before retrying.');throw error; }
  const assertLease=()=>{if(compromised)S.fail('CONFLICT','Backup job lease was lost; no further checkpoint was committed.');};
  try { return await callback(directory,assertLease); }
  finally { await release(); }
}
function revision(job,expected) { S.assert(integer(expected,1,Number.MAX_SAFE_INTEGER),'INVALID_PARAMS','Supply the latest backup job revision.');S.assert(job.journal.revision===expected,'CONFLICT','Backup job advanced elsewhere. Read its current progress before continuing.',{currentRevision:job.journal.revision}); }
async function syncDirectory(dir) {
  const handle=await fs.open(dir,'r');
  try { await handle.sync(); } catch(error) { if(!['EINVAL','ENOTSUP','EBADF'].includes(error.code))throw error; }
  finally { await handle.close(); }
}
function explain(error) {
  if(['ENOSPC','EDQUOT'].includes(error.code))return new S.ReaderError('DISK_FULL',error.publicationMayHaveCompleted?'Storage filled after publication. The backup may already be complete; read the same backup job UUID before retrying.':'Backup storage is full. The last committed checkpoint remains resumable; original documents were not changed.',{publicationMayHaveCompleted:Boolean(error.publicationMayHaveCompleted)});
  return error;
}
module.exports={SCHEMA,UUID,HASH,location,parse,checkHeader,validate,header,read,save,summary,locked,revision,syncDirectory,explain};
