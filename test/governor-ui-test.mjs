import {localTunnel} from './fixtures/local-tunnel.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-governor-ui-'))),control=path.join(temp,'fixture'),remote=path.join(temp,'remote'),bin=path.join(temp,'bin')
for(const directory of [control,remote,bin])fs.mkdirSync(directory);fs.writeFileSync(path.join(control,'release-all'),'')
fs.writeFileSync(path.join(bin,'ssh'),'#!/bin/sh\nfor arg in "$@"; do last="$arg"; done\nexec sh -c "$last"\n',{mode:0o755})
const env={...process.env,AGENTS_COMPANY_TUNNEL_DIR:localTunnel(path.join(temp,'tunnel'),root),PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(response.ok,response.error);return response.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Any Team')
 const host=await cli('host','create','--data',JSON.stringify({name:'Demo',host:'fixture',os:process.platform==='win32'?'windows':process.platform==='darwin'?'macos':'linux',defaultDirectory:remote}));await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 await page.locator('.add-employee').click();await page.locator('select[name=group]').selectOption('Cloud')
 await expect(page.locator('select[name=managementRole] option')).toHaveCount(3)
 await page.locator('select[name=managementRole]').selectOption('governor');await expect(page.locator('select[name=workEnvironment]')).toHaveValue('local')
 await page.locator('input[name=title]').fill('Governor');await page.locator('select[name=model]').selectOption('gpt-6-luna');await page.locator('.save-employee').click()
 await expect(page.locator('.office-panel')).toHaveCount(0)
 const card=(await cli('session','list')).sessions.find(c=>c.title==='Governor');assert.equal(card.managementRole,'governor');assert.equal(card.workEnvironment,'local');assert.equal(card.remote,null)
 await expect.poll(async()=>(await cli('session','status','--employee',card.id))[0].initialization.status).toBe('ready')
 await expect(page.locator(`[data-card-id="${card.id}"] .employee-management`)).toHaveText('Governor')
 await cli('view','open','employee','--employee',card.id);await expect(page.locator('.management-role-settings select')).toHaveValue('governor');await expect(page.locator('.global-manager')).toHaveCount(0)
 await expect(page.locator('.management-role-settings')).toContainText('跨 Team')
 await page.locator('.management-role-settings select').selectOption('manager');await expect.poll(async()=>(await cli('session','list')).sessions.find(c=>c.id===card.id).managementRole).toBe('manager')
 await cli('view','close');await page.locator('.add-employee').click();await page.locator('select[name=kind]').selectOption('cloud-native-worker')
 await expect(page.locator('select[name=managementRole] option[value=governor]')).toHaveJSProperty('disabled',true)
 await expect(page.locator('select[name=managementRole] option[value=manager]')).toHaveJSProperty('disabled',true)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS hidden UI: three employee-owned roles, Governor in arbitrary Cloud Team uses a Mac workspace, initialization and badge, user role changes, no inherited-Team checkbox, cloud-native supervisor choices disabled')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
