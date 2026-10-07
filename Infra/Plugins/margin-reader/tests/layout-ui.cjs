'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {chromium,expect}=require('../../../node_modules/@playwright/test');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const root=path.resolve(__dirname,'..');
async function main(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'mr-layout-ui-')),workspace=path.join(temp,'library');await fs.mkdir(workspace);
 const out=path.join(root,'artifacts/strict-local-20260929');await fs.mkdir(out,{recursive:true});
 const fixture=await PDFDocument.create(),font=await fixture.embedFont(StandardFonts.Helvetica);
 for(let j=0;j<2;j++){const page=fixture.addPage([600,1000]);for(let i=0;i<36;i++)page.drawText(`PAGE${j+1} LINE${String(i+1).padStart(2,'0')} selectable original source sample ${i}`,{x:55,y:950-i*25,size:14,font});}
 const bytes=Buffer.from(await fixture.save()),hash=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(path.join(workspace,'source.pdf'),bytes);
 const server=await require('../dist-plugin/lib/server.cjs').startServer({workspace});let browser;
 const report={passed:false,checks:[],errors:[],platform:process.platform};const pass=x=>{report.checks.push(x);console.log('PASS '+x);};
 const api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
 let doc=await api('document.open',{path:'source.pdf',activate:false}),set=await api('study.create',{mapMode:'cards',title:'Strict page geometry'});
 const current=async()=>set=await api('study.get',{setId:set.id});const change=async(m,p={})=>{await current();return set=await api(m,{setId:set.id,expectedRevision:set.revision,...p});};
 const fold=async(m,p={})=>{doc=await api('document.get',{id:doc.id});return doc=await api(m,{id:doc.id,expectedRevision:doc.revision,...p});};
 try{
  await change('study.documents.add',{paths:['source.pdf']});
  await change('study.note.place',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,title:'Inserted note',text:'**Inline note 中文** $x^2$',locator:{page:1,pageOffset:.5},display:'embedded',height:120});const noteId=set.lastPlacedNote;
  const capture=await api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),title:'Exact source',text:'',color:'yellow',locator:{page:1},selection:{rects:[{page:1,x:.08,y:.65,width:.8,height:.025}]}});await current();
  await change('study.ink.add',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:1,points:[[.1,.65],[.8,.65]],color:'blue',width:.004});
  await fold('document.region.set',{page:1,start:.2,end:.4});
  await api('study.open',{setId:set.id,documentId:doc.id});await api('settings.set',{pdfFit:'page',pdfZoom:1});
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/Users/djf/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
  const page=await browser.newPage({viewport:{width:1550,height:1100}});page.on('pageerror',e=>report.errors.push(e.message));await page.goto(server.url);await page.waitForSelector('body[data-ready=true]');await page.waitForSelector('.pdf-page[data-page="1"][data-render-state=ready]');
  const paper=page.locator('.pdf-page[data-page="1"]');await expect(paper.locator('.pdf-fold-bar')).toBeVisible();await expect(paper.locator('[data-note-card] .katex')).toBeVisible();
  await expect(paper.locator('.textLayer span').filter({hasText:'LINE09'})).toHaveCount(0);await expect(paper.locator('.textLayer span').filter({hasText:'LINE25'})).toBeVisible();
  await expect(paper.locator('.study-mark')).toBeVisible();
  // Backend readiness does not imply that the debounced fit-to-page reflow
  // has committed. Measure geometry and capture pointer coordinates only after the PDF and annotations settle.
  let signature='',stableSince=0;
  await expect.poll(async()=>{const sample=await paper.evaluate(el=>JSON.stringify({rect:el.getBoundingClientRect().toJSON(),mark:el.querySelector('.study-mark')?.getBoundingClientRect().toJSON(),busy:document.getElementById('reader-scroll').getAttribute('aria-busy'),ready:el.dataset.renderState}));if(sample!==signature){signature=sample;stableSince=Date.now();return false;}return Date.now()-stableSince>=180&&JSON.parse(sample).busy==='false'&&JSON.parse(sample).ready==='ready';}).toBe(true);
  let geometry=await paper.evaluate(el=>({w:el.clientWidth,h:el.clientHeight,source:el.pageSlices.sourceHeight,note:el.pageSlices.blocks.find(b=>b.type==='note'),mark:el.querySelector('.study-mark')?.getBoundingClientRect().top,top:el.getBoundingClientRect().top}));
  report.geometry={w:geometry.w,h:geometry.h,source:geometry.source,noteStart:geometry.note.start,mark:geometry.mark,top:geometry.top};
  assert(Math.abs(geometry.h-(geometry.source*.8+30+120*geometry.w/600))<2);assert(Math.abs(geometry.note.start-.5)<1e-8);
  assert(Math.abs(geometry.mark-geometry.top-(geometry.source*.45+30+120*geometry.w/600))<2);
  pass('Partial folding shrinks the actual PDF while inline notes insert at source positions; text and highlights remain aligned');
  const raw=await paper.locator('.textLayer span').filter({hasText:'LINE27'}).first().boundingBox();assert(raw);report.hit=await page.evaluate(r=>({element:document.elementFromPoint(r.x+2,r.y+r.height/2)?.outerHTML.slice(0,300)}),raw);await page.mouse.move(raw.x+2,raw.y+raw.height/2);await page.mouse.down();await page.mouse.move(raw.x+200,raw.y+raw.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('#study-palette')).toBeVisible();await page.locator('#study-palette [data-color=green]').click();await expect.poll(async()=>(await current()).cards.length).toBe(3);
  const newest=(await current()).cards.find(c=>c.id!==noteId&&c.id!==capture.card.id);assert(newest.source.selection.rects[0].y>.65&&newest.source.selection.rects[0].y<.72,JSON.stringify({text:newest.text,selection:newest.source.selection,raw,geometry,hit:report.hit}));
  pass('Mouse text selection after a folded range stores the unchanged original PDF coordinates');
  await paper.locator('.pdf-fold-bar button').click();await expect(paper.locator('.pdf-fold-bar')).toHaveCount(0);await expect(paper.locator('.textLayer span').filter({hasText:'LINE09'})).toBeVisible();
  await fold('document.region.set',{page:1,start:.6,end:.75});await expect(paper.locator('.pdf-fold-bar')).toBeVisible();
  await page.locator(`.study-card[data-card-id="${capture.card.id}"] strong`).click();await expect(paper.locator('.pdf-fold-bar')).toHaveCount(0);await expect(paper.locator(`.study-mark[data-card-id="${capture.card.id}"]`).first()).toBeInViewport();
  pass('External API fold changes refresh immediately; single-click source navigation unfolds only the target region');
  const note=paper.locator(`[data-note-card="${noteId}"]`);await note.scrollIntoViewIfNeeded();const before=(await current()).cards.find(c=>c.id===noteId).anchor.height;
  const resize=await note.locator('.pdf-note-resize').boundingBox();await page.mouse.move(resize.x+4,resize.y+4);await page.mouse.down();await page.mouse.move(resize.x+4,resize.y+48,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await current()).cards.find(c=>c.id===noteId).anchor.height).toBeGreaterThan(before+20);
  await expect(note).toBeVisible();await note.locator('[data-note-edit]').click();await page.selectOption('#dialog [name=display]','overlay');await page.fill('#dialog [name=at]','40');await page.fill('#dialog [name=boxHeight]','20');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect(paper.locator('.extend-note-overlay')).toBeVisible();
  pass('Dragging a note resize handle persists its height; the same note can become an on-page text box without duplication');
  await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(paper.locator('.extend-note-overlay')).toBeVisible();
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(workspace,'source.pdf'))).digest('hex'),hash);assert.deepEqual(report.errors,[]);
  await page.screenshot({path:path.join(out,'page-layout.png')});pass('Reopening preserves positioned notes and original PDF bytes; no browser exceptions');report.passed=true;
 }catch(e){report.error=e.stack;if(browser){const page=browser.contexts()[0]?.pages()[0];await page?.screenshot({path:path.join(out,'page-layout-failure.png')}).catch(()=>{});}throw e;}
 finally{await fs.writeFile(path.join(out,'page-layout-ui.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
