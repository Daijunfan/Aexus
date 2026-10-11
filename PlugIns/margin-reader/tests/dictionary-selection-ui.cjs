'use strict';
const assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('dictionary-selection-ui');let failure,release;
 try{
  const {page,api}=f;
  await api('fs.write',{path:'selection.html',content:'<h1>Reading safely</h1><p>Vocabulary matching must not change an active selection or its source offsets.</p>'});
  let set=await api('study.create',{mapMode:'cards',title:'Dictionary selection timing'});
  set=await api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['selection.html']});
  set=await api('study.note.create',{setId:set.id,expectedRevision:set.revision,title:'Vocabulary',text:'A term definition'});
  const id=set.documentIds[0];await api('study.open',{setId:set.id,documentId:id});
  let intercepted=false,completed=false;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/rpc',async route=>{
   const data=route.request().postDataJSON();
   if(data?.method==='study.dictionary.match'&&!intercepted){intercepted=true;await gate;const response=await route.fetch();await route.fulfill({response});completed=true;}
   else await route.continue();
  });
  await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  await expect.poll(()=>intercepted).toBe(true);await expect(page.locator('#reader-scroll')).toHaveAttribute('aria-busy','false');
  const p=page.locator('.flow-document p').first(),box=await p.boundingBox();assert(box);const y=box.y+10;
  await page.mouse.move(box.x+1,y);await page.mouse.down();await page.mouse.move(box.x+80,y,{steps:6});
  const selected=()=>page.evaluate(()=>{const shadow=document.querySelector('.flow-document').shadowRoot;return (shadow.getSelection?.()||window.getSelection()).toString();});
  const before=await selected();assert(before.length>0);
  release();await expect.poll(()=>completed).toBe(true);
  // Let the queued paint run while the real mouse button is still held.
  await page.waitForTimeout(180);
  await expect(page.locator('.reader-dictionary-layer')).toHaveCount(0);assert.equal(await selected(),before);
  await page.mouse.move(box.x+260,y,{steps:8});await page.mouse.up();const expected=(await selected()).trim();assert(expected.includes('Vocabulary'));
  await expect(page.locator('#study-palette')).toBeVisible();await page.locator('#study-palette [data-color=green]').click();
  await expect.poll(async()=>(await api('study.get',{setId:set.id})).cards.length).toBe(2);
  const fresh=await api('study.get',{setId:set.id}),excerpt=fresh.cards.find(c=>c.source);assert.equal(excerpt.text,expected);assert(excerpt.source.selection.end>excerpt.source.selection.start);
  f.pass('A late dictionary response cannot repaint through a held mouse selection, and saving retains the exact selected text');
  await expect(page.locator('.reader-dictionary-hit').first()).toBeVisible();
  await api('study.links.settings',{setId:set.id,expectedRevision:fresh.revision,sources:[]});
  await expect(page.locator('.reader-dictionary-layer')).toHaveCount(0);await expect(page.locator('.study-mark').first()).toBeVisible();
  f.pass('An empty dictionary removes its overlay without removing the saved excerpt highlight');
 }catch(error){failure=error;}finally{release?.();}
 await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
