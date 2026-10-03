'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{create}=require('./ui-session.cjs');
(async()=>{const output=path.resolve(__dirname,'../artifacts/mindmap-usability-20261003/zones');await fs.mkdir(output,{recursive:true});const f=await create('mindmap-zones-20261003');let error;
 try{await require('./mindmap-zones-exercise.cjs').exercise({...f,output,url:f.server.url});}catch(e){error=e;}
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({...f.report,passed:!error,error:error?.stack,modelCalls:0,realWorkspaceChanges:false},null,2));await f.finish(error);
})().catch(e=>{console.error(e);process.exitCode=1;});
