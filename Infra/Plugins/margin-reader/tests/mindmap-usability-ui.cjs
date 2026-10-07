'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{create}=require('./ui-session.cjs');
(async()=>{const output=path.resolve(__dirname,'../artifacts/mindmap-usability-20261003/browser');await fs.mkdir(output,{recursive:true});const f=await create('mindmap-usability-20261003');let error;
 try{await require('./mindmap-usability-exercise.cjs').exercise({...f,output,url:f.server.url});}catch(e){error=e;}
 f.report.date='2026-10-03';f.report.modelCalls=0;f.report.realWorkspaceChanges=false;await fs.writeFile(path.join(output,'results.json'),JSON.stringify({...f.report,passed:!error,error:error?.stack},null,2));await f.finish(error);
})().catch(error=>{console.error(error);process.exitCode=1;});
