'use strict';
// Exercise the package selected for this test, never the user's live workspace.
// MR_NAV_PLUGIN_ROOT permits reproducing deployment mismatches without installing.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {chromium,expect}=require('../../../node_modules/@playwright/test');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const root=path.resolve(__dirname,'..'),pluginRoot=path.resolve(process.env.MR_NAV_PLUGIN_ROOT||path.join(root,'dist-plugin'));
const digest=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=12;i++){const p=pdf.addPage([612,1000]);for(const y of [.12,.46,.78])p.drawText(`PAGE ${i} - SOURCE ${y}`,{x:64,y:1000*(1-y)-20,size:18,font});}
 return Buffer.from(await pdf.save());
}
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-card-source-click-')),workspace=path.join(temp,'library');await fs.mkdir(workspace);
 const label=process.env.MR_NAV_LABEL||'candidate';assert(/^[a-z0-9-]+$/.test(label));
 const marker=path.join(root,'artifacts/card-source-current.txt');
 const output=await fs.readFile(marker,'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts/card-source-click'));
 assert(path.resolve(output).startsWith(path.join(root,'artifacts')+path.sep));await fs.mkdir(output,{recursive:true});
 const report={passed:false,package:pluginRoot,checks:[],browserErrors:[],mutatedRealWorkspace:false,modelCalls:0,measurements:[]};
 let server,browser,page,failure;
 const pass=text=>{report.checks.push(text);console.log('PASS '+text);};
 try{
  const bytes=await fixture();await fs.writeFile(path.join(workspace,'first.pdf'),bytes);await fs.writeFile(path.join(workspace,'second.pdf'),bytes);
  report.sourceHash=digest(bytes);
  server=await require(path.join(pluginRoot,'lib/server.cjs')).startServer({workspace,pluginRoot});
  const api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
  let set=await api('study.create',{mapMode:'cards',title:'Single-click PDF navigation'});
  const change=async(method,params={})=>{set=await api('study.get',{setId:set.id});set=await api(method,{setId:set.id,expectedRevision:set.revision,...params});return set;};
  await change('study.documents.add',{paths:['first.pdf','second.pdf']});
  const first=await api('document.open',{path:'first.pdf',activate:false}),second=await api('document.open',{path:'second.pdf',activate:false});
  const capture=async(doc,title,number,y)=>{
   set=await api('study.get',{setId:set.id});
   const r=await api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),title,text:'',color:'yellow',locator:{page:number},selection:{rects:[{page:number,x:.1,y,width:.7,height:.055}]}});
   return {id:r.card.id,docId:doc.id,path:doc.path,page:number,y};
  };
  const high=await capture(first,'Same page upper source',3,.1),low=await capture(first,'Same page lower source',3,.76),far=await capture(first,'Distant page source',10,.76),other=await capture(second,'Other PDF source',5,.44);
  await api('settings.set',{pdfMode:'continuous',pdfFit:'width'});await api('study.open',{setId:set.id});
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/Users/djf/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
  page=await browser.newPage({viewport:{width:1520,height:1000}});page.setDefaultTimeout(12000);page.on('pageerror',e=>report.browserErrors.push(e.message));
  const calls=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/rpc')){const body=r.postDataJSON();if(body?.method)calls.push(body.method);}});
  await page.goto(server.url);await page.locator('body[data-ready=true]').waitFor();
  const showTarget=async(target,selector)=>{
   await expect(page.locator('#study-board')).not.toHaveAttribute('aria-busy','true');
   const before=calls.length,start=Date.now(),element=page.locator(selector);
   // Prepare a real visible target; view switches can replace nodes before
   // pointerdown. Retry only locating the target, never the user's actual click.
   let point;
   await expect.poll(async()=>{try{
    await element.scrollIntoViewIfNeeded({timeout:1500});
    point=await element.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    return await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-card-id]')?.dataset.cardId,point)===target.id;
   }catch(error){if(/not attached|Timeout/.test(error.message))return false;throw error;}}).toBe(true);
   // Images delegate pointer events to their parent card. Do not force a DOM
   // click on a pointer-events:none image: send exactly one physical click.
   await page.mouse.click(point.x,point.y);
   await expect(page.locator('#reader-view')).toBeVisible();await expect(page.locator('#document-path')).toHaveText(target.path);
   const mark=page.locator(`.pdf-page[data-page="${target.page}"] .study-mark[data-card-id="${target.id}"]`).first();await expect(mark).toBeAttached();
   const fullyVisible=()=>mark.evaluate(el=>{const a=el.getBoundingClientRect(),v=document.getElementById('reader-scroll').getBoundingClientRect();return a.width>0&&a.height>0&&a.top>=v.top+1&&a.bottom<=v.bottom-1&&a.left>=v.left&&a.right<=v.right;});
   await expect.poll(fullyVisible,{message:'The actual source annotation must be inside the PDF viewport, not merely mounted in the DOM.'}).toBe(true);
   await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
   await page.waitForTimeout(450);assert(await fullyVisible(),'The source jumped out of view after a delayed refresh');
   assert.equal((await api('reader.position.get',{id:target.docId})).locator.page,target.page);
   const navigationCalls=calls.slice(before).filter(m=>m==='study.card.activate');
   assert.equal(navigationCalls.length,1,'A single user click must perform exactly one card activation');
   report.measurements.push({page:target.page,sourceY:target.y,clickToSettledMs:Date.now()-start});
   return page.locator('#reader-scroll').evaluate(el=>el.scrollTop);
  };
  const mapImage=c=>`.study-card[data-card-id="${c.id}"] .study-card-image`,mapTitle=c=>`.study-card[data-card-id="${c.id}"] header strong`;
  await showTarget(far,mapImage(far));pass('A single click on the card image opens a distant PDF page and brings its lower-page annotation fully into view');
  const top=await showTarget(high,mapTitle(high)),bottom=await showTarget(low,mapImage(low));assert(bottom-top>150,'Different excerpts on the same page must move to different original offsets');
  pass('Clicking titles or image bodies on two cards from one page targets their distinct original positions');
  await page.locator('#reader-scroll').evaluate(el=>{el.scrollTop=0;});await page.waitForTimeout(600);await showTarget(low,mapImage(low));
  pass('Clicking an already-selected card returns to its excerpt after the user manually scrolls away');
  await showTarget(other,mapImage(other));await showTarget(far,mapImage(far));pass('Single clicks switch PDF documents and return to the exact stored excerpt');
  for(const view of ['cards','outline']){
   await page.locator(`[data-study-view=${view}]`).click();await expect(page.locator('#study-board')).toHaveAttribute('data-view',view);
   await showTarget(other,`.study-list-card[data-card-id="${other.id}"] ${view==='cards'?'img':'header strong'}`);
   await showTarget(high,`.study-list-card[data-card-id="${high.id}"] header strong`);
   pass(`The ${view} view uses the same single-click source targeting with a visible original annotation`);
  }
  await page.locator('[data-study-view=map]').click();await expect(page.locator('#study-board')).toHaveAttribute('data-view','map');await page.locator('#pdf-paged').click();await expect(page.locator('#pdf-paged')).toHaveAttribute('aria-pressed','true');await showTarget(low,mapImage(low));await showTarget(other,mapTitle(other));
  pass('Paged PDF mode retains exact card-to-source jumps for both same-page and cross-document selections');
  await page.screenshot({path:path.join(output,label+'-card-source.png'),animations:'disabled'});
  for(const name of ['first.pdf','second.pdf'])assert.equal(digest(await fs.readFile(path.join(workspace,name))),report.sourceHash);
  assert.deepEqual(report.browserErrors,[]);report.passed=true;
 }catch(error){failure=error;report.error=error.stack;await page?.screenshot({path:path.join(output,label+'-card-source-failure.png'),animations:'disabled'}).catch(()=>{});}
 finally{
  await fs.writeFile(path.join(output,label+'-card-source.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();await server?.close();await fs.rm(temp,{recursive:true,force:true});
 }
 if(failure)throw failure;
})().catch(error=>{console.error(error);process.exitCode=1;});
