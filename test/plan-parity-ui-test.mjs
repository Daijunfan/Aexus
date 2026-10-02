// Regression replay of the interactive findings; this file is not the manual-test evidence.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-parity-ui-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1500',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),tab=name=>page.getByRole('tab',{name,exact:true}),editor=page.locator('.plan-editor-overlay > .plan-editor')
try{
  await page.locator('.infinite-canvas').waitFor();await call('settings.set',{viewAppearance:{plan:{theme:'white'}}})
  await call('group.add',{name:'Release Studio'});await call('group.add',{name:'Operations'})
  const a=await call('card.create',{title:'Alex',group:'Release Studio',engine:'codex',model:'gpt-6-luna',avatar:'byte'}),b=await call('card.create',{title:'Alex',group:'Operations',engine:'codex',model:'gpt-6-luna',avatar:'marmalade'})
  await expect.poll(async()=>(await call('session.status')).every(card=>card.initialization?.status==='ready')).toBe(true)
  await page.getByRole('button',{name:'Plan',exact:true}).click()
  assert.deepEqual(await page.locator('.plan-view-tabs [role=tab]').allTextContents(),['Table','Board','Timeline','Calendar','Planner','List','Gallery','Chart','Feed','Form'])
  await tab('Form').click();const form=page.locator('.plan-inline-form')
  await form.locator('[name=plan-name]').fill('Review / 发布说明');await form.locator('[name=plan-prompt]').fill('Review the release notes.\nDo not publish without approval.')
  await expect(form.getByRole('button',{name:'Create schedule',exact:true})).toBeDisabled()
  await form.locator('[name=plan-employee]').selectOption(a.id);await form.locator('[name=plan-enabled]').uncheck();await form.locator('[name=plan-duration]').fill('90')
  await tab('Gallery').click();await tab('Form').click();await expect(form.locator('[name=plan-name]')).toHaveValue('Review / 发布说明');await expect(form.locator('[name=plan-duration]')).toHaveValue('90')
  await form.getByRole('button',{name:'Create schedule',exact:true}).dblclick();await expect(page.locator('.plan-form-success')).toContainText('Review / 发布说明')
  const saved=(await call('schedule.list'))[0];assert.equal((await call('schedule.list')).length,1);assert.equal(saved.enabled,false);assert.equal(saved.plan.durationMinutes,90)
  await page.getByRole('button',{name:'Open saved schedule',exact:true}).click();await expect(editor.locator('[name=plan-name]')).toHaveValue(saved.name);await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
  // A future New York fall-back day has two 01:00 labels, and three elapsed hours end at 02:30.
  const year=new Date().getUTCFullYear()+1,november=new Date(Date.UTC(year,10,1)),day=1+(7-november.getUTCDay())%7,key=`${year}-11-${String(day).padStart(2,'0')}`
  const dst=await call('schedule.create',{spec:{name:'Fallback-night evidence review',action:{type:'agent',employeeId:b.id,prompt:'Rehearsal evidence only.'},rule:{kind:'once',at:key+'T00:30:00-04:00'},timeoutSeconds:60,plan:{priority:'high',tags:['night'],notes:'Estimate is independent of timeout.',durationMinutes:180}}})
  await tab('Timeline').click();await page.getByRole('combobox',{name:'Timeline scale'}).selectOption('day');await page.getByRole('combobox',{name:'Time view zone'}).selectOption('America/New_York');await page.getByRole('textbox',{name:'Visible date'}).fill(key)
  const bar=page.locator(`[data-timeline-job="${dst.id}"] .plan-timeline-bar`);await expect(bar).toBeVisible();await expect(page.locator('.plan-timeline-axis>div>span')).toHaveCount(25)
  assert.equal((await page.locator('.plan-timeline-axis>div>span').allTextContents()).filter(text=>text.startsWith('01:00')).length,2)
  const projection=await call('plan.timeline',{from:key+'T00:00:00-04:00',to:key+'T23:59:59-05:00',timezone:'America/New_York'});assert.equal(projection.events[0].estimatedMinutes,180);assert.equal(Date.parse(projection.events[0].endAt)-Date.parse(projection.events[0].startAt),10800000)
  const box=await bar.boundingBox();await page.mouse.move(box.x+10,box.y+12);await page.mouse.down();await page.mouse.move(box.x+82,box.y+12,{steps:6});await page.mouse.up()
  await expect(page.getByRole('dialog',{name:'Confirm schedule move',exact:true})).toBeVisible();await page.getByRole('button',{name:'Keep original',exact:true}).click();assert.equal((await call('schedule.get',{id:dst.id})).rule.at,dst.rule.at)
  await tab('Planner').click();await page.getByRole('combobox',{name:'Time view zone'}).selectOption('America/New_York');await page.getByRole('textbox',{name:'Visible date'}).fill(key);await page.getByRole('combobox',{name:'Planner mode'}).selectOption('day');await expect(page.locator('.plan-planner-event')).toContainText('Fallback-night evidence review')
  await tab('Gallery').click();await expect(page.locator('.plan-gallery-card')).toHaveCount(2);await page.locator(`[data-plan-id="${dst.id}"]`).click();await expect(editor.locator('[name=plan-duration]')).toHaveValue('180');await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
  await tab('Chart').click();await expect(page.locator('[data-analytics-total]')).toHaveText('2');await page.getByRole('combobox',{name:'Chart grouping'}).selectOption('employee');await page.getByRole('combobox',{name:'Chart style'}).selectOption('donut')
  await expect(page.locator('.plan-chart-legend')).toContainText('Alex · Release Studio');await expect(page.locator('.plan-chart-legend')).toContainText('Alex · Operations')
  await page.getByRole('combobox',{name:'Chart metric'}).selectOption('runs');await expect(page.getByText('No matching data',{exact:true})).toBeVisible()
  await tab('Table').click();await page.getByRole('button',{name:saved.name,exact:true}).click();fs.writeFileSync(path.join(control,a.id+'.hold-user'),'')
  await editor.getByRole('button',{name:'Run now',exact:true}).click();await editor.getByRole('button',{name:'Confirm run',exact:true}).click();await expect(editor).toHaveCount(0)
  await tab('Feed').click();await page.getByRole('combobox',{name:'Feed outcome'}).selectOption('running');await expect(page.locator('.plan-feed-item')).toHaveCount(1)
  await page.getByRole('button',{name:saved.name,exact:true}).click();await editor.getByRole('button',{name:'Cancel run',exact:true}).click();await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
  await expect(page.locator('.plan-feed-item')).toHaveCount(0);await page.getByRole('combobox',{name:'Feed outcome'}).selectOption('cancelled');await expect(page.locator('.plan-feed-item')).toHaveCount(1);fs.rmSync(path.join(control,a.id+'.hold-user'))
  await page.getByRole('button',{name:saved.name,exact:true}).click();await editor.getByRole('button',{name:'Remove schedule',exact:true}).click();await editor.locator('.plan-confirm').getByRole('button',{name:'Delete schedule',exact:true}).click();await expect(page.locator('.plan-feed-item')).toContainText('Schedule removed · history preserved')
  await tab('Timeline').click();await page.getByRole('combobox',{name:'Time view zone'}).selectOption('Europe/London');await page.getByRole('combobox',{name:'Timeline scale'}).selectOption('month')
  await page.getByRole('button',{name:'Save a Plan view',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Save Plan view',exact:true});await dialog.getByRole('textbox').fill('Europe calendar desk');await dialog.getByRole('button',{name:'Save view',exact:true}).click()
  await page.reload();await expect(tab('Europe calendar desk')).toHaveAttribute('aria-selected','true');await expect(page.getByRole('combobox',{name:'Time view zone'})).toHaveValue('Europe/London');await expect(page.getByRole('combobox',{name:'Timeline scale'})).toHaveValue('month')
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900));await tab('Form').scrollIntoViewIfNeeded();await tab('Form').click();await expect(page.locator('.plan-inline-form')).toBeVisible()
  await call('settings.set',{viewAppearance:{plan:{theme:'black'}}});await expect(page.locator('html')).toHaveAttribute('data-theme','black');assert.deepEqual(errors,[])
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
  console.log('PASS interactive-finding regressions: ten actual layouts, Form draft and retry, DST timeline and estimates, cancellable drag, Planner/Gallery, same-name chart buckets, actual-only Feed transition/deletion, saved options and narrow/dark UI')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
