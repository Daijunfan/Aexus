import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-views-ui-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'960'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const errors=[];page.on('pageerror',error=>errors.push(error.message))
try{
 await page.locator('.infinite-canvas').waitFor()
 for(const name of ['Alpha','Beta'])await cli('group','add',name)
 await expect(page.locator('.team-view-tabs button.active')).toHaveText('All Team')
 await page.getByRole('button',{name:'添加视图'}).click()
 const dialog=page.getByRole('dialog',{name:'添加视图'});await expect(dialog).toBeVisible()
 await dialog.getByLabel('视图名称').fill('Focus')
 await dialog.locator('label').filter({hasText:'Alpha'}).locator('input[type=checkbox]').check()
 await dialog.getByRole('button',{name:'保存视图'}).click()
 await expect(page.locator('.team-view-tabs button.active')).toHaveText('Focus')
 await expect(page.locator('[data-department="Alpha"]')).toHaveCount(1)
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(0)
 await page.locator('.team-view-tabs').getByRole('button',{name:'All Team'}).click()
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(1)
 await page.locator('.team-view-tabs').getByRole('button',{name:'Focus'}).click()
 await page.getByRole('button',{name:'编辑当前视图'}).click()
 const edit=page.getByRole('dialog',{name:'编辑视图'})
 await edit.getByLabel('视图名称').fill('Focus Two')
 await edit.locator('label').filter({hasText:'Beta'}).locator('input[type=checkbox]').check()
 await edit.getByRole('button',{name:'保存视图'}).click()
 await expect(page.locator('.team-view-tabs button.active')).toHaveText('Focus Two')
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(1)
 await page.screenshot({path:path.join(root,'artifacts/team-views.png')})
 const views=await cli('team-view','list');assert.deepEqual(views.views[1].teams,['Alpha','Beta'])
 await page.getByRole('button',{name:'编辑当前视图'}).click()
 await page.getByRole('dialog',{name:'编辑视图'}).getByRole('button',{name:'删除视图'}).click()
 await expect(page.locator('.team-view-tabs button.active')).toHaveText('All Team')
 assert.deepEqual(await cli('group','list'),['Alpha','Beta'])
 assert.equal(Math.round((await page.locator('.company-header').boundingBox()).height),52)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 assert.deepEqual(errors,[])
 console.log('PASS hidden Team-view UI: top-bar creation, Team filtering, editing, removal and All Team fallback; no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
