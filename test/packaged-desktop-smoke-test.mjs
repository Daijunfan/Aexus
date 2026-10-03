// Test a built desktop executable against disposable state, never the installed user's Core.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import { _electron as electron,expect } from '@playwright/test'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const executable=process.env.AGENTS_COMPANY_TEST_APP
if(!executable||!fs.existsSync(executable))throw Error('Set AGENTS_COMPANY_TEST_APP to the built desktop executable')
const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'agents-package-')))
const output=path.resolve(process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'artifacts','packaged-desktop-'+process.platform))
fs.mkdirSync(output,{recursive:true})
const fixture=path.join(temporary,'fixture');fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'release-all'),'')
const env={...process.env,CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temporary,'codex'),AC_INIT_FIXTURE:fixture,AGENTS_COMPANY_HOME:path.join(temporary,'state'),AGENTS_COMPANY_PROJECTS:path.join(temporary,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1050'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_WEB_URL','AGENTS_COMPANY_URL','AGENTS_COMPANY_WORKSPACES','AGENTS_COMPANY_BUILTIN_PLUGINS','AGENTS_COMPANY_PLUGIN_DIRS','AGENTS_COMPANY_CLIENT'].includes(key))delete env[key]
if(process.platform==='win32')env.AGENTS_COMPANY_OFFSCREEN='1'
let app
const checks=[],errors=[]
try{
  app=await electron.launch({executablePath:executable,args:[],env})
  const page=await app.firstWindow();page.setDefaultTimeout(20000)
  page.on('pageerror',error=>errors.push(error.message))
  await page.locator('.infinite-canvas').waitFor()
  const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
  const plugins=await call('plugin.list')
  const lock=JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8')).plugins
  assert.equal(plugins.length,3)
  for(const item of lock){const id=item.directory==='mini-notion'?'mininotion':item.directory;assert.equal(plugins.find(p=>p.id===id)?.version,item.version)}
  checks.push('All three exact plugin versions bundled')
  await call('group.add',{name:'Package Verification',mode:'build'})
  const worker=await call('card.create',{title:'Package Employee',group:'Package Verification',engine:'codex',model:'gpt-6-luna',effort:'low',managementRole:'employee',character:'英雄王',avatarStyle:'chibi',profession:'验收'})
  await expect.poll(async()=>{const status=(await call('session.status',{employee:worker.id}))[0];if(status.initialization?.status==='failed')throw Error(status.initialization.error);return status.initialization?.status},{timeout:20000}).toBe('ready')
  await page.locator(`[data-card-id="${worker.id}"]`).first().waitFor()
  assert.equal((await call('session.status',{employee:worker.id}))[0].title,'Package Employee')
  assert.equal(worker.avatar,'fate-gilgamesh-chibi')
  const pet=page.locator(`[data-card-id="${worker.id}"] .fate-pet`).first()
  await pet.waitFor();assert.equal(await pet.getAttribute('data-avatar'),'fate-gilgamesh-chibi')
  await pet.locator('.pet-cell').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw Error('Avatar sprite did not load')})
  await page.locator(`[data-card-id="${worker.id}"]`).first().screenshot({path:path.join(output,'gilgamesh.png')})
  checks.push('Named character API resolves Gilgamesh chibi and the installed renderer loads its actual sprite')
  checks.push('Packaged Core creates and initializes an employee through a deterministic native protocol fixture; no provider request')
  const terminal=await call('terminal.open',{employee:worker.id,cols:90,rows:24})
  await call('terminal.input',{id:terminal.id,data:process.platform==='win32'?"Write-Output ('PACKAGE_'+'PTY_OK')\r":"printf 'PACKAGE_%s\\n' PTY_OK\n"})
  let terminalReady=false
  for(let attempt=0;attempt<100;attempt++){const state=await call('terminal.read',{id:terminal.id});if(state.output.includes('PACKAGE_PTY_OK')){terminalReady=true;break}await new Promise(resolve=>setTimeout(resolve,100))}
  assert.ok(terminalReady,'Packaged terminal produced no confirmed output')
  await call('terminal.resize',{id:terminal.id,cols:100,rows:30});await call('terminal.close',{id:terminal.id})
  checks.push('Packaged native terminal input, output, resize and cleanup')
  await page.screenshot({path:path.join(output,'office.png')})
  const exported=await call('ui.screenshot',{path:path.join(output,'office-private.png'),privacy:true})
  assert.equal(exported.privacy,true,'Core must forward the screenshot privacy option')
  assert.equal(await page.locator('.team-root-label').first().evaluate(el=>getComputedStyle(el).visibility),'visible','Privacy export must restore the live UI')
  checks.push('Privacy screenshot option reaches the desktop and restores live labels')
  for(const plugin of plugins){
    const team='Package '+plugin.id
    await call('group.add',{name:team,mode:'work',pluginId:plugin.id})
    const store=await call('session.list'),workspace=store.teamRoots[team]
    assert.ok(path.resolve(workspace).startsWith(path.resolve(env.AGENTS_COMPANY_HOME)+path.sep),'Release workspaces must not depend on a developer checkout: '+workspace)
    const pending=app.waitForEvent('window')
    const opened=await call('plugin.open',{id:plugin.id,team})
    const child=await pending;child.on('pageerror',error=>errors.push(error.message));await child.waitForLoadState('domcontentloaded')
    await child.locator('body').waitFor();assert.ok((await child.locator('body').innerText()).trim().length>0)
    await child.screenshot({path:path.join(output,plugin.id+'.png')})
    await call('plugin.dismiss',{id:opened.id})
    checks.push(plugin.id+': portable workspace, actual plugin window and save/close lifecycle')
  }
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  assert.deepEqual(errors,[])
  const report={platform:process.platform,version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,executable,checks,rendererErrors:errors,modelCalls:0,productionDataUsed:false}
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n')
  console.log('PASS '+JSON.stringify(report))
}finally{await app?.close();fs.rmSync(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
