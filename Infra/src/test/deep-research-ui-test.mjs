// Full application + real authenticated Core, deterministic native adapters, isolated public-page transport.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {researchFixture} from './fixtures/deep-research-fixture.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',require=createRequire(import.meta.url),out=path.join(root,'.aexus/artifacts/deep-research',mode);fs.mkdirSync(out,{recursive:true})
const application=await profileApplication(),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let fixture,app,browser,page;const checks=[],errors=[],downloads=[];const pass=label=>{checks.push(label);console.log('PASS '+mode+' '+label)}
try{
 fixture=await researchFixture({application:application.directory,port:native?undefined:port});const {f,invoke,rpc,control,stage}=fixture
 await rpc('settings.set',{language:'en',viewAppearance:{company:{theme:'white'},messages:{theme:'white'},plan:{theme:'white'}}})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1050'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);await page.emulateMedia({reducedMotion:'reduce'})
 await expect(page.locator('.infinite-canvas')).toBeVisible();const nav=page.getByRole('navigation',{name:'Application layers'}),shell=page.locator('.a-dr'),shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})}
 await nav.getByRole('button',{name:'Engine',exact:true}).click();await page.locator('.engine-card').filter({hasText:'Deep Research'}).click();await expect(shell.getByRole('textbox',{name:'调研任务'})).toBeVisible();await shot('01-intake')
 await shell.getByRole('textbox',{name:'调研任务'}).fill('为个人研究原型比较 Atlas 和 Beacon，明确证据、取舍与验证步骤（合成验收）');await shell.getByRole('button',{name:'开始调研',exact:true}).click();await expect(shell).toHaveAttribute('data-research-status','waiting');await expect(shell.locator('[data-question]')).toHaveCount(3)
 assert.equal((await rpc('session.list')).sessions.length,0);await shell.locator('[data-question=decision]').fill('个人研究者要选择易于维护的方案，先验证可靠性。');await shot('02-first-clarification');await shell.getByRole('button',{name:'确认并继续',exact:true}).click()
 await expect(shell.getByRole('heading',{name:'确认研究方案',exact:true})).toBeVisible({timeout:45000});await expect(shell.locator('.a-dr-worker')).toHaveCount(3);await expect(shell.locator('[data-question]')).toHaveCount(2);await shot('03-plan')
 let job=(await invoke('workflow.list',{engineId:'deep-research'})).jobs[0];const id=job.id;await page.reload();await expect(shell.getByRole('heading',{name:'确认研究方案',exact:true})).toBeVisible();assert.equal((await invoke('workflow.list',{engineId:'deep-research'})).jobs.length,1)
 pass('One-sentence intake, three first-round questions, actual model-planned questions, two adapter types and stable reload')
 fs.writeFileSync(path.join(control,'hold-research'),'');await shell.getByRole('button',{name:'全部采用建议',exact:true}).click();await expect(shell).toHaveAttribute('data-research-status','running');await expect(shell.locator('.a-dr-running')).toBeVisible();await shot('04-parallel-research')
 await nav.getByRole('button',{name:'Infra',exact:true}).click();await expect(shell).toHaveCount(0);fs.rmSync(path.join(control,'hold-research'));job=await stage(id,'focus');assert.equal(job.summary.sourceCount,6)
 await nav.getByRole('button',{name:'Engine',exact:true}).click();await expect(shell.getByRole('heading',{name:'最后确认报告重点',exact:true})).toBeVisible();await expect(shell.locator('.a-dr-plan')).toContainText('初步发现');await shell.getByRole('textbox',{name:'其他调研意见',exact:true}).fill('建议要有来源，明确合成测试不能代替真实部署验证。');await shot('05-evidence-focus');await shell.getByRole('button',{name:'确认并继续',exact:true}).click();await page.reload()
 await expect(shell).toHaveAttribute('data-research-status','completed',{timeout:45000});job=await invoke('workflow.get',{id});assert.equal(job.files.length,3);await expect(shell.locator('.a-dr-files article')).toHaveCount(3);await shot('06-final-delivery')
 pass('Research continues while the Engine page is unmounted; third-round evidence feedback, report drafting and independent reviews complete after reload')
 await shell.getByRole('button',{name:'预览可视化报告',exact:true}).click();const report=page.frameLocator('iframe[title="深度调研最终报告"]');await expect(report.locator('.source')).toHaveCount(6);await expect(report.locator('.barrow')).toHaveCount(7);await report.getByRole('searchbox',{name:'筛选来源',exact:true}).fill('Beacon');await expect(report.locator('.source:visible')).toHaveCount(2);await report.getByRole('searchbox',{name:'筛选来源',exact:true}).fill('');await expect(report.locator('.source:visible')).toHaveCount(6)
 await shot('07-report-preview');await shell.getByRole('button',{name:'关闭最终报告预览',exact:true}).click()
 if(!native){
  const pending=page.waitForEvent('download');await shell.getByRole('button',{name:'下载全部最终文件',exact:true}).click();const zip=await pending,target=path.join(out,zip.suggestedFilename());await zip.saveAs(target);downloads.push(target)
  const data=fs.readFileSync(target),names=[];let offset=0
  while(data.readUInt32LE(offset)===0x04034b50){const bytes=data.readUInt32LE(offset+18),length=data.readUInt16LE(offset+26),extra=data.readUInt16LE(offset+28),name=data.subarray(offset+30,offset+30+length).toString('utf8'),content=data.subarray(offset+30+length+extra,offset+30+length+extra+bytes);names.push(name);assert.equal(createHash('sha256').update(content).digest('hex'),job.files.find(f=>f.name===name).sha256);offset+=30+length+extra+bytes}
  assert.deepEqual(names.sort(),['evidence.csv','research-report.html','research-report.md'])
  const one=page.waitForEvent('download');await shell.getByRole('button',{name:'下载 research-report.md',exact:true}).click();const markdown=await one;assert.equal(createHash('sha256').update(fs.readFileSync(await markdown.path())).digest('hex'),job.files.find(f=>f.name.endsWith('.md')).sha256)
 }
 pass('Self-contained report renders real evidence bars, comparison matrix and source filtering; final manifest has exactly HTML, editable Markdown and evidence CSV'+(native?'':' and actual browser downloads match all hashes'))
 const resize=async(width,height)=>app?app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height}):page.setViewportSize({width,height})
 await resize(native?720:390,900);await expect(shell).toBeVisible();assert.ok(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Engine fits the compact viewport');await shot('08-compact-final')
 await shell.getByRole('button',{name:'新调研',exact:false}).click();await expect(shell.getByRole('textbox',{name:'调研任务'})).toBeVisible();await shell.getByRole('textbox',{name:'调研任务'}).fill('只测试用户取消流程');await shell.getByRole('button',{name:'开始调研',exact:true}).click();await expect(shell).toHaveAttribute('data-research-status','waiting');assert.ok(await shell.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await shot('09-compact-questions');await shell.getByRole('button',{name:'停止调研',exact:true}).click();await shell.getByRole('button',{name:'确认停止',exact:true}).click();await expect(shell).toHaveAttribute('data-research-status','cancelled');await expect(shell.locator('.a-dr-files')).toHaveCount(0)
 await rpc('settings.set',{viewAppearance:{company:{theme:'black'}}});await shot('10-dark-cancelled')
 assert.deepEqual(errors,[]);if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 pass('Compact layout, dark theme and explicit cancellation retain usable controls; no renderer exceptions, fake final files or visible test windows')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,checks,errors,downloads,paidModelCalls:0,productionDataUsed:false,fixture:'deterministic native responses and synthetic web pages; real Core, Contract, persistent workflow and UI'},null,2))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));throw error}finally{await app?.close();await browser?.close();await fixture?.close();application.dispose()}
