// Isolated real Core / Contract / native adapter protocol; no production data or paid inference.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {profileApplication} from './fixtures/profile-application.mjs'
import {researchFixture} from './fixtures/deep-research-fixture.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,process.env.AEXUS_RESEARCH_ARTIFACTS??'.aexus/artifacts/deep-research','controls');fs.mkdirSync(out,{recursive:true})
const app=await profileApplication();let fixture;const checks=[]
const pass=text=>{checks.push(text);console.log('PASS '+text)}
try{
 fixture=await researchFixture({application:app.directory});const {f,invoke,rpc,stage,wait,control}=fixture
 const input={topic:'验证可暂停、可修订和版本兼容的合成调研',engines:[{engine:'codex'},{engine:'claude'}],materials:[{name:'context.md',text:'用户提供的背景，只用来确定验证目标。'}]}
 const answer=async job=>invoke('workflow.respond',{id:job.id,expectedRevision:job.revision,answer:{values:{}},clientRequestId:randomUUID()})
 let job=await invoke('workflow.start',{engineId:'deep-research',input,clientRequestId:randomUUID()});job=await stage(job.id,'scope');await answer(job);job=await stage(job.id,'direction')
 const id=job.id,workers=job.summary.workers.map(w=>w.id)
 const unchanged=await invoke('workflow.get',{id,ifRevision:job.revision})
 assert.deepEqual(unchanged,{id,engineId:'deep-research',revision:job.revision,unchanged:true})
 const fresh=await invoke('workflow.get',{id,ifRevision:Math.max(0,job.revision-1)})
 assert.equal(fresh.revision,job.revision);assert.ok(fresh.summary);assert.ok(!JSON.stringify(fresh).includes(input.materials[0].text))
 for(const ifRevision of [-1,1.5])await assert.rejects(invoke('workflow.get',{id,ifRevision}),/integer|minimum|non-negative|Invalid/i)
 const unauthorized=await f.request(await f.token(workers[0]),'contract.call',{version:'1.0.0',command:'workflow.get',args:{id,ifRevision:job.revision}})
 assert.equal(unauthorized.ok,false)
 pass('Conditional reads return only the unchanged identity/revision tuple; validation and authorization run before cache responses')
 const info=await rpc('contract.describe',{version:'1.0.0',command:'workflow.amend'});assert.ok(JSON.stringify(info).includes('expectedRevision'))
 fs.writeFileSync(path.join(control,'hold-research'),'');await answer(job)
 job=await wait(async()=>{const j=await invoke('workflow.get',{id});return j.summary.tasks.filter(t=>t.status==='running').length===2?j:false},'parallel tasks accepted')
 await rpc('group.add',{name:'Outside research',mode:'build'});const outsider=await f.create('Unrelated worker','Outside research')
 fs.writeFileSync(path.join(control,outsider.id+'.hold-user'),'');await rpc('session.send',{employee:outsider.id,text:'Keep this unrelated task active while another workflow pauses.'})
 await wait(async()=>(await rpc('session.status',{employee:outsider.id}))[0].busy,'unrelated task running')
 const paused=await Promise.all(Array.from({length:3},()=>invoke('workflow.pause',{id})))
 assert.ok(paused.every(j=>j.status==='paused'&&!j.controlPending));assert.equal(new Set(paused.map(j=>j.revision)).size,1)
 assert.ok((await rpc('session.status',{employee:outsider.id}))[0].busy)
 for(const worker of workers)assert.ok(!(await rpc('session.status',{employee:worker}))[0].busy)
 assert.deepEqual(paused[0].files,[])
 const revision=paused[0].revision;await f.stop();await f.start();job=await invoke('workflow.get',{id});assert.equal(job.status,'paused');assert.equal(job.revision,revision)
 pass('Concurrent pause is idempotent, stops only owned native turns, and remains paused after Core restart')
 fs.rmSync(path.join(control,'hold-research'));fs.rmSync(path.join(control,outsider.id+'.hold-user'))
 await invoke('workflow.resume',{id,expectedRevision:job.revision,clientRequestId:randomUUID()});job=await stage(id,'focus')
 assert.equal(job.summary.sourceCount,6);assert.equal(job.summary.verification.checked,6)
 assert.ok(!JSON.stringify(job).includes(input.materials[0].text));assert.equal(job.summary.materials[0].name,'context.md')
 const sourceIds=job.summary.evidence.map(s=>s.id)
 job=await invoke('workflow.pause',{id});const request={id,expectedRevision:job.revision,update:{note:'保留现有证据，重点核对恢复路径和失败边界。',sourcePolicy:{allowedDomains:['research.test']}},clientRequestId:randomUUID()}
 const amended=await Promise.all([invoke('workflow.amend',request),invoke('workflow.amend',request)])
 assert.equal(amended[0].revision,amended[1].revision);job=amended[0];assert.equal(job.status,'paused');assert.equal(job.summary.phase,'plan');assert.equal(job.summary.amendments.length,1);assert.deepEqual(job.summary.evidence.map(s=>s.id),sourceIds);assert.deepEqual(job.summary.workers.map(w=>w.id),workers)
 await assert.rejects(invoke('workflow.amend',{...request,clientRequestId:randomUUID()}),/changed/)
 await assert.rejects(invoke('workflow.amend',{...request,update:{note:'different'}}),/different/)
 await assert.rejects(invoke('workflow.file',{id,name:'research-report.html'}),/final files/)
 pass('Owner revisions are exact-once and revision-checked; evidence IDs and employee identities survive, drafts stay unavailable')
 // Real persisted legacy version: an explicit runtime allowlist permits this additive upgrade.
 await f.stop();const file=path.join(f.env.AGENTS_COMPANY_HOME,'workflows',id,'state.json'),stored=JSON.parse(fs.readFileSync(file));stored.engineVersion='1.0.0';fs.writeFileSync(file,JSON.stringify(stored));await f.start()
 job=await invoke('workflow.get',{id});assert.equal(job.engineVersion,'1.0.0')
 await invoke('workflow.resume',{id,expectedRevision:job.revision,clientRequestId:randomUUID()});job=await stage(id,'direction');await answer(job);job=await stage(id,'focus');assert.deepEqual(job.summary.evidence.map(s=>s.id),sourceIds)
 await answer(job);job=await stage(id,'complete');assert.equal(job.files.length,3)
 const wire=fs.readFileSync(path.join(control,'deep-research-wire.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
 assert.ok(wire.some(t=>t.kind==='plan'&&t.payload.amendments?.[0]?.note===request.update.note))
 assert.ok(wire.filter(t=>t.kind==='research').some(t=>t.payload.sourcePolicy.allowedDomains?.includes('research.test')))
 const final=await invoke('workflow.file',{id,name:'research-report.html'});assert.ok(final.content.includes(request.update.note));assert.ok(final.content.includes('context.md'));assert.ok(!final.content.includes(input.materials[0].text))
 await assert.rejects(invoke('workflow.pause',{id}),/Terminal/)
 const token=await f.token(workers[0]);for(const command of ['workflow.pause','workflow.amend']){const result=await f.request(token,'contract.call',{version:'1.0.0',command,args:{id}});assert.equal(result.ok,false)}
 pass('Explicit 1.0.0 compatibility resumes through new planning, independent research and final review; private material and unauthorized controls remain protected')
 // Failure must honor a strict domain policy rather than silently broadening its network evidence scope.
 let constrained=await invoke('workflow.start',{engineId:'deep-research',input:{...input,sourcePolicy:{allowedDomains:['alpha.research.test']}},clientRequestId:randomUUID()})
 for(const phase of ['scope','direction']){constrained=await stage(constrained.id,phase);await answer(constrained)}
 constrained=await wait(async()=>{const j=await invoke('workflow.get',{id:constrained.id});return j.status==='failed'?j:false},'insufficient constrained evidence')
 assert.equal(constrained.summary.sourceCount,2);assert.equal(constrained.files.length,0);assert.ok(constrained.summary.rejectedCount>0)
 assert.ok(constrained.summary.evidence.every(s=>new URL(s.url).hostname==='alpha.research.test'))
 pass('Restricted source policies fail closed when evidence is insufficient, without auto-expanding domains or publishing an unreviewed report')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,paidModelCalls:0,productionDataUsed:false},null,2))
}catch(error){fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));throw error}finally{await fixture?.close();app.dispose()}
