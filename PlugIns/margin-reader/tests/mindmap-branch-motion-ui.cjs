'use strict';
const assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs');
(async()=>{const f=await create('mindmap-branch-motion');let failure;try{
 const {page,api}=f;let set=await api('study.create',{title:'可见分支动画'});set=await api('study.mindmap.outline.import',{setId:set.id,expectedRevision:set.revision,text:'中心\n  研究\n    证据\n  设计\n    实现'});
 const root=set.cards[0].id,get=async()=>set=await api('study.get',{setId:set.id});
 const stable=async()=>{await get();await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));await expect(page.locator('#study-board')).not.toHaveAttribute('data-map-geometry-animating','true');};
 const change=async(method,params)=>{await get();set=await api(method,{setId:set.id,expectedRevision:set.revision,...params});await stable();};
 await api('settings.set',{uiMotion:'full'});await api('study.open',{setId:set.id});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();await page.click('#study-zoom-fit');
 await page.evaluate(()=>{window.branchMotion=[];const board=document.getElementById('study-board');new MutationObserver(()=>{if(board.dataset.mapGeometryAnimating!=='true')return;
  const sample=()=>[...document.querySelectorAll('.mm-motion-links path')].map(p=>({id:p.dataset.motionTo,fill:getComputedStyle(p).fill,stroke:getComputedStyle(p).stroke,d:p.getAttribute('d')}));
  window.branchMotion.push(sample());requestAnimationFrame(()=>requestAnimationFrame(()=>{if(board.dataset.mapGeometryAnimating==='true')window.branchMotion.push(sample());}));
 }).observe(board,{attributes:true,attributeFilter:['data-map-geometry-animating']});});
 for(const line of ['tapered','curve']){
  await change('study.mindmap.collapse',{cardIds:[root],level:-1});await change('study.mindmap.configure',{patch:{line}});
  const before=await page.locator('#study-map-world .mm-branch').evaluateAll(es=>es.map(p=>({id:p.dataset.mmBranch,fill:getComputedStyle(p).fill,stroke:getComputedStyle(p).stroke})));
  assert.equal(before.length,4);assert(before.every(p=>line==='tapered'?p.fill!=='none':p.stroke!=='none'));
  await page.evaluate(()=>window.branchMotion=[]);await change('study.mindmap.collapse',{cardIds:[root],level:0});
  const frames=await page.evaluate(()=>window.branchMotion);assert(frames.length>=1);assert.equal(frames[0].length,4);
  for(const frame of frames)for(const p of frame){assert(p.fill!=='none'||p.stroke!=='none',line+' invisible branch');const original=before.find(b=>b.id===p.id);assert(original);assert.equal(p.fill,original.fill);assert.equal(p.stroke,original.stroke);assert(p.d&&p.d.startsWith('M'));if(line==='tapered')assert(p.d.endsWith(' Z'),'Tapered branches must remain filled contours');}
  await expect(page.locator('.mm-motion-links,.mm-motion-ghost')).toHaveCount(0);assert.equal(set.cards.length,5);
 }
 f.pass('Both filled tapered branches and stroked curves retain actual paint throughout collapse frames, keep closed taper contours and leave no transient nodes');
 await change('study.mindmap.collapse',{cardIds:[root],level:-1});await change('study.mindmap.configure',{patch:{line:'tapered',skeleton:'classic'}});
 await page.evaluate(()=>{window.branchFillAnimations=0;const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.mm-branch,[data-motion-to]')&&Array.isArray(frames)&&frames.some(f=>'fill' in f))window.branchFillAnimations++;return animate.call(this,frames,options);};});
 await change('study.mindmap.configure',{patch:{theme:'forest'}});await expect.poll(()=>page.evaluate(()=>window.branchFillAnimations)).toBeGreaterThan(0);await expect(page.locator('#study-board')).not.toHaveAttribute('data-map-animating','true');
 f.pass('Changing palette animates filled branch paint as well as stroked paths and topic shapes');
}catch(e){failure=e;}await f.finish(failure);})().catch(e=>{console.error(e);process.exitCode=1;});
