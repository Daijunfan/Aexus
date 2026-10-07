import {desktopExecutable} from './fixtures/desktop-app.mjs'
// Actual trusted Electron IPC and contextBridge, isolated state and no employees.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {_electron as electron} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),application=process.env.AGENTS_COMPANY_TEST_APP
const bundle=application?.endsWith('.app')?application:application?.slice(0,application.indexOf('.app/')+4)
const mode=bundle?(bundle.startsWith('/Applications/')?'installed':'candidate'):'source'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-native-api-errors-'))),state=path.join(temp,'state'),out=path.join(root,'.aexus/artifacts/private-send-recovery')
fs.mkdirSync(out,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:state,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_HIDDEN:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL','AGENTS_COMPANY_WEB','AGENTS_COMPANY_HEADLESS'].includes(key))delete env[key]
let app,pid,report
try{
 app=await electron.launch({executablePath:bundle?desktopExecutable(bundle):require('electron'),args:bundle?[]:[root],env});pid=app.process().pid
 const page=await app.firstWindow();await page.locator('.infinite-canvas').waitFor()
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
 assert.equal((await call('status')).running,true)
 assert.deepEqual(await call('channel.acknowledge',{id:'nonexistent',all:true}),{acknowledged:false,reason:'window-not-active'})
 const saved=await call('messenger.state'),file=path.join(state,'messenger.json')
 fs.writeFileSync(file,'intentionally invalid temporary fixture')
 const failure=await page.evaluate(async()=>{try{await window.agents.call('messenger.state');return null}catch(error){return {message:error.message,code:error.code}}})
 assert.equal(failure.code,'STATE_CORRUPT');assert.match(failure.message,/State file is corrupt/)
 assert.doesNotMatch(failure.message,/Error invoking remote method/)
 assert.equal(fs.readFileSync(file,'utf8'),'intentionally invalid temporary fixture')
 fs.writeFileSync(file,JSON.stringify(saved))
 assert.deepEqual(await call('messenger.state'),saved)
 const unknown=await page.evaluate(async()=>{try{await window.agents.call('fixture.unknown');return null}catch(error){return {message:error.message,code:error.code}}})
 assert.match(unknown.message,/Unknown API command/);assert.equal(unknown.code,undefined)
 assert.equal((await call('session.list')).sessions.length,0);assert.deepEqual(await call('terminal.list'),[])
 report={passed:true,mode,application:bundle??'Source Electron',providerCalls:0,pid,hidden:true,checks:['Actual Core STATE_CORRUPT code and message survive trusted IPC and contextBridge; no Electron wrapper in user text','Successful payloads remain raw Core data, including guarded hidden-window acknowledge refusal','Temporary corrupt state is not overwritten; generic errors remain readable; zero employees/terminals'],...(bundle?{asarSha256:createHash('sha256').update(fs.readFileSync(path.join(bundle,'Contents/Resources/app.asar'))).digest('hex')}:{})}
}finally{
 if(app)await app.close()
 if(pid)assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH')
 fs.rmSync(temp,{recursive:true,force:true})
}
report.closed=true
fs.writeFileSync(path.join(out,mode+'-native-api-errors.json'),JSON.stringify(report,null,2)+'\n')
console.log('PASS actual native Core error codes, plain success payloads and hidden-window acknowledgement guard')
