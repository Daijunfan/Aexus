import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {createNodeClient} from '../../../Contract/node-client.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),contract=path.resolve(fileURLToPath(new URL('../../../Contract/',import.meta.url))),require=createRequire(import.meta.url),{build}=require('esbuild');
const manifest=JSON.parse(await fs.readFile(path.join(root,'engine.json'),'utf8')),catalog=JSON.parse(await fs.readFile(path.join(contract,'commands.v1.json'),'utf8'));
const commands=new Map(catalog.commands.map(c=>[c.name,c]));for(const name of manifest.requiredCommands)assert.ok(commands.has(name),'undeclared public command '+name);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ppt-contract-'));
try{
 await build({entryPoints:[path.join(contract,'engine.ts')],outfile:path.join(temp,'engine.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'warning'});
 const {validateEngineManifest}=await import(pathToFileURL(path.join(temp,'engine.mjs')));assert.equal(validateEngineManifest(manifest,'PPT-maker').id,'PPT-maker');
 for(const id of ['../PPT-maker','PPT/maker','PPT--maker','PPT_maker','-PPT-maker'])assert.throws(()=>validateEngineManifest({...manifest,id}));
 assert.throws(()=>validateEngineManifest(manifest,'ppt-maker'));
 const peer=new Set(['react','react/jsx-runtime']),dependencies=new Set(Object.keys(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).dependencies));
 const visited=new Set();
 async function check(file){if(visited.has(file))return;visited.add(file);const text=await fs.readFile(file,'utf8');
  for(const m of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){
   const spec=m[1];if(spec.startsWith('node:')||peer.has(spec)||dependencies.has(spec))continue;
   if(!spec.startsWith('.'))throw Error('引擎依赖未声明：'+spec);
   let resolved=path.resolve(path.dirname(file),spec);if(resolved.startsWith(contract+path.sep))continue;
   assert.ok(resolved.startsWith(root+path.sep),'Engine boundary violation: '+file+' -> '+spec);
   const suffixes=path.extname(resolved)?['']:['.tsx','.ts','.mjs','.css'];for(const suffix of suffixes){const candidate=resolved+suffix;try{if((await fs.stat(candidate)).isFile()){if(/\.(mjs|tsx|ts)$/.test(candidate))await check(candidate);break;}}catch{}}
  }
 }
 for(const entry of ['Page.tsx','runtime.mjs','cli.mjs'])await check(path.join(root,entry));
 const result={passed:true,contractVersion:catalog.contractVersion,engineId:manifest.id,requiredCommands:manifest.requiredCommands.length,checkedModules:visited.size,invalidIdsRejected:5,live:null};
 if(process.env.PPT_MAKER_TEST_CLI){
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'ppt-core-home-')),client=createNodeClient({cli:process.env.PPT_MAKER_TEST_CLI,env:{...process.env,AGENTS_COMPANY_HOME:home},timeout:30000,maxBuffer:24*1024*1024});
  result.live={info:await client.info(),workflows:await client.invoke('workflow.list',{engineId:'PPT-maker'})};
  // The owning integration harness controls its isolated Core lifecycle and cleanup.
 }
 const out=path.join(root,'test-artifacts');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'contract.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await fs.rm(temp,{recursive:true,force:true});}
