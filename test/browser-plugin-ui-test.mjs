// Hidden native plugin window: real Chromium screenshots become saved home cards.
import fs from'node:fs';import os from'node:os';import path from'node:path';import{createRequire}from'node:module';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-browser-ui-')),target='http://10.92.35.208:8000/',env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_WORKSPACES:temp+'/work',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1',...(process.env.AGENTS_COMPANY_TEST_APP?{}:{AGENTS_COMPANY_PLUGIN_DIRS:root+'/build/plugins/browser'})};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),main=await app.firstWindow();main.setDefaultTimeout(20000)
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:25000})).stdout);assert.ok(result.ok,result.error);return result.data},pages=()=>cli('plugin','call','browser','browser.pages','--team','Browser test'),current=()=>cli('plugin','call','browser','browser.current','--team','Browser test')
let browser
try{
 await main.locator('.infinite-canvas').waitFor();await cli('group','add','Browser test','--mode','work','--plugin','browser')
 const opening=app.waitForEvent('window'),window=await cli('plugin','open','browser','--team','Browser test');browser=await opening;browser.setDefaultTimeout(30000)
 await expect(browser.locator('.browser-app')).toHaveAttribute('data-view','home');await expect(browser.locator('#empty')).toBeVisible()
 await browser.locator('#add-address').fill(target);await browser.locator('#add-address').press('Enter')
 await expect.poll(async()=>(await current()).view,{timeout:25000}).toBe('page')
 await expect.poll(async()=>browser.locator('#page').evaluate(async element=>{try{return await element.executeJavaScript('document.title')}catch{return ''}}),{timeout:30000}).toBe('服务器监控')
 await expect.poll(async()=>browser.locator('#page').evaluate(async element=>{try{return await element.executeJavaScript('document.body.innerText.includes("CPU 使用率")')}catch{return false}}),{timeout:30000}).toBe(true)
 await expect.poll(async()=>(await pages())[0]?.thumbnail,{timeout:20000}).toMatch(/^thumbnail\/.+\.png$/)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'Browser plugin became visible')
 fs.mkdirSync(root+'/artifacts/browser-plugin',{recursive:true});await browser.screenshot({path:root+'/artifacts/browser-plugin/page.png'})
 await browser.locator('#home-button').click();await expect(browser.locator('.browser-app')).toHaveAttribute('data-view','home');await expect(browser.locator('.card')).toHaveCount(1)
 await expect.poll(()=>browser.locator('.preview img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true)
 await browser.getByRole('button',{name:'编辑网页 服务器监控'}).click();await browser.getByRole('textbox',{name:'网页名称'}).fill('Cloud dashboard');await browser.getByRole('textbox',{name:'网页备注'}).fill('GPU host monitor');await browser.locator('.card-editor button[type=submit]').click()
 await expect.poll(async()=>(await pages())[0]?.note).toBe('GPU host monitor');await expect(browser.locator('.card-copy')).toContainText('Cloud dashboard')
 await browser.locator('#add-address').fill(target+'style.css');await browser.locator('#add-address').press('Enter');await expect.poll(async()=>(await pages()).length).toBe(2)
 await browser.locator('#home-button').click();await expect(browser.locator('.card')).toHaveCount(2)
 await browser.screenshot({path:root+'/artifacts/browser-plugin/home.png'})
 await browser.getByRole('button',{name:'打开网页 Cloud dashboard'}).click();await expect.poll(async()=>(await current()).url).toBe(target)
 await cli('plugin','dismiss',window.id);await expect.poll(()=>browser.isClosed()).toBe(true)
 const reopened=app.waitForEvent('window'),again=await cli('plugin','open','browser','--team','Browser test');browser=await reopened
 await expect(browser.locator('.browser-app')).toHaveAttribute('data-view','home');await expect(browser.locator('.card')).toHaveCount(2);await expect(browser.locator('.card-copy').filter({hasText:'Cloud dashboard'})).toContainText('GPU host monitor')
 await browser.getByRole('button',{name:'移除网页 Cloud dashboard'}).click();await expect.poll(async()=>(await pages()).length).toBe(1)
 await cli('plugin','dismiss',again.id);await expect.poll(()=>browser.isClosed()).toBe(true)
 console.log('PASS two real views, rendered thumbnails, name/note editing, CLI data, one-click opening and persistence')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
