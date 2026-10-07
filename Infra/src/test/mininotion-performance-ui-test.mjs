// Isolated desktop workload. Optional fixture is copied, never modified in place.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{execFile}from'node:child_process';import{promisify}from'node:util';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..');
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mn-performance-'))),base=path.join(temp,'work/mini-notion-workspace');fs.mkdirSync(base,{recursive:true});
if(process.env.MININOTION_PERFORMANCE_FIXTURE)fs.cpSync(process.env.MININOTION_PERFORMANCE_FIXTURE,base,{recursive:true});
const out=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'.aexus/artifacts/mininotion-performance/ui');fs.mkdirSync(out,{recursive:true});
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_PLUGIN_DIRS:''};
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_BUILTIN_PLUGINS','MINI_NOTION_SOCKET','MINI_NOTION_WORKSPACE','MINI_NOTION_DATA_DIR'].includes(key))delete env[key];
const launch=()=>electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env});
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,cwd:root,timeout:45000,maxBuffer:64e6})).stdout);assert.ok(r.ok,r.error);return r.data};
const api=(m,p={})=>cli('plugin','call','mininotion',m,'--params',JSON.stringify(p));
const until=async f=>{for(let i=0;i<120;i++){if(await f())return;await new Promise(r=>setTimeout(r,25))}throw Error('Condition timed out')};
let app,page,backendPid;const checks=[],errors=[],navigation=[],rpc=[],summary={};
const pass=label=>{checks.push(label);console.log('PASS '+label)};
async function open(){const pending=app.waitForEvent('window');await cli('plugin','open','mininotion');page=await pending;page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));await page.locator('.sidebar').waitFor();await expect.poll(async()=>(await api('status')).guiClients).toBeGreaterThan(0)}
const goto=async doc=>{await api('page.open',{pageId:doc.id});await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(doc.title)};
const paragraph=()=>page.locator('.bn-editor [data-content-type="paragraph"] .bn-inline-content').last();
try{
 app=await launch();await (await app.firstWindow()).locator('.infinite-canvas').waitFor();
 const seeded=await api('page.list');
 if(seeded.length<100){const sample=await api('page.create',{title:'Fixture sample',color:'white',blocks:[{type:'paragraph',content:'Read-only performance fixture. '.repeat(500)}]});const loc=await api('fs.path',{pageId:sample.id});const document=JSON.parse(fs.readFileSync(loc.absolutePath,'utf8'));for(let i=0;i<200;i++){const dir=path.join(base,'Synthetic '+i);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'index.mininotion.json'),JSON.stringify({...document,page:{...document.page,id:'perf-fixture-'+i,title:'Synthetic '+i}}))}await api('fs.sync')}
 summary.pagesBefore=(await api('status')).pages;
 if(process.env.MININOTION_PERFORMANCE_APPEARANCE){summary.appearance=JSON.parse(process.env.MININOTION_PERFORMANCE_APPEARANCE);await api('settings.set',{changes:{appearance:summary.appearance}})}
 const parent=await api('page.create',{title:'性能验收',color:'white'});
 const a=await api('page.create',{title:'链接与编辑',color:'white',parentId:parent.id});
 const b=await api('page.create',{title:'叶子页面',color:'white',parentId:parent.id});
 await api('page.write-markdown',{pageId:a.id,markdown:`[跳转到叶子页面](mininotion://page/${b.id})\n\n这里用于验证实时编辑。`});
 await api('page.write-markdown',{pageId:b.id,markdown:'叶子正文。'});
 await open();await goto(a);
 const leaf=page.locator(`.sidebar [data-page-id="${b.id}"]`).first();await expect(leaf).toBeVisible();await leaf.hover();await expect(leaf.locator('.tree-toggle')).toHaveCount(0);
 assert.equal(await leaf.getAttribute('aria-expanded'),null);await expect(page.getByText('没有子页面',{exact:true})).toHaveCount(0);
 await expect(page.locator(`.sidebar [data-page-id="${parent.id}"] .tree-toggle`).first()).toBeVisible();
 const link=page.locator(`.bn-inline-content a[href="mininotion://page/${b.id}"]`).first();await link.hover();assert.equal(await link.evaluate(el=>getComputedStyle(el).cursor),'pointer');await link.click();await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(b.title);
 pass('leaf pages have no disclosure button or empty group; native links show a pointer and navigate');
 for(let i=0;i<8;i++){const doc=i%2?a:b;const started=Date.now();await goto(doc);navigation.push(Date.now()-started);await expect(page.locator('.save-status')).toContainText('已保存到本机')}
 await goto(a);await expect(page.locator('.save-status')).toContainText('已保存到本机');
 await page.evaluate(()=>{window.__inputPaint=[];window.__longTasks=[];document.addEventListener('keydown',()=>{const start=performance.now();requestAnimationFrame(()=>window.__inputPaint.push(performance.now()-start))},true);new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false})});
 page.on('response',async response=>{try{const request=response.request();if(request.method()==='POST'&&request.postDataJSON()?.method==='workspace.patch')rpc.push({requestBytes:Buffer.byteLength(request.postData()||''),responseBytes:(await response.body()).length})}catch{}});
 await paragraph().click();await page.keyboard.press('End');await page.keyboard.type(' PERFORMANT-TYPING-0123456789',{delay:15});
 const saveStart=Date.now();await expect(page.locator('.save-status')).toContainText('已保存到本机');summary.lastKeyToSavedMs=Date.now()-saveStart;
 assert.match((await api('page.read-markdown',{pageId:a.id})).markdown,/PERFORMANT-TYPING-0123456789/);
 const input=await page.evaluate(()=>({paints:window.__inputPaint,longTasks:window.__longTasks}));summary.input=input;summary.navigationMs=navigation;summary.patchPackets=rpc;
 assert.ok(input.paints.length>10);const sorted=[...input.paints].sort((a,b)=>a-b);summary.inputP95=sorted[Math.floor(sorted.length*.95)];
 assert.ok(summary.inputP95<150,'typing p95 exceeds 150 ms');assert.ok(rpc.length<15,'typing did not coalesce');assert.ok(rpc.every(x=>x.responseBytes<250000),'typing response included whole notebook');
 pass('large notebook typing stays responsive, batches keystrokes and transmits only changed state');
 // Also edit an existing long technical page, rather than only the small probe.
 const locations=(await api('fs.audit')).pages;
 const candidates=locations.flatMap(location=>{try{const p=JSON.parse(fs.readFileSync(location.absolutePath,'utf8')).page;return p&&!p.trashedAt&&!p.database&&p.blocks?.some(b=>b.type==='paragraph')?[{p,bytes:JSON.stringify(p.blocks).length}]:[]}catch{return[]}}).sort((a,b)=>b.bytes-a.bytes);
 const technical=candidates.find(x=>x.bytes>100000&&x.bytes<500000);
 if(technical){
  await goto(technical.p);await expect(page.locator('.save-status')).toContainText('已保存到本机');
  await page.evaluate(()=>{window.__inputPaint=[];window.__longTasks=[]});
  await paragraph().click();await page.keyboard.press('End');await page.keyboard.type(' LONG-PAGE-EDIT-TEST',{delay:30});await expect(page.locator('.save-status')).toContainText('已保存到本机');
  const values=await page.evaluate(()=>window.__inputPaint);values.sort((a,b)=>a-b);summary.longPage={blockBytes:technical.bytes,inputP95:values[Math.floor(values.length*.95)]};
  assert.ok(summary.longPage.inputP95<150,'existing long technical page typing is too slow');
  assert.match((await api('page.read-markdown',{pageId:technical.p.id})).markdown,/LONG-PAGE-EDIT-TEST/);
  pass('existing long technical page also meets the keydown-to-paint latency gate');
 }
 await goto(a);
 await api('page.update',{pageId:b.id,title:'外部更新已到达'});await expect(page.locator(`.sidebar [data-page-id="${b.id}"]`).first()).toContainText('外部更新已到达');
 // Deliberately reject commits while keeping the recovery-file API online.
 await page.route('**/rpc',async route=>{const body=route.request().postDataJSON();if(body.method==='workspace.patch')await route.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:'Injected transient commit failure',data:{code:'TEST_COMMIT_FAILURE'}},revision:0})});else await route.continue()});
 await paragraph().click();await page.keyboard.press('End');await page.keyboard.type(' RECOVER-AFTER-CLOSE',{delay:10});await expect(page.locator('.save-status')).toContainText('保存失败');
 backendPid=(await api('status')).pid;const closeStart=Date.now();await app.close();app=undefined;summary.closeMs=Date.now()-closeStart;assert.ok(summary.closeMs<5000);
 await until(()=>{try{process.kill(backendPid,0);return false}catch(error){return error.code==='ESRCH'}});
 const draft=JSON.parse(fs.readFileSync(path.join(base,'.mininotion/hosted-draft.json'),'utf8'));assert.ok(draft.patches?.length);
 pass('a failed commit still closes after a durable recovery checkpoint; backend exits without an orphan');
 app=await launch();await (await app.firstWindow()).locator('.infinite-canvas').waitFor();await open();await goto(a);await expect(page.locator('.save-status')).toContainText('已保存到本机');
 assert.match((await api('page.read-markdown',{pageId:a.id})).markdown,/RECOVER-AFTER-CLOSE/);
 assert.equal((await api('fs.audit')).valid,true);await page.screenshot({path:path.join(out,'restored-large-workspace.png'),animations:'disabled'});
 backendPid=(await api('status')).pid;const normalStart=Date.now();await app.close();app=undefined;summary.cleanCloseMs=Date.now()-normalStart;await until(()=>{try{process.kill(backendPid,0);return false}catch(error){return error.code==='ESRCH'}});
 assert.deepEqual(errors,[]);pass('reopening replays the exact retained draft and clean quit releases the service');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({accepted:true,checks,errors,...summary},null,2));console.log(JSON.stringify({checks:checks.length,pages:summary.pagesBefore,inputP95:summary.inputP95,closeMs:summary.closeMs,cleanCloseMs:summary.cleanCloseMs,navigationMs:navigation,errors}));
}catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,errors,...summary},null,2));throw error}
finally{await app?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
