// Real isolated Core/Contract and deterministic native adapters. Never reads production state or calls paid models.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {profileApplication} from './fixtures/profile-application.mjs'
import {researchFixture} from './fixtures/deep-research-fixture.mjs'
const execute=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/research-studio-tests/core');fs.mkdirSync(out,{recursive:true})
const app=await profileApplication();let fixture;const checks=[]
const pass=text=>{checks.push(text);console.log('PASS '+text)}
try{
 fixture=await researchFixture({application:app.directory});const {f,invoke,rpc,stage}=fixture
 const cli=async(args,success=true)=>{
  try{const result=await execute(process.execPath,['Engine/deep-research/cli.mjs',...args,'--json'],{cwd:root,env:{...process.env,...f.env},maxBuffer:12*1024*1024});if(!success)throw Error('CLI unexpectedly succeeded');return JSON.parse(result.stdout).data}
  catch(error){if(success)throw error;assert.ok(error.code);return error}
 }
 const jobsBefore=(await invoke('workflow.list',{engineId:'deep-research'})).jobs.length,workersBefore=(await rpc('session.list',{})).sessions.length
 const background='PRIVATE_CONTEXT_ONLY\nUse representative workload tests and preserve limits.'
 const raw={files:[{name:'brief.md',encoding:'base64',content:Buffer.from(background).toString('base64')}]}
 const prepared=await invoke('workflow.prepare',{engineId:'deep-research',input:raw})
 assert.equal(prepared.materials[0].text,background);assert.equal(prepared.materials[0].provenance.sha256,createHash('sha256').update(background).digest('hex'))
 assert.equal((await invoke('workflow.list',{engineId:'deep-research'})).jobs.length,jobsBefore);assert.equal((await rpc('session.list',{})).sessions.length,workersBefore)
 await assert.rejects(invoke('workflow.prepare',{engineId:'deep-research',input:{files:[{name:'secret.pdf',encoding:'base64',content:'%%%'}]}}))
 await assert.rejects(invoke('workflow.prepare',{engineId:'missing-engine',input:raw}))
 const local=path.join(fixture.temp,'brief.md');fs.writeFileSync(local,background)
 assert.equal((await cli(['prepare','--attachments',JSON.stringify([local])])).materials[0].text,background)
 pass('Document preparation and CLI import return verified bytes/text without creating workflows, workers or model turns')
 let job=await cli(['start','--topic','多 Agent 文档交付与后续研究验收','--engines','codex,claude','--attachments',JSON.stringify([local])])
 job=await stage(job.id,'scope');const id=job.id
 await assert.rejects(invoke('workflow.export',{id,format:'pdf'}),/completed/)
 await assert.rejects(invoke('workflow.fork',{id,expectedRevision:job.revision,input:{topic:'premature'},clientRequestId:randomUUID()}),/completed/)
 const answer=job=>invoke('workflow.respond',{id:job.id,expectedRevision:job.revision,answer:{values:{}},clientRequestId:randomUUID()})
 for(const phase of ['scope','direction','focus']){job=await stage(id,phase);await answer(job)}
 job=await stage(id,'complete');assert.equal(job.files.length,3)
 const parent=JSON.stringify(job),manifest=JSON.stringify(job.files),token=await f.token(job.summary.workers[0].id)
 for(const [command,args] of [['workflow.prepare',{engineId:'deep-research',input:raw}],['workflow.export',{id,format:'pdf'}],['workflow.fork',{id,expectedRevision:job.revision,input:{topic:'forbidden'},clientRequestId:randomUUID()}]]){
  const denied=await f.request(token,'contract.call',{version:'1.0.0',command,args});assert.equal(denied.ok,false,command+' must not confer user workflow authority')
 }
 pass('Data hooks inherit Core authorization; Agents cannot import user documents, export another owner report or create a follow-up')
 for(const format of ['docx','pdf']){
  const file=await invoke('workflow.export',{id,format}),bytes=Buffer.from(file.content,file.encoding)
  assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.equal(bytes.subarray(0,format==='pdf'?5:2).toString(),format==='pdf'?'%PDF-':'PK')
  fs.writeFileSync(path.join(out,file.name),bytes);assert.equal(JSON.stringify((await invoke('workflow.get',{id})).files),manifest)
 }
 await assert.rejects(invoke('workflow.export',{id,format:'../pdf'}));await assert.rejects(invoke('workflow.export',{id,format:'exe'}))
 assert.equal(JSON.stringify(await invoke('workflow.get',{id})),parent)
 const directory=path.join(fixture.temp,'cli-exports');const exported=await cli(['export',id,'--format','all','--out',directory]);assert.equal(exported.files.length,5)
 for(const entry of exported.files){const bytes=fs.readFileSync(path.join(directory,entry.name));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256)}
 await cli(['export',id,'--format','all','--out',directory],false)
 pass('PDF/Word are real hash-checked binaries; CLI exports all five final formats without overwriting files or mutating the approved parent')
 const request={id,expectedRevision:job.revision,input:{topic:'继续核对恢复成本与最新反例'},clientRequestId:randomUUID()}
 const concurrent=await Promise.all([invoke('workflow.fork',request),invoke('workflow.fork',request),invoke('workflow.fork',request)])
 assert.equal(new Set(concurrent.map(j=>j.id)).size,1);let child=await stage(concurrent[0].id,'scope')
 assert.deepEqual(child.parent,{id,revision:job.revision,engineVersion:job.engineVersion});assert.deepEqual(child.summary.workers,[]);assert.equal(child.summary.sourceCount,0);assert.deepEqual(child.summary.materials,[])
 assert.ok(!JSON.stringify(child).includes('PRIVATE_CONTEXT_ONLY'));assert.equal(child.summary.priorResearch.title,job.summary.headline)
 await assert.rejects(invoke('workflow.fork',{...request,input:{topic:'different'}}),/different/)
 await assert.rejects(invoke('workflow.fork',{...request,expectedRevision:job.revision-1,clientRequestId:randomUUID()}),/changed/)
 await assert.rejects(invoke('workflow.fork',{...request,input:{topic:'forged',parent:{id:'other'}},clientRequestId:randomUUID()}))
 assert.equal(JSON.stringify(await invoke('workflow.get',{id})),parent)
 const childId=child.id;await f.stop();await f.start();child=await invoke('workflow.get',{id:childId});assert.equal(child.status,'waiting');assert.equal(child.parent.id,id)
 assert.equal((await invoke('workflow.fork',request)).id,childId)
 const follow=await cli(['fork',id,'--topic','明确同意复用背景材料','--reuse-materials','--request-id','cli-follow-up']);assert.equal(follow.parent.id,id);assert.equal(follow.summary.materials.length,1)
 const standalone=await invoke('workflow.start',{engineId:'deep-research',input:{topic:'Independent scope'},clientRequestId:randomUUID()});const independent=await stage(standalone.id,'scope');assert.ok(!independent.summary.questions[0].recommended.includes('明确同意复用'))
 await invoke('workflow.cancel',{id:childId});await invoke('workflow.cancel',{id:follow.id});await invoke('workflow.cancel',{id:independent.id})
 pass('Follow-ups have Core-stamped lineage, exactly-once creation, fresh workers/evidence, explicit material consent and restart-safe checkpoints')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,paidModelCalls:0,productionDataUsed:false},null,2))
}catch(error){fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack));throw error}finally{await fixture?.close();app.dispose()}
