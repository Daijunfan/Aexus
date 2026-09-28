// Cloud hiring through the actual form. Private Core, fake engines and SSH only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=process.cwd(),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloud-form-'))),bin=path.join(temp,'bin');fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('node:child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}\n`,{mode:0o755})
const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CLINE_BIN:path.join(root,'test/fixtures/process-adapter.cjs'),PI_BIN:path.join(root,'test/fixtures/process-adapter.cjs'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),PYTHONDONTWRITEBYTECODE:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
try{
 await page.locator('.infinite-canvas').waitFor()
 const remote=path.join(temp,'remote');fs.mkdirSync(remote)
 const host=await call('host.create',{name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote})
 await call('group.add',{name:'Cloud',mode:'cloud',hostId:host.id,directory:remote})
 await call('group.add',{name:'Local',mode:'build'})
 await call('group.add',{name:'Plugin',mode:'work',pluginId:'margin-reader'})
 await call('card.create',{title:'Legacy',group:'Local',engine:'codex',avatar:'clawd'})
 for(const engine of ['cline','pi']){
  await call('engine.configure',{engine,patch:{apiKey:'fixture-not-real'}})
  await page.locator('.add-employee').click()
  await expect(page.locator('.avatar-options button')).toHaveCount(15)
  await expect(page.locator('.avatar-options [data-avatar=clawd]')).toHaveCount(0)
  await expect(page.locator('.avatar-options button.selected .mascot')).toHaveAttribute('data-avatar','fireball')
  await page.locator('select[name=group]').selectOption('Cloud')
  const option=page.locator(`.engine-choices [data-engine=${engine}]`)
  await expect(option).toBeEnabled();await option.click()
  await page.locator('input[name=title]').fill(engine+' Cloud')
  await page.locator('select[name=kind]').selectOption('cloud-native-worker')
  await expect(option).toBeDisabled();await expect(page.locator('.save-employee')).toBeDisabled()
  await page.locator('select[name=kind]').selectOption('worker')
  await expect(option).toBeEnabled();await expect(page.locator('.save-employee')).toBeEnabled()
  await page.locator('select[name=group]').selectOption('Plugin')
  await expect(option).toBeDisabled();await expect(page.locator('.save-employee')).toBeDisabled()
  await page.locator('select[name=group]').selectOption('Cloud')
  await expect(option).toBeEnabled();await expect(page.locator('select[name=workEnvironment]')).toHaveValue('team')
  await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0)
  const card=(await call('session.list')).sessions.find(c=>c.title===engine+' Cloud')
  assert.ok(card);assert.equal(card.engine,engine);assert.equal(card.kind,'worker');assert.equal(card.managementRole,'employee')
  assert.equal(card.cwd,path.join(remote,engine+' Cloud'));assert.equal(card.remote.host,'fixture')
  assert.ok(fs.statSync(card.cwd).isDirectory());assert.equal(card.initialization.status,'ready')
 }
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS actual Cloud form hiring for Pi/Cline, shared target guards, no host fallback, 15 retained avatars and retired-template fallback')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
