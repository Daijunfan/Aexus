"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PDFDocument,StandardFonts}=require('pdf-lib'),{create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('fragment-navigation-ui'),{page,api,pass}=f;let error;
 try{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([500,2500]);sheet.drawText('First excerpt',{x:50,y:2240,size:20,font});sheet.drawText('Second excerpt exact target',{x:50,y:350,size:20,font});await fs.writeFile(path.join(f.workspace,'tall.pdf'),await pdf.save());
  let s=await api('study.create',{title:'Multi-fragment source'});s=await api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['tall.pdf']});const doc=await api('document.open',{path:'tall.pdf',activate:false});
  const params=y=>({documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'',locator:{page:1,pageOffset:y},selection:{rects:[{page:1,x:.1,y,width:.7,height:.035}]}});
  const capture=await api('study.card.create',{setId:s.id,expectedRevision:s.revision,title:'Two source regions',color:'yellow',...params(.09)});
  s=await api('study.get',{setId:s.id});const appended=await api('study.excerpt.append',{setId:s.id,expectedRevision:s.revision,cardId:capture.card.id,...params(.85)});
  await api('study.open',{setId:s.id,documentId:doc.id});await page.goto(f.server.url);await page.waitForSelector('body[data-ready=true]');
  const card=page.locator(`.study-card[data-card-id="${capture.card.id}"]`);await card.locator('.study-card-more').click();await page.locator('.study-card-menu [data-action=parts]').click();
  await page.locator(`.excerpt-part[data-part="${appended.partId}"] [data-part-action=source]`).click();
  const target=page.locator(`.study-mark[data-part-id="${appended.partId}"]`);await expect(target).toBeInViewport();
  const first=page.locator(`.study-mark[data-part-id="${capture.card.id}"]`);await expect(first).not.toBeInViewport();
  const before=await page.locator('#reader-scroll').evaluate(e=>e.scrollTop);assert(before>1000);
  await page.waitForTimeout(600);assert(await page.locator('#reader-scroll').evaluate(e=>e.scrollTop)>1000,'event refresh must not snap back to the first fragment');
  await page.screenshot({path:path.join(f.output,'exact-second-fragment.png')});
  pass('Clicking the second same-page fragment stays at that exact original rectangle instead of snapping back to the first');
 }catch(e){error=e;}finally{await f.finish(error);}
})().catch(e=>{console.error(e);process.exitCode=1;});
