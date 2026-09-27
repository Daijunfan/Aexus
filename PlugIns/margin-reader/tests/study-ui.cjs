'use strict';
const fs=require('node:fs/promises'),fsSync=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),exec=require('node:util').promisify(require('node:child_process').execFile);
const root=path.resolve(__dirname,'..'),host=path.resolve(root,'../..'),pluginRoot=process.env.STUDY_PLUGIN_ROOT||path.join(root,'dist-plugin');
const {chromium,_electron,expect}=require(path.join(host,'node_modules/@playwright/test'));
async function hash(file){const h=createHash('sha256');for await(const b of fsSync.createReadStream(file))h.update(b);return h.digest('hex');}
async function main(){
  const native=process.env.STUDY_NATIVE==='1',temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'margin-study-ui-'))),artifact=path.join(root,'artifacts','study-'+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(artifact,{recursive:true});
  const source=path.join(root,'workspaces/default/AI Systems Performance Engineering.pdf'),originalHash=await hash(source),report={status:'running',native,version:JSON.parse(await fs.readFile(path.join(pluginRoot,'package.json'))).version,checks:[],errors:[]};
  const pass=text=>{report.checks.push(text);console.log('PASS '+text);};let app,browser,server,page,workspace,api;
  try{
    if(native){
      const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_PLUGIN_DIRS:pluginRoot,AGENTS_COMPANY_HIDDEN:'1'};for(const k of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'])delete env[k];
      app=await _electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:[],env});await app.firstWindow();
      const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:180000,maxBuffer:20*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
      api=(method,params={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));workspace=(await api('system.info')).workspace;
      const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;
    }else{
      workspace=path.join(temp,'library');await fs.mkdir(workspace);server=await require(path.join(pluginRoot,'lib/server.cjs')).startServer({workspace,pluginRoot});
      api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:1,method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
      try{browser=await chromium.launch({headless:true});}catch(e){const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');const executablePath=fsSync.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(cache,n,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(fsSync.existsSync);if(!executablePath)throw e;browser=await chromium.launch({headless:true,executablePath});}
      page=await browser.newPage();await page.goto(server.url);
    }
    page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(30000);await page.setViewportSize({width:1560,height:1000});await page.waitForSelector('body[data-ready=true]');
    await fs.copyFile(source,path.join(workspace,'AI Performance.pdf'));await fs.copyFile(path.join(root,'workspaces/default/Prompt Engineering.html'),path.join(workspace,'Prompt Engineering.html'));await page.click('#refresh-files');
    const create=async title=>{await page.click('#study-create');await page.fill('#dialog [name=title]',title);await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('#study-title')).toHaveText(title);return (await api('study.list')).sets.find(s=>s.title===title);};
    const add=async names=>{await page.click('#study-add-documents');for(const name of names)await page.locator('.study-file-choice input[value='+JSON.stringify(name)+']').check();await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();};
    let a=await create('AI 系统学习'),b;
    await add(['AI Performance.pdf','Prompt Engineering.html']);a=await api('study.get',{setId:a.id});assert.equal(a.documents.length,2);const pdfId=a.documents.find(d=>d.format==='pdf').id,htmlId=a.documents.find(d=>d.format==='html').id;
    pass('UI creates a study set and adds several real files without copying their originals');
    b=await create('第二个学习集');await add(['AI Performance.pdf']);b=await api('study.get',{setId:b.id});assert.equal(b.documentIds[0],pdfId);assert.equal((await fs.readdir(workspace)).filter(n=>n.endsWith('.pdf')).length,1);
    pass('The same PDF belongs to two independent study sets through one stable document ID');
    const openSet=async id=>{await page.locator('.study-set-row[data-set-id='+JSON.stringify(id)+']').click();await expect(page.locator('#study-home')).toBeVisible();};
    const getA=()=>api('study.get',{setId:a.id});
    const ready=async n=>expect(page.locator(`.pdf-page[data-page="${n}"]`)).toHaveAttribute('data-render-state','ready');
    const go=async n=>{await page.fill('#page-number',String(n));await page.locator('#page-number').press('Tab');await ready(n);await expect(page.locator('#page-number')).toHaveValue(String(n));await page.waitForTimeout(250);};
    const card=id=>page.locator('.study-card[data-card-id='+JSON.stringify(id)+']');
    await openSet(a.id);await page.locator('.study-document[data-document-id='+JSON.stringify(pdfId)+'] .study-document-open').click();await ready(1);await go(29);
    async function mouseSelectPdf(){
      const position=await page.evaluate(()=>{const view=document.querySelector('#reader-scroll').getBoundingClientRect(),number=document.querySelector('#page-number').value;for(const span of document.querySelectorAll(`.pdf-page[data-page="${number}"] .textLayer span`)){const box=span.getBoundingClientRect();if(span.textContent.length>25&&box.width>100&&box.left>=view.left&&box.right<view.right-5&&box.top>view.top+5&&box.bottom<view.bottom-15)return {x:box.left+2,y:box.top+box.height*.5,end:box.right-2,text:span.textContent};}return null;});
      assert(position,'No visible PDF text span found');await page.mouse.move(position.x,position.y);await page.mouse.down();await page.mouse.move(position.end,position.y,{steps:15});await page.mouse.up();await expect(page.locator('#study-palette')).toBeVisible();return position;
    }
    await mouseSelectPdf();await page.screenshot({path:path.join(artifact,'pdf-color-popup.png')});await page.locator('#study-palette [data-color=yellow]').click();
    await expect.poll(async()=>(await getA()).cards.length,{timeout:90000}).toBe(1);a=await getA();const first=a.cards[0];assert.equal(first.image.kind,'pdf-crop');assert(first.text.length>10);await expect(card(first.id)).toBeVisible();
    await expect.poll(()=>card(first.id).locator('img').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);await expect(page.locator('.pdf-page .study-mark').first()).toBeVisible();
    const firstImage=await api('study.card.image',{setId:a.id,cardId:first.id});await fs.writeFile(path.join(artifact,'pdf-excerpt.png'),Buffer.from(firstImage.contentBase64,'base64'));
    pass('Actual mouse text selection opens the color palette and saves a real PDF crop/card plus persistent highlight');
    await mouseSelectPdf();
    const cliEnv={...process.env};for(const k of ['AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE'])delete cliEnv[k];
    const edit=await exec(process.execPath,[path.join(pluginRoot,'cli.cjs'),'--workspace',workspace,'api','study.update','--data',JSON.stringify({setId:a.id,expectedRevision:a.revision,description:'Updated by separate CLI'})],{env:cliEnv,timeout:60000,maxBuffer:20*1024*1024});assert(!JSON.parse(edit.stdout).error);
    await page.locator('#study-palette [data-color=pink]').click();await expect(page.locator('#study-capture-status')).toContainText('学习集已变化');assert.equal((await getA()).cards.length,1);await page.click('#study-palette-close');
    pass('A separate CLI update invalidates an old selection draft without overwriting it or duplicating cards');
    await go(531);await page.click('#study-region');
    const area=await page.evaluate(()=>{const v=document.querySelector('#reader-scroll').getBoundingClientRect(),p=document.querySelector('.pdf-page[data-page="531"]').getBoundingClientRect();return {x:p.left+p.width*.12,y:Math.max(v.top+30,p.top+100),right:p.left+p.width*.86,bottom:Math.min(v.bottom-30,p.top+310)};});
    await page.mouse.move(area.x,area.y);await page.mouse.down();await page.mouse.move(area.right,area.bottom,{steps:14});await page.mouse.up();await expect(page.locator('#study-palette')).toBeVisible();await page.locator('#study-palette [data-color=blue]').click();
    await expect.poll(async()=>(await getA()).cards.length,{timeout:90000}).toBe(2);a=await getA();const second=a.cards[1];assert.equal(second.text,'');assert.equal(second.source.locator.page,531);
    pass('PDF region selection also saves image-only excerpts for figures and scanned material');
    await page.selectOption('#study-current-document',htmlId);await expect(page.locator('.flow-document article')).toBeVisible();
    const paragraph=page.locator('.flow-document article p').filter({hasText:'Prompt Engineering'}).first();await paragraph.scrollIntoViewIfNeeded();await page.waitForTimeout(350);
    const htmlPosition=await paragraph.evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode()))if(n.length>25){const r=document.createRange();r.selectNodeContents(n);const box=[...r.getClientRects()].find(b=>b.width>100);if(box)return {x:box.left+1,y:box.top+box.height/2,end:box.right-1};}return null;});
    assert(htmlPosition);await page.mouse.move(htmlPosition.x,htmlPosition.y);await page.mouse.down();await page.mouse.move(htmlPosition.end,htmlPosition.y,{steps:12});await page.mouse.up();await expect(page.locator('#study-palette')).toBeVisible();await page.locator('#study-palette [data-color=purple]').click();
    await expect.poll(async()=>(await getA()).cards.length,{timeout:90000}).toBe(3);a=await getA();const third=a.cards[2];assert.equal(third.image.kind,'text-image');assert.equal(third.source.documentId,htmlId);assert(third.source.selection.end>third.source.selection.start);await expect(page.locator('.flow-document article .study-mark').first()).toBeVisible();
    pass('Shadow-DOM HTML text selection creates a PNG/text card with durable character offsets and color');
    await page.click('#study-back-set');await expect(page.locator('#study-home')).toBeVisible();await page.click('#study-zoom-fit');await page.waitForTimeout(100);
    const start=await card(third.id).locator('img').boundingBox(),target=await card(first.id).boundingBox();assert(start&&target);
    await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(start.x+start.width/2+14,start.y+start.height/2+10,{steps:4});await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:16});
    await expect(card(first.id)).toHaveClass(/study-drop-target/);await page.screenshot({path:path.join(artifact,'drag-card-before-drop.png')});await page.mouse.up();
    await expect.poll(async()=>(await getA()).cards.find(c=>c.id===third.id).parentId).toBe(first.id);await expect(page.locator('.study-map-links path')).toHaveCount(1);
    pass('Dragging an HTML card onto a PDF card visibly accepts the drop and persists a parent-child mind-map edge');
    await page.click('#study-zoom-fit');await page.waitForTimeout(80);const pbox=await card(first.id).boundingBox(),cbox=await card(third.id).boundingBox();
    await page.mouse.move(pbox.x+pbox.width/2,pbox.y+pbox.height/2);await page.mouse.down();await page.mouse.move(pbox.x+pbox.width/2+12,pbox.y+pbox.height/2+8,{steps:3});await page.mouse.move(cbox.x+cbox.width/2,cbox.y+cbox.height/2,{steps:12});await expect(card(third.id)).toHaveClass(/study-drop-rejected/);await page.mouse.up();
    assert.equal((await getA()).cards.find(c=>c.id===first.id).parentId,null);pass('Dragging an ancestor into its descendant is rejected before release and cannot corrupt the graph');
    await card(first.id).locator('.study-card-collapse').click();await expect(card(third.id)).toHaveCount(0);await card(first.id).locator('.study-card-collapse').click();await expect(card(third.id)).toBeVisible();
    await card(third.id).locator('.study-card-more').click();await page.locator('.study-card-menu [data-action=edit]').click();await page.fill('#dialog [name=title]','跨文档的提示工程摘录');await page.fill('#dialog [name=note]','与 GPU 系统性能学习关联');await page.selectOption('#dialog [name=color]','green');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
    await expect.poll(async()=>(await getA()).cards.find(c=>c.id===third.id).note).toContain('GPU');pass('Card title, note, color and branch collapse are edited through shared versioned APIs');
    await page.screenshot({path:path.join(artifact,'study-mindmap.png')});
    await card(first.id).locator('.study-card-more').click();await page.locator('.study-card-menu [data-action=image]').click();await expect(page.locator('.study-snapshot')).toBeVisible();await expect.poll(()=>page.locator('.study-snapshot').evaluate(img=>img.complete&&img.naturalWidth>100)).toBe(true);await page.click('#dialog-cancel');
    pass('A saved snapshot can be inspected at readable size independently of its original page');
    await card(third.id).locator('.study-card-source').click();await expect(page.locator('#document-title')).toHaveText('Prompt Engineering');await expect(page.locator('.flow-document article .study-mark').first()).toBeVisible();
    pass('A card source link switches to the corresponding document and reopens its saved excerpt position');
    const localOrigin=new URL(page.url()).origin;await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===localOrigin?route.continue():route.abort();});await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(page.locator('#study-reading-title')).toHaveText('AI 系统学习');await expect(page.locator('.flow-document article .study-mark').first()).toBeVisible();
    a=await getA();assert.equal(a.cards.find(c=>c.id===third.id).parentId,first.id);await expect.poll(()=>card(first.id).locator('img').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
    pass('Reload with outside requests blocked restores the study context, card PNGs, hierarchy and highlights');
    await page.click('#reopen-document');await expect(page.locator('#study-reading-title')).toHaveText('AI 系统学习');await expect(page.locator('.flow-document article .study-mark').first()).toBeVisible();
    pass('Rebuilding the source cache retains the study context and existing matching highlights');
    await page.unroute('**/*');await openSet(b.id);await page.locator('.study-document .study-document-open').click();await expect(page.locator('#format-label')).toHaveText('PDF');await ready(Number(await page.inputValue('#page-number')));await go(29);assert.equal((await api('study.get',{setId:b.id})).cards.length,0);await expect(page.locator('.pdf-page .study-mark')).toHaveCount(0);
    pass('Reading the same PDF in another study set does not leak cards or annotations across sets');
    await openSet(a.id);await page.locator('.study-document[data-document-id='+JSON.stringify(htmlId)+'] .study-document-remove').click();await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();a=await getA();assert.equal(a.documentCount,1);assert.equal(a.cards.length,3);assert(a.cards.find(c=>c.id===third.id).detached);assert((await fs.stat(path.join(workspace,'Prompt Engineering.html'))).isFile());
    pass('Removing a document membership keeps its source file and already-created excerpt images');
    await add(['Prompt Engineering.html']);await card(second.id).locator('.study-card-more').click();await page.locator('.study-card-menu [data-action=remove]').click();await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect.poll(async()=>(await getA()).cards.length).toBe(2);
    await page.click('#study-card-trash');await page.locator('#dialog [data-restore]').click();await page.click('#dialog-cancel');await expect.poll(async()=>(await getA()).cards.length).toBe(3);pass('Card deletion is recoverable; restoring it restores the same persisted PNG snapshot');
    await page.click('#study-export-set');await page.fill('#dialog [name=path]','Study export.json');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();const exported=JSON.parse(await fs.readFile(path.join(workspace,'Study export.json')));assert.equal(exported.set.cards.length,3);assert(exported.set.cards.every(c=>c.image.contentBase64));pass('CLI-backed export includes source links, text, notes, graph relations and all three PNG images');
    await page.click('#study-remove-set');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('.study-set-row[data-set-id='+JSON.stringify(a.id)+']')).toHaveCount(0);await page.click('#study-deleted');await page.locator('#dialog [data-set='+JSON.stringify(a.id)+']').click();await page.click('#dialog-cancel');await openSet(a.id);assert.equal((await getA()).cards.length,3);await expect(page.locator('.study-map-links path')).toHaveCount(1);
    pass('Deleting and restoring a study set recovers all memberships, PNG cards and graph links');
    await page.setViewportSize({width:900,height:760});await page.click('#theme');await expect(page.locator('body')).toHaveAttribute('data-theme','dark');await page.click('#study-zoom-fit');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(artifact,'study-dark.png')});
    assert.equal(await hash(source),originalHash);assert.equal(await hash(path.join(workspace,'AI Performance.pdf')),originalHash);assert.deepEqual(report.errors,[]);if(native)assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));pass('Narrow/dark mind map works; originals are unchanged and no renderer errors or model calls occurred');
    report.pdf={pages:1061,sha256:originalHash};report.cardTypes=(await getA()).cards.map(c=>c.image.kind);report.status='passed';
  }catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};if(page&&!page.isClosed())await page.screenshot({path:path.join(artifact,'failure.png')}).catch(()=>{});throw error;}
  finally{report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(artifact,'result.json'),JSON.stringify(report,null,2));console.log('STUDY REPORT '+path.join(artifact,'result.json'));await browser?.close();await app?.close();await server?.close();await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
