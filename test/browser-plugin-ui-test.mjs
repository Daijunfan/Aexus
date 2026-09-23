// Hidden native plugin window: verify the actual Chromium guest renders the target page.
import fs from'node:fs';import os from'node:os';import path from'node:path';import{createRequire}from'node:module';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-browser-ui-')),target='http://10.92.35.208:8000/',env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_WORKSPACES:temp+'/work',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1',...(process.env.AGENTS_COMPANY_TEST_APP?{}:{AGENTS_COMPANY_PLUGIN_DIRS:root+'/build/plugins/browser'})};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),main=await app.firstWindow();main.setDefaultTimeout(20000)
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:25000})).stdout);assert.ok(result.ok,result.error);return result.data}
let browser
try{
 await main.locator('.infinite-canvas').waitFor();await cli('group','add','Browser test','--mode','work','--plugin','browser')
 assert.ok((await cli('plugin','list')).some(p=>p.id==='browser'))
 const opening=app.waitForEvent('window'),window=await cli('plugin','open','browser','--team','Browser test');browser=await opening;browser.setDefaultTimeout(30000)
 await expect(browser.locator('#address')).toBeVisible();assert.equal(await browser.locator('#page').count(),1)
 await browser.locator('#address').fill(target);await browser.locator('#address').press('Enter')
 await expect.poll(async()=>(await cli('plugin','call','browser','browser.current','--team','Browser test')).url,{timeout:25000}).toBe(target)
 const read=await cli('plugin','call','browser','browser.read','--team','Browser test');assert.equal(read.status,200);assert.equal(read.title,'服务器监控');assert.ok(read.text.includes('CPU 使用率'))
 await expect.poll(async()=>browser.locator('#page').evaluate(async element=>{try{return await element.executeJavaScript('document.title')}catch{return ''}}),{timeout:30000}).toBe('服务器监控')
 await expect.poll(async()=>browser.locator('#page').evaluate(async element=>{try{return await element.executeJavaScript('document.body.innerText.includes("CPU 使用率")')}catch{return false}}),{timeout:30000}).toBe(true)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'Browser plugin window became visible')
 fs.mkdirSync(root+'/artifacts/browser-plugin',{recursive:true});await browser.screenshot({path:root+'/artifacts/browser-plugin/target.png'});
 await browser.locator('#save-bookmark').click();await expect.poll(async()=>(await cli('plugin','call','browser','browser.bookmarks','--team','Browser test')).length).toBe(1)
 await expect(browser.locator('#save-bookmark')).toHaveAttribute('aria-label','取消收藏当前网页')
 await cli('plugin','call','browser','browser.open','--team','Browser test','--params',JSON.stringify({url:target+'style.css'}));await expect.poll(()=>browser.locator('#address').inputValue(),{timeout:10000}).toContain('style.css')
 await browser.locator('#save-bookmark').click();await expect.poll(async()=>(await cli('plugin','call','browser','browser.bookmarks','--team','Browser test')).length).toBe(2)
 await browser.locator('#bookmarks').click();await expect(browser.locator('#bookmark-list .bookmark-row')).toHaveCount(2)
 await browser.screenshot({path:root+'/artifacts/browser-plugin/bookmarks.png'})
 await browser.getByRole('button',{name:'打开收藏 服务器监控'}).click();await expect.poll(async()=>(await cli('plugin','call','browser','browser.current','--team','Browser test')).url).toBe(target)
 await cli('plugin','dismiss',window.id);await expect.poll(()=>browser.isClosed()).toBe(true)
 const reopened=app.waitForEvent('window'),again=await cli('plugin','open','browser','--team','Browser test');browser=await reopened
 await browser.locator('#bookmarks').click();await expect(browser.locator('#bookmark-list .bookmark-row')).toHaveCount(2)
 const extra=await cli('plugin','call','browser','browser.bookmark.add','--team','Browser test','--params',JSON.stringify({url:'https://example.com/','title':'CLI added'}))
 await expect.poll(()=>browser.locator('#bookmark-list .bookmark-row').count(),{timeout:10000}).toBe(3)
 await browser.getByRole('button',{name:'移除收藏 CLI added'}).click();await expect.poll(async()=>(await cli('plugin','call','browser','browser.bookmarks','--team','Browser test')).some(item=>item.id===extra.id)).toBe(false)
 await browser.getByRole('button',{name:'移除收藏 服务器监控'}).click();await expect.poll(async()=>(await cli('plugin','call','browser','browser.bookmarks','--team','Browser test')).length).toBe(1)
 await cli('plugin','dismiss',again.id);await expect.poll(()=>browser.isClosed()).toBe(true)
 console.log('PASS hidden Chromium rendering, two persistent one-click bookmarks, CLI/UI navigation and removal')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
