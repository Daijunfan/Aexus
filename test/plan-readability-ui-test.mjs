// Ten source Plan views over a real disposable Core. Native work uses a deterministic fixture only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {build as bundle} from 'esbuild'
import {build} from 'vite'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'

const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-readable-'))),desktop=process.argv.includes('--desktop'),captureOnly=process.argv.includes('--capture-only')
const application=desktop?process.env.AGENTS_COMPANY_TEST_APP:undefined
assert.ok(!application||captureOnly,'Actual bundle mode supports --desktop --capture-only; fault injection stays in the source fixture')
const mode=application?'bundle':desktop?'desktop':'web',out=path.join(root,'artifacts/plan-readability',mode)
const layouts=['table','board','timeline','calendar','plan','list','gallery','chart','feed','form']
const surfaces={table:'.plan-table',board:'.plan-board',timeline:'.plan-timeline-scroll',calendar:'.plan-calendar',plan:'.plan-planner-days',list:'.plan-task-list',gallery:'.plan-gallery',chart:'.plan-chart-view',feed:'.plan-feed-view',form:'.plan-inline-form'}
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f,browser,app,page,rpc;const errors=[],checks=[],captures=[],findings=[]
const report={passed:false,mode,scope:application?'Actual supplied application bundle and its Core in an isolated home; deterministic native fixture, no source renderer override.':'Actual source Plan components and isolated Core; deterministic native fixture, no user state or provider.',checks,captures,findings,rendererErrors:errors}
try{
 if(application){
  const control=path.join(temp,'fixture');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
  const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
  for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
  app=await electron.launch({executablePath:application.endsWith('.app')?path.join(application,'Contents/MacOS/Agents Company'):application,args:[],env});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.locator('.infinite-canvas').waitFor()
  rpc=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
  const until=async(check,label)=>{for(let i=0;i<250;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,40))}throw Error('Timeout '+label)}
  f={control,env,until,close:async()=>{},create:async(title,group)=>{const card=await rpc('card.create',{title,group,engine:'codex',model:'gpt-6-luna',effort:'low'});await until(async()=>{const status=(await rpc('session.status',{employee:card.id}))[0];if(status.initialization?.status==='failed')throw Error(status.initialization.error);return status.initialization?.status==='ready'},'initialization');return card}}
  report.application=application;const bundleRoot=application.endsWith('.app')?application:application.includes('.app/')?application.slice(0,application.indexOf('.app/')+4):path.dirname(application),asar=path.join(bundleRoot,bundleRoot.endsWith('.app')?'Contents/Resources/app.asar':'resources/app.asar');if(fs.existsSync(asar))report.asarSha256=createHash('sha256').update(fs.readFileSync(asar)).digest('hex')
 }else{
  const entry=path.join(temp,'daemon.cjs')
  await bundle({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  f=await fixtureCore({},entry)
  rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
 }
 await rpc('group.add',{name:'Product Studio'});await rpc('group.add',{name:'Operations'})
 const alice=await f.create('Aster · 研发','Product Studio'),bob=await f.create('Rowan · 运维','Operations'),removed=await f.create('Previous employee','Product Studio')
 const make=(name,employee,rule,extra={})=>rpc('schedule.create',{spec:{name,action:{type:'agent',employeeId:employee.id,prompt:'Review the specified information and return a concise, factual result.\nKeep complete notes in the original conversation.'},rule,enabled:true,plan:{priority:'normal',tags:['release'],notes:'Clear ownership, accurate dates and retained execution evidence.',durationMinutes:45},...extra}})
 const finished=await make('Release review · 已完成',alice,{kind:'once',at:new Date(Date.now()+900).toISOString()})
 await f.until(async()=>(await rpc('schedule.history',{id:finished.id}))[0]?.status==='succeeded','completed fixture task')
 const short=await make('Retained short run · 保留短执行',removed,{kind:'once',at:new Date(Date.now()+900).toISOString()})
 const shortRun=await f.until(async()=>{const run=(await rpc('schedule.history',{id:short.id}))[0];return run?.status==='succeeded'&&run},'short fixture run')
 await rpc('card.remove',{ids:[removed.id],deleteWorkspace:false})
 const attention=await make('Timeout follow-up · 需要处理',alice,{kind:'interval',everySeconds:3600},{timeoutSeconds:1,plan:{priority:'urgent',tags:['operations'],notes:'A real recorded timeout; reading does not retry it.'}})
 fs.writeFileSync(path.join(f.control,alice.id+'.hold-user'),'');await rpc('schedule.run',{id:attention.id})
 await f.until(async()=>(await rpc('schedule.history',{id:attention.id}))[0]?.status==='timed_out','timed-out fixture task');fs.rmSync(path.join(f.control,alice.id+'.hold-user'))
 const future=await make('Next milestone · 下一里程碑',alice,{kind:'once',at:new Date(Date.now()+7200000).toISOString()},{plan:{priority:'high',tags:['release','planning'],notes:'A longer task description must stay readable without widening the application.\n确认范围、负责人和下一步。',durationMinutes:90}})
 const paused=await make('Paused research · 等待安排',bob,{kind:'interval',everySeconds:3600},{enabled:false,plan:{priority:'low',tags:['research'],notes:'Paused deliberately; do not dispatch it.',durationMinutes:30}})
 const running=await make('Active investigation · 正在执行',bob,{kind:'interval',everySeconds:3600})
 fs.writeFileSync(path.join(f.control,bob.id+'.hold-user'),'');await rpc('schedule.run',{id:running.id})
 await f.until(async()=>(await rpc('schedule.history',{id:running.id}))[0]?.status==='running','running fixture task')
 const data=await rpc('plan.query'),initialRuns=(await rpc('schedule.history',{limit:1000})).map(run=>run.id).sort(),liveBaseline=(await rpc('session.list',{live:true})).length
 assert.deepEqual(new Set(data.rows.map(row=>row.status)),new Set(['scheduled','running','paused','completed','attention']))
 assert.equal(data.rows.find(row=>row.id===short.id).employee,null)
 report.shortRun={id:shortRun.id,jobId:short.id,durationMs:Date.parse(shortRun.finishedAt)-Date.parse(shortRun.startedAt),employeeRemoved:true}
 checks.push('Five real schedule states and retained short execution after removing its temporary employee')

 if(application){await rpc('settings.set',{language:'en',viewAppearance:{plan:{theme:'white'}}});await rpc('view.open',{kind:'plan'});await expect(page.locator('.plan-view')).toBeVisible()}
 else{
 const store=await rpc('session.list')
 fs.writeFileSync(path.join(temp,'index.html'),'<html data-theme="white" data-presentation="plan"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>')
 const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
 fs.writeFileSync(path.join(temp,'fixture.tsx'),[
  'import React,{useState} from "react";import {createRoot} from "react-dom/client";',
  'import {PlanView} from '+JSON.stringify(path.join(renderer,'components/PlanView'))+';',
  'import {setInterfaceLanguage,translate} from '+JSON.stringify(path.join(renderer,'i18n'))+';',styles,
  'window.planText=translate;window.planLanguage=setInterfaceLanguage;setInterfaceLanguage("en");',
  'function Fixture(){const [view,setView]=useState({kind:"plan",revision:1,planViewId:"table"});return <div className="app in-office"><div className="home office-home"><header className="company-header"><strong>Agents Company</strong><span>Plan</span></header><div className="office-layout"><PlanView store={window.planStore} view={view} act={async(cmd,args)=>{const result=await window.agents.call(cmd,args);if(cmd==="view.open")setView(result);return result}}/></div></div></div>}createRoot(document.getElementById("root")).render(<Fixture/>);'
 ].join('\n'))
 await build({configFile:false,root:temp,publicDir:false,esbuild:{jsx:'automatic'},build:{outDir:path.join(temp,'dist'),reportCompressedSize:false},logLevel:'silent'})
 if(desktop){
  const main=path.join(temp,'electron.cjs');fs.writeFileSync(main,'const {app,BrowserWindow}=require("electron");if(process.platform==="darwin")app.setActivationPolicy("prohibited");app.setPath("userData",process.env.AGENTS_COMPANY_HOME);app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1440,height:1000,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});window.loadURL("about:blank")});app.on("window-all-closed",()=>app.quit());')
  const env={...f.env,AGENTS_COMPANY_HOME:path.join(temp,'renderer-home')};delete env.ELECTRON_RUN_AS_NODE
  app=await electron.launch({executablePath:require('electron'),args:[main],env});page=await app.firstWindow()
 }else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'UTC'})}
 page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('planCore',rpc)
 await page.addInitScript(store=>{
  window.planStore=store;window.planCalls=[];window.planFailure='';const listeners=new Set();window.planEvent=channel=>listeners.forEach(fn=>fn({channel,payload:{}}))
  window.agents={mode:'web',platform:'macos',onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},call:async(cmd,args={})=>{
   window.planCalls.push({cmd,args:structuredClone(args)})
   if(cmd==='schedule.run')throw Error('Visual verification cannot start additional work')
   if(window.planFailure===cmd)throw Error('Fixture connection unavailable; try again')
   const result=await window.planCore(cmd,args)
   if(['schedule.create','schedule.update','schedule.pause','schedule.resume','schedule.delete'].includes(cmd))window.planEvent('schedule:changed')
   if(cmd.startsWith('plan.view-'))window.planEvent('plan:changed')
   return result
  }}
 },store)
 await page.route('https://plan-readability.test/**',route=>route.fulfill({path:path.join(temp,'dist',new URL(route.request().url()).pathname.slice(1)||'index.html')}));await page.goto('https://plan-readability.test/')
 }
 const text=key=>application?Promise.resolve(key):page.evaluate(key=>window.planText(key),key),select=async layout=>{const tab=page.locator('.plan-view-tabs [role=tab]').nth(layouts.indexOf(layout));await tab.scrollIntoViewIfNeeded();await tab.click();await expect(tab).toHaveAttribute('aria-selected','true');await expect(page.locator(surfaces[layout])).toBeVisible();await settle()}
 const settle=async()=>{await expect(page.locator('.plan-database-content')).toHaveAttribute('aria-busy','false');await expect.poll(()=>page.locator('.plan-view [aria-busy=true]').count()).toBe(0);await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
 const resize=async(width,height)=>{if(app)await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});else await page.setViewportSize({width,height})}
 const editor=page.locator('.plan-editor-overlay > .plan-editor'),search=page.getByRole('textbox',{name:'Search schedules',exact:true})
 const capture=async(layout,label)=>{
  await settle();const geometry=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,view:document.querySelector('.plan-view').getBoundingClientRect().toJSON()}))
  if(Math.max(geometry.document,geometry.body)>geometry.width+1)findings.push({label,layout,kind:'page-overflow',geometry})
  const file=label+'-'+layout+'.png';await page.screenshot({path:path.join(out,file),animations:'disabled'});captures.push({layout,label,file,geometry})
 }
 const matrix=captureOnly?[['en','white',1440,1000]]:[['en','white',1440,1000],['zh-CN','white',390,844],['zh-CN','black',1440,1000],['en','black',390,844]]
 for(const [language,theme,width,height] of matrix){
  await resize(width,height);if(application)await rpc('settings.set',{language,viewAppearance:{plan:{theme}}});else await page.evaluate(({language,theme})=>{window.planLanguage(language);document.documentElement.dataset.theme=theme},{language,theme})
  for(const layout of layouts){
   await select(layout)
   if(!['table','board','list','gallery'].includes(layout))await expect(page.getByRole('combobox',{name:await text('Sort schedules'),exact:true})).toHaveCount(0)
   if(['timeline','plan'].includes(layout)){
    await page.getByRole('combobox',{name:await text('Time view zone'),exact:true}).selectOption('UTC')
    await page.getByRole('textbox',{name:await text('Visible date'),exact:true}).fill(new Date().toISOString().slice(0,10))
    if(layout==='timeline')await page.getByRole('combobox',{name:await text('Timeline scale'),exact:true}).selectOption('day')
   }
   if(layout==='timeline'&&width===390){
    await settle();const card=page.locator('[data-time-event="'+shortRun.id+'"] .plan-time-event-card');const geometry=await card.evaluate(node=>{const scroller=node.closest('.plan-timeline-scroll').getBoundingClientRect(),label=node.closest('.plan-timeline-row').querySelector('.plan-timeline-label').getBoundingClientRect(),card=node.getBoundingClientRect(),outcome=node.querySelector('.plan-run-outcome').getBoundingClientRect();return {scroller:scroller.toJSON(),label:label.toJSON(),card:card.toJSON(),outcome:outcome.toJSON()}});assert.ok(geometry.card.left>=geometry.label.right-1&&geometry.card.right<=geometry.scroller.right+1,JSON.stringify(geometry));assert.ok(geometry.outcome.left>=geometry.label.right-1&&geometry.outcome.right<=geometry.scroller.right+1,'The real outcome must fit in the narrow visible timeline track')
   }
   if(layout==='feed'){
    const retained=page.locator('[data-run-id="'+shortRun.id+'"]');await expect(retained).toContainText(await text('Removed employee'));assert.equal(await retained.locator('.plan-feed-conversation').count(),0)
   }
   if(layout==='chart')await expect(page.locator('[data-analytics-total]')).toHaveText(String(data.total))
   await capture(layout,language+'-'+theme+'-'+width)
   if(layout==='timeline'&&language==='en'&&theme==='white'){
    const button=page.locator('[data-time-event="'+shortRun.id+'"]');await expect(button).toBeVisible();await button.scrollIntoViewIfNeeded();await button.click();await expect(editor.locator('[name=plan-name]')).toHaveValue(short.name);await expect(editor.locator('[name=plan-employee]')).toHaveValue(removed.id);await expect(editor).toContainText('Removed employee');await page.screenshot({path:path.join(out,'removed-employee-editor.png'),animations:'disabled'});await editor.getByRole('button',{name:'Close schedule editor',exact:true}).click()
    await page.getByRole('combobox',{name:'Timeline scale',exact:true}).selectOption('week');await capture('timeline','en-white-1440-week');await page.getByRole('combobox',{name:'Timeline scale',exact:true}).selectOption('day')
    checks.push('The actual short run remains clickable and its editor explains the removed employee without fabricating a replacement')
   }
  }
 }
 if(captureOnly){
  await select('table');const row=page.locator('.plan-table [data-plan-id="'+future.id+'"]');await row.focus();await page.keyboard.press('Enter');await expect(editor).toBeVisible();await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);await expect(row).toBeFocused();await page.keyboard.press('Space');await expect(editor).toBeVisible();await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);await expect(row).toBeFocused();checks.push('Immediate Enter/Escape and Space/Escape dismiss the actual editor and restore row focus without added waits')
 }
 if(!captureOnly){
  await select('board');const filters=page.locator('.plan-filter-toggle'),fields=page.locator('.plan-filter-fields');await expect(filters).toHaveAttribute('aria-expanded','false');await expect(fields).toBeHidden();await filters.click();await expect(fields).toBeVisible();await page.getByRole('combobox',{name:'Filter by Team',exact:true}).selectOption('Product Studio');await page.getByRole('combobox',{name:'Group board by',exact:true}).selectOption('priority');await settle();await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount((await rpc('plan.query',{filter:{team:'Product Studio'}})).total);await expect(page.locator('[data-plan-column=urgent]')).toContainText(attention.name);await expect(filters.locator('b')).toHaveText('1');await capture('board','mobile-filters-expanded');await filters.click();await expect(fields).toBeHidden();await expect(filters.locator('b')).toHaveText('1');await filters.click();await page.getByRole('button',{name:'Clear filters',exact:true}).click();await settle();await expect(page.locator('.plan-board [data-plan-id]')).toHaveCount(data.total);await expect(filters.locator('b')).toHaveCount(0);await filters.click();await expect(fields).toBeHidden();assert.ok((await page.locator('.plan-board [data-plan-id]').first().boundingBox()).y<633,'Collapsed controls leave actual task content in the first narrow screen');await capture('board','mobile-filters-collapsed');checks.push('Narrow filters expand, apply, retain their count when closed, and clear without hiding first-screen task content')
  await select('table');const tableRow=page.locator('[data-plan-id="'+future.id+'"]');assert.ok((await tableRow.locator('td').first().boundingBox()).width<=178);await tableRow.locator('.plan-person').evaluate(node=>{const scroller=node.closest('.plan-database-content'),fixed=node.closest('tr').querySelector('td').getBoundingClientRect();scroller.scrollLeft+=node.getBoundingClientRect().left-fixed.right-6});const employeeColumn=await tableRow.locator('.plan-person').evaluate(node=>({content:node.getBoundingClientRect().toJSON(),fixed:node.closest('tr').querySelector('td').getBoundingClientRect().toJSON(),scroller:node.closest('.plan-database-content').getBoundingClientRect().toJSON()}));assert.ok(employeeColumn.content.left>=employeeColumn.fixed.right-1&&employeeColumn.content.right<=employeeColumn.scroller.right+1,JSON.stringify(employeeColumn));await capture('table','mobile-employee-column');await page.locator('.plan-database-content').evaluate(node=>node.scrollLeft=0);checks.push('The narrow sticky task column leaves room to read the employee after horizontal scrolling')
  await resize(1440,1000);await page.evaluate(()=>{window.planLanguage('en');document.documentElement.dataset.theme='white'});await select('table')
  const tabs=page.locator('.plan-view-tabs [role=tab]');await tabs.first().focus();await page.keyboard.press('ArrowRight');await expect(tabs.nth(1)).toBeFocused();await expect(tabs.nth(1)).toHaveAttribute('aria-selected','true');await page.keyboard.press('End');await expect(tabs.nth(9)).toBeFocused();await expect(tabs.nth(9)).toHaveAttribute('aria-selected','true');await expect(page.getByRole('textbox',{name:'Search schedules',exact:true})).toHaveCount(0);await page.keyboard.press('Home');await expect(tabs.first()).toBeFocused();await expect(tabs.first()).toHaveAttribute('aria-selected','true');assert.equal(await page.locator('.plan-view-tabs [role=tab][tabindex="0"]').count(),1);await expect(tabs.first()).toHaveAttribute('tabindex','0');await settle()
  checks.push('Plan tabs support arrow/Home/End selection and focus; Form hides unrelated filters')
  await page.locator('[data-plan-id="'+future.id+'"]').getByRole('button',{name:future.name,exact:true}).click();await expect(editor).toBeVisible();await editor.locator('[name=plan-notes]').fill('Saved through the actual Core editor. 中文备注。');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0)
  const saved=await rpc('schedule.get',{id:future.id});assert.equal(saved.plan.notes,'Saved through the actual Core editor. 中文备注。');assert.deepEqual(saved.action,future.action);assert.deepEqual(saved.rule,future.rule)
  checks.push('Editing persists notes without changing the assigned employee, prompt or execution clock')
  await select('calendar');const emptyDay=page.locator('.plan-calendar-day:not(:has(.calendar-event))').first(),emptyDate=await emptyDay.getAttribute('data-plan-date');await emptyDay.locator('.plan-day-number').click();await expect(page.locator('.plan-day-agenda > header h2')).toHaveText(new Date(emptyDate+'T12:00:00Z').toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}));await expect(page.locator('.plan-day-event')).toHaveCount(0);await page.locator('.plan-day-agenda').getByRole('button',{name:'Close day agenda',exact:true}).click();checks.push('An empty calendar date opens its actual day agenda')
  for(const layout of layouts.filter(layout=>layout!=='form')){
   await select(layout);await search.fill('NO_MATCHING_PLAN_FIXTURE');await settle();if(layout==='calendar'){await expect(page.locator('.calendar-event')).toHaveCount(0);await expect(page.locator('.plan-day-number')).toHaveCount(42)}else await expect(page.locator('.plan-empty:visible,.plan-column-empty:visible').first()).toBeVisible();await capture(layout,'empty-en-white');await search.fill('');await settle()
  }
  checks.push('Read layouts show empty states or the interactive empty calendar; unmatched search creates no fake activity')
  const commands={table:'plan.query',board:'plan.query',timeline:'plan.timeline',calendar:'plan.calendar',plan:'plan.timeline',list:'plan.query',gallery:'plan.query',chart:'plan.analytics',feed:'plan.feed'}
  for(const [layout,command] of Object.entries(commands)){
   await select(layout);await page.evaluate(command=>{window.planFailure=command;window.planEvent('schedule:changed')},command);const alert=page.getByRole('alert').filter({hasText:'Fixture connection unavailable'});await expect(alert).toBeVisible();await capture(layout,'error-en-white');await page.evaluate(()=>window.planFailure='');if(command==='plan.query'||command==='plan.calendar')await alert.getByRole('button',{name:'Retry',exact:true}).click();else await page.evaluate(()=>window.planEvent('schedule:changed'));await settle();await expect(alert).toHaveCount(0)
  }
  await select('form');const form=page.locator('.plan-inline-form');await form.locator('[name=plan-name]').fill('Saved form task · 确認');await form.locator('[name=plan-employee]').selectOption(alice.id);await form.locator('[name=plan-prompt]').fill('A paused form task, not a model request.');await form.locator('[name=plan-enabled]').uncheck();await page.evaluate(()=>window.planFailure='schedule.create');await form.getByRole('button',{name:'Create schedule',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Fixture connection unavailable');await expect(form.locator('[name=plan-name]')).toHaveValue('Saved form task · 确認');await page.evaluate(()=>window.planFailure='');await form.getByRole('button',{name:'Create schedule',exact:true}).click();await expect(page.locator('.plan-form-success')).toContainText('Saved form task');assert.equal((await rpc('schedule.list')).find(job=>job.name==='Saved form task · 确認').enabled,false)
  checks.push('View errors recover; Form failure keeps its draft and saves a paused task through Core')
 }
 assert.deepEqual((await rpc('schedule.history',{limit:1000})).map(run=>run.id).sort(),initialRuns,'Rendering/editing creates no extra execution history')
 assert.equal((await rpc('session.list',{live:true})).length,liveBaseline);assert.deepEqual(errors,[])
 if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 if(!captureOnly)assert.deepEqual(findings,[],'Only internal view surfaces may scroll horizontally')
 report.passed=!findings.length;report.captureOnly=captureOnly;report.fixtureJobs={finished:finished.id,short:short.id,attention:attention.id,future:future.id,paused:paused.id,running:running.id}
 console.log((report.passed?'PASS':'CAPTURED')+' '+mode+': '+captures.length+' Plan captures, '+checks.length+' acceptance groups, '+findings.length+' geometry findings')
}catch(error){report.error=error.message;await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}
finally{fs.writeFileSync(path.join(out,captureOnly?'capture.json':'verification.json'),JSON.stringify(report,null,2));await app?.close();await browser?.close();await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
