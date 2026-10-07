'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs'),{pdfFixture}=require('./fixtures.cjs');
(async()=>{
 const f=await create('resize-handwriting');let failure;
 try{
  await fs.writeFile(path.join(f.workspace,'source.pdf'),pdfFixture());
  const doc=await f.api('document.open',{path:'source.pdf',activate:false});let set=await f.api('study.create',{mapMode:'cards',title:'Resize during handwriting'});
  const refresh=async()=>set=await f.api('study.get',{setId:set.id}),change=async(method,params={})=>{await refresh();return set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...params});};
  await change('study.documents.add',{paths:['source.pdf']});await change('study.ink.settings',{shape:'free',straighten:'off',perfectShape:false,vanish:false});await f.api('study.open',{setId:set.id,documentId:doc.id});
  await f.page.goto(f.server.url);await f.page.waitForSelector('body[data-ready=true]');await f.page.click('#study-pen');
  const paper=f.page.locator('.pdf-page[data-page="1"][data-render-state=ready]');
  const stable=()=>f.page.waitForFunction(()=>{const el=document.querySelector('.pdf-page[data-page="1"][data-render-state=ready]');if(!el||document.getElementById('reader-scroll').getAttribute('aria-busy')==='true')return false;const r=el.getBoundingClientRect(),key=[r.x,r.y,r.width,r.height].join(',');if(window.resizePaper!==el||window.resizePaperBox!==key){window.resizePaper=el;window.resizePaperBox=key;window.resizePaperAt=performance.now();return false;}return performance.now()-window.resizePaperAt>300;});
  await stable();
  const start=async()=>{const b=await paper.boundingBox();await paper.evaluate(el=>window.heldPage=el);await f.page.mouse.move(b.x+b.width*.15,b.y+b.height*.22);await f.page.mouse.down();await f.page.mouse.move(b.x+b.width*.55,b.y+b.height*.29,{steps:6});return b;};
  await start();await f.page.setViewportSize({width:1320,height:920});await f.page.waitForTimeout(300);assert(await paper.evaluate(el=>el===window.heldPage),'A held stroke must keep its page instance');
  await f.page.mouse.up();await expect.poll(async()=>(await refresh()).ink.length).toBe(1);await expect(f.page.locator('#study-ink-status')).toHaveText('已保存');await stable();
  assert.equal(set.ink[0].recognizedShape,'free');assert(set.ink[0].points.every(p=>p.slice(0,2).every(v=>v>=0&&v<=1)));
  f.pass('Resizing while holding a PDF pen keeps the page and draft stable; release saves one valid stroke before reflow');
  await start();await change('study.update',{description:'Concurrent CLI edit'});await f.page.mouse.up();await expect(f.page.locator('#study-ink-retry')).toBeVisible();await refresh();assert.equal(set.ink.length,1);
  await f.page.setViewportSize({width:1450,height:980});await f.page.waitForTimeout(300);assert(await paper.evaluate(el=>el===window.heldPage),'A conflicted unsaved draft must keep its source page');
  await f.page.click('#study-ink-discard');await expect(f.page.locator('#study-ink-retry')).toBeHidden();await stable();assert(!(await paper.evaluate(el=>el===window.heldPage)),'Discard must resume the pending page reflow');assert.equal((await refresh()).ink.length,1);assert.equal(set.description,'Concurrent CLI edit');
  f.pass('A concurrent edit retains the failed stroke and suppresses resize; explicit discard resumes layout without overwriting the CLI edit');
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),pdfFixture());assert.deepEqual(f.report.browserErrors,[]);
 }catch(error){failure=error;}finally{await f.page.mouse.up().catch(()=>{});await f.finish(failure);}
})().catch(error=>{console.error(error);process.exitCode=1;});
