'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {create}=require('./ui-session.cjs');
(async()=>{const f=await create('topic-ownership');let error;try{const output=process.env.MR_TOPIC_COVER_OUTPUT||(await fs.readFile(path.resolve(__dirname,'../artifacts/topic-cover-current.txt'),'utf8')).trim();await require('./topic-ownership-exercise.cjs').exercise({...f,output,url:f.server.url});}catch(e){error=e;}await f.finish(error);})().catch(e=>{console.error(e);process.exitCode=1;});
