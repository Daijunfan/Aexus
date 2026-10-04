import fs from 'node:fs'
import {createRequire} from 'node:module'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
import {localTunnel} from './fixtures/local-tunnel.mjs'
const native=process.argv.includes('--desktop'),require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),built=await profileApplication(),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-files-ui-'))),shared=path.join(temp,'shared'),remote=path.join(temp,'remote')
fs.mkdirSync(shared);fs.mkdirSync(remote);fs.mkdirSync(path.join(shared,'Reports'));fs.writeFileSync(path.join(shared,'Reports','brief.md'),'# Product brief\nExact source bytes');fs.writeFileSync(path.join(remote,'cloud.md'),'# Cloud original')
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore({AGENTS_COMPANY_SHARED_DIR:shared,AGENTS_COMPANY_TUNNEL_DIR:localTunnel(path.join(temp,'tunnel'),root),AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(built.directory,'out/main/daemon.js'))
let browser,page,app
const out=path.join(root,'artifacts/anexus-files-verification',native?'desktop':'web');fs.mkdirSync(out,{recursive:true})
const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
const invoke=async(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
try{
 await rpc('group.add',{name:'Product',mode:'build'});const card=await f.create('Engineer','Product');await rpc('workspace.write',{employee:card.id,path:'README.md',content:'# Build workspace',create:true})
 const token=await f.token(card.id);assert.equal((await f.request(token,'workspace.reveal',{from:{shared:true,path:'.'}})).ok,false)
 const headless=await f.raw(null,'workspace','reveal','--from',JSON.stringify({shared:true,path:'Reports/brief.md'}));assert.equal(headless.ok,false);assert.match(headless.error,/desktop app/)
 const host=await rpc('host.create',{name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote});await f.cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const remoteResult=await f.request(null,'workspace.reveal',{from:{team:'Cloud',path:'cloud.md'}});assert.equal(remoteResult.ok,false);assert.match(remoteResult.error,/remote host/)
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;delete env.AGENTS_COMPANY_WEB;app=await electron.launch({executablePath:require('electron'),args:[built.directory],env});page=await app.firstWindow();await app.evaluate(({shell})=>{globalThis.revealedFiles=[];shell.showItemInFolder=file=>globalThis.revealedFiles.push(file)})}
 else{browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.locator('.infinite-canvas').waitFor();await invoke('view.shared',{enabled:true});const drawer=page.locator('.asset-browser');await expect(drawer).toBeVisible();await expect(drawer.locator('header strong')).toHaveText('Files and assets')
 const separator=drawer.getByRole('separator',{name:'Resize files and assets'});const start=await separator.boundingBox();await page.mouse.move(start.x+start.width/2,start.y+100);await page.mouse.down();await page.mouse.move(start.x+123,start.y+100,{steps:10});await page.mouse.up();await expect.poll(async()=>(await invoke('settings.get')).assetDrawerWidth).toBeGreaterThan(400)
 await separator.focus();await page.keyboard.press('Home');await expect.poll(async()=>(await invoke('settings.get')).assetDrawerWidth).toBe(260);await page.keyboard.press('End');await expect.poll(async()=>(await invoke('settings.get')).assetDrawerWidth).toBe(600);await invoke('settings.set',{assetDrawerWidth:440});await page.reload();await expect(drawer).toBeVisible();await expect.poll(async()=>Math.round((await drawer.boundingBox()).width)).toBe(440)
 await drawer.locator('[data-asset-id=shared]').click();await drawer.locator('[data-asset-id="shared|Reports"]').click();const file=drawer.locator('.asset-row').filter({has:page.locator('[data-asset-id="shared|Reports%2Fbrief.md"]')});await file.getByRole('button',{name:'Show in folder: brief.md',exact:true}).click()
 const overlay=page.locator('.asset-workspace-overlay');await expect(overlay).toBeVisible();await expect(overlay.getByRole('textbox',{name:'File content',exact:true})).toHaveValue('# Product brief\nExact source bytes')
 await expect(overlay.getByRole('button',{name:'Open current folder in Finder',exact:true})).toHaveCount(native?1:0)
 if(native){await overlay.getByRole('button',{name:'Open in Finder: brief.md',exact:true}).click();assert.equal((await app.evaluate(()=>globalThis.revealedFiles)).at(-1),path.join(shared,'Reports','brief.md'))}
 await overlay.getByRole('button',{name:'Back to files',exact:true}).click();await expect(overlay).toHaveCount(0)
 await expect(drawer.getByRole('button',{name:'Open in Finder: Company',exact:true})).toHaveCount(0);await expect(drawer.getByRole('button',{name:'Open folder: Shared',exact:true})).toHaveCount(1)
 const download=async(row,name)=>{await row.getByRole('button',{name:'Actions for '+name,exact:true}).click();await page.getByRole('menuitem',{name:'Download file',exact:true}).click()}
 if(native){const destination=path.join(temp,'download.md');await app.evaluate(({dialog},destination)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:destination})},destination);await download(file,'brief.md');await expect.poll(()=>fs.existsSync(destination)).toBe(true);assert.equal(fs.readFileSync(destination,'utf8'),fs.readFileSync(path.join(shared,'Reports','brief.md'),'utf8'));await expect.poll(async()=>(await app.evaluate(()=>globalThis.revealedFiles)).at(-1)).toBe(destination)}
 else{const pending=page.waitForEvent('download');await download(file,'brief.md');const result=await pending;const destination=path.join(temp,'download.md');await result.saveAs(destination);assert.equal(fs.readFileSync(destination,'utf8'),fs.readFileSync(path.join(shared,'Reports','brief.md'),'utf8'))}
 await drawer.locator('.asset-view-tabs button').nth(1).click();await drawer.locator('.asset-search input').fill('cloud.md');const cloudRow=drawer.locator('.asset-row').filter({has:page.locator('.asset-name strong',{hasText:'cloud.md'})});await expect(cloudRow).toHaveCount(1)
 const remoteCopy=path.join(temp,'cloud-copy.md')
 if(native){await app.evaluate(({dialog},destination)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:destination})},remoteCopy);await download(cloudRow,'cloud.md');await expect.poll(()=>fs.existsSync(remoteCopy)).toBe(true);await expect.poll(async()=>(await app.evaluate(()=>globalThis.revealedFiles)).at(-1)).toBe(remoteCopy)}
 else{const pending=page.waitForEvent('download');await download(cloudRow,'cloud.md');await(await pending).saveAs(remoteCopy)}
 assert.equal(fs.readFileSync(remoteCopy,'utf8'),fs.readFileSync(path.join(remote,'cloud.md'),'utf8'));await drawer.locator('.asset-search input').fill('');await drawer.locator('.asset-view-tabs button').first().click()
 for(const id of ['messages','plan','company']){await invoke('view.select',{id});await expect(drawer).toBeVisible();await expect.poll(async()=>Math.round((await drawer.boundingBox()).width)).toBe(440);await expect(drawer.getByRole('button',{name:'Open folder: Shared',exact:true})).toHaveCount(1)}
 await page.screenshot({path:path.join(out,'files.png')});assert.deepEqual(errors,[]);if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,surface:native?'hidden Electron':'headless Chrome',checks:['authenticated CLI path','employee denial','remote boundary','headless error','physical entry in-app folder location',...(native?['actual Electron shell callback with isolated path']:['browser never advertises unsupported Finder']),'virtual categories never advertise Finder','file workspace actions','local and remote download exact bytes','pointer and keyboard resize','persisted after reload and across all main views'],errors},null,2));console.log('PASS Files reveal and resize: '+(native?'hidden Electron':'headless Chrome'))
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:path.join(out,'failure.png')});console.log((await page.locator('body').innerText()).slice(-5000))}throw error}finally{await app?.close();await browser?.close();await f.close();built.dispose();fs.rmSync(temp,{recursive:true,force:true})}
