// Scheduled real Codex tool calls -> authorized MiniNotion API -> actual native renderer.
// All employee profiles, provider responses, pages and schedules are disposable fixtures.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-notion-'))),out=path.join(root,'.aexus/artifacts/plan-polish/notion')
fs.mkdirSync(out,{recursive:true})
const native=process.env.AGENTS_TEST_CODEX_BIN||path.join(os.homedir(),'.npm-global/bin/codex')
assert.ok(fs.existsSync(native),'A real Codex executable is required for this integration test')
let instructions=[],phase=0,requests=0,initializationRequests=0,initializing=true,fixtureError,worker,app
const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'"
const successfulTool=value=>{if(Array.isArray(value))return value.some(successfulTool);if(typeof value==='string'){try{return successfulTool(JSON.parse(value))}catch{return /"ok"\s*:\s*true/.test(value)}}return !!value&&typeof value==='object'&&(value.ok===true||successfulTool(value.output)||successfulTool(value.text))}
const provider=http.createServer(async(req,res)=>{
 try{
  let raw='';for await(const chunk of req)raw+=chunk
  if(!req.url?.endsWith('/responses')){res.writeHead(404).end();return}
  const body=JSON.parse(raw);requests++;assert.equal(body.model,'gpt-6-luna')
  let item
  if(initializing){
   const operation=['identity','index'][initializationRequests++]
   if(initializationRequests===3){assert.match(JSON.stringify(body),/API 文档索引/);assert.ok(worker&&JSON.stringify(body).includes(worker.id))}
   item=operation?{type:'custom_tool_call',id:'doc_'+requests,call_id:'doc_'+requests,name:'exec',input:'const doc=ALL_TOOLS.find(x=>x.name.includes("agents_company_documentation"));if(!doc)throw Error("Documentation tool missing");text(await tools[doc.name]('+JSON.stringify({operation})+'));'}:{type:'message',id:'init_'+requests,role:'assistant',content:[{type:'output_text',text:'OK'}]}
  }else{
  const command=instructions[Math.floor(phase/2)];assert.ok(command,'Unexpected model turn; fixture refuses additional work')
  const tools=[...(body.tools??[]),...(body.input??[]).filter(item=>item.type==='additional_tools').flatMap(item=>item.tools??[])],names=tools.flatMap(tool=>tool.type==='namespace'?tool.tools.map(item=>item.name):[tool.name])
  const params={cmd:command,workdir:worker.cwd,max_output_tokens:1200},tool=phase++%2===0
  item=tool?(names.includes('exec_command')?{type:'function_call',id:'fc_'+requests,call_id:'call_'+requests,name:'exec_command',arguments:JSON.stringify(params)}:{type:'custom_tool_call',id:'fc_'+requests,call_id:'call_'+requests,name:'exec',input:`const result=await tools.exec_command(${JSON.stringify(params)});text(result)`}):{type:'message',id:'msg_'+requests,role:'assistant',content:[{type:'output_text',text:'The requested MiniNotion content has been updated through my scoped CLI. Review its saved record and page.'}]}
  if(!tool){const output=(body.input??[]).filter(item=>['function_call_output','custom_tool_call_output'].includes(item.type)).at(-1)?.output;assert.ok(successfulTool(output),'The latest real tool must return a successful Core result before completion: '+JSON.stringify(output).slice(-3500))}
  }
  res.writeHead(200,{'content-type':'text/event-stream'})
  for(const event of [{type:'response.created',response:{id:'r'+requests,status:'in_progress'}},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r'+requests,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  res.end()
 }catch(error){fixtureError=error;res.writeHead(500).end('Local fixture assertion failed')}
})
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve))
const wrapper=path.join(temp,'codex-fixture')
fs.writeFileSync(wrapper,`#!/usr/bin/env node\nconst {spawn}=require('node:child_process');const extras=['-c','model_provider="plan_fixture"','-c','model_providers.plan_fixture.name="Plan fixture"','-c','model_providers.plan_fixture.base_url="http://127.0.0.1:${provider.address().port}"','-c','model_providers.plan_fixture.wire_api="responses"','-c','model_providers.plan_fixture.requires_openai_auth=false','-c','model_providers.plan_fixture.request_max_retries=0','-c','model_providers.plan_fixture.stream_max_retries=0','--disable','memories','--disable','apps','--disable','plugins'];const child=spawn(${JSON.stringify(native)},[...extras,...process.argv.slice(2)],{stdio:['pipe','pipe','pipe']});process.stdin.pipe(child.stdin);child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('exit',code=>process.exitCode=code??1);process.on('SIGTERM',()=>child.kill('SIGTERM'));\n`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1500',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:wrapper,CODEX_HOME:path.join(temp,'codex'),AGENTS_COMPANY_PLUGIN_DIRS:''}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL','OPENAI_API_KEY','OPENAI_BASE_URL','MINI_NOTION_WORKSPACE','MINI_NOTION_DATA_DIR','MINI_NOTION_SOCKET','AGENTS_COMPANY_PLUGIN_RPC'].includes(key))delete env[key]
fs.mkdirSync(env.CODEX_HOME,{recursive:true})
const checks=[],errors=[],pass=name=>{checks.push(name);console.log('PASS '+name)}
try{
 app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
 const main=await app.firstWindow();main.setDefaultTimeout(20000);main.on('pageerror',error=>errors.push(error.message));await main.locator('.infinite-canvas').waitFor()
 const call=(cmd,args={})=>main.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
 await call('group.add',{name:'Release Knowledge',mode:'work',pluginId:'mininotion'})
 const notion=(method,params={})=>call('plugin.call',{id:'mininotion',team:'Release Knowledge',method,params})
 const page=await notion('page.create',{title:'Release knowledge hub',color:'white'}),report=await notion('page.create',{title:'Weekly delivery review',parentId:page.id,color:'white'}),db=await notion('database.create',{title:'Scheduled quality checks',parentId:page.id,color:'blue',view:'table'})
 const location=await notion('fs.path',{pageId:page.id})
 worker=await call('card.create',{title:'Knowledge reporter',group:'Release Knowledge',engine:'codex',model:'gpt-6-luna',effort:'low',permissionMode:'bypassPermissions',directoryMode:'bind',cwd:location.absoluteDirectory})
 const invoke=(method,params)=>`agents plugin call mininotion ${method} --employee ${worker.id} --params ${shellQuote(JSON.stringify(params))} --json`
 const markdown='## Decision summary\n\n**Release candidate is ready for review.**\n\n| Area | Owner | Outcome |\n|---|---|---|\n| API compatibility | Product | Verified |\n| Repeat scheduling | Operations | Verified |\n| Native history | Quality | Preserved |\n\n## Next actions\n\n- [x] Check the release checklist\n- [x] Save the verification outcome\n- [ ] Obtain operator approval before deployment\n\n```json\n{"release":"candidate","decision":"awaiting approval"}\n```\n'
 const today=new Date().toLocaleDateString('en-CA')
 instructions=[invoke('page.write-markdown',{pageId:report.id,markdown}),...['First verification','Second verification'].map((title,index)=>invoke('record.create',{databaseId:db.id,title,color:'white',values:{status:index?'已完成':'进行中',date:today},blocks:[{type:'paragraph',content:'Written by a scheduled employee tool call; full execution details remain in the original conversation.'}]}))]
 await expect.poll(async()=>{if(fixtureError)throw fixtureError;const status=(await call('session.status',{employee:worker.id}))[0];if(status.initialization.status==='failed')throw Error(status.initialization.error);return status.initialization.status},{timeout:45000}).toBe('ready')
 assert.equal(initializationRequests,3);initializing=false
 assert.deepEqual((await call('session.transcript',{employee:worker.id})).items,[])
 const weekly=await call('schedule.create',{spec:{name:'Publish the Sunday review',action:{type:'agent',employeeId:worker.id,prompt:'Update the weekly delivery review in MiniNotion with a decision summary, evidence table and next actions.'},rule:{kind:'weekly',time:'17:00',days:[7],timezone:'Asia/Shanghai'},plan:{priority:'high',tags:['knowledge','weekly'],notes:'Use the actual scoped plugin API.'}}})
 const dates=(await call('schedule.preview',{id:weekly.id,count:3})).times
 for(const at of dates){const text=new Date(at).toLocaleString('en-US',{timeZone:'Asia/Shanghai',weekday:'long',hour:'2-digit',minute:'2-digit',hour12:false});assert.match(text,/Sunday/);assert.match(text,/17:00/)}
 await call('schedule.run',{id:weekly.id});await expect.poll(async()=>{if(fixtureError)throw fixtureError;return (await call('schedule.history',{id:weekly.id}))[0]?.status},{timeout:45000}).toBe('succeeded')
 assert.match((await notion('page.read-markdown',{pageId:report.id})).markdown,/API compatibility/);assert.equal((await call('schedule.get',{id:weekly.id})).nextAt,weekly.nextAt)
 const nativeThread=(await call('session.list')).sessions.find(card=>card.id===worker.id).threadId;assert.ok(nativeThread)
 pass('Weekly schedule preview is Sunday 17:00; real Codex CLI writes a structured MiniNotion review without consuming its next date')
 const repeat=await call('schedule.create',{spec:{name:'Two quality checks',action:{type:'agent',employeeId:worker.id,prompt:'Add the next quality-check record to the MiniNotion database.'},rule:{kind:'interval',everySeconds:8,anchor:new Date(Date.now()+1000).toISOString()},maxOccurrences:2,plan:{tags:['knowledge','bounded']}}})
 await expect.poll(async()=>{if(fixtureError)throw fixtureError;return (await call('schedule.history',{id:repeat.id})).filter(run=>run.status==='succeeded').length},{timeout:45000}).toBe(2)
 const finished=await call('schedule.get',{id:repeat.id});assert.equal(finished.nextAt,null);assert.equal(finished.occurrences,2);assert.equal((await notion('record.list',{databaseId:db.id})).length,2)
 assert.equal((await call('session.list')).sessions.find(card=>card.id===worker.id).threadId,nativeThread)
 pass('Two real scheduled repeats create two database records, stop at the quota and retain the original native conversation')
 for(const type of ['board','gallery','list','calendar'])await notion('view.create',{databaseId:db.id,type,name:type})
 const opened=app.waitForEvent('window');const win=await call('plugin.open',{id:'mininotion',team:'Release Knowledge'}),notionPage=await opened;notionPage.setDefaultTimeout(20000);notionPage.on('pageerror',error=>errors.push(error.message));await notionPage.locator('.sidebar').waitFor()
 await notion('page.open',{pageId:report.id});await expect(notionPage.locator('.bn-editor table')).toContainText('API compatibility');await expect(notionPage.locator('.bn-editor')).toContainText('Obtain operator approval');await notionPage.screenshot({path:path.join(out,'scheduled-weekly-review.png'),animations:'disabled'})
 await notion('page.open',{pageId:db.id})
 for(const view of await notion('view.list',{databaseId:db.id})){
  await notion('view.select',{databaseId:db.id,viewId:view.id});for(const title of ['First verification','Second verification']){const record=notionPage.locator('.database').getByText(title,{exact:true}).first();await record.scrollIntoViewIfNeeded();await expect(record).toBeVisible();await expect(record).toBeInViewport()}await notionPage.screenshot({path:path.join(out,'scheduled-database-'+view.type+'.png'),animations:'disabled'})
 }
 pass('The actual Notion renderer displays headings, evidence tables, checklists, code and the same records in Table/Board/Gallery/List/Calendar')
 assert.equal((await notion('fs.audit')).valid,true);await call('plugin.dismiss',{id:win.id})
 const reopen=app.waitForEvent('window');const again=await call('plugin.open',{id:'mininotion',team:'Release Knowledge'}),reopened=await reopen;await reopened.locator('.sidebar').waitFor();await notion('page.open',{pageId:report.id});await expect(reopened.locator('.bn-editor table')).toContainText('Preserved');await call('plugin.dismiss',{id:again.id})
 assert.equal((await notion('record.list',{databaseId:db.id})).length,2);assert.equal((await call('plan.query')).rows.find(row=>row.id===repeat.id).status,'completed');assert.equal(requests,9);assert.equal(phase,6);assert.deepEqual(errors,[])
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 pass('Closing/reopening Notion preserves physical documents and records; Plan status matches real execution history')
}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,requests,initializationRequests,rendererErrors:errors,fixtureError:fixtureError?.message,provider:'local deterministic HTTP fixture',productionData:false},null,2));await app?.close();await new Promise(resolve=>provider.close(resolve));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
