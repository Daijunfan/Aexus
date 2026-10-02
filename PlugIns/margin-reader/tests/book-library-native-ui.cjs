'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const exec=require('node:util').promisify(require('node:child_process').execFile),root=path.resolve(__dirname,'..'),host=path.resolve(root,'../..');
const {_electron:electron,expect}=require(path.join(host,'node_modules/@playwright/test'));
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'mr-book-native-'))),out=process.env.MR_BOOK_OUTPUT||await fs.readFile(path.join(root,'artifacts/book-library-current.txt'),'utf8').then(s=>s.trim());
 const pluginRoot=process.env.MR_BOOK_PLUGIN_ROOT||path.join(root,'dist-plugin'),env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'empty'),AGENTS_COMPANY_PLUGIN_DIRS:pluginRoot,AGENTS_COMPANY_HIDDEN:'1'};
 for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'].includes(key))delete env[key];
 const report={passed:false,checks:[],errors:[],modelCalls:0,installedPackage:process.env.MR_BOOK_PLUGIN_ROOT||null};let app,page;
 const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
 try{
  const nativeApp=process.env.MR_BOOK_NATIVE_APP;
  app=await electron.launch({executablePath:nativeApp||require(path.join(host,'node_modules/electron')),args:nativeApp?[]:[host],env});await app.firstWindow();
  const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:24*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
  const api=(m,p={})=>cli('plugin','call','margin-reader',m,'--params',JSON.stringify(p));const info=await api('system.info');assert(info.workspace.startsWith(temp+path.sep));assert(info.commands.includes('study.library.move'));
  await fs.writeFile(path.join(info.workspace,'book.pdf'),require('./fixtures.cjs').pdfFixture());await api('fs.write',{path:'article.html',content:'<h1>Native article cover</h1><p>This preview comes from the original local HTML.</p>'});
  const folders=await api('study.folder.create',{expectedRevision:0,title:'Native collection'}),folderId=folders.folders[0].id;
  let s=await api('study.create',{title:'Native study',folderId});s=await api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['book.pdf','article.html']});
  const doc=await api('document.get',{id:s.documentIds[0]});const capture=await api('study.card.create',{setId:s.id,expectedRevision:s.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'',color:'yellow',title:'Native source card',locator:{page:2},selection:{rects:[{page:2,x:.1,y:.06,width:.7,height:.12}]}});
  await api('settings.set',{homeSection:'studies',studyFolder:folderId,studyLibraryView:'grid',activeStudySet:null,lastDocument:null,pdfMode:'paged',pdfFit:'page'});
  const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));await page.waitForSelector('body[data-ready=true]');
  await expect(page.locator('#study-library-view')).toBeVisible();await expect(page.locator('#study-library-title')).toHaveText('Native collection');
  await page.locator(`.collection-tile[data-collection-id="${s.id}"] .collection-open`).click();await expect(page.locator('#study-title')).toHaveText('Native study');
  await expect(page.locator('.study-document[data-path="book.pdf"]')).toHaveAttribute('data-preview','ready',{timeout:30000});await expect(page.locator('.study-document[data-path="article.html"]')).toHaveAttribute('data-preview','ready',{timeout:30000});
  pass('The hidden native host loads independent study folders and real PDF/HTML member thumbnails from the selected package');
  await page.locator('.study-document[data-path="book.pdf"] .study-document-open').click();await expect(page.locator('.pdf-page[data-page="1"]')).toHaveAttribute('data-render-state','ready');
  for(let i=0;i<3;i++){await page.click('#next-page');await expect(page.locator('.pdf-page[data-page="2"]')).toHaveAttribute('data-render-state','ready');await page.click('#previous-page');await expect(page.locator('.pdf-page[data-page="1"]')).toHaveAttribute('data-render-state','ready');}
  const card=page.locator(`.study-card[data-card-id="${capture.card.id}"]`);await card.locator('header strong').click();await expect(page.locator('.pdf-page[data-page="2"]')).toHaveAttribute('data-render-state','ready');await expect(page.locator('.study-mark')).toBeInViewport();
  await page.click('#study-back-set');await page.click('#library-root');await expect(page.locator('#library-view')).toBeVisible();await page.click('#studies-root');await expect(page.locator('#study-library-view')).toBeVisible();
  await page.click('#study-library-list');await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(page.locator('#study-library-items')).toHaveClass(/list/);
  pass('Native page controls repeatedly advance and return, source-card clicks show the actual PDF annotation, and both sidebar destinations retain their saved view');
  const navigation=await page.evaluate(()=>['study-library-sidebar','file-library-sidebar'].map(id=>[...document.getElementById(id).children].map(el=>el.id)));assert.deepEqual(navigation,[['studies-root','study-set-list'],['library-root','file-tree']]);await expect(page.locator('.explorer input,.explorer #workspace-card-box')).toHaveCount(0);
  await page.click('#library-root');await expect(page.locator('#library-view')).toBeVisible();await expect(page.locator('#folder-title')).toHaveText('我的文库');await page.fill('#file-filter','book.pdf');await expect(page.locator('#files .file-card')).toHaveCount(1);await expect(page.locator('#file-tree .tree-row')).toHaveCount(2);await expect(page.locator('#files .file-info')).toContainText('book.pdf');await page.click('#clear-file-filter');await expect(page.locator('#files .file-card')).toHaveCount(2);
  pass('The installed native sidebar contains only matching category buttons and directory trees; main-page search filters results without hiding navigation entries');
  assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(report.errors,[]);report.passed=true;
  await page.screenshot({path:path.join(out,process.env.MR_BOOK_PLUGIN_ROOT?'installed-native-library.png':'native-library.png')});
 }catch(e){report.errors.push(e.message);await page?.screenshot({path:path.join(out,'native-book-failure.png')}).catch(()=>{});throw e;}
 finally{
  await fs.writeFile(path.join(out,process.env.MR_BOOK_PLUGIN_ROOT?'installed-native-results.json':'native-results.json'),JSON.stringify(report,null,2));
  if(app){const timer=setTimeout(()=>{try{app.process().kill('SIGKILL');}catch{}},10000);try{await app.close();}finally{clearTimeout(timer);}}
  await fs.rm(temp,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
