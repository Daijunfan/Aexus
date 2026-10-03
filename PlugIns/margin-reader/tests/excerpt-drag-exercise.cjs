'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {expect}=require('../../../node_modules/@playwright/test'),{pdfFixture}=require('./fixtures.cjs');
exports.exercise=async({page,api,url,workspace,pass,output})=>{
 const original=pdfFixture();await fs.writeFile(path.join(workspace,'drag-source.pdf'),original);
 let set=await api('study.create',{title:'Drag original excerpts into topics'});
 const get=async()=>set=await api('study.get',{setId:set.id}),change=async(method,p={})=>{await get();return set=await api(method,{setId:set.id,expectedRevision:set.revision,...p});};
 await change('study.documents.add',{paths:['drag-source.pdf']});const documentId=set.documentIds[0];await change('study.note.create',{title:'Drop target'});const parent=set.cards[0].id;await change('study.card.update',{cardId:parent,collapsed:true});
 await change('study.view.set',{view:'split',documentId});await api('study.open',{setId:set.id});await page.goto(url);await page.locator('body[data-ready=true]').waitFor();await expect(page.locator('.pdf-page[data-page="1"] canvas')).toBeVisible();await page.click('#study-zoom-fit');
 const select=async()=>{
  await page.click('#reader-annotations summary');await page.click('#study-region');const b=await page.locator('.pdf-page[data-page="1"]').boundingBox();
  await page.mouse.move(b.x+b.width*.1,b.y+b.height*.05);await page.mouse.down();await page.mouse.move(b.x+b.width*.75,b.y+b.height*.14,{steps:10});await page.mouse.up();await expect(page.locator('#excerpt-drag-handle')).toBeVisible();
 };
 await select();const revision=(await get()).revision;await page.locator('#excerpt-drag-handle').dragTo(page.locator(`.mindmap-topic[data-card-id="${parent}"] header strong`));
 await expect.poll(async()=>(await get()).cards.length).toBe(2);assert.equal(set.revision,revision+1);const excerpt=set.cards.find(c=>c.id!==parent);assert.equal(excerpt.parentId,parent);assert.equal(excerpt.source.documentId,documentId);assert(excerpt.image);assert.equal(set.cards.find(c=>c.id===parent).collapsed,false);
 await expect(page.locator(`.study-mark[data-card-id="${excerpt.id}"]`).first()).toBeVisible();await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));
 await page.locator(`.mindmap-topic[data-card-id="${excerpt.id}"] header strong`).click();await expect(page.locator('#document-path')).toHaveText('drag-source.pdf');assert.equal((await api('reader.position.get',{id:documentId})).locator.page,1);
 pass('An actual dragged PDF selection creates a durable source-linked child, expands its collapsed parent and adds the original annotation in one Core transaction');
 await change('study.capture.settings',{parentId:parent,inMap:false,organize:'toc'});await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));await select();
 const count=set.cards.length;await page.locator('#excerpt-drag-handle').dragTo(page.locator('#study-map-viewport'),{targetPosition:{x:50,y:80}});
 await expect.poll(async()=>(await get()).cards.length).toBe(count+1);const floating=set.cards.find(c=>c.id!==parent&&c.id!==excerpt.id);assert.equal(floating.parentId,null);assert.equal(floating.inMap,true);assert(floating.position&&Number.isFinite(floating.position.x));assert(floating.source&&floating.image);
 await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));await page.click('#study-undo');await expect.poll(async()=>(await get()).cards.length).toBe(count);assert(set.cards.some(c=>c.id===excerpt.id));
 await page.screenshot({path:path.join(output,'excerpt-drag.png'),animations:'disabled'});assert.deepEqual(await fs.readFile(path.join(workspace,'drag-source.pdf')),original);
 pass('Dropping on blank space creates a positioned floating excerpt despite preset grouping; one undo removes only that drop and original PDF bytes remain intact');
};
