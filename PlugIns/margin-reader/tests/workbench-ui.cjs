'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium,_electron,expect}=require('../../../node_modules/@playwright/test');
const {startServer}=require('../dist-plugin/lib/server.cjs');
async function main(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'margin-workbench-ui-'));let workspace=temp,server,browser,app,page,api;
 const native=process.env.WORKBENCH_NATIVE==='1',errors=[];
 try{
 if(native){
   const host=path.resolve(__dirname,'../../..'),env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_PLUGIN_DIRS:process.env.WORKBENCH_PLUGIN_ROOT||path.join(host,'build/plugins/margin-reader'),AGENTS_COMPANY_HIDDEN:'1'};
   for(const k of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'])delete env[k];
   const exec=require('node:util').promisify(require('node:child_process').execFile);
   const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:8*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
   app=await _electron.launch({executablePath:process.env.WORKBENCH_APP||'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:[],env});await app.firstWindow();
   api=(method,params={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));workspace=(await api('system.info')).workspace;
   const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;
 }else{
   server=await startServer({workspace});api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:1,method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
   const sync=require('node:fs'),cache=path.join(os.homedir(),'Library/Caches/ms-playwright');const executablePath=sync.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(cache,n,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(sync.existsSync);browser=await chromium.launch({headless:true,executablePath});page=await browser.newPage();await page.goto(server.url);
 }
 const scoped=path.relative(await fs.realpath(temp),await fs.realpath(workspace));assert(!scoped.startsWith('..')&&!path.isAbsolute(scoped),'UI test workspace escaped its isolated root');
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);await page.setViewportSize({width:1440,height:960});await page.waitForSelector('body[data-ready=true]');
 await page.click('#studies-root');await page.click('#study-create');await page.fill('[name=title]','知识与记忆');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
 const create=async(title,text,tags)=>{await page.click('#study-add-note');await page.fill('[name=title]',title);await page.fill('[name=text]',text);await page.fill('[name=tags]',tags);await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();};
 await create('主动回忆','先尝试回忆，再核对原文。','学习, 方法');await create('间隔重复','在遗忘之前复习。','学习');
 const id=(await api('study.list')).sets[0].id,get=()=>api('study.get',{setId:id});let set=await get();assert.equal(set.cards.length,2);
 await page.click('#study-undo');await expect.poll(async()=>(await get()).cards.length).toBe(1);await page.click('#study-redo');await expect.poll(async()=>(await get()).cards.length).toBe(2);
 await page.click('[data-study-view=cards]');await expect(page.locator('.study-list-card')).toHaveCount(2);
 await page.fill('#study-card-search','主动');await expect(page.locator('.study-list-card')).toHaveCount(1);await page.fill('#study-card-search','');await expect(page.locator('.study-list-card')).toHaveCount(2);
 await page.selectOption('#study-tag-filter','方法');await expect(page.locator('.study-list-card')).toHaveCount(1);await page.selectOption('#study-tag-filter','');await expect(page.locator('.study-list-card')).toHaveCount(2);
 const a=set.cards[0].id,b=set.cards[1].id,card=id=>page.locator('.study-list-card[data-card-id="'+id+'"]');
 await card(a).locator('[data-do=links]').click();await page.click('#content-add-link');await page.locator(`#link-results [data-uri$="/${b}"]`).click();await page.fill('[name=label]','协同作用');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();const linked=(await get()).links;assert.equal(linked.length,1);assert.equal(linked[0].from,a);assert.equal(linked[0].to,b);assert.equal(linked[0].label,'协同作用');
 await card(a).locator('[data-do=review]').click();await page.fill('[name=front]','什么是主动回忆？');await page.fill('[name=back]','不看原文，尝试提取知识。');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
 await page.click('[data-study-view=review]');await expect(page.locator('.study-review-front')).toHaveText('什么是主动回忆？');await expect(page.locator('#study-review-answer')).toBeHidden();await page.click('#study-review-reveal');await expect(page.locator('#study-review-answer')).toContainText('尝试提取知识');await page.click('[data-grade=easy]');await expect(page.locator('.study-review-empty')).toContainText('本轮复习完成');await page.locator('#study-cards-panel').press('Space');
 assert.equal((await get()).cards.find(c=>c.id===a).review.schedule.reps,1);await page.click('#study-undo');await expect(page.locator('.study-review-front')).toBeVisible();assert.equal((await get()).cards.find(c=>c.id===a).review.schedule.reps,0);
 await page.click('[data-study-view=outline]');await page.locator('#study-cards-panel').press('1');await expect(page.locator('.study-list-card')).toHaveCount(2);await card(b).focus();await page.keyboard.press('Tab');await expect.poll(async()=>(await get()).cards.find(c=>c.id===b).parentId).toBe(a);
 await card(a).locator('[data-do=collapse]').click();await expect(page.locator('.study-list-card')).toHaveCount(1);await card(a).locator('[data-do=collapse]').click();await expect(page.locator('.study-list-card')).toHaveCount(2);
 await page.click('[data-study-view=map]');await expect(page.locator('[data-study-view=map]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#study-map-viewport')).toBeVisible();await expect(page.locator('.study-association')).toHaveCount(1);
 await page.screenshot({path:path.resolve(__dirname,'../artifacts/workbench-map.png')});
 await page.click('[data-study-view=cards]');await expect(page.locator('#study-cards-panel')).toBeVisible();await page.screenshot({path:path.resolve(__dirname,'../artifacts/workbench-cards.png')});
 await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(page.locator('[data-study-view=cards]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.study-list-card')).toHaveCount(2);
 await page.setViewportSize({width:900,height:760});await page.click('#theme');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.resolve(__dirname,'../artifacts/workbench-dark.png')});

 await fs.writeFile(path.join(workspace,'handwriting.pdf'),require('./fixtures.cjs').pdfFixture());set=await get();await api('study.documents.add',{setId:id,expectedRevision:set.revision,paths:['handwriting.pdf']});
 await page.reload();await page.waitForSelector('body[data-ready=true]');await page.locator('.study-document-open').click();await page.waitForSelector('.pdf-page[data-render-state=ready]');
 await page.click('#reader-bookmarks');await page.fill('[name=title]','重要页面');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
 await page.click('#reader-bookmarks');await expect(page.locator('.bookmark-row')).toContainText('重要页面');await page.locator('[data-toggle]').click();await expect(page.locator('.bookmark-row')).toContainText('已删除');await page.locator('[data-toggle]').click();await expect(page.locator('.bookmark-row')).not.toHaveClass(/removed/);await page.click('#dialog-cancel');
 await page.setViewportSize({width:1440,height:960});await page.click('[data-study-view=map]');await page.click('#study-pen');await page.waitForFunction(()=>{const el=document.querySelector('.pdf-page[data-render-state=ready]');if(!el||document.getElementById('reader-scroll').getAttribute('aria-busy')==='true')return false;const r=el.getBoundingClientRect(),key=[r.x,r.y,r.width,r.height].join(',');if(window.workbenchPageBox!==key){window.workbenchPageBox=key;window.workbenchPageTime=performance.now();return false;}return performance.now()-window.workbenchPageTime>300;});const box=await page.locator('.pdf-page[data-render-state=ready]').first().boundingBox();
 await page.mouse.move(box.x+80,box.y+120);await page.mouse.down();await page.mouse.move(box.x+160,box.y+170,{steps:8});await page.mouse.move(box.x+220,box.y+125,{steps:8});await page.mouse.up();await expect.poll(async()=>(await get()).ink.length).toBe(1);await expect(page.locator('.study-ink-layer polyline')).toHaveCount(1);
 await expect(page.locator('#study-ink-status')).toHaveText('已保存');await page.click('#study-eraser');const drawn=(await get()).ink[0],inkBox=await page.locator('.pdf-page').first().boundingBox(),point=drawn.points[3];await page.mouse.click(inkBox.x+point[0]*inkBox.width,inkBox.y+point[1]*inkBox.height);await expect.poll(async()=>(await get()).ink.length).toBe(0);await page.click('#study-undo');await expect.poll(async()=>(await get()).ink.length).toBe(1);await page.click('#study-eraser');
 const divider=page.locator('#outline-divider'),d=await divider.boundingBox();await page.mouse.move(d.x,d.y+200);await page.mouse.down();await page.mouse.move(d.x+70,d.y+200,{steps:6});await page.mouse.up();await expect.poll(async()=>(await api('settings.get')).studyRatio).toBeGreaterThan(.53);
 await page.screenshot({path:path.resolve(__dirname,'../artifacts/workbench-reading.png')});
 await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(page.locator('.study-ink-layer polyline')).toHaveCount(1);assert.equal((await api('bookmark.list',{id:(await get()).documents[0].id})).bookmarks.length,1);
 assert.deepEqual(await fs.readFile(path.join(workspace,'handwriting.pdf')),require('./fixtures.cjs').pdfFixture());
 assert.deepEqual(errors,[]);
 if(native)assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
 await fs.writeFile(path.resolve(__dirname,'../artifacts/workbench-'+(native?'native':'browser')+'-results.json'),JSON.stringify({passed:true,native,version:(await api('system.info')).version,browserErrors:errors,checks:['note cards','tags and search','links','outline','review and undo','bookmarks','handwriting and erasing','split ratio','reload','dark theme','source preservation'],modelCalls:0},null,2));
 assert.deepEqual(errors,[]);console.log('PASS workbench: note creation, query/tag filtering, links, outline hierarchy/collapse, FSRS reveal/rating/undo, persisted views, dark/narrow layout; zero browser errors');
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.resolve(__dirname,'../artifacts/workbench-failure.png')}).catch(()=>{});throw error;}finally{await browser?.close();await app?.close();await server?.close();await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
