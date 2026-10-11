"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs'),{pdfFixture}=require('./fixtures.cjs');
(async()=>{
 const f=await create('reading-appearance-ui'),{page,api,pass}=f;let error;
 try{
  await fs.writeFile(path.join(f.workspace,'source.pdf'),pdfFixture());let set=await api('study.create',{mapMode:'cards',title:'Appearance'});set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['source.pdf']});
  const doc=await api('document.open',{path:'source.pdf',activate:false});for(const title of ['lowercase title','Linked target'])set=await api('study.note.create',{setId:set.id,expectedRevision:set.revision,title,text:'Visible card body'});
  const [a,b]=set.cards.map(c=>c.id);set=await api('study.link.add',{setId:set.id,expectedRevision:set.revision,from:a,to:b});await api('study.open',{setId:set.id,documentId:doc.id});
  await page.goto(f.server.url);await page.waitForSelector('body[data-ready=true]');
  const panel=()=>page.locator('#study-pane').boundingBox(),main=()=>page.locator('#reader-view').boundingBox();
  await page.click('#reader-appearance-open');await page.selectOption('[name=studyLayout]','rows');await page.selectOption('[name=studyOrder]','map-first');await page.selectOption('[name=readingMode]','immersive');await page.fill('[name=brightness]','.7');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  await expect(page.locator('.explorer')).toBeHidden();await expect.poll(async()=>(await panel()).y<(await main()).y).toBe(true);await expect(page.locator('#outline-divider')).toHaveAttribute('aria-orientation','horizontal');
  const old=(await api('settings.get')).studyRatio;await page.locator('#outline-divider').focus();await page.keyboard.press('ArrowDown');await expect.poll(async()=>(await api('settings.get')).studyRatio).toBeLessThan(old);
  await page.screenshot({path:path.join(f.output,'stacked-reversed.png')});
  pass('Stacked immersive mode puts the mind map above the document and the divider adjusts the correct reversed axis');
  for(const layout of ['document','map','columns']){
   await page.click('#reader-appearance-open');await page.selectOption('[name=studyLayout]',layout);await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
   if(layout==='document'){await expect(page.locator('#study-pane')).toBeHidden();await expect(page.locator('#reader-view')).toBeVisible();}
   else if(layout==='map'){await expect(page.locator('#reader-view')).toBeHidden();await expect(page.locator('#study-pane')).toBeVisible();}
   else await expect.poll(async()=>(await panel()).x<(await main()).x).toBe(true);
  }
  await page.keyboard.press('Escape');await expect.poll(async()=>(await api('settings.get')).readingMode).toBe('normal');await expect(page.locator('.explorer')).toBeVisible();
  pass('Single-pane modes are recoverable from the always-available toolbar; Escape leaves immersive mode');
  await page.click('#reader-appearance-open');await page.selectOption('[name=studyOrder]','document-first');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  await page.click('#study-appearance');await page.selectOption('[name=titleOnly]','yes');await page.selectOption('[name=uppercase]','yes');await page.selectOption('[name=showLinks]','yes');await page.selectOption('[name=compact]','yes');await page.fill('[name=fontScale]','1.2');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  set=await api('study.get',{setId:set.id});assert(set.appearance.titleOnly&&set.appearance.compact&&set.appearance.showLinks);
  const card=page.locator(`.study-card[data-card-id="${a}"]`);await expect(card).toHaveAttribute('data-title-only','true');await expect(card.locator('.study-card-text')).toBeHidden();await expect(card.locator('.card-visible-links')).toHaveText('↔ 1');
  const geometry=await api('study.map.geometry',{setId:set.id}),box=geometry.positions.find(p=>p.cardId===a);assert(box.width<=190&&box.height<180);
  assert.equal(await card.locator('header strong').evaluate(e=>getComputedStyle(e).textTransform),'uppercase');
  await page.reload();await page.waitForSelector('body[data-ready=true]');await expect(card).toHaveAttribute('data-title-only','true');assert.equal((await api('settings.get')).brightness,.7);
  await page.setViewportSize({width:820,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  pass('Compact title-only cards use the same Core geometry after restart, retain source content and expose visible links');
 }catch(e){error=e;}finally{await f.finish(error);}
})().catch(e=>{console.error(e);process.exitCode=1;});
