import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const root=path.resolve(import.meta.dirname,'..')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-guardian-bg-'))
const originalHome=process.env.AGENTS_COMPANY_HOME
const originalSetInterval=globalThis.setInterval,originalClearInterval=globalThis.clearInterval
const originalFetch=globalThis.fetch
process.env.AGENTS_COMPANY_HOME=temp
const scheduled=[]
let intervals=0,cleared=0
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 const entry=path.join(temp,'background.cjs')
 await build({stdin:{contents:"export * from './src/main/guardian';export * from './src/main/guardian-events'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 const core=createRequire(import.meta.url)(entry)
 globalThis.fetch=async()=>{throw Error('Unexpected external request without geolocation consent')}
 globalThis.setInterval=(callback,period)=>{
  intervals++
  const timer={callback,period,stopped:false,unref(){this.unrefCalled=true}}
  scheduled.push(timer)
  return timer
 }
 globalThis.clearInterval=timer=>{cleared++;timer.stopped=true}
 assert.deepEqual(core.guardianSettings(),{geoLookupEnabled:false,backgroundSamplingEnabled:false,home:null})
 assert.equal(core.guardianEventFeed().coverage.mode,'on-demand')
 const stop=core.startGuardianBackgroundSampling()
 assert.equal(intervals,0,'opt-in must be disabled by default')
 assert.equal(core.guardianEventFeed().coverage.mode,'on-demand')
 assert.deepEqual(core.setGuardianSettings({backgroundSamplingEnabled:true}),{geoLookupEnabled:false,backgroundSamplingEnabled:true,home:null})
 assert.equal(intervals,1)
 assert.equal(scheduled[0].period,60000)
 assert.equal(scheduled[0].unrefCalled,true,'background interval must not pin a headless process')
 assert.equal(core.guardianEventFeed().coverage.mode,'background')
 const first=await core.guardianSnapshot()
 assert.ok(first.sampledAt>0)
 assert.equal(core.guardianEventFeed().coverage.sampleCount,1,'initial sampling is coalesced')
 scheduled[0].callback()
 const second=await core.guardianSnapshot()
 assert.equal(second.sampledAt,first.sampledAt,'background poll shares the fresh Core snapshot')
 assert.equal(core.guardianEventFeed().coverage.sampleCount,1,'dedupe within the 2-second cache window')
 core.setGuardianSettings({backgroundSamplingEnabled:false})
 assert.equal(cleared,1)
 assert.equal(scheduled[0].stopped,true)
 assert.equal(core.guardianEventFeed().coverage.mode,'on-demand')
 core.setGuardianSettings({backgroundSamplingEnabled:true})
 assert.equal(intervals,2)
 stop()
 assert.equal(scheduled[1].stopped,true)
 assert.equal(core.guardianEventFeed().coverage.mode,'on-demand')
 core.setGuardianSettings({backgroundSamplingEnabled:false})
 assert.equal(intervals,2,'settings writes after Core stops must not restart polling')
 const persisted=JSON.parse(fs.readFileSync(path.join(temp,'guardian.json'),'utf8'))
 assert.equal(persisted.backgroundSamplingEnabled,false)
 console.log('PASS Guardian background: default-off opt-in, 60s timer, immediate coalesced sample, no outgoing requests, disable/stop cleanup, restart-safe local settings.')
}finally{
 globalThis.setInterval=originalSetInterval;globalThis.clearInterval=originalClearInterval;globalThis.fetch=originalFetch
 if(originalHome===undefined)delete process.env.AGENTS_COMPANY_HOME
 else process.env.AGENTS_COMPANY_HOME=originalHome
 fs.rmSync(temp,{recursive:true,force:true})
}
