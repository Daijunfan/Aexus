// Real hosted renderer, same declared authoring API; packaged-app override supported.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test');
const root=path.resolve(import.meta.dirname,'../../..'),run=promisify(execFile);
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-trash-ui-')));
const out=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'.aexus/artifacts/mininotion-recycle-repair/ui');
fs.mkdirSync(out,{recursive:true});
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_PLUGIN_DIRS:''};
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_BUILTIN_PLUGINS','MINI_NOTION_SOCKET','MINI_NOTION_WORKSPACE','MINI_NOTION_DATA_DIR'].includes(key))delete env[key];
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env});
let page=await app.firstWindow();page.setDefaultTimeout(25000);
const errors=[],checks=[];
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'Infra/src/cli/agents'),...args,'--json'],{env,cwd:root,timeout:30000,maxBuffer:16e6})).stdout);assert.ok(r.ok,r.error);return r.data};
const api=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params));
const pass=text=>{checks.push(text);console.log('PASS '+text)};
try{
 await page.locator('.infinite-canvas').waitFor();
 const nodes=[];for(const title of ['Page A','Page B','Page C','Page D'])nodes.push(await api('page.create',{title,color:'white',blocks:[{type:'paragraph',content:'Persistent body'}]}));
 const opened=app.waitForEvent('window');await cli('plugin','open','mininotion');page=await opened;page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.sidebar').waitFor();
 await page.evaluate(()=>document.fonts.ready);
 const select=async note=>{await page.locator(`[data-page-id="${note.id}"] .sidebar-page-name`).first().click();await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(note.title)};
 const remove=async note=>{await select(note);await page.getByRole('button',{name:'页面更多操作',exact:true}).click();await page.getByText('移到回收站',{exact:true}).click();await expect(page.locator(`[data-page-id="${note.id}"]`)).toHaveCount(0)};
 await remove(nodes[0]);
 await api('fs.write',{path:'external.txt',content:'force a real rescan between deletes'});
 await remove(nodes[1]);
 for(let i=0;i<5;i++){await api('fs.sync');for(const n of nodes.slice(0,2))await expect(page.locator(`[data-page-id="${n.id}"]`)).toHaveCount(0)}
 const state=await api('workspace.get');for(const n of nodes.slice(0,2))assert.ok(state.pages.find(p=>p.id===n.id).trashedAt);
 pass('two successive UI trash actions survive independent file changes and repeated CLI rescans');
 let fileLocationRequests=0,assistantListRequests=0;
 await page.route('**/rpc',async route=>{const data=route.request().postDataJSON();if(data.method==='assistant.list')assistantListRequests++;if(data.method==='fs.path'){fileLocationRequests++;await new Promise(resolve=>setTimeout(resolve,600))}await route.continue()});
 const samples=[];
 for(let iteration=0;iteration<6;iteration++){
   const note=nodes[2+iteration%2];
   await page.evaluate(id=>{
     window.__positions=[];window.__samplingUntil=performance.now()+650;
     const record=()=>{const p=document.querySelector(`[data-page="${id}"] textarea[aria-label="页面标题"]`);if(p)window.__positions.push(p.getBoundingClientRect().top);if(performance.now()<window.__samplingUntil)requestAnimationFrame(record)};
     requestAnimationFrame(record);
     document.querySelector(`[data-page-id="${id}"] .sidebar-page-name`).click();
   },note.id);
   await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(note.title);
   await page.waitForTimeout(700);
   const positions=await page.evaluate(()=>window.__positions);assert.ok(positions.length>10);
   assert.ok(Math.max(...positions)-Math.min(...positions)<1,JSON.stringify(positions));samples.push({id:note.id,frames:positions.length,shift:Math.max(...positions)-Math.min(...positions)});
 }
 assert.equal(fileLocationRequests,assistantListRequests,'Only the existing selection assistant may resolve its employee workspace during page navigation');
 assert.ok(fileLocationRequests<=6,'At most one workspace resolution per tested page switch; no body-banner or polling requests');
 await expect(page.locator('.page-scroll .folder-page-location')).toHaveCount(0);
 pass('six actual sidebar switches show less than one pixel of measured title shift, with no delayed folder banner');
 await api('fs.mkdir',{path:'Existing directory'});await api('fs.write',{path:'Existing directory/note.md',content:'# Original'});
 const directory=(await api('page.list')).find(p=>p.title==='Existing directory');await select(directory);
 await expect(page.getByRole('button',{name:'作为主页面编辑',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'页面标题',exact:true}).fill('Direct directory editing');
 await expect.poll(async()=>(await api('page.get',{pageId:directory.id})).title).toBe('Direct directory editing');
 const location=await api('fs.path',{pageId:directory.id});assert.equal(location.path,'Existing directory/index.mininotion.json');assert.equal((await api('fs.read',{path:'Existing directory/note.md'})).content,'# Original');
 await page.getByRole('button',{name:'页面更多操作',exact:true}).click();await page.locator('.folder-page-location summary').click();await expect(page.locator('.folder-page-location')).toContainText(location.absoluteDirectory);await page.keyboard.press('Escape');
 pass('ordinary directories edit directly as pages, preserve original files and expose paths only in the page menu');
 await page.screenshot({path:path.join(out,'stable-page.png'),animations:'disabled'});
 const win=(await cli('plugin','windows'))[0];await cli('plugin','dismiss',win.id);const reopened=app.waitForEvent('window');await cli('plugin','open','mininotion');page=await reopened;await page.locator('.sidebar').waitFor();
 for(const n of nodes.slice(0,2))await expect(page.locator(`[data-page-id="${n.id}"]`)).toHaveCount(0);
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
 pass('closing and reopening the native plugin window preserves trash without visible test windows or renderer exceptions');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,samples,errors},null,2));console.log(`PASS=${checks.length} FAIL=0`);
}catch(error){await page.screenshot({path:path.join(out,'error.png')}).catch(()=>{});throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
