// Real Core + Web/hidden Electron, using deterministic native SDK fixtures and disposable state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),logs=['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md']
if(process.getuid?.()===0){const{uid,gid}=fs.statSync(root);for(const file of [...logs,'test/employee-view-refresh-ui-test.mjs','src/renderer/src/styles/employee-workbench.css'])fs.chownSync(path.join(root,file),uid,gid);process.setgroups([gid]);process.setgid(gid);process.setuid(uid);const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})}
const out=path.join(root,'artifacts/employee-view-refresh');fs.mkdirSync(out,{recursive:true})
const note=text=>{console.log(text);for(const file of logs)fs.appendFileSync(path.join(root,file),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
const built=await profileApplication();note('PASS 独立 main/preload/renderer 构建，未覆盖根 out/，未打包或安装。')
async function run(native){
 const mode=native?'desktop':'web',probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-view-refresh-')),f=await fixtureCore({CLAUDE_CONFIG_DIR:path.join(temp,'claude'),...(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})},path.join(built.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,cmd+': '+result.error);return result.data}
 const report={passed:false,mode,platform:process.platform,checks:[],errors:[],paidModelCalls:0,productionDataUsed:false};let browser,app,page
 const pass=text=>{report.checks.push(text);note('PASS '+mode+'：'+text)}
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'violet'},plan:{theme:'white'}}})
  await rpc('engine.configure',{engine:'claude',patch:{sdkPath:path.join(root,'test/fixtures/discussion-claude-sdk.mjs')}})
  await rpc('group.add',{name:'Product studio'});await rpc('group.add',{name:'Research studio'})
  const a=await rpc('card.create',{title:'Mira',group:'Product studio',engine:'claude',model:'fixture-claude',managementRole:'secretary',thinking:false,avatar:'byte',profession:'Coordinate the team, review progress and keep the work organized.'});await f.ready(a.id)
  const b=await f.create('Researcher','Research studio')
  const group=await rpc('chat.create',{name:'Product review',members:[a.id,b.id]}),channel=await rpc('channel.create',{name:'Research notes',engine:{kind:'employees',employeeIds:[a.id]}})
  const recurring=await rpc('schedule.create',{spec:{name:'Weekly progress review',action:{type:'agent',employeeId:a.id,prompt:'Review team progress.'},rule:{kind:'weekly',days:[1,3,5],time:'09:30',timezone:'Asia/Shanghai'},enabled:false}})
  const signal=await rpc('schedule.create',{spec:{name:'On a review request',action:{type:'agent',employeeId:a.id,prompt:'Prepare a review.'},rule:{kind:'event',event:'signal',cooldownSeconds:60}}})
  await rpc('schedule.create',{spec:{name:'Other employee only',action:{type:'agent',employeeId:b.id,prompt:'Unrelated.'},afterSeconds:86400,enabled:false}})
  if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[built.directory],env});page=await app.firstWindow()}
  else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
  page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.infinite-canvas')).toBeVisible()
  const ui=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),profile=page.locator('.employee-profile-page'),toolbar=page.locator('.employee-details-toolbar'),controls=page.locator('.conversation-layer .session-settings'),tab=name=>profile.getByRole('tab',{name,exact:true}),shot=name=>page.screenshot({path:path.join(out,mode+'-'+name+'.png'),animations:'disabled'})
  await ui('view.open',{kind:'conversation',employee:a.id});await expect(toolbar).toBeVisible();await expect(controls.locator('[data-control=model]')).toBeVisible()
  const back=toolbar.getByRole('button',{name:'Close conversation',exact:true});assert.ok(parseFloat(await back.evaluate(el=>getComputedStyle(el).fontSize))<=14)
  const top=await toolbar.boundingBox(),backBox=await back.boundingBox();assert.ok(backBox.x<=top.x+22)
  const color=locator=>locator.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}))
  assert.notDeepEqual(await color(toolbar.locator('.employee-details')),await color(toolbar.locator('.engine-tools-open')))
  assert.notDeepEqual(await color(controls.locator('[data-control=model] .ctl')),await color(controls.locator('[data-control=effort] .ctl')))
  await controls.locator('[data-control=model] .ctl').click();await expect(controls.locator('[data-control=model] .ctl')).toHaveAttribute('aria-expanded','true');await controls.locator('[data-control=model] .menu-item').first().click()
  await controls.locator('[data-control=thinking]').click();await expect(controls.locator('[data-control=thinking]')).toHaveAttribute('aria-pressed','true');await controls.locator('[data-control=thinking]').click()
  await controls.locator('[data-control=plan]').click();await expect(controls.locator('[data-control=plan]')).toHaveAttribute('aria-pressed','true');await controls.locator('[data-control=plan]').click()
  await page.locator('.conversation-layer .composer textarea').fill('Review the latest notes and outline the next steps.');await shot('company-chat-light')
  pass('Company 聊天：返回按钮位于左上且字号正常；资料/工具、模型/思考/执行有清晰低饱和层级；原控件可真实切换。')
  if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(760,900));else await page.setViewportSize({width:760,height:900})
  for(const control of ['model','perm','effort']){const picker=controls.locator('[data-control='+control+']');await picker.locator('.ctl').click();const menu=picker.locator('.menu'),bounds=await menu.boundingBox(),dialog=await page.locator('.conversation-layer .conversation-dialog').boundingBox();assert.ok(bounds.x>=dialog.x&&bounds.x+bounds.width<=dialog.x+dialog.width+1,control+' menu must stay inside the workbench');await menu.locator('button').first().click()}
  await shot('company-chat-compact');if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,1000));else await page.setViewportSize({width:1440,height:1000})
  await toolbar.getByRole('button',{name:'Employee details',exact:true}).click();await expect(profile.getByRole('tab')).toHaveText(['Company','Messages2','Plan2'])
  await expect(profile.locator('.profile-quick-actions>button')).toHaveCount(2);await expect(profile.locator('.profile-quick-actions')).toHaveText(['MessageEdit profile']);await expect(profile.getByRole('button',{name:'Open workspace',exact:true})).toHaveCount(0)
  await expect(tab('Company')).toHaveAttribute('aria-selected','true');await expect(profile.locator('.profile-company-identity')).toContainText('Product studio');await expect(profile.locator('[role=tabpanel]')).toContainText(a.cwd);await expect(profile.locator('[data-profile-membership]')).toHaveCount(0);await expect(profile.locator('[data-profile-plan]')).toHaveCount(0);await shot('profile-company')
  await tab('Company').press('ArrowRight');await expect(tab('Messages')).toBeFocused();await expect(tab('Messages')).toHaveAttribute('aria-selected','true');await expect(profile.locator('[data-profile-membership="group:'+group.id+'"]')).toContainText('Owner');await expect(profile.locator('[data-profile-membership="channel:'+channel.id+'"]')).toContainText('Admin');await expect(profile.locator('.profile-folder-card')).toHaveCount(2);await shot('profile-messages')
  await profile.getByRole('button',{name:'Edit profile',exact:true}).click();await profile.locator('input[name=title]').fill('Mira — Product lead');await profile.getByRole('button',{name:'Back to employee profile',exact:true}).click();await expect(profile.locator('.profile-discard')).toBeVisible();await profile.getByRole('button',{name:'Keep editing',exact:true}).click();await profile.locator('.save-employee').click();await expect(tab('Messages')).toHaveAttribute('aria-selected','true');await expect(profile.locator('h1')).toHaveText('Mira — Product lead')
  await tab('Messages').press('End');await expect(tab('Plan')).toBeFocused();await expect(profile.locator('[data-profile-plan]')).toHaveCount(2);await expect(profile.locator('.profile-view-role')).toContainText('Task assignee');await expect(profile.locator('[role=tabpanel]')).not.toContainText('Other employee only');await expect(profile.locator('[data-profile-plan="'+signal.id+'"]')).toContainText('Waiting for event');await shot('profile-plan')
  await profile.locator('[data-profile-plan="'+recurring.id+'"]').click();await profile.locator('[name=plan-notes]').fill('Reviewed in the Plan profile.');await profile.getByRole('button',{name:'Save changes',exact:true}).click();await expect(tab('Plan')).toHaveAttribute('aria-selected','true');assert.equal((await rpc('schedule.get',{id:recurring.id})).plan.notes,'Reviewed in the Plan profile.');assert.equal((await rpc('schedule.list')).length,3)
  pass('详情仅两个快捷操作及三个页签；Company 身份/目录、Messages 成员/管理员、Plan 本人计划准确分离；键盘切换、编辑返回原页、任务 ID 均保留。')
  for(const [width,height,theme] of [[1100,900,'black'],[760,650,'white'],...(native?[]:[[390,740,'midnight']])]){
   if(native)await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});else await page.setViewportSize({width,height})
   await rpc('settings.set',{language:'zh-CN',viewAppearance:{company:{theme}}});await tab('公司').click();await expect(profile.getByRole('tab')).toHaveCount(3);await tab('公司').press('ArrowRight');await expect(tab('消息')).toHaveAttribute('aria-selected','true')
   const geometry=await profile.evaluate(el=>{const box=el.getBoundingClientRect();return {viewport:innerWidth,inside:box.left>=0&&box.right<=innerWidth+1,overflow:el.scrollWidth>el.clientWidth+1,tabs:[...el.querySelectorAll('[role=tab]')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}})}});assert.ok(geometry.inside);assert.equal(geometry.overflow,false);for(let i=1;i<geometry.tabs.length;i++)assert.ok(geometry.tabs[i].left>=geometry.tabs[i-1].right);await shot('profile-'+width+'-'+theme)
  }
  if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,1000));else await page.setViewportSize({width:1440,height:1000})
  await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'black'}}});await profile.getByRole('button',{name:'Back to conversation',exact:true}).click();await expect(toolbar).toBeVisible();await shot('company-chat-dark')
  const hold=path.join(f.control,a.id+'.hold-user');fs.writeFileSync(hold,'');await rpc('session.send',{employee:a.id,text:'Fixture work for busy controls.'});await expect(page.locator('.conversation-layer .send-btn.stop')).toBeVisible();assert.notDeepEqual(await color(page.locator('.send-btn.stop')),await color(page.locator('.send-btn.enqueue')));await shot('company-chat-busy');await page.locator('.send-btn.stop').click();fs.rmSync(hold,{force:true});await f.until(async()=>!(await f.status(a.id)).busy,'fixture stop');await rpc('session.send',{employee:a.id,text:'Complete the local interface check.'});await f.until(async()=>!(await f.status(a.id)).busy,'fixture recovery')
  await toolbar.getByRole('button',{name:'Tools and usage',exact:true}).click();await expect(page.locator('.engine-tools')).toBeVisible();await page.locator('.engine-tools').getByRole('button',{name:'Back to conversation',exact:true}).click();await expect(toolbar).toBeVisible()
  await ui('view.open',{kind:'messages',employee:a.id});await expect(page.locator('.message-thread-header')).toBeVisible();await page.getByRole('button',{name:'Employee details',exact:true}).click();await expect(profile.getByRole('tab')).toHaveCount(3);await tab('Messages').click();await expect(profile.locator('[data-profile-membership]')).toHaveCount(2);await shot('message-profile');await profile.getByRole('button',{name:'Back to conversation',exact:true}).click();await expect(profile).toHaveCount(0)
  assert.deepEqual(await rpc('schedule.history'),[]);assert.deepEqual(report.errors,[]);if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
  pass('中文/英文、明暗主题与窄屏无页签重叠或溢出；忙碌按钮层级、停止、工具页返回和 Messages 共用资料通过；无计划误执行。');report.passed=true
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(out,mode+'-failure.png')}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f.close();fs.rmSync(temp,{recursive:true,force:true});fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2))}
}
try{await run(false);await run(true)}finally{built.dispose()}
