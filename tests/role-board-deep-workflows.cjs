// Exercises the installed embedded client through its real UI and authenticated Core.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{execFileSync}=require('node:child_process');
const {expect}=require('../AgentBoard/Aexus/node_modules/@playwright/test');
const {controlEndpoint}=require('../AgentBoard/Aexus/bin/platform.cjs');
module.exports=async function({page,client:initialClient,home,control,out,employee,until}){
 const report={passed:false,installedPackage:true,deterministicEngines:true,checks:[]};
 const folder=path.join(out,'deep-20261015');fs.mkdirSync(folder,{recursive:true});
 const pass=name=>{report.checks.push(name);fs.writeFileSync(path.join(folder,'workflows.json'),JSON.stringify(report,null,2));console.log('DEEP PASS '+name)};
 let client=initialClient;
 const call=(cmd,args={})=>client.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args});
 const hostCall=(method,params={})=>page.evaluate(async({method,params})=>{const r=await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}).then(r=>r.json());if(r.error)throw Error(r.error.message);return r.result},{method,params});
 const asAgent=(token,cmd,args)=>new Promise((resolve,reject)=>{const s=net.connect(controlEndpoint(path.join(home,'AgentBoard/Aexus')));let data='';s.setEncoding('utf8');s.on('error',reject);s.on('connect',()=>s.write(JSON.stringify({auth:token,cmd,args})+'\n'));s.on('data',x=>{data+=x;if(data.includes('\n')){s.end();resolve(JSON.parse(data.split('\n')[0]))}})});
 const ready=card=>until(async()=>(await call('session.status',{employee:card.id}))[0]?.initialization?.status==='ready');
 const idle=()=>until(async()=>(await call('session.status')).every(s=>!s.busy));
 const nav=async view=>{await page.locator('[data-role-view="'+view+'"]').click();await until(async()=>await page.locator('[data-role-view="'+view+'"]').getAttribute('aria-selected')==='true')};
 const resumeFrame=async()=>{await page.waitForFunction(()=>window.cloudHosts?.roleBoard?.ready,null,{timeout:45000});client=await (await page.locator('iframe.aexus-embed-frame').elementHandle()).contentFrame();await client.locator('.office-home').waitFor()};
 try{
  await call('settings.set',{language:'en'});
  await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))});
  await expect.poll(()=>client.evaluate(()=>document.documentElement.dataset.hostFocused)).toBe('false');
  await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))});
  await expect.poll(()=>client.evaluate(()=>document.documentElement.dataset.hostFocused)).toBe('true');
  await page.evaluate(()=>{delete document.hasFocus;window.dispatchEvent(new Event('focus'))});
  pass('Window focus and blur propagate into embedded read-receipt eligibility');
  const manager=await call('card.create',{title:'QA Manager',group:'Role QA',managementRole:'manager',engine:'codex',model:'gpt-6-luna'});
  const peer=await call('card.create',{title:'QA Peer',group:'Role QA',engine:'codex',model:'gpt-6-luna'});
  await ready(manager);await ready(peer);
  const originalCards=(await call('session.list')).sessions.map(c=>({id:c.id,group:c.group,cwd:c.cwd}));
  const workerToken=(await call('auth.agent-token',{id:employee.id})).token,managerToken=(await call('auth.agent-token',{id:manager.id})).token;
  await nav('company');const relation=await call('management.bind',{manager:manager.id,employee:employee.id});
  const line=client.locator('[data-manager="'+manager.id+'"][data-employee="'+employee.id+'"]').first();await expect(line).toBeVisible();
  await line.locator('.connector-segment-hit').first().focus();await page.keyboard.press('Enter');await expect(client.locator('.connector-editor')).toBeVisible();await client.getByRole('button',{name:'Close connection point settings',exact:true}).click();
  assert.equal((await asAgent(workerToken,'management.bind',{manager:manager.id,employee:peer.id})).ok,false);
  const held=path.join(control,employee.id+'.hold-user');fs.writeFileSync(held,'');
  assert.equal((await asAgent(managerToken,'session.send',{employee:employee.id,text:'ROLE_COLLABORATION_TASK'})).ok,true);
  await until(async()=>(await call('session.status',{employee:employee.id}))[0]?.busy);
  await expect(line).toHaveAttribute('data-active','true');await page.screenshot({path:path.join(folder,'company-active-cooperation.png')});
  fs.unlinkSync(held);await idle();await expect(line).toHaveAttribute('data-active','false');
  await call('management.unbind',{id:relation.relation.id});await expect(client.locator('[data-relation="'+relation.relation.id+'"]').first()).toHaveCount(0);
  await call('management.bind',{manager:manager.id,employee:employee.id});
  pass('Company relationship display, connector editor, active cooperation, unbind/rebind and unauthorized-role rejection');

  await nav('messages');await client.getByRole('button',{name:'New group',exact:true}).click();
  let editor=client.getByRole('dialog',{name:'New group',exact:true});await editor.locator('[name=chat-name]').fill('Role QA Circle');await editor.locator('[name=chat-team]').selectOption({label:'Role QA'});await editor.locator('[name=chat-owner]').selectOption(manager.id);await editor.getByRole('button',{name:'Create group',exact:true}).click();await expect(editor).toHaveCount(0);
  const group=(await call('chat.list')).find(g=>g.name==='Role QA Circle');assert.equal(group.memberIds.length,3);assert.equal(group.ownerId,manager.id);
  let composer=client.getByRole('textbox',{name:'Group message',exact:true});await expect(composer).toBeVisible();
  const history=()=>call('chat.history',{id:group.id}),settled=text=>until(async()=>{const m=(await history()).messages.find(m=>m.text===text);return m&&m.deliveries.every(d=>d.status==='completed'&&d.readAt)?m:false});
  await composer.fill('GROUP_BROADCAST_PROOF');await composer.press('Enter');let broadcast=await settled('GROUP_BROADCAST_PROOF');assert.equal(broadcast.broadcast,true);assert.equal(broadcast.deliveries.length,3);
  pass('Group created through UI, Team membership, Owner, broadcast delivery and actual read receipts');
  fs.writeFileSync(path.join(control,employee.id+'.work-post.json'),JSON.stringify({text:'GROUP_PUBLIC_REPLY_PROOF'}));
  await composer.fill('@Role QA');await client.getByRole('option',{name:/Role QA employee/}).click();await composer.fill('GROUP_TARGETED_WORK_PROOF');await composer.press('Enter');
  const targeted=await settled('GROUP_TARGETED_WORK_PROOF');assert.deepEqual(targeted.mentions,[employee.id]);assert.equal(targeted.deliveries.find(d=>d.employeeId===employee.id).mode,'work');assert.ok(targeted.deliveries.filter(d=>d.employeeId!==employee.id).every(d=>d.mode==='awareness'));
  const publication=await until(async()=>(await history()).messages.find(m=>m.text==='GROUP_PUBLIC_REPLY_PROOF'));
  const published=client.locator('[data-group-message="'+publication.id+'"]');await expect(published).toBeVisible();await published.hover();await published.getByRole('button',{name:'Reply to message',exact:true}).click();await composer.fill('GROUP_REPLY_THREAD_PROOF');await composer.press('Enter');const reply=await settled('GROUP_REPLY_THREAD_PROOF');assert.equal(reply.replyTo,publication.id);assert.equal(reply.deliveries.find(d=>d.employeeId===employee.id).mode,'work');await idle();fs.unlinkSync(path.join(control,employee.id+'.work-post.json'));
  pass('Mention routing, worker native publication, quoted reply targeting and private/shared conversation separation');

  await composer.fill('UNSENT_GROUP_DRAFT');await nav('plan');await nav('messages');await client.getByRole('button',{name:'Open group Role QA Circle',exact:true}).click();await expect(composer).toHaveValue('UNSENT_GROUP_DRAFT');
  await client.getByRole('button',{name:'Manage group',exact:true}).click();editor=client.getByRole('dialog',{name:'Edit group',exact:true});await editor.getByRole('button',{name:'Roles, moderation & notifications',exact:true}).click();
  const admin=client.getByRole('dialog',{name:'Conversation administration',exact:true});await admin.locator('[aria-label="Conversation role for QA Peer"]').selectOption('admin');await until(async()=>(await call('conversation.policy',{conversation:'group:'+group.id})).members.find(m=>m.id===peer.id).role==='admin');
  await admin.getByRole('button',{name:'Mute Role QA employee',exact:true}).click();await expect(admin.getByRole('button',{name:'Unmute Role QA employee',exact:true})).toBeEnabled();assert.equal((await asAgent(workerToken,'chat.post',{id:group.id,text:'MUTED_SHOULD_NOT_POST'})).ok,false);
  await admin.getByRole('button',{name:'Unmute Role QA employee',exact:true}).click();await expect(admin.getByRole('button',{name:'Mute Role QA employee',exact:true})).toBeEnabled();
  await admin.getByRole('button',{name:'Close conversation administration',exact:true}).click();await editor.locator('[name=chat-name]').fill('Role QA Renamed');await editor.locator('.group-member-options label').filter({hasText:'QA Peer'}).locator('input').uncheck();await editor.getByRole('button',{name:'Save group',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal((await call('chat.get',{id:group.id})).memberIds.includes(peer.id),false);
  await client.getByRole('button',{name:'Manage group',exact:true}).click();editor=client.getByRole('dialog',{name:'Edit group',exact:true});await editor.locator('.group-member-options label').filter({hasText:'QA Peer'}).locator('input').check();await editor.getByRole('button',{name:'Save group',exact:true}).click();await expect(editor).toHaveCount(0);assert.equal((await call('chat.get',{id:group.id})).memberIds.length,3);await expect(composer).toHaveValue('UNSENT_GROUP_DRAFT');
  pass('Group rename, remove/re-add member, role change, mute enforcement and preserved unsent draft');

  await nav('company');const unseen=await asAgent(workerToken,'chat.post',{id:group.id,text:'GROUP_UNREAD_PROOF'});assert.ok(unseen.ok,unseen.error);await until(async()=>(await call('chat.get',{id:group.id})).unread===true);
  await nav('messages');await client.getByRole('button',{name:'Open group Role QA Renamed',exact:true}).click();const latest=client.getByRole('button',{name:'Latest messages',exact:true});if(await latest.isVisible())await latest.click();await until(async()=>(await call('chat.get',{id:group.id})).unread===false);await expect(composer).toHaveValue('UNSENT_GROUP_DRAFT');await page.screenshot({path:path.join(folder,'messages-group.png')});await composer.fill('');
  pass('Company-hidden group remains unread; viewing Messages acknowledges it without losing drafts');

  await nav('plan');const job=(await call('schedule.list'))[0];await client.locator('[data-plan-id="'+job.id+'"]').first().click();let plan=client.locator('.plan-editor');await plan.getByRole('button',{name:'Run now',exact:true}).click();await plan.getByRole('button',{name:'Confirm run',exact:true}).click();await until(async()=>(await call('schedule.history',{id:job.id})).some(r=>r.status==='succeeded'));assert.equal((await call('schedule.get',{id:job.id})).enabled,false);
  await client.locator('[data-plan-id="'+job.id+'"]').first().click();plan=client.locator('.plan-editor');await plan.getByRole('button',{name:'Resume',exact:true}).click();await until(async()=>(await call('schedule.get',{id:job.id})).enabled===true);await client.locator('[data-plan-id="'+job.id+'"]').first().click();await client.locator('.plan-editor').getByRole('button',{name:'Pause',exact:true}).click();await until(async()=>(await call('schedule.get',{id:job.id})).enabled===false);await page.screenshot({path:path.join(folder,'plan-run-history.png')});
  pass('Plan manual run through original employee, successful history, pause/resume without duplicate recurring execution');

  await idle();await nav('messages');await client.getByRole('button',{name:'Open group Role QA Renamed',exact:true}).click();await until(async()=>(await history()).messages.every(m=>m.deliveries.every(d=>['completed','failed','interrupted'].includes(d.status))));const beforeHistory=(await history()).messages,beforeEdges=(await call('management.topology')).edges;
  await page.reload();await resumeFrame();await client.getByRole('button',{name:'Open group Role QA Renamed',exact:true}).click();assert.deepEqual((await history()).messages,beforeHistory);pass('Browser reload restores group and exact persisted history');
  const runtime=await hostCall('roleboard.runtime'),parent=JSON.parse(fs.readFileSync(path.join(home,'server.json')));assert.equal(Number(execFileSync('ps',['-p',String(runtime.pid),'-o','ppid='],{encoding:'utf8'}).trim()),parent.pid);process.kill(runtime.pid,'SIGTERM');await until(async()=>{const r=await hostCall('roleboard.runtime');return r.status==='ready'&&r.pid!==runtime.pid},45000);await page.reload();await resumeFrame();await client.getByRole('button',{name:'Open group Role QA Renamed',exact:true}).click();assert.deepEqual((await history()).messages,beforeHistory);assert.deepEqual((await call('management.topology')).edges,beforeEdges);assert.equal((await call('schedule.get',{id:job.id})).enabled,false);assert.equal((await call('schedule.history',{id:job.id})).filter(r=>r.status==='succeeded').length,1);
  pass('Owned Core restart preserves relationships, group history, paused schedule and one execution receipt without replay');
  await client.getByRole('button',{name:'Manage group',exact:true}).click();editor=client.getByRole('dialog',{name:'Edit group',exact:true});await editor.getByRole('button',{name:'Delete group',exact:true}).click();await editor.getByRole('button',{name:'Confirm removal',exact:true}).click();await expect(editor).toHaveCount(0);assert.ok(!(await call('chat.list')).some(g=>g.id===group.id));assert.deepEqual((await call('session.list')).sessions.map(c=>({id:c.id,group:c.group,cwd:c.cwd})),originalCards);assert.ok(fs.existsSync(path.join(employee.cwd,'native-reveal.txt')));
  pass('Deleting a group preserves employees, original workspaces and private conversation files');
  report.passed=true;fs.writeFileSync(path.join(folder,'workflows.json'),JSON.stringify(report,null,2));return report;
 }catch(e){await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});throw e}
};
