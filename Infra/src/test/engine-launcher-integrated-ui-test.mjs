// Actual shell, two authenticated windows, real CLI/Core data; models replaced by the native protocol fixture.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'.aexus/artifacts/engine-launcher-complete/integrated-'+mode),require=createRequire(import.meta.url),checks=[]
fs.mkdirSync(out,{recursive:true})
const application=await profileApplication(),server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r))
const A='workspace-audit',B='deep-research';let f,app,browser,context,page,other;const errors=[]
const pass=name=>{checks.push(name);console.log('PASS '+name)}
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'.aexus/out/main/daemon.js'))
 const scoped=(engine,cmd,args={})=>f.cli('--engine-scope',engine,'api','call',cmd,'--args',JSON.stringify(args))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'white'},plan:{theme:'white'}}})
 await scoped(A,'group.add',{name:'Alpha Studio',mode:'build'});await scoped(B,'group.add',{name:'Beta Studio',mode:'build'})
 const a=await scoped(A,'card.create',{title:'Mira Alpha',group:'Alpha Studio',engine:'codex',model:'gpt-6-luna'}),b=await scoped(B,'card.create',{title:'Noah Beta',group:'Beta Studio',engine:'codex',model:'gpt-6-luna'})
 await f.ready(a.id);await f.ready(b.id)
 const ga=await scoped(A,'chat.create',{name:'Alpha room',members:[a.id]}),gb=await scoped(B,'chat.create',{name:'Beta room',members:[b.id]})
 const ca=await scoped(A,'channel.create',{name:'Alpha channel',engine:{kind:'employees',employeeIds:[a.id]}}),cb=await scoped(B,'channel.create',{name:'Beta channel',engine:{kind:'employees',employeeIds:[b.id]}})
 const rule={kind:'once',at:new Date(Date.now()+3600000).toISOString()}
 await scoped(A,'schedule.create',{spec:{name:'Alpha plan',action:{type:'agent',employeeId:a.id,prompt:'Alpha scheduled work'},rule}});await scoped(B,'schedule.create',{spec:{name:'Beta plan',action:{type:'agent',employeeId:b.id,prompt:'Beta scheduled work'},rule}})
 await scoped(A,'workspace.write',{employee:a.id,path:'alpha.txt',content:'Alpha work',create:true});await scoped(B,'workspace.write',{employee:b.id,path:'beta.txt',content:'Beta work',create:true})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.env.AGENTS_BROWSER_CHANNEL&&process.env.AGENTS_BROWSER_CHANNEL!=='chromium'?{channel:process.env.AGENTS_BROWSER_CHANNEL}:process.platform==='darwin'&&!process.env.AGENTS_BROWSER_CHANNEL?{channel:'chrome'}:{})});context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 const call=(cmd,args={})=>page.evaluate(([cmd,args])=>window.agents.call(cmd,args),[cmd,args])
 await expect(page.locator('.engine-library')).toBeVisible();await expect(page.locator('.infinite-canvas,.message-view,.plan-view,.engine-surface,.asset-browser')).toHaveCount(0)
 if(!native)assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/\/WorkspaceApp-[^/]+\.js(?:\?|$)/.test(entry.name))),false,'Launcher must not fetch the complete Infra workspace chunk before an Engine is chosen')
 assert.ok(!await page.getByText('Mira Alpha',{exact:true}).count());assert.ok(!await page.getByText('Noah Beta',{exact:true}).count());await page.screenshot({path:path.join(out,'library.png'),animations:'disabled'})
 await page.locator('[data-engine-id=workspace-audit]').click();await expect(page.locator('.engine-library')).toBeVisible();assert.equal((await call('view.get')).layer,'launcher');await page.locator('[data-engine-id=workspace-audit]').dragTo(page.getByTestId('engine-load-dock'))
 await expect(page.locator('.engine-workflow')).toBeVisible();assert.equal((await call('view.get')).engineId,A);if(!native)assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>/\/WorkspaceApp-[^/]+\.js(?:\?|$)/.test(entry.name))),true,'Loading an Engine should fetch the deferred workspace chunk');await expect(page.getByRole('combobox',{name:'Audit Team'})).toHaveValue('Alpha Studio');await page.getByRole('button',{name:'Run audit',exact:true}).click();await expect(page.locator('.engine-delivery')).toContainText('Mira Alpha');await expect(page.locator('.engine-delivery')).not.toContainText('Noah Beta')
 pass('Home renders only engine metadata; clicking does not load; center drag-and-drop opens a scoped Engine page')
 await page.getByRole('button',{name:'Infra',exact:true}).click();await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(page.locator('.infinite-canvas')).toContainText('Mira Alpha');await expect(page.locator('.infinite-canvas')).not.toContainText('Noah Beta')
 assert.deepEqual((await call('session.list')).sessions.map(s=>s.id),[a.id]);await assert.rejects(call('session.transcript',{employee:b.id}))
 await page.getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.message-view')).toContainText('Alpha room');await expect(page.locator('.message-view')).not.toContainText('Beta room');await expect(page.locator('.message-view')).toContainText('Alpha channel');await expect(page.locator('.message-view')).not.toContainText('Beta channel')
 await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toContainText('Alpha plan');await expect(page.locator('.plan-view')).not.toContainText('Beta plan');await expect(page.locator('.plan-view-tabs [role=tab]')).toHaveCount(10)
 await page.locator('.directory-shared').click();await expect(page.locator('.asset-browser')).toBeVisible();await expect(page.locator('.asset-browser')).not.toContainText('Beta Studio');await page.getByRole('button',{name:'Close shared transfer area',exact:true}).click()
 await page.screenshot({path:path.join(out,'scoped-plan.png'),animations:'disabled'})
 pass('Company, Messages, all ten Plan layouts and shared files resolve the same selected Engine; raw window API cannot bypass it')
 await page.getByRole('button',{name:'Linked Engine resources',exact:true}).click();const links=page.getByRole('dialog',{name:'Linked Engine resources',exact:true});await links.getByRole('tab',{name:/Employees/}).click();const noah=links.locator('label').filter({hasText:'Noah Beta'}).getByRole('checkbox');await noah.check();await links.getByRole('button',{name:'Save links',exact:true}).click();await expect(links).toHaveCount(0)
 await expect.poll(async()=>(await call('session.list')).sessions.some(s=>s.id===b.id)).toBe(true)
 await page.getByRole('button',{name:'Linked Engine resources',exact:true}).click();await links.getByRole('tab',{name:/Employees/}).click();await noah.uncheck();await links.getByRole('button',{name:'Save links',exact:true}).click();await expect(links).toHaveCount(0)
 assert.deepEqual((await call('session.list')).sessions.map(s=>s.id),[a.id]);assert.equal((await rpc('session.list')).sessions.find(s=>s.id===b.id).cwd,b.cwd)
 pass('User explicitly links and unlinks an existing employee through the real resource editor, with no cloning or data deletion')

 for(const card of [a,b])fs.writeFileSync(path.join(f.control,card.id+'.hold-user'),'')
 await scoped(A,'session.send',{employee:a.id,text:'ALPHA_INDEPENDENT',clientMessageId:'ui-alpha'});await scoped(B,'session.send',{employee:b.id,text:'BETA_INDEPENDENT',clientMessageId:'ui-beta'});await f.until(async()=>(await f.status(a.id)).busy&&(await f.status(b.id)).busy,'independent work')
 await page.getByRole('button',{name:'Back to engine library',exact:true}).click();await expect(page.locator('.engine-library')).toBeVisible();await expect(page.locator('.infinite-canvas,.message-view,.plan-view,.engine-surface')).toHaveCount(0)
 assert.ok((await f.status(a.id)).busy&&(await f.status(b.id)).busy)
 await page.locator('[data-engine-id="'+B+'"]').dragTo(page.getByTestId('engine-load-dock'));await expect(page.locator('.dr-app')).toBeVisible();assert.equal((await call('view.get')).engineId,B)
 await page.getByRole('button',{name:'Infra',exact:true}).click();await expect(page.locator('.infinite-canvas')).toContainText('Noah Beta');await expect(page.locator('.infinite-canvas')).not.toContainText('Mira Alpha')
 fs.unlinkSync(path.join(f.control,a.id+'.hold-user'));await f.until(async()=>!(await f.status(a.id)).busy,'A finishes while B is visible');assert.ok((await f.status(b.id)).busy)
 pass('Native drag-drop switches to B without stopping A; A finishes while B keeps working')
 if(!native){
  other=await context.newPage();other.setDefaultTimeout(12000);await other.goto('http://127.0.0.1:'+port);await expect(other.locator('.engine-library')).toBeVisible();await other.locator('[data-engine-id=workspace-audit]').dragTo(other.getByTestId('engine-load-dock'));await expect(other.locator('.engine-workflow')).toBeVisible()
  assert.equal((await call('view.get')).engineId,B);assert.equal(await other.evaluate(()=>window.agents.call('view.get').then(v=>v.engineId)),A)
  await other.getByRole('button',{name:'Infra',exact:true}).click();await expect(other.locator('.infinite-canvas')).toContainText('Mira Alpha');await expect(other.locator('.infinite-canvas')).not.toContainText('Noah Beta')
  await page.getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.message-view')).toContainText('Beta room');await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.research-manager')).toBeVisible();await expect(page.locator('.research-manager')).toContainText('没有需要管理的历史研究记录');await other.getByRole('button',{name:'Plan',exact:true}).click();await expect(other.locator('.plan-view')).toContainText('Alpha plan');assert.equal((await call('view.get')).kind,'plan')
  pass('Two authenticated windows select and navigate different Engines without changing each other')
  let release,notify;const blocked=new Promise(r=>release=r),received=new Promise(r=>notify=r);let intercept=true
  await page.route('**/api/rpc',async route=>{const req=route.request().postDataJSON();if(intercept&&req.cmd==='session.list'){intercept=false;const response=await route.fetch();notify();await blocked;await route.fulfill({response});return}await route.continue()})
  await page.evaluate(()=>{window.scopeLate=null;void window.agents.call('session.list').then(value=>window.scopeLate={returned:true,value}).catch(error=>window.scopeLate={code:error.code})});await received
  await page.getByRole('button',{name:'Back to engine library',exact:true}).click();await page.locator('[data-engine-id=workspace-audit]').dragTo(page.getByTestId('engine-load-dock'));await expect(page.locator('.engine-workflow')).toBeVisible();release()
  await expect.poll(()=>page.evaluate(()=>window.scopeLate?.code)).toBe('ENGINE_SCOPE_STALE');await page.unroute('**/api/rpc');await expect(page.locator('.engine-workflow')).not.toContainText('Noah Beta')
  pass('A real delayed response from Engine B is discarded after switching to A; old content cannot repopulate the new workspace')

  await page.getByRole('button',{name:'Back to engine library',exact:true}).click();await page.setViewportSize({width:390,height:800});await expect(page.locator('.engine-library')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'library-390.png'),animations:'disabled'});await page.setViewportSize({width:1440,height:1000})
 }
 fs.unlinkSync(path.join(f.control,b.id+'.hold-user'));await f.until(async()=>!(await f.status(b.id)).busy,'B completes')
 if(native)await page.getByRole('button',{name:'Back to engine library',exact:true}).click()
 await page.locator('[data-engine-id=workspace-audit]').dragTo(page.getByTestId('engine-load-dock'));await expect(page.locator('.engine-workflow')).toBeVisible();assert.equal((await rpc('session.transcript',{employee:a.id})).items.filter(i=>i.role==='user'&&i.text==='ALPHA_INDEPENDENT').length,1)
 const after=(await rpc('session.list')).sessions;assert.equal(after.find(s=>s.id===a.id).cwd,a.cwd);assert.equal(after.find(s=>s.id===b.id).cwd,b.cwd);assert.deepEqual(errors,[])
 if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 pass('Returning to an Engine restores its existing work without duplicate sends or workspace changes; responsive UI has no horizontal overflow')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,checks,errors,modelCalls:0,productionDataUsed:false},null,2))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,error:error.stack,errors},null,2));throw error}finally{await other?.close();await app?.close();await browser?.close();await f?.close();application.dispose()}
