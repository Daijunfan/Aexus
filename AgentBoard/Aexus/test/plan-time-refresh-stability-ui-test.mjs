// Regression: a background Plan refresh (generation bump after a schedule change)
// must not insert vertical space above an already-populated Timeline or Planner,
// and the original drag must still land on the bar and open the move confirmation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-refresh-stability-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1500',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),tab=name=>page.getByRole('tab',{name,exact:true})
// Sample the scroller's viewport top every frame for a fixed measurement window so a
// transient layout flash during a refresh is captured, then wait for the refresh to land.
const refreshStability=async(scrollSelector,trigger,landedOf)=>{
  await page.evaluate(scrollSelector=>{
    window.__samples=[];window.__samplesDone=false;const t0=performance.now()
    const grab=()=>{
      const scroller=document.querySelector(scrollSelector),loader=document.querySelector('.plan-time-loading')
      window.__samples.push({t:Math.round(performance.now()-t0),top:scroller?Math.round(scroller.getBoundingClientRect().top):null,loader:!!loader})
      if(performance.now()-t0<2000)requestAnimationFrame(grab);else window.__samplesDone=true
    }
    requestAnimationFrame(grab)
  },scrollSelector)
  const id=await trigger()
  await expect(landedOf(id)).toBeVisible()
  await page.waitForFunction(()=>window.__samplesDone,{timeout:6000})
  return page.evaluate(()=>window.__samples)
}
try{
  await page.locator('.infinite-canvas').waitFor();await call('settings.set',{viewAppearance:{plan:{theme:'white'}}})
  await call('group.add',{name:'Release Studio'})
  const a=await call('card.create',{title:'Alex',group:'Release Studio',engine:'codex',model:'gpt-6-luna',avatar:'byte'})
  await expect.poll(async()=>(await call('session.status')).every(card=>card.initialization?.status==='ready')).toBe(true)
  await page.getByRole('button',{name:'Plan',exact:true}).click()
  await expect(page.locator('.plan-view-tabs [role=tab]')).toHaveText(['Table','Board','Timeline','Calendar','Planner','List','Gallery','Chart','Feed','Form'])
  const year=new Date().getUTCFullYear()+1,november=new Date(Date.UTC(year,10,1)),day=1+(7-november.getUTCDay())%7,key=`${year}-11-${String(day).padStart(2,'0')}`
  const dst=await call('schedule.create',{spec:{name:'Fallback-night evidence review',action:{type:'agent',employeeId:a.id,prompt:'Rehearsal evidence only.'},rule:{kind:'once',at:key+'T00:30:00-04:00'},timeoutSeconds:60,plan:{priority:'high',tags:['night'],notes:'Estimate is independent of timeout.',durationMinutes:180}}})
  await tab('Timeline').click();await page.getByRole('combobox',{name:'Timeline scale'}).selectOption('day');await page.getByRole('combobox',{name:'Time view zone'}).selectOption('America/New_York');await page.getByRole('textbox',{name:'Visible date'}).fill(key)
  const bar=page.locator(`[data-timeline-job="${dst.id}"] .plan-timeline-bar`);await expect(bar).toBeVisible()
  // The original 72px drag must still land on the bar and open the confirmation.
  const before=await call('schedule.get',{id:dst.id})
  const box=await bar.boundingBox();await page.mouse.move(box.x+10,box.y+12);await page.mouse.down();await page.mouse.move(box.x+82,box.y+12,{steps:6});await page.mouse.up()
  await expect(page.getByRole('dialog',{name:'Confirm schedule move',exact:true})).toBeVisible();await page.getByRole('button',{name:'Keep original',exact:true}).click();assert.equal((await call('schedule.get',{id:dst.id})).rule.at,before.rule.at)
  // Timeline: a same-day schedule change forces a refresh; the layout must not move and no in-flow loader may appear.
  const timelineSamples=await refreshStability('.plan-timeline-scroll',async()=>{const probe=await call('schedule.create',{spec:{name:'Timeline refresh probe',action:{type:'agent',employeeId:a.id,prompt:'Refresh probe only.'},rule:{kind:'once',at:key+'T12:00:00-05:00'},timeoutSeconds:60,plan:{durationMinutes:30}}});return probe.id},id=>page.locator(`[data-timeline-job="${id}"] .plan-timeline-bar`))
  const timelineTops=new Set(timelineSamples.map(sample=>sample.top))
  assert.equal(timelineTops.size,1,'timeline must not shift vertically during a background refresh; observed tops '+JSON.stringify([...timelineTops]))
  assert.ok(!timelineSamples.some(sample=>sample.loader),'no in-flow loading indicator may render above a populated timeline')
  // Planner (adjacent case): same no-shift guarantee during a refresh.
  await tab('Planner').click();await page.getByRole('combobox',{name:'Time view zone'}).selectOption('America/New_York');await page.getByRole('textbox',{name:'Visible date'}).fill(key);await page.getByRole('combobox',{name:'Planner mode'}).selectOption('day');await expect(page.locator('.plan-planner-event',{hasText:'Fallback-night evidence review'})).toBeVisible()
  const plannerSamples=await refreshStability('.plan-planner-scroll',async()=>{const probe2=await call('schedule.create',{spec:{name:'Planner refresh probe',action:{type:'agent',employeeId:a.id,prompt:'Refresh probe only.'},rule:{kind:'once',at:key+'T13:00:00-05:00'},timeoutSeconds:60,plan:{durationMinutes:30}}});return probe2.id},()=>page.locator('.plan-planner-event',{hasText:'Planner refresh probe'}))
  const plannerTops=new Set(plannerSamples.map(sample=>sample.top))
  assert.equal(plannerTops.size,1,'planner must not shift vertically during a background refresh; observed tops '+JSON.stringify([...plannerTops]))
  assert.ok(!plannerSamples.some(sample=>sample.loader),'no in-flow loading indicator may render above a populated planner')
  assert.deepEqual(errors,[])
  console.log('PASS plan background-refresh stability: populated Timeline/Planner keep their layout and stay draggable while a schedule change refreshes data')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
