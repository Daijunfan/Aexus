"use strict";
const assert = require('node:assert/strict');
exports.exercise = async ({api,deny,get,change,setId,pdf,a}) => {
  let s=await change('study.versions.create',{title:'Before final edits'});const versionId=s.lastVersionId;
  assert((await api('study.versions.list',{setId})).versions.some(v=>v.id===versionId));
  const oldTitle=s.cards.find(c=>c.id===a).title;
  await change('study.card.update',{cardId:a,title:'After version snapshot'});
  assert((await api('study.versions.get',{setId,versionId})).changes.changed.some(c=>c.id===a));
  s=await change('study.versions.restore',{versionId});assert.equal(s.cards.find(c=>c.id===a).title,oldTitle);
  s=await change('study.versions.update',{versionId,title:'Named employee milestone',archived:true});
  assert((await api('study.versions.list',{setId,includeArchived:true})).versions.some(v=>v.id===versionId&&v.archived));
  s=await change('study.versions.policy',{enabled:true,intervalSeconds:600});assert(s.versionPolicy.enabled);
  // Small fixture exports exercise every installed encoder through the employee,
  // independently of GUI print, local shell access or state-file manipulation.
  for(const format of ['html','md','opml','docx','apkg','pdf']){
    const result=await api('study.export.file',{setId,path:'Exports/employee-notes.'+format,format,cardIds:[a],includeImages:true});
    assert(result.bytes>20&&result.cards===1);
  }
  const annotated=await api('document.pdf.export',{id:pdf.id,expectedSourceVersion:pdf.sourceVersion,path:'Exports/employee-annotated.pdf',setIds:[setId]});assert(annotated.bytes>100);
  const packaged=await api('study.package.export',{setId,path:'Exports/employee.mrpkg',includeDependencies:false});
  assert(packaged.documents>=2&&packaged.assets>=2);
  const inspected=await api('study.package.inspect',{path:'Exports/employee.mrpkg'});assert(inspected.sets.some(s=>s.id===setId));
  const imported=await api('study.package.import',{path:'Exports/employee.mrpkg',folder:'Employee-restored',activate:false});assert(imported.setId!==setId);
  const copy=await api('study.get',{setId:imported.setId});assert(copy.cards.some(c=>c.title===oldTitle));
  assert(copy.cards.some(c=>c.comments?.some(comment=>comment.media?.kind==='audio')));
  await deny('fs.list',{path:'.MARGIN-READER'},'SCOPE_DENIED');
  await deny('fs.write',{path:'.AGENTS-COMPANY/bypass.md',content:'Forbidden'},'SCOPE_DENIED');
  const jobId=require('node:crypto').randomUUID(),jobAuth={jobId,password:'employee resumable checkpoint'};
  let job=await api('library.backup.job.create',{...jobAuth,path:'Exports/employee-resumable.mrbackup'});assert.equal(job.copiedBytes,0);
  assert((await api('library.backup.job.list')).jobs.some(item=>item.jobId===jobId));
  job=await api('library.backup.job.get',jobAuth);const initialJobRevision=job.revision;
  job=await api('library.backup.job.step',{...jobAuth,expectedRevision:job.revision,maxChunks:32,maxFiles:4});
  await deny('library.backup.job.step',{...jobAuth,expectedRevision:initialJobRevision,maxChunks:1},'CONFLICT');
  for(let n=0;!['ready','complete'].includes(job.phase);n++){assert(n<150,'Resumable employee backup stalled');job=await api('library.backup.job.step',{...jobAuth,expectedRevision:job.revision,maxChunks:32,maxFiles:4});}
  const completedJob=await api('library.backup.job.publish',{...jobAuth,expectedRevision:job.revision});assert.equal(completedJob.phase,'complete');
  assert((await api('library.backup.inspect',{path:completedJob.path,password:jobAuth.password})).studies.some(s=>s.id===setId));
  assert((await api('library.backup.job.discard',{jobId})).publishedBackupsPreserved);await deny('library.backup.job.get',jobAuth,'NOT_FOUND');
  console.log('PASS Employee resumable backup preparation, explicit progress batches, stale-revision refusal, verification, publication and checkpoint cleanup');
  const plan=await api('library.backup.plan',{path:'Exports/employee-large.mrbackup'});assert(plan.files>0&&plan.sufficientSpace);
  const large=await api('library.backup.create',{path:'Exports/employee-large.mrbackup',format:'segmented',password:'employee test archive'});assert.equal(large.container,'directory');
  const verified=await api('library.backup.inspect',{path:'Exports/employee-large.mrbackup',password:'employee test archive'});assert(verified.studies.some(s=>s.id===setId));
  const extracted=await api('library.backup.restore',{path:'Exports/employee-large.mrbackup',password:'employee test archive',folder:'Employee-segmented-library'});assert.equal(extracted.format,'segmented');
  await deny('library.backup.plan',{path:'../not-authorized.mrbackup'},'SCOPE_DENIED');
  const backup=await api('library.backup.create',{path:'Exports/employee-library.mrbackup'});assert(backup.files>0);
  const index=await api('library.backup.inspect',{path:'Exports/employee-library.mrbackup'});assert(index.studies.some(s=>s.id===setId));
  const restored=await api('library.backup.restore',{path:'Exports/employee-library.mrbackup',folder:'Employee-whole-library'});assert.equal(restored.folder,'Employee-whole-library');
  await deny('library.backup.restore',{path:'Exports/employee-library.mrbackup',folder:'../not-authorized'},'SCOPE_DENIED');
  console.log('PASS Employee local exports, portable package import, named versions and complete-library backup/restore');
};
