// Real opener-created windows clone sessionStorage; fresh Playwright pages do not exercise this boundary.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/launcher-verification-resume/windows-'+Date.now()),checks=[]
fs.mkdirSync(out,{recursive:true});let application,f,browser,page,popup,other,otherPopup
const pass=name=>{checks.push(name);console.log('PASS '+name)}
const errors=[]
try{
 application=await profileApplication()
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const url='http://127.0.0.1:'+port
 f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'.aexus/out/main/daemon.js'))
 const scoped=(engine,cmd,args={})=>f.cli('--engine-scope',engine,'api','call',cmd,'--args',JSON.stringify(args))
 await scoped('workspace-audit','group.add',{name:'Audit Window Team',mode:'build'});await scoped('deep-research','group.add',{name:'Research Window Team',mode:'build'})
 const token=()=>fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
 browser=await chromium.launch({headless:true,channel:process.env.AGENTS_BROWSER_CHANNEL??'chrome'});const context=await browser.newContext({viewport:{width:1280,height:880}})
 const observe=p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message))}
 const view=p=>p.evaluate(()=>window.agents.call('view.get'))
 const id=p=>p.evaluate(()=>sessionStorage.getItem('agents-company-client'))
 const login=async p=>{await p.locator('.web-login input').fill(token());await p.getByRole('button',{name:'Enter workspace',exact:true}).click();await expect(p.locator('.engine-library')).toBeVisible()}
 const load=async(p,name)=>{await p.getByRole('button',{name:'Select '+name,exact:true}).click();await p.getByRole('button',{name:'Load '+name,exact:true}).click();await expect(p.locator('.engine-library')).toHaveCount(0);await expect(p.getByRole('button',{name:'Infra',exact:true})).toBeVisible()}
 const openFrom=async p=>{const opened=p.waitForEvent('popup');await p.evaluate(url=>window.open(url,'_blank'),url);const child=await opened;observe(child);await child.waitForLoadState('domcontentloaded');return child}
 page=await context.newPage();observe(page);await page.goto(url);await login(page);const firstId=await id(page);assert.match(firstId,/^[a-f0-9-]{36}$/)
 await load(page,'Workspace audit');await expect(page.locator('.engine-workflow')).toBeVisible();assert.equal((await view(page)).engineId,'workspace-audit')
 pass('First authenticated window explicitly loads an Engine; metadata browsing creates no employees or workflow')
 popup=await openFrom(page);await expect(popup.locator('.engine-library')).toBeVisible();assert.notEqual(await id(popup),firstId);await expect(popup.locator('.infinite-canvas,.engine-surface,.message-view,.plan-view')).toHaveCount(0);assert.equal((await view(page)).engineId,'workspace-audit')
 pass('A real window.open clone receives a different client identity and starts at the gated Engine library')
 await load(popup,'Deep Research');await expect(popup.locator('.a-dr')).toBeVisible();await page.getByRole('button',{name:'Infra',exact:true}).click();await expect(page.locator('.infinite-canvas')).toContainText('Audit Window Team');await expect(page.locator('.infinite-canvas')).not.toContainText('Research Window Team')
 await popup.getByRole('button',{name:'Infra',exact:true}).click();await expect(popup.locator('.infinite-canvas')).toContainText('Research Window Team');await expect(popup.locator('.infinite-canvas')).not.toContainText('Audit Window Team');assert.equal((await view(page)).engineId,'workspace-audit')
 pass('Opener and child navigate independent Engines and see only their own real Core Team records')
 const popupId=await id(popup);await popup.reload();await expect(popup.locator('.infinite-canvas')).toContainText('Research Window Team');assert.equal(await id(popup),popupId);assert.equal((await view(popup)).engineId,'deep-research');assert.equal(await id(page),firstId);assert.equal((await view(page)).engineId,'workspace-audit')
 pass('Reload releases/reacquires the document lock and restores that same window without resetting the other window')
 await popup.getByRole('button',{name:'Back to engine library',exact:true}).click();await expect(popup.locator('.engine-library')).toBeVisible();await expect(page.locator('.infinite-canvas')).toContainText('Audit Window Team');await popup.close();popup=undefined;await page.reload();await expect(page.locator('.infinite-canvas')).toContainText('Audit Window Team');assert.equal(await id(page),firstId)
 pass('Returning the child home and closing it does not unload or steal the original client; original reload also retains its ID')
 const noLocks=await browser.newContext({viewport:{width:1100,height:850}});await noLocks.addInitScript(()=>Object.defineProperty(navigator,'locks',{configurable:true,value:undefined}));other=await noLocks.newPage();observe(other);await other.goto(url);await login(other);await load(other,'Workspace audit');const otherId=await id(other)
 otherPopup=await openFrom(other);await expect(otherPopup.locator('.engine-library')).toBeVisible();assert.notEqual(await id(otherPopup),otherId);assert.equal((await view(other)).engineId,'workspace-audit');await otherPopup.close();otherPopup=undefined;await noLocks.close();other=undefined
 pass('Browsers without Web Locks fail closed with fresh document IDs rather than sharing a copied Engine selection')
 await page.screenshot({path:path.join(out,'independent-opener.png'),animations:'disabled'})
 await f.stop();await f.start();await page.reload();await expect(page.locator('.web-login')).toBeVisible();await login(page);assert.equal((await view(page)).layer,'launcher');await expect(page.locator('.infinite-canvas,.engine-surface')).toHaveCount(0);await load(page,'Workspace audit');await page.getByRole('button',{name:'Infra',exact:true}).click();await expect(page.locator('.infinite-canvas')).toContainText('Audit Window Team')
 assert.deepEqual((await scoped('workspace-audit','group.list')).sort(),['Audit Window Team']);assert.deepEqual((await scoped('deep-research','group.list')).sort(),['Research Window Team']);assert.equal((await f.cli('session','list')).sessions.length,0);assert.equal((await f.cli('api','call','workflow.list','--args','{}')).jobs.length,0);assert.deepEqual(errors,[])
 pass('Core restart requires authentication/Engine selection again, preserving Team IDs and avoiding all model/workflow starts')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,errors,modelCalls:0,productionDataUsed:false},null,2))
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack,errors},null,2));await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await otherPopup?.close().catch(()=>{});await popup?.close().catch(()=>{});await browser?.close();await f?.close();application?.dispose();console.log('Evidence '+out)}
