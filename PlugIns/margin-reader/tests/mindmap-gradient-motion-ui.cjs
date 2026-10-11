'use strict';
const assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('mindmap-gradient-motion');let failure;
 try{
  const {page,api}=f;let s=await api('study.create',{title:'渐变节点动画'});
  s=await api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:'中心\n  主分支\n    渐变主题\n    其他主题'});
  const root=s.cards[0].id,leaf=s.cards.find(c=>c.title==='渐变主题').id;
  s=await api('study.mindmap.topics.update',{setId:s.id,expectedRevision:s.revision,cardIds:[leaf],patch:{shape:'rounded',fill:'#D8BBF0',gradient:true}});
  await api('settings.set',{uiMotion:'full'});await api('study.open',{setId:s.id});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();await page.click('#study-zoom-fit');
  await expect(page.locator(`#study-map-world>.mindmap-topic[data-card-id="${leaf}"] linearGradient`)).toHaveCount(1);
  await page.evaluate(()=>{window.gradientMotion=[];const board=document.getElementById('study-board');new MutationObserver(()=>{
   if(board.dataset.mapGeometryAnimating!=='true')return;const ghosts=[...document.querySelectorAll('.mm-motion-ghost')],missing=[];let references=0;
   for(const ghost of ghosts)for(const el of [ghost,...ghost.querySelectorAll('*')])for(const attr of el.attributes)for(const m of attr.value.matchAll(/url\(#([^)]*)\)/g)){references++;if(!ghost.querySelector('[id="'+m[1]+'"]'))missing.push(m[1]);}
   const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);window.gradientMotion.push({ghosts:ghosts.length,references,missing,duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i)});
  }).observe(board,{attributes:true,attributeFilter:['data-map-geometry-animating']});});
  s=await api('study.mindmap.collapse',{setId:s.id,expectedRevision:s.revision,cardIds:[root],level:1});
  await expect.poll(()=>page.evaluate(()=>window.gradientMotion.length)).toBeGreaterThan(0);
  const samples=await page.evaluate(()=>window.gradientMotion);assert(samples.some(v=>v.ghosts>=2&&v.references>=1));assert(samples.every(v=>v.missing.length===0),JSON.stringify(samples));assert(samples.every(v=>v.duplicates.length===0),JSON.stringify(samples));
  await expect(page.locator('.mm-motion-ghost,.mm-motion-links')).toHaveCount(0);assert.equal((await api('study.get',{setId:s.id})).cards.length,4);
  f.pass('Collapsing gradient topics preserves every local paint definition in exit ghosts, introduces no duplicate DOM IDs and removes only temporary layers');
 }catch(e){failure=e;}await f.finish(failure);
})().catch(e=>{console.error(e);process.exitCode=1;});
