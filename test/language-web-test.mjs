import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),out=path.join(f.root,'artifacts/interface-language');fs.mkdirSync(out,{recursive:true});let browser
try{
 await f.cli('group','add','Messages');await f.create('Inbox','Messages')
 browser=await chromium.launch({...(process.env.AGENTS_BROWSER_CHANNEL?{channel:process.env.AGENTS_BROWSER_CHANNEL}:process.platform==='darwin'?{channel:'chrome'}:{}),headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const url='http://127.0.0.1:'+port
 await page.goto(url);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click();await expect(page.locator('.infinite-canvas')).toBeVisible()
 const second=await context.newPage();await second.goto(url);await expect(second.locator('.infinite-canvas')).toBeVisible();second.on('pageerror',error=>errors.push(error.message))
 await page.getByRole('button',{name:'Application settings',exact:true}).click();await page.getByRole('dialog',{name:'Application settings',exact:true}).getByRole('button',{name:'Interface language',exact:true}).click();await page.getByRole('option',{name:'简体中文',exact:true}).click()
 await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await expect(second.locator('html')).toHaveAttribute('lang','zh-CN');assert.equal((await f.cli('settings','get')).language,'zh-CN')
 await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.getByRole('button',{name:'消息',exact:true}).click();await page.getByRole('button',{name:'与 Inbox 对话',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Inbox')
 await page.screenshot({animations:'disabled',path:path.join(out,'web-zh-desktop.png')});await page.setViewportSize({width:390,height:900});await expect(page.getByRole('button',{name:'返回会话列表',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:path.join(out,'web-zh-mobile.png')})
 await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await expect(page.getByRole('button',{name:'消息',exact:true})).toBeVisible()
 // Non-React host UI follows the same locale without translating folder names.
 const chooser=second.evaluate(()=>window.agents.call('workspace.choose',{}));await expect(second.getByRole('dialog',{name:'选择后端主机文件夹',exact:true})).toBeVisible();await f.cli('settings','set','--language','en');await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(second.getByRole('dialog',{name:'Choose a Core-host folder',exact:true})).toBeVisible();await second.getByRole('dialog',{name:'Choose a Core-host folder'}).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await chooser).path,null)
 assert.equal(await page.evaluate(()=>localStorage.getItem('agents-company-token')),null);assert.deepEqual(errors,[])
 console.log('PASS bilingual Web: authenticated language selector, Core persistence, live synchronization across independent tabs, reload, Chinese 390px layout, unchanged employee/team names, live folder-dialog labels, and no token stored in localStorage')
}finally{await browser?.close();await f.close()}
