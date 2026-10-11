// Current Core projection and shared folders, disposable state only; no provider calls.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/employee-profile'),built=await profileApplication(),entry=process.env.AGENTS_COMPANY_TEST_CORE_ENTRY||path.join(built.directory,'out/main/daemon.js'),f=await fixtureCore({},entry),checks=[]
const rpc=async(cmd,args={},token=null)=>{const result=await f.request(token,cmd,args);assert.ok(result.ok,result.error);return result.data}
try{
 await f.cli('group','add','Design');await f.cli('group','add','Engineering')
 const a=await f.create('Alex','Design','manager'),b=await f.create('Alex','Engineering'),outside=await f.create('Observer','Engineering'),ta=await f.token(a.id),tb=await f.token(b.id),to=await f.token(outside.id)
 const group=await rpc('chat.create',{name:'Release studio',members:[a.id,b.id]}),privateGroup=await rpc('chat.create',{name:'Private notes',members:[b.id]}),channel=await rpc('channel.create',{name:'Release dispatch',engine:{kind:'employees',employeeIds:[a.id,b.id]}})
 const home=f.env.AGENTS_COMPANY_HOME,folder=path.join(home,'conversation-workspaces'),before=fs.readFileSync(path.join(home,'sessions.json'))
 assert.equal(fs.existsSync(folder),false,'creating membership alone has not provisioned folders')
 let profile=await rpc('card.profile',{id:b.id})
 assert.equal(profile.company.team,'Engineering');assert.equal(profile.employee.managementRole,'employee');assert.equal(profile.employee.engine,'codex');assert.equal(profile.company.workspace,b.cwd)
 assert.equal(profile.memberships.length,3);assert.equal(profile.memberships.find(m=>m.id===group.id).role,'member');assert.equal(profile.memberships.find(m=>m.id===channel.id).role,'admin')
 assert.ok(profile.memberships.every(m=>m.workspace&&path.dirname(m.workspace.memberPath)===m.workspace.root))
 assert.equal(fs.existsSync(folder),false,'reading profile must not create workspace directories')
 assert.ok(fs.readFileSync(path.join(home,'sessions.json')).equals(before),'profile must not write employee metadata or read receipts')
 assert.equal((await f.call(tb,'card','profile',b.id)).employee.id,b.id)
 assert.equal((await f.request(to,'card.profile',{id:a.id})).ok,false)
 assert.equal((await f.request(ta,'card.profile',{id:b.id})).ok,false,'cross-Team manager cannot read employee profile')
 const sameTeam=await f.create('Writer','Design');await rpc('chat.update',{id:privateGroup.id,members:[b.id,sameTeam.id]})
 const managerView=await rpc('card.profile',{id:sameTeam.id},ta);assert.equal(managerView.memberships.length,0,'management control does not expose groups the caller has not joined')
 checks.push('User sees true Company/group/channel identities; member/administrator roles are independent; authorized CLI profile reads create no folders, receipts or engine work')
 const ref='group:'+group.id,wb=await rpc('conversation.workspace',{conversation:ref,employee:b.id}),wa=await rpc('conversation.workspace',{conversation:ref,employee:a.id})
 assert.notEqual(wa.memberDirectory,wb.memberDirectory,'same display names have distinct stable member folders')
 await rpc('conversation.file',{conversation:ref,operation:'write',path:'brief.md',content:'# Original brief',create:true})
 const original=await rpc('conversation.file',{conversation:ref,operation:'read',path:'brief.md'})
 assert.equal((await f.request(tb,'conversation.file',{conversation:ref,operation:'write',path:'brief.md',content:'no',hash:original.hash})).ok,false)
 assert.equal((await f.request(tb,'conversation.file',{conversation:ref,operation:'write',path:wa.memberDirectory+'/peer.md',content:'no',create:true})).ok,false)
 await rpc('conversation.file',{conversation:ref,operation:'write',path:wb.memberDirectory+'/review.md',content:'Employee result',create:true},tb)
 await rpc('conversation.file',{conversation:ref,operation:'write',path:'brief.md',content:'# User edited brief',hash:original.hash})
 const transfer=await rpc('conversation.copy',{from:{conversation:ref,path:'brief.md'},to:{employee:'self',path:'.'}},tb)
 await f.until(async()=>{const job=await rpc('conversation.transfer',{id:transfer.id},tb);if(job.state==='failed')throw Error(job.error);return job.state==='completed'},'explicit personal copy')
 assert.equal(fs.readFileSync(path.join(b.cwd,'brief.md'),'utf8'),'# User edited brief');assert.equal(fs.readFileSync(path.join(wb.memberPath,'review.md'),'utf8'),'Employee result')
 await rpc('card.update',{id:b.id,patch:{title:'Alex — renamed'}})
 profile=await rpc('card.profile',{id:b.id});assert.equal(profile.memberships.find(m=>m.id===group.id).workspace.memberPath,wb.memberPath)
 await rpc('session.send',{employee:b.id,text:'A genuine private question'});await f.received(b.id,'A genuine private question');await f.until(async()=>!(await f.status(b.id)).busy,'private answer')
 const unread=(await f.status(b.id)).lastReply;assert.ok(unread&&!unread.readAt)
 const transcriptBefore=(await rpc('session.transcript',{employee:b.id})).items
 checks.push('Root originals stay user-editable and Agent-read-only; own first-level folder writes and personal-workspace copying work; renaming does not move folders')
 const jobs=[]
 for(let i=0;i<14;i++)jobs.push(await rpc('schedule.create',{spec:{name:'Review '+i,action:{type:'agent',employeeId:b.id,prompt:'PRIVATE_PROMPT_DO_NOT_EXPOSE'},rule:{kind:'once',at:new Date(Date.now()+(i+24)*3600000).toISOString()},enabled:i%2===0},clientRequestId:'profile-once-'+i}))
 jobs.push(await rpc('schedule.create',{spec:{name:'Sunday release review',action:{type:'agent',employeeId:b.id,prompt:'PRIVATE_PROMPT_DO_NOT_EXPOSE'},rule:{kind:'weekly',time:'17:00',days:[7],timezone:'Asia/Shanghai'},enabled:true}}))
 jobs.push(await rpc('schedule.create',{spec:{name:'On approved signal',action:{type:'agent',employeeId:b.id,prompt:'PRIVATE_PROMPT_DO_NOT_EXPOSE'},rule:{kind:'event',event:'signal',cooldownSeconds:30},enabled:true}}))
 profile=await rpc('card.profile',{id:b.id,limit:12});assert.equal(profile.plans.total,16);assert.equal(profile.plans.rows.length,12);assert.equal(profile.plans.hasMore,true);assert.equal(profile.plans.eventTriggersSupported,true)
 const page2=await rpc('card.profile',{id:b.id,offset:12,limit:12});assert.equal(page2.plans.rows.length,4);assert.equal(page2.plans.hasMore,false)
 const all=[...profile.plans.rows,...page2.plans.rows];assert.equal(new Set(all.map(j=>j.id)).size,16);assert.equal(all.find(j=>j.name==='Sunday release review').rule.time,'17:00');assert.equal(all.find(j=>j.name==='On approved signal').rule.kind,'event')
 assert.ok(!JSON.stringify(profile).includes('PRIVATE_PROMPT_DO_NOT_EXPOSE'));assert.ok(!JSON.stringify(profile).includes('credentialHash'))
 assert.equal((await f.request(null,'card.profile',{id:b.id,limit:1000})).ok,false);assert.equal((await f.request(null,'card.profile',{id:b.id,unexpected:true})).ok,false)
 assert.equal((await rpc('schedule.history',{employee:b.id})).length,0);assert.deepEqual((await rpc('session.transcript',{employee:b.id})).items,transcriptBefore);assert.deepEqual((await f.status(b.id)).lastReply,unread)
 checks.push('Paged Plan projection contains all one-time/weekly/event records with actual state; no prompt/credential leakage, execution or extra plans')
 await rpc('chat.update',{id:group.id,members:[a.id]});profile=await rpc('card.profile',{id:b.id});assert.equal(profile.memberships.some(m=>m.id===group.id),false);assert.ok(fs.existsSync(wb.memberPath));assert.equal((await f.request(tb,'conversation.file',{conversation:ref,operation:'read',path:'brief.md'})).ok,false)
 await f.stop();await f.start();const restored=await rpc('card.profile',{id:b.id});assert.equal(restored.company.workspace,b.cwd);assert.equal(restored.plans.total,16);assert.equal(restored.memberships.length,2)
 assert.deepEqual((await f.status(b.id)).lastReply,unread)
 checks.push('Membership removal immediately removes access/profile rows, preserves output folders; restart retains profiles and scheduled definitions')
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core.json'),JSON.stringify({passed:true,checks,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'))
}finally{await f.close();built.dispose()}
