'use strict';
// Uses the user's real PDF read-only, in a fresh temporary library. No model calls.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const exec = require('node:util').promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname,'..'), host = path.resolve(root,'../..');
const pluginRoot = process.env.PDF_MODES_PLUGIN_ROOT || path.join(root,'dist-plugin');
const { chromium, _electron, expect } = require(process.env.PLAYWRIGHT_MODULE || path.join(host,'node_modules/@playwright/test'));
async function sha(file) {const hash=createHash('sha256');for await(const part of fsSync.createReadStream(file))hash.update(part);return hash.digest('hex');}
async function main() {
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'), artifacts=path.join(root,'artifacts','pdf-modes-'+stamp);
  await fs.mkdir(artifacts,{recursive:true});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'margin-pdf-modes-'));
  const native=process.env.PDF_MODES_NATIVE==='1';
  const report={status:'running',platform:process.platform,version:JSON.parse(await fs.readFile(path.join(pluginRoot,'package.json'))).version,native,checks:[],startedAt:new Date().toISOString()};
  const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
  let server,browser,app,page,workspace,api;
  const errors=[];
  try {
    const source=process.env.PDF_MODES_BOOK || path.join(root,'workspaces/default/AI Systems Performance Engineering.pdf');
    const originalHash=await sha(source); report.pdf={bytes:(await fs.stat(source)).size,sha256:originalHash};
    if(native){
      const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'home'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_PLUGIN_DIRS:pluginRoot,AGENTS_COMPANY_HIDDEN:'1'};
      for(const k of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'])delete env[k];
      app=await _electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:[],env});
      await app.firstWindow();
      const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:16*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
      api=(method,params={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));
      workspace=(await api('system.info')).workspace;
      await fs.copyFile(source,path.join(workspace,'test-book.pdf'));
      await api('document.open',{path:'test-book.pdf'});
      const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;
    }else{
      workspace=path.join(temp,'library');await fs.mkdir(workspace);
      await fs.copyFile(source,path.join(workspace,'test-book.pdf'));
      server=await require(path.join(pluginRoot,'lib/server.cjs')).startServer({workspace,pluginRoot});
      api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:1,method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
      await api('document.open',{path:'test-book.pdf'});
      try{browser=await chromium.launch({headless:true});}catch(e){
        const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
        const executablePath=fsSync.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(cache,n,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(p=>fsSync.existsSync(p));
        if(!executablePath)throw e;browser=await chromium.launch({headless:true,executablePath});
      }
      page=await browser.newPage({viewport:{width:1440,height:960}});await page.goto(server.url);
    }
    page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(30000);
    if(native)await app.evaluate(({BrowserWindow},url)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);w?.setBounds({width:1440,height:960});},page.url());
    await page.setViewportSize({width:1440,height:960});
    await page.waitForSelector('body[data-ready="true"]');
    const doc=await api('document.open',{path:'test-book.pdf'});assert.equal(doc.pageCount,1061); report.pdf.pages=doc.pageCount;report.pdf.chapters=doc.toc.length;
    const ready=async number=>{await expect(page.locator(`.pdf-page[data-page="${number}"]`)).toHaveAttribute('data-render-state','ready');};
    const number=()=>page.inputValue('#page-number').then(Number);
    const go=async n=>{await page.fill('#page-number',String(n));await page.locator('#page-number').press('Tab');await ready(n);await expect.poll(number).toBe(n);await page.waitForTimeout(350);};
    const pos=()=>page.locator('#reader-scroll').evaluate(e=>e.scrollTop);
    const measure=()=>page.evaluate(()=>{
      const s=document.querySelector('#reader-scroll'),n=Number(document.querySelector('#page-number').value),p=document.querySelector(`.pdf-page[data-page="${n}"]`),c=p?.querySelector('canvas');
      return {page:n,width:s.clientWidth,height:s.clientHeight,top:s.scrollTop,scrollHeight:s.scrollHeight,pageWidth:p?.getBoundingClientRect().width,pageHeight:p?.getBoundingClientRect().height,canvases:document.querySelectorAll('.pdf-page > canvas').length,bitmapPixels:c?c.width*c.height:0,overflowY:getComputedStyle(s).overflowY,scrollbar:getComputedStyle(s).scrollbarWidth};
    });
    await page.evaluate(async()=>{const {PdfGesture}=await import(new URL('pdf-gestures.mjs',location.href));const feed=PdfGesture.prototype.feed;window.gestureTrace=[];PdfGesture.prototype.feed=function(event,options){const previous={last:this.last,axis:this.axis,fired:this.fired};const result=feed.call(this,event,options);window.gestureTrace.push({time:performance.now(),stamp:event.timeStamp,x:event.deltaX,y:event.deltaY,page:Number(document.getElementById('page-number').value),previous,result});if(window.gestureTrace.length>200)window.gestureTrace.shift();return result;};});
    const mouseToReader=async()=>{const box=await page.locator('#reader-scroll').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);};
    const input=await page.context().newCDPSession(page);
    const wheelBurst=async(values,axis)=>{
      const box=await page.locator('#reader-scroll').boundingBox(),start=Date.now()/1000;
      // Real browser wheel events preserve the original 25 ms input spacing,
      // even when rendering or the automation transport delays their handling.
      for(const [i,value] of values.entries()){await input.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x+box.width/2,y:box.y+box.height/2,deltaX:axis==='x'?value:0,deltaY:axis==='y'?value:2,timestamp:start+i*.025});await page.waitForTimeout(25);}
    };
    const settings=async patch=>{
      // Separate CLI invocation proves the preferences can drive the UI without clicking it.
      const r=JSON.parse((await exec(process.execPath,[path.join(pluginRoot,'cli.cjs'),'--workspace',workspace,'api','settings.set','--data',JSON.stringify(patch)],{cwd:root,timeout:60000})).stdout);assert(!r.error,JSON.stringify(r.error));
      await page.waitForTimeout(700);
    };
    await ready(1); await expect(page.locator('#pdf-progress')).toBeHidden();
    let m=await measure();assert.equal(m.overflowY,'scroll');assert(m.scrollHeight>500000);assert(m.canvases<=7);assert(Math.abs(m.pageWidth-(m.width-16))<3);
    await expect(page.locator('#pdf-vertical-progress')).toBeVisible();
    const rail=await page.locator('#pdf-document-progress').boundingBox();assert(rail.height>rail.width*10);
    await page.mouse.click(rail.x+rail.width/2,rail.y+rail.height*0.8);await expect.poll(number).toBeGreaterThan(700);await ready(await number());
    pass('Real 1061-page PDF has a persistent draggable vertical progress rail and at most seven canvases');
    await page.locator('#reader-scroll').evaluate(e=>e.addEventListener('wheel',event=>{window.receivedTestWheelY=event.deltaY;},{capture:true}));
    await go(20);await mouseToReader();let before=await pos();await page.mouse.wheel(0,120);
    await expect.poll(async()=>(await pos())-before).toBeGreaterThan(110);let one=(await pos())-before;
    await page.locator('#pdf-speed').evaluate(e=>{e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
    await expect.poll(async()=>(await api('settings.get')).pdfScrollSpeed).toBe(3);await page.waitForTimeout(500);
    before=await pos();await mouseToReader();await page.mouse.wheel(0,120);await expect.poll(async()=>(await pos())-before).toBeGreaterThan(330);let three=(await pos())-before;
    const receivedDeltaY=await page.evaluate(()=>window.receivedTestWheelY);
    assert(Math.abs(one-receivedDeltaY)<2,'Scroll delta should be applied once, not twice');
    assert(three/one>2.7&&three/one<3.3);report.verticalSpeed={one,three,receivedDeltaY};
    pass('Actual wheel input scrolls vertically; 3× speed produces three times the 1× travel');
    await settings({pdfScrollSpeed:1});await go(100);await mouseToReader();
    const height100=(await measure()).pageHeight; await page.mouse.wheel(2,Math.ceil((height100+100)/(one/120)));
    await expect.poll(number).toBe(101);await ready(101);
    pass('Vertical input crosses actual page boundaries continuously instead of stopping at one page');
    await go(100);await mouseToReader();await page.waitForTimeout(350);
    await wheelBurst([12,24,55,90,65,42,22,10,5,1],'x');
    await expect.poll(number).toBe(101);await ready(101);await page.waitForTimeout(500);assert.equal(await number(),101);
    await page.mouse.wheel(-90,0);await expect.poll(number).toBe(100);await ready(100);
    pass('Left/right trackpad-style wheel bursts turn exactly one page; momentum never cascades pages');
    await page.click('#pdf-paged');await expect(page.locator('#reader-scroll')).toHaveAttribute('data-pdf-mode','paged');await ready(100);
    await expect(page.locator('#pdf-progress')).toBeVisible();await expect(page.locator('#pdf-vertical-progress')).toBeHidden();m=await measure();assert.equal(m.canvases,1);assert.equal(m.scrollbar,'none');assert(Math.abs(m.pageWidth-(m.width-16))<3);
    pass('Paged mode retains the current page, exposes a bottom horizontal progress bar, and still fills the width');
    await page.selectOption('#pdf-fit','page');await ready(100);await page.waitForTimeout(350);m=await measure();
    assert(m.pageWidth<=m.width-15&&m.pageHeight<=m.height-15);assert(Math.min(Math.abs(m.pageWidth-(m.width-16)),Math.abs(m.pageHeight-(m.height-16)))<3);
    pass('Fit-page uses the limiting viewport dimension without stretching or clipping the paper');
    await mouseToReader();await page.waitForTimeout(350);
    await wheelBurst([35,80,50,25,8],'y');
    await expect.poll(number).toBe(101);await ready(101);await page.waitForTimeout(350);
    await page.mouse.wheel(0,-100);await expect.poll(number).toBe(100);await ready(100);
    pass('Vertical gestures in whole-page mode turn one page per gesture without skipping on inertia');
    await page.locator('#pdf-page-progress').evaluate(e=>{e.value='531';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
    await ready(531);await expect.poll(number).toBe(531);
    await page.locator('#pdf-page-progress').press('End');await ready(1061);await expect.poll(number).toBe(1061);
    await mouseToReader();await page.waitForTimeout(350);await page.mouse.wheel(100,0);await page.waitForTimeout(500);assert.equal(await number(),1061);
    pass('The bottom progress slider and keyboard reach the final page; boundary gestures do not exceed it');
    await go(531);await page.screenshot({path:path.join(artifacts,'paged-fit-page.png')});
    await page.selectOption('#pdf-fit','width');await ready(531);await page.click('#pdf-focus');await page.waitForTimeout(650);await ready(531);
    m=await measure();assert(m.width>1000);assert(Math.abs(m.pageWidth-(m.width-16))<3);assert(m.bitmapPixels<=5000000);
    pass('Focus reading frees both sidebars and fills the enlarged viewport; raster memory remains bounded');
    await page.click('#pdf-continuous');await ready(531);await page.waitForTimeout(400);await mouseToReader();await page.mouse.wheel(0,170);
    await page.waitForTimeout(650);const saved=(await api('reader.position.get',{id:doc.id})).locator;assert.equal(saved.page,531);assert(saved.pageOffset>0);
    await page.setViewportSize({width:1700,height:1000});await page.waitForTimeout(650);await ready(531);
    m=await measure();assert(Math.abs(m.pageWidth-(m.width-16))<3);assert(m.pageWidth/504>1.6);
    const after=(await api('reader.position.get',{id:doc.id})).locator;assert.equal(after.page,saved.page);assert(Math.abs(after.pageOffset-saved.pageOffset)<0.02);
    pass('Window resize refits automatically, removes the old scale cap and retains the same intra-page position');
    await page.click('#pdf-focus');await page.waitForTimeout(500);await ready(531);
    await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(500);await ready(531);
    await go(531);await page.screenshot({path:path.join(artifacts,'continuous-width.png')});
    const target=doc.toc.find(n=>n.locator.page>600&&!n.unresolved);assert(target);
    await page.locator(`.outline-row[data-node="${target.id}"] .node-title`).click();await ready(target.locator.page);await expect.poll(number).toBe(target.locator.page);
    pass('An original chapter click jumps into the virtualized continuous document');
    for(const n of [1,950,70,1050,531])await go(n);
    m=await measure();assert(m.canvases<=7);assert.equal(await page.locator('.pdf-page[data-render-state="error"]').count(),0);
    pass('Repeated far jumps through the real book preserve the bounded canvas pool and render without errors');
    await settings({pdfMode:'paged',pdfFit:'page',pdfScrollSpeed:2});await expect(page.locator('#reader-scroll')).toHaveAttribute('data-pdf-mode','paged');await ready(531);
    await expect(page.locator('#pdf-speed-value')).toHaveText('2×');
    pass('A separate CLI process switches PDF mode, fitting and speed live in the renderer');
    await page.reload();await page.waitForSelector('body[data-ready="true"]');await ready(531);
    await expect(page.locator('#reader-scroll')).toHaveAttribute('data-pdf-mode','paged');await expect(page.locator('#pdf-speed-value')).toHaveText('2×');
    pass('Reader reload restores PDF mode, speed, fit and page from the shared Core');
    await page.setViewportSize({width:780,height:768});await page.waitForTimeout(650);await ready(531);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.evaluate(()=>{const b=document.querySelector('#pdf-progress').getBoundingClientRect();return b.bottom<=innerHeight;}),true);
    pass('Controls and the bottom progress bar remain usable at 780px width');
    await page.click('#pdf-continuous');await ready(531);await go(1061);
    await page.locator('#pdf-document-progress').press('End');await ready(1061);await expect.poll(number).toBe(1061);
    await expect.poll(async()=>(await api('reader.position.get',{id:doc.id})).locator.page).toBe(1061);
    pass('At narrow sizes a short final page remains reachable and its persisted page number is correct');
    assert.equal(await sha(source),originalHash);assert.deepEqual(errors,[]);
    if(native)assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
    pass('Original book unchanged; no uncaught renderer errors or model calls');report.status='passed';
  }catch(error){report.status='failed';if(page&&!page.isClosed())report.gestureTrace=await page.evaluate(()=>window.gestureTrace).catch(()=>null);report.error={message:error.message,stack:error.stack};if(page&&!page.isClosed())await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});throw error;}
  finally{report.finishedAt=new Date().toISOString();report.browserErrors=errors;await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(report,null,2));console.log('PDF MODES REPORT '+path.join(artifacts,'result.json'));await browser?.close();await app?.close();await server?.close();await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
