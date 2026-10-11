'use strict';
// Real local documents, isolated data and actual browser/native input. No model calls.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const exec = require('node:util').promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname,'..'), host = path.resolve(root,'../..');
const pluginRoot = process.env.LIBRARY_PLUGIN_ROOT || path.join(root,'dist-plugin');
const { chromium, _electron, expect } = require(process.env.PLAYWRIGHT_MODULE || path.join(host,'node_modules/@playwright/test'));
async function hash(file) { const h=createHash('sha256');for await(const part of fsSync.createReadStream(file))h.update(part);return h.digest('hex'); }
async function main() {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'margin-library-ui-'));
  const artifact=path.join(root,'artifacts','library-'+new Date().toISOString().replace(/[:.]/g,'-'));
  await fs.mkdir(artifact,{recursive:true});
  const native=process.env.LIBRARY_NATIVE==='1', report={status:'running',native,version:JSON.parse(await fs.readFile(path.join(pluginRoot,'package.json'))).version,checks:[],errors:[]};
  const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
  let server,browser,app,page,workspace,api;
  const source=path.join(root,'workspaces/default/AI Systems Performance Engineering.pdf');
  const sourceHash=await hash(source);
  try {
    if(native) {
      const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'home'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_PLUGIN_DIRS:pluginRoot,AGENTS_COMPANY_HIDDEN:'1'};
      for(const k of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'])delete env[k];
      app=await _electron.launch({executablePath:'/Applications/Agents Company.app/Contents/MacOS/Agents Company',args:[],env});await app.firstWindow();
      const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(host,'bin/agents'),...args,'--json'],{env,timeout:60000,maxBuffer:16*1024*1024})).stdout);assert(r.ok,r.error);return r.data;};
      api=(method,params={})=>cli('plugin','call','margin-reader',method,'--params',JSON.stringify(params));
      workspace=(await api('system.info')).workspace;
      const opened=app.waitForEvent('window');await cli('plugin','open','margin-reader');page=await opened;
    } else {
      workspace=path.join(temp,'library');await fs.mkdir(workspace);
      server=await require(path.join(pluginRoot,'lib/server.cjs')).startServer({workspace,pluginRoot});
      api=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:1,method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
      try { browser=await chromium.launch({headless:true}); } catch(e) {
        const cache=path.join(os.homedir(),'Library/Caches/ms-playwright');
        const executablePath=fsSync.readdirSync(cache).filter(n=>n.startsWith('chromium_headless_shell-')).sort().reverse().map(n=>path.join(cache,n,'chrome-headless-shell-mac-arm64/chrome-headless-shell')).find(p=>fsSync.existsSync(p));
        if(!executablePath)throw e;browser=await chromium.launch({headless:true,executablePath});
      }
      page=await browser.newPage();await page.goto(server.url);
    }
    page.on('pageerror',error=>report.errors.push(error.message));page.setDefaultTimeout(30000);await page.setViewportSize({width:1440,height:960});
    await page.waitForSelector('body[data-ready="true"]');
    await fs.copyFile(source,path.join(workspace,'AI Systems Performance Engineering.pdf'));
    await fs.copyFile(path.join(root,'workspaces/default/Prompt Engineering.html'),path.join(workspace,'Prompt Engineering.html'));
    const chinese=fsSync.readdirSync(path.join(root,'workspaces/default')).find(n=>n.startsWith('Flex')&&n.endsWith('.html'));
    assert(chinese);await fs.copyFile(path.join(root,'workspaces/default',chinese),path.join(workspace,chinese));
    await api('fs.mkdir',{path:'研究资料/子文件夹'});await api('fs.mkdir',{path:'收藏文章'});
    await api('fs.write',{path:'待整理.md',content:'# 可移动的文件\n\n整理、移动、恢复。'});
    await page.click('#refresh-files');
    const card=name=>page.locator('#files .file-card').filter({has:page.locator('.file-name').filter({hasText:name})});
    const exactCard=name=>page.locator('#files .file-card[data-path='+JSON.stringify(name)+']');
    const previewReady=async name=>{const c=exactCard(name);await expect(c).toHaveAttribute('data-preview','ready');await expect.poll(()=>c.locator('.document-thumbnail').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);};
    await previewReady('AI Systems Performance Engineering.pdf');await previewReady('Prompt Engineering.html');await previewReady(chinese);
    assert.equal((await api('settings.get')).lastDocument,null);
    pass('Real 1061-page PDF cover and both saved HTML thumbnails render without opening a document');
    const thumb=await api('document.preview',{path:'AI Systems Performance Engineering.pdf'});assert.equal(thumb.pageCount,1061);report.pdf={bytes:(await fs.stat(source)).size,pages:thumb.pageCount,sha256:sourceHash};
    await expect(page.locator('#folder-back')).toHaveCount(0);
    await expect(page.locator('#files > :first-child')).toHaveClass(/file-card/);
    pass('Root library has no back card or reserved blank slot');
    await page.screenshot({path:path.join(artifact,'grid-covers.png')});
    const entries=await page.locator('#files .file-card').count();assert.equal(await page.locator('#files .file-card > .file-more').count(),entries);
    await exactCard('待整理.md').locator('.file-more').click();await expect(page.locator('.file-context-menu')).toBeVisible();await expect(page.locator('#reader-view')).toBeHidden();
    await page.keyboard.press('Escape');await expect(page.locator('.file-context-menu')).toHaveCount(0);await expect(exactCard('待整理.md').locator('.file-more')).toBeFocused();
    pass('Every grid card exposes an accessible menu; clicking it does not open the document and Escape restores focus');
    await exactCard('待整理.md').locator('.file-more').click();await page.locator('.file-context-menu [data-action=rename]').click();
    await page.fill('#dialog [name=name]','已重命名.md');await page.click('#dialog-submit');await expect(page.locator('#dialog')).not.toBeVisible();
    await expect(exactCard('已重命名.md')).toBeVisible();assert(fsSync.existsSync(path.join(workspace,'已重命名.md')));
    pass('Grid three-dot rename changes the actual file through the public Core');
    await exactCard('研究资料').locator('.file-open').click();await expect(page.locator('#folder-title')).toHaveText('研究资料');
    await exactCard('研究资料/子文件夹').locator('.file-open').click();await expect(page.locator('#folder-title')).toHaveText('子文件夹');
    assert.equal(await page.locator('#files > :first-child').getAttribute('id'),'folder-back');await page.click('#folder-back');await expect(page.locator('#folder-title')).toHaveText('研究资料');
    await page.click('#folder-back');await expect(page.locator('#folder-title')).toHaveText('我的文库');
    pass('The single-click back card returns exactly one folder level and works in an empty folder');
    const row=page.locator('#file-tree .tree-row[data-path="已重命名.md"]');
    const measure=await row.evaluate(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el).fontSize),icon:el.querySelector(':scope > svg').getBoundingClientRect().width}));
    assert(measure.height>=36&&measure.font>=13&&measure.icon>=20);report.explorer=measure;
    await row.locator('.file-more').click();await expect(page.locator('.file-context-menu')).toBeVisible();await expect(page.locator('#reader-view')).toBeHidden();await page.keyboard.press('Escape');
    pass('Explorer rows and icons are enlarged and have their own right-aligned menu');
    await page.click('#list-view');await expect(page.locator('#files')).toHaveClass(/list/);
    for(const c of await page.locator('#files .file-card').all()) {const box=await c.boundingBox(),more=await c.locator('.file-more').boundingBox();assert(box.x+box.width-(more.x+more.width)<18);}
    await page.screenshot({path:path.join(artifact,'list-menus.png')});
    pass('Compact list menus occupy the far-right column on every row');
    await exactCard('已重命名.md').locator('.file-more').click();await page.locator('.file-context-menu [data-action=copy]').click();
    await page.selectOption('#dialog [name=folder]','收藏文章');await page.fill('#dialog [name=name]','副本.md');await page.click('#dialog-submit');await expect(page.locator('#dialog')).not.toBeVisible();
    assert(fsSync.existsSync(path.join(workspace,'收藏文章/副本.md')));
    await exactCard('已重命名.md').locator('.file-more').click();await page.locator('.file-context-menu [data-action=move]').click();
    await page.selectOption('#dialog [name=folder]','收藏文章');await page.click('#dialog-submit');await expect(page.locator('#dialog')).not.toBeVisible();
    assert(fsSync.existsSync(path.join(workspace,'收藏文章/已重命名.md')));
    pass('Compact menu copy and move use the selected file and destination');
    await page.click('#grid-view');await exactCard('收藏文章').locator('.file-open').click();
    await expect(page.locator('#folder-title')).toHaveText('收藏文章');
    await exactCard('收藏文章/副本.md').locator('.file-more').click();await page.locator('.file-context-menu [data-action=trash]').click();await page.click('#dialog-submit');await expect(page.locator('#dialog')).not.toBeVisible();
    assert(!fsSync.existsSync(path.join(workspace,'收藏文章/副本.md')));const trash=(await api('fs.trash.list')).items.find(x=>x.path==='收藏文章/副本.md');assert(trash);
    await api('fs.restore',{trashId:trash.id});assert(fsSync.existsSync(path.join(workspace,'收藏文章/副本.md')));await page.click('#folder-back');
    pass('Three-dot delete is recoverable trash, with successful restoration');
    await api('fs.write',{path:'拖放测试.md',content:'# 拖入后保持原样'});await page.click('#refresh-files');await expect(exactCard('拖放测试.md')).toBeVisible();
    const start=await exactCard('拖放测试.md').locator('.file-name').boundingBox(),target=await exactCard('研究资料').boundingBox();
    await page.mouse.move(start.x+15,start.y+8);await page.mouse.down();await page.mouse.move(start.x+25,start.y+15,{steps:4});
    await page.mouse.move(target.x+target.width/2,target.y+80,{steps:12});
    await expect(exactCard('研究资料')).toHaveClass(/drop-target/);await expect(page.locator('#file-drop-status')).toContainText('松开移动到');
    assert(fsSync.existsSync(path.join(workspace,'拖放测试.md')));await page.screenshot({path:path.join(artifact,'drag-before-release.png')});
    await page.mouse.up();await expect.poll(()=>fsSync.existsSync(path.join(workspace,'研究资料/拖放测试.md'))).toBe(true);
    await expect(page.locator('#file-drop-status')).toBeHidden();assert(!fsSync.existsSync(path.join(workspace,'拖放测试.md')));
    pass('Real pointer drag highlights the folder BEFORE release, then moves the file and clears feedback');
    await page.evaluate(()=>{
      const data=new DataTransfer();data.items.add(new File(['# Finder 导入测试\n\n原件保留'],'外部导入.md',{type:'text/markdown'}));
      const target=document.querySelector('#files .file-card[data-path="收藏文章"]');
      target.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
      target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));
      window.externalDropFixture=data;
    });
    await expect(exactCard('收藏文章')).toHaveClass(/drop-target/);await expect(page.locator('#file-drop-status')).toContainText('松开导入到');
    await exactCard('收藏文章').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(()=>window.externalDropFixture)});
    await expect.poll(()=>fsSync.existsSync(path.join(workspace,'收藏文章/外部导入.md'))).toBe(true);assert(!fsSync.existsSync(path.join(workspace,'外部导入.md')));
    pass('External-file drop fixture imports into the highlighted folder, never the unrelated current directory');
    await expect(page.locator('#file-drop-status')).toBeHidden();
    await expect(page.locator('#reader-view')).toBeHidden();await expect(page.locator('#folder-title')).toHaveText('我的文库');
    pass('Importing onto a folder does not unexpectedly open the document or change the current folder');
    await page.evaluate(()=>{
      const source=document.querySelector('#files .file-card[data-path="研究资料"]');
      const target=document.querySelector('#file-tree .tree-row[data-path="研究资料/子文件夹"]');
      const data=new DataTransfer();
      source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));
      target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));
      window.invalidDropFixture=data;
    });
    await expect(page.locator('#file-tree .tree-row[data-path="研究资料/子文件夹"]')).toHaveClass(/drop-rejected/);
    await expect(page.locator('#file-drop-status')).toContainText('不能移入自身或子文件夹');
    await page.evaluate(()=>{
      const target=document.querySelector('#file-tree .tree-row[data-path="研究资料/子文件夹"]');
      target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.invalidDropFixture}));
      document.dispatchEvent(new DragEvent('dragend',{bubbles:true}));
    });
    assert(fsSync.existsSync(path.join(workspace,'研究资料/子文件夹')));await expect(page.locator('#file-drop-status')).toBeHidden();
    pass('Invalid self/descendant drops show a red rejection state and leave the folder intact');
    for(let i=0;i<30;i++)await fs.writeFile(path.join(workspace,`研究资料/浏览记录-${i}.log`),'navigation test');
    await page.click('#refresh-files');await exactCard('研究资料').locator('.file-open').click();
    await expect(page.locator('#folder-title')).toHaveText('研究资料');
    await expect(page.locator('#files .file-card')).toHaveCount((await api('fs.list',{path:'研究资料'})).entries.length);
    const back=await page.locator('#folder-back').boundingBox(),fileBox=await page.locator('#files .file-card').first().boundingBox();
    assert(Math.abs(back.width-fileBox.width)<1&&Math.abs(back.height-fileBox.height)<1);
    await page.locator('#files').evaluate(el=>el.scrollTop=el.scrollHeight);
    const pinned=await page.locator('#folder-back').boundingBox(),library=await page.locator('#files').boundingBox();
    assert(pinned.y>=library.y-2&&pinned.y<=library.y+4);
    pass('Back stays pinned in the upper-left while the document grid scrolls');
    await page.click('#folder-back');await expect(page.locator('#folder-back')).toHaveCount(0);
    await page.locator('#files').evaluate(el=>el.scrollTop=0);await page.setViewportSize({width:1000,height:800});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.click('#theme');await expect(page.locator('body')).toHaveAttribute('data-theme','dark');await page.screenshot({path:path.join(artifact,'dark-library.png')});
    pass('Library remains usable at narrow sizes and in dark theme');
    assert.equal(await hash(source),sourceHash);assert.equal(await hash(path.join(workspace,'AI Systems Performance Engineering.pdf')),sourceHash);
    assert.deepEqual(report.errors,[]);if(native)assert(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
    pass('Original book unchanged; no uncaught browser errors; native verification windows stay hidden');report.status='passed';
  } catch(error) {report.status='failed';report.error={message:error.message,stack:error.stack};if(page&&!page.isClosed())await page.screenshot({path:path.join(artifact,'failure.png')}).catch(()=>{});throw error;}
  finally {report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(artifact,'result.json'),JSON.stringify(report,null,2));console.log('LIBRARY REPORT '+path.join(artifact,'result.json'));await browser?.close();await app?.close();await server?.close();await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
