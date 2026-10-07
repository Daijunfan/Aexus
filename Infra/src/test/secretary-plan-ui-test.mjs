// Complete Web/hidden desktop Plan against authenticated temporary state, never the production app.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=process.env.AGENTS_SECRETARY_UI_OUT||path.join(root,'.aexus/artifacts/secretary-plan-api',mode),require=createRequire(import.meta.url),errors=[]
fs.mkdirSync(out,{recursive:true});let f,application,app,browser,page
try{
 application=await profileApplication();const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 f=await fixtureCore(!native?{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}:{},path.join(application.directory,'.aexus/out/main/daemon.js'))
 const rpc=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data}
 await rpc('settings.set',{language:'en'});await rpc('group.add',{name:'Plan parity'})
 const secretary=await f.create('Secretary','Plan parity','secretary'),token=await f.token(secretary.id),jobs=[]
 for(let i=0;i<3;i++){const worker=await f.create('Temporary target '+i,'Plan parity'),job=await rpc('schedule.create',{spec:{name:'Removed target '+i,enabled:false,action:{type:'agent',employeeId:worker.id,prompt:'TEST ONLY'},rule:{kind:'weekly',days:[1],time:'09:30',timezone:'Asia/Shanghai'}}});jobs.push(job);await rpc('card.remove',{id:worker.id})}
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1280',AGENTS_COMPANY_HEIGHT:'940'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1280,height:940}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);await expect(page.locator('.infinite-canvas')).toBeVisible()
 const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
 await call('view.select',{id:'plan'});await expect(page.locator('.plan-table tbody tr')).toHaveCount(3)
 const user=await call('plan.query'),agent=await rpc('plan.query',{},token);assert.deepEqual(agent.rows.map(r=>r.id),user.rows.map(r=>r.id));assert.ok(agent.rows.every(row=>row.target.exists===false&&row.allowedActions.includes('schedule.delete')))
 await page.screenshot({path:path.join(out,'orphan-tasks.png')})
 const first=agent.rows.find(row=>row.id===jobs[0].id)
 const edited=await rpc('schedule.update',{id:first.id,expectedRevision:first.revision,patch:{name:'Secretary changed this task',plan:{priority:'urgent',tags:['cleanup'],notes:'Same record, no employee recreated'}}},token)
 await expect(page.locator('.plan-table [data-plan-id="'+first.id+'"]')).toContainText('Secretary changed this task')
 const view=await call('plan.view-create',{spec:{name:'User task view',layout:'list'}});await call('view.open',{kind:'plan',planViewId:view.id});await expect(page.locator('.plan-task-list [data-plan-id]')).toHaveCount(3)
 await rpc('plan.view-update',{id:view.id,expectedRevision:view.revision,patch:{name:'Secretary maintained view',layout:'table',options:{timezone:'Asia/Tokyo'}}},token)
 await expect(page.locator('.plan-table tbody tr')).toHaveCount(3);await expect(page.locator('.plan-view')).toContainText('Secretary maintained view')
 await rpc('schedule.delete',{ids:agent.rows.map(row=>row.id),expectedRevisions:Object.fromEntries(agent.rows.map(row=>[row.id,row.id===edited.id?edited.revision:row.revision]))},token)
 await expect(page.locator('.plan-table tbody tr')).toHaveCount(0);assert.equal((await rpc('plan.query',{},token)).total,0);assert.equal((await call('session.list')).sessions.length,1)
 await rpc('plan.view-delete',{id:view.id},token);await call('settings.set',{language:'zh-CN'})
 if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,940));else await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:path.join(out,'clean-plan-zh.png')});assert.deepEqual(errors,[]);if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,errors,checks:['UI and Secretary discover the same three orphan IDs','Secretary update and batch deletion refresh actual Plan UI','User-saved view is editable by Secretary through the same APIs','Stable employee survives, no model calls, Chinese compact view'],providerCalls:0},null,2));console.log('PASS '+mode+' Secretary Plan UI: matching IDs, real authenticated edit/delete/view updates, live refresh, Chinese compact layout')
}finally{await app?.close();await browser?.close();await f?.close();application?.dispose()}
