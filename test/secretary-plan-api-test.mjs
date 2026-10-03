// Real source-built Core/CLI and native MCP protocol; disposable state, no model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-secretary-api-'))),out=process.env.AGENTS_SECRETARY_TEST_OUT||path.join(root,'artifacts/secretary-plan-api'),checks=[]
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
try{
 const entry=path.join(temp,'daemon.cjs');await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 const base=fs.readFileSync(path.join(root,'test/fixtures/initialization-codex.cjs'),'utf8'),marker='async function readWorkDocument(text){';assert.equal(base.split(marker).length,2)
 const hook=`
 const apiFile=path.join(control,employee+'.core-api.json');if(fs.existsSync(apiFile)){
  const operation=JSON.parse(fs.readFileSync(apiFile,'utf8'));
  const call=async(command,args={})=>{const response=await nativeTool('agents_company_api',{command,args});if(response.result?.isError)throw Error(response.result.content[0].text);const envelope=JSON.parse(response.result.content[0].text);if(!envelope.ok)throw Error(envelope.error);return envelope.data};
  try{let value;if(operation.workflow==='delete-orphans'){
   const rows=[];for(let offset=0;;offset++){const result=await call('plan.query',{filter:{search:'Detached fixture'},offset,limit:1});rows.push(...result.rows);if(!result.hasMore)break;}
   if(rows.length!==3||rows.some(row=>row.target.exists))throw Error('Expected exactly three detached records');
   const deleted=await call('schedule.delete',{ids:rows.map(row=>row.id),expectedRevisions:Object.fromEntries(rows.map(row=>[row.id,row.revision??0]))});
   value={found:rows.map(row=>({id:row.id,target:row.target,timing:row.timing})),deleted,remaining:(await call('plan.query',{filter:{search:'Detached fixture'}})).total};
  }else value=await call(operation.command,operation.args);note('core-api-result',{ok:true,value});}catch(error){note('core-api-result',{ok:false,error:error.message})}return;
 }
 `
 const fixture=path.join(temp,'core-api-codex.cjs');fs.writeFileSync(fixture,base.replace(marker,marker+hook),{mode:0o755});f=await fixtureCore({CODEX_BIN:fixture},entry)
 const rpc=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.ok(r.ok,cmd+': '+r.error);return r.data},deny=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.equal(r.ok,false,cmd+' must reject');return r.error},idle=id=>f.until(async()=>!(await f.status(id)).busy,'idle')
 await rpc('group.add',{name:'Secretary desk'});await rpc('group.add',{name:'Second team'})
 const secretary=await f.create('Secretary','Secretary desk','secretary'),peer=await f.create('Peer Secretary','Secretary desk','secretary'),worker=await f.create('Worker','Secretary desk'),manager=await f.create('Manager','Secretary desk','manager'),governor=await f.create('Governor','Second team','governor'),tokens={s:await f.token(secretary.id),w:await f.token(worker.id),m:await f.token(manager.id),g:await f.token(governor.id)}
 const spec=(person,name='Existing plan')=>({name,enabled:false,action:{type:'agent',employeeId:person.id,prompt:'TEST ONLY',...(person.managementRole==='governor'?{viewId:'all'}:{})},rule:{kind:'weekly',days:[1,3,5],time:'09:30',timezone:'Asia/Shanghai'},plan:{priority:'high',tags:['fixture'],notes:'Unchanged context',durationMinutes:30}})
 const regular=await rpc('schedule.create',{spec:spec(worker)}),peerJob=await rpc('schedule.create',{spec:spec(peer,'Peer private plan')}),detached=[]
 for(let i=0;i<3;i++){const removed=await f.create('Removed '+i,'Secretary desk'),job=await rpc('schedule.create',{spec:spec(removed,'Detached fixture '+i)});if(i===0){await rpc('schedule.run',{id:job.id});await f.until(async()=>(await rpc('schedule.history',{id:job.id}))[0]?.status==='succeeded','retained run')}await rpc('card.remove',{id:removed.id});detached.push(job)}
 const ui=await rpc('plan.query'),agent=await rpc('plan.query',{},tokens.s);assert.equal(agent.total,ui.total);assert.deepEqual(agent.rows.map(row=>row.id),ui.rows.map(row=>row.id));assert.ok(agent.now&&agent.hostTimezone)
 const row=agent.rows.find(row=>row.id===regular.id);assert.equal(row.employee.role,'employee');assert.equal(row.employee.team,'Secretary desk');assert.equal(row.timing.timezone,'Asia/Shanghai');assert.equal(row.action.employeeId,worker.id);assert.ok(row.allowedActions.includes('schedule.update'))
 for(const job of detached){const found=agent.rows.find(row=>row.id===job.id);assert.equal(found.employee,null);assert.equal(found.target.id,job.action.employeeId);assert.equal(found.target.exists,false);assert.equal(found.target.role,null);assert.equal(found.disabledReason,'employee_removed');assert.ok(found.allowedActions.includes('schedule.delete'));assert.ok(found.blockedActions['schedule.run']);assert.ok(found.rule.time)}
 assert.equal((await rpc('schedule.list',{},tokens.s)).length,ui.total);assert.equal((await rpc('plan.query',{filter:{search:regular.id}},tokens.s)).total,1)
 assert.equal((await rpc('schedule.get',{id:peerJob.id},tokens.s)).id,peerJob.id);for(const method of ['update','delete','pause','resume','run'])await deny('schedule.'+method,{id:peerJob.id,...(method==='update'?{patch:{name:'No'}}:{})},tokens.s)
 assert.ok((await rpc('plan.query',{},tokens.w)).rows.every(row=>!detached.some(job=>job.id===row.id)));assert.equal((await rpc('schedule.history',{id:detached[0].id},tokens.s)).length,1)
 checks.push('Secretary sees the same complete Plan IDs as the user, including all three removed-target records; rows expose role/Team/engine/rules/time/revisions/capabilities without inventing missing identities; execution rank boundaries remain')
 const first=await rpc('schedule.get',{id:detached[0].id},tokens.s),edited=await rpc('schedule.update',{id:first.id,expectedRevision:first.revision,patch:{name:'Detached fixture renamed',plan:{priority:'urgent',tags:['cleanup'],notes:'Retain audit'}}},tokens.s);assert.equal(edited.enabled,false);assert.equal(edited.disabledReason,'employee_removed')
 await deny('schedule.resume',{id:first.id},tokens.s);await deny('schedule.run',{id:first.id},tokens.s)
 const ids=detached.map(job=>job.id),before=JSON.stringify(await rpc('schedule.list'))
 await deny('schedule.delete',{ids:[...ids,'missing']},tokens.s);assert.equal(JSON.stringify(await rpc('schedule.list')),before)
 await deny('schedule.delete',{ids:[...ids,peerJob.id]},tokens.s);assert.equal(JSON.stringify(await rpc('schedule.list')),before)
 await deny('schedule.delete',{ids,expectedRevisions:Object.fromEntries(ids.map(id=>[id,0]))},tokens.s);assert.equal(JSON.stringify(await rpc('schedule.list')),before)
 await deny('schedule.delete',{ids,id:ids[0]},tokens.s);await deny('schedule.delete',{ids:[ids[0],ids[0]]},tokens.s)
 const readonlyPath=path.join(f.env.AGENTS_COMPANY_HOME,'schedules.json'),beforeRestart=JSON.parse(fs.readFileSync(readonlyPath)).jobs.filter(job=>ids.includes(job.id));await f.stop();await f.start();assert.deepEqual(JSON.parse(fs.readFileSync(readonlyPath)).jobs.filter(job=>ids.includes(job.id)),beforeRestart)
 checks.push('Orphan metadata can be maintained while execution stays blocked; whole-batch invalid/stale/forbidden targets reject before side effects; restart preserves IDs/revisions and employee_removed reason')
 const view=await rpc('plan.view-create',{spec:{name:'User view',layout:'board',filter:{},options:{timezone:'Asia/Shanghai'}}});assert.ok((await rpc('plan.views',{},tokens.s)).some(v=>v.id===view.id));const changed=await rpc('plan.view-update',{id:view.id,expectedRevision:view.revision,patch:{name:'Secretary edited',layout:'timeline',options:{timezone:'Asia/Tokyo',timelineScale:'week'}}},tokens.s);await deny('plan.view-update',{id:view.id,expectedRevision:view.revision,patch:{name:'stale'}},tokens.s);await rpc('plan.view-delete',{id:view.id,expectedRevision:changed.revision},tokens.s)
 const updated=await rpc('schedule.update',{id:regular.id,expectedRevision:regular.revision,patch:{name:'Edited via API',action:{...regular.action,prompt:'Updated actual task'},rule:{kind:'monthly',day:'last',time:'17:00',timezone:'Asia/Tokyo'},window:{start:'08:00',end:'20:00',timezone:'Asia/Tokyo'},until:new Date(Date.now()+365*86400000).toISOString(),maxOccurrences:5,timeoutSeconds:900,graceSeconds:120,plan:{priority:'urgent',tags:['release'],notes:'Full editor parity',durationMinutes:45}}},tokens.s);assert.equal(updated.rule.kind,'monthly');assert.equal(updated.plan.durationMinutes,45);assert.ok((await rpc('schedule.preview',{id:regular.id,count:3},tokens.s)).times.length)
 await rpc('schedule.resume',{id:regular.id,expectedRevision:updated.revision},tokens.s);await deny('schedule.pause',{id:regular.id,expectedRevision:updated.revision},tokens.s);await rpc('schedule.pause',{id:regular.id},tokens.s)
 const range={from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+86400000).toISOString()};for(const cmd of ['plan.calendar','plan.timeline'])await rpc(cmd,range,tokens.s);await rpc('plan.analytics',{},tokens.s);await rpc('plan.feed',{},tokens.s)
 const actions=await f.call(tokens.s,'api','list','--prefix','schedule.');assert.ok(actions.length>=10&&actions.every(c=>c.name.startsWith('schedule.')));assert.ok(actions.find(c=>c.name==='schedule.delete').inputSchema.properties.ids)
 assert.equal((await f.call(tokens.s,'api','call','plan.query','--args',JSON.stringify({filter:{search:regular.id}}))).total,1);await deny('auth.agent-token',{id:peer.id},tokens.s)
 checks.push('Secretary edits every schedule field and user-saved view through canonical APIs; preview/calendar/timeline/feed/analytics, filtered API discovery, raw authenticated CLI and revision conflicts work; human token authority stays protected')
 // A native fixture calls the registered tool, rather than pretending text is an API result.
 const session=(await rpc('session.open',{cardId:secretary.id})).sessionId
 const file=path.join(f.control,secretary.id+'.core-api.json'),resultFile=path.join(f.control,secretary.id+'-core-api-result.json')
 const start=async operation=>{fs.rmSync(resultFile,{force:true});fs.writeFileSync(file,JSON.stringify(operation));await rpc('session.send',{employee:secretary.id,text:'USE_REGISTERED_CORE_TOOL',sourceView:'plan'})},result=async()=>{await f.until(()=>fs.existsSync(resultFile),'native API response');await idle(secretary.id);return JSON.parse(fs.readFileSync(resultFile))}
 await rpc('config.permission',{id:session,mode:'default'});await start({command:'plan.query'});assert.equal((await result()).value.total,ui.total)
 await start({command:'settings.set',args:{language:'zh-CN'}});const approval=await f.until(async()=>(await rpc('approval.list',{id:session}))[0],'API write approval');assert.equal(approval.tool,'agents_company_api');await rpc('approval.respond',{id:session,requestId:approval.id,decision:'deny'});assert.match((await result()).error,/Declined/)
 await start({command:'settings.set',args:{language:'en'}});const accepted=await f.until(async()=>(await rpc('approval.list',{id:session}))[0],'approval accepted');await rpc('approval.respond',{id:session,requestId:accepted.id,decision:'allow'});assert.equal((await result()).ok,true)
 await rpc('config.plan',{id:session,enabled:true});await start({command:'settings.set',args:{language:'zh-CN'}});assert.match((await result()).error,/read-only/);await rpc('config.plan',{id:session,enabled:false})
 await rpc('config.permission',{id:session,mode:'bypassPermissions'});await start({workflow:'delete-orphans'});const workflow=await result();assert.equal(workflow.ok,true,workflow.error);assert.equal(workflow.value.deleted.count,3);assert.equal(workflow.value.remaining,0);assert.equal((await rpc('schedule.history',{},tokens.s)).filter(run=>ids.includes(run.jobId)).length,1);assert.ok((await rpc('plan.query')).rows.some(row=>row.id===peerJob.id))
 const transcript=await rpc('session.transcript',{employee:secretary.id});assert.ok(transcript.text.includes('USE_REGISTERED_CORE_TOOL'));assert.deepEqual(await rpc('terminal.list'),[])
 const removed=await f.create('Reassignment target','Secretary desk'),orphan=await rpc('schedule.create',{spec:spec(removed,'Reassignable record')});await rpc('card.remove',{id:removed.id})
 const old=await rpc('schedule.get',{id:orphan.id},tokens.s);await deny('schedule.update',{id:old.id,patch:{action:{type:'agent',employeeId:peer.id,prompt:'Forbidden reassignment'}}},tokens.s)
 const reassigned=await rpc('schedule.update',{id:old.id,expectedRevision:old.revision,patch:{action:{type:'agent',employeeId:governor.id,prompt:'REASSIGNED_FIXTURE_ONLY',viewId:'all'}}},tokens.s);assert.equal(reassigned.action.employeeId,governor.id);assert.equal(reassigned.disabledReason,undefined);assert.equal(reassigned.enabled,false)
 assert.equal((await rpc('plan.query',{filter:{search:orphan.id}},tokens.s)).rows[0].target.role,'governor');await rpc('schedule.run',{id:orphan.id,expectedRevision:reassigned.revision},tokens.s);await f.until(async()=>(await rpc('schedule.history',{id:orphan.id},tokens.s))[0]?.status==='succeeded','reassigned execution')
 await f.call(tokens.s,'schedule','delete','--ids',JSON.stringify([orphan.id]),'--expected-revisions',JSON.stringify({[orphan.id]:reassigned.revision}));assert.equal((await rpc('plan.query',{filter:{search:orphan.id}},tokens.s)).total,0)
 assert.match((await rpc('api.docs',{document:'core/secretary-api'},tokens.s)).markdown,/Plan 操作对照/)
 checks.push('A removed-target record can be reassigned to a legal Governor with pinned scope and run by the same executor; peer reassignment rejects; real batch CLI preserves revisions and the packaged parity document is discoverable')
 checks.push('Real Codex native MCP queries without a shell; Ask writes require user approval, decline blocks changes, native planning blocks writes; Full access runs query→returned IDs/revisions→batch delete→readback, preserving audit/history and unrelated schedules')
 fs.writeFileSync(path.join(out,'core.json'),JSON.stringify({passed:true,checks,providerCalls:0},null,2));console.log('PASS '+checks.join('; '))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
