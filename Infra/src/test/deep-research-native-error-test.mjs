// The real Core status path with a protocol fixture. No provider or paid model is started.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'../../..')
test('a failed native turn exposes its cause to the research workflow without another model request', {timeout: 20000}, async () => {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-research-native-error-'))
 const entry=path.join(temp,'daemon.cjs')
 let core
 try{
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
  await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  core=await fixtureCore({},entry)
  await core.cli('group','add','Failure Fixture')
  const worker=await core.create('Native failure fixture','Failure Fixture')
  fs.writeFileSync(path.join(core.control,worker.id+'.work-fail'),'')
  const response=await core.request(null,'session.send',{employee:worker.id,text:'BOUNDED_FAILURE_FIXTURE'})
  assert.equal(response.ok,true)
  const status=await core.until(async()=>{const value=await core.status(worker.id);return !value.busy&&value.error?value:false},'native error propagated')
  assert.match(status.error,/fixture provider stream disconnected/)
  assert.equal((await core.cli('session','transcript','--employee',worker.id)).items.filter(item=>item.role==='user').length,1)
 }finally{await core?.close();fs.rmSync(temp,{recursive:true,force:true})}
})
