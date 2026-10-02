'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {create,expect}=require('./ui-session.cjs'),{pdfFixture}=require('./fixtures.cjs');
(async()=>{
 const f=await create('document-textbox');let failure;
 try{
  const {page,api}=f,output=await fs.readFile(path.join(__dirname,'../artifacts/interaction-current.txt'),'utf8').then(s=>s.trim(),()=>f.output);
  await fs.writeFile(path.join(f.workspace,'source.pdf'),pdfFixture());
  const doc=await api('document.open',{path:'source.pdf',activate:false});let set=await api('study.create',{title:'原文直接笔记'});
  set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['source.pdf']});
  const get=()=>api('study.get',{setId:set.id});
  const captured=await api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),title:'Existing excerpt',text:'',color:'yellow',locator:{page:1},selection:{rects:[{page:1,x:.08,y:.06,width:.72,height:.05}]}});
  await api('study.open',{setId:set.id,documentId:doc.id});await api('settings.set',{pdfFit:'page'});
  await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  const paper=page.locator('.pdf-page[data-page="1"][data-render-state=ready]');
  const stable=async()=>{
   let last='',since=0;
   await expect.poll(async()=>{const v=await paper.evaluate(el=>JSON.stringify({rect:el.getBoundingClientRect().toJSON(),busy:document.getElementById('reader-scroll').getAttribute('aria-busy')}));if(v!==last){last=v;since=Date.now();return false;}return Date.now()-since>180&&JSON.parse(v).busy==='false';}).toBe(true);
  };
  await stable();
  assert((await page.locator('.reader-toolbar').boundingBox()).height<=44);
  await page.locator('#outline-batch-tools').focus();
  await expect.poll(()=>page.locator('#outline-batch-tools').evaluate(el=>{const r=el.getBoundingClientRect(),v=el.closest('.reader-tools').getBoundingClientRect();return r.left>=v.left-1&&r.right<=v.right+1;})).toBe(true);
  for(const id of ['font-smaller','font-larger','search-document','reopen-document','export-document'])assert.equal(await page.locator('#'+id).count(),1);
  f.pass('The compact reading toolbar remains at most 44px high and keyboard focus exposes the complete secondary controls');
  await stable();await page.click('#document-textbox');await expect(page.locator('#document-textbox')).toHaveAttribute('aria-pressed','true');
  let box=await paper.boundingBox();await page.mouse.click(box.x+box.width*.23,box.y+box.height*.32);await expect(page.locator('#dialog')).toBeVisible();
  assert(Math.abs(Number(await page.inputValue('[name=x]'))-23)<.6);assert(Math.abs(Number(await page.inputValue('[name=at]'))-32)<.6);await expect(page.locator('[name=display]')).toHaveValue('overlay');
  await page.fill('[name=title]','点击位置上的笔记');await page.fill('[name=text]','**理解** 与 $x^2$');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  await expect.poll(async()=>(await get()).cards.length).toBe(2);set=await get();const placed=set.cards.find(c=>c.title==='点击位置上的笔记');assert(placed.anchor.rect.x>.22&&placed.anchor.rect.x<.24);assert(placed.anchor.rect.y>.31&&placed.anchor.rect.y<.33);
  await expect(page.locator(`[data-note-card="${placed.id}"] .katex`)).toBeVisible();
  f.pass('Click-to-place text boxes store the actual original-page coordinates and render Markdown and math after confirmation');
  await page.click('#document-textbox');await page.keyboard.press('Escape');await expect(page.locator('#document-textbox')).toHaveAttribute('aria-pressed','false');
  await stable();box=await paper.boundingBox();await page.mouse.click(box.x+box.width*.62,box.y+box.height*.65,{button:'right'});
  await expect(page.locator('.document-textbox-menu')).toBeVisible();await page.locator('.document-textbox-menu button').click();await expect(page.locator('#dialog')).toBeVisible();await page.click('#dialog-cancel');assert.equal((await get()).cards.length,2);
  f.pass('Blank-page context menus seed a text box at the pointer; Escape or cancelling creates no card');
  // A folded display coordinate must map back to the original source interval.
  const currentDoc=await api('document.get',{id:doc.id});await api('document.region.set',{id:doc.id,expectedRevision:currentDoc.revision,page:1,start:.15,end:.25});
  await expect(paper.locator('.pdf-fold-bar')).toBeVisible();await stable();
  const point=await paper.evaluate(el=>{const layout=el.pageSlices,b=layout.blocks.find(b=>b.type==='source'&&b.start<=.55&&b.end>.55),r=el.getBoundingClientRect();return{x:r.left+r.width*.4,y:r.top+b.top+(.55-b.start)*layout.sourceHeight};});
  await page.click('#document-textbox');await page.mouse.click(point.x,point.y);await expect(page.locator('#dialog')).toBeVisible();assert(Math.abs(Number(await page.inputValue('[name=at]'))-55)<.7);
  await page.fill('[name=title]','折叠后准确定位');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect.poll(async()=>(await get()).cards.length).toBe(3);
  f.pass('Placement below a folded range persists original coordinates rather than compressed display coordinates');
  await stable();
  await paper.evaluate(el=>{
   const r=el.getBoundingClientRect(),data=new DataTransfer();data.setData('text/plain','拖入的原始文字\n保留 Unicode 🙂 和换行');
   el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientX:r.left+r.width*.1,clientY:r.top+r.height*.76,dataTransfer:data}));
  });
  await expect(page.locator('#dialog')).toBeVisible();await expect(page.locator('[name=text]')).toHaveValue('拖入的原始文字\n保留 Unicode 🙂 和换行');
  await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect.poll(async()=>(await get()).cards.length).toBe(4);
  f.pass('Browser plain-text drops preserve the full text in a confirmation draft and save through the same note-placement API');
  await stable();const mark=paper.locator(`.study-mark[data-card-id="${captured.card.id}"]`).first();await expect(mark).toBeVisible();const mb=await mark.boundingBox();
  await page.mouse.click(mb.x+mb.width*.5,mb.y+mb.height*.5,{button:'right'});await expect(page.locator('#study-annotation-menu')).toBeVisible();await expect(page.locator('.document-textbox-menu')).toHaveCount(0);
  await page.keyboard.press('Escape');await page.screenshot({path:path.join(output,'direct-textboxes.png'),animations:'disabled'});
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),pdfFixture());
  await page.reload();await page.locator('body[data-ready=true]').waitFor();await expect(page.locator(`[data-note-card="${placed.id}"]`)).toBeVisible();assert.equal((await get()).cards.length,4);
  f.pass('Annotation context menus retain their cancellation workflow, text boxes reopen correctly and original PDF bytes remain unchanged');
 }catch(error){failure=error;}
 await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
