// Real Core restart + rendered Company/Messages/Plan readback, isolated state and native fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url')
const ROOT=path.resolve(__dirname,'../AgentBoard/Aexus'),{chromium,expect}=require(path.join(ROOT,'node_modules/@playwright/test'))
const OUT=path.resolve(__dirname,'../artifacts/claude-manager-20261015/business-restart.json')
;(async()=>{
 let f,browser,page
 const report={passed:false,evidenceKind:'isolated-source-Core-restart-and-UI-readback',providerCalls:0,checks:[]}
 try{
  const {fixtureCore}=await import(pathToFileURL(path.join(ROOT,'test/fixtures/headless-core.mjs')))
  const {freePort}=require('./role-auth-hosted-fixture.cjs'),port=await freePort()
  f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})
  const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
  await f.cli('group','add','Persistent Studio')
  const manager=await f.create('Persistent Manager','Persistent Studio','manager'),worker=await f.create('Persistent Worker','Persistent Studio')
  await f.cli('management','bind','--manager',manager.id,'--employee',worker.id)
  const chat=await rpc('chat.create',{name:'Persistent conversation',members:[manager.id,worker.id]})
  await rpc('chat.post',{id:chat.id,kind:'message',text:'Persisted without a second send',clientMessageId:'restart-once'})
  const job=await rpc('schedule.create',{spec:{name:'Persistent review',enabled:false,action:{type:'agent',employeeId:worker.id,prompt:'Future isolated fixture'},rule:{kind:'interval',everySeconds:3600}}})
  const snapshot=async()=>({teams:await rpc('group.list'),employees:(await rpc('session.list')).sessions.map(({id,title,group,cwd})=>({id,title,group,cwd})),relations:(await rpc('management.topology')).edges.map(({managerId,employeeId})=>({managerId,employeeId})),chat:await rpc('chat.get',{id:chat.id}),messages:(await rpc('chat.history',{id:chat.id})).messages.map(({id,text})=>({id,text})),job:await rpc('schedule.get',{id:job.id})})
  const before=await snapshot()
  await f.stop();await f.start()
  const after=await snapshot()
  for(const key of ['teams','employees','relations','messages'])assert.deepEqual(after[key],before[key],key+' survives a real Core process restart')
  for(const key of ['id','name','memberIds','ownerId'])assert.deepEqual(after.chat[key],before.chat[key])
  for(const key of ['id','name','action','rule','enabled','plan'])assert.deepEqual(after.job[key],before.job[key])
  report.checks.push('Team roots/employee identities/relationships/group membership/messages/Plan spec survive Core stop/start with no duplicate write')
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}})
  await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()
  await expect(page.locator('.infinite-canvas')).toContainText('Persistent Studio')
  await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group Persistent conversation',exact:true}).click();await expect(page.locator('.group-transcript')).toContainText('Persisted without a second send')
  await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toContainText('Persistent review');await page.reload();await expect(page.locator('.plan-view')).toContainText('Persistent review')
  report.checks.push('Restarted real UI reads Company, Group message and Plan; Plan remains after window reload')
  report.passed=true;report.coreEntry=process.env.AGENTS_COMPANY_TEST_CORE_ENTRY;report.records={employees:after.employees.length,relations:after.relations.length,messages:after.messages.length,plans:1};console.log('PASS business Core restart and Company/Messages/Plan rendered readback')
 }catch(error){report.error=error.stack;console.error(error);process.exitCode=1}
 finally{await browser?.close();await f?.close();fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n')}
})()
