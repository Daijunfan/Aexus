import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-file-reveal-'))),workspace=path.join(temp,'workspace'),bundle=path.join(temp,'verify.cjs')
fs.mkdirSync(workspace);fs.writeFileSync(path.join(workspace,'文档.md'),'read only');fs.chmodSync(path.join(workspace,'文档.md'),0o444);fs.mkdirSync(path.join(workspace,'folder'));fs.symlinkSync(temp,path.join(workspace,'escape'))
try{
 await build({stdin:{contents:`import assert from 'node:assert/strict';import {withCaller,operatorContext} from './src/main/request-context';import {revealWorkspaceFile,setFileRevealer} from './src/main/file-reveal';import {getPreferences,setPreferences} from './src/main/store';const root=process.argv[2],seen=[];const invoke=(end,clientId)=>withCaller({...operatorContext(),clientId},()=>revealWorkspaceFile(end));await assert.rejects(invoke({root,path:'文档.md'}),/desktop app/);setFileRevealer(file=>seen.push(file));assert.equal((await invoke({root,path:'文档.md'})).revealed,true);await invoke({root,path:'folder'});assert.equal(seen.length,2);for(const path of ['../outside','escape/other'])await assert.rejects(invoke({root,path}),/工作目录/);await assert.rejects(invoke({root,path:'missing'}),/ENOENT/);await assert.rejects(invoke({root,path:'文档.md'},'web-client'),/browser/);await assert.rejects(invoke({root,path:'文档.md',remote:{host:'fixture',directory:root}}),/remote host/);await assert.rejects(invoke({root,path:'文档.md',validate:()=>{throw Error('Access revoked')}}),/Access revoked/);assert.equal(seen.length,2);assert.equal(getPreferences().assetDrawerWidth,320);setPreferences({assetDrawerWidth:420});assert.equal(getPreferences().assetDrawerWidth,420);for(const value of [259,601,NaN,'400'])assert.throws(()=>setPreferences({assetDrawerWidth:value}));assert.equal(getPreferences().assetDrawerWidth,420);console.log('PASS scope, symlink, missing-file, remote, browser, revoked access, read-only reveal, width defaults and bounds');`,resolveDir:root,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},logLevel:'silent'})
 // Use an ESM extension for the bundled async verification.
 const esm=path.join(temp,'verify.mjs');fs.renameSync(bundle,esm)
 const result=await promisify(execFile)(process.execPath,[esm,workspace],{env:{...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work')}});console.log(result.stdout.trim());assert.equal(fs.statSync(path.join(workspace,'文档.md')).mode&0o777,0o444)
 const state=JSON.parse(fs.readFileSync(path.join(temp,'state','sessions.json'),'utf8'));assert.equal(state.preferences.assetDrawerWidth,420);assert.deepEqual(state.sessions,[])
}finally{fs.rmSync(temp,{recursive:true,force:true})}
