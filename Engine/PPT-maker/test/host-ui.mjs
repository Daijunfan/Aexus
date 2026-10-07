import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,_electron,expect} from '@playwright/test';
import {application,coreFixture,evidence,waitFor} from './host.mjs';
import {brief,source,outline,content} from './fixtures.mjs';
import {renderGenerated} from '../render.mjs';
import {makeDeck} from '../scene.mjs';
import {inspectPptx,sha256} from '../archive.mjs';
const desktop=process.argv.includes('--desktop'),mode=desktop?'desktop':'web',out=path.join(evidence,mode),require=createRequire(import.meta.url);
fs.mkdirSync(out,{recursive:true});let built,f,app,browser,page;const report={passed:false,mode,checks:[],errors:[],paidModelCalls:0,productionDataUsed:false};
const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
async function screenshot(name){
 const target=path.join(out,name+'.png');
 if(!desktop)return page.screenshot({path:target,animations:'disabled'});
 if(['06-compact','07-template'].includes(name)){
  // Native hidden-window capture does not reliably resume after macOS resize.
  // Keep actual DOM/layout/workflow checks; browser tests supply these images.
  report.captureLimitations??=[];
  report.captureLimitations.push(name+': hidden macOS capture after resize omitted; real DOM/layout and interaction checks continue');
  fs.rmSync(target,{force:true});
  return;
 }
 // Hidden Electron windows can stop emitting CDP frames after a native resize.
 // Use Electron's supported hidden capture path; never show the user's window.
 await page.evaluate(()=>document.fonts.ready.then(()=>true));
 const capture=await app.evaluate(async({BrowserWindow})=>{
  const win=BrowserWindow.getAllWindows()[0];
  if(!win||win.isVisible())throw Error('Expected an isolated hidden test window');
  win.webContents.invalidate();
  const image=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  if(image.isEmpty())throw Error('Hidden capture returned an empty image');
  const size=image.getSize();
  return {data:image.toPNG().toString('base64'),size,bounds:win.getContentBounds(),visible:win.isVisible()};
 });
 assert.equal(capture.visible,false);
 assert.ok(capture.size.width>=capture.bounds.width&&capture.size.height>=capture.bounds.height,'capture includes the current content viewport');
 const bytes=Buffer.from(capture.data,'base64');
 const stats=await require('sharp')(bytes).stats();
 assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>5),'capture must contain rendered content');
 fs.writeFileSync(target,bytes);
}
async function waiting(){await expect(page.locator('.a-ppt[data-ppt-status="waiting"] .a-ppt-editor')).toBeVisible({timeout:120000});}
async function exportFile(name){
 await page.getByRole('button',{name:'导出 PPTX',exact:true}).click();const checkbox=page.locator('.a-ppt-modal input[type=checkbox]');if(await checkbox.count())await checkbox.check();await page.getByRole('button',{name:'验证并生成 PPTX',exact:true}).click();await expect(page.locator('.a-ppt')).toHaveAttribute('data-ppt-status','completed',{timeout:30000});
 const file=path.join(out,name);if(fs.existsSync(file))fs.unlinkSync(file);
 if(desktop){await app.evaluate(({session},target)=>{session.defaultSession.once('will-download',(_event,item)=>item.setSavePath(target));},file);await page.getByRole('button',{name:'下载 PPTX',exact:true}).click();await waitFor(()=>fs.existsSync(file)&&fs.statSync(file).size>0,'hidden Electron PPTX download');}
 else{const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载 PPTX',exact:true}).click();const d=await event;assert.equal(d.suggestedFilename(),'presentation.pptx');await d.saveAs(file);}
 return fs.readFileSync(file);
}
try{
 built=await application();f=await coreFixture(built);
 if(desktop){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1060'};delete env.ELECTRON_RUN_AS_NODE;app=await _electron.launch({executablePath:require('electron'),args:[built.root],env,timeout:30000});page=await app.firstWindow();await app.evaluate(({app:host,BrowserWindow})=>{const guard=w=>{w.hide();w.on('show',()=>w.hide())};BrowserWindow.getAllWindows().forEach(guard);host.on('browser-window-created',(_e,w)=>guard(w))});await waitFor(()=>f.client.info(),'hidden desktop startup');}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1060}});await page.goto('http://127.0.0.1:'+f.port);await page.locator('.web-login input').fill(await f.webToken());await page.getByRole('button',{name:'Enter workspace',exact:true}).click();}
 page.setDefaultTimeout(25000);page.on('pageerror',e=>report.errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
 // Public launcher supports both the original Engine tab and the new load dock.
 await expect(page.getByText('PPT-maker',{exact:true}).first().or(page.getByRole('button',{name:'Engine',exact:true})).first()).toBeVisible();
 if(await page.getByRole('button',{name:'Engine',exact:true}).isVisible())await page.getByRole('button',{name:'Engine',exact:true}).click();
 await page.getByText('PPT-maker',{exact:true}).first().click();
 const load=page.getByRole('button',{name:/^Load (?:engine|PPT-maker)$/});
 if(await load.isVisible())await load.click();
 await expect(page.getByLabel('PPT制作需求')).toBeVisible();await screenshot('01-intake');
 await page.getByLabel('上传PPT模板').setInputFiles({name:'legacy.ppt',mimeType:'application/octet-stream',buffer:Buffer.from('unsupported')});await expect(page.locator('.a-ppt-error')).toContainText('.pptx');assert.equal((await f.client.invoke('workflow.list',{engineId:'PPT-maker'})).jobs.length,0);
 await page.getByLabel('PPT制作需求').fill(brief);await page.getByLabel('PPT页数').fill('8');await page.getByLabel('上传原始资料').setInputFiles({name:source.name,mimeType:'text/markdown',buffer:Buffer.from(source.content)});await page.getByRole('button',{name:'开始制作',exact:true}).click();await expect(page.getByRole('heading',{name:'先把叙事结构定下来。'})).toBeVisible({timeout:120000});await screenshot('02-outline');await page.getByRole('button',{name:'确认结构，开始制作',exact:true}).click();await waiting();
 const job=(await f.client.invoke('workflow.list',{engineId:'PPT-maker'})).jobs[0];assert.equal(job.summary.workers.length,3);await screenshot('03-editor');pass('Full host discovers PPT-maker, rejects invalid input before work and runs real Pi-backed three-role creation through the public Contract');
 // Latest local changes survive immediate in-app navigation, not just the debounce timer.
 await page.getByRole('button',{name:'备注',exact:true}).click();await page.getByLabel('演讲者备注').fill('界面即时切换后恢复的草稿');page.once('dialog',d=>d.accept());await page.getByLabel('PPT-maker首页').click();await page.locator('.a-ppt-recent button').first().click();await waiting();await expect(page.getByLabel('演讲者备注')).toBeVisible().catch(async()=>{await page.getByRole('button',{name:'备注',exact:true}).click();});await expect(page.getByLabel('演讲者备注')).toHaveValue('界面即时切换后恢复的草稿');await page.getByRole('button',{name:'保存',exact:true}).click();await waiting();pass('Unsaved editor draft survives immediate navigation and is restored before explicit Core save');
 await page.getByRole('button',{name:'选择第3页',exact:true}).click();await page.getByLabel('当前页修改要求').fill('精简这一页标题，保留事实');await page.getByRole('button',{name:'交给设计师',exact:true}).click();await expect(page.locator('.a-ppt-canvas')).toContainText('真实协议完成的单页修订',{timeout:120000});await waiting();await screenshot('04-page-edit');
 const final=await exportFile('generated.pptx'),info=await inspectPptx(final);assert.equal(info.slides,8);assert.equal(info.native.charts,1);assert.equal(info.native.tables,1);const completed=await f.client.invoke('workflow.get',{id:job.id});assert.equal(sha256(final),completed.files[0].sha256);await screenshot('05-delivery');pass('Single-page model revision, native chart/table output and final binary download work inside the real host');
 await page.getByRole('button',{name:'创建修订',exact:true}).click();await waiting();const jobs=await f.client.invoke('workflow.list',{engineId:'PPT-maker'});assert.equal(jobs.jobs.length,2);assert.equal(jobs.jobs[0].summary.parentId,job.id);assert.equal((await f.client.invoke('workflow.get',{id:job.id})).files[0].sha256,completed.files[0].sha256);pass('Completed file forks to an independent editor workflow through authorized client reads; previous file stays unchanged');
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(760,1060));else await page.setViewportSize({width:720,height:1060});await screenshot('06-compact');assert.ok(await page.locator('.a-ppt').evaluate(el=>el.scrollWidth<=el.clientWidth+2));
 if(desktop)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,1060));else await page.setViewportSize({width:1440,height:1060});
 await page.getByLabel('PPT-maker首页').click();await page.getByLabel('PPT制作需求').fill('');const original=await renderGenerated(makeDeck(content(outline(3)),{sources:[{id:'S1',name:'test'}]}));await page.getByLabel('上传PPT模板').setInputFiles({name:'native-template.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:original.bytes});const before=(await f.client.invoke('session.list',{})).sessions.length;await page.getByRole('button',{name:'导入并编辑',exact:true}).click();await waiting();await screenshot('07-template');const exported=await exportFile('template-preserved.pptx');assert.ok(exported.equals(original.bytes));assert.equal((await f.client.invoke('session.list',{})).sessions.length,before);pass('Responsive editor and byte-identical no-model template import/export work without extra employee creation');
 assert.deepEqual(report.errors,[]);if(desktop)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));report.passed=true;
}catch(error){report.error=error.stack;console.error(error);await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{if(f)fs.writeFileSync(path.join(out,'core.log'),f.log());await app?.close();await browser?.close();await f?.close();built?.dispose();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,mode,checks:report.checks.length,out}));}
