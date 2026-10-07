// Actual Electron/ASAR worker boundary, using disposable data and no model or user app.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-index-package-')),stage=path.join(temp,'source'),archive=path.join(temp,'app.asar'),home=path.join(temp,'state'),output=path.join(root,'.aexus/artifacts/slimming-complete')
let child
try{
 fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'aexus',version:'0.0.0-fixture',main:'main.cjs'}))
 const bundle=await build({entryPoints:{'message-index-client':path.join(root,'Infra/src/main/message-index-client.ts'),'message-index-worker':path.join(root,'Infra/src/main/message-index-worker.ts')},outdir:path.join(stage,'.aexus/out/main'),bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent',metafile:true})
 assert.ok(Object.keys(bundle.metafile.inputs).every(file=>!file.includes('api-registry')&&!file.includes('node_modules/')),'The query worker must not load command metadata or UI/parser dependencies')
 fs.writeFileSync(path.join(stage,'main.cjs'),`
 const {app}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 app.setPath('userData',process.env.AC_PACKAGE_USER_DATA);
 app.whenReady().then(async()=>{
  const {queryMessageIndex,closeMessageIndex}=require('./.aexus/out/main/message-index-client.js');
  const home=process.env.AGENTS_COMPANY_HOME;fs.mkdirSync(home,{recursive:true});const file=path.join(home,'history.json');
  fs.writeFileSync(file,JSON.stringify([{id:'hello',role:'assistant',createdAt:3,blocks:[{kind:'text',text:'Package search 汉字 needle'},{kind:'thinking',text:'PRIVATE_PACKAGE_SECRET'}]}]));
  const source={id:'employee:packaged',version:'package-1',read:()=>JSON.parse(fs.readFileSync(file)).map(item=>({id:item.id,conversation:'employee:packaged',role:'assistant',author:'Packaged',images:[],createdAt:item.createdAt,text:item.blocks.filter(block=>block.kind==='text').map(block=>block.text).join('\\n')}))};
  const options={query:'汉字 needle',limit:20,offset:0,filter:'all',author:'all'};
  const page=await queryMessageIndex('search',[source],{},options);assert.equal(page.total,1);assert.equal(page.rows[0].id,'hello');assert.ok(!page.rows[0].text.includes('PRIVATE_PACKAGE_SECRET'));
  await closeMessageIndex();const reopened=await queryMessageIndex('search',[source],{},{...options,query:'package'});assert.equal(reopened.total,1);await closeMessageIndex();
  console.log('PACKAGE_INDEX_PASS '+JSON.stringify({asar:__dirname.endsWith('.asar'),rows:page.total,persistent:fs.existsSync(path.join(home,'cache/message-index.sqlite'))}));app.exit(0);
 }).catch(error=>{console.error(error.stack);app.exit(1)});
 `)
 await require('@electron/asar').createPackage(stage,archive)
 const env={...process.env,AGENTS_COMPANY_HOME:home,AC_PACKAGE_USER_DATA:path.join(temp,'electron-profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.AGENTS_COMPANY_PACKAGE_ROOT
 child=spawn(require('electron'),[archive],{env,stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data)
 const timer=setTimeout(()=>child.kill('SIGTERM'),30000),status=await new Promise(resolve=>child.once('close',resolve));clearTimeout(timer)
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index-package.log'),log)
 assert.equal(status,0,log);assert.match(log,/PACKAGE_INDEX_PASS .*"asar":true/);assert.match(log,/"persistent":true/)
 console.log('PASS ASAR-contained Electron worker indexes public text, persists its cache and reopens; no installed application or user data changed')
}finally{if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true})}
