'use strict';
const assert=require('node:assert/strict');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('mindmap-keyboard');let failure,release;
 try{
  const {page,api}=f;let set=await api('study.create',{title:'键盘完整导图'});
  set=await api('study.mindmap.outline.import',{setId:set.id,expectedRevision:set.revision,text:'中心\n  研究\n    证据\n  实现'});
  const original=structuredClone(set.cards),root=set.cards[0].id,source=set.cards[1].id,target=set.cards.at(-1).id;
  const get=async()=>set=await api('study.get',{setId:set.id});
  const node=id=>page.locator(`#study-map-world>.mindmap-topic[data-card-id="${id}"]`);
  const settled=async()=>{await get();await expect(page.locator('#study-board')).toHaveAttribute('data-rendered-study-revision',String(set.revision));};
  const rename=async title=>{await expect(page.locator('.mm-inline-title')).toBeVisible();await page.fill('.mm-inline-title',title);await page.keyboard.press('Enter');await expect(page.locator('.mm-inline-title')).toHaveCount(0);await settled();};
  await api('study.open',{setId:set.id});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();await page.click('#study-zoom-fit');
  await node(root).focus();await page.keyboard.press('Enter');await rename('主分支');const added=set.cards.find(c=>c.title==='主分支');assert.equal(added.parentId,root);assert.equal(set.cards.filter(c=>!c.parentId).length,1);
  await node(added.id).focus();await page.keyboard.press('Meta+Enter');await rename('父主题');const parent=set.cards.find(c=>c.title==='父主题');assert.equal(parent.parentId,root);assert.equal(set.cards.find(c=>c.id===added.id).parentId,parent.id);
  f.pass('Enter from the center creates a main branch; Command-Enter inserts a real parent without making disconnected roots');
  await node(source).locator('header strong').click();await page.keyboard.press('Meta+c');await expect.poll(async()=>(await api('study.clipboard.get')).clipboard?.cardIds.includes(source)).toBe(true);
  await node(target).locator('header strong').click();const previous=set.cards.length;await page.keyboard.press('Meta+v');await expect.poll(async()=>(await get()).cards.length).toBe(previous+2);await settled();
  const copied=set.cards.find(c=>c.title==='研究'&&c.id!==source);assert.equal(copied.parentId,target);assert(set.cards.some(c=>c.title==='证据'&&c.parentId===copied.id));assert.deepEqual(set.cards.filter(c=>original.some(o=>o.id===c.id)),original);
  await expect(node(copied.id)).toBeInViewport();f.pass('Keyboard paste attaches the copied whole subtree to the selected topic and preserves all original identities');
  await node(source).locator('header strong').click();await page.keyboard.press('Meta+c');await expect.poll(async()=>(await api('study.clipboard.get')).valid).toBe(true);await node(target).locator('header strong').click();const originalSetId=set.id,before=structuredClone(set.cards);
  const second=await api('study.create',{title:'另一个学习集'});let intercepted;const held=new Promise(resolve=>intercepted=resolve);
  await page.route('**/rpc',async route=>{const body=route.request().postDataJSON();if(body.method==='study.clipboard.get'){intercepted();await new Promise(resolve=>release=resolve);}await route.continue();});
  await page.keyboard.press('Meta+v');await held;await api('study.open',{setId:second.id});await expect(page.locator('#study-title')).toContainText('另一个学习集');release();release=null;await expect(page.locator('#toast')).toContainText('学习集已切换');
  assert.deepEqual((await api('study.get',{setId:originalSetId})).cards,before);assert.equal((await api('study.get',{setId:second.id})).cards.length,0);
  f.pass('Switching studies during a delayed clipboard read rejects the old paste instead of writing into or reopening another study');
 }catch(e){failure=e;}finally{release?.();await f.finish(failure);}
})().catch(e=>{console.error(e);process.exitCode=1;});
