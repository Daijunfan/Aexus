'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {create,expect}=require('./ui-session.cjs');
(async()=>{
 const f=await create('sidebar-navigation-ui');let failure;
 const out=await fs.readFile(path.join(__dirname,'../artifacts/sidebar-current.txt'),'utf8').then(s=>s.trim(),()=>f.output);
 try{
  const {page,api}=f;
  await api('fs.mkdir',{path:'横向移动'});await api('fs.mkdir',{path:'横向移动/章节'});
  await api('fs.write',{path:'横向移动/横向移动.html',content:'<h1>横向移动原文</h1><p>从主页面搜索打开原件，目录保持完整。</p>'});
  await api('fs.write',{path:'横向移动/章节/参考资料.md',content:'# 参考资料\n\nNested original'});
  await api('fs.write',{path:'AI Systems.md',content:'# AI Systems\n\nRoot document'});
  let library=await api('study.library.get');library=await api('study.folder.create',{expectedRevision:library.revision,title:'课程'});const folder=library.folders[0];
  const set=await api('study.create',{title:'横向移动',folderId:folder.id});
  await api('settings.set',{homeSection:'library',activeStudySet:null,lastDocument:null,currentFolder:'.'});
  await page.goto(f.server.url);await page.locator('body[data-ready=true]').waitFor();
  const sameHeaders=async()=>{
   const result=await page.evaluate(()=>{
    const a=document.getElementById('studies-root'),b=document.getElementById('library-root');
    const signature=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{width:r.width,height:r.height,fontSize:s.fontSize,fontWeight:s.fontWeight,padding:s.padding,borderRadius:s.borderRadius,margin:s.margin,alignItems:s.alignItems,gap:s.gap,iconWidth:el.querySelector('.icon').getBoundingClientRect().width};};
    return{study:signature(a),library:signature(b),children:['study-library-sidebar','file-library-sidebar'].map(id=>[...document.getElementById(id).children].map(el=>el.id)),sidebarInputs:document.querySelectorAll('.explorer input,.explorer .tool-finder-launch,.explorer #workspace-card-box').length};
   });
   assert.deepEqual(result.study,result.library,'Both category buttons must have identical geometry and typography');
   assert.deepEqual(result.children,[['studies-root','study-set-list'],['library-root','file-tree']]);assert.equal(result.sidebarInputs,0);
   for(const id of ['studies-root','library-root'])await expect(page.locator('#'+id)).toBeInViewport();
  };
  await sameHeaders();
  await page.click('#studies-root');await expect(page.locator('#study-library-view')).toBeVisible();
  for(const id of ['study-create','collection-new-folder','study-import-package','study-deleted']){await expect(page.locator('#study-library-view #'+id)).toBeVisible();assert.equal(await page.locator('.explorer #'+id).count(),0);}
  for(const [id,title]of [['study-create','新建学习集'],['collection-new-folder','新建学习集文件夹'],['study-import-package','导入'],['study-deleted','回收站']]){
   await page.click('#'+id);await expect(page.locator('#dialog-title')).toContainText(title);await page.click('#dialog-cancel');await expect(page.locator('#dialog')).toBeHidden();
  }
  await page.click('#study-create');await page.fill('#dialog [name=title]','验收新学习集');await page.click('#dialog-submit');await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('#study-title')).toHaveText('验收新学习集');
  f.pass('Each sidebar section contains exactly its standalone category button and tree; original create/import/trash handlers work from the study main page');

  await page.click('#studies-root');await expect(page.locator('#study-library-view')).toBeVisible();await page.keyboard.press('ControlOrMeta+f');await expect(page.locator('#study-library-search')).toBeFocused();await page.fill('#study-library-search','横向移动');await expect(page.locator('#study-library-items .collection-tile.is-study')).toHaveCount(1);
  await page.locator('#study-library-items .collection-open').click();await expect(page.locator('#study-title')).toHaveText(set.title);
  await page.click('#library-root');await expect(page.locator('#library-view')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+f');const search=page.locator('#file-filter');await expect(search).toBeFocused();
  const tree=await page.locator('#file-tree').evaluate(el=>{window.savedLibraryRow=el.firstElementChild;return el.innerHTML;});
  await search.fill('横向移动.html');await expect(page.locator('#files .file-card')).toHaveCount(1);await expect(page.locator('#folder-title')).toHaveText('搜索结果');await expect(page.locator('#files .file-info')).toContainText('横向移动/横向移动.html');
  assert.equal(await page.locator('#file-tree').evaluate(el=>el.innerHTML),tree);assert(await page.locator('#file-tree').evaluate(el=>el.firstElementChild===window.savedLibraryRow));
  assert.equal(await search.evaluate(el=>getComputedStyle(el).outlineStyle),'none');assert.equal(await search.evaluate(el=>getComputedStyle(el).boxShadow),'none');
  await expect(page.locator('#files .file-card')).toHaveAttribute('data-preview','ready',{timeout:30000});assert(await page.locator('#files .document-thumbnail').evaluate(img=>img.complete&&img.naturalWidth>50));
  await page.screenshot({path:path.join(out,'library-main-search.png'),animations:'disabled'});
  await page.click('#select-files');await page.click('#select-all-files');await expect(page.locator('#selected-name')).toHaveText('已选择 1 项');await page.click('#select-files');
  await page.locator('#files .file-open').click();await expect(page.locator('#document-path')).toHaveText('横向移动/横向移动.html');await expect(page.locator('.flow-document')).toContainText('横向移动原文');
  f.pass('Main-page file search finds nested originals without filtering or rebuilding the sidebar; selection targets only matching files and opening uses the original path');

  await page.click('#library-root');await expect(search).toHaveValue('');await search.fill('nonexistent 🙂');await expect(page.locator('#library-no-matches')).toBeVisible();await expect(page.locator('#empty-library')).toBeHidden();
  await page.keyboard.press('Escape');await expect(search).toHaveValue('');await expect(page.locator('#library-no-matches')).toBeHidden();await expect(page.locator('#files .file-card')).toHaveCount(2);
  await search.fill('参考资料');await expect(page.locator('#files .file-card')).toHaveCount(1);await page.click('#clear-file-filter');await expect(search).toBeFocused();await expect(page.locator('#files .file-card')).toHaveCount(2);
  await search.fill('新增资料');await expect(page.locator('#library-no-matches')).toBeVisible();await api('fs.write',{path:'横向移动/新增资料.md',content:'# 新增资料'});await expect(page.locator('#files .file-card')).toHaveCount(1);await expect(page.locator('#library-no-matches')).toBeHidden();
  await search.fill('横向移动/章节');await page.locator('#files .file-card[data-path="横向移动/章节"] .file-open').click();await expect(search).toHaveValue('');await expect(page.locator('#folder-title')).toHaveText('章节');await expect(page.locator('#files .file-card')).toHaveCount(1);
  f.pass('No-result feedback, Escape/clear, live file updates and entering a searched folder preserve the correct result set and clear stale search state');

  await page.click('#tool-finder-open');await expect(page.locator('#tool-finder')).toBeVisible();await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');await expect(page.locator('#tool-finder')).toBeVisible();await page.keyboard.press('Escape');
  await page.click('#workspace-card-box');await expect(page.locator('#dialog')).toBeVisible();await expect(page.locator('#board-search')).toBeVisible();await page.click('#dialog-cancel');
  assert.equal(await page.locator('.top-actions #workspace-card-box').count(),1);assert.equal(await page.locator('.top-actions #tool-finder-open').count(),1);
  f.pass('Global tool discovery, its keyboard shortcut and the all-library card box remain available in the right-hand toolbar, with no duplicate sidebar controls');

  for(const theme of ['light','dark','sepia']){
   await api('settings.set',{theme});await expect(page.locator('body')).toHaveAttribute('data-theme',theme);
   for(const width of [1440,960,780]){await page.setViewportSize({width,height:900});await sameHeaders();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  }
  await api('settings.set',{theme:'light'});await expect(page.locator('body')).toHaveAttribute('data-theme','light');await page.setViewportSize({width:1440,height:960});
  await page.click('#studies-root');await expect(page.locator('#study-library-view')).toBeVisible();await expect(page.locator('#study-library-title')).toHaveText('学习集');await page.mouse.move(650,100);await page.screenshot({path:path.join(out,'studies-main-actions.png'),animations:'disabled'});
  await page.locator('.explorer').screenshot({path:path.join(out,'sidebar-navigation.png'),animations:'disabled'});
  const duplicateIds=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return ids.filter((id,index)=>ids.indexOf(id)!==index);});assert.deepEqual(duplicateIds,[]);
  f.pass('Category buttons remain identical and keyboard-visible at 1440/960/780 pixels in light, dark and sepia; the document has no duplicate element IDs');
 }catch(error){failure=error;}
 await f.finish(failure);
})().catch(error=>{console.error(error);process.exitCode=1;});
