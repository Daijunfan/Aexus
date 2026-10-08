import test from 'node:test'
import assert from 'node:assert/strict'
import {absorb} from '../../../Engine/deep-research/evidence.mjs'
import {create,describe,validateReport} from '../../../Engine/deep-research/model.mjs'
import {sourceQuote} from '../../../Engine/deep-research/sources.mjs'
import {retry} from '../../../Engine/deep-research/agents.mjs'
import {renderReport} from '../../../Engine/deep-research/report.mjs'
import {reply} from './fixtures/deep-research-answer.mjs'

const url='https://evidence.research.test/study'
const quoteA='The original evaluation measures recovery time under the same workload.'
const quoteB='A separate experiment records failure modes and explicitly reports limitations.'
const make=(quote,engine='codex',target=url)=>({engine,workerId:engine+'-worker',taskId:engine+'-task',result:{sources:[{url:target,title:'Synthetic evaluation',quote,sourceType:'primary'}],findings:[{statement:engine+' finding: '+quote,kind:'fact',urls:[target]}],gaps:[]}})
const setup=()=>{
 const state=create({topic:'Deterministic evidence provenance test'}),snapshots=[]
 const controller=new AbortController(),ctx={signal:controller.signal,checkpoint:async state=>{snapshots.push(structuredClone(state))}}
 return {state,ctx,snapshots,controller}
}
test('retry replaces only failed native steps and preserves successful parallel evidence',()=>{
 const {state}=setup();state.phase='research';state.generation=3
 const completed={taskId:'job/source/3',status:'completed',result:{sources:[]}},failed={taskId:'job/challenge/3',status:'failed',prompt:'PRIVATE_PROMPT',result:{secret:true}}
 state.tasks={source:completed,challenge:failed};state.absorbedTasks=[completed.taskId]
 retry(state)
 assert.equal(state.generation,3);assert.strictEqual(state.tasks.source,completed);assert.ok(!state.tasks.challenge)
 assert.equal(state.attemptCounts.challenge,1);assert.deepEqual(state.absorbedTasks,[completed.taskId])
 assert.ok(!JSON.stringify(state.previousTasks).includes('PRIVATE_PROMPT'));assert.ok(!JSON.stringify(state.previousTasks).includes('secret'))
})
test('a completed format repair does not trap a quality retry in a stale generation',()=>{
 const {state}=setup();state.phase='research';state.generation=2;state.repairRound=2
 state.tasks={research:{status:'failed',taskId:'original'},'research-format-repair':{status:'completed',taskId:'fixed',result:{sources:[]}}}
 retry(state);assert.equal(state.generation,3);assert.equal(state.repairRound,0);assert.equal(state.tasks['research-format-repair'].taskId,'fixed')
})
test('uncertain delivery and paused evidence verification retain original task identity',()=>{
 const {state}=setup();state.phase='research';state.generation=2
 const uncertain={taskId:'job/source/2',status:'failed',transportUncertain:true,deadline:1,error:'lost response'}
 state.tasks={source:uncertain};retry(state)
 assert.equal(state.tasks.source.taskId,'job/source/2');assert.equal(state.tasks.source.status,'running');assert.equal(state.generation,2);assert.equal(state.attemptCounts.source,undefined)
 state.tasks.source.status='completed';state.pausedForOwner=true;retry(state);assert.equal(state.generation,2)
})
test('all final export formats preserve each checked excerpt and its own provenance',async()=>{
 const {state,ctx}=setup();await absorb(state,ctx,[make(quoteA),make(quoteB,'claude')],{read})
 state.sources[0].excerpts[1].sha256='b'.repeat(64)
 state.plan={objective:'Test evidence provenance'};state.finishedAt=Date.now()
 const paragraph={text:'A bounded finding',kind:'fact',sourceIds:['S1']}
 state.report={title:'Provenance export',executiveSummary:[paragraph],sections:[{title:'Evidence',paragraphs:[paragraph]}],comparisons:[],recommendations:[paragraph],limitations:['Synthetic fixture']}
 const files=renderReport(state);assert.deepEqual(files.map(f=>f.name),['research-report.html','research-report.md','evidence.csv'])
 for(const file of files)for(const value of [quoteA,quoteB,'codex','claude',state.sources[0].excerpts[0].sha256,'b'.repeat(64)])assert.ok(file.content.includes(value),file.name+' retains '+value)
 const csv=files[2].content;assert.equal(csv.trim().split('\r\n').length,3);assert.ok(csv.includes('"S1-E1"'));assert.ok(csv.includes('"S1-E2"'));assert.ok(csv.includes('"contributing_workers"'))
})
const read=async target=>({url:target,body:'<title>Evaluation</title><p>'+quoteA+'</p><p>'+quoteB+'</p>',bytes:180})

test('same URL does not grant another engine credit for a fabricated excerpt',async()=>{
 const {state,ctx}=setup()
 await absorb(state,ctx,[make(quoteA),make('This invented sentence never appears in the retrieved original evaluation.','claude')],{read})
 assert.equal(state.sources.length,1);assert.deepEqual(state.sources[0].engines,['codex'])
 assert.equal(state.findings.length,1);assert.equal(state.findings[0].engine,'codex')
 assert.equal(state.rejectedSources.length,1);assert.equal(state.rejectedFindings.length,1)
 assert.deepEqual(state.verification,{total:2,checked:2,accepted:1,rejected:1,pendingAgents:0})
})
test('different checked excerpts share one stable source and one batch read',async()=>{
 const {state,ctx}=setup();let reads=0
 await absorb(state,ctx,[make(quoteA),make(quoteB,'claude')],{read:async target=>{reads++;return read(target)}})
 assert.equal(reads,1);assert.equal(state.sources.length,1);assert.equal(state.sources[0].excerpts.length,2)
 assert.deepEqual(state.sources[0].engines.sort(),['claude','codex'])
 assert.deepEqual(state.sources[0].excerpts.map(e=>e.workerIds),[['codex-worker'],['claude-worker']])
 assert.equal(state.findings.length,2);assert.ok(state.findings.every(f=>f.sourceIds[0]==='S1'))
 assert.ok(state.sources[0].excerpts.every(e=>/^[a-f0-9]{64}$/.test(e.sha256)))
})
test('reused source is re-read and a new unverified quote cannot inherit prior attribution',async()=>{
 const {state,ctx}=setup();await absorb(state,ctx,[make(quoteA)],{read});const first=structuredClone(state.sources[0])
 await absorb(state,ctx,[make('The evaluation promises that all deployments will be perfectly reliable.','claude')],{read})
 assert.deepEqual(state.sources[0],first);assert.equal(state.findings.length,1)
 await absorb(state,ctx,[make(quoteB,'claude')],{read})
 assert.equal(state.sources[0].id,first.id);assert.equal(state.sources[0].excerpts.length,2)
})
test('a finding cannot cite another submission or a historical source without its own checked excerpt',async()=>{
 const {state,ctx}=setup();await absorb(state,ctx,[make(quoteA)],{read})
 const other=make(quoteB,'claude','https://other.research.test/study');other.result.findings[0].urls=[url]
 await absorb(state,ctx,[other],{read});assert.equal(state.sources.length,2);assert.equal(state.findings.length,1)
 assert.equal(state.rejectedFindings.length,1)
})
test('equivalent tracked URLs and identical quotes deduplicate without duplicate findings on replay',async()=>{
 const {state,ctx}=setup(),submission=make(quoteA,'codex',url+'?utm_source=fixture#section')
 await absorb(state,ctx,[submission,make(quoteA,'claude')],{read})
 assert.equal(state.verification.total,1);assert.equal(state.sources.length,1)
 const original=state.sources[0].id
 await absorb(state,ctx,[submission],{read})
 assert.equal(state.sources[0].id,original);assert.equal(state.sources[0].excerpts.length,1);assert.equal(state.findings.length,2)
})
test('source restrictions apply before reading and after redirects',async()=>{
 const {state,ctx}=setup();state.sourcePolicy.allowedDomains=['evidence.research.test'];let reads=0
 await absorb(state,ctx,[make(quoteA)],{read:async target=>{reads++;return {...await read(target),url:'https://excluded.research.test/study'}}})
 assert.equal(reads,1);assert.equal(state.sources.length,0);assert.equal(state.findings.length,0)
 await absorb(state,ctx,[make(quoteA,'claude','https://excluded.research.test/study')],{read:async target=>{reads++;return read(target)}})
 assert.equal(reads,1)
})
test('checked sources are checkpointed before a slower source finishes',async()=>{
 const {state,ctx,snapshots}=setup();let release,entered
 const held=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve})
 const completion=absorb(state,ctx,[make(quoteA),make(quoteB,'claude','https://slow.research.test/study')],{read:async target=>{
  if(target.includes('slow.')){entered();await held}return read(target)
 }})
 await started;await new Promise(resolve=>setImmediate(resolve))
 assert.equal(state.sources.length,1);assert.ok(snapshots.some(s=>s.sources.length===1&&s.verification.checked===1))
 release();await completion;assert.equal(state.sources.length,2)
})
test('abort does not turn an interrupted fetch into a completed verification',async()=>{
 const {state,ctx,controller}=setup()
 await assert.rejects(absorb(state,ctx,[make(quoteA)],{read:async()=>{controller.abort(Error('test cancellation'));throw controller.signal.reason}}),/cancellation/)
 assert.equal(state.verification.checked,0);assert.equal(state.sources.length,0)
})
test('legacy source IDs remain stable but unknown historical worker attribution is not invented',async()=>{
 const {state,ctx}=setup();await absorb(state,ctx,[make(quoteA)],{read})
 delete state.sources[0].excerpts;state.sources[0].engines=['codex','unproven-provider']
 await absorb(state,ctx,[make(quoteB,'claude')],{read})
 assert.equal(state.sources[0].id,'S1');assert.deepEqual(state.sources[0].engines,['claude'])
 assert.deepEqual(state.sources[0].excerpts[0].workerIds,[])
})
test('public evidence projection includes per-excerpt proof but no prompt or raw material',async()=>{
 const {state,ctx}=setup();await absorb(state,ctx,[make(quoteA)],{read})
 state.materials=[{name:'private.md',text:'PRIVATE_CONTEXT'}]
 const summary=describe(state);assert.equal(summary.evidence[0].excerpts[0].taskIds[0],'codex-task')
 assert.ok(!JSON.stringify(summary).includes('PRIVATE_CONTEXT'));assert.equal(sourceQuote('word '.repeat(50)).split(' ').length,25)
})
test('report validation enforces substantial distinct chapters and comparisons in both languages',()=>{
 const sources=Array.from({length:6},(_,i)=>({id:'S'+(i+1)}))
 const report=reply('[AEXUS_DEEP_RESEARCH_TASK]\n\n'+JSON.stringify({taskId:'test',kind:'report',payload:{sources}}),'codex').report
 validateReport(report,sources,{language:'zh-CN'})
 for(const change of [r=>{r.sections=r.sections.slice(0,3)},r=>{r.comparisons=[]},r=>{r.sections[1].title=r.sections[0].title},r=>{r.sections.forEach(s=>s.paragraphs.forEach(p=>p.text='Short unsupported depth.'))}]){
  const invalid=structuredClone(report);change(invalid);assert.throws(()=>validateReport(invalid,sources,{language:'zh-CN'}))
 }
 const english=structuredClone(report);english.sections.forEach(s=>s.paragraphs.forEach(p=>p.text='Evidence supports a bounded conclusion and requires independent verification. '.repeat(15)))
 validateReport(english,sources,{language:'en'})
})
test('a changed page creates a new fingerprinted snapshot without inflating distinct-source quality',async()=>{
 const {state,ctx}=setup()
 await absorb(state,ctx,[make(quoteA)],{read})
 const before=state.sources[0].sha256
 const revised=async target=>({...await read(target),body:(await read(target)).body+'<p>Revised independent test notes.</p>'})
 await absorb(state,ctx,[make(quoteB,'claude')],{read:revised})
 assert.deepEqual(state.sources.map(source=>source.id),['S1','S2'])
 assert.equal(state.sources[0].sha256,before)
 assert.notEqual(state.sources[1].sha256,before)
 assert.deepEqual(state.findings.map(f=>f.sourceIds[0]),['S1','S2'])
 const summary=describe(state)
 assert.equal(summary.sourceCount,1)
 assert.equal(summary.sourceSnapshots,2)
 assert.equal(summary.insights.criteria.find(item=>item.id==='sources').current,1)
 assert.equal(summary.insights.revisedSources[0].versions,2)
})
