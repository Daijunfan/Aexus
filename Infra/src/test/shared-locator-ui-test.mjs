// Real file copies, navigation and camera operations in a disposable company.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),built=await profileApplication(),native=process.argv.includes('--desktop'),out=path.join(root,'.aexus/artifacts/shared-locator',native?'desktop':'web')
fs.mkdirSync(out,{recursive:true})
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-shared-locator-'))),shared=path.join(temp,'shared')
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore({AGENTS_COMPANY_SHARED_DIR:shared,CLINE_BIN:path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),PI_BIN:path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),...(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})},path.join(built.directory,'.aexus/out/main/daemon.js'))
const require=createRequire(import.meta.url),checks=[],errors=[]
let app,browser,page
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
const ok=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
const navigate=args=>page.evaluate(args=>window.agents.call('view.open',args),args)
const same=(a,b)=>fs.existsSync(a)&&fs.existsSync(b)&&fs.readFileSync(a).equals(fs.readFileSync(b))
const shot=name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})
try{
 await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'}}})
 await rpc('group.add',{name:'Design studio',mode:'build'});await rpc('group.add',{name:'Engineering',mode:'build'})
 await rpc('engine.configure',{engine:'claude',patch:{sdkPath:path.join(root,'Infra/src/test/fixtures/discussion-claude-sdk.mjs')}})
 for(const engine of ['cline','pi'])await rpc('engine.configure',{engine,patch:{apiKey:'fixture-no-real-key'}})
 const cards=[]
 for(const engine of ['codex','claude','cline','pi']){const card=await rpc('card.create',{title:engine,group:engine==='codex'?'Design studio':'Engineering',engine});await f.ready(card.id);cards.push(card)}
 await rpc('room.bounds',{name:'Engineering',bounds:{x:9000,y:5000}})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[built.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.infinite-canvas')).toBeVisible()
 const card=cards[0],markdown='# Employee report\n\nMarkdown 文档与共享文件双向传输。\n',sourcePath=path.join(card.cwd,'report.md')
 await rpc('workspace.write',{employee:card.id,path:'report.md',content:markdown,create:true})
 await rpc('workspace.mkdir',{employee:card.id,path:'incoming'})
 await rpc('workspace.mkdir',{employee:card.id,path:'bundle'})
 fs.writeFileSync(path.join(card.cwd,'bundle','image.bin'),crypto.randomBytes(300000))
 await navigate({kind:'conversation',employee:card.id});await expect(page.locator('.employee-files [data-file="report.md"]')).toBeVisible()
 await page.locator('.directory-shared').click();await expect(page.locator('.shared-drawer')).toBeVisible()
 const list=page.locator('[data-asset-id=shared]'),source=page.locator('.employee-files [data-file="report.md"]')
 await source.dragTo(list)
 await expect.poll(()=>same(sourcePath,path.join(shared,'report.md'))).toBe(true)
 await list.click();await expect(page.locator('[data-asset-id="shared|report.md"]')).toBeVisible()
 ok(fs.readFileSync(sourcePath,'utf8')===markdown,'employee Markdown copies into fixed Shared and retains its source')
 await page.locator('[data-asset-id="shared|report.md"]').dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect.poll(()=>same(path.join(shared,'report.md'),path.join(card.cwd,'incoming/report.md'))).toBe(true)
 ok(true,'shared Markdown copies into a selected employee folder')
 await page.locator('.employee-files [data-file="incoming"] .file-open').click()
 await rpc('workspace.write',{shared:true,path:'shared-only.md',content:'# Shared original',create:true});await page.locator('.asset-view-tabs button[title=Refresh]').click()
 const incoming=page.locator('[data-asset-id="shared|shared-only.md"]');await expect(incoming).toBeVisible()
 await incoming.dragTo(page.locator('.employee-files .file-list'),{targetPosition:{x:100,y:290}})
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming/shared-only.md'))).toBe(true)
 ok(!fs.existsSync(path.join(card.cwd,'shared-only.md')),'employee blank area targets its current folder')
 await incoming.dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect(page.locator('.employee-files .workspace-error')).toContainText('同名文件')
 ok(fs.readFileSync(path.join(card.cwd,'incoming/shared-only.md'),'utf8')==='# Shared original','duplicate drop reports an error and preserves the target')
 await rpc('workspace.write',{shared:true,path:'to-root.md',content:'# Root import',create:true});await page.locator('.asset-view-tabs button[title=Refresh]').click()
 const toRoot=page.locator('[data-asset-id="shared|to-root.md"]');await expect(toRoot).toBeVisible()
 await toRoot.dragTo(page.locator('.employee-files [data-drop-folder="."]').first())
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'to-root.md'))).toBe(true)
 ok(true,'shared files copy into the employee root breadcrumb')
 await page.locator('.employee-files [data-file="bundle"]').dragTo(list)
 await expect.poll(()=>same(path.join(card.cwd,'bundle/image.bin'),path.join(shared,'bundle/image.bin'))).toBe(true)
 await expect(page.locator('[data-asset-id="shared|bundle"]')).toBeVisible()
 await page.locator('[data-asset-id="shared|bundle"]').dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect.poll(()=>same(path.join(shared,'bundle/image.bin'),path.join(card.cwd,'incoming/bundle/image.bin'))).toBe(true)
 ok(true,'folders and binary contents round-trip through shared storage')
 await rpc('workspace.mkdir',{shared:true,path:'archive'})
 await page.locator('.asset-view-tabs button[title=Refresh]').click();await expect(page.locator('[data-asset-id="shared|archive"]')).toBeVisible()
 await expect(page.locator('.asset-browser footer')).toContainText('Folders load when expanded');await source.dragTo(page.locator('[data-asset-id="shared|archive"]'))
 await expect.poll(()=>same(sourcePath,path.join(shared,'archive/report.md'))).toBe(true)
 ok(true,'shared tree subfolder accepts employee files')
 await rpc('workspace.write',{employee:card.id,path:'sidebar.md',content:'# Sidebar import',create:true})
 await page.locator('.employee-files [data-file="sidebar.md"]').dragTo(page.locator('.directory-shared'))
 await expect.poll(()=>fs.existsSync(path.join(shared,'sidebar.md'))).toBe(true)
 ok(true,'sidebar shared icon remains a working file drop target')
 await shot('01-shared-roundtrip')
 await page.getByRole('button',{name:'Close shared transfer area',exact:true}).click()
 for(const employee of cards){
  await navigate({kind:'home'});await navigate({kind:'conversation',employee:employee.id});await expect(page.locator('.conversation-dialog')).toBeVisible()
  const composer=page.locator('.composer textarea');await expect(composer).toHaveAttribute('placeholder','Message '+employee.title+'…');await expect(composer).toBeEnabled();await composer.fill('Retained draft for '+employee.engine)
  await composer.press('Escape');await expect(page.locator('.conversation-layer')).toHaveCount(0)
  await expect.poll(async()=>(await rpc('view.get')).kind).toBe('home')
  await navigate({kind:'conversation',employee:employee.id});await expect(composer).toHaveAttribute('placeholder','Message '+employee.title+'…');await expect(composer).toBeEnabled();await expect(composer).toHaveValue('Retained draft for '+employee.engine)
  await composer.fill('');await page.getByRole('button',{name:'Close conversation',exact:true}).click()
  await expect.poll(async()=>(await rpc('view.get')).kind).toBe('home')
  ok(true,employee.engine+' Escape matches Back and preserves the draft')
 }
 await navigate({kind:'conversation',employee:card.id});await expect(source).toBeVisible()
 await page.locator('.employee-files [aria-label="New file"]').click();const filename=page.locator('input[name="file-name"]');await filename.fill('cancelled.md');await filename.press('Escape')
 await expect(filename).toHaveCount(0);await expect(page.locator('.conversation-dialog')).toBeVisible();ok(!fs.existsSync(path.join(card.cwd,'cancelled.md')),'Escape cancels a file-name edit before returning from chat')
 await page.locator('.composer textarea').press('Escape');await expect(page.locator('.conversation-layer')).toHaveCount(0)
 const toggle=page.getByRole('button',{name:'Team overview',exact:true});await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true')
 await rpc('canvas.set',{x:-50000,y:-50000,zoom:.2});await expect(page.locator('.canvas-overview-outside')).toBeVisible()
 await page.getByRole('button',{name:'Locate Engineering',exact:true}).click();await expect(page.locator('[data-department="Engineering"]')).toBeVisible()
 await page.locator('.canvas-overview-teams button').filter({hasText:'Design studio'}).click();await expect(page.locator('[data-department="Design studio"]')).toBeVisible()
 await page.getByRole('button',{name:'Locate all',exact:true}).click();await expect(page.locator('[data-department="Engineering"]')).toBeVisible();await expect(page.locator('[data-department="Design studio"]')).toBeVisible()
 await expect(page.locator('.canvas-overview-viewport')).toBeVisible();ok(true,'map, team list and Locate all move the real camera')
 for(const theme of ['white','black']){await rpc('settings.set',{viewAppearance:{company:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await shot('02-locator-'+theme);await page.locator('.canvas-overview').screenshot({path:path.join(out,'locator-'+theme+'.png'),animations:'disabled'})}
 await page.setViewportSize({width:780,height:820});await shot('03-locator-narrow');const box=await page.locator('.canvas-overview').boundingBox();ok(box.x>=0&&box.x+box.width<=780,'locator stays within a narrow viewport')
 await rpc('team-view.create',{name:'Studio only',teams:['Design studio']});await expect(page.locator('.canvas-overview-room')).toHaveCount(1);await expect(page.locator('.canvas-overview-teams button')).toHaveCount(1)
 await toggle.click();await expect(page.locator('.canvas-overview')).toHaveCount(0);ok((await rpc('settings.get')).showTeamOverview===false,'locator filters by Company view and persists its visibility')
 if(native)ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())),'all Electron windows remained hidden')
 ok(!errors.length,'no renderer errors: '+errors.join('; '))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({platform:process.platform,surface:native?'hidden Electron':'headless Chrome',checks,errors,modelCalls:'deterministic fixtures only'},null,2))
 console.log('PASS '+checks.length+' checks on '+(native?'hidden Electron':'headless Chrome'))
}catch(error){console.error(error);console.log('Transfer diagnostics',await rpc('transfer.list'));if(page)await shot('failure').catch(()=>{});throw error}
finally{await app?.close();await browser?.close();await f.close();built.dispose();fs.rmSync(temp,{recursive:true,force:true})}
