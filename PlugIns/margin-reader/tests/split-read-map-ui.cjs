'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {create}=require('./ui-session.cjs');
(async()=>{
 const f=await create('split-read-map');let failure;
 try{
  const output=process.env.MR_SPLIT_OUTPUT||(await fs.readFile(path.resolve(__dirname,'../artifacts/split-read-map-current.txt'),'utf8')).trim();
  await require('./split-read-map-exercise.cjs').exercise({...f,output,url:f.server.url});
 }catch(error){failure=error;}
 await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
