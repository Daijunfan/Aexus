import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-storage-test-')),previous=process.env.AGENTS_COMPANY_HOME
process.env.AGENTS_COMPANY_HOME=path.join(temporary,'state');fs.mkdirSync(process.env.AGENTS_COMPANY_HOME)
fs.symlinkSync(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir')
let core,active
const wait=async id=>{for(let n=0;n<1000;n++){const result=core.guardianStorageStatus(id);if(result.status!=='running')return result;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('Storage scan timed out')}
try{
  const sessions=['employee','manager','governor','secretary'].map(role=>({id:role,title:role,engine:'codex',kind:'worker',group:'A',cwd:temporary,createdAt:1,initialization:{status:'ready'},managementRole:role}))
  fs.writeFileSync(path.join(process.env.AGENTS_COMPANY_HOME,'sessions.json'),JSON.stringify({sessions,groups:['A'],teamRoots:{A:temporary},rooms:{}}))
  const entry=path.join(temporary,'test.cjs');await build({stdin:{contents:"export * from './src/main/guardian-storage';export {handleRequest} from './src/main/server';export {operatorContext} from './src/main/authorization';export {closeChannels} from './src/main/channels'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  core=createRequire(import.meta.url)(entry)
  const directory=path.join(temporary,'files'),nested=path.join(directory,'nested'),deeper=path.join(nested,'deeper'),outside=path.join(temporary,'outside')
  fs.mkdirSync(deeper,{recursive:true});fs.mkdirSync(outside);fs.writeFileSync(path.join(directory,'a.bin'),Buffer.alloc(31));fs.writeFileSync(path.join(nested,'b.bin'),Buffer.alloc(73));fs.writeFileSync(path.join(deeper,'c.bin'),Buffer.alloc(109));fs.writeFileSync(path.join(directory,'.hidden'),Buffer.alloc(7));fs.writeFileSync(path.join(outside,'outside.bin'),Buffer.alloc(50000));fs.symlinkSync(outside,path.join(directory,'outside-link'),'dir')
  for(const args of [{},{path:directory,root:'home'},{path:'relative/path'},{root:'all-disks'},{path:path.join(directory,'a.bin')},{path:path.join(temporary,'missing')}])await assert.rejects(core.guardianStorageStart(args))
  for(const role of ['employee','manager','governor','secretary'])for(const cmd of ['guardian.storage-start','guardian.storage-status','guardian.storage-cancel'])await assert.rejects(core.handleRequest({cmd,args:{path:directory,id:'any'}},{principal:{kind:'agent',employeeId:role},requestId:'storage-test'}),/Only the user/)
  const user=core.operatorContext(),start=await core.handleRequest({cmd:'guardian.storage-start',args:{path:directory}},user);active=start.id;assert.equal(start.status,'running');assert.equal(start.bytes,0)
  await assert.rejects(core.guardianStorageStart({path:outside}),/Cancel the running/)
  const result=await wait(start.id);assert.equal(result.status,'completed');assert.equal(result.bytes,220);assert.equal(result.files,4);assert.equal(result.directories,3);assert.equal(result.errorCount,0);assert.equal(result.skippedSymlinks,1);assert.equal(result.pendingDirectories,0)
  assert.equal(result.entries[0].name,'nested');assert.equal(result.entries[0].bytes,182);assert.equal(result.entries[0].files,2);assert.equal(result.largestFiles[0].bytes,109);assert.equal(result.entries.reduce((sum,row)=>sum+row.bytes,0)+result.otherBytes,result.bytes)
  assert.equal(fs.readFileSync(path.join(directory,'a.bin')).length,31,'scan never mutates contents')
  const drill=await core.guardianStorageStart({path:result.entries[0].path});active=drill.id;const drilled=await wait(drill.id);assert.equal(drilled.bytes,182);assert.equal(drilled.entries[0].name,'deeper');assert.equal((await core.handleRequest({cmd:'guardian.storage-status',args:{id:drill.id}},user)).bytes,182)
  const blocked=path.join(directory,'blocked');fs.mkdirSync(blocked);fs.writeFileSync(path.join(blocked,'unreadable.bin'),Buffer.alloc(500));fs.chmodSync(blocked,0)
  try{const denied=await core.guardianStorageStart({path:directory});active=denied.id;const partial=await wait(denied.id);if(process.getuid?.()!==0){assert.equal(partial.status,'partial');assert.ok(partial.errorCount>0);assert.ok(partial.errors.some(error=>error.path===path.join(result.path,'blocked')));assert.equal(partial.entries.find(row=>row.name==='blocked').partial,true);assert.equal(partial.bytes,220)}}finally{fs.chmodSync(blocked,0o700)}
  const many=path.join(temporary,'many');fs.mkdirSync(many);for(let n=0;n<1500;n++)fs.writeFileSync(path.join(many,`${n}.bin`),Buffer.alloc(n%8+1))
  const ongoing=await core.guardianStorageStart({path:many});active=ongoing.id;const cancelled=core.guardianStorageCancel(ongoing.id);assert.equal(cancelled.status,'cancelled');await new Promise(resolve=>setTimeout(resolve,30));assert.equal(core.guardianStorageStatus(ongoing.id).bytes,cancelled.bytes,'cancelled counters stop changing')
  const resumed=await core.guardianStorageStart({path:many});active=resumed.id;const all=await wait(resumed.id);assert.equal(all.files,1500);assert.equal(all.entries.length,200);assert.equal(all.otherEntries,1300);assert.equal(all.entries.reduce((sum,row)=>sum+row.bytes,0)+all.otherBytes,all.bytes);assert.equal(all.largestFiles.length,40)
  assert.throws(()=>core.guardianStorageStatus(start.id),/expired/,'only four recent scans retained')
  console.log('PASS Guardian Storage: real temporary-tree bytes, hidden files, recursive aggregation and drilldown; no symlink traversal; human-only API; unreadable folders report partial; cancellation stops counters; bounded top entries and job retention.')
}finally{if(active)try{core?.guardianStorageCancel(active)}catch{};await new Promise(resolve=>setTimeout(resolve,20));core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temporary,{recursive:true,force:true})}
