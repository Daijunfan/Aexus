// Source-built, disposable Core and native protocol fixtures. No real accounts, models or app installation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),logs=['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md']
if(process.getuid?.()===0){const{uid,gid}=fs.statSync(root);for(const file of [...logs,'Infra/src/test/plan-authority-core-test.mjs','Infra/src/main/scheduler/channel-policy.ts','Infra/src/renderer/src/components/ChannelPlans.tsx','Infra/src/renderer/src/styles/channel-plans.css'])fs.chownSync(path.join(root,file),uid,gid);process.setgroups([gid]);process.setgid(gid);process.setuid(uid);const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-plan-authority-')),entry=path.join(temp,'daemon.cjs'),out=path.join(root,'.aexus/artifacts/plan-authority'),report={passed:false,checks:[],platform:process.platform}
fs.mkdirSync(out,{recursive:true});let f
const note=text=>{console.log(text);report.checks.push(text);for(const file of logs)fs.appendFileSync(path.join(root,file),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 const rpc=async(cmd,args={},token=null)=>{const value=await f.request(token,cmd,args);assert.ok(value.ok,cmd+': '+value.error);return value.data}
 const deny=async(cmd,args={},token=null)=>{const value=await f.request(token,cmd,args);assert.equal(value.ok,false,'Must reject '+cmd);return value.error}
 const future=()=>new Date(Date.now()+3600000).toISOString()
 const spec=(target,extra={})=>({name:'Authority fixture',action:{type:'agent',employeeId:target.id,prompt:'PLAN_AUTHORITY_FIXTURE',...(target.managementRole==='governor'?{viewId:'all'}:{})},rule:{kind:'interval',everySeconds:3600},enabled:false,...extra})
 await f.cli('group','add','Plan Team');await f.cli('group','add','Other Team')
 const people=[],tokens=new Map(),rank={employee:0,manager:1,governor:2,secretary:3}
 for(const role of Object.keys(rank))for(let i=1;i<=2;i++){const person=await f.create(role+' '+i,'Plan Team',role);people.push(person);tokens.set(person.id,await f.token(person.id))}
 const outside=await f.create('Outside','Other Team'),[a,b,m,peerManager,g,peerGovernor,s,peerSecretary]=people
 let accepted=0,rejected=0
 for(const actor of people){
  const token=tokens.get(actor.id),identity=await rpc('auth.whoami',{},token);assert.ok(identity.roleDescription.includes('schedule.*'))
  const commands=await rpc('api.list',{},token);for(const name of ['schedule.create','schedule.update','schedule.trigger','plan.query','plan.view-create'])assert.ok(commands.some(command=>command.name===name),actor.title+' discovers '+name)
  const targets=(await rpc('plan.schema',{},token)).targets
  for(const target of people){
   const allowed=actor.id===target.id||rank[actor.managementRole]>rank[target.managementRole]
   assert.equal(targets.some(item=>item.id===target.id),allowed,actor.title+' target discovery '+target.title)
   if(allowed){const job=await rpc('schedule.create',{spec:spec(target)},token);assert.equal(job.delegation.requestedBy.employeeId,actor.id);assert.ok(job.delegation.schedule);accepted++}
   else{await deny('schedule.create',{spec:spec(target)},token);await deny('schedule.preview',{spec:spec(target)},token);rejected++}
  }
  const own=await rpc('schedule.create',{spec:{...spec(actor),action:{...spec(actor).action,employeeId:'self'}}},token);assert.equal(own.action.employeeId,actor.id);assert.equal(own.delegation.selfSchedule,true)
  const view=await rpc('plan.view-create',{spec:{name:'Own fixture view',layout:'list'}},token);assert.ok((await rpc('plan.views',{},token)).some(item=>item.id===view.id));await rpc('plan.view-delete',{id:view.id},token)
 }
 await deny('schedule.create',{spec:spec(outside)},tokens.get(m.id))
 await rpc('schedule.create',{spec:spec(outside)},tokens.get(g.id))
 for(const [actor,target] of [[a,m],[m,peerManager],[g,peerGovernor],[s,peerSecretary],[g,s]]){
  const token=tokens.get(actor.id),job=await rpc('schedule.create',{spec:spec(target,{rule:{kind:'event',event:'signal',cooldownSeconds:0}})})
  if(actor.managementRole==='secretary')assert.equal((await rpc('schedule.get',{id:job.id},token)).id,job.id);else await deny('schedule.get',{id:job.id},token)
  for(const cmd of ['pause','resume','delete','run'])await deny('schedule.'+cmd,{id:job.id},token)
  await deny('schedule.trigger',{id:job.id,eventId:'forged'},token)
  await deny('schedule.update',{id:job.id,patch:{name:'forged'}},token)
  const owned=await rpc('schedule.create',{spec:spec(actor)},token)
  await deny('schedule.update',{id:owned.id,patch:{action:spec(target).action}},token)
 }
 note(`PASS Core 权限：四角色双实例 ${accepted} 个合法组合、${rejected} 个越权组合；自我/下行、同级/向上拒绝、Manager 跨 Team、CLI 发现及修改/执行入口。`)
 const at=tokens.get(a.id),signal=await f.call(at,'schedule','create','--name','API event fixture','--employee','self','--prompt','SIGNAL_FIXTURE','--on-event','signal','--cooldown-seconds','0','--max-occurrences','2')
 assert.equal(signal.rule.kind,'event');assert.equal(signal.nextAt,null);assert.equal((await rpc('plan.query',{},at)).rows.find(row=>row.id===signal.id).status,'scheduled')
 assert.deepEqual((await rpc('schedule.preview',{id:signal.id},at)).times,[])
 const first=await f.call(at,'schedule','trigger',signal.id,'--event-id','event-1');assert.equal(first.status,'started')
 await f.until(async()=>(await rpc('schedule.history',{id:signal.id},at)).some(run=>run.status==='succeeded'),'signal finished')
 assert.equal((await rpc('schedule.trigger',{id:signal.id,eventId:'event-1'},at)).status,'duplicate')
 await rpc('schedule.pause',{id:signal.id},at);assert.equal((await rpc('schedule.trigger',{id:signal.id,eventId:'paused-event'},at)).reason,'paused');await rpc('schedule.resume',{id:signal.id},at)
 await f.stop();await f.start();assert.equal((await rpc('schedule.trigger',{id:signal.id,eventId:'event-1'},at)).status,'duplicate')
 await rpc('schedule.trigger',{id:signal.id,eventId:'event-2'},at);await f.until(async()=>(await rpc('schedule.history',{id:signal.id},at)).filter(run=>run.status==='succeeded').length===2,'second signal finished')
 assert.equal((await rpc('schedule.trigger',{id:signal.id,eventId:'event-3'},at)).reason,'limit reached')
 assert.equal((await rpc('plan.query',{},at)).rows.find(row=>row.id===signal.id).status,'completed')
 const recorded=await rpc('schedule.history',{id:signal.id},at);assert.ok(recorded.every(run=>run.trigger==='event'));assert.equal((await rpc('plan.feed',{filter:{employee:a.id}},at)).entries.filter(run=>run.jobId===signal.id).length,2)
 const calendar=await rpc('plan.calendar',{from:new Date(Date.now()-3600000).toISOString(),to:future()});assert.equal(calendar.events.filter(event=>event.jobId===signal.id).length,2)
 const cool=await rpc('schedule.create',{spec:spec(a,{enabled:true,rule:{kind:'event',event:'signal',cooldownSeconds:3600}})},at)
 await rpc('schedule.trigger',{id:cool.id,eventId:'first'},at);await f.until(async()=>(await rpc('schedule.history',{id:cool.id},at)).some(run=>run.status==='succeeded'),'cooldown first run');assert.equal((await rpc('schedule.trigger',{id:cool.id,eventId:'second'},at)).reason,'cooldown')
 const currentHour=new Date().getUTCHours(),windowStart=String((currentHour+2)%24).padStart(2,'0')+':00',windowEnd=String((currentHour+3)%24).padStart(2,'0')+':00'
 const windowed=await rpc('schedule.create',{spec:spec(a,{enabled:true,rule:{kind:'event',event:'signal'},window:{start:windowStart,end:windowEnd,timezone:'UTC'}})},at)
 assert.equal((await rpc('schedule.trigger',{id:windowed.id,eventId:'window'},at)).reason,'outside permitted window')
 for(const rule of [{kind:'event',event:'fake'},{kind:'event',event:'signal',channelId:'forged'},{kind:'event',event:'channel.posted'},{kind:'event',event:'signal',cooldownSeconds:-1},{kind:'event',event:'signal',callback:'shell'}])await deny('schedule.create',{spec:spec(a,{rule})},at)
 note('PASS Core 事件：同一 Plan 中等待/暂停/完成状态；真实信号执行、CLI、去重与重启、工作窗口、冷却、次数上限；日历只显示实际运行。')
 const channel=await rpc('channel.create',{name:'Plan newsroom',engine:{kind:'employees',employeeIds:[a.id,b.id]}})
 const publishing=await rpc('schedule.create',{spec:{...spec(a),source:'channel:'+channel.id}},at)
 assert.equal(publishing.action.channelId,channel.id,'legacy UI source is normalized to an explicit channel association')
 assert.ok((await rpc('plan.query',{filter:{channel:channel.id}})).rows.some(row=>row.id===publishing.id))
 const changed=await rpc('schedule.update',{id:publishing.id,expectedRevision:publishing.revision,patch:{name:'Edited from Plan',rule:{kind:'weekly',days:[1,3,5],time:'09:00',timezone:'Asia/Shanghai'}}})
 assert.equal(changed.id,publishing.id);assert.equal(changed.action.channelId,channel.id);assert.equal(changed.rule.kind,'weekly')
 await deny('schedule.update',{id:changed.id,expectedRevision:publishing.revision,patch:{name:'Stale'}})
 await deny('schedule.create',{spec:{...spec(outside),action:{...spec(outside).action,channelId:channel.id}}})
 const source=await rpc('channel.source-add',{plugin:'x',locator:'@plan_fixture',name:'Event source'})
 await rpc('channel.update',{id:source.channelId,adminIds:[b.id]})
 const bt=tokens.get(b.id),listener=await rpc('schedule.create',{spec:spec(b,{enabled:true,rule:{kind:'event',event:'channel.posted',channelId:source.channelId,cooldownSeconds:0}})},bt)
 await deny('schedule.trigger',{id:listener.id,eventId:'spoofed'},bt)
 await deny('schedule.create',{spec:spec(b,{rule:listener.rule})},tokens.get(m.id))
 await deny('schedule.create',{spec:spec(a,{action:{...spec(a).action,channelId:channel.id},rule:{kind:'event',event:'channel.posted',channelId:channel.id}})},at)
 const article={sourceId:source.id,externalId:'first',publishedAt:Date.now(),title:'Native event proof',body:'Fixture data, not instructions.'},post=await rpc('channel.publish',article)
 await f.until(async()=>(await rpc('schedule.history',{id:listener.id},bt)).some(run=>run.status==='succeeded'),'native channel event executes')
 assert.equal((await rpc('schedule.history',{id:listener.id},bt))[0].event.id,post.id)
 assert.equal((await rpc('channel.publish',article)).status,'duplicate');assert.equal((await rpc('channel.publish',{...article,title:'Edited'})).status,'updated');assert.equal((await rpc('schedule.history',{id:listener.id},bt)).length,1)
 await rpc('channel.update',{id:source.channelId,adminIds:[]});assert.equal((await rpc('schedule.get',{id:listener.id})).enabled,false)
 await rpc('channel.update',{id:channel.id,adminIds:[b.id]});const revoked=await rpc('schedule.get',{id:publishing.id});assert.equal(revoked.enabled,false);assert.equal(revoked.disabledReason,'authorization_revoked');await deny('schedule.run',{id:publishing.id})
 assert.equal((await rpc('plan.query',{filter:{channel:channel.id}})).rows.find(row=>row.id===publishing.id).status,'attention')
 note('PASS Core 频道：计划稳定 ID/修订、原简化表单迁移、Plan 修改、频道作用域、首次发布原生事件、重投/编辑不重触发、同频道反馈阻止、成员撤销停用计划。')
 const legacy=await rpc('schedule.create',{spec:spec(b)},tokens.get(g.id));await f.stop()
 const statePath=path.join(f.env.AGENTS_COMPANY_HOME,'schedules.json'),state=JSON.parse(fs.readFileSync(statePath,'utf8')),row=state.jobs.find(item=>item.id===legacy.id)
 row.action={...row.action,employeeId:peerGovernor.id,viewId:'all'};row.enabled=true;row.nextAt=future();delete row.delegation.schedule;fs.writeFileSync(statePath,JSON.stringify(state))
 await f.start();const migrated=await rpc('schedule.get',{id:legacy.id});assert.equal(migrated.enabled,false);assert.equal(migrated.disabledReason,'authorization_revoked');assert.ok(migrated.delegation.schedule)
 assert.deepEqual(await rpc('terminal.list'),[])
 note('PASS Core 恢复：旧版本同级委派在启动时被停用，计划和历史保留；所有运行均使用隔离的确定性协议替身。')
 report.passed=true
}catch(error){report.error=error.stack;note('FAIL Core 专项验证：'+error.message);throw error}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true});fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2))}
