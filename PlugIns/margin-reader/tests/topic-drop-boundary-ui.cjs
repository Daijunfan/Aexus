'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {create}=require('./ui-session.cjs');
(async()=>{const f=await create('topic-drop-boundary');let error;try{
 const output=process.env.MR_TOPIC_COVER_OUTPUT||(await fs.readFile(path.resolve(__dirname,'../artifacts/drag-cover-finish-current.txt'),'utf8')).trim();
 await require('./topic-drop-boundary-exercise.cjs').exercise({...f,output,url:f.server.url});
}catch(e){error=e;}await f.finish(error);})().catch(e=>{console.error(e);process.exitCode=1;});
