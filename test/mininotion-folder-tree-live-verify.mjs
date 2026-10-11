// Opt-in verification of an explicitly authorized real Team, never run by CI.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect} from '@playwright/test';
if(process.env.MININOTION_VERIFY_REAL_TREE!=='1'||!process.env.MININOTION_TREE_CONFIG)throw Error('Requires explicit live-test authorization and local configuration');
const repo=path.resolve(import.meta.dirname,'..'),run=promisify(execFile);
const setup=JSON.parse(fs.readFileSync(process.env.MININOTION_TREE_CONFIG,'utf8'));
const out=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(repo,'artifacts/mininotion-folder-tree/live-verification');fs.mkdirSync(out,{recursive:true});
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[path.join(repo,'bin/agents'),...args,'--json'],{cwd:repo,timeout:30000,maxBuffer:32e6})).stdout);assert.ok(result.ok,result.error);return result.data};
const api=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params));
const workers=[];
for(const worker of setup.workers){
 const current=(await cli('session','status','--employee',worker.id))[0];
 assert.equal(current.busy,false);assert.equal(current.waitingApproval,false);assert.ok(current.lastReply?.createdAt>=setup.startedAt,'employee has not completed this task');
 const transcript=await cli('session','transcript',worker.id);
 const tools=transcript.items.flatMap(item=>item.blocks||[]).filter(block=>block.kind==='tool');
 assert.ok(tools.some(tool=>!tool.running&&!tool.isError&&JSON.stringify(tool).includes('mininotion')),'no successful real employee CLI invocation');
 workers.push({id:worker.id,title:worker.title,cwd:worker.cwd,completedAt:current.lastReply.createdAt,successfulTools:tools.filter(tool=>!tool.running&&!tool.isError).length,failedTools:tools.filter(tool=>tool.isError).length});
}
assert.equal((await api('status')).version,setup.pluginVersion);
const audit=await api('fs.audit');assert.equal(audit.valid,true,JSON.stringify(audit.errors));
assert.equal(audit.root,setup.workspace);assert.equal(audit.pages.filter(page=>page.mainPage).length,1);
const native=[];
for(const item of audit.pages){
 assert.equal(path.basename(item.absolutePath),'index.mininotion.json');
 const document=JSON.parse(fs.readFileSync(item.absolutePath,'utf8'));assert.equal(document.page.id,item.pageId);
 assert.equal(item.depth,path.relative(setup.workspace,item.absoluteDirectory).split(path.sep).length);
 const parent=audit.pages.find(page=>page.pageId===item.parentPageId);
 assert.equal(path.dirname(item.absoluteDirectory),parent?.absoluteDirectory||setup.workspace);
 native.push(item.absoluteDirectory);
}
const directories=[];
function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true}))if(entry.isDirectory()&&!entry.name.startsWith('.')){const next=path.join(directory,entry.name);directories.push(next);walk(next)}}
walk(setup.workspace);assert.deepEqual(directories.sort(),native.sort(),'visible folder tree differs from page tree');
const pageAudit=await api('page.audit',{pageId:setup.rootId});assert.equal(pageAudit.maxDepth,4);assert.equal(pageAudit.pageCount,9);assert.deepEqual(pageAudit.emptyLeafPages,[]);
const leaf=audit.pages.find(page=>page.title==='写作规范');assert.ok(leaf);
const database=pageAudit.databases.find(db=>db.title==='测试任务');assert.ok(database);assert.equal(database.recordCount,3);
assert.deepEqual(database.views.map(view=>view.type).sort(),['board','list','table']);
for(const view of database.views)assert.equal((await api('view.render',{databaseId:database.id,viewId:view.id})).count,3);
let browser,view;const errors=[];
try{
 view=await cli('plugin','view','mininotion');browser=await chromium.launch({channel:process.env.AGENTS_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(view.url);await page.locator('.sidebar').waitFor();await expect.poll(async()=>(await api('status')).guiClients).toBeGreaterThan(0);
 await api('page.open',{pageId:leaf.pageId});await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue('写作规范');await expect(page.locator('.bn-editor')).toBeVisible();
 for(const title of ['目录结构验收','文档区','入门说明','写作规范'])await expect(page.locator('.sidebar').getByRole('treeitem',{name:title,exact:true})).toBeVisible();
 await page.screenshot({path:path.join(out,'four-level-page-tree.png'),animations:'disabled'});
 await api('page.open',{pageId:database.id});
 for(const item of database.views){
  await api('view.select',{databaseId:database.id,viewId:item.id});
  await expect(page.locator('.database')).toContainText('设计');await expect(page.locator('.database')).toContainText('开发');await expect(page.locator('.database')).toContainText('验收');
  await page.screenshot({path:path.join(out,`database-${item.type}.png`),animations:'disabled'});
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();if(view)await cli('plugin','close',view.id)}
const result={accepted:true,version:setup.pluginVersion,workers,audit,pageAudit,rendererErrors:errors};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
await cli('plugin','open','mininotion');await expect.poll(async()=>(await api('status')).guiClients,{timeout:20000}).toBeGreaterThan(0);await api('page.open',{pageId:setup.rootId});
console.log(JSON.stringify({accepted:true,version:setup.pluginVersion,pages:audit.pageCount,depth:pageAudit.maxDepth,records:database.recordCount,viewTypes:database.views.map(view=>view.type),workers,rendererErrors:errors},null,2));
