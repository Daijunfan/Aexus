// Real HTTP/Core operations with deliberately delayed responses; no production state.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {assetWorkbenchFixture} from './fixtures/asset-workbench.mjs'
const root=path.resolve(import.meta.dirname,'..'),application=await profileApplication(),out=path.join(root,'artifacts/files-workbench/recovery');fs.mkdirSync(out,{recursive:true})
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));let f,browser,page;const checks=[],errors=[]
const check=text=>{checks.push(text);console.log('PASS '+text)}
try{
 f=await assetWorkbenchFixture(application.directory,{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})
 for(const [name,content] of [['race-a.txt','first original'],['race-b.txt','second original']])await f.rpc('assets.file',{id:'shared',operation:'write',path:name,content,create:true});await f.settled()
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click();await page.locator('.infinite-canvas').waitFor();await page.locator('.directory-shared').click()
 const drawer=page.locator('.asset-browser'),preview=page.getByRole('dialog',{name:'Asset workspace',exact:true}),search=drawer.getByRole('textbox',{name:'Search assets',exact:true}),editor=preview.getByRole('textbox',{name:'File content',exact:true})
 let delayedRead=false,delayedWrite=false,failFolder=false,delayedSearch=false,delayedLocate=false,writeCount=0,releaseRead,releaseWrite,releaseSearch,releaseLocate
 await page.route('**/api/rpc',async route=>{const request=route.request().postDataJSON(),args=request.args??{}
  if(request.cmd==='assets.children'&&args.id==='shared|Documents'&&failFolder){failFolder=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Fixture folder interrupted'})});return}
  const pauseRead=request.cmd==='assets.file'&&args.operation==='read'&&args.path==='race-a.txt'&&delayedRead
  const pauseWrite=request.cmd==='assets.file'&&args.operation==='write'&&args.path==='race-b.txt'&&delayedWrite
  const pauseSearch=request.cmd==='assets.browse'&&args.query==='race-a'&&delayedSearch
  const pauseLocate=request.cmd==='assets.locate'&&String(args.id).includes('race-a')&&delayedLocate
  if(request.cmd==='assets.file'&&args.operation==='write'&&args.path==='race-b.txt')writeCount++
  if(pauseRead||pauseWrite||pauseSearch||pauseLocate){if(pauseRead)delayedRead=false;if(pauseWrite)delayedWrite=false;if(pauseSearch)delayedSearch=false;if(pauseLocate)delayedLocate=false;const response=await route.fetch();await new Promise(resolve=>{if(pauseRead)releaseRead=resolve;else if(pauseWrite)releaseWrite=resolve;else if(pauseSearch)releaseSearch=resolve;else releaseLocate=resolve});await route.fulfill({response});return}
  await route.continue()
 })
 await drawer.getByRole('button',{name:'Open folder: Shared',exact:true}).click();await expect(preview).toBeVisible();delayedRead=true;await preview.locator('[data-file="race-a.txt"] .file-open').click();await expect.poll(()=>!!releaseRead).toBe(true);await preview.locator('[data-file="race-b.txt"] .file-open').click();await expect(editor).toHaveValue('second original');releaseRead();await expect(editor).toHaveValue('second original');await expect(preview.locator('.file-preview header')).toContainText('race-b.txt')
 check('A delayed old-file read cannot overwrite a newer file selected in the same directory')
 await editor.fill('saved once');delayedWrite=true;await preview.getByRole('button',{name:'Save file',exact:true}).click();await expect.poll(()=>!!releaseWrite).toBe(true);await preview.getByRole('button',{name:'Back to files',exact:true}).click();await expect(preview).toBeVisible();assert.equal(writeCount,1);releaseWrite();await expect(preview).toHaveCount(0);assert.equal(fs.readFileSync(path.join(f.shared,'race-b.txt'),'utf8'),'saved once');assert.equal(writeCount,1)
 check('Clicking Save then Back during an in-flight write waits for one save instead of duplicating or losing it')
 await search.fill('race-b');await drawer.getByRole('button',{name:'Show in folder: race-b.txt',exact:true}).click();await expect(editor).toHaveValue('saved once');await editor.fill('keep this local draft');await f.rpc('assets.file',{id:'shared',operation:'write',path:'race-b.txt',content:'external change'})
 await preview.getByRole('button',{name:'Save file',exact:true}).click();await expect(preview.locator('.workspace-error')).toBeVisible();await expect(editor).toHaveValue('keep this local draft');assert.equal(fs.readFileSync(path.join(f.shared,'race-b.txt'),'utf8'),'external change');await preview.getByRole('button',{name:'Reload file',exact:true}).click();await expect(editor).toHaveValue('external change');await preview.getByRole('button',{name:'Back to files',exact:true}).click()
 check('A conflicting external file edit preserves the local draft and disk version until explicit reload')
 await search.fill('');await drawer.getByRole('button',{name:'Files',exact:true}).click();await drawer.locator('[data-asset-id=shared]').click();failFolder=true;await drawer.locator('[data-asset-id="shared|Documents"]').click();await expect(drawer.getByRole('button',{name:'Retry folder: Documents',exact:true})).toBeVisible();await drawer.getByRole('button',{name:'Retry folder: Documents',exact:true}).click();await expect(drawer.locator('[data-asset-id="shared|Documents%2F100%25_plan.md"]')).toBeVisible();await expect(drawer.getByRole('button',{name:'Retry folder: Documents',exact:true})).toHaveCount(0)
 check('A failed folder request is visible and retryable; it does not become a permanent empty directory')
 delayedSearch=true;await search.fill('race-a');await expect.poll(()=>!!releaseSearch).toBe(true);await search.fill('race-b');await expect(drawer.locator('.asset-list-row')).toHaveCount(1);await expect(drawer.locator('.asset-list-row')).toContainText('race-b.txt');releaseSearch();await expect(drawer.locator('.asset-list-row')).toHaveCount(1);await expect(drawer.locator('.asset-list-row')).toContainText('race-b.txt')
 await f.rpc('assets.file',{id:'shared',operation:'trash',path:'race-b.txt'});await drawer.getByRole('button',{name:'Show in folder: race-b.txt',exact:true}).click();await expect(drawer.getByRole('alert')).toContainText('File no longer exists');await drawer.getByRole('button',{name:'Retry',exact:true}).click();await expect(drawer.locator('.asset-list-row')).toHaveCount(0)
 check('Late search results cannot replace the current query; deleted files give a refreshable location error')
 await search.fill('race-a');await expect(drawer.locator('.asset-list-row')).toHaveCount(1)
 await drawer.locator('.asset-entry').evaluate(node=>{window.stableAssetNode=node;window.assetDisconnected=false;window.assetObserver=new MutationObserver(()=>{if(!node.isConnected)window.assetDisconnected=true});window.assetObserver.observe(node.closest('.asset-scroll'),{childList:true,subtree:true})})
 const refreshed=page.waitForResponse(response=>{if(!response.url().endsWith('/api/rpc'))return false;const body=response.request().postDataJSON();return body?.cmd==='assets.browse'&&body.args?.query==='race-a'&&body.args?.limit===60});await drawer.getByRole('button',{name:'Refresh files',exact:true}).click();await refreshed
 assert.ok(await page.evaluate(()=>{window.assetObserver.disconnect();return window.stableAssetNode.isConnected&&!window.assetDisconnected}),'Refreshing the same query keeps the original row mounted')
 check('Background refresh retains the current file row instead of blanking and flashing the list')
 delayedLocate=true;await drawer.getByRole('button',{name:'Show in folder: race-a.txt',exact:true}).click();await expect.poll(()=>!!releaseLocate).toBe(true);await drawer.getByRole('button',{name:'Close shared transfer area',exact:true}).click();releaseLocate();await expect(drawer).toHaveCount(0);await expect(preview).toHaveCount(0)
 check('A late folder-location response cannot reopen a dismissed file workspace')
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,errors,scope:'Real HTTP/Core with response-delay and one injected transport-error fixture',paidModels:0,productionDataUsed:false},null,2))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await browser?.close();await f?.close();application.dispose()}
