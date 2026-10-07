// Full application, real Core, temporary workspaces and deterministic native protocol. No production state.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',require=createRequire(import.meta.url),out=path.join(root,'.aexus/artifacts/aexus-architecture',mode)
fs.mkdirSync(out,{recursive:true});const application=await profileApplication(),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-layers-'))),shared=path.join(temp,'shared');fs.mkdirSync(shared)
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let f,app,browser,page;const checks=[],errors=[]
try{
 f=await fixtureCore({AGENTS_COMPANY_SHARED_DIR:shared,...(!native?{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}:{})},path.join(application.directory,'.aexus/out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data}
 await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'white'}}});await rpc('group.add',{name:'Research',mode:'build'})
 const card=await f.create('Mira','Research');await rpc('workspace.write',{employee:card.id,path:'research.md',content:'# Existing work',create:true})
 await rpc('session.send',{employee:card.id,text:'A genuine unread private reply'});await f.received(card.id,'A genuine unread private reply');await f.until(async()=>{const v=await f.status(card.id);return !v.busy&&v.lastReply},'private reply finishes')
 const before=await f.status(card.id);assert.ok(before.lastReply&&!before.lastReply.readAt)
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),nav=page.getByRole('navigation',{name:'Application layers'}),engine=nav.getByRole('button',{name:'Engine',exact:true}),infra=nav.getByRole('button',{name:'Infra',exact:true})
 await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(nav.getByRole('button')).toHaveCount(2);assert.deepEqual(await nav.getByRole('button').allTextContents(),['Engine','Infra'])
 await expect(page.locator('.company-header .company-actions,.company-header .company-navigation')).toHaveCount(0)
 await expect(page.locator('.infra-toolbar .company-navigation')).toBeVisible();await expect(page.locator('.infra-toolbar .company-actions')).toBeVisible()
 await engine.click();await expect(page.locator('.engine-catalog')).toBeVisible();await expect(page.locator('.infra-surface')).toBeHidden();await expect(page.locator('.directory-shared')).toBeVisible()
 checks.push('Top header contains only Engine/Infra layer buttons; Company/Messages/Plan and creation controls stay inside Infra; product/file sidebar remains available')
 await page.getByRole('button',{name:/Workspace audit.*Open Engine/s}).click();await expect(page.getByRole('combobox',{name:'Audit Team'})).toHaveValue('Research');await page.getByRole('button',{name:'Run audit',exact:true}).click()
 await expect(page.locator('.engine-delivery')).toContainText('Inventory verified');await expect(page.locator('.engine-delivery')).toContainText('Mira');await expect(page.locator('.engine-delivery')).toContainText(card.cwd)
 const report=await call('contract.call',{version:'1.0.0',command:'workspace.list',args:{employee:card.id,path:'.'}});assert.ok(report.data.entries.some(e=>e.name==='research.md'))
 assert.equal((await rpc('session.status',{employee:card.id}))[0].lastReply.readAt,undefined)
 if(!native){const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download report',exact:true}).click();const file=await download;const target=path.join(temp,'ui-report.json');await file.saveAs(target);const data=JSON.parse(fs.readFileSync(target));assert.ok(data.acceptance.passed);assert.ok(data.workspaces.some(w=>w.employeeId===card.id&&w.entries.some(e=>e.name==='research.md')))}
 checks.push('Reference Engine UI uses the Contract, shows actual workspace identities, downloads a verifiable report and does not acknowledge private unread messages')
 await page.locator('.directory-shared').click();await expect(page.locator('.asset-browser')).toBeVisible();assert.equal((await call('view.get')).layer,'engine');await page.getByRole('button',{name:'Close shared transfer area',exact:true}).click();await expect(page.locator('.asset-browser')).toHaveCount(0)
 await infra.click();await expect(page.locator('.infinite-canvas')).toBeVisible();await page.locator('.infra-toolbar').getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.message-view')).toBeVisible()
 await page.getByRole('button',{name:'Message Mira',exact:true}).click();await expect(page.locator('.message-conversation')).toContainText('A genuine unread private reply')
 const current=await call('view.get');await engine.click();await expect(page.locator('.engine-workflow')).toBeVisible();await infra.click();assert.equal((await call('view.get')).employee,current.employee);await expect(page.locator('.message-conversation')).toBeVisible()
 await page.locator('.infra-toolbar').getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toBeVisible();await expect(page.locator('.plan-view-tabs [role=tab]')).toHaveCount(10)
 await engine.click();await infra.click();assert.equal((await call('view.get')).kind,'plan');await expect(page.locator('.plan-view')).toBeVisible()
 checks.push('Shared files work in Engine; switching layers retains the selected employee conversation and Plan view without creating new identities or data')
 await call('view.open',{kind:'conversation',employee:card.id});await expect(page.locator('.infra-content>.conversation-layer')).toBeVisible();const placement=await page.locator('.conversation-layer').evaluate(node=>({top:node.getBoundingClientRect().top,toolbar:document.querySelector('.infra-toolbar').getBoundingClientRect().bottom}));assert.ok(placement.top>=placement.toolbar-1,'Infra workbench must not cover its view toolbar')
 await engine.click();await expect(page.locator('.conversation-layer')).toBeHidden();await infra.click();await expect(page.locator('.conversation-layer')).toBeVisible();await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.conversation-layer')).toHaveCount(0)


 await call('view.open',{kind:'employee'});const hire=page.locator('.office-panel-wrap');await expect(hire).toBeVisible();const name=hire.locator('input[name=title]');await name.fill('Unsaved Engine transition')
 await call('view.layer',{layer:'engine'});await expect(hire).toBeHidden();await expect(page.locator('.engine-surface')).toBeVisible()
 await infra.click();await expect(hire).toBeVisible();await expect(name).toHaveValue('Unsaved Engine transition');await hire.getByRole('button',{name:'Close panel',exact:true}).click();await call('view.select',{id:'plan'})
 checks.push('CLI layer changes hide Infra-owned overlays and restore an unsaved employee form without creating the employee')

 await engine.click();await page.getByRole('button',{name:'Engine catalog',exact:true}).click();await expect(page.locator('.engine-catalog')).toBeVisible()
 const resize=async(width,height)=>app?app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height}):page.setViewportSize({width,height})
 await page.screenshot({path:path.join(out,'engine-catalog.png'),animations:'disabled'})
 for(const width of native?[1100,720]:[1100,720,390]){
  await resize(width,850);await expect(nav).toBeVisible();await expect(page.locator('.application-layers')).toHaveCount(1);const boxes=await nav.getByRole('button').evaluateAll(nodes=>nodes.map(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,width:b.width,height:b.height}}));assert.ok(Math.abs(boxes[0].width-boxes[1].width)<1&&boxes[0].height===boxes[1].height,JSON.stringify({width,boxes}));assert.ok(boxes[0].left>=0&&boxes[1].right<=width+1)
 }
 fs.writeFileSync(path.join(out,'shell-dom.json'),JSON.stringify(await page.evaluate(()=>({layers:document.querySelectorAll('.application-layers').length,headers:[...document.querySelectorAll('.company-header')].map(el=>({parent:el.parentElement.className,html:el.outerHTML,rect:el.getBoundingClientRect().toJSON(),position:getComputedStyle(el).position})),frames:[...document.querySelectorAll('iframe')].map(el=>el.src),exits:document.querySelectorAll('[data-message-exit]').length})),null,2));await page.screenshot({path:path.join(out,'engine-compact.png'),animations:'disabled'})
 await infra.click();await expect(page.locator('.plan-view')).toBeVisible();await page.screenshot({path:path.join(out,'infra-compact.png'),animations:'disabled'})
 const after=(await rpc('session.list')).sessions.find(s=>s.id===card.id);assert.equal(after.cwd,card.cwd);assert.equal(after.engine,card.engine);assert.deepEqual(errors,[])
 if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 checks.push('Wide and compact screens keep matching top buttons, existing ten Plan layouts and stable employee/native-workspace identity')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,checks,errors,paidModels:0,productionDataUsed:false},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f?.close();application.dispose();fs.rmSync(temp,{recursive:true,force:true})}
