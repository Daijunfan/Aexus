// Real Web/Electron renderers + disposable Core; initialized employees use deterministic native fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'electron-vite'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),logs=['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md']
if(process.getuid?.()===0){const{uid,gid}=fs.statSync(root);for(const file of [...logs,'test/plan-authority-ui-test.mjs'])fs.chownSync(path.join(root,file),uid,gid);process.setgroups([gid]);process.setgid(gid);process.setuid(uid);const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})}
const out=path.join(root,'artifacts/plan-authority'),application=path.join(out,'application');fs.mkdirSync(application,{recursive:true})
const note=text=>{console.log(text);for(const file of logs)fs.appendFileSync(path.join(root,file),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
if(!process.argv.includes('--skip-build')){
 fs.writeFileSync(path.join(application,'package.json'),fs.readFileSync(path.join(root,'package.json')))
 for(const name of ['node_modules','bin','docs','Agents-Managers','Modules','build','src','API.md','ARCHITECTURE.md','AGENTS.md','PERMISSIONS.md','PLAN.md','SCHEDULER.md','PLUGIN_SPEC.md','README.md','engine-downloads.json'])if(!fs.existsSync(path.join(application,name))&&fs.existsSync(path.join(root,name)))fs.symlinkSync(path.join(root,name),path.join(application,name))
 const config=path.join(out,'build.config.mjs');fs.writeFileSync(config,`import original from ${JSON.stringify(path.join(root,'electron.vite.config.ts'))};export default Object.fromEntries(Object.entries(original).map(([part,value])=>[part,{...value,build:{...value.build,outDir:${JSON.stringify(application)}+'/out/'+part,emptyOutDir:true}}]));`)
 await build({configFile:config,logLevel:'warn'});note('PASS 隔离全应用构建：Plan 专用 artifacts 目录；未覆盖根 out/ 或正式应用。')
}
async function run(native){
 const mode=native?'desktop':'web',probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,cmd+': '+result.error);return result.data}
 let browser,app,page;const errors=[],report={passed:false,mode,platform:process.platform,checks:[],errors}
 const check=text=>{report.checks.push(text);note('PASS '+mode+'：'+text)}
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{plan:{theme:'white'},messages:{theme:'violet'}}})
  await f.cli('group','add','Newsroom');const a=await f.create('Aster','Newsroom'),b=await f.create('Rowan','Newsroom','manager')
  const channel=await rpc('channel.create',{name:'Research desk',engine:{kind:'employees',employeeIds:[a.id,b.id]}})
  if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application],env});page=await app.firstWindow()}
  else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
  page.setDefaultTimeout(15000);await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',error=>errors.push(error.message));await expect(page.locator('.infinite-canvas')).toBeVisible()
  await page.getByRole('button',{name:'Messages',exact:true}).click();await page.locator('.message-contact[data-channel="'+channel.id+'"]').click();await page.locator('.channel-conversation').getByRole('button',{name:'Manage channels and authors',exact:true}).click()
  const outer=page.locator('.channel-sources-dialog'),plans=outer.locator('.channel-plans'),editor=page.locator('.plan-editor-overlay > .plan-editor'),field=name=>editor.locator('[name=plan-'+name+']'),button=name=>editor.getByRole('button',{name,exact:true})
  await outer.getByRole('button',{name:'Channel settings',exact:true}).click();await expect(plans.getByText('No publishing schedule. Automatic publishing is not configured.',{exact:true})).toBeVisible()
  await plans.getByRole('button',{name:'Add publishing schedule',exact:true}).click();await expect(field('employee')).toHaveValue(a.id);await expect(editor.getByText('Publishing channel: Research desk')).toBeVisible();await field('name').press('Escape');await expect(editor).toHaveCount(0);await expect(outer).toBeVisible();assert.equal((await rpc('schedule.list')).length,0)
  await plans.getByRole('button',{name:'Add publishing schedule',exact:true}).click();await field('name').fill('Channel recurring report');await field('prompt').fill('Research and publish a source-linked report.');await field('mode').selectOption('interval');await field('amount').fill('45');await field('unit').selectOption('60');await field('enabled').uncheck();await button('Create schedule').click();await expect(editor).toHaveCount(0)
  const recurring=(await rpc('plan.query',{filter:{channel:channel.id}})).rows[0];assert.equal(recurring.action.channelId,channel.id);assert.equal(recurring.rule.everySeconds,2700);assert.equal(recurring.enabled,false);await expect(plans.locator('[data-channel-plan]')).toHaveCount(1)
  await plans.locator('[data-channel-plan="'+recurring.id+'"]').click();await field('mode').selectOption('monthly');await field('month-day').selectOption('last');await field('time').fill('09:15');await button('Save changes').click();await expect(editor).toHaveCount(0);const edited=await rpc('schedule.get',{id:recurring.id});assert.equal(edited.rule.kind,'monthly');assert.equal(edited.revision,recurring.revision+1);assert.equal((await rpc('schedule.list')).length,1)
  check('频道共用完整 PlanEditor；ESC 仅关闭内层，创建/修改复用同一记录，无隐式启动；间隔改月末规则成功。')
  await plans.getByRole('button',{name:'Add publishing schedule',exact:true}).click();await field('name').fill('Signal publication');await field('mode').selectOption('event');await field('cooldown').fill('0');await button('Validate event rule').click();await expect(editor.locator('.plan-preview-empty')).toContainText('Event rule valid');await page.screenshot({path:path.join(out,mode+'-channel-event-editor.png'),animations:'disabled'});await button('Create schedule').click();await expect(editor).toHaveCount(0)
  const event=(await rpc('plan.query',{filter:{channel:channel.id}})).rows.find(row=>row.rule.kind==='event');assert.equal(event.nextAt,null);assert.equal(event.status,'scheduled');await expect(plans.locator('[data-channel-plan]')).toHaveCount(2)
  await outer.getByRole('button',{name:'Close channel management',exact:true}).click();await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-table [data-plan-id]')).toHaveCount(2);await expect(page.locator('.plan-table [data-plan-id="'+event.id+'"]')).toContainText('Waiting for event')
  await page.getByRole('button',{name:'New schedule',exact:true}).click();await field('name').fill('One-time reminder');await field('employee').selectOption(b.id);await field('prompt').fill('ONE_TIME_UI_FIXTURE');await field('mode').selectOption('after');await field('amount').fill('60');await field('unit').selectOption('60');await field('enabled').uncheck();await button('Create schedule').click();await expect(editor).toHaveCount(0);assert.equal((await rpc('schedule.list')).length,3)
  await page.locator('.plan-table [data-plan-id="'+recurring.id+'"]').click();await field('name').fill('Unsaved local change');const current=await rpc('schedule.get',{id:recurring.id});await rpc('schedule.update',{id:current.id,patch:{name:'Concurrent change'},expectedRevision:current.revision});await button('Save changes').click();await expect(editor.locator('[role=alert]')).toContainText('Schedule changed');assert.equal((await rpc('schedule.get',{id:current.id})).name,'Concurrent change');await button('Load latest').click();await expect(field('name')).toHaveValue('Concurrent change');await field('prompt').fill('Revised brief from Plan');await button('Save changes').click();await expect(editor).toHaveCount(0);assert.equal((await rpc('schedule.get',{id:current.id})).action.channelId,channel.id)
  check('频道任务在 Plan 直接可见且可编辑；一次性/重复/事件同库，频道关联保留，过期修订拒绝覆盖并可加载最新。')
  const tab=name=>page.getByRole('tab',{name,exact:true})
  for(const name of ['Board','List','Gallery']){await tab(name).click();await expect(page.locator('.plan-view [data-plan-id="'+event.id+'"]')).toContainText('Waiting for event')}
  for(const name of ['Timeline','Calendar','Planner','Chart','Feed','Form']){await tab(name).click();await expect(page.locator('.plan-view')).toBeVisible();assert.equal(await page.locator('.plan-view .plan-error').count(),0)}
  await tab('Table').click();await page.screenshot({path:path.join(out,mode+'-plan-wide.png'),animations:'disabled'})
  const one=(await rpc('schedule.list')).find(job=>job.name==='One-time reminder');assert.equal(one.rule.kind,'once');assert.deepEqual(await rpc('schedule.history'),[])
  check('十种 Plan 布局可切换；等待事件明确显示，日历不伪造事件日期，访问界面未启动任务。')
  if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,900));else await page.setViewportSize({width:390,height:844})
  await page.locator('.plan-table [data-plan-id="'+event.id+'"]').click();await field('mode').selectOption('event');await field('event').selectOption('channel.posted');assert.equal(await field('event-channel').locator('option[value="'+channel.id+'"]').count(),0,'no feedback source equals publishing destination');await field('event').selectOption('signal')
  await rpc('settings.set',{language:'zh-CN',viewAppearance:{plan:{theme:'midnight'}}});await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');await expect(field('mode').locator('option:checked')).toHaveText('事件发生时')
  await field('mode').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,mode+'-event-compact-dark.png'),animations:'disabled'})
  const geometry=await editor.evaluate(el=>{const box=el.getBoundingClientRect();return {width:innerWidth,inside:box.left>=-1&&box.right<=innerWidth+1,overflow:el.scrollWidth>el.clientWidth+1,controlsOutside:[...el.querySelectorAll('input,select,textarea,button')].filter(node=>{const r=node.getBoundingClientRect();return r.width>0&&(r.left<box.left-1||r.right>box.right+1)}).map(node=>node.getAttribute('name')||node.textContent)}})
  assert.equal(geometry.inside,true);assert.equal(geometry.overflow,false);assert.deepEqual(geometry.controlsOutside,[]);report.compact=geometry;await field('mode').press('Escape');await expect(editor).toHaveCount(0)
  assert.deepEqual(errors,[]);assert.deepEqual(await rpc('terminal.list'),[]);if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
  check('中英文/深色/窄窗口通过；编辑器与控件无水平越界；隐藏桌面端和无头 Web 未触碰真实环境。');report.passed=true
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(out,mode+'-failure.png')}).catch(()=>{});note('FAIL '+mode+' UI：'+error.message);throw error}finally{await app?.close();await browser?.close();await f.close();fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2))}
}
await run(false);await run(true)
