// Real isolated Core/CLI; scenarios are scheduled through existing APIs, never user state.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),checks=[],out=path.join(f.root,'.aexus/artifacts/plan-polish');fs.mkdirSync(out,{recursive:true})
const rpc=async(cmd,args={},token=null)=>{const value=await f.request(token,cmd,args);assert.ok(value.ok,value.error);return value.data}
const test=async(name,work)=>{try{await work();checks.push({name,passed:true});console.log('PASS '+name)}catch(error){checks.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.message)}}
const future=Date.now()+3*86400000,iso=ms=>new Date(ms).toISOString()
let a,b,finite,week,completed
try{
 await f.cli('group','add','Product');await f.cli('group','add','Operations')
 a=await f.create('Alex','Product');b=await f.create('Alex','Operations')
 const spec=(name,rule,extra={})=>({name,action:{type:'agent',employeeId:a.id,prompt:'Check the release and write a concise result.'},rule,...extra})
 finite=await rpc('schedule.create',{spec:spec('Three hourly release checks',{kind:'interval',everySeconds:3600,anchor:iso(future)},{maxOccurrences:3,plan:{priority:'high',tags:['release','bounded'],notes:'Only three scheduled checks.'}})})
 week=await rpc('schedule.create',{spec:spec('Sunday review / New York',{kind:'weekly',time:'17:00',days:[7],timezone:'America/New_York'},{until:iso(future+35*86400000),plan:{priority:'urgent',tags:['review','US'],notes:'A cross-time-zone review.'}})})
 await test('Bounded repeat: later calendar range does not invent extra occurrences',async()=>{
  const first=await rpc('plan.calendar',{from:iso(future-1000),to:iso(future+4*3600000),filter:{search:'Three hourly'}});assert.equal(first.events.length,3)
  const later=await rpc('plan.calendar',{from:iso(future+5*3600000),to:iso(future+86400000),filter:{search:'Three hourly'}});assert.deepEqual(later.events,[])
  assert.deepEqual((await rpc('schedule.preview',{id:finite.id,after:iso(future+5*3600000)})).times,[])
 })
 await test('Editor draft preview respects remaining count and proposed time',async()=>{
  const updated=await f.cli('schedule','preview',week.id,'--patch',JSON.stringify({rule:{kind:'weekly',time:'09:15',days:[1],timezone:'Asia/Tokyo'}}),'--count','2')
  for(const at of updated.times){const text=new Date(at).toLocaleString('en-US',{timeZone:'Asia/Tokyo',weekday:'long',hour:'2-digit',minute:'2-digit',hour12:false});assert.match(text,/Monday/);assert.match(text,/09:15/)}
  assert.equal((await rpc('schedule.get',{id:week.id})).rule.time,'17:00','preview must not persist the draft')
 })
 await test('Finished one-shot retains true outcome when planning notes are edited',async()=>{
  completed=await rpc('schedule.create',{spec:spec('Release approval follow-up',{kind:'once',at:iso(Date.now()+800)})})
  await f.until(async()=>(await rpc('schedule.history',{id:completed.id}))[0]?.status==='succeeded','one shot executed')
  const before=await rpc('schedule.get',{id:completed.id}),edited=await rpc('schedule.update',{id:completed.id,expectedRevision:before.revision,patch:{plan:{priority:'normal',tags:['done'],notes:'Reviewed after execution.'}}})
  assert.equal(edited.nextAt,null);assert.equal(edited.occurrences,1);assert.equal((await rpc('schedule.history',{id:completed.id})).length,1)
 })
 await test('Paged database keeps complete authorized tag facets',async()=>{
  for(let i=0;i<115;i++)await rpc('schedule.create',{spec:spec('Case '+String(i).padStart(3,'0'),{kind:'once',at:iso(future+i*60000)},{action:{type:'agent',employeeId:i%2?a.id:b.id,prompt:'Read the corresponding release checklist.'},plan:{priority:i%3?'normal':'high',tags:[i<100?'first-page':'second-page'],notes:'Fixture-only queue '+i}})})
  const page=await rpc('plan.query',{filter:{search:'Case'},sort:'name',limit:100});assert.equal(page.total,115);assert.equal(page.rows.length,100);assert.ok(page.facets.tags.includes('second-page'))
  const two=await rpc('plan.query',{filter:{search:'Case'},sort:'name',offset:100,limit:100});assert.equal(two.rows.length,15);assert.ok(two.rows.every(row=>!page.rows.some(first=>first.id===row.id)))
  const token=await f.token(a.id),own=await rpc('schedule.create',{spec:{...spec('Private reminder',{kind:'once',at:iso(future)}),action:{type:'agent',employeeId:'self',prompt:'Resume my work.'},plan:{tags:['self-only']}}},token)
  const scoped=await rpc('plan.query',{},token);assert.deepEqual(scoped.rows.map(row=>row.id),[own.id]);assert.deepEqual(scoped.facets.tags,['self-only'])
 })
 await test('Calendar truncation distinguishes a complete 100-run quota from high-frequency overflow',async()=>{
  const fixed=await rpc('schedule.create',{spec:spec('Exactly one hundred',{kind:'interval',everySeconds:60,anchor:iso(future)},{maxOccurrences:100})})
  const result=await rpc('plan.calendar',{from:iso(future-1),to:iso(future+4*3600000),filter:{search:'Exactly one hundred'}})
  assert.equal(result.events.length,100);assert.equal(result.truncated,false)
  await rpc('schedule.create',{spec:spec('Unlimited quick checks',{kind:'interval',everySeconds:60,anchor:iso(future)})})
  const overflow=await rpc('plan.calendar',{from:iso(future-1),to:iso(future+4*3600000),filter:{search:'Unlimited quick checks'}})
  assert.equal(overflow.events.length,100);assert.equal(overflow.truncated,true)
  const earlier=await f.cli('schedule','preview',fixed.id,'--after',iso(future+50*60000),'--count','100');assert.equal(earlier.times.length,49)
 })
 await test('Two identically named people stay independent in employee filters',async()=>{
  const first=await rpc('plan.query',{filter:{employee:a.id},limit:500}),second=await rpc('plan.query',{filter:{employee:b.id},limit:500})
  assert.ok(first.total>0&&second.total>0);assert.ok(first.rows.every(row=>row.action.employeeId===a.id));assert.ok(second.rows.every(row=>row.action.employeeId===b.id))
 })
 await test('Saved view edits reject stale writers and never alter schedule records',async()=>{
  const before=(await rpc('schedule.list')).map(row=>row.id),view=await rpc('plan.view-create',{spec:{name:'Release review board',layout:'board',groupBy:'priority',filter:{tags:['release']},sort:'nextAt',direction:'asc'}})
  await rpc('plan.view-update',{id:view.id,expectedRevision:view.revision,patch:{name:'Release board'}})
  assert.equal((await f.request(null,'plan.view-update',{id:view.id,expectedRevision:view.revision,patch:{name:'Stale'}})).ok,false)
  assert.deepEqual((await rpc('schedule.list')).map(row=>row.id),before)
 })
}finally{fs.writeFileSync(path.join(out,'core-scenarios.json'),JSON.stringify(checks,null,2));await f.close();process.exitCode=checks.some(check=>!check.passed)?1:0}
