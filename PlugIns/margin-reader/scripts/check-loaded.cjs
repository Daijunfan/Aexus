#!/usr/bin/env node
'use strict';
// Read-only deployment check. Does not open/close a view, instantiate a runtime,
// write user state, install packages, or print token-bearing view URLs.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),root=path.resolve(__dirname,'..');
const FILES=['runtime.cjs','schema.json','ui/app.js','ui/study.js','ui/study-map.js','ui/study-workbench.js','ui/study-excerpts.js','ui/pdf-reader.js'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function packageInfo(directory){
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'agents-company.plugin.json'),'utf8'));
 if(manifest.id!=='margin-reader')throw Error('Expected a Margin Reader plugin package.');
 const schema=JSON.parse(await fs.readFile(path.join(directory,'schema.json'),'utf8'));
 const files={};for(const file of FILES)files[file]=hash(await fs.readFile(path.join(directory,file)));
 const location=await fs.readFile(path.join(directory,'source-location.json'),'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error;});
 return {directory,version:manifest.version,commands:schema.commands.length,hasCardActivation:schema.commands.some(c=>c.method==='study.card.activate'),workspaceSource:location?.source||null,files};
}
async function inspect({expectedRoot=path.join(root,'dist-plugin'),hostCLI=path.resolve(root,'../../bin/agents'),call}={}){
 const invoke=call|| (async args=>{const {stdout}=await exec(process.execPath,[hostCLI,...args,'--json'],{timeout:10000,maxBuffer:4*1024*1024});const result=JSON.parse(stdout);if(!result.ok)throw Error(result.error||'Host read failed.');return result.data;});
 const registered=(await invoke(['plugin','list'])).find(p=>p.id==='margin-reader');
 if(!registered?.directory)throw Error('Margin Reader is not registered with the running host.');
 const [loaded,expected]=await Promise.all([packageInfo(registered.directory),packageInfo(expectedRoot)]);
 const differingFiles=FILES.filter(file=>loaded.files[file]!==expected.files[file]);
 const windows=await invoke(['plugin','windows']),served=[];
 for(const view of windows.filter(w=>w.plugin==='margin-reader')){
  const record={workspace:view.workspace,attached:view.attached,staticChecks:[]};
  try{
   const base=new URL('.',view.url);
   if(base.protocol!=='http:'||base.hostname!=='127.0.0.1')throw Error('Only the existing host loopback view may be inspected.');
   for(const file of ['ui/study-map.js','ui/study.js']){
    const reply=await fetch(new URL(file.slice(3),base),{redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!reply.ok)throw Error('Existing view did not serve the requested script.');
    const sha256=hash(Buffer.from(await reply.arrayBuffer()));record.staticChecks.push({file,sha256,matchesRegistered:sha256===loaded.files[file],matchesExpected:sha256===expected.files[file]});
   }
  }catch{record.error='Could not verify the existing view scripts; no view was opened or changed.';}
  served.push(record);
 }
 const needsReload=served.some(view=>view.staticChecks.some(file=>!file.matchesRegistered||!file.matchesExpected));
 return {readOnly:true,registered:loaded,expected,differingFiles,matching:differingFiles.length===0,windows:served,needsUpdate:differingFiles.length>0,needsReload,workspaceMappingMatches:loaded.workspaceSource===expected.workspaceSource,applicationChanged:false};
}
if(require.main===module)inspect().then(report=>{console.log(JSON.stringify(report,null,2));process.exitCode=report.needsUpdate||report.needsReload||!report.workspaceMappingMatches?2:0;}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={FILES,packageInfo,inspect};
