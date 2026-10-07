// Opt-in verification of the user's explicitly requested deliverable. Never creates test employees or note content.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium,expect} from '@playwright/test';
if(process.env.MININOTION_VERIFY_REAL_DELIVERY!=='1')throw Error('This reads the real installed deliverable; explicit MININOTION_VERIFY_REAL_DELIVERY=1 required');
const repo=path.resolve(import.meta.dirname,'../../..'),run=promisify(execFile);
const configFile=process.env.MININOTION_DELIVERY_CONFIG;
if(!configFile)throw Error('Provide an explicit local MININOTION_DELIVERY_CONFIG with rootId, employeeIds, startedAt and baselinePath');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
const rootId=String(config.rootId),employees=config.employeeIds,started=Number(config.startedAt);
assert.ok(rootId&&Array.isArray(employees)&&employees.length>=3&&Number.isFinite(started));
const out=path.join(repo,'.aexus/artifacts/mininotion-agent-delivery/live-verification');fs.mkdirSync(out,{recursive:true});
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[path.join(repo,'Infra/src/cli/agents'),...args,'--json'],{cwd:repo,timeout:35000,maxBuffer:20e6})).stdout);assert.ok(result.ok,result.error);return result.data};
const api=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params));
let status;
const deadline=Date.now()+15*60_000;
for(;;){
 status=await Promise.all(employees.map(async id=>(await cli('session','status','--employee',id))[0]));
 if(status.every(item=>!item.busy&&!item.waitingApproval))break;
 if(Date.now()>deadline)throw Error('Manager or analyst did not finish; not accepted');
 await new Promise(resolve=>setTimeout(resolve,5000));
}
for(const item of status){assert.ok(item.lastReply?.createdAt>started,`${item.title} has no new completion reply`);assert.ok(!item.error,item.error)}
const descriptor=await cli('plugin','describe','mininotion');assert.equal(descriptor.version??descriptor.plugin?.version,JSON.parse(fs.readFileSync(path.join(repo,'Infra/Plugins/mini-notion/package.json'),'utf8')).version);
const audit=await api('page.audit',{pageId:rootId});
assert.ok(audit.pageCount>=40);assert.ok(audit.maxDepth>=5);assert.deepEqual(audit.emptyLeafPages,[]);
const before=JSON.parse(fs.readFileSync(config.baselinePath,'utf8'));
for(const page of before.pages)assert.ok(audit.pages.some(item=>item.id===page.id),'Original page lost: '+page.id);
const previousIds=new Set(before.pages.map(item=>item.id));
const deep=audit.pages.filter(item=>!previousIds.has(item.id)&&item.depth>=4&&!item.database);
assert.ok(deep.length>=4);
const deepEvidence=[];
for(const page of deep){
 assert.ok(page.characters>=600,page.title+' has insufficient technical content');
 const content=await api('page.read-markdown',{pageId:page.id});
 assert.match(content.markdown,/src\/|PlugIns\//,'Missing source references');
 const location=await api('fs.path',{pageId:page.id});
 const disk=JSON.parse(fs.readFileSync(location.absolutePath,'utf8'));
 assert.equal(disk.page.id,page.id);assert.equal(disk.page.parentId,page.parentId);
 deepEvidence.push({...page,path:location.absolutePath});
}
const db=audit.databases.find(item=>item.recordCount>=10&&new Set(item.views.map(view=>view.type)).size>=5);assert.ok(db,'No populated multi-view database');
const projections=[];
for(const view of db.views){
 const result=await api('view.render',{databaseId:db.id,viewId:view.id});
 assert.ok(result.count>=10,view.name+' hides all records');
 if(view.type==='calendar'){
   assert.deepEqual(result.unscheduled,[], 'calendar has undated records');
   assert.equal(new Set(result.days.flatMap(day=>day.records)).size,db.recordCount);
 }
 if(view.type==='chart')assert.equal(result.series.reduce((sum,group)=>sum+Number(group.value),0),db.recordCount);
 projections.push({id:view.id,name:view.name,type:view.type,count:result.count,groups:result.groups?.length,series:result.series});
}
assert.deepEqual((await api('fs.sync')).errors,[]);
let browser,view;
const errors=[];
try{
 view=await cli('plugin','view','mininotion');
 browser=await chromium.launch({channel:process.env.AGENTS_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(view.url);try{await page.locator('.sidebar').waitFor()}catch(error){await page.screenshot({path:path.join(out,'startup-error.png')});fs.writeFileSync(path.join(out,'startup-error.json'),JSON.stringify({errors,body:await page.locator('body').innerText()},null,2));throw error}
 await expect.poll(async()=>(await api('status')).guiClients).toBeGreaterThan(0);
 await api('page.open',{pageId:rootId});
 await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(audit.pages[0].title);
 await expect(page.locator('.bn-editor').first()).toBeVisible();
 await page.screenshot({path:path.join(out,'main-page.png'),animations:'disabled'});
 await api('page.open',{pageId:deep.at(-1).id});
 await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(deep.at(-1).title);
 await expect(page.locator('.bn-editor').first()).toContainText('Infra/src/');
 await page.screenshot({path:path.join(out,'depth-five.png'),animations:'disabled'});
 const databaseIds=new Set(audit.databases.map(item=>item.id));
 const technicalPages=audit.pages.filter(item=>!item.database&&!databaseIds.has(item.parentId));
 for(const item of technicalPages){
   await api('page.open',{pageId:item.id});
   await expect(page.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(item.title);
   await expect(page.locator('.bn-editor').first()).toBeVisible();
   await expect(page.getByText('页面暂时无法显示',{exact:true})).toHaveCount(0);
 }
 await api('page.open',{pageId:db.id});
 const selectors={table:'table',board:'.board-view',gallery:'.gallery-view',list:'.database-list',calendar:'.calendar-view',chart:'.chart-view'};
 for(const entry of db.views){
  await api('view.select',{databaseId:db.id,viewId:entry.id});
  if(selectors[entry.type])await expect(page.locator('.database '+selectors[entry.type]).first()).toBeVisible();
  if(entry.type==='calendar'){
    const event=page.locator('.calendar-event').first();
    await event.scrollIntoViewIfNeeded();await expect(event).toBeVisible();
  }
  await page.screenshot({path:path.join(out,`view-${entry.type}-${entry.id.slice(0,6)}.png`),animations:'disabled'});
 }
 assert.deepEqual(errors,[]);
}finally{await browser?.close();if(view)await cli('plugin','close',view.id)}
const result={rootId,version:JSON.parse(fs.readFileSync(path.join(repo,'Infra/Plugins/mini-notion/package.json'),'utf8')).version,audit,deepEvidence,projections,workers:status.map(item=>({id:item.id,title:item.title,busy:item.busy,replyId:item.lastReply?.id,completedAt:item.lastReply?.createdAt})),rendererErrors:errors};
fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
await cli('plugin','open','mininotion');
for(let attempt=0;attempt<100;attempt++){
  if((await api('status')).guiClients>0)break;
  if(attempt===99)throw Error('Native plugin window did not finish registering');
  await new Promise(resolve=>setTimeout(resolve,100));
}
await api('page.open',{pageId:rootId});
console.log(JSON.stringify({accepted:true,rootId,pageCount:audit.pageCount,maxDepth:audit.maxDepth,characters:audit.totalCharacters,newDeepPages:deep.length,records:db.recordCount,viewTypes:[...new Set(db.views.map(view=>view.type))],views:db.views.length,workers:result.workers,screenshots:out},null,2));
