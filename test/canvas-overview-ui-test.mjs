import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-overview-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'960'}
delete env.ELECTRON_RUN_AS_NODE
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
  await page.locator('.infinite-canvas').waitFor()
  await cli('group','add','Near');await cli('group','add','Far')
  await cli('room','bounds','Near','--x','0','--y','0');await cli('room','bounds','Far','--x','9000','--y','5000')
  await expect(page.locator('.canvas-overview')).toHaveCount(0)
  const toggle=page.getByRole('button',{name:'团队索引'})
  await expect(page.locator('.directory-shared + .directory-overview')).toHaveCount(1)
  await expect(toggle).toHaveAttribute('aria-pressed','false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed','true')
  assert.equal((await cli('settings','get')).showTeamOverview,true)
  await cli('canvas','set','--x','-50000','--y','-50000','--zoom','0.2')
  await expect(page.locator('.canvas-overview-room')).toHaveCount(2)
  await expect(page.locator('.canvas-overview-outside')).toBeVisible()
  await expect(page.locator('.world-room')).toHaveCount(0)
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/canvas-overview-far.png')})
  await page.getByRole('button',{name:'定位 Far'}).click()
  await expect(page.locator('[data-department="Far"]')).toBeVisible()
  await expect.poll(async()=> (await cli('canvas','view')).x).toBeGreaterThan(-20000)
  await cli('canvas','set','--x','-50000','--y','-50000','--zoom','0.2')
  await page.getByRole('button',{name:'定位全部'}).click()
  await expect(page.locator('[data-department="Near"]')).toBeVisible()
  await expect(page.locator('[data-department="Far"]')).toBeVisible()
  await expect(page.locator('.canvas-overview-viewport')).toBeVisible()
  await page.screenshot({path:path.join(root,'artifacts/canvas-overview-fit.png')})
  await cli('team-view','create','--name','Near only','--teams','["Near"]')
  await expect(page.locator('.canvas-overview-room')).toHaveCount(1)
  await expect(page.locator('.canvas-overview-room')).toHaveAttribute('data-team','Near')
  await toggle.click();await expect(page.locator('.canvas-overview')).toHaveCount(0)
  assert.equal((await cli('settings','get')).showTeamOverview,false)
  await cli('settings','set','--team-overview','on');await expect(page.locator('.canvas-overview')).toBeVisible()
  await cli('settings','set','--team-overview','off');await expect(page.locator('.canvas-overview')).toHaveCount(0)
  await assert.rejects(()=>cli('settings','set','--team-overview','maybe'))
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  console.log('PASS persistent Team minimap locates distant rooms, restores an off-map camera and follows the selected Team view')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
