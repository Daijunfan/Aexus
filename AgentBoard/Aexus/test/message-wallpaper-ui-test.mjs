// Full Web and hidden desktop renderers, isolated Core, original SVGs and deterministic employee protocol.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),out=path.join(root,'artifacts/message-wallpaper'),built=await profileApplication()
fs.mkdirSync(out,{recursive:true})
const note=text=>{console.log(text);for(const name of ['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md'])fs.appendFileSync(path.join(root,name),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
note('PASS 本轮独立应用构建；未覆盖根 out/，未打包安装。')
async function run(native){
 const mode=native?'desktop':'web',server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve))
 const f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(built.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const response=await f.request(null,cmd,args);assert.ok(response.ok,cmd+': '+response.error);return response.data},prefs=()=>rpc('settings.get')
 const report={passed:false,mode,platform:process.platform,checks:[],errors:[],paidModelCalls:0,productionDataUsed:false},pass=text=>{report.checks.push(text);note('PASS '+mode+'：'+text)}
 let app,browser,page
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'mint'},plan:{theme:'white'}}});await rpc('group.add',{name:'Design studio'})
  const a=await f.create('Aster','Design studio');fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'A few small details can make a space feel more personal.\n\nThe background stays quiet, so the conversation comes first.')
  await rpc('session.send',{employee:a.id,text:'Let’s make room for better ideas.'});await f.until(async()=>!(await f.status(a.id)).busy,'fixture response')
  const group=await rpc('chat.create',{name:'Design notes',members:[a.id]}),channel=await rpc('channel.create',{name:'Inspiration journal',engine:{kind:'employees',employeeIds:[a.id]}})
  const before=await rpc('session.transcript',{employee:a.id}),identity=(await rpc('session.list')).sessions.map(c=>({id:c.id,cwd:c.cwd,threadId:c.threadId,engine:c.engine}))
  if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[built.directory],env});page=await app.firstWindow()}
  else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
  page.setDefaultTimeout(12000);page.on('pageerror',error=>report.errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.infinite-canvas')).toBeVisible()
  const ui=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),wall=page.locator('.message-stage > .message-wallpaper'),panel=page.locator('.view-preferences-panel'),settings=panel.locator('.wallpaper-settings'),shot=name=>page.screenshot({path:path.join(out,mode+'-'+name+'.png'),animations:'disabled'})
  const openSettings=async()=>{await page.locator('.directory-settings:not(.directory-refresh)').click();await expect(panel).toBeVisible()},closeSettings=async()=>{await panel.getByRole('button',{name:'Close settings',exact:true}).click();await expect(panel).toHaveCount(0)}
  await openSettings();await expect(settings).toHaveCount(0);await panel.getByRole('tab',{name:'Messages',exact:true}).click();await expect(settings).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','white');await expect(settings.locator('.wallpaper-preview')).toHaveClass(/sample-mint/);await closeSettings()
  await ui('view.open',{kind:'messages',employee:a.id});await expect(wall).toHaveAttribute('data-wallpaper-pattern','daydream');await expect(wall).toHaveAttribute('data-wallpaper-density','115');await expect(page.locator('.message-conversation .transcript')).toContainText('Let’s make room')
  const svg=wall.locator('svg'),nodeCount=await svg.locator('*').count();assert.ok(nodeCount<125,'one compact tile, not one element per viewport glyph');await expect(wall).toHaveCSS('pointer-events','none');await shot('daydream-scattered-chat')
  await openSettings();await expect(panel.getByRole('tab',{name:'Messages',exact:true})).toHaveAttribute('aria-selected','true');await expect(settings.locator('[data-pattern-option]')).toHaveCount(6)
  for(const pattern of ['daydream','botanical','cosmos','studio','geometric']){
   await settings.locator('[data-pattern-option='+pattern+']').click()
   for(const layout of ['ordered','scattered']){
    await settings.locator('[data-wallpaper-layout-option='+layout+']').click();await expect.poll(async()=>(await prefs()).messageWallpaper).toMatchObject({pattern,layout});await expect(settings.locator('.wallpaper-preview > .message-wallpaper')).toHaveAttribute('data-wallpaper-layout',layout)
    const ids=await page.locator('.message-wallpaper [id]').evaluateAll(nodes=>nodes.map(el=>el.id));assert.equal(new Set(ids).size,ids.length,'previews and live SVG IDs stay independent')
    await settings.locator('.wallpaper-preview').screenshot({path:path.join(out,mode+'-'+pattern+'-'+layout+'-preview.png'),animations:'disabled'})
   }
  }
  pass('五组原创花纹与两种排列均能实时切换；缩略图/预览和真实聊天使用同一图案，SVG 标识不冲突、节点数量固定。')
  await settings.locator('[data-pattern-option=none]').click();await expect(settings.locator('.wallpaper-preview .message-wallpaper-pattern')).toHaveCount(0);await expect(settings.locator('[name=wallpaper-density]')).toBeDisabled()
  await settings.locator('[data-pattern-option=botanical]').click();await settings.locator('[data-wallpaper-layout-option=ordered]').click()
  await settings.locator('[name=wallpaper-density]').press('End');await settings.locator('[name=wallpaper-opacity]').press('Home');await settings.locator('[name=wallpaper-opacity]').press('ArrowRight');await rpc('settings.set',{viewAppearance:{plan:{theme:'black'}}});await closeSettings()
  assert.deepEqual((await prefs()).messageWallpaper,{pattern:'botanical',layout:'ordered',density:160,opacity:1});assert.equal((await prefs()).viewAppearance.plan.theme,'black')
  await openSettings();await settings.locator('[name=wallpaper-opacity]').press('Home');await expect(settings.locator('.wallpaper-preview .message-wallpaper-pattern')).toHaveCount(0);await settings.getByRole('button',{name:'Reset wallpaper',exact:true}).click();await closeSettings()
  assert.deepEqual((await prefs()).messageWallpaper,{pattern:'daydream',layout:'scattered',density:115,opacity:16});assert.equal((await prefs()).viewAppearance.messages.theme,'mint')
  pass('密度/浓淡滑杆、无花纹与零浓淡、独立重置、快速输入后立即关闭保存通过；并发 Plan 配色和 Messages 原颜色均保留。')
  const draft=page.locator('.message-conversation .composer textarea');await draft.fill('Keep this draft while I change the background.')
  await openSettings();await settings.locator('[data-pattern-option=cosmos]').click();await closeSettings();await expect(draft).toHaveValue('Keep this draft while I change the background.')
  for(const target of [{chatId:group.id},{channelId:channel.id},{employee:a.id}]){await ui('view.open',{kind:'messages',...target});await expect(wall).toHaveAttribute('data-wallpaper-pattern','cosmos')}
  await expect(draft).toHaveValue('Keep this draft while I change the background.');await page.reload();await expect(wall).toHaveAttribute('data-wallpaper-pattern','cosmos');await expect(draft).toHaveValue('Keep this draft while I change the background.')
  await openSettings();await settings.locator('[data-wallpaper-layout-option=ordered]').click();await panel.getByRole('button',{name:'Reset Messages settings',exact:true}).click();await closeSettings();assert.deepEqual((await prefs()).messageWallpaper,{pattern:'daydream',layout:'scattered',density:115,opacity:16});assert.equal((await prefs()).viewAppearance.plan.theme,'black')
  pass('私聊、群组和频道背景统一；重载后保持选择，切换背景不丢草稿、不改历史；Messages 重置不改 Company/Plan。')
  for(const [theme,pattern,layout] of [['mint','daydream','scattered'],['violet','botanical','ordered'],['midnight','cosmos','scattered']]){
   await rpc('settings.set',{viewAppearance:{messages:{theme}},messageWallpaper:{pattern,layout,opacity:18}});await expect(wall).toHaveAttribute('data-wallpaper-pattern',pattern);await shot(theme+'-chat')
   await openSettings();await settings.scrollIntoViewIfNeeded();await shot(theme+'-settings');await closeSettings()
  }
  await rpc('settings.set',{language:'zh-CN'});await openSettings();if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(760,900));else await page.setViewportSize({width:390,height:844})
  await expect(settings).toBeVisible();await settings.scrollIntoViewIfNeeded();await settings.locator('[data-pattern-option=studio]').click();await settings.locator('[data-wallpaper-layout-option=ordered]').click();await expect(settings.getByRole('group',{name:'排列方式',exact:true}).locator('[data-wallpaper-layout-option=ordered]')).toHaveAttribute('aria-pressed','true')
  const geometry=await panel.evaluate(el=>{const box=el.getBoundingClientRect();return {inside:box.left>=0&&box.right<=innerWidth+1,overflow:el.scrollWidth>el.clientWidth+1}});assert.ok(geometry.inside);assert.equal(geometry.overflow,false);await shot('compact-zh-settings')
  await panel.getByRole('button',{name:'关闭设置',exact:true}).click();await expect(panel).toHaveCount(0);await shot('compact-zh-chat')
  await ui('view.open',{kind:'plan'});await expect(page.locator('.plan-view')).toBeVisible();assert.equal(await page.locator('.message-wallpaper').count(),0)
  const after=await rpc('session.transcript',{employee:a.id});assert.deepEqual(after.items,before.items);assert.deepEqual((await rpc('session.list')).sessions.map(c=>({id:c.id,cwd:c.cwd,threadId:c.threadId,engine:c.engine})),identity);assert.deepEqual(await rpc('schedule.list'),[]);assert.deepEqual(await rpc('terminal.list'),[]);assert.deepEqual(report.errors,[])
  if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  pass('浅色/深色/中英文及窄窗口通过，背景不拦截操作，不产生新任务/终端，不改变员工身份和消息正文；Plan 无聊天花纹。');report.passed=true
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(out,mode+'-failure.png'),animations:'disabled'}).catch(()=>{});note('FAIL '+mode+'：'+error.message);throw error}finally{await app?.close();await browser?.close();await f.close();fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2))}
}
try{await run(false);await run(true)}finally{built.dispose()}
