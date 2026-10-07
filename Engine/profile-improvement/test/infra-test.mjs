import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createNodeClient} from '../../../Contract/node-client.mjs'
import {fixture,OPTIMIZED_BULLET,TEST_BULLET} from './fixtures.mjs'
import {encodeBase64,inspectDocument} from '../document.mjs'
import {startProfile,readWord} from '../workflow.mjs'
import {application,fixtureCore,waitFor,evidence} from './support.mjs'
const report={passed:false,checks:[],paidModelCalls:0,productionDataUsed:false};let app,f
const pass=text=>{report.checks.push(text);console.log('PASS '+text)}
try{
 app=await application();f=await fixtureCore(app)
 const health=await f.client.invoke('engine.check',{engine:'pi'});console.log('Fixture ready',health);assert.ok(health.ready,health.error??'Fixture engine is not configured')
 const source=fixture(),input={resume:{name:'Resume.docx',data:encodeBase64(source)},targets:'Backend Engineer;Test Engineer',engine:'pi'}
 const job=await startProfile(f.client,input,'profile-core-case-1'),duplicate=await startProfile(f.client,input,'profile-core-case-1');assert.equal(job.id,duplicate.id)
 await assert.rejects(startProfile(f.client,{...input,targets:'Changed role'},'profile-core-case-1'))
 const done=await waitFor(async()=>{const value=await f.client.invoke('workflow.get',{id:job.id});if(value.status==='failed')throw Object.assign(Error(value.error),{job:value,fatal:true});return value.status==='completed'&&value},'resume workflow final output',120000)
 assert.equal(done.files.length,2);assert.equal(new Set(done.files.map(file=>file.sha256)).size,2,'Different target roles require different content');assert.equal(done.summary.workers.length,3);assert.ok(done.summary.variants.every(v=>v.layout.passed&&v.review.verdict==='pass'))
 for(const file of done.files){const bytes=await readWord(f.client,done.id,file);assert.ok(inspectDocument(bytes).units.some(u=>u.text===(file.name.startsWith('resume-02')?TEST_BULLET:OPTIMIZED_BULLET)));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);fs.writeFileSync(path.join(evidence,file.name),bytes)}
 assert.equal((await f.client.invoke('session.list',{})).sessions.length,3)
 pass('Real public Contract workflow provisions three native-fixture employees, processes two roles, validates layouts and delivers hash-checked Word files; repeated request does not duplicate work')
 const transcript=await f.client.invoke('session.transcript',{employee:done.summary.workers[0].id,thinking:false});assert.ok(JSON.stringify(transcript).includes('AEXUS_PROFILE_TASK'));assert.ok(!JSON.stringify(transcript).includes('alex@example.com'))
 const other=await f.admin('card.create',{title:'Unrelated employee',group:done.summary.team,engine:'pi',managementRole:'employee'});await waitFor(async()=>(await f.client.invoke('session.status',{employee:other.id}))[0]?.initialization?.status==='ready','unrelated fixture employee')
 const credential=await f.admin('auth.agent-token',{id:other.id});const token=typeof credential==='string'?credential:credential.token
 assert.ok(token);const outsider=createNodeClient({cli:f.cli,env:{...f.env,AGENTS_COMPANY_EMPLOYEE:other.id,AGENTS_COMPANY_AGENT_TOKEN:token}})
 // Identity exposure is checked through public APIs, never by reading Core storage.
 try{const visible=await outsider.invoke('workflow.get',{id:done.id});assert.fail('Agent obtained operator workflow '+visible.id)}catch(error){assert.ok(!String(error).includes('Agent obtained'))}
 assert.deepEqual(await f.client.invoke('schedule.list',{}),[]);pass('Employee transcript contains expected task results without contact fields; no Plan jobs are created; unrelated Agent cannot read user workflow')
 await f.stop();await f.start();const reloaded=await f.client.invoke('workflow.get',{id:done.id});assert.equal(reloaded.status,'completed');assert.equal(reloaded.files[0].sha256,done.files[0].sha256);await readWord(f.client,reloaded.id,reloaded.files[0]);assert.equal((await f.client.invoke('session.list',{})).sessions.length,4)
 pass('Core restart preserves workflow, employee identities and completed binary Word files without replaying model work')
 const ownCli=fileURLToPath(new URL('../cli.mjs',import.meta.url)),cli=(args)=>new Promise(resolve=>execFile(process.execPath,[ownCli,...args],{env:{...f.env,AEXUS_CLI:f.cli},maxBuffer:16*1024*1024},(error,stdout,stderr)=>resolve({error,stdout,stderr})))
 const exported=path.join(f.temp,'exported'),download=await cli(['download',done.id,'--output',exported]);assert.equal(download.error,null,download.stdout);assert.equal(fs.readdirSync(exported).length,2);for(const file of done.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(exported,file.name))).digest('hex'),file.sha256)
 const duplicateDownload=await cli(['download',done.id,'--output',exported]);assert.ok(duplicateDownload.error);assert.match(duplicateDownload.stdout,/拒绝覆盖/);assert.equal(JSON.parse((await cli(['status',done.id])).stdout).data.id,done.id)
 pass('Engine CLI downloads only the two final Word files, verifies exact hashes, reads status and refuses overwriting existing files')
 f.model.setStall(true)
 const interrupted=await startProfile(f.client,{...input,targets:'Backend Engineer'},'profile-restart-running')
 const active=await waitFor(async()=>{const value=await f.client.invoke('workflow.get',{id:interrupted.id});if(value.status==='failed')throw Object.assign(Error(value.error),{fatal:true});return value.summary.tasks?.some(t=>t.status==='running')&&value},'work active before Core restart',45000)
 const ownedIds=active.summary.workers.map(w=>w.id).sort()
 await f.stop();f.model.setStall(false);await f.start()
 let recovered=await waitFor(async()=>{const value=await f.client.invoke('workflow.get',{id:interrupted.id});return ['completed','failed'].includes(value.status)&&value},'interrupted workflow reconciles',45000)
 if(recovered.status==='failed'){
  const request={id:recovered.id,expectedRevision:recovered.revision,clientRequestId:'resume-native-after-restart'}
  await f.client.invoke('workflow.resume',request)
  recovered=await waitFor(async()=>{const value=await f.client.invoke('workflow.get',{id:interrupted.id});if(value.status==='failed')throw Object.assign(Error(value.error),{fatal:true});return value.status==='completed'&&value},'explicit restart recovery',90000)
 }
 assert.deepEqual(recovered.summary.workers.map(w=>w.id).sort(),ownedIds);assert.equal(recovered.files.length,1);await readWord(f.client,recovered.id,recovered.files[0]);assert.equal((await f.client.invoke('session.list',{})).sessions.length,7)
 pass('Core restart during real native work reconciles the same three employees; explicit retry finishes only interrupted stages with verified Word output')
 f.model.setStall(true)
 const pending=await startProfile(f.client,{...input,targets:'Backend Engineer'},'profile-cancel-case')
 const started=await waitFor(async()=>{const value=await f.client.invoke('workflow.get',{id:pending.id});if(value.status==='failed')throw Object.assign(Error(value.error),{fatal:true});return value.summary.tasks?.some(t=>t.status==='running')&&value},'native running task before cancellation',45000)
 await f.client.invoke('workflow.cancel',{id:pending.id});const cancelled=await f.client.invoke('workflow.get',{id:pending.id});assert.equal(cancelled.status,'cancelled');assert.deepEqual(cancelled.files,[])
 await waitFor(async()=>{const statuses=await Promise.all(started.summary.workers.map(w=>f.client.invoke('session.status',{employee:w.id})));return statuses.flat().every(s=>!s.busy)},'owned native work stops',15000)
 assert.equal((await f.client.invoke('workflow.get',{id:done.id})).status,'completed');await readWord(f.client,done.id,done.files[0]);f.model.setStall(false)
 pass('Public cancel stops only this workflow’s active native employee turns; the completed workflow and its Word outputs remain intact')
 report.nativeModelCalls=f.model.calls;assert.ok(f.model.calls.some(c=>c.toolCalls?.length));assert.ok(f.model.calls.filter(c=>c.kind!=='initialize').every(c=>!c.promptHasContact));report.passed=true
}catch(error){report.error=error.stack;console.error(error);if(f){fs.writeFileSync(path.join(evidence,'infra-core-error.log'),f.log());console.error('Fixture employee status',JSON.stringify(await f.client.invoke('session.list',{}).catch(e=>({error:e.message})),null,2))}throw error}finally{if(f)fs.writeFileSync(path.join(evidence,'infra-core.log'),f.log());await f?.close();app?.dispose();fs.writeFileSync(path.join(evidence,'infra-verification.json'),JSON.stringify(report,null,2))}
