"use strict";
const assert=require('node:assert/strict'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('boards-ui'),{api,page,pass}=f;let error;
 try{
  let a=await api('study.create',{mapMode:'cards',title:'Workspace alpha'}),b=await api('study.create',{mapMode:'cards',title:'Workspace beta'});
  a=await api('study.note.create',{setId:a.id,expectedRevision:a.revision,title:'Alpha topic',tags:['shared'],color:'blue'});
  b=await api('study.note.create',{setId:b.id,expectedRevision:b.revision,title:'Beta topic',tags:['shared'],color:'purple'});
  await page.goto(f.server.url);await page.waitForSelector('body[data-ready=true]');
  await page.click('#workspace-card-box');await page.selectOption('[name=group1]','study');await page.selectOption('[name=group2]','tag');await page.fill('[name=tags]','shared');await page.click('#board-search');
  await expect(page.locator('.board-group[data-group-depth="0"]')).toHaveCount(2);
  await expect(page.locator('.board-group[data-group-depth="1"]')).toHaveCount(2);
  await expect(page.locator('.board-card')).toHaveCount(2);await expect(page.locator('#board-status')).toContainText('2 张卡片');
  await page.click('#board-select-page');await page.click('#board-batch');await page.fill('[name=addTags]','selected-together');await page.selectOption('[name=favorite]','yes');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  for(const setId of [a.id,b.id])assert((await api('study.get',{setId})).cards[0].tags.includes('selected-together'));
  pass('Global card box renders both grouping levels and edits cards from two owner studies in one transaction');
  await page.click('#workspace-card-box');await expect(page.locator('.board-card')).toHaveCount(2);await page.click('#board-select-all');await expect(page.locator('#board-selected')).toHaveText('已选择 2 张卡片');await page.click('#board-batch');
  a=await api('study.get',{setId:a.id});await api('study.card.update',{setId:a.id,expectedRevision:a.revision,cardId:a.cards[0].id,note:'Concurrent edit'});
  await page.fill('[name=addTags]','must-not-be-partial');await page.click('#dialog-submit');await expect(page.locator('#dialog-error')).toContainText('数据已被另一处修改');
  for(const setId of [a.id,b.id])assert(!(await api('study.get',{setId})).cards[0].tags.includes('must-not-be-partial'));
  await page.click('#dialog-cancel');pass('A stale owner revision keeps the batch dialog open and prevents edits to every selected study');
  await page.locator(`.study-set-row[data-set-id="${a.id}"]`).click();await page.click('#study-boards');
  await page.fill('[name=title]','Blue notes');await page.fill('[name=colors]','blue');await page.selectOption('[name=group1]','color');await page.click('#board-search');await expect(page.locator('.board-group h3')).toContainText('blue');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();
  a=await api('study.get',{setId:a.id});const board=a.boards.find(b=>b.title==='Blue notes');assert(board);
  await page.click('#study-boards');await page.selectOption('[name=boardId]',board.id);await expect(page.locator('[name=colors]')).toHaveValue('blue');await expect(page.locator('.board-card')).toHaveCount(1);
  await page.click('#board-map');await expect(page.locator('#dialog')).toBeHidden();a=await api('study.get',{setId:a.id});assert(a.cards.some(c=>c.boardSource===board.id));
  pass('Saved color filters reopen with their values and materialize linked cards through the public API');
  await page.click('#study-boards');await page.selectOption('[name=boardId]',board.id);await page.click('#board-remove');await expect(page.locator('#dialog')).toBeHidden();assert(!(await api('study.get',{setId:a.id})).boards.length);
  await page.click('#study-undo');await expect.poll(async()=>(await api('study.get',{setId:a.id})).boards.length).toBe(1);
  await page.click('#workspace-card-box');await page.fill('[name=query]','no-such-card');await page.click('#board-search');await expect(page.locator('#board-status')).toHaveText('0 张卡片 · 当前 0–0');await expect(page.locator('#board-next')).toBeDisabled();
  await page.setViewportSize({width:820,height:800});await page.screenshot({path:path.join(f.output,'grouped-card-box.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  pass('Deleting a board never removes cards, undo restores its definition, and empty/narrow layouts remain usable');
 }catch(e){error=e;}finally{await f.finish(error);}
})().catch(e=>{console.error(e);process.exitCode=1;});
