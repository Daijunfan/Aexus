'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
const S=require('../lib/safety.cjs'),Job=require('../lib/backup-job-store.cjs'),Format=require('../lib/backup-stream-format.cjs');
const {createPlugin}=require('../runtime.cjs');
const prefix='library.backup.job.';
const auth=o=>({jobId:o.jobId,...(o.password?{password:o.password}:{})});
const options=()=>({jobId:randomUUID(),path:'resumable.mrbackup',password:'resumable test passphrase'});
async function ready(api,input){const params=auth(input);let job=await api(prefix+'get',params),iterations=0;while(!['ready','complete'].includes(job.phase)){assert(++iterations<100,'Backup failed to converge');job=await api(prefix+'step',{...params,expectedRevision:job.revision,maxChunks:3,maxFiles:2});}return job;}
async function chunkFiles(workspace,id){const folder=path.join(workspace,'.margin-reader/backup-jobs',id,'package/chunks');return (await fs.readdir(folder)).map(name=>path.join(folder,name));}
test('resumable jobs preserve chunk progress across runtime restart and publish the frozen library snapshot',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'large.bin'),randomBytes(10*1024*1024+31));await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());
 const doc=await f.api('document.open',{path:'book.pdf',activate:false});let set=await f.api('study.create',{title:'Frozen snapshot'});set=await f.api('study.note.create',{setId:set.id,expectedRevision:set.revision,title:'Original card',text:'Before prepare'});
 const o=options();let job=await f.api(prefix+'create',o);assert.equal(job.phase,'copying');assert.equal(job.copiedBytes,0);
 job=await f.api(prefix+'step',{...auth(o),expectedRevision:job.revision,maxChunks:1});assert(job.copiedBytes>0);const progress=job.copiedBytes;
 await f.runtime.close();const runtime=await createPlugin({workspace:f.workspace});t.after(()=>runtime.close());
 const api=async(method,params={})=>{const reply=await runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});assert(!reply.error,JSON.stringify(reply.error));return reply.result;};
 assert.equal((await api(prefix+'get',auth(o))).copiedBytes,progress);
 set=await api('study.get',{setId:set.id});await api('study.card.update',{setId:set.id,expectedRevision:set.revision,cardId:set.cards[0].id,text:'Later live edit'});await fs.writeFile(path.join(f.workspace,'later.md'),'not in prepared snapshot');
 job=await ready(api,o);assert.equal(job.phase,'ready');assert.equal(await S.exists(path.join(f.workspace,o.path)),null);
 const done=await api(prefix+'publish',{...auth(o),expectedRevision:job.revision});assert.equal(done.phase,'complete');assert(done.published);
 const duplicate=await api(prefix+'publish',{...auth(o),expectedRevision:job.revision});assert(duplicate.alreadyPublished);
 const inspected=await api('library.backup.inspect',{path:o.path,password:o.password});assert.equal(inspected.studies.length,1);
 await api('library.backup.restore',{path:o.path,password:o.password,folder:'Restored'});
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'Restored/large.bin')),await fs.readFile(path.join(f.workspace,'large.bin')));
 assert.equal(await S.exists(path.join(f.workspace,'Restored/later.md')),null);
 const restored=JSON.parse(await fs.readFile(path.join(f.workspace,'Restored/.margin-reader/state.json')));assert.equal(restored.studySets[set.id].cards[0].text,'Before prepare');assert(restored.documents[doc.id]);
 await api(prefix+'discard',{jobId:o.jobId});assert((await S.exists(path.join(f.workspace,o.path)))?.isDirectory());assert.equal((await api(prefix+'list')).total,0);
});
test('job preparation is idempotent by UUID, encrypted checkpoints disclose no source names, and reads do not mutate progress',async t=>{
 const f=await setup(t),o=options();await f.api('fs.write',{path:'PRIVATE_SOURCE_NAME.md',content:'# PRIVATE_CONTENT'});
 const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));const first=await f.api(prefix+'create',o),second=await f.api(prefix+'create',o);assert(second.resumed);assert.equal(second.revision,first.revision);
 const dir=path.join(f.workspace,'.margin-reader/backup-jobs',o.jobId),raw=await fs.readFile(path.join(dir,'checkpoint.bin'));
 for(const term of ['PRIVATE_SOURCE_NAME','PRIVATE_CONTENT',o.password,'resumable.mrbackup'])assert(!raw.includes(Buffer.from(term)));
 const list=await f.api(prefix+'list');assert.equal(list.total,1);assert(!JSON.stringify(list).includes('PRIVATE_SOURCE_NAME'));assert(!JSON.stringify(list).includes('resumable.mrbackup'));
 await f.error(prefix+'get',{jobId:o.jobId},'PASSWORD_REQUIRED');await f.error(prefix+'get',{...auth(o),password:'wrong test password'},'PASSWORD_REQUIRED');
 await f.error(prefix+'create',{...o,path:'different.mrbackup'},'CONFLICT');
 assert.deepEqual(await fs.readFile(path.join(dir,'checkpoint.bin')),raw);assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);
});
test('stale revisions and concurrent steps cannot advance the same checkpoint twice',async t=>{
 const f=await setup(t),o=options();await fs.writeFile(path.join(f.workspace,'source.bin'),randomBytes(9*1024*1024));
 const job=await f.api(prefix+'create',o),params={jobId:o.jobId,password:o.password,expectedRevision:job.revision,maxChunks:1};
 const replies=await Promise.all([f.raw(prefix+'step',params),f.raw(prefix+'step',params)]);
 assert.equal(replies.filter(r=>r.result).length,1);assert(['BUSY','CONFLICT'].includes(replies.find(r=>r.error).error.data.code));
 const current=await f.api(prefix+'get',{jobId:o.jobId,password:o.password});assert.equal(current.copiedBytes,Format.CHUNK_BYTES);
 await f.error(prefix+'step',params,'CONFLICT');assert.equal((await f.api(prefix+'get',{jobId:o.jobId,password:o.password})).copiedBytes,current.copiedBytes);
});
test('changing an incomplete original refuses resume without deleting committed chunks or publishing mixed content',async t=>{
 const f=await setup(t),o=options(),file=path.join(f.workspace,'source.bin');await fs.writeFile(file,randomBytes(9*1024*1024));let job=await f.api(prefix+'create',o);
 job=await f.api(prefix+'step',{jobId:o.jobId,password:o.password,expectedRevision:job.revision,maxChunks:1});const files=await chunkFiles(f.workspace,o.jobId);assert(files.length);
 const handle=await fs.open(file,'r+');await handle.write(Buffer.from('changed'),0,7,8*1024*1024);await handle.close();
 await f.error(prefix+'step',{jobId:o.jobId,password:o.password,expectedRevision:job.revision,maxChunks:1},'CONFLICT');
 assert.equal((await f.api(prefix+'get',{jobId:o.jobId,password:o.password})).copiedBytes,job.copiedBytes);assert.equal(await S.exists(path.join(f.workspace,o.path)),null);assert((await fs.stat(files[0])).size>0);
});
test('disk-full before checkpoint commit keeps the prior revision and incomplete orphan chunks can be rebuilt',async t=>{
 const f=await setup(t),o=options();await fs.writeFile(path.join(f.workspace,'source.bin'),randomBytes(5*1024*1024));const job=await f.api(prefix+'create',o);
 const original=S.atomicWrite;t.mock.method(S,'atomicWrite',async(file,bytes)=>{if(file.endsWith('checkpoint.bin'))throw Object.assign(Error('injected full checkpoint disk'),{code:'ENOSPC'});return original(file,bytes);});
 await f.error(prefix+'step',{jobId:o.jobId,password:o.password,expectedRevision:job.revision,maxChunks:1},'DISK_FULL');t.mock.restoreAll();
 const progress=await f.api(prefix+'get',{jobId:o.jobId,password:o.password});assert.equal(progress.revision,job.revision);assert.equal(progress.copiedBytes,0);
 const files=await chunkFiles(f.workspace,o.jobId);assert.equal(files.length,1);await fs.truncate(files[0],4);
 const next=await f.api(prefix+'step',{jobId:o.jobId,password:o.password,expectedRevision:job.revision,maxChunks:1});assert.equal(next.copiedBytes,Format.CHUNK_BYTES);
 const done=await ready(f.api,{jobId:o.jobId,password:o.password});await f.api(prefix+'publish',{jobId:o.jobId,password:o.password,expectedRevision:done.revision});
 await f.api('library.backup.inspect',{path:o.path,password:o.password});
});
test('corrupted committed chunks fail verification and changed verified chunks fail publication',async t=>{
 const f=await setup(t),o={jobId:randomUUID(),path:'plain.mrbackup'};await fs.writeFile(path.join(f.workspace,'source.bin'),randomBytes(1024));
 let job=await f.api(prefix+'create',o);job=await f.api(prefix+'step',{jobId:o.jobId,expectedRevision:job.revision,maxChunks:8});assert.equal(job.phase,'verifying');
 const files=await chunkFiles(f.workspace,o.jobId);await fs.writeFile(files[0],Buffer.from('corrupt'));
 await f.error(prefix+'step',{jobId:o.jobId,expectedRevision:job.revision,maxFiles:4},'CHECKSUM_MISMATCH');assert.equal(await S.exists(path.join(f.workspace,o.path)),null);
 await f.api(prefix+'discard',{jobId:o.jobId});const p={jobId:randomUUID(),path:'valid.mrbackup'};await f.api(prefix+'create',p);const done=await ready(f.api,{jobId:p.jobId});
 const verified=await chunkFiles(f.workspace,p.jobId);await fs.appendFile(verified[0],'bad');await f.error(prefix+'publish',{jobId:p.jobId,expectedRevision:done.revision},'CHECKSUM_MISMATCH');assert.equal(await S.exists(path.join(f.workspace,p.path)),null);
});
test('publication refuses an existing empty folder without removing it or its private resumable package',async t=>{
 const f=await setup(t),o={jobId:randomUUID(),path:'occupied.mrbackup'};await f.api('fs.write',{path:'note.md',content:'Original'});await f.api(prefix+'create',o);const job=await ready(f.api,{jobId:o.jobId});
 await fs.mkdir(path.join(f.workspace,o.path));await f.error(prefix+'publish',{jobId:o.jobId,expectedRevision:job.revision},'ALREADY_EXISTS');
 assert.deepEqual(await fs.readdir(path.join(f.workspace,o.path)),[]);assert((await S.exists(path.join(f.workspace,'.margin-reader/backup-jobs',o.jobId,'package')))?.isDirectory());
 await f.api(prefix+'discard',{jobId:o.jobId});assert((await S.exists(path.join(f.workspace,o.path)))?.isDirectory());assert.equal(await fs.readFile(path.join(f.workspace,'note.md'),'utf8'),'Original');
});
test('an interrupted completion receipt is recovered by the same job without republishing or losing the complete backup',async t=>{
 const f=await setup(t),o=options();await f.api('fs.write',{path:'note.md',content:'Durable original'});await f.api(prefix+'create',o);const job=await ready(f.api,{jobId:o.jobId,password:o.password});
 const save=Job.save;t.mock.method(Job,'save',async value=>{if(value.journal.phase==='complete')throw Object.assign(Error('injected receipt failure'),{code:'ENOSPC'});return save(value);});
 const error=await f.error(prefix+'publish',{jobId:o.jobId,password:o.password,expectedRevision:job.revision},'DISK_FULL');assert.equal(error.data.details.publicationMayHaveCompleted,true);t.mock.restoreAll();
 const recovered=await f.api(prefix+'get',{jobId:o.jobId,password:o.password});assert.equal(recovered.phase,'complete');assert(recovered.receiptRecovered&&recovered.outputAvailable);
 const duplicate=await f.api(prefix+'publish',{jobId:o.jobId,password:o.password,expectedRevision:job.revision});assert(duplicate.alreadyPublished);
 await f.api('library.backup.inspect',{path:o.path,password:o.password});
});
test('checkpoint scratch is excluded from both standard backup formats and discard cleans damaged checkpoints only',async t=>{
 const f=await setup(t),o=options();await f.api('fs.write',{path:'safe.md',content:'Keep'});await f.api(prefix+'create',o);
 for(const format of ['zip','segmented']){const p={path:format+'.mrbackup',format};await f.api('library.backup.create',p);const info=await f.api('library.backup.inspect',{path:p.path});assert.equal(info.files,2);}
 await fs.writeFile(path.join(f.workspace,'.margin-reader/backup-jobs',o.jobId,'checkpoint.bin'),'damaged');
 await f.error(prefix+'get',{jobId:o.jobId,password:o.password},'PASSWORD_REQUIRED');const removed=await f.api(prefix+'discard',{jobId:o.jobId});assert(removed.originalsPreserved&&removed.publishedBackupsPreserved);
 assert.equal(await fs.readFile(path.join(f.workspace,'safe.md'),'utf8'),'Keep');assert((await S.exists(path.join(f.workspace,'zip.mrbackup')))?.isFile());
 assert((await f.api(prefix+'discard',{jobId:o.jobId})).alreadyAbsent);
});
test('job identities and checkpoint paths cannot escape the authorized workspace',async t=>{
 const f=await setup(t);
 for(const jobId of ['../outside','', '.MARGIN-READER',randomUUID()+'/x'])await f.error(prefix+'discard',{jobId},'INVALID_PARAMS');
 await f.error(prefix+'create',{jobId:randomUUID(),path:'../outside.mrbackup'},'SCOPE_DENIED');
 const journal={schema:Job.SCHEMA,jobId:randomUUID(),path:'safe.mrbackup',revision:1,sourceRevision:0,phase:'copying',files:[null],directories:[],totalBytes:0,copiedBytes:0,copyIndex:0,verifyIndex:0,verifiedChunks:{}};
 assert.throws(()=>Job.validate(journal,journal.jobId),error=>error.code==='INVALID_BACKUP_JOB');
 const id=randomUUID();await fs.mkdir(path.join(f.workspace,'.margin-reader/backup-jobs'),{recursive:true});await fs.symlink(f.parent,path.join(f.workspace,'.margin-reader/backup-jobs',id));await f.error(prefix+'discard',{jobId:id},'SCOPE_DENIED');assert((await fs.stat(f.parent)).isDirectory());
});

test('parent-directory sync failure after rename reports uncertain publication and preserves the recoverable package',async t=>{
 const f=await setup(t),o=options();await f.api('fs.write',{path:'safe.md',content:'Keep the original'});await f.api(prefix+'create',o);const job=await ready(f.api,auth(o));
 const canonicalWorkspace=await fs.realpath(f.workspace),sync=Job.syncDirectory;let injected=false;t.mock.method(Job,'syncDirectory',async directory=>{if(await fs.realpath(directory)===canonicalWorkspace){injected=true;throw Object.assign(Error('injected parent directory full'),{code:'ENOSPC'});}return sync(directory);});
 const error=await f.error(prefix+'publish',{...auth(o),expectedRevision:job.revision},'DISK_FULL');assert(injected);assert.equal(error.data.details.publicationMayHaveCompleted,true);t.mock.restoreAll();
 const result=await f.api(prefix+'get',auth(o));assert.equal(result.phase,'complete');assert(result.outputAvailable&&result.receiptRecovered);
 assert((await f.api(prefix+'publish',{...auth(o),expectedRevision:job.revision})).alreadyPublished);await f.api('library.backup.inspect',{path:o.path,password:o.password});
 assert.equal(await fs.readFile(path.join(f.workspace,'safe.md'),'utf8'),'Keep the original');
});
