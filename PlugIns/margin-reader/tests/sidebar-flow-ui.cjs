'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs');
async function geometry(page){return page.evaluate(()=>{
 const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};};
 const tree=document.getElementById('study-set-list'),last=tree.lastElementChild;
 const nav=document.getElementById('sidebar-navigation');
 return {gap:box('#library-root').top-(last?last.getBoundingClientRect().bottom:box('#studies-root').bottom),upper:box('#study-library-sidebar'),lower:box('#file-library-sidebar'),header:box('.explorer>.pane-heading'),footer:box('.explorer-footer'),navigation:nav?{...box('#sidebar-navigation'),scrollHeight:nav.scrollHeight,clientHeight:nav.clientHeight,scrollTop:nav.scrollTop}:null,treeOverflows:['study-set-list','file-tree'].map(id=>getComputedStyle(document.getElementById(id)).overflowY)};
});}
async function assertFlowLayout(page){
 const g=await geometry(page);assert(g.gap>=0&&g.gap<=48,`Library must follow visible study content without an allocated half-panel gap: ${JSON.stringify(g)}`);
 assert(g.navigation,'Both trees need one shared scroll area');assert.deepEqual(g.treeOverflows,['visible','visible']);
 assert(g.navigation.bottom<=g.footer.top+1);assert(g.navigation.top>=g.header.bottom-1);
 return g;
}
exports.assertFlowLayout=assertFlowLayout;
async function main(){
 const f=await create('sidebar-flow-ui');let failure;const {page,api}=f;
 const out=process.env.MR_FLOW_OUTPUT||f.output;await fs.mkdir(out,{recursive:true});
 try{
  await api('settings.set',{homeSection:'studies',activeStudySet:null,lastDocument:null});await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  await assertFlowLayout(page);const before=(await geometry(page)).lower.top;
  const one=await api('study.create',{mapMode:'cards',title:'横向移动'});await expect(page.locator(`.study-set-row[data-set-id="${one.id}"]`)).toBeVisible();await assertFlowLayout(page);
  const compact=(await geometry(page)).lower.top;assert(compact-before<70,'One study must not consume half the sidebar');
  await page.locator('.explorer').screenshot({path:path.join(out,'sidebar-one-study.png'),animations:'disabled'});
  f.pass('Empty and single-study sidebars use intrinsic content height with the library immediately below');
  let library=await api('study.library.get');library=await api('study.folder.create',{expectedRevision:library.revision,title:'课程'});const folder=library.folders.find(v=>v.title==='课程');
  library=await api('study.folder.create',{expectedRevision:library.revision,title:'章节',parentId:folder.id});const child=library.folders.find(v=>v.title==='章节');
  await api('study.library.move',{expectedRevision:library.revision,setIds:[one.id],folderId:child.id});
  const row=id=>page.locator(`.study-folder-row[data-folder-id="${id}"]`),toggle=id=>row(id).locator('.folder-toggle');
  await expect(row(folder.id)).toBeVisible();await toggle(folder.id).click();await expect(row(child.id)).toBeVisible();await toggle(child.id).click();
  await page.locator(`.study-set-row[data-set-id="${one.id}"]`).click();await expect(page.locator('#study-title')).toHaveText(one.title);
  const expanded=await assertFlowLayout(page);await toggle(folder.id).click();await expect(row(folder.id)).toHaveAttribute('aria-expanded','false');
  await expect(row(child.id)).toHaveCount(0);const closed=await assertFlowLayout(page);assert(expanded.lower.top-closed.lower.top>65,'Collapsing visible descendants must pull the library up');
  await api('study.update',{setId:one.id,expectedRevision:(await api('study.get',{setId:one.id})).revision,description:'External refresh while ancestor stays collapsed'});
  await expect(page.locator('#study-description')).toHaveText('External refresh while ancestor stays collapsed');await expect(row(folder.id)).toHaveAttribute('aria-expanded','false');
  assert(Math.abs((await geometry(page)).lower.top-closed.lower.top)<1,'An external refresh must not reopen a manually collapsed active branch');
  await toggle(folder.id).focus();await page.keyboard.press('Enter');await expect(row(child.id)).toBeVisible();await assertFlowLayout(page);
  f.pass('Nested collapse/expand immediately shifts the library; an active study and external edits do not force a collapsed folder open');
  await page.click('#studies-root');await expect(page.locator('#study-library-view')).toBeVisible();
  if(await row(folder.id).getAttribute('aria-expanded')==='true')await toggle(folder.id).click();
  for(let i=0;i<28;i++)await api('study.create',{mapMode:'cards',title:'课程资料 '+String(i+1).padStart(2,'0'),folderId:folder.id});
  await expect(row(folder.id).locator('small')).toHaveText('28');
  const collapsedTop=(await assertFlowLayout(page)).lower.top;
  await page.setViewportSize({width:960,height:620});const stableFooter=(await geometry(page)).footer;
  await toggle(folder.id).click();await expect(page.locator('#study-set-list .study-set-row')).toHaveCount(29);
  let long=await assertFlowLayout(page);assert(long.lower.top>collapsedTop+1000);assert(long.navigation.scrollHeight>long.navigation.clientHeight+900);assert.deepEqual(long.footer,stableFooter);
  const nav=page.locator('#sidebar-navigation');await nav.hover();await page.mouse.wheel(0,1800);
  await expect.poll(async()=>(await geometry(page)).navigation.scrollTop).toBeGreaterThan(500);await expect(page.locator('#library-root')).toBeInViewport();
  await page.click('#library-root');await expect(page.locator('#library-view')).toBeVisible();await assertFlowLayout(page);
  await toggle(folder.id).scrollIntoViewIfNeeded();await toggle(folder.id).click();await expect(row(folder.id)).toHaveAttribute('aria-expanded','false');
  long=await assertFlowLayout(page);assert(long.navigation.scrollTop<2);assert.deepEqual(long.footer,stableFooter);await expect(page.locator('#library-root')).toBeInViewport();
  f.pass('Expanding 29 studies pushes the library down; wheel scrolling is shared, and collapsing restores a compact sidebar without moving the footer');
  await api('fs.mkdir',{path:'资料'});for(let i=0;i<20;i++)await api('fs.write',{path:`资料/章节-${i}.md`,content:`# 章节 ${i}`});
  const fileFolder=page.locator('.tree-row[data-path="资料"]');await expect(fileFolder).toBeVisible();await fileFolder.locator('.twisty').click();await expect(page.locator('#file-tree .tree-row')).toHaveCount(21);
  const fileLong=await assertFlowLayout(page);assert(fileLong.navigation.scrollHeight>fileLong.navigation.clientHeight);assert.deepEqual(fileLong.footer,stableFooter);
  await fileFolder.locator('.twisty').click();await expect(page.locator('#file-tree .tree-row')).toHaveCount(1);await assertFlowLayout(page);
  f.pass('Expanding the document tree uses the same scroll container and cannot resize or cover the footer');
  for(const theme of ['light','dark','sepia']){
   await api('settings.set',{theme});await expect(page.locator('body')).toHaveAttribute('data-theme',theme);
   for(const height of [520,780,1100]){await page.setViewportSize({width:780,height});await assertFlowLayout(page);await expect(page.locator('#studies-root')).toBeInViewport();await expect(page.locator('#library-root')).toBeInViewport();}
  }
  await api('settings.set',{theme:'light'});await page.setViewportSize({width:1440,height:900});
  for(let i=0;i<3;i++){await toggle(folder.id).click();await expect(row(folder.id)).toHaveAttribute('aria-expanded','true');await toggle(folder.id).click();await expect(row(folder.id)).toHaveAttribute('aria-expanded','false');await assertFlowLayout(page);}
  await page.reload();await page.locator('body[data-ready=true]').waitFor();await assertFlowLayout(page);await expect(row(folder.id)).toHaveAttribute('aria-expanded','false');
  assert.equal((await api('study.library.get')).sets.length,29);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.explorer').screenshot({path:path.join(out,'sidebar-folded.png'),animations:'disabled'});
  f.pass('Short/tall windows, three themes, repeated toggles and reload retain natural stacking with all study identities intact');
 }catch(error){failure=error;}await f.finish(failure);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
