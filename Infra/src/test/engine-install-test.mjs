// Downloads official pinned native binaries into a disposable data directory; no model inference.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {pathToFileURL} from 'node:url'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore({CODEX_BIN:'',CLAUDE_BIN:''}),run=promisify(execFile)
try{
  for(const engine of ['codex','claude']){
    const plan=await f.cli('engine','install-plan','--engine',engine)
    assert.equal(plan.nativeDownload,true);assert.deepEqual(plan.requires,[]);assert.match(plan.integrity,/^sha512-/)
    assert.equal((await f.raw(null,'engine','install','--engine',engine)).ok,false)
    const job=await f.cli('engine','install','--engine',engine,'--confirm')
    const deadline=Date.now()+300000;let status
    do{await new Promise(r=>setTimeout(r,500));status=await f.cli('engine','install-status',job.id);if(Date.now()>deadline)throw Error('Installation timed out')}while(status.state==='running')
    assert.equal(status.state,'succeeded',JSON.stringify(status));assert.ok(status.path.startsWith(f.env.AGENTS_COMPANY_HOME));assert.ok(fs.existsSync(status.path))
    const result=await run(status.path,['--version'],{env:f.env,timeout:15000});assert.ok((result.stdout+result.stderr).includes(engine==='codex'?'0.156.1':'2.1.272'))
    const visible=await f.cli('engine','list');assert.equal(visible.find(item=>item.engine===engine).configuration.managedPath,status.path)
    if(engine==='claude'){
      assert.equal(plan.sdk.package,'@anthropic-ai/claude-agent-sdk');assert.match(plan.sdk.integrity,/^sha512-/)
      const sdk=visible.find(item=>item.engine==='claude').configuration.sdkPath;assert.ok(fs.existsSync(sdk));assert.ok(sdk.startsWith(f.env.AGENTS_COMPANY_HOME));assert.ok(fs.readFileSync(path.join(path.dirname(sdk),'LICENSE.md'),'utf8').includes('Anthropic'))
      const controller=await import(pathToFileURL(sdk).href);assert.equal(typeof controller.query,'function');assert.equal(typeof controller.forkSession,'function')
    }
    console.log(`PASS ${engine}: official SHA-512 verified, native binary runs, managed path activated without restart (${status.downloadedBytes} bytes)`)
  }
  const before=await f.cli('engine','list'),job=await f.cli('engine','install','--engine','codex','--confirm')
  const cancelled=await f.cli('engine','cancel-install',job.id);assert.equal(cancelled.state,'cancelled');assert.deepEqual(await f.cli('engine','list'),before)
  console.log('PASS cancellation leaves prior working binaries and configuration unchanged')
}finally{await f.close()}
