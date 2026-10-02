// Scenario-driven validation against the actual hidden desktop and isolated Core.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-polish-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/plan-polish')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1600',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[],checks=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),editor=page.locator('.plan-editor')
const tab=name=>page.getByRole('tab',{name,exact:true}),pass=name=>{checks.push(name);console.log('PASS '+name)},iso=ms=>new Date(ms).toISOString()
try{
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{viewAppearance:{plan:{theme:'white'}}});await call('group.add',{name:'Product'});await call('group.add',{name:'Operations'})
 const a=await call('card.create',{title:'Alex',group:'Product',engine:'codex',model:'gpt-6-luna',avatar:'fate-saber-anime'}),b=await call('card.create',{title:'Alex',group:'Operations',engine:'codex',model:'gpt-6-luna',avatar:'byte'}),c=await call('card.create',{title:'Mira',group:'Product',engine:'codex',model:'gpt-6-luna',avatar:'marmalade'})
 await expect.poll(async()=>(await call('session.status')).every(card=>card.initialization?.status==='ready')).toBe(true)
 const original=(await call('session.list')).sessions.map(card=>({id:card.id,group:card.group,cwd:card.cwd,engine:card.engine,avatar:card.avatar}))
 const make=async(name,target,rule,plan={},extra={})=>call('schedule.create',{spec:{name,action:{type:'agent',employeeId:target,prompt:'Review the release checklist, write a short outcome, and keep the detailed work in this conversation.'},rule,plan,enabled:true,...extra}})
 const future=Date.now()+5*86400000,exact=iso(Math.floor(future/1000)*1000+789),deadline=iso(future+35*86400000)
 const weekly=await make('Sunday US review',a.id,{kind:'weekly',time:'17:00',days:[7],timezone:'America/New_York'},{priority:'urgent',tags:['review','release'],notes:'1. Review open issues.\n2. Check owners and deadlines.\n3. Publish only blockers and decisions.'},{until:deadline})
 const exactJob=await make('One-off release gate',b.id,{kind:'once',at:exact},{priority:'high',tags:['release'],notes:'A precise deployment checkpoint.'})
 await make('London daily digest',c.id,{kind:'weekly',time:'09:00',days:[1,2,3,4,5,6,7],timezone:'Europe/London'},{priority:'normal',tags:['report'],notes:'Write a digest in the knowledge base.'})
 await make('Month-end research',c.id,{kind:'monthly',time:'17:00',day:'last',timezone:'Asia/Tokyo'},{priority:'high',tags:['research'],notes:'Compare monthly findings.'})
 await make('Nightly operations',b.id,{kind:'interval',everySeconds:3600},{priority:'normal',tags:['operations'],notes:'Only in the permitted overnight window.'},{window:{start:'22:00',end:'02:00',timezone:'Asia/Shanghai',days:[1,2,3,4,5]}})
 const paused=await make('Paused investigation',b.id,{kind:'interval',everySeconds:30},{priority:'low',tags:['hold'],notes:'Waiting for a decision.'},{enabled:false})
 const finished=await make('Post-release checklist',a.id,{kind:'once',at:iso(Date.now()+900)},{priority:'normal',tags:['release'],notes:'Review after execution.'})
 await expect.poll(async()=>(await call('schedule.history',{id:finished.id}))[0]?.status).toBe('succeeded')
 const timeoutJob=await make('Timeout diagnostic',b.id,{kind:'interval',everySeconds:3600},{priority:'urgent',tags:['operations']},{timeoutSeconds:1})
 fs.writeFileSync(path.join(control,b.id+'.hold-user'),'');await call('schedule.run',{id:timeoutJob.id});await expect.poll(async()=>(await call('schedule.history',{id:timeoutJob.id}))[0]?.status).toBe('timed_out');fs.unlinkSync(path.join(control,b.id+'.hold-user'))
 await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(8)
 await expect(page.locator(`[data-plan-id="${finished.id}"] .plan-run-outcome`)).toHaveText('succeeded');await expect(page.locator(`[data-plan-id="${timeoutJob.id}"] .plan-run-outcome`)).toHaveText('timed out')
 pass('Eight practical scenarios: one-off, daily, weekly, monthly, overnight, paused, succeeded and timed-out tasks')
 await page.getByRole('button',{name:'Sunday US review',exact:true}).click();await editor.locator('[name=plan-notes]').fill('Reviewed in the UI without changing its clock.');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0)
 const afterWeekly=await call('schedule.get',{id:weekly.id});assert.equal(afterWeekly.until,weekly.until);assert.equal(afterWeekly.nextAt,weekly.nextAt);assert.deepEqual(afterWeekly.rule,weekly.rule)
 await page.getByRole('button',{name:'One-off release gate',exact:true}).click();await editor.locator('[name=plan-notes]').fill('Precise instant retained.');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal((await call('schedule.get',{id:exactJob.id})).rule.at,exactJob.rule.at)
 pass('Metadata-only edits preserve New York cutoff and millisecond-accurate one-off dates')
 await page.getByRole('button',{name:'Post-release checklist',exact:true}).click();await editor.locator('[name=plan-notes]').fill('Verified after completion.');await editor.getByRole('button',{name:'Preview next runs',exact:true}).click();await expect(editor.locator('.plan-preview-empty')).toBeVisible();await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal((await call('schedule.get',{id:finished.id})).nextAt,null)
 await page.getByRole('button',{name:'Paused investigation',exact:true}).click();await expect(editor.locator('[name=plan-amount]')).toHaveValue('30');await expect(editor.locator('[name=plan-unit]')).toHaveValue('1');await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
 pass('Completed plans accept notes without replay; seconds-based intervals have correct editor units')
 for(const theme of ['white','black']){
  await call('settings.set',{viewAppearance:{plan:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await tab('Board').click();await page.getByRole('combobox',{name:'Group board by'}).selectOption('status')
  await expect(page.locator('[data-plan-column=attention]')).toContainText('Timeout diagnostic');await expect(page.locator('[data-plan-column=completed]')).toContainText('Post-release checklist');await expect(page.locator('[data-plan-column=paused]')).toContainText('Paused investigation')
  await page.screenshot({path:path.join(output,'scenario-board-'+theme+'.png')})
 }
 await page.getByRole('combobox',{name:'Group board by'}).selectOption('employee');await expect(page.locator('[data-plan-column="'+a.id+'"]')).toContainText('Sunday US review');await expect(page.locator('[data-plan-column="'+b.id+'"]')).toContainText('Nightly operations')
 await page.getByRole('combobox',{name:'Filter by tag'}).selectOption('review');await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount(1);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount(8)
 pass('Independent color-scheme board outcomes, notes, filters and same-name employees stay distinct')
 const denseDay=new Date(Date.now()+86400000);denseDay.setUTCHours(8,0,0,0)
 for(let i=0;i<8;i++)await make('Dense launch '+(i+1),i%2?a.id:b.id,{kind:'once',at:iso(+denseDay+i*300000)},{tags:['launch-day'],notes:'Parallel release checklist '+(i+1)})
 await tab('Calendar').click();await page.getByRole('combobox',{name:'Filter by tag'}).selectOption('launch-day');await page.getByRole('combobox',{name:'Calendar time zone'}).selectOption('UTC')
 const day=denseDay.toISOString().slice(0,10),cell=page.locator(`[data-plan-date="${day}"]`);await expect(cell.locator('.calendar-event')).toHaveCount(3);await cell.locator('.plan-day-more').click()
 await expect(page.getByRole('dialog',{name:'Day agenda',exact:true})).toBeVisible();await expect(page.locator('.plan-day-event')).toHaveCount(8);await expect(page.locator('.plan-day-agenda')).toContainText('Upcoming occurrence');await page.screenshot({path:path.join(output,'dense-day-agenda.png')})
 await page.locator('.plan-day-event').last().click();await expect(editor.locator('[name=plan-name]')).toHaveValue('Dense launch 8');await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
 await page.getByRole('combobox',{name:'Calendar time zone'}).selectOption('America/New_York');await expect(cell.locator('.calendar-event time').first()).toHaveText(denseDay.toLocaleTimeString('en',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hour12:false}))
 pass('Eight same-day events use a readable day agenda; timezone changes display without changing execution')
 await tab('Table').click();await page.getByRole('textbox',{name:'Search schedules'}).fill('Sunday');await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(1)
 await page.getByRole('button',{name:'Save a Plan view',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Save Plan view',exact:true});await dialog.getByRole('textbox').fill('Sunday only');await dialog.getByRole('button',{name:'Save view',exact:true}).click();await expect(tab('Sunday only')).toHaveAttribute('aria-selected','true');await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(1)
 await page.reload();await expect(tab('Sunday only')).toHaveAttribute('aria-selected','true');await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(1)
 await tab('Table').click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900));await expect(page.locator('.plan-new')).toBeVisible();await page.screenshot({path:path.join(output,'scenario-compact.png')})
 pass('Saved filters survive reload and the editor remains reachable in narrow windows')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1600,1100))
 const bulk=[];for(let i=0;i<105;i++)bulk.push(await make('Pagination '+String(i).padStart(3,'0'),i%2?a.id:b.id,{kind:'once',at:iso(future+i*60000)},{tags:[i<100?'page-one':'page-two']}))
 await page.getByRole('textbox',{name:'Search schedules'}).fill('Pagination');await page.getByRole('combobox',{name:'Sort schedules'}).selectOption('name');await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(100)
 await expect(page.getByRole('combobox',{name:'Filter by tag'}).getByRole('option',{name:'page-two',exact:true})).toHaveCount(1)
 await page.locator('.plan-pagination').getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(5)
 for(const job of bulk.slice(100))await call('schedule.delete',{id:job.id})
 await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(100);await expect(page.locator('.plan-pagination')).toContainText('1–100 of 100')
 pass('105-row pagination exposes off-page tags and recovers when the last page is deleted')
 assert.deepEqual((await call('session.list')).sessions.map(card=>({id:card.id,group:card.group,cwd:card.cwd,engine:card.engine,avatar:card.avatar})),original);assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
}finally{fs.writeFileSync(path.join(output,'ui-scenarios.json'),JSON.stringify({checks,rendererErrors:errors},null,2));await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
