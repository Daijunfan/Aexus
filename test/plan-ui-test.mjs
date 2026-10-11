// Actual Plan interface and canonical Core records, private state and deterministic engines only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-ui-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/plan')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const editor=page.locator('.plan-editor'),tab=name=>page.getByRole('tab',{name,exact:true})
try{
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{viewAppearance:{plan:{theme:'white'}}})
 await call('group.add',{name:'Product Studio'});await call('group.add',{name:'Engineering'})
 const a=await call('card.create',{title:'Aster',group:'Product Studio',engine:'codex',model:'gpt-6-luna',avatar:'fate-saber-anime'}),b=await call('card.create',{title:'Byte',group:'Engineering',engine:'codex',model:'gpt-6-luna',avatar:'byte'}),c=await call('card.create',{title:'Nova',group:'Product Studio',engine:'codex',model:'gpt-6-luna',avatar:'fate-gilgamesh-chibi'})
 await expect.poll(async()=>(await call('session.status')).every(card=>card.initialization?.status==='ready')).toBe(true);const initializedLive=(await call('session.list',{live:true})).length
 const before=(await call('session.list')).sessions.map(card=>({id:card.id,engine:card.engine,cwd:card.cwd,avatar:card.avatar,group:card.group}))
 await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toBeVisible()
 assert.deepEqual(await call('terminal.list'),[]);assert.equal((await call('session.list',{live:true})).length,initializedLive,'opening Plan must not start another engine after initialization')
 const geometry=await page.locator('.app-view-button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return [r.width,r.height,s.borderRadius,s.fontSize,s.fontWeight]}));assert.equal(geometry.length,3);assert.deepEqual(geometry[0],geometry[1]);assert.deepEqual(geometry[1],geometry[2])
 await page.locator('.plan-new').click();await expect(editor).toBeVisible()
 await editor.locator('[name=plan-name]').fill('Sunday project review');await editor.locator('[name=plan-employee]').selectOption(a.id);await editor.locator('[name=plan-prompt]').fill('Review the project and report blockers and next steps.')
 await editor.locator('[name=plan-mode]').selectOption('weekly');await editor.locator('[name=plan-timezone]').fill('Asia/Shanghai');await editor.locator('[name=plan-time]').fill('17:00')
 await expect(editor.getByRole('button',{name:'Sun',exact:true})).toHaveAttribute('aria-pressed','true');await editor.locator('[name=plan-priority]').selectOption('high');await editor.locator('[name=plan-tags]').fill('review, product')
 await editor.getByRole('button',{name:'Preview next runs',exact:true}).click();await expect(editor.locator('.plan-preview li')).toHaveCount(5)
 await editor.getByRole('button',{name:'Create schedule',exact:true}).click();await expect(editor).toHaveCount(0)
 const weekly=(await call('schedule.list')).find(job=>job.name==='Sunday project review');assert.ok(weekly);assert.equal(weekly.action.employeeId,a.id);assert.deepEqual(weekly.rule,{kind:'weekly',time:'17:00',days:[7],timezone:'Asia/Shanghai'})
 const spec=(name,employeeId,rule,plan,enabled=true)=>({name,action:{type:'agent',employeeId,prompt:'Keep the team informed. Full work stays in the original conversation.'},rule,plan,enabled})
 const daily=await call('schedule.create',{spec:spec('Daily engineering check',b.id,{kind:'weekly',time:'09:00',days:[1,2,3,4,5,6,7],timezone:'Asia/Shanghai'},{priority:'normal',tags:['engineering'],notes:'Daily health checks'})})
 const monthly=await call('schedule.create',{spec:spec('Month-end research brief',c.id,{kind:'monthly',day:'last',time:'17:00',timezone:'Asia/Shanghai'},{priority:'urgent',tags:['research'],notes:'Publish only a concise summary'})})
 await call('schedule.create',{spec:spec('Paused follow-up',b.id,{kind:'interval',everySeconds:3600},{priority:'low',tags:['follow-up'],notes:''},false)})
 await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(4)
 for(const theme of ['white','black']){
  await call('settings.set',{viewAppearance:{plan:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
  for(const name of ['Table','Board','Calendar','List']){await tab(name).click();await expect(tab(name)).toHaveAttribute('aria-selected','true');const body=name==='Table'?'.plan-table':name==='Board'?'.plan-board':name==='Calendar'?'.plan-calendar':'.plan-task-list';await expect(page.locator(body)).toBeVisible();if(name==='Calendar')await expect(page.locator('.calendar-event').first()).toBeVisible();await page.screenshot({path:path.join(output,`${name.toLowerCase()}-${theme}.png`)})}
 }
 await call('settings.set',{viewAppearance:{plan:{theme:'white'}}});await tab('Board').click();await page.getByRole('combobox',{name:'Group board by'}).selectOption('priority');await expect(page.locator('[data-plan-column=urgent]')).toContainText('Month-end research brief')
 await page.getByRole('combobox',{name:'Filter by Team'}).selectOption('Product Studio');await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount(2)
 await page.getByRole('button',{name:'Save a Plan view',exact:true}).click();const saved=page.getByRole('dialog',{name:'Save Plan view'});await saved.getByRole('textbox').fill('Product roadmap');await saved.getByRole('button',{name:'Save view',exact:true}).click();await expect(tab('Product roadmap')).toHaveAttribute('aria-selected','true')
 const savedView=(await call('plan.views')).find(v=>v.name==='Product roadmap');assert.equal(savedView.layout,'board');assert.equal(savedView.filter.team,'Product Studio')
 await page.getByRole('button',{name:'Company Views',exact:true}).click();await expect(page.locator('.infinite-canvas')).toBeVisible();await page.getByRole('button',{name:'Plan',exact:true}).click();await tab('Product roadmap').click();await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount(2)
 await tab('Table').click();await page.getByRole('textbox',{name:'Search schedules'}).fill('Sunday');await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(1);await page.getByRole('textbox',{name:'Search schedules'}).fill('')
 await page.getByRole('button',{name:'Pause Sunday project review',exact:true}).click();await expect(page.locator(`[data-plan-id="${weekly.id}"] .plan-status`)).toContainText('Paused');assert.equal((await call('schedule.get',{id:weekly.id})).enabled,false)
 await page.getByRole('button',{name:'Resume Sunday project review',exact:true}).click();await expect(page.locator(`[data-plan-id="${weekly.id}"] .plan-status`)).toContainText('Scheduled')
 await page.getByRole('button',{name:'Sunday project review',exact:true}).click();await expect(editor).toBeVisible();await editor.locator('[name=plan-notes]').fill('Edited in the shared Plan view');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal((await call('schedule.get',{id:weekly.id})).plan.notes,'Edited in the shared Plan view')
 await page.getByRole('button',{name:'Sunday project review',exact:true}).click();await editor.getByRole('button',{name:'Run now',exact:true}).click();await expect(editor.locator('.plan-confirm')).toContainText('may incur model usage');await editor.getByRole('button',{name:'Confirm run',exact:true}).click();await expect(editor).toHaveCount(0)
 await expect.poll(async()=>(await call('schedule.history',{id:weekly.id}))[0]?.status).toBe('succeeded');assert.ok((await call('session.transcript',{id:a.id})).text.includes(weekly.action.prompt))
 await page.getByRole('button',{name:'Sunday project review',exact:true}).click();await expect(editor.locator('.plan-run-history')).toContainText('succeeded');await editor.getByRole('button',{name:'Open conversation ↗',exact:true}).click();await expect(page.locator('.employee-workbench')).toBeVisible();await call('view.close');await expect(page.locator('.plan-view')).toBeVisible()
 await page.getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.message-contact')).toHaveCount(3)
 const portraits=await page.locator('.message-contact .message-avatar img').evaluateAll(async images=>Promise.all(images.map(async img=>{await img.decode();const a=img.getBoundingClientRect(),b=img.parentElement.getBoundingClientRect();return {natural:[img.naturalWidth,img.naturalHeight],fits:a.left>=b.left-.1&&a.top>=b.top-.1&&a.right<=b.right+.1&&a.bottom<=b.bottom+.1,fit:getComputedStyle(img).objectFit}})))
 for(const p of portraits){assert.deepEqual(p.natural,[256,256]);assert.ok(p.fits);assert.equal(p.fit,'contain')}
 await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-thread-header img')).toBeVisible();await page.screenshot({path:path.join(output,'portraits-messages.png')})
 await page.getByRole('button',{name:'Plan',exact:true}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900))
 const narrow=await page.locator('.app-view-button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [r.width,r.height]}));assert.deepEqual(narrow[0],narrow[1]);assert.deepEqual(narrow[1],narrow[2]);await expect(page.locator('.plan-new')).toBeVisible();await page.screenshot({path:path.join(output,'plan-compact.png')})
 await page.locator('.plan-new').click();await editor.locator('[name=plan-name]').fill('Short delay');await editor.locator('[name=plan-employee]').selectOption(b.id);await editor.locator('[name=plan-prompt]').fill('LATER_PROOF');await editor.locator('[name=plan-amount]').fill('3600');await editor.locator('[name=plan-unit]').selectOption('1');await editor.getByRole('button',{name:'Create schedule',exact:true}).click();await expect(editor).toHaveCount(0)
 const delayed=(await call('schedule.list')).find(job=>job.name==='Short delay');assert.equal(delayed.rule.kind,'once');assert.ok(Date.parse(delayed.rule.at)>Date.now()+3500000)
 await call('schedule.delete',{id:delayed.id});assert.equal((await call('schedule.list')).length,4)
 await page.reload();await expect(page.locator('.plan-view')).toBeVisible();assert.ok((await call('plan.views')).some(v=>v.name==='Product roadmap'))
 const after=(await call('session.list')).sessions.map(card=>({id:card.id,engine:card.engine,cwd:card.cwd,avatar:card.avatar,group:card.group}));assert.deepEqual(after,before)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 console.log('PASS Plan UI: three equal navigation buttons, schedule editor/preview/save, Sunday 17:00, Table/Board/Calendar/List, filters, saved views, pause/resume/manual run, real history and workbench return, static portraits, responsive layout, reload and unchanged employees; isolated fixtures only')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
