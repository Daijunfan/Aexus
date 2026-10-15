// Real CloudHosts + bundled Aexus, isolated stores, original browser UI.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('../AgentBoard/Aexus/node_modules/playwright');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-role-board-'));
const out=path.join(__dirname,'../artifacts/role-board-acceptance');
fs.mkdirSync(out,{recursive:true});
const control=path.join(home,'fixture');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');
fs.writeFileSync(path.join(home,'agents.json'),JSON.stringify([{id:'native-isolated-fixture',name:'Native session',engine:'codex',kind:'agent',engineHostId:'local',targetHostId:'local',transport:'native',cwd:home,permission:'ask',threadId:'fixture-unopened'}]));
const backend=process.env.CLOUD_HOSTS_TEST_BACKEND||path.resolve(__dirname,'..');
const child=spawn(process.env.CLOUD_HOSTS_TEST_NODE||process.execPath,['cli.cjs','serve'],{cwd:backend,env:{...process.env,CLOUD_HOSTS_HOME:home,
 AGENTS_COMPANY_PROJECTS:path.join(home,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(home,'work'),
 CODEX_BIN:path.join(__dirname,'../AgentBoard/Aexus/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(home,'codex'),AC_INIT_FIXTURE:control},stdio:['ignore','pipe','pipe']});
let browser,page,logs='',stderr='';
child.stdout.on('data',chunk=>{logs+=chunk});child.stderr.on('data',chunk=>{stderr+=chunk});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=30000){const end=Date.now()+timeout;do{const result=await fn();if(result)return result;await delay(100)}while(Date.now()<end);throw Error('Timed out: '+stderr.slice(-600))}
(async()=>{
 try{
  const state=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(home,'server.json'),'utf8'))}catch{return null}});
  browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[],nativeRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('/rpc')){try{nativeRequests.push(JSON.parse(request.postData()).method)}catch{}}});
  await page.goto(state.url);
  await page.locator('#add:not([disabled])').waitFor();
  await page.locator('#agent-board-mode').click();
  await page.locator('[data-session="native-isolated-fixture"]').waitFor();
  assert.equal(await page.locator('[data-hub], [data-role-view], iframe, [data-aexus-agent], #agent-create-aexus').count(),0);
  assert(!nativeRequests.some(method=>/^(agentboard|roleboard)\./.test(method)),'Native Agent Board does not query Role Board');
  await page.screenshot({path:path.join(out,'agent-board.png')});
  const original=await page.evaluate(async()=>{const r=await fetch('./rpc',{method:'POST',body:JSON.stringify({id:1,method:'hosts.agent-list'})});return (await r.json()).result});
  assert.equal(original.length,1);assert.equal(original[0].running,false);
  await page.locator('#role-board-mode').click();
  await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready,{},{timeout:45000});
  const frame=await page.locator('iframe.aexus-embed-frame').elementHandle();
  const client=await frame.contentFrame();
  await client.locator('.infinite-canvas').waitFor();
  const call=(cmd,args={})=>client.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args});
  assert.equal((await call('system.info')).features.plugins,false,'Hosted Core excludes bundled plugin products');
  const nativeEffects=[];let pickerPath=home;
  await page.route('**/rpc',async interception=>{
    let request;try{request=JSON.parse(interception.request().postData())}catch{}
    if(request?.method==='roleboard.native'&&['folder.pick','file.reveal'].includes(request.params?.capability)){
      nativeEffects.push(request.params);
      await interception.fulfill({contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:request.id,result:request.params.capability==='folder.pick'?{path:pickerPath}:{ok:true}})});return;
    }
    await interception.continue();
  });
  assert.equal((await call('workspace.choose',{path:home})).path,home);
  assert.equal(nativeEffects.at(-1).payload.path,home,'Native picker keeps the existing default directory');
  pickerPath=null;assert.equal((await call('workspace.choose',{path:home})).path,null,'Native picker cancellation is preserved');

  await call('group.add',{name:'Role QA'});
  assert.deepEqual(await call('plugin.list'),[]);
  const employee=await call('card.create',{title:'Role QA employee',group:'Role QA',engine:'codex',model:'gpt-6-luna'});

  await until(async()=>{const status=await call('session.status',{employee:employee.id});return status[0]?.initialization?.status==='ready'});
  await call('workspace.write',{employee:employee.id,path:'native-reveal.txt',content:'Native reveal fixture'});
  const revealed=await call('workspace.reveal',{from:{employee:employee.id,path:'native-reveal.txt'}});
  assert.equal(revealed.revealed,true);
  assert.equal(nativeEffects.at(-1).capability,'file.reveal');assert.equal(nativeEffects.at(-1).payload.path,revealed.path);

  fs.writeFileSync(path.join(control,employee.id+'.reply.txt'),'ROLE_BOARD_NATIVE_FIXTURE');
  await call('view.open',{kind:'messages',employee:employee.id});
  await client.locator('.composer textarea').fill('Verify this original employee conversation.');
  await client.locator('.composer textarea').press('Enter');
  await client.getByText('ROLE_BOARD_NATIVE_FIXTURE',{exact:true}).first().waitFor();
  await until(async()=>!(await call('session.status',{employee:employee.id}))[0].busy);
  await call('view.select',{id:'company'});
  const identity=await page.evaluate(()=>({instance:window.cloudHosts.roleBoard.instanceId,client:window.cloudHosts.roleBoard.clientId}));
  await page.screenshot({path:path.join(out,'role-company.png')});
  for(const view of ['messages','plan','company','plan']){
   await page.locator('[data-role-view="'+view+'"]').click();
   await page.waitForFunction(view=>window.cloudHosts.roleBoard.trace.some(row=>row.event==='received'&&row.type==='navigation.change'&&row.view===view),view);
   assert.equal(await page.locator('iframe').count(),1);
   assert.deepEqual(await page.evaluate(()=>({instance:window.cloudHosts.roleBoard.instanceId,client:window.cloudHosts.roleBoard.clientId})),identity);
   if(view==='plan')await client.locator('.plan-view').waitFor();
   await page.screenshot({path:path.join(out,'role-'+view+'.png')});
  }
  await client.locator('.plan-new').click();
  const editor=client.locator('.plan-editor');
  await editor.locator('[name=plan-name]').fill('Role QA paused schedule');
  await editor.locator('[name=plan-employee]').selectOption(employee.id);
  await editor.locator('[name=plan-prompt]').fill('Review the project when enabled by its owner.');
  await editor.locator('[name=plan-mode]').selectOption('weekly');
  await editor.locator('[name=plan-time]').fill('17:00');
  await editor.locator('[name=plan-timezone]').fill('Asia/Shanghai');
  await editor.locator('[name=plan-enabled]').uncheck();
  await editor.getByRole('button',{name:'Create schedule',exact:true}).click();
  await editor.waitFor({state:'detached'});
  const jobs=await call('schedule.list');
  assert.equal(jobs.length,1);assert.equal(jobs[0].enabled,false);assert.equal(jobs[0].action.employeeId,employee.id);
  assert.equal(jobs[0].rule.kind,'weekly');assert.equal(jobs[0].rule.timezone,'Asia/Shanghai');
  await page.screenshot({path:path.join(out,'role-plan.png')});
  await page.locator('#agent-board-mode').click();
  await page.locator('[data-session="native-isolated-fixture"]').waitFor();
  assert.equal(await page.locator('iframe,[data-role-view]').count(),0);
  await page.locator('#role-board-mode').click();
  await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready);
  await (await (await page.locator('iframe').elementHandle()).contentFrame()).locator('.plan-view').waitFor();
  assert.equal(await page.locator('[data-role-view="plan"][aria-selected="true"]').count(),1);
  await page.locator('#single-mode').click();
  await page.locator('[data-view="roles"]').click();
  await page.locator('[data-role-id="'+employee.id+'"]').waitFor();
  assert.equal(await page.locator('[data-session],iframe').count(),0,'Single Host Roles contains no native Agent sessions');
  const beforeRoleRefresh=nativeRequests.length;
  await page.locator('[data-role-refresh]').click();
  await page.locator('[data-role-refresh]:not([disabled])').waitFor();
  assert(nativeRequests.slice(beforeRoleRefresh).includes('roleboard.roster'));
  assert(!nativeRequests.slice(beforeRoleRefresh).some(method=>method.startsWith('hosts.agent-')),'Role refresh never queries native Agents');
  await page.screenshot({path:path.join(out,'single-host-roles.png')});
  await page.locator('[data-view="agents"]').click();
  await page.locator('[data-session="native-isolated-fixture"]').waitFor();
  assert.equal(await page.locator('[data-role-id],iframe').count(),0,'Single Host Agents contains no Roles');
  await page.locator('[data-view="roles"]').click();
  await page.locator('[data-open-role="'+employee.id+'"]').click();
  await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready);
  const roleClient=await (await page.locator('iframe').elementHandle()).contentFrame();
  await roleClient.getByText('ROLE_BOARD_NATIVE_FIXTURE',{exact:true}).first().waitFor();
  assert.equal((await roleClient.evaluate(()=>window.agents.call('view.get'))).employee,employee.id);
  const afterRoleOpen=await page.evaluate(async()=>{const r=await fetch('./rpc',{method:'POST',body:JSON.stringify({id:2,method:'hosts.agent-list'})});return (await r.json()).result});
  assert.deepEqual(afterRoleOpen.map(role=>role.id),original.map(role=>role.id));
  assert.deepEqual(errors,[]);
  if(process.env.CLOUD_HOSTS_ROLE_DEEP==='1')await require('./role-board-deep-workflows.cjs')({page,client:roleClient,home,control,out,employee,until});
  console.log('Toolbar',JSON.stringify(await page.locator('.mode-switch button').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,active:n.classList.contains('active'),width:n.clientWidth,scroll:n.scrollWidth})))));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,packaged:!!process.env.CLOUD_HOSTS_TEST_BACKEND,nativeSessionUnchanged:true,originalAexusViews:['company','messages','plan'],employeeCreated:true,messageReply:true,pausedScheduleCreated:true,pluginProductsAbsent:true,singleClientAcrossTabs:true,restoredRoleTab:'plan',singleHostRolesIndependent:true,exactRoleConversation:true,errors},null,2));
  for(const name of ['failure.txt','failure.png'])fs.rmSync(path.join(out,name),{force:true});
  console.log('PASS: independent native Agent Board, original Aexus Company/Messages/Plan, one client, tab persistence, no browser errors.');
 }catch(error){
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(out,'failure.txt'),error.stack+'\n'+stderr);
  throw error;
 }finally{
  await Promise.race([browser?.close(),delay(5000)]);child.kill('SIGTERM');
  await until(()=>child.exitCode!==null||child.signalCode,8000).catch(()=>child.kill('SIGKILL'));
  fs.rmSync(home,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
