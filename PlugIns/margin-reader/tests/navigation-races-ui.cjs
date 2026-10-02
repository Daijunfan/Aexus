'use strict';
const assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('navigation-races-ui');let failure,release;
 try{
  const {page,api}=f;
  await api('fs.write',{path:'reading.html',content:'<h1>Navigation safety</h1>'+Array.from({length:30},(_,i)=>'<p>Paragraph '+i+' with enough text for stable reading geometry.</p>').join('')});
  let set=await api('study.create',{title:'Navigation races'});set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['reading.html']});const docId=set.documentIds[0];
  await api('study.open',{setId:set.id,documentId:docId});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  let mode=null,held=false,finished=false;
  await page.route('**/rpc',async route=>{
   const req=route.request().postDataJSON();
   if(mode&&req?.method===mode&&!held){held=true;const response=await route.fetch();await new Promise(resolve=>{release=resolve;});await route.fulfill({response});finished=true;}
   else await route.continue();
  });
  const runRace=async method=>{
   held=false;finished=false;mode=method;
   if(method==='document.content')await api('settings.set',{fontSize:22});
   else{set=await api('study.get',{setId:set.id});await api('study.update',{setId:set.id,expectedRevision:set.revision,description:'Trigger a background refresh'});}
   await expect.poll(()=>held&&!!release).toBe(true);
   await page.locator('#study-back-set').click();await expect(page.locator('#study-home')).toBeVisible();
   mode=null;release();release=null;await expect.poll(()=>finished).toBe(true);
   await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
   await page.waitForTimeout(500);
   await expect(page.locator('#study-home')).toBeVisible();await expect(page.locator('#reader-view')).toBeHidden();assert.equal((await api('settings.get')).lastDocument,null);
  };
  await runRace('document.content');f.pass('A delayed old document render cannot hide the study homepage after the user leaves reading');
  await page.locator('.study-document-open').click();await expect(page.locator('#study-back-set')).toBeVisible();await expect(page.locator('.flow-document article')).toBeVisible();await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
  await runRace('settings.get');f.pass('A pre-navigation settings response cannot reopen an old document or overwrite the newer navigation');
  await page.locator('.study-document-open').click();await expect(page.locator('#study-back-set')).toBeVisible();await expect(page.locator('.flow-document article')).toBeVisible();await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
  const text=await page.locator('.flow-document article').textContent(),quote='Paragraph 0 with enough text for stable reading geometry.',start=text.indexOf(quote);
  set=await api('study.get',{setId:set.id});const doc=await api('document.get',{id:docId});
  const captured=await api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:docId,expectedSourceVersion:doc.sourceVersion,captureId:require('node:crypto').randomUUID(),text:quote,color:'yellow',locator:{section:0},selection:{start,end:start+quote.length}});
  const mark=page.locator('.flow-document .study-mark').first();await expect(mark).toBeVisible();await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
  const box=await mark.boundingBox();assert(box);await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await expect(page.locator('#study-annotation-menu [data-action=hide]')).toBeVisible();
  await page.locator('#reader-scroll').evaluate(el=>{el.scrollTop+=30;el.dispatchEvent(new Event('scroll'));});
  await expect(page.locator('#study-annotation-menu [data-action=hide]')).toBeVisible();await page.locator('#study-annotation-menu [data-action=hide]').click();
  await expect.poll(async()=>(await api('study.get',{setId:set.id})).cards.find(c=>c.id===captured.card.id).annotation.visible).toBe(false);
  f.pass('Programmatic scroll cannot dismiss the annotation menu before cancellation; the card remains recoverable');
  await page.click('#study-back-set');await expect(page.locator('#study-home')).toBeVisible();
  for(const method of ['study.card.activate','document.get']){
    held=false;finished=false;mode=method;release=null;
    await page.locator(`.study-card[data-card-id="${captured.card.id}"] header strong`).click();await expect.poll(()=>held&&!!release).toBe(true);
    await page.click('#home');await expect(page.locator('#library-view')).toBeVisible();await expect.poll(async()=>(await api('settings.get')).activeStudySet).toBe(null);
    await page.evaluate(()=>{window.raceReaderReopened=false;window.raceNavigationObserver?.disconnect();window.raceNavigationObserver=new MutationObserver(()=>{if(!document.getElementById('reader-view').hidden)window.raceReaderReopened=true;});window.raceNavigationObserver.observe(document.getElementById('reader-view'),{attributes:true,attributeFilter:['hidden']});});
    mode=null;release();release=null;await expect.poll(()=>finished).toBe(true);await page.waitForTimeout(600);
    await expect(page.locator('#library-view')).toBeVisible();await expect(page.locator('#reader-view')).toBeHidden();assert.equal(await page.evaluate(()=>window.raceReaderReopened),false);
    const current=await api('settings.get');assert.equal(current.lastDocument,null);assert.equal(current.activeStudySet,null);
    await page.evaluate(()=>window.raceNavigationObserver.disconnect());await page.locator(`.study-set-row[data-set-id="${set.id}"]`).click();await expect(page.locator('#study-home')).toBeVisible();
  }
  f.pass('Late card activation and source lookup cannot reopen a document after explicit navigation to the library, even for one frame');
 }catch(error){failure=error;}finally{release?.();}await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
