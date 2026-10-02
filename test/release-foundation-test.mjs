import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const require=createRequire(import.meta.url),Module=require('node:module'),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'agents-release-foundation-'))
const {controlEndpoint}=require('../bin/platform.cjs')
let checks=0;const pass=name=>{checks++;console.log('PASS '+name)}
async function moduleFor(source){
  const result=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent'})
  const module=new Module(root+'/foundation-memory.cjs');module.filename=root+'/foundation-memory.cjs';module.paths=Module._nodeModulePaths(root);module._compile(result.outputFiles[0].text,module.filename);return module.exports
}
try{
  const {atomicJson,readJson}=await moduleFor("export * from './src/main/atomic-file'")
  const file=path.join(temp,'state.json');atomicJson(file,{revision:1},true);atomicJson(file,{revision:2},true)
  assert.deepEqual(readJson(file,()=>null),{revision:2});assert.deepEqual(JSON.parse(fs.readFileSync(file+'.previous','utf8')),{revision:1});pass('atomic state publication retains a valid previous copy')
  fs.writeFileSync(file,'broken');assert.throws(()=>readJson(file,()=>[]),error=>error.code==='STATE_CORRUPT');assert.throws(()=>atomicJson(file,{revision:3},true));assert.equal(fs.readFileSync(file,'utf8'),'broken');pass('corrupt data is neither silently discarded nor overwritten')
  assert.match(controlEndpoint('/tmp/a','win32'),/^\\\\\.\\pipe\\agents-company-[a-f0-9]{24}$/)
  assert.notEqual(controlEndpoint('/tmp/a','win32'),controlEndpoint('/tmp/b','win32'));assert.equal(controlEndpoint(temp,'linux'),path.join(path.resolve(temp),'agents.sock'));pass('platform IPC endpoints are deterministic and data-directory scoped')
  const {acquireCodexStartup}=await moduleFor("export * from './src/main/engines/startup'")
  let active=0,max=0
  await Promise.all(Array.from({length:12},async()=>{const release=await acquireCodexStartup(undefined,'test-profile');max=Math.max(max,++active);await new Promise(r=>setTimeout(r,2));active--;release()}))
  assert.equal(max,1);pass('native profile startup handshakes do not race; lock releases')
  const f=await fixtureCore()
  try{
    await f.cli('group','add','Test')
    const employee=await f.create('Existing','Test'),data=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')
    const before=fs.readFileSync(data)
    const child=spawn(process.execPath,[root+'/bin/agents','serve'],{env:f.env,stdio:'pipe'});let output='';child.stderr.on('data',value=>output+=value)
    const status=await new Promise(resolve=>child.once('close',resolve));assert.notEqual(status,0);assert.match(output,/already owns|existing service/);assert.deepEqual(fs.readFileSync(data),before);pass('second Core cannot migrate or write state before acquiring ownership')
    await f.stop();const stored=JSON.parse(fs.readFileSync(data,'utf8'));stored.fullAccessDefaultApplied=false;stored.sessions.find(card=>card.id===employee.id).permissionMode='acceptEdits';fs.writeFileSync(data,JSON.stringify(stored));await f.start()
    assert.equal((await f.cli('session','list')).sessions.find(card=>card.id===employee.id).permissionMode,'acceptEdits');pass('upgrade preserves an existing restricted engine permission')
    const history=path.join(f.env.AGENTS_COMPANY_HOME,'transcripts',employee.id+'.json');fs.mkdirSync(path.dirname(history),{recursive:true});fs.writeFileSync(history,'corrupted')
    const reply=await f.raw(null,'session','transcript',employee.id);assert.equal(reply.ok,false);assert.match(reply.error,/corrupt/i);assert.equal(fs.readFileSync(history,'utf8'),'corrupted');pass('public transcript API reports corruption instead of an empty conversation')
  }finally{await f.close()}
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'engine-downloads.json'),'utf8'))
  assert.ok(manifest.entries.length>=12)
  for(const entry of manifest.entries){assert.match(entry.integrity,/^sha512-/);assert.equal(new URL(entry.url).hostname,'registry.npmjs.org');assert.ok(!entry.executable.split(/[\\/]/).includes('..'))}
  pass('all published engine downloads pin official origin, version and SHA-512')
  console.log(`FOUNDATION: ${checks} checks passed`)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
