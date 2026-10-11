'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {create,expect}=require('./ui-session.cjs'),{pdfFixture}=require('./fixtures.cjs');
(async()=>{const f=await create('read-map-surface');let failure;try{
 const {page,api}=f,out=(await fs.readFile(path.join(__dirname,'../artifacts/read-map-current.txt'),'utf8')).trim();
 const pdf=pdfFixture();await fs.writeFile(path.join(f.workspace,'reading.pdf'),pdf);await fs.writeFile(path.join(f.workspace,'article.html'),'<html><body><h1>本地文档阅读</h1><p>一个专注的阅读和脑图工作空间。保留原文，整理主题。</p></body></html>');
 let s=await api('study.create',{title:'阅读与思维导图',mapMode:'cards'});s=await api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['reading.pdf','article.html']});
 s=await api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:'研究计划\n  阅读原文\n    核对证据\n    记录来源\n  结构设计\n    主题表达\n    交互验证'});
 s=await api('study.view.set',{setId:s.id,expectedRevision:s.revision,view:'review'});const stored=structuredClone(s.cards);
 await api('study.open',{setId:s.id});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();await expect(page.locator('[data-study-view]')).toHaveCount(2);assert.deepEqual(await page.locator('[data-study-view]').allTextContents(),['文档','脑图']);
 await expect(page.locator('#study-map-viewport')).toBeVisible();await expect(page.locator('#study-cards-panel,.study-modes,#study-learning-menu,#study-review-panel,#workspace-card-box,.study-tool-shelf')).toHaveCount(0);
 assert.deepEqual((await api('study.get',{setId:s.id})).cards,stored);await page.click('#study-zoom-fit');await page.screenshot({path:path.join(out,'two-view-map.png'),animations:'disabled'});
 f.pass('An old card/review workspace opens as the two-surface product without deleting node contents or exposing retired learning panels');
 await page.click('[data-study-view=documents]');await expect(page.locator('#study-documents')).toBeVisible();await expect(page.locator('#study-map-viewport')).toBeHidden();await expect(page.locator('.study-document .file-art img')).toHaveCount(2);await page.screenshot({path:path.join(out,'documents-home.png'),animations:'disabled'});
 await page.locator('.study-document[data-path="reading.pdf"] .study-document-open').click();await expect(page.locator('#reader-view')).toBeVisible();await expect(page.locator('.pdf-page[data-page="1"] canvas')).toBeVisible();await expect(page.locator('[data-study-view=documents]')).toHaveAttribute('aria-pressed','true');assert(await page.locator('#reader-view').evaluate(el=>el.getBoundingClientRect().right>=innerWidth-2),'The reader must use the whole available main pane, with no abandoned split column');
 await page.click('#next-page');await expect(page.locator('#page-number')).toHaveValue('2');await page.screenshot({path:path.join(out,'basic-pdf-reader.png'),animations:'disabled'});
 await page.click('[data-study-view=map]');await expect(page.locator('#study-map-viewport')).toBeVisible();await expect(page.locator('#reader-view')).toBeHidden();assert.equal((await api('settings.get')).lastDocument,null);await page.waitForTimeout(600);await expect(page.locator('#reader-view')).toBeHidden();
 await page.click('[data-study-view=documents]');await page.locator('.study-document[data-path="article.html"] .study-document-open').click();await expect(page.locator('#reading-surface')).toContainText('本地文档阅读');await page.click('[data-study-view=map]');await expect(page.locator('#study-map-viewport')).toBeVisible();
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'reading.pdf')),pdf);
 f.pass('Real PDF/HTML previews open their original documents, page controls work, and returning to the map cannot be undone by a late reader refresh');
 await page.click('#tool-finder-open');await page.fill('#tool-finder-query','复习');await expect(page.locator('#tool-finder-results [data-tool-id]')).toHaveCount(0);await page.fill('#tool-finder-query','卡片盒');await expect(page.locator('#tool-finder-results [data-tool-id]')).toHaveCount(0);await page.click('#tool-finder-close');
 await page.click('#mm-themes');await page.selectOption('#mm-skeleton-family','all');await expect(page.locator('[data-mm-skeleton]')).toHaveCount(54);await page.click('#mm-panel-close');
 await page.click('#map-more summary');await expect(page.locator('#map-more .map-more-body')).toBeVisible();const labels=await page.locator('#map-more').innerText();assert(!/复习|牌组|卡片盒/.test(labels));await page.keyboard.press('Escape');
 for(const width of [780,1024,1520]){await page.setViewportSize({width,height:900});await expect(page.locator('[data-study-view]')).toHaveCount(2);await expect(page.locator('#study-map-viewport')).toBeVisible();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.reload();await page.locator('body[data-ready=true]').waitFor();await expect(page.locator('[data-study-view=map]')).toHaveAttribute('aria-pressed','true');assert.deepEqual((await api('study.get',{setId:s.id})).cards,stored);
 f.pass('Command search and overflow expose only live reading/map operations; all 54 designs, narrow layouts and persisted view selection remain available');
}catch(e){failure=e;}await f.finish(failure);})().catch(e=>{console.error(e);process.exitCode=1;});
