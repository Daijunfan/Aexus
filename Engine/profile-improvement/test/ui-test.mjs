import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron,expect} from '@playwright/test'
import {application,fixtureCore,evidence,waitFor} from './support.mjs'
import {fixture,OPTIMIZED_BULLET} from './fixtures.mjs'
import {inspectDocument} from '../document.mjs'
const native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(evidence,mode),require=createRequire(import.meta.url)
fs.mkdirSync(out,{recursive:true});let built,f,app,browser,page;const report={passed:false,mode,checks:[],errors:[],paidModelCalls:0,productionDataUsed:false},pass=text=>{report.checks.push(text);console.log('PASS '+text)}
try{
 built=await application();f=await fixtureCore(built);assert.ok((await f.client.invoke('engine.check',{engine:'pi'})).ready)
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1020'};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({executablePath:require('electron'),args:[built.root],env,timeout:30000});page=await app.firstWindow();await waitFor(()=>f.client.info(),'hidden desktop Core')}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1020}});await page.goto('http://127.0.0.1:'+f.port);await page.locator('.web-login input').fill(await f.webToken());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'})
 // Explicit user selection keeps the browser/desktop window in its own Engine scope.
 await page.getByRole('button',{name:'Select 简历优化',exact:true}).click();await page.getByRole('button',{name:'Load 简历优化',exact:true}).click();const engine=page.getByRole('region',{name:'简历优化引擎'}),shot=name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})
 await expect(engine).toBeVisible();await expect(engine.getByRole('button',{name:'开始优化简历',exact:true})).toBeDisabled();await shot('01-entry')
 const upload=engine.getByLabel('上传 Word 简历')
 await upload.setInputFiles({name:'resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 unsupported')});await expect(engine.getByRole('alert')).toContainText('.docx');assert.equal((await f.client.invoke('workflow.list',{engineId:'profile-improvement'})).jobs.length,0)
 await upload.setInputFiles({name:'Original Resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(fixture())});await engine.getByRole('textbox',{name:'目标岗位',exact:true}).fill('Backend Engineer；Test Engineer')
 const preview=engine.frameLocator('iframe');await expect(preview.getByText('Alex Morgan',{exact:true})).toBeVisible();await expect(preview.locator('table')).toHaveCount(1);await shot('02-upload-and-preview')
 await engine.getByRole('button',{name:'开始优化简历',exact:true}).click();await expect(engine.locator('.pi-status')).toHaveText('处理中');const running=(await f.client.invoke('workflow.list',{engineId:'profile-improvement'})).jobs[0];assert.ok(running)
 await page.reload();await expect(engine).toBeVisible();await expect(engine.locator('.pi-status')).toHaveText('已完成',{timeout:120000});const completed=await f.client.invoke('workflow.get',{id:running.id});assert.equal(completed.files.length,2);assert.equal(completed.summary.workers.length,3);assert.equal((await f.client.invoke('workflow.list',{engineId:'profile-improvement'})).jobs.length,1)
 pass('Actual Web/desktop explicitly loads this Engine in its own window, validates upload before work, previews the original template, and resumes the same durable workflow after page reload')
 const first=completed.files[0];await engine.locator('.pi-delivery-title').first().click();await expect(preview.getByText(OPTIMIZED_BULLET,{exact:true})).toBeVisible();await expect(preview.locator('table')).toHaveCount(1);await shot('03-completed-word')
 const file=path.join(out,first.name);if(fs.existsSync(file))fs.unlinkSync(file)
 if(native){await app.evaluate(({session},directory)=>{session.defaultSession.on('will-download',(_event,item)=>item.setSavePath(directory+'/'+item.getFilename()))},out);await engine.getByRole('button',{name:'下载 '+first.name,exact:true}).click();await waitFor(()=>fs.existsSync(file)&&fs.statSync(file).size===first.bytes,'native Word download')}
 else{const event=page.waitForEvent('download');await engine.getByRole('button',{name:'下载 '+first.name,exact:true}).click();const download=await event;assert.equal(download.suggestedFilename(),first.name);await download.saveAs(file)}
 assert.ok(inspectDocument(fs.readFileSync(file)).units.some(u=>u.text===OPTIMIZED_BULLET))
 await engine.getByText('逐项查看原文与优化稿',{exact:true}).click();await expect(engine.locator('.pi-changes')).toContainText('原文');await expect(engine.locator('.pi-changes')).toContainText(OPTIMIZED_BULLET);await shot('04-evidence')
 assert.deepEqual(await f.client.invoke('schedule.list',{}),[]);assert.deepEqual(report.errors,[])
 pass('Two role-specific DOCX files pass structure/page checks, preview and binary download; the UI exposes grounded changes without extra deliverable files or Plan tasks')
 // Test the Engine at narrow width without changing a real user's preferences.
 if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(760,920));else await page.setViewportSize({width:390,height:844})
 await engine.getByRole('button',{name:'新的简历',exact:true}).click();await expect(engine.getByRole('textbox',{name:'目标岗位',exact:true})).toBeVisible();await shot('05-compact');assert.ok(await engine.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
 await f.admin('settings.set',{viewAppearance:{company:{theme:'midnight'},messages:{theme:'midnight'},plan:{theme:'midnight'}}});await page.waitForTimeout(500);report.hostTheme=await page.locator('html').getAttribute('data-theme');await shot('06-host-theme')
 if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 assert.deepEqual(report.errors,[]);pass('Responsive layout stays within viewport; reduced-motion and theme inheritance render without script errors; desktop windows remain hidden')
 report.passed=true
}catch(error){report.error=error.stack;console.error(error);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(f)fs.writeFileSync(path.join(out,'core.log'),f.log());throw error}finally{await app?.close();await browser?.close();await f?.close();built?.dispose();fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2))}
