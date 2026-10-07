// Native installed/candidate event UI. All schedules and pages belong to a disposable home.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test');
const root=path.resolve(import.meta.dirname,'../../..'),run=promisify(execFile),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'mn-events-ui-')));
const out=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'.aexus/artifacts/mininotion-event-ui/visual');fs.mkdirSync(out,{recursive:true});
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_PLUGIN_DIRS:process.env.MINI_NOTION_TEST_PLUGIN||''};
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_BUILTIN_PLUGINS','MINI_NOTION_SOCKET','MINI_NOTION_WORKSPACE','MINI_NOTION_DATA_DIR'].includes(key))delete env[key];
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,cwd:root,timeout:45000,maxBuffer:48e6})).stdout);assert.ok(r.ok,r.error);return r.data};
const api=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params));
const baseline=process.env.MININOTION_EVENT_BASELINE==='1',screens=[],checks=[],errors=[],metrics=[];
let app,page;const day='2030-04-08',zone='Asia/Shanghai';
const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});screens.push(name)};
const pass=name=>{checks.push(name);console.log('PASS '+name)};
async function contentFits(selector){
 const defects=await page.locator(selector).evaluateAll(nodes=>nodes.flatMap(node=>{
  if(!node.getClientRects().length)return [];
  const box=node.getBoundingClientRect();
  return [...node.querySelectorAll('.event-title,.event-time')].flatMap(el=>{const r=el.getBoundingClientRect();return r.width<28||r.height<11||r.left<box.left-1||r.right>box.right+1||r.bottom>box.bottom+1||r.top<box.top-1?[{text:el.textContent,width:r.width,height:r.height,bottom:r.bottom-box.bottom}]:[]});
 }));assert.deepEqual(defects,[],selector+' clipped event information');
}
async function noCollisions(){
 const collisions=await page.locator('.hourly-slots').evaluateAll(days=>days.flatMap(day=>{
  const boxes=[...day.querySelectorAll('.hourly-event')].map(el=>({id:el.dataset.recordId,r:el.getBoundingClientRect()}));
  return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1).map(b=>[a.id,b.id]));
 }));assert.deepEqual(collisions,[],'optical event collisions');
}
try{
 app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[process.env.AGENTS_COMPANY_PROFILE_APPLICATION||root],env});
 await(await app.firstWindow()).locator('.infinite-canvas').waitFor();
 const home=await api('page.create',{title:'研发工作室',icon:'icon:CalendarDays:blue',color:'white'});
 const db=await api('database.create',{title:'研发日程 · Engineering',parentId:home.id,color:'white',icon:'icon:CalendarRange:blue',columns:[
  {id:'date',name:'安排时间',type:'date'},{id:'status',name:'状态',type:'select',options:['未开始','进行中','已完成']},{id:'owner',name:'负责人',type:'text'},
 ]});
 const record=async(title,start='',end='',extra={})=>api('record.create',{databaseId:db.id,title,color:'green',values:{date:start?{start,...(end?{end}:{}),...(start.includes('T')?{timeZone:zone}:{})}:'',status:'未开始',owner:'产品与工程团队'},...extra});
 const short=await record('五分钟站会 · 必须可读',day+'T09:00',day+'T09:05');
 const adjacent=await record('紧接着的代码检查',day+'T09:06',day+'T09:11');
 await record('重叠架构评审',day+'T09:00',day+'T10:00');
 await record('重叠设计评审',day+'T09:15',day+'T09:45');
 const point=await record('只有开始时间',day+'T10:30');
 const late=await record('午夜前两分钟',day+'T23:58',day+'T23:59');
 const overnight=await record('跨午夜部署',day+'T23:45','2030-04-09T00:15');
 const range=await record('跨周发布窗口','2030-04-07','2030-04-10');
 await record('完成的验收',day+'T13:00',day+'T14:00',{values:{date:{start:day+'T13:00',end:day+'T14:00',timeZone:zone},status:'已完成',owner:'验收团队'}});
 await record('尚未安排日期');
 for(let i=0;i<10;i++)await record(`全天 ${i+1} · 资料整理`,day);
 await record('很长的标题也需要可读，支持中文、English、标点与 🧑🏽‍💻 表情，不覆盖时间和状态',day+'T15:00',day+'T16:00');
 const template=await api('template.create',{databaseId:db.id,title:'周技术例会',color:'blue',values:{owner:'技术团队',status:'未开始'}});
 await api('repeat.configure',{templateId:template.id,rule:{enabled:true,frequency:'weekly',interval:1,weekdays:[1,3],startDate:day,time:'08:30',timeZone:zone,dateProperty:'date',includeTime:true,durationMinutes:20,catchUp:'latest',titlePattern:'循环评审 {date}'}});
 const reminder=await api('reminder.add',{pageId:short.id,changes:{text:'站会资料提醒',at:day+'T08:55',timeZone:zone,enabled:true}});
 const generated=await api('scheduler.run',{at:day+'T09:00:00+08:00'});
 assert.equal(generated.runs.length,1,'one real scheduler occurrence in the isolated service');
 const recurring=await api('page.get',{pageId:generated.runs[0].pageId});
 await api('repeat.pause',{templateId:template.id});
 await api('repeat.run',{templateId:template.id,at:day+'T14:30:00+08:00'});
 await api('reminder.snooze',{pageId:short.id,reminderId:reminder.id,until:day+'T12:45:00+08:00'});
 const delivered=await api('reminder.add',{pageId:adjacent.id,changes:{text:'评审资料已到期，请检查代码',at:day+'T08:56',timeZone:zone,enabled:true}});
 await api('scheduler.run',{at:day+'T09:00:00+08:00'});
 const viewNames=['table','calendar','board','gallery','list','timeline','feed','chart','plan','form'],views={};
 const viewLabels={table:'表格',calendar:'日历',board:'看板',gallery:'画廊',list:'列表',timeline:'时间线',feed:'动态',chart:'图表',plan:'计划',form:'表单'};
 for(const type of viewNames){const existing=(await api('view.list',{databaseId:db.id})).find(v=>v.type===type);views[type]=existing||await api('view.create',{databaseId:db.id,type,name:viewLabels[type]});
  await api('view.update',{databaseId:db.id,viewId:views[type].id,changes:{calendarBy:'date',dateAnchor:day,planDoneBy:'status',planDoneValue:'已完成',timeZone:zone,chartGroup:'status'}})}
 await api('settings.set',{changes:{appearance:{palette:'aurora',wallpaper:'none'}}});
 const pending=app.waitForEvent('window');await cli('plugin','open','mininotion');page=await pending;page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.locator('.sidebar').waitFor();await expect.poll(async()=>(await api('status')).guiClients).toBeGreaterThan(0);
 const window=await app.browserWindow(page);
 const resize=async(w,h=920)=>{await window.evaluate((win,{w,h})=>win.setContentSize(w,h),{w,h});await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(w)};
 const select=async(type,changes={})=>{if(Object.keys(changes).length)await api('view.update',{databaseId:db.id,viewId:views[type].id,changes});await api('page.open',{pageId:db.id,viewId:views[type].id});await expect(page.locator(`.view-tabs [data-view-id="${views[type].id}"]`)).toHaveClass(/active/);await expect(page.locator('.save-status')).toContainText('已保存到本机')};
 for(const theme of ['light','dark'])for(const width of [1440,600]){
  await api('settings.set',{theme});await resize(width);
  await select('calendar',{calendarMode:'month'});await page.locator(`[data-date="${day}"]`).first().scrollIntoViewIfNeeded();await shot(`${theme}-${width}-month`);
  if(!baseline){await contentFits('.calendar-event:not(.overflow-event)');const geometry=await page.locator('.calendar-grid').evaluate(el=>({width:el.getBoundingClientRect().width,minWidth:getComputedStyle(el).minWidth,scrollWidth:el.scrollWidth}));metrics.push({theme,viewport:width,calendar:geometry});assert.ok(geometry.width>=980,JSON.stringify(geometry));}
  await api('ui.command',{command:'calendar-day',params:{pageId:db.id,date:day}});await expect(page.locator('.calendar-day-panel')).toBeVisible();
  if(!baseline){await expect(page.locator('.calendar-day-panel')).toContainText('循环');await expect(page.locator('.calendar-day-item').filter({hasText:short.title})).toContainText('09:05');assert.ok(await page.locator('.calendar-day-item').count()>=15)}
  await shot(`${theme}-${width}-day-details`);await page.keyboard.press('Escape');
  if(!baseline){await select('calendar',{calendarMode:'week'});await contentFits('.calendar-event:not(.overflow-event)');await expect(page.locator('.calendar-week-row')).toHaveCount(1);await shot(`${theme}-${width}-week-calendar`);}
  await select('plan',{planMode:'hourDay',planShowBacklog:false});await page.locator('.hourly-scroll').scrollIntoViewIfNeeded();
  const target=page.locator(`.hourly-event[data-record-id="${short.id}"]`);
  await expect(target).toBeVisible();
  metrics.push({theme,width,shortHeight:(await target.boundingBox()).height,allDayHeight:(await page.locator('.hourly-all-day').first().boundingBox()).height});
  if(!baseline){assert.ok((await target.boundingBox()).height>=56);await contentFits('.hourly-event,.hourly-all-day-event');await noCollisions();await expect(target).toContainText('09:00–09:05');await expect(page.locator(`.hourly-event[data-record-id="${point.id}"]`)).toContainText('未设结束');}
  await shot(`${theme}-${width}-hour-day`);
  if(!baseline){await page.locator('.hourly-more').first().click();await expect(page.locator('.event-detail-list .event-summary')).toHaveCount(11);await shot(`${theme}-${width}-all-day-overflow`);await page.keyboard.press('Escape')}
  await select('plan',{planMode:'hourWeek'});await page.locator('.hourly-scroll').scrollIntoViewIfNeeded();
  if(!baseline){await noCollisions();await contentFits('.hourly-event,.hourly-all-day-event');await expect(page.locator(`.hourly-event[data-record-id="${overnight.id}"]`)).toHaveCount(2)}
  await shot(`${theme}-${width}-hour-week`);
  await select('timeline',{timelineScale:'month'});await page.locator('.timeline-scroll').scrollIntoViewIfNeeded();
  if(!baseline){const summary=page.locator(`[data-timeline-id="${short.id}"] .event-summary`);await expect(summary).toContainText('五分钟站会');await expect(summary).toContainText('09:00–09:05');assert.ok((await summary.boundingBox()).width>=180)}
  await shot(`${theme}-${width}-timeline`);
 }
 if(baseline){fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({baseline:true,metrics,screens,errors},null,2));console.log(JSON.stringify({baseline:true,metrics}));}
 else{
  pass('month/day/hour grids keep readable titles, exact times, origin markers and collision-free minimum card geometry in both themes and widths');
  await resize(1440);for(const type of ['table','board','gallery','list','feed','chart','form']){await select(type);await page.locator('.database').scrollIntoViewIfNeeded();if(['table','board','gallery','list','feed'].includes(type))await expect(page.locator('.database')).toContainText('循环');await shot(`view-${type}`)}
  for(const mode of ['day','week','agenda']){await select('plan',{planMode:mode});await page.locator('.plan-view').scrollIntoViewIfNeeded();await expect(page.locator('.plan-view')).toContainText('循环');await shot('plan-'+mode)}
  for(const scale of ['week','quarter','year']){await select('timeline',{timelineScale:scale});await expect(page.locator(`[data-timeline-id="${short.id}"] .event-summary`)).toContainText('09:00–09:05');await shot('timeline-'+scale)}
  await select('plan',{planMode:'hourDay'});const target=page.locator(`.hourly-event[data-record-id="${short.id}"]`);await target.scrollIntoViewIfNeeded();await target.focus();await target.press('Alt+ArrowDown');
  await expect.poll(async()=>String((await api('page.get',{pageId:short.id})).values.date.start)).toContain('09:15');
  const changed=(await api('page.get',{pageId:short.id})).values.date;assert.ok(changed.end.includes('09:20'),'visual minimum does not change five-minute duration');
  await target.press('Enter');await expect(page.locator('.peek-panel .page-title')).toHaveValue(short.title);await api('ui.command',{command:'close-dialog'});
  const transfer=await page.evaluateHandle(()=>new DataTransfer());
  const targetBox=await target.boundingBox();await target.dispatchEvent('dragstart',{dataTransfer:transfer,clientY:targetBox.y+45});
  assert.equal(await transfer.evaluate(value=>value.getData('application/x-mini-time-offset')),'0','short-card padding is not a real 45-minute grab offset');
  await target.dispatchEvent('dragend',{dataTransfer:transfer});await transfer.dispose();
  const handle=target.locator('.hourly-resize');await handle.scrollIntoViewIfNeeded();const handleBox=await handle.boundingBox();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+3);await page.mouse.down();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+30,{steps:5});await page.mouse.up();
  await expect.poll(async()=>(await api('page.get',{pageId:short.id})).values.date.end).toContain('09:50');
  assert.ok((await api('page.get',{pageId:short.id})).values.date.start.includes('09:15'));
  await shot('resized-event');
  await select('timeline');await api('page.update',{pageId:short.id,locked:true});
  const bar=page.locator(`[data-timeline-id="${short.id}"]`);await expect(bar.locator('.timeline-resize')).toHaveCount(0);
  await bar.locator('.event-summary').click();await expect(page.locator('.peek-panel .page-title')).toHaveValue(short.title);
  await api('ui.command',{command:'close-dialog'});await api('page.update',{pageId:short.id,locked:false});
  pass('event opening, locked timeline labels, drag offsets, native pointer resizing and keyboard rescheduling keep displayed and stored times aligned');
  await api('ui.command',{command:'home'});for(const view of ['agenda','calendar','board','table','timeline']){
   await api('overview.configure',{changes:{view,date:day,hideCompleted:false,scope:'all'}});await page.locator('.overview').scrollIntoViewIfNeeded();
   if(view==='calendar'){
     await contentFits('.overview-item');await page.locator('.overview-more').first().click();
     await expect(page.locator('.event-detail-list')).toContainText('循环');await expect(page.locator('.event-detail-list')).toContainText('12:45');
     await shot('overview-calendar-overflow');await page.keyboard.press('Escape');
   }else await expect(page.locator('.overview')).toContainText('循环');await shot('overview-'+view);
  }
  const summary=await api('overview.render',{date:day,hideCompleted:false});const reminderItem=summary.items.find(item=>item.id===reminder.id);assert.equal(reminderItem.time,'12:45');assert.equal(reminderItem.status,'稍后提醒');
  pass('overview agenda/calendar/board/table/timeline share event identity and the backend snoozed reminder time');
  for(const width of [1440,560]){await resize(width,780);await api('ui.command',{command:'scheduler'});await expect(page.locator('.scheduler-dialog')).toBeVisible();await expect(page.locator(`[data-repeat-id="${template.id}"]`)).toContainText('已暂停');await shot('scheduler-repeat-'+width);
   await page.locator('.schedule-tabs').getByRole('button',{name:'提醒',exact:true}).click();await expect(page.locator('.schedule-list')).toContainText('12:45');await expect(page.locator('.schedule-list')).toContainText('稍后提醒');await expect(page.locator('.schedule-list')).toContainText('已提醒');await shot('scheduler-reminders-'+width);
   await page.locator('.schedule-tabs').getByRole('button',{name:'运行记录',exact:true}).click();await expect(page.locator('.schedule-list')).toContainText('已生成');await shot('scheduler-history-'+width);await page.keyboard.press('Escape');
   await api('ui.command',{command:'repeat',params:{pageId:template.id}});await expect(page.locator('.repeat-preview')).toContainText('尚未生成');await shot('repeat-preview-'+width);await page.keyboard.press('Escape');
   await api('ui.command',{command:'inbox'});await expect(page.locator('.inbox-dialog .inbox-item')).toHaveCount(1);await expect(page.locator('.inbox-item-content')).toContainText('评审资料已到期，请检查代码');await expect(page.locator('.inbox-item-content')).toContainText('到期提醒');await shot('inbox-'+width);await page.keyboard.press('Escape');
  }
  pass('recurring rules, future previews, instance history and reminder notifications are differentiated in wide and narrow dialogs');
  const savedSchedule=(await api('page.get',{pageId:short.id})).values.date;
  await api('record.schedule',{pageId:short.id,date:'2020-04-08T09:00',end:'2020-04-08T09:05',timeZone:zone});
  await resize(1440,920);await select('plan',{planMode:'hourDay',dateAnchor:'2020-04-08'});
  const overdue=page.locator(`.hourly-event[data-record-id="${short.id}"]`);await overdue.scrollIntoViewIfNeeded();
  await expect(overdue.locator('.event-state')).toContainText('逾期');await expect(overdue.locator('.event-state')).toHaveClass(/tone-warning/);await expect(overdue).toContainText('09:00–09:05');await shot('overdue-event');
  await api('record.schedule',{pageId:short.id,date:savedSchedule.start,end:savedSchedule.end,timeZone:zone});
  pass('overdue state is visible as text and an icon while the exact event time is retained');
  await page.emulateMedia({reducedMotion:'reduce'});await resize(1100,820);await select('calendar');
  await window.evaluate(win=>win.webContents.setZoomFactor(2));
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(550);
  let zoomGeometry;
  await expect.poll(async()=>{
    zoomGeometry=await page.evaluate(()=>({viewport:innerWidth,sidebar:document.querySelector('.sidebar').getBoundingClientRect().width,main:document.querySelector('.main-pane').getBoundingClientRect().width}));
    return zoomGeometry.sidebar/zoomGeometry.viewport;
  }).toBeLessThanOrEqual(.4);
  assert.ok(zoomGeometry.main>=300,JSON.stringify(zoomGeometry));metrics.push({zoom:2,...zoomGeometry});
  await page.locator('.calendar-grid').scrollIntoViewIfNeeded();await page.locator('.calendar-event').first().scrollIntoViewIfNeeded();
  await expect(page.locator('.calendar-event .event-title').first()).toBeInViewport();
  await contentFits('.calendar-event:not(.overflow-event)');
  // Electron zoom changes device scale; native capture avoids CDP's cropped screenshot.
  const capture=await window.evaluate(async win=>Array.from((await win.webContents.capturePage()).toPNG()));
  fs.writeFileSync(path.join(out,'zoom-200-calendar.png'),Buffer.from(capture));screens.push('zoom-200-calendar');
  await window.evaluate(win=>win.webContents.setZoomFactor(1));assert.deepEqual(errors,[]);assert.equal((await api('fs.audit')).valid,true);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({accepted:true,checks,screens,metrics,errors,generated:recurring.id,records:(await api('record.list',{databaseId:db.id})).length},null,2));
 }
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:String(error),checks,screens,metrics,errors},null,2));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error}
finally{await app?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
