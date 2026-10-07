import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),desktopHome=path.join(f.temp,'desktop-only')
let app
try{
  await f.cli('group','add','Remote Core');await f.create('Remote Employee','Remote Core')
  const token=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
  const env={...process.env,AGENTS_COMPANY_HOME:desktopHome,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WEB_URL:'http://127.0.0.1:'+port};delete env.ELECTRON_RUN_AS_NODE
  app=await electron.launch({args:[path.join(f.root,'.aexus/out/main/index.js')],env})
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.locator('.web-login input').fill(token);await page.getByRole('button',{name:'Enter workspace'}).click()
  await expect(page.locator('.employee')).toHaveCount(1)
  assert.equal(await page.evaluate(()=>window.agents.mode),'web')
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox),true)
  assert.equal(await page.evaluate(()=>window.agents.filePath(new File(['x'],'local.txt'))),'')
  assert.equal(fs.existsSync(path.join(desktopHome,'control.token')),false)
  assert.equal(fs.existsSync(path.join(desktopHome,'sessions.json')),false)
  await page.locator('[data-plugin="mininotion"]').click()
  const plugin=page.locator('.web-plugin-window');await expect(plugin).toBeVisible()
  await expect(plugin.frameLocator('iframe').locator('body')).not.toBeEmpty()
  await plugin.locator('header button').last().click();await expect(plugin).toHaveCount(0)
  const output=path.join(f.root,'.aexus/artifacts/opensource-tests-0.49.0');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'remote-desktop.png')})
  await app.close();app=undefined
  assert.equal((await f.cli('status')).running,true,'Closing the remote shell must not stop the Core')
  assert.deepEqual(errors,[])
  console.log('PASS sandboxed remote Electron shell, no local Core/token/filesystem authority, same office and plugin save lifecycle, backend survives shell close')
}finally{await app?.close();await f.close()}
