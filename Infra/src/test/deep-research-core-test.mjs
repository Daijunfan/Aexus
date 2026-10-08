import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {profileApplication} from './fixtures/profile-application.mjs'
import {researchFixture} from './fixtures/deep-research-fixture.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,process.env.AEXUS_RESEARCH_ARTIFACTS??'.aexus/artifacts/deep-research','core');fs.mkdirSync(out,{recursive:true})
const app=await profileApplication();let test;const checks=[]
const pass=text=>{checks.push(text);console.log('PASS '+text)}
try{
 test=await researchFixture({application:app.directory});const {f,invoke,rpc,stage,wait,control}=test
 const input={topic:'比较 Atlas 和 Beacon 在单人研究项目中的取舍（合成验收）',engines:[{engine:'codex',model:'gpt-6-luna'},{engine:'claude',model:'fixture-claude'}]},key=randomUUID()
 await assert.rejects(invoke('workflow.start',{engineId:'deep-research',input:{topic:' '},clientRequestId:randomUUID()}))
 await assert.rejects(invoke('workflow.start',{engineId:'deep-research',input:{topic:'test',engines:[{engine:'codex'},{engine:'codex'}]},clientRequestId:randomUUID()}),/两种|两类|同一个/)
 const started=await Promise.all(Array.from({length:3},()=>invoke('workflow.start',{engineId:'deep-research',input,clientRequestId:key})));assert.equal(new Set(started.map(j=>j.id)).size,1)
 const id=started[0].id;let job=await stage(id,'scope');assert.equal(job.summary.questions.length,3);assert.equal((await rpc('session.list')).sessions.length,0)
 assert.deepEqual(job.files,[]);assert.equal(fs.existsSync(path.join(control,'deep-research-wire.jsonl')),false)
 await assert.rejects(invoke('workflow.start',{engineId:'deep-research',input:{...input,topic:'different'},clientRequestId:key}),/different/)
 await assert.rejects(invoke('workflow.file',{id,name:'state.json'}),/final files/)
 pass('One-sentence intake and concurrent retry identity are durable; initial clarification causes no employee creation or inference')
 const first={id,expectedRevision:job.revision,answer:{values:{decision:'使用者是个人研究者，目标是为原型选择技术路线。'}},clientRequestId:randomUUID()}
 await invoke('workflow.respond',first);job=await stage(id,'direction');assert.ok(job.summary.plan.tracks.length>=2);assert.equal(job.summary.workers.length,3);assert.equal(new Set(job.summary.workers.map(w=>w.engine)).size,2)
 const unchanged=await invoke('workflow.respond',first);assert.equal(unchanged.id,id);assert.equal(unchanged.summary.phase,'direction')
 await assert.rejects(invoke('workflow.respond',{...first,answer:{values:{decision:'changed'}}}),/different/)
 await assert.rejects(invoke('workflow.respond',{...first,clientRequestId:randomUUID()}),/changed/)
 assert.ok(!JSON.stringify(job).includes('[AEXUS_DEEP_RESEARCH_TASK]'));assert.equal(job.state,undefined)
 const workersBefore=(await rpc('session.list')).sessions.map(c=>({id:c.id,cwd:c.cwd,engine:c.engine}))
 await f.stop();await f.start();job=await stage(id,'direction');assert.deepEqual((await rpc('session.list')).sessions.map(c=>({id:c.id,cwd:c.cwd,engine:c.engine})),workersBefore)
 pass('Model-derived second-round questions, two actual adapter types, three stable workers, stale-answer rejection and Core restart preserve the same checkpoint')
 const second={id,expectedRevision:job.revision,answer:{values:{}},clientRequestId:randomUUID()};await invoke('workflow.respond',second);job=await stage(id,'focus')
 assert.equal(job.summary.round,3);assert.equal(job.summary.sourceCount,6);assert.equal(job.summary.domainCount,3);assert.ok(job.summary.findings.length>=3)
 const wire=()=>fs.readFileSync(path.join(control,'deep-research-wire.jsonl'),'utf8').trim().split('\n').map(JSON.parse)
 const researches=wire().filter(t=>t.kind==='research');assert.deepEqual(new Set(researches.map(t=>t.engine)),new Set(['codex','claude']))
 assert.ok(Math.abs(researches[0].at-researches[1].at)<5000,'independent research routes start concurrently')
 assert.equal(fs.readFileSync(path.join(control,'page-reads.jsonl'),'utf8').trim().split('\n').length,6)
 await assert.rejects(invoke('workflow.file',{id,name:'research-report.html'}),/final files/)
 fs.writeFileSync(path.join(control,'review-revise'),'')
 await invoke('workflow.respond',{id,expectedRevision:job.revision,answer:{values:{focus:'突出可验证的取舍，明确证据缺口。'}},clientRequestId:randomUUID()});job=await stage(id,'complete')
 assert.equal(job.status,'completed');assert.equal(job.files.length,3);assert.deepEqual(job.files.map(f=>f.name).sort(),['evidence.csv','research-report.html','research-report.md'])
 assert.ok(wire().filter(t=>t.kind==='research').length>=4,'blocking review causes targeted extra research')
 assert.ok(wire().filter(t=>t.kind==='review').length>=4,'evidence, lead and independent peer reviews all run')
 assert.equal(job.summary.reportReview?.verdict,'pass')
 assert.equal(job.summary.peerReview?.verdict,'pass')
 const leadReview=job.summary.tasks.find(t=>t.id.startsWith('final-review-'))
 const peerReview=job.summary.tasks.find(t=>t.id.startsWith('peer-review-'))
 assert.ok(leadReview&&peerReview&&leadReview.employeeId!==peerReview.employeeId,'final report is independently reviewed by two native employees')
 const deliverables=[]
 for(const entry of job.files){const file=await invoke('workflow.file',{id,name:entry.name});assert.equal(Buffer.byteLength(file.content),entry.bytes);assert.equal(createHash('sha256').update(file.content).digest('hex'),entry.sha256);assert.ok(!file.content.includes('[AEXUS_DEEP_RESEARCH_TASK]'));deliverables.push(file);fs.writeFileSync(path.join(out,entry.name),file.content)}
 assert.ok(deliverables.find(f=>f.name.endsWith('.html')).content.includes('source-filter'))
 assert.ok(deliverables.find(f=>f.name.endsWith('.csv')).content.includes('page_sha256'))
 for(const name of ['../state.json','state.json','delivery-staging/research-report.html'])await assert.rejects(invoke('workflow.file',{id,name}),/final files/)
 pass('Two independent routes fetch and match all source excerpts; blocking review adds research; final review gates exactly three hash-verified deliverables with no intermediate-file access')
 const cli=path.join(root,'Engine/deep-research/cli.mjs'),exported=path.join(test.temp,'final-delivery'),run=promisify(execFile)
 await run(process.execPath,[cli,'export',id,'--out',exported,'--json'],{env:f.env,timeout:20000})
 assert.deepEqual(fs.readdirSync(exported).sort(),job.files.map(f=>f.name).sort())
 await assert.rejects(run(process.execPath,[cli,'export',id,'--out',exported,'--json'],{env:f.env,timeout:20000}))
 for(const entry of job.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(exported,entry.name))).digest('hex'),entry.sha256)
 const priorCount=wire().length;await f.stop();await f.start();job=await invoke('workflow.get',{id});assert.equal(job.status,'completed');assert.equal(wire().length,priorCount)
 for(const worker of workersBefore){const status=(await rpc('session.status',{employee:worker.id}))[0];assert.equal(status.lastReply?.readAt,undefined)}
 const token=await f.token(workersBefore[0].id)
 const denied=await f.request(token,'contract.call',{version:'1.0.0',command:'workflow.get',args:{id}});assert.equal(denied.ok,false)
 pass('CLI exports only the final manifest and never overwrites an existing directory; completed restart is inert; original employee identity, read receipts and unauthorized access boundaries remain intact')
 fs.rmSync(path.join(control,'review-revise'));fs.writeFileSync(path.join(control,'bad-citations'),'')
 let bad=await invoke('workflow.start',{engineId:'deep-research',input,clientRequestId:randomUUID()})
 for(const phase of ['scope','direction','focus']){bad=await stage(bad.id,phase);await invoke('workflow.respond',{id:bad.id,expectedRevision:bad.revision,answer:{values:{}},clientRequestId:randomUUID()})}
 bad=await wait(async()=>{const value=await invoke('workflow.get',{id:bad.id});return value.status==='failed'?value:false},'invalid citation rejected')
 assert.deepEqual(bad.files,[]);await assert.rejects(invoke('workflow.file',{id:bad.id,name:'research-report.html'}));fs.rmSync(path.join(control,'bad-citations'))
 await invoke('workflow.resume',{id:bad.id,expectedRevision:bad.revision,clientRequestId:randomUUID()});bad=await stage(bad.id,'complete');assert.equal(bad.files.length,3)
 pass('Invented source IDs fail closed with no downloadable draft; an explicit retry reuses completed research and produces a reviewed final result')
 fs.writeFileSync(path.join(control,'hold-research'),'')
 let cancelled=await invoke('workflow.start',{engineId:'deep-research',input,clientRequestId:randomUUID()});cancelled=await stage(cancelled.id,'scope');await invoke('workflow.respond',{id:cancelled.id,expectedRevision:cancelled.revision,answer:{values:{}},clientRequestId:randomUUID()})
 cancelled=await wait(async()=>{const j=await invoke('workflow.get',{id:cancelled.id});return j.summary.tasks.some(t=>t.status==='running')?j:false},'owned task running')
 const runningWorker=cancelled.summary.tasks.find(t=>t.status==='running').employeeId
 await invoke('workflow.cancel',{id:cancelled.id});await wait(async()=>!(await rpc('session.status',{employee:runningWorker}))[0].busy,'owned task stopped')
 assert.equal((await invoke('workflow.get',{id:cancelled.id})).status,'cancelled');fs.rmSync(path.join(control,'hold-research'))
 for(const worker of workersBefore)assert.ok((await rpc('session.list')).sessions.some(c=>c.id===worker.id))
 pass('Explicit cancellation stops only the workflow-owned native task and preserves other research identities')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,fixture:'real authenticated Core and Codex/Claude adapter lifecycle; deterministic native outputs and intercepted synthetic public pages',paidModelCalls:0,productionDataUsed:false,files:job.files,completedId:id},null,2))
}catch(error){try{await test?.f.cli('status')}catch(cause){console.error(cause.message)}fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));throw error}finally{await test?.close();app.dispose()}
