// Regression locks for issues first found during the interactive exploration in .aexus/artifacts/plan-parity.
// Operator-only disposable Core; no production credentials, paid models or real hosts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
const iso=ms=>new Date(ms).toISOString(),day=86400000,base=Date.now()+40*day
try{
  const source=fs.readFileSync(path.join(f.root,'Infra/Plugins/mini-notion/src/database/viewTypes.ts'),'utf8')
  const notion=[...source.matchAll(/\{ type: '([^']+)'/g)].map(match=>match[1])
  const schema=await f.cli('plan','schema'),views=await f.cli('plan','views')
  assert.deepEqual(new Set(schema.layouts),new Set(notion),'source-versioned Notion layout catalog must stay in parity')
  assert.equal(notion.length,10);assert.deepEqual(views.filter(view=>view.builtin).map(view=>view.layout),schema.layouts)
  await f.cli('group','add','Release Studio');await f.cli('group','add','Night Operations')
  const a=await f.create('Alex','Release Studio'),b=await f.create('Alex','Night Operations')
  const once=(name,at,extra={})=>({name,action:{type:'agent',employeeId:a.id,prompt:'Review rehearsal evidence; do not publish or deploy.'},rule:{kind:'once',at:iso(at)},...extra})
  const estimated=await rpc('schedule.create',{spec:once('Three-hour cross-date review',base,{timeoutSeconds:60,plan:{durationMinutes:180,priority:'high',tags:['overlap'],notes:'Estimate does not reserve the employee.'}})})
  const ending=await rpc('schedule.create',{spec:once('Ends exactly at the boundary',base-2*3600000,{plan:{durationMinutes:120,priority:'normal',tags:['boundary'],notes:''}})})
  const instant=await rpc('schedule.create',{spec:once('Point only',base)})
  const spans=await f.cli('plan','timeline','--from',iso(base),'--to',iso(base+day),'--timezone','America/New_York')
  assert.ok(!spans.events.some(event=>event.jobId===ending.id),'[start,end) excludes a span ending at the left boundary')
  const forecast=spans.events.find(event=>event.jobId===estimated.id)
  assert.equal(Date.parse(forecast.endAt)-Date.parse(forecast.startAt),180*60000);assert.equal(forecast.durationKind,'estimate');assert.equal(forecast.canReschedule,true)
  assert.equal((await rpc('schedule.get',{id:estimated.id})).timeoutSeconds,60)
  assert.equal(spans.events.find(event=>event.jobId===instant.id).durationKind,'point');assert.equal(spans.events.find(event=>event.jobId===instant.id).endAt,null)
  const continued=await rpc('plan.timeline',{from:iso(base+3600000),to:iso(base+day),filter:{tags:['overlap']}});assert.equal(continued.events[0].jobId,estimated.id)
  const finite=await rpc('schedule.create',{spec:{...once('Two dates only',base),rule:{kind:'interval',anchor:iso(base),everySeconds:3600},maxOccurrences:2}})
  assert.deepEqual((await rpc('plan.timeline',{from:iso(base+day),to:iso(base+2*day),filter:{search:'Two dates only'}})).events,[])
  const saved=await f.cli('plan','view-create','--spec',JSON.stringify({name:'London timeline',layout:'timeline',filter:{tags:['overlap']},options:{timezone:'Europe/London',timelineScale:'week'}}))
  assert.equal(saved.options.timezone,'Europe/London')
  for(const layout of ['plan','gallery','chart','feed','form']){
    const view=await f.cli('plan','view-create','--spec',JSON.stringify({name:'Saved '+layout,layout,options:layout==='chart'?{chartType:'donut',chartMetric:'runs',chartGroupBy:'team'}:{}}))
    assert.equal(view.layout,layout)
  }
  const invalid=await f.request(null,'plan.view-create',{spec:{name:'bad',layout:'timeline',options:{timezone:'Invalid/Zone'}}});assert.equal(invalid.ok,false)
  const stale=await f.request(null,'schedule.update',{id:estimated.id,patch:{rule:{kind:'once',at:iso(base+day)}},expectedRevision:0});assert.equal(stale.ok,false)
  const moved=await rpc('schedule.update',{id:estimated.id,patch:{rule:{kind:'once',at:iso(base+day)}},expectedRevision:estimated.revision});assert.equal(moved.plan.durationMinutes,180);assert.equal(moved.action.employeeId,a.id)
  const cliEstimate=await f.cli('schedule','create','--name','CLI estimate','--employee',a.id,'--at',iso(base),'--prompt','Review only','--duration-minutes','90','--paused');assert.equal(cliEstimate.plan.durationMinutes,90)
  for(let i=0;i<108;i++)await rpc('schedule.create',{spec:{...once('Portfolio '+i,base+i*60000),action:{type:'agent',employeeId:i%2?a.id:b.id,prompt:'Rehearsal only'},enabled:i<96,plan:{priority:'normal',tags:['portfolio'],notes:''}}})
  const paged=await rpc('plan.query',{filter:{tags:['portfolio']},limit:100});assert.equal(paged.rows.length,100)
  const analytics=await f.cli('plan','analytics','--metric','schedules','--group-by','status','--filter','{"tags":["portfolio"]}')
  assert.equal(analytics.total,108);assert.equal(analytics.buckets.find(bucket=>bucket.key==='scheduled').value,96);assert.equal(analytics.buckets.find(bucket=>bucket.key==='paused').value,12)
  const people=await rpc('plan.analytics',{groupBy:'employee',filter:{tags:['portfolio']}});assert.equal(people.buckets.length,2);assert.ok(people.buckets.every(bucket=>bucket.value===54));assert.notEqual(people.buckets[0].label,people.buckets[1].label)
  assert.equal((await rpc('plan.analytics',{metric:'runs',filter:{tags:['portfolio']}})).total,0,'future work is not execution')
  const actual=await rpc('schedule.create',{spec:once('Actual fixture review',base,{enabled:false})})
  await f.cli('schedule','run',actual.id);await f.until(async()=>(await f.cli('schedule','history',actual.id))[0]?.status==='succeeded','first actual attempt')
  const first=(await rpc('plan.feed',{limit:1})).entries[0]
  await f.cli('schedule','run',actual.id);await f.until(async()=>(await f.cli('schedule','history',actual.id)).filter(run=>run.status==='succeeded').length===2,'second actual attempt')
  const head=await f.cli('plan','feed','--limit','1');assert.ok(head.nextCursor);assert.equal((await rpc('plan.feed',{before:head.nextCursor,limit:1})).entries[0].id,first.id)
  await f.cli('schedule','delete',actual.id)
  const feed=await rpc('plan.feed',{});assert.equal(feed.entries.length,2);assert.ok(feed.entries.every(entry=>!entry.jobAvailable))
  const historic=await rpc('plan.analytics',{metric:'runs',groupBy:'priority'});assert.equal(historic.total,2);assert.equal(historic.buckets[0].key,'__unknown__')
  assert.equal((await f.request(null,'plan.feed',{before:'not-a-cursor'})).ok,false)
  const definitions=await f.cli('schedule','list');await f.stop();await f.start()
  assert.equal((await f.cli('plan','views')).find(view=>view.id===saved.id).options.timelineScale,'week')
  assert.deepEqual((await f.cli('schedule','list')).map(job=>job.id),definitions.map(job=>job.id))
  console.log('PASS parity read models: ten source-matched layouts; estimate/timeout separation; half-open overlaps; finite quotas; saved options; revision-safe moves; full-data chart counts; distinct same-name people; actual-only feed and removed-job audit; restart')
}finally{await f.close()}
