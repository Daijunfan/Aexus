'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('responsive-workbench');let failure;
 try{
  let set=await f.api('study.create',{title:'可读性与工具区域'});
  for(let i=0;i<24;i++)set=await f.api('study.note.create',{setId:set.id,expectedRevision:set.revision,title:'Card '+i+' · 清晰可见',text:'Visible content 内容与脚注按钮都应位于卡片内。',tags:['readability']});
  await f.api('study.open',{setId:set.id});await f.api('study.view.set',{setId:set.id,expectedRevision:set.revision,view:'cards'});
  await f.page.goto(f.server.url);await f.page.waitForSelector('body[data-ready=true]');
  for(const [width,height] of [[1520,1000],[1024,768],[780,768]]){
   await f.page.setViewportSize({width,height});
   const card=f.page.locator('.study-list-card').first();await card.scrollIntoViewIfNeeded();
   const geometry=await card.evaluate(el=>{const r=el.getBoundingClientRect(),footer=el.querySelector('footer').getBoundingClientRect(),body=el.querySelector('.study-note-body').getBoundingClientRect(),panel=document.getElementById('study-cards-panel').getBoundingClientRect();return {card:r.height,body:body.height,footerBottom:footer.bottom-r.top,panel:panel.height,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(!geometry.overflow,JSON.stringify({width,height,...geometry}));assert(geometry.card>=235&&geometry.body>=120&&geometry.footerBottom<=geometry.card+1,JSON.stringify(geometry));assert(geometry.panel>=180,JSON.stringify(geometry));
   await f.page.locator('.study-list-card').last().scrollIntoViewIfNeeded();await expect(f.page.locator('.study-list-card').last().locator('.study-note-body')).toBeInViewport();
   await f.page.locator('#study-tools-expand').click();await expect(f.page.locator('#study-tools-expand')).toHaveAttribute('aria-pressed','true');
   await f.page.locator('#card-ink-settings').click();await expect(f.page.locator('#dialog')).toBeVisible();await f.page.locator('#dialog-cancel').click();await f.page.locator('#study-tools-expand').click();
   await f.page.screenshot({path:path.join(f.output,`workbench-${width}.png`)});
   f.pass(`${width}×${height}: content and footer fit each card, final card is reachable, advanced tools open and at least 180px remains for reading`);
  }
  await f.page.setViewportSize({width:1440,height:960});
  for(const theme of ['dark','sepia','light']){await f.api('settings.set',{theme});await expect(f.page.locator('body')).toHaveAttribute('data-theme',theme);await expect(f.page.locator('.study-list-card').last().locator('strong')).toContainText('清晰可见');}
  await f.page.locator('#study-card-search').fill('Card 23');await expect(f.page.locator('.study-list-card')).toHaveCount(1);await expect(f.page.locator('#study-list-pages')).toBeHidden();
  await f.page.locator('.study-list-card').focus();await f.page.keyboard.press('Enter');await expect(f.page.locator('#dialog')).toBeVisible();await expect(f.page.locator('[name=title]')).toHaveValue('Card 23 · 清晰可见');await f.page.locator('#dialog-cancel').click();
  f.pass('Three themes retain visible text; keyboard activation after filtering opens the correct card');
  assert.deepEqual(f.report.browserErrors,[]);
 }catch(error){failure=error;}finally{await f.finish(failure);}
})().catch(error=>{console.error(error);process.exitCode=1;});
