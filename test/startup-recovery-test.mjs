import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),root=path.resolve(import.meta.dirname,'..')
const home=fs.mkdtempSync(path.join(os.tmpdir(),'ac-start-')),env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
let closed=false
try{
 const page=await app.firstWindow();await page.locator('.infinite-canvas').waitFor();await expect(page.locator('.company-brand')).toContainText('Agents Company')
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS the actual renderer starts with an invisible window')
 await app.evaluate(async({BrowserWindow})=>{await BrowserWindow.getAllWindows()[0].loadURL('data:text/html;charset=utf-8,<title>Startup failed</title><p>unreadable old resource</p>')})
 await expect(page).toHaveTitle('Startup failed')
 const start=Date.now();await app.close();closed=true
 assert.ok(Date.now()-start<5000,'Startup failure must not get trapped behind an unreachable flush response')
 console.log('PASS an uninitialized/reloaded renderer can quit without a 12-second flush deadlock')
}finally{if(!closed)await app.close();fs.rmSync(home,{recursive:true,force:true})}
