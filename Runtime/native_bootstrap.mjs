// Keep executable source out of the SSH/Windows command line. The first line
// contains the owned module; all following bytes belong to its native RPC.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const source=await new Promise(resolve=>{
 let buffer=Buffer.alloc(0);
 const receive=chunk=>{
  buffer=Buffer.concat([buffer,chunk]);const newline=buffer.indexOf(10);if(newline<0)return;
  process.stdin.pause();process.stdin.off('data',receive);
  if(newline+1<buffer.length)process.stdin.unshift(buffer.subarray(newline+1));
  resolve(Buffer.from(buffer.subarray(0,newline).toString(),'base64'));
 };
 process.stdin.on('data',receive);
});
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'native-executor-')),file=path.join(folder,'worker.mjs');
fs.writeFileSync(file,source,{mode:0o600});
process.on('exit',()=>fs.rmSync(folder,{recursive:true,force:true}));
await import(pathToFileURL(file).href);
