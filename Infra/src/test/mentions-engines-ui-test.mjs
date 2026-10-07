// Actual desktop/Web application; deterministic native fixtures, isolated home and no real model requests.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'electron-vite'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),logs=['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md']
if(process.getuid?.()===0){const{uid,gid}=fs.statSync(root);for(const file of [...logs,'Infra/src/test/mentions-engines-ui-test.mjs','Infra/src/renderer/src/chat/useMentionPicker.ts'])fs.chownSync(path.join(root,file),uid,gid);process.setgroups([gid]);process.setgid(gid);process.setuid(uid);const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})}
const out=path.join(root,'.aexus/artifacts/mentions-engines-cloud'),application=path.join(out,'application');fs.mkdirSync(application,{recursive:true})
const note=text=>{console.log(text);for(const file of logs)fs.appendFileSync(path.join(root,file),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
if(!process.argv.includes('--skip-build')){
 fs.writeFileSync(path.join(application,'package.json'),fs.readFileSync(path.join(root,'package.json')))
 for(const name of ['node_modules','bin','docs','Modules','build','src','API.md','ARCHITECTURE.md','AGENTS.md','PERMISSIONS.md','PLAN.md','SCHEDULER.md','PLUGIN_SPEC.md','README.md','engine-downloads.json'])if(!fs.existsSync(path.join(application,name))&&fs.existsSync(path.join(root,name)))fs.symlinkSync(path.join(root,name),path.join(application,name))
 const config=path.join(out,'build.config.mjs');fs.writeFileSync(config,`import original from ${JSON.stringify(path.join(root,'electron.vite.config.ts'))};export default Object.fromEntries(Object.entries(original).map(([part,value])=>[part,{...value,build:{...value.build,outDir:${JSON.stringify(application)}+'/.aexus/out/'+part,emptyOutDir:true}}]));`)
 await build({configFile:config,logLevel:'warn'});note('PASS 本轮独立全应用构建，未覆盖根 .aexus/out/ 或正在运行的程序。')
}
async function run(native){
 const mode=native?'desktop':'web',probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const f=await fixtureCore({...(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),CLINE_BIN:path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),PI_BIN:path.join(root,'Infra/src/test/fixtures/process-adapter.cjs'),CLAUDE_CONFIG_DIR:path.join(out,'unused-test-claude')},path.join(application,'.aexus/out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,cmd+': '+result.error);return result.data}
 let browser,app,page;const report={passed:false,mode,platform:process.platform,checks:[],errors:[]},check=text=>{report.checks.push(text);note('PASS '+mode+'：'+text)}
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'violet'}}})
  await rpc('group.add',{name:'Newsroom'});await rpc('group.add',{name:'Plugin desk',mode:'work',pluginId:'mininotion'})
  const a=await f.create('Aster','Newsroom'),b=await f.create('张三','Newsroom')
  const group=await rpc('chat.create',{name:'Mention laboratory',members:[a.id,b.id]}),channel=await rpc('channel.create',{name:'Channel laboratory',engine:{kind:'employees',employeeIds:[a.id,b.id]}})
  for(const engine of ['cline','pi'])await rpc('engine.configure',{engine,patch:{apiKey:'school-'+engine+'-fixture',baseUrl:'https://school.invalid/v1',model:'deepseek-v4-flash'}})
  if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application],env});page=await app.firstWindow()}
  else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
  page.setDefaultTimeout(15000);await page.emulateMedia({reducedMotion:'reduce'});page.on('pageerror',error=>report.errors.push(error.message));await expect(page.locator('.infinite-canvas')).toBeVisible()
  const ui=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
  for(const kind of ['group','channel']){
   await ui('view.open',{kind:'messages',...(kind==='group'?{chatId:group.id}:{channelId:channel.id})})
   const area=page.locator(kind==='group'?'.group-conversation':'.channel-conversation'),input=area.getByRole('textbox',{name:kind==='group'?'Group message':'Channel message',exact:true}),menu=area.locator('.group-mention-menu')
   await expect(input).toBeEditable()
   const caret=async(pos,end=pos)=>{await input.focus();await input.evaluate((el,{pos,end})=>{el.setSelectionRange(pos,end);el.dispatchEvent(new Event('select',{bubbles:true}))},{pos,end})}
   const drafts=[['已经写好的中文，后面的内容必须保留。',0],['前文中文后文',2],['alpha beta gamma',6],['first line\nsecond line',11],['a🙂b尾部',3],['terminal',8]]
   for(const [base,pos] of drafts){
    await input.fill(base);await caret(pos);await page.keyboard.insertText('@');await expect(menu).toBeVisible();await expect(menu.getByRole('option')).toHaveCount(3)
    await page.keyboard.insertText('Ast');await expect(menu.getByRole('option')).toHaveCount(1);await input.press('Enter');await expect(input).toHaveValue(base);await expect(menu).toHaveCount(0);assert.equal(await input.evaluate(el=>el.selectionStart),pos)
    await expect(area.getByRole('button',{name:'Remove mention Aster',exact:true})).toBeVisible();await area.getByRole('button',{name:'Remove mention Aster',exact:true}).click()
   }
   await input.fill('之前之后');await caret(2);await page.keyboard.insertText('＠张');await expect(menu.getByRole('option')).toHaveCount(1);await menu.getByRole('option',{name:/张三/}).click();await expect(input).toHaveValue('之前之后');assert.equal(await input.evaluate(el=>el.selectionStart),2)
   await area.getByRole('button',{name:'Remove mention 张三',exact:true}).click()
   await input.fill('前SELECT后');await caret(1,7);await page.keyboard.insertText('@Ast');await input.press('Tab');await expect(input).toHaveValue('前后');await area.getByRole('button',{name:'Remove mention Aster',exact:true}).click()
   await input.fill('prefix@Ast tail');await caret(10);await expect(menu.getByRole('option')).toHaveCount(1);await input.press('Escape');await expect(menu).toHaveCount(0);await caret(0);await expect(menu).toHaveCount(0);await caret(10);await expect(menu).toBeVisible();await input.press('Enter');await expect(input).toHaveValue('prefix tail');await area.getByRole('button',{name:'Remove mention Aster',exact:true}).click()
   await input.fill('keep all this text');await caret(5);await area.getByRole('button',{name:kind==='group'?'Mention a member':'Mention an administrator',exact:true}).click();await menu.getByRole('option',{name:/Aster/}).click();await expect(input).toHaveValue('keep all this text');assert.equal(await input.evaluate(el=>el.selectionStart),5);await area.getByRole('button',{name:'Remove mention Aster',exact:true}).click()
   await input.fill('beforeafter');await caret(6);await input.dispatchEvent('compositionstart');await page.keyboard.insertText('@张');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});await expect(input).toHaveValue('before@张after');await expect(menu).toHaveCount(0);await input.dispatchEvent('compositionend');await expect(menu.getByRole('option')).toHaveCount(1);await input.press('Enter');await expect(input).toHaveValue('beforeafter');await area.getByRole('button',{name:'Remove mention 张三',exact:true}).click()
   await input.fill('left right');await caret(5);await page.keyboard.insertText('@');await page.screenshot({path:path.join(out,mode+'-'+kind+'-mention.png'),animations:'disabled'});await input.press('ArrowDown');await input.press('Enter');await expect(input).toHaveValue('left right')
   await area.getByRole('button',{name:'Remove mention Aster',exact:true}).click()
   await input.fill('@does-not-exist');await input.press('Enter');await expect(input).toHaveValue('@does-not-exist');await input.press('Escape');await input.fill('')
   check(kind+' @：开头/中间/结尾/多行/中文/emoji/全角/选区替换、鼠标与键盘/移动光标/输入法；前后正文和插入位置保留，不误发消息。')
  }
  await ui('view.open',{kind:'home'});await page.getByRole('button',{name:'Company Views',exact:true}).click().catch(()=>{})
  // Use the same Core navigation as the visible Add employee button, then real picker clicks and Save.
  const form=page.locator('.employee-form')
  const choose=async(name,label)=>{await form.locator('select[name="'+name+'"]').locator('..').getByRole('button').click();await page.getByRole('listbox').getByRole('option',{name:label,exact:true}).click()}
  for(const engine of ['cline','pi']){
   await ui('view.open',{kind:'employee'});await expect(form).toBeVisible();await choose('group','Plugin desk')
   await expect(form.locator('.engine-choices button[data-engine="'+engine+'"]')).toBeEnabled();await form.locator('.engine-choices button[data-engine="'+engine+'"]').click();await form.locator('input[name=title]').fill(engine+' created from Work UI')
   await expect(form.locator('.engine-choices button[data-engine="'+engine+'"]')).toHaveClass(/selected/);await page.screenshot({path:path.join(out,mode+'-'+engine+'-work-picker.png'),animations:'disabled'})
   await form.locator('.save-employee').click();await expect(form).toHaveCount(0);const saved=(await rpc('session.list')).sessions.find(card=>card.title===engine+' created from Work UI');assert.ok(saved);assert.equal(saved.engine,engine);assert.equal(saved.group,'Plugin desk');assert.equal(saved.model,'deepseek-v4-flash');await f.ready(saved.id)
  }
  check('员工创建：真实 Work Team 中 Cline/Pi 按钮可选，经表单保存并完成原生初始化，学校模型与引擎一致；未更改 Claude 配置。')
  if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(760,900));else await page.setViewportSize({width:390,height:844})
  await ui('view.open',{kind:'messages',chatId:group.id});const input=page.getByRole('textbox',{name:'Group message',exact:true});await input.fill('这是窄屏草稿');await input.evaluate(el=>el.setSelectionRange(2,2));await page.keyboard.insertText('@')
  await rpc('settings.set',{language:'zh-CN',viewAppearance:{messages:{theme:'midnight'}}});await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');await expect(page.locator('.group-mention-menu')).toBeVisible();await page.screenshot({path:path.join(out,mode+'-mention-compact-dark.png'),animations:'disabled'})
  const bounds=await page.locator('.group-mention-menu').evaluate(el=>{const box=el.getBoundingClientRect();return {inside:box.left>=0&&box.right<=innerWidth+1,overflow:el.scrollWidth>el.clientWidth+1}});assert.equal(bounds.inside,true);assert.equal(bounds.overflow,false)
  assert.deepEqual(report.errors,[]);assert.deepEqual(await rpc('terminal.list'),[]);assert.deepEqual((await rpc('chat.history',{id:group.id})).messages,[]);assert.deepEqual((await rpc('channel.history',{id:channel.id})).messages,[])
  if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
  check('中英文、深色及窄窗口菜单未越界；全部输入测试没有创建消息、任务或终端。');report.passed=true
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(out,mode+'-failure.png')}).catch(()=>{});note('FAIL '+mode+'：'+error.message);throw error}finally{await app?.close();await browser?.close();await f.close();fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2))}
}
await run(false);await run(true)
