import { verifyColorThemes } from './fixtures/mininotion-color-themes.mjs';
// Presentation regression on an isolated workspace; no model calls or user documents.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test');
const root=path.resolve(import.meta.dirname,'..'),run=promisify(execFile);
const out=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'artifacts/mininotion-ui-polish/visual');
fs.mkdirSync(out,{recursive:true});
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mn-visual-')));
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_PLUGIN_DIRS:process.env.MINI_NOTION_TEST_PLUGIN||''};
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_BUILTIN_PLUGINS','MINI_NOTION_SOCKET','MINI_NOTION_WORKSPACE','MINI_NOTION_DATA_DIR'].includes(key))delete env[key];
const cli=async(...args)=>{const v=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{cwd:root,env,timeout:45000,maxBuffer:48e6})).stdout);assert.ok(v.ok,v.error);return v.data};
const api=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params));
const baseline=process.env.MININOTION_VISUAL_BASELINE==='1',errors=[],checks=[],screens=[];
let app,page;
const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});screens.push(name)};
const pass=message=>{checks.push(message);console.log('PASS '+message)};
const goto=async p=>{await api('page.open',{pageId:p.id});await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(p.title);await expect(page.locator('.save-status')).toContainText('已保存到本机')};
async function bounds(selector){
  await page.locator(selector).evaluateAll(nodes=>Promise.all(nodes.flatMap(node=>node.getAnimations().map(animation=>animation.finished.catch(()=>{})))));
  for(const box of await page.locator(selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}}))){
    const viewport=await page.evaluate(()=>({w:innerWidth,h:innerHeight}));
    assert.ok(box.left>=-1&&box.top>=-1&&box.right<=viewport.w+1&&box.bottom<=viewport.h+1,selector+' escaped '+JSON.stringify(box));
  }
}
async function noOverlap(selector){
  const overlaps=await page.locator(selector).evaluateAll(groups=>groups.flatMap(group=>{
    const boxes=[...group.children].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none').map(el=>({name:el.className,r:el.getBoundingClientRect()}));
    return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1).map(b=>[a.name,b.name]));
  }));assert.deepEqual(overlaps,[],selector+' overlapping children');
}
try{
  app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env});
  await(await app.firstWindow()).locator('.infinite-canvas').waitFor();
  const image=await api('fs.asset-upload',{name:'visual-cover.svg',contentBase64:fs.readFileSync(root+'/PlugIns/mini-notion/src/assets/cover-paper.svg').toString('base64')});
  const imageUrl=typeof image==='string'?image:image.url;
  const main=await api('page.create',{title:'工作与思考 · Project notebook',icon:'icon:BookOpen:blue',cover:imageUrl,color:'white',blocks:[{type:'paragraph',content:'把复杂的工作整理成清晰的页面。封面、图标、层级和视图应当安静而一致。'},{type:'heading',props:{level:2},content:'清晰的结构'},{type:'bulletListItem',content:'先记录事实，再连接想法。'},{type:'checkListItem',props:{checked:true},content:'每一个细节都能通过实际交互验证。'},{type:'paragraph',content:[{type:'link',href:'https://example.invalid',content:[{type:'text',text:'链接与正文各司其职',styles:{}}]}]}]});
  await api('workspace.rename',{name:'我的工作空间'});
  const leaf=await api('page.create',{title:'很长的子页面标题 — Layout, typography and interaction details',parentId:main.id,icon:'🧑🏽‍💻',color:'white'});
  let nested=leaf;for(let i=0;i<7;i++)nested=await api('page.create',{title:'层级 '+i+' · Nested documentation',parentId:nested.id,color:'white',icon:'icon:FileText:gray'});
  const db=await api('database.create',{title:'项目进展',parentId:main.id,icon:'icon:LayoutGrid:green',color:'white',columns:[{id:'status',name:'状态',type:'select',options:['计划中','进行中','已完成']},{id:'date',name:'日期',type:'date'},{id:'owner',name:'负责人',type:'text'},{id:'progress',name:'进度',type:'number'}]});
  const today=new Date().toISOString().slice(0,10),types=['table','board','gallery','list','calendar','timeline','chart','feed','form','plan'];
  const initial=(await api('view.list',{databaseId:db.id}))[0],views=[];
  const names=['表格','看板','画廊','列表','日历','时间线','图表','动态','表单','计划'];
  for(const [i,type] of types.entries())views.push(type==='table'?initial:await api('view.create',{databaseId:db.id,type,name:names[i]}));
  for(const view of views)await api('view.update',{databaseId:db.id,viewId:view.id,changes:{groupBy:'status',calendarBy:'date',chartGroup:'status',cardPreview:'cover',dateAnchor:today}});
  for(let i=0;i<6;i++)await api('record.create',{databaseId:db.id,title:['界面设计','交互细节','架构梳理','排版与图标','质量验收','发布准备'][i],icon:i%2?'icon:FileText:blue':'📄',color:'white',cover:i%2?imageUrl:'sage',values:{status:['计划中','进行中','已完成'][i%3],date:today,owner:'设计团队',progress:i*20},blocks:[{type:'paragraph',content:'保持内容清楚、界面轻盈，让每一次操作都有一致的反馈。'}]});
  const pending=app.waitForEvent('window');await cli('plugin','open','mininotion');page=await pending;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.sidebar').waitFor();await expect.poll(async()=>(await api('status')).guiClients).toBeGreaterThan(0);
  const window=await app.browserWindow(page);
  const resize=async(width,height)=>{await window.evaluate((w,size)=>w.setContentSize(size.width,size.height),{width,height});await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width)};
  for(const theme of ['light','dark']){
    await api('settings.set',{theme});await resize(1360,940);await goto(main);await shot(theme+'-document');
    if(!baseline){await bounds('.topbar-right');await noOverlap('.topbar,.topbar-right');await expect(page.locator('.page-cover')).toHaveCSS('background-size','cover')}
    await page.getByRole('button',{name:'更换页面图标',exact:true}).click();await shot(theme+'-icon-picker');if(!baseline)await bounds('.popover');await page.keyboard.press('Escape');
    await page.locator('.page-cover').hover();await page.getByRole('button',{name:'更换封面',exact:true}).click();await shot(theme+'-cover-picker');if(!baseline)await bounds('.popover');await page.keyboard.press('Escape');
    for(const width of [1360,560]){
      await resize(width,940);
      for(const view of views){
        await api('page.open',{pageId:db.id,viewId:view.id});await expect(page.locator('.database')).toBeVisible();
        await expect(page.locator(`.view-tabs [data-view-id="${view.id}"]`)).toHaveClass(/active/);
        await expect(page.locator('.save-status')).toContainText('已保存到本机');await shot(`${theme}-${width}-${view.type}`);
        if(!baseline){await noOverlap('.topbar,.topbar-right,.database-tools');await bounds('.database-toolbar,.database-tools,.topbar-right');const icon=await page.locator('.page-large-icon > *').boundingBox(),slot=await page.locator('.page-large-icon').boundingBox();assert.ok(icon.width<=slot.width&&icon.height<=slot.height,'page icon exceeds its slot')}
      }
    }
    await goto(main);await page.getByRole('button',{name:'页面更多操作',exact:true}).click();await shot(theme+'-narrow-menu');if(!baseline)await bounds('.popover');await page.keyboard.press('Escape');
    await api('ui.command',{command:'appearance',params:{pageId:main.id}});await expect(page.locator('.modal')).toBeVisible();await shot(theme+'-appearance');
    await page.keyboard.press('Escape');await api('ui.command',{command:'settings',params:{tab:'appearance'}});
    const select=page.locator('.modal .app-select-trigger').last();await select.scrollIntoViewIfNeeded();await select.click();await shot(theme+'-select');
    if(!baseline){await bounds('.app-select-menu');await page.keyboard.press('End');await page.keyboard.press('Escape');await expect(page.locator('.modal')).toBeVisible()}else await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');await expect(page.locator('.modal')).toHaveCount(0);
  }
  await resize(980,720);await goto(nested);
  const row=page.locator(`.sidebar [data-page-id="${nested.id}"]`).first(),label=row.locator('.sidebar-page-name');await row.scrollIntoViewIfNeeded();
  const before=await label.boundingBox();await row.hover();const after=await label.boundingBox();
  if(!baseline){assert.deepEqual(after,before,'hover must not move or truncate the label differently');await expect(row.locator('.tree-toggle')).toHaveCount(0);await noOverlap('.sidebar-page')}
  await shot('deep-tree');
  await api('page.update',{pageId:main.id,icon:imageUrl,cover:imageUrl});await page.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click();
  const home=page.locator('.recent-card').filter({hasText:main.title});if(!baseline){await expect(home.locator('.card-preview')).not.toHaveCSS('background-image','none');await expect.poll(()=>home.locator('img').evaluate(el=>el.naturalWidth)).toBeGreaterThan(0)}await shot('home-image-preview');
  await api('page.update',{pageId:main.id,icon:'data:image/png;base64,broken'});await goto(main);
  if(!baseline){await expect(page.locator('.page-large-icon .page-default-icon')).toHaveCount(1);await expect(page.locator('.page-large-icon img')).toHaveCount(0)}
  await shot('image-fallback');
  await api('page.update',{pageId:main.id,icon:'icon:BookOpen:blue',cover:'sage'});await goto(main);await page.locator('.page-cover').hover();await page.getByRole('button',{name:'更换封面',exact:true}).click();
  if(!baseline){await expect(page.locator('.cover-grid [aria-pressed="true"]')).toHaveCount(1);await expect(page.getByRole('button',{name:'鼠尾草',exact:true})).toHaveAttribute('aria-pressed','true')}
  await shot('selected-cover');await page.keyboard.press('Escape');
  await api('page.update',{pageId:leaf.id,title:'很长的标题需要在窗口缩放时完整换行，避免内容裁切与后续正文重叠 — Typography across sizes'});
  const long=await api('page.get',{pageId:leaf.id});await goto(long);
  for(const width of [1360,480,960]){
    await resize(width,600);
    if(!baseline)await expect.poll(()=>page.locator('.page-title').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    await shot('title-width-'+width);
  }
  for(const mode of ['side','center']){
    await api('page.open',{pageId:main.id,mode});await expect(page.locator('.peek-panel')).toBeVisible();
    if(!baseline)await bounds('.peek-panel');await shot('peek-'+mode);await api('ui.command',{command:'close-dialog'});
  }
  await resize(560,440);await api('ui.command',{command:'settings',params:{tab:'appearance'}});
  const shortSelect=page.locator('.modal .app-select-trigger').last();await shortSelect.scrollIntoViewIfNeeded();await shortSelect.click();
  if(!baseline)await bounds('.modal,.app-select-menu');if(!baseline){assert.ok(await page.locator('.modal').evaluate(el=>getComputedStyle(el).overflow==='hidden'));await expect(page.locator('.settings-tabs')).toHaveCSS('flex-direction','row')}await shot('short-window-select');await page.keyboard.press('Escape');await page.keyboard.press('Escape');

  await page.emulateMedia({reducedMotion:'reduce'});if(!baseline)assert.equal(await page.locator('.page-scroll').evaluate(el=>getComputedStyle(el).scrollBehavior),'auto');
  if (!baseline) await verifyColorThemes({ page, api, resize, shot, goto, main, db, views, bounds, noOverlap });
  assert.deepEqual(errors,[]);assert.equal((await api('fs.audit')).valid,true);
  pass('cover/icon fallback, stable leaf rows, overlays, keyboard dismissal, both themes and ten views');
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({accepted:true,baseline,checks,screens,errors,hover:{before,after}},null,2));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,screens,errors},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error}
finally{await app?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
