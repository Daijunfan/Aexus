'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const exec=require('node:util').promisify(require('node:child_process').execFile),root=path.resolve(__dirname,'..'),host=path.resolve(root,'../..');
const {_electron:electron,expect}=require(path.join(host,'node_modules/@playwright/test'));
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-mindmap-native-'))),out=(await fs.readFile(path.join(root,'artifacts/mindmap-current.txt'),'utf8')).trim();
 const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'empty'),AGENTS_COMPANY_PLUGIN_DIRS:process.env.MR_MINDMAP_PLUGIN_ROOT||path.join(root,'dist-plugin'),AGENTS_COMPANY_HIDDEN:'1'};
 for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'].includes(key))delete env[key];
 const report={passed:false,checks:[],errors:[],modelCalls:0,platform:process.platform};let app,page;
 const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
 try{
  const nativeApp=process.env.MR_MINDMAP_NATIVE_APP;
  app=await electron.launch({executablePath:nativeApp||require(path.join(host,'node_modules/electron')),args:nativeApp?[]:[host],env});await app.firstWindow();
  const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:24*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
  const api=(method,p={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(p));const info=await api('system.info');assert(info.workspace.startsWith(temp+path.sep));
  await fs.writeFile(path.join(info.workspace,'source.pdf'),require('./fixtures.cjs').pdfFixture());let set=await api('study.create',{title:'原生导图验收'});
  const refresh=async()=>set=await api('study.get',{setId:set.id}),change=async(m,p)=>{await refresh();return set=await api(m,{setId:set.id,expectedRevision:set.revision,...p});};
  await change('study.mindmap.template.apply',{template:'project',title:'原生视觉工作台'});await change('study.documents.add',{paths:['source.pdf']});const doc=await api('document.get',{id:set.documentIds[0]});
  const capture=await api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'',color:'blue',title:'精确原文摘录',locator:{page:2},selection:{rects:[{page:2,x:.1,y:.06,width:.7,height:.12}]}});
  await change('study.card.move',{cardId:capture.card.id,parentId:set.cards[0].id});await api('study.open',{setId:set.id});
  const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  await app.evaluate(({BrowserWindow},url)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);w.setBounds({width:1460,height:980});},page.url());await page.locator('body[data-ready=true]').waitFor();
  await expect(page.locator('#study-board')).toHaveClass(/mindmap-enabled/);await page.click('#mm-themes');await page.locator('[data-mm-theme=forest]').click();await expect.poll(async()=>(await refresh()).map.mindmap.theme).toBe('forest');await page.click('#mm-panel-close');
  await page.selectOption('#mm-structure','org-down');await expect.poll(async()=>(await refresh()).map.mindmap.structure).toBe('org-down');await page.click('#study-zoom-fit');
  const rootId=set.cards[0].id;await page.locator(`.mindmap-topic[data-card-id="${rootId}"]`).focus();await page.keyboard.press('Tab');await page.locator('.mm-inline-title').fill('原生新增主题');await page.keyboard.press('Enter');await expect(page.locator('.mm-inline-title')).toHaveCount(0);await refresh();const added=set.cards.find(c=>c.title==='原生新增主题');assert(added&&added.parentId===rootId);
  pass('Hidden native window edits map themes, hierarchy and inline titles through the same authenticated plugin Core');
  await change('study.mindmap.topics.update',{cardIds:[added.id],patch:{priority:1,shape:'hexagon'}});await expect(page.locator(`.mindmap-topic[data-card-id="${added.id}"]`)).toHaveAttribute('data-topic-shape','hexagon');await page.reload();await page.locator('body[data-ready=true]').waitFor();await expect(page.locator('#mm-structure')).toHaveValue('org-down');
  await page.click('#study-zoom-fit');const card=page.locator(`.mindmap-topic[data-card-id="${capture.card.id}"]`);await card.locator('header strong').click();await expect(page.locator('#document-path')).toHaveText('source.pdf');await expect(page.locator(`.pdf-page[data-page="2"] .study-mark[data-card-id="${capture.card.id}"]`)).toBeInViewport();
  pass('A separate native CLI style edit synchronizes and survives reload; source-topic clicks still reveal the actual PDF annotation');
  await page.click('#study-back-set');await refresh();const before=set.cards.length;await page.click('#study-undo');await expect.poll(async()=>(await refresh()).cards.find(c=>c.id===added.id)?.mindmap?.shape).toBeUndefined();assert.equal(set.cards.length,before);
  const result=await api('study.mindmap.export',{setId:set.id,expectedRevision:set.revision,format:'svg',path:'native-map.svg'});assert.equal(result.topics,set.cards.length);assert((await fs.readFile(path.join(info.workspace,'native-map.svg'),'utf8')).includes('topic-'+capture.card.id));
  await page.click('#study-zoom-fit');await page.screenshot({path:path.join(out,'native-mindmap.png')});assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(report.errors,[]);report.passed=true;
  pass('Native undo and complete diagram export preserve every topic, including the excerpt image; no real model turns or visible test windows');
 }catch(e){report.errors.push(e.message);await page?.screenshot({path:path.join(out,'native-mindmap-failure.png')}).catch(()=>{});throw e;}
 finally{await fs.writeFile(path.join(out,'native-mindmap-results.json'),JSON.stringify(report,null,2));if(app){const timer=setTimeout(()=>{try{app.process().kill('SIGKILL');}catch{}},10000);try{await app.close();}finally{clearTimeout(timer);}}await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
