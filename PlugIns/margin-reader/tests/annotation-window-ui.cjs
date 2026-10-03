'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PDFDocument,StandardFonts}=require('pdf-lib'),{create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('annotation-window-ui');let failure;
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<120;i++){const p=pdf.addPage([600,800]);p.drawText('A real selectable page '+(i+1),{x:60,y:690,size:20,font});}
  await fs.writeFile(path.join(f.workspace,'many-pages.pdf'),await pdf.save());
  const doc=await f.api('document.open',{path:'many-pages.pdf',activate:false});let set=await f.api('study.create',{mapMode:'cards',title:'Virtual PDF annotations'});
  set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['many-pages.pdf']});
  const captured=await f.api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),title:'Page 1',text:'',color:'yellow',locator:{page:1},selection:{rects:[{page:1,x:.09,y:.09,width:.7,height:.1}]}});
  const file=path.join(f.workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file)),raw=state.studySets[set.id],image=await fs.readFile(path.join(f.workspace,'.margin-reader/study-assets',set.id,captured.card.id+'.png'));
  raw.cards=Array.from({length:120},(_,i)=>{const c=structuredClone(captured.card);c.id=i?randomUUID():captured.card.id;c.title='Page '+(i+1);delete c.captureId;delete c.fingerprint;c.source.locator={page:i+1};c.source.selection.rects[0].page=i+1;return c;});
  for(const c of raw.cards.slice(1))await fs.writeFile(path.join(f.workspace,'.margin-reader/study-assets',set.id,c.id+'.png'),image);
  raw.history={undo:[],redo:[]};state.settings.activeStudySet=set.id;state.settings.lastDocument=doc.id;
  await fs.writeFile(file,JSON.stringify(state));await f.page.goto(f.server.url);await f.page.waitForSelector('body[data-ready=true]');
  const first=f.page.locator('.pdf-page[data-page="1"] .study-mark').first();await expect(first).toBeVisible();
  await expect.poll(()=>f.page.locator('.study-highlight-layer').count()).toBeLessThanOrEqual(7);
  // Wait for the initial resize-driven layout to settle before measuring an
  // unrelated refresh. A real layout/theme change may legitimately rebuild pages.
  await f.page.waitForFunction(()=>{const el=document.querySelector('.pdf-page[data-page="1"] .study-mark');if(!el)return false;const r=el.getBoundingClientRect(),key=[r.x,r.y,r.width,r.height].join(',');if(window.stableMark!==el||window.stableMarkBox!==key){window.stableMark=el;window.stableMarkBox=key;window.stableMarkSince=performance.now();return false;}return performance.now()-window.stableMarkSince>500;});
  await first.evaluate(el=>window.initialAnnotation=el);
  for(let i=0;i<3;i++)await f.api('settings.set',{pdfScrollSpeed:1+i*.1});
  await f.page.waitForTimeout(600);
  assert(await first.evaluate(el=>el===window.initialAnnotation&&window.initialAnnotation.isConnected));
  f.pass('120 annotated pages keep overlays only on rendered PDF pages; unrelated refreshes preserve annotation DOM identity');
  await f.api('reader.position.set',{id:doc.id,locator:{page:120}});
  const last=f.page.locator('.pdf-page[data-page="120"] .study-mark').first();await expect(last).toBeInViewport();await expect.poll(()=>f.page.locator('.study-highlight-layer').count()).toBeLessThanOrEqual(7);
  const box=await last.boundingBox();await f.page.mouse.click(box.x+box.width/2,box.y+box.height/2);await expect(f.page.locator('#study-annotation-menu')).toBeVisible();await f.page.locator('[data-action=hide]').click();await expect(last).toHaveCount(0);
  const fresh=await f.api('study.get',{setId:set.id});assert.equal(fresh.cards.length,120);assert.equal(fresh.cards.at(-1).annotation.visible,false);
  await f.page.locator('#study-undo').click();await expect(last).toBeInViewport();
  f.pass('The last-page mark remains clickable and cancellable; undo restores it without deleting any of the 120 cards');
  await f.page.screenshot({path:path.join(f.output,'annotation-window.png')});
  await f.page.locator('#home').click();
  await f.api('fs.write',{path:'deep-search.html',content:'<h1>Precise search</h1><p>İstanbul 🙂<br>'+Array.from({length:65},(_,i)=>'Line '+i+' not the answer.<br>').join('')+'<span id="target-word">NEEDLE_中文</span><br>'+('After answer.<br>'.repeat(20))+'</p>'});
  await expect(f.page.locator('.file-card[data-path="deep-search.html"]')).toBeVisible();await f.page.locator('.file-card[data-path="deep-search.html"] .file-open').click();await expect(f.page.locator('.flow-document')).toBeVisible();
  await f.page.locator('#search-document').click();await f.page.locator('#search-query').fill('needle_中文');await f.page.locator('#search-query').press('Enter');await expect(f.page.locator('.search-hit')).toHaveCount(1);await f.page.locator('.search-hit').click();
  await expect(f.page.locator('.flow-document').locator('#target-word')).toBeInViewport();
  f.pass('A search inside one long paragraph jumps to the actual result, preserving offsets after a Unicode case-fold expansion');
  assert.deepEqual(f.report.browserErrors,[]);
 }catch(error){failure=error;}finally{await f.finish(failure);}
})().catch(error=>{console.error(error);process.exitCode=1;});
