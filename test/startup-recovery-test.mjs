import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),root=path.resolve(import.meta.dirname,'..')
const run=promisify(execFile)
const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'ac-start-')),home=path.join(sandbox,'state'),manager=path.join(sandbox,'Agents-Managers'),fixtureControl=path.join(sandbox,'fixture')
fs.mkdirSync(manager);fs.writeFileSync(path.join(manager,'.agents-company-manager'),'agents-company-manager/v1\n')
fs.mkdirSync(fixtureControl);fs.writeFileSync(path.join(fixtureControl,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(sandbox,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(sandbox,'work'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(sandbox,'codex'),AC_INIT_FIXTURE:fixtureControl};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
let closed=false
try{
 const page=await app.firstWindow();await page.locator('.infinite-canvas').waitFor();await expect(page.locator('.company-brand')).toContainText('Agents Company')
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS the actual renderer starts with an invisible window')
 const cli=async(...args)=>JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:10000})).stdout)
 const status=await cli('status');assert.equal(status.ok,true);assert.equal(status.data.home,home)
 assert.equal((await cli('group','add','Packaged smoke','--mode','build')).ok,true)
 assert.ok((await cli('group','list')).data.includes('Packaged smoke'))
 console.log('PASS the hidden app serves the same CLI API and persists a Team in isolated data')
 const notion=await cli('plugin','describe','mininotion');assert.equal(notion.ok,true)
 assert.ok(fs.existsSync(path.join(notion.data.directory,'source-location.json')),'Packaged plugin lost its persistent source-folder locator')
 assert.equal((await cli('group','add','Managers','--mode','build','--directory-mode','bind','--root',manager)).ok,true)
 const hire=await cli('card','create','--title','Director','--group','Managers','--management-role','manager','--engine','codex','--model','gpt-6-luna','--effort','low')
 assert.equal(hire.ok,true)
 assert.ok(fs.existsSync(path.join(hire.data.cwd,'.agents-company/manager/API.md')))
 assert.ok(!fs.existsSync(path.join(manager,'API.md')))
 const launcher=path.join(hire.data.cwd,'.agents-company/bin/agents')
 await assert.rejects(run(launcher,['status','--json'],{cwd:hire.data.cwd,env,timeout:10000}),/Agent identity missing/)
 console.log('PASS packaged Manager employee receives its own API copy and a CLI launcher that requires its issued identity')
 await app.evaluate(async({BrowserWindow})=>{await BrowserWindow.getAllWindows()[0].loadURL('data:text/html;charset=utf-8,<title>Startup failed</title><p>unreadable old resource</p>')})
 await expect(page).toHaveTitle('Startup failed')
 const start=Date.now();await app.close();closed=true
 assert.ok(Date.now()-start<5000,'Startup failure must not get trapped behind an unreachable flush response')
 console.log('PASS an uninitialized/reloaded renderer can quit without a 12-second flush deadlock')
}finally{if(!closed)await app.close();fs.rmSync(sandbox,{recursive:true,force:true})}
