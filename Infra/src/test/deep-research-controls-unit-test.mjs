import test from 'node:test'
import assert from 'node:assert/strict'
import {create,describe,respond,amend} from '../../../Engine/deep-research/model.mjs'
import {sourcePolicy,assertSourceAllowed,depthConfig,materials} from '../../../Engine/deep-research/policy.mjs'
import {verifySource} from '../../../Engine/deep-research/sources.mjs'
import {pause,retry} from '../../../Engine/deep-research/agents.mjs'
import {compatibleVersions} from '../../../Engine/deep-research/runtime.mjs'
import {extractPdfText} from '../../../Engine/deep-research/document.mjs'
import {researchPdfFixture} from './fixtures/deep-research-pdf.mjs'
import {createHash} from 'node:crypto'

const topic='Compare recoverability using independently verified sources'
test('research budgets and source policies are validated before side effects',()=>{
 assert.equal(depthConfig('deep').minSources,8);assert.equal(depthConfig('exhaustive').minDomains,4)
 for(const value of ['unknown','__proto__',{},null])assert.throws(()=>depthConfig(value))
 for(const value of ['localhost','example.com/private','127.0.0.1','example.org:444','https://example.org','foo.local'])assert.throws(()=>sourcePolicy({allowedDomains:[value]}))
 const p=sourcePolicy({allowedDomains:['EXAMPLE.ORG','*.example.org'],excludedDomains:['blocked.example.org']})
 assert.deepEqual(p.allowedDomains,['example.org']);assertSourceAllowed('https://www.example.org/a',p)
 assert.throws(()=>assertSourceAllowed('https://example.org.evil.test/a',p));assert.throws(()=>assertSourceAllowed('https://blocked.example.org/a',p))
 assert.throws(()=>sourcePolicy({seedUrls:['https://example.net/a'],allowedDomains:['example.org']}))
 for(const url of ['http://127.0.0.1/a','http://169.254.169.254/a','http://[::ffff:127.0.0.1]/a','https://localhost/a'])assert.throws(()=>create({topic,sourcePolicy:{seedUrls:[url]}}))
 assert.throws(()=>create({topic,secretOverride:true}));assert.throws(()=>create({topic,language:'invalid'}))
})
test('uploaded materials are bounded context, not independently verified evidence',()=>{
 const reference={name:'brief.md',text:'# User context\nUser-provided text\twith a tab'}
 assert.equal(materials([reference])[0].text,reference.text)
 assert.throws(()=>materials([{name:'paper.pdf',text:'Extracted PDF text with independently checkable context.'}]),/workflow.prepare/); // Office/PDF must be prepared and provenance-recorded by the document worker
 for(const bad of [{name:'binary.pdf',text:'%PDF-1.7\u0000binary'},{name:'brief.txt',text:'\u0000binary'},{name:'brief.txt',text:'a'.repeat(80001)}])assert.throws(()=>materials([bad]))
 const state=create({topic,materials:[reference]});assert.equal(state.sources.length,0);assert.equal(describe(state).sourceCount,0)
 assert.deepEqual(describe(state).materials,[{name:'brief.md',characters:reference.text.length}]);assert.ok(!JSON.stringify(describe(state)).includes(reference.text))
})
test('disallowed URLs never reach the reader; redirected destinations are checked independently',async()=>{
 let reads=0
 const candidate={url:'https://example.org/start',title:'Source',quote:'A precise excerpt that exists in the verified source.'}
 const read=async()=>{reads++;return {url:'https://blocked.test/final',body:'<p>'+candidate.quote+'</p>',bytes:100}}
 await assert.rejects(verifySource(candidate,{read,policy:sourcePolicy({excludedDomains:['example.org']})}),/排除/);assert.equal(reads,0)
 await assert.rejects(verifySource(candidate,{read,policy:sourcePolicy({allowedDomains:['example.org']})}),/范围/);assert.equal(reads,1)
})
test('published PDF sources are independently text-matched, fingerprinted and safely projected',async()=>{
 const quote='Independent research findings are checked against the exact source text.'
 const bytes=researchPdfFixture(quote),url='https://example.org/whitepaper.pdf'
 assert.ok(bytes.length<2000)
 assert.equal(await extractPdfText(bytes),quote)
 const candidate={url,title:'Original whitepaper',quote,sourceType:'primary'}
 const read=async()=>({url,body:bytes,bytes:bytes.length,mediaType:'application/pdf'})
 const source=await verifySource(candidate,{read})
 assert.equal(source.format,'pdf');assert.equal(source.quote,quote)
 assert.equal(source.sha256,createHash('sha256').update(bytes).digest('hex'))
 const state=create({topic});state.sources=[{...source,id:'S1',engines:['claude']}]
 assert.equal(describe(state).evidence[0].format,'pdf')
 await assert.rejects(verifySource({...candidate,quote:'This sentence does not exist in the independent research PDF.'},{read}),/未找到/)
 await assert.rejects(extractPdfText(Buffer.from('not a PDF')),/PDF 文件头/)
 await assert.rejects(extractPdfText(Buffer.alloc(8*1024*1024+1)),/8 MiB/)
 await assert.rejects(extractPdfText(researchPdfFixture('')),/可提取文字/)
})
test('public progress exposes real counts and no private prompts, results or user material',()=>{
 const state=create({topic});state.phase='research';state.tasks={one:{status:'completed',title:'Source search',employeeId:'worker',engine:'codex',prompt:'SECRET_TASK_PROMPT',result:{internal:'PRIVATE_RAW_RESULT'}},two:{status:'running',employeeId:'other',engine:'claude'}}
 const summary=describe(state);assert.equal(summary.metrics.completedTasks,1);assert.equal(summary.metrics.activeTasks,1);assert.ok(summary.progress>=20&&summary.progress<58)
 assert.ok(!JSON.stringify(summary).includes('SECRET_TASK_PROMPT'));assert.ok(!JSON.stringify(summary).includes('PRIVATE_RAW_RESULT'))
 const legacy={...state,version:1};delete legacy.depth;delete legacy.materials;delete legacy.sourcePolicy;assert.equal(describe(legacy).budget.minSources,4);assert.ok(compatibleVersions.includes('1.0.0'))
})
test('editable research plans retain independent routes and reject incomplete structure',()=>{
 const state=create({topic});state.phase='direction';state.plan={title:'Study',objective:'Original',tracks:['Original evidence','Counterevidence'],successCriteria:['Verifiable','Reproducible'],questions:[{id:'plan-0',prompt:'Target?',recommended:'Personal use'}]};state.questions=state.plan.questions
 const edited=respond(structuredClone(state),{values:{},plan:{objective:'Measure recoverability',tracks:['Source evidence','Failure modes']}})
 assert.equal(edited.phase,'research');assert.equal(edited.plan.objective,'Measure recoverability')
 assert.throws(()=>respond(structuredClone(state),{values:{},plan:{tracks:['Only one route']}}))
})
test('pause interrupts exact owned task only; retry preserves successful steps and identities',async()=>{
 const state=create({topic});state.workers=[{id:'a'},{id:'b'}];state.tasks={complete:{status:'completed',result:{valid:true}},owned:{employeeId:'a',status:'running',receipt:{messageId:'ours'}},unrelated:{employeeId:'b',status:'running',receipt:{messageId:'old'}}}
 const busy=new Set(['a','b']),interrupts=[],ctx={signal:new AbortController().signal,client:{invoke:async(name,args)=>{
  if(name==='session.status')return [{busy:busy.has(args.employee),currentTask:{messageId:args.employee==='a'?'ours':'another-owner'}}]
  if(name==='session.interrupt'){interrupts.push(args);busy.delete(args.employee);return {interrupted:true}}
  throw Error('Unexpected call '+name)
 }}}
 await pause(state,ctx);assert.deepEqual(interrupts,[{employee:'a',expectedMessageId:'ours'}]);assert.ok(busy.has('b'));assert.equal(state.tasks.owned.status,'paused')
 retry(state);assert.ok(state.tasks.complete);assert.equal(state.tasks.owned,undefined);assert.deepEqual(state.workers,[{id:'a'},{id:'b'}])
})
test('research revisions keep permitted source identities and invalidate obsolete conclusions',()=>{
 const state=create({topic});state.phase='write';state.workers=[{id:'stable-worker'}];state.plan={title:'Old',objective:'Old objective'};state.reportDraft={title:'Obsolete draft'};state.reportReview={verdict:'pass'}
 state.sources=[{id:'S1',url:'https://example.org/a',finalUrl:'https://example.org/a'},{id:'S5',url:'https://elsewhere.test/b',finalUrl:'https://elsewhere.test/b'}]
 state.findings=[{statement:'Keep',sourceIds:['S1']},{statement:'Remove',sourceIds:['S5']}];state.tasks={report:{status:'completed',prompt:'PRIVATE',result:{title:'Obsolete'}}}
 amend(state,{note:'Focus on reproducible recovery, not throughput',sourcePolicy:{allowedDomains:['example.org']},depth:'deep'})
 assert.equal(state.phase,'plan');assert.equal(state.tasks.report,undefined);assert.equal(state.reportDraft,undefined);assert.equal(state.reportReview,undefined)
 assert.deepEqual(state.sources.map(s=>s.id),['S1']);assert.deepEqual(state.findings.map(f=>f.statement),['Keep']);assert.deepEqual(state.workers,[{id:'stable-worker'}]);assert.ok(state.generation>0)
 assert.ok(!JSON.stringify(state.previousTasks).includes('PRIVATE'));assert.equal(state.amendments.length,1)
 assert.throws(()=>amend(state,{note:'',sourcePolicy:{}}));assert.throws(()=>amend(state,{note:'valid',engine:'another'}))
})
