'use strict';
exports.register=({command,str,num,opt,obj})=>{
 const jobId=str('Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response.',true);
 const password=str('Encrypted checkpoint passphrase. Required again after restart; never stored in the checkpoint.');
 const expectedRevision=num('Latest backup-job revision from create/get/step, independent of the live library revision.',true,{integer:true,minimum:1});
 command('library.backup.job.create','Prepare a resumable local backup with frozen metadata and original-file versions. Does not copy the full library or publish an archive.',true,{jobId,path:str('New workspace-relative .mrbackup destination.',true),password});
 command('library.backup.job.list','List workspace-local checkpoint UUIDs, creation times and encryption flags without exposing encrypted paths or source filenames.',false,{offset:num('Offset.',false,{integer:true,minimum:0}),limit:num('Page size; default 32.',false,{integer:true,minimum:1,maximum:32})});
 command('library.backup.job.get','Read exact resumable backup progress; recover a publication receipt after an interrupted reply without writing data.',false,{jobId,password});
 command('library.backup.job.step','Advance one committed chunk batch or verify whole files. No hidden background worker. Copying resumes at committed chunks; interrupted file hashing/verification restarts that file.',true,{jobId,password,expectedRevision,maxChunks:num('Copy at most 1–32 chunks of 4 MiB; default 8. Initial native hashing of a file is additional work.',false,{integer:true,minimum:1,maximum:32}),maxFiles:num('Verify at most 1–4 complete files per request; default 1. Memory remains chunk-bounded; duration depends on file size.',false,{integer:true,minimum:1,maximum:4})});
 command('library.backup.job.publish','Publish a fully verified checkpoint as a standard segmented backup without replacing existing directories. Repeating an interrupted publication recovers the same result.',true,{jobId,password,expectedRevision});
 command('library.backup.job.discard','Explicitly remove only this job’s private scratch copies and checkpoint. Preserve every original and all already-published backups. Also cleans a damaged checkpoint.',true,{jobId});
};
