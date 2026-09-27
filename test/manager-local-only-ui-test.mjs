import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-local-ui-'))),bin=path.join(temp,'bin'),control=path.join(temp,'fixture'),remote=path.join(temp,'cloud')
for(const dir of [bin,control,remote])fs.mkdirSync(dir);fs.writeFileSync(path.join(control,'release-all'),'')
fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o755})
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Local')
 const host=await cli('host','create','--data',JSON.stringify({name:'Remote',host:'fixture',os:'linux',defaultDirectory:remote}));await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await page.locator('.add-employee').click();await page.locator('select[name=group]').selectOption('Local');await page.locator('select[name=managementRole]').selectOption('manager')
 await page.locator('select[name=group]').selectOption('Cloud');await expect(page.locator('select[name=managementRole]')).toHaveValue('employee');await expect(page.locator('select[name=managementRole] option[value=manager]')).toHaveJSProperty('disabled',false)
 await page.locator('select[name=group]').selectOption('Local');await expect(page.locator('select[name=managementRole] option[value=manager]')).toHaveJSProperty('disabled',false);await cli('view','close')
 await page.locator('.add-employee').click();await page.locator('select[name=group]').selectOption('Cloud')
 await page.locator('select[name=managementRole]').selectOption('manager')
 await expect(page.locator('select[name=workEnvironment]')).toHaveValue('local')
 await expect(page.locator('.workspace-contract')).toContainText('BUILD')
 await page.locator('input[name=title]').fill('Mac Lead')
 await expect(page.locator('select[name=model]')).toBeEnabled();await page.locator('select[name=model]').selectOption('gpt-6-luna')
 await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const manager=(await cli('session','list')).sessions.find(card=>card.title==='Mac Lead')
 assert.equal(manager.group,'Cloud');assert.equal(manager.managementRole,'manager');assert.equal(manager.workEnvironment,'local');assert.ok(manager.cwd.startsWith(env.AGENTS_COMPANY_PROJECTS));assert.equal(manager.remote,null)
 await expect.poll(async()=>(await cli('session','status','--employee',manager.id))[0].initialization.status).toBe('ready')
 await page.locator('.add-employee').click();await page.locator('select[name=kind]').selectOption('cloud-native-worker')
 await expect(page.locator('select[name=managementRole]')).toHaveValue('employee')
 await expect(page.locator('select[name=managementRole] option[value=manager]')).toHaveJSProperty('disabled',true)
 await page.screenshot({path:path.join(root,'artifacts/cloud-employee-local-only-role.png')})
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden UI: Cloud Team Manager selection automatically creates a Mac-local worker; Cloud Native remains Employee-only')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
