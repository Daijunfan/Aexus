import test from 'node:test'
import assert from 'node:assert/strict'
import {create,run,retry,cancel,describe} from '../runtime.mjs'
import {encodeBase64,inspectDocument} from '../document.mjs'
import {fixture,scriptedResult,OPTIMIZED_BULLET,TEST_BULLET} from './fixtures.mjs'
function fake({mutate,loseFirstSend=false,failCommands=[]}={}){
 const calls=[],groups=[],sessions=[],receipts=new Map(),transcripts=new Map(),controller=new AbortController();let lost=false
 const client={async invoke(command,args={}){
  calls.push({command,args:structuredClone(args)});if(failCommands.includes(command))throw Error('Fixture permission denied')
  if(command==='engine.check')return {ready:true}
  if(command==='group.list')return groups
  if(command==='group.add'){groups.push(args.name);return {name:args.name}}
  if(command==='session.list')return {sessions}
  if(command==='card.create'){const s={...args,id:'worker-'+sessions.length,initialization:{status:'ready'}};sessions.push(s);return s}
  if(command==='session.status')return sessions.filter(s=>s.id===args.employee).map(s=>({...s,busy:false}))
  if(command==='session.send'){
   if(receipts.has(args.clientMessageId))return receipts.get(args.clientMessageId)
   const request=JSON.parse(args.text.split('\n\n')[1]),messageId='msg-'+receipts.size,receipt={messageId},answer=mutate?mutate(request,scriptedResult(request)):scriptedResult(request)
   const items=transcripts.get(args.employee)??[];items.push({role:'user',text:args.text,outbound:{taskId:messageId}},{role:'assistant',blocks:[{kind:'text',text:typeof answer==='string'?answer:JSON.stringify(answer)}]});transcripts.set(args.employee,items);receipts.set(args.clientMessageId,receipt)
   if(loseFirstSend&&!lost){lost=true;throw Object.assign(new Error('Fixture transport lost after acceptance'),{code:'CONTRACT_TRANSPORT_ERROR'})}
   return receipt
  }
  if(command==='session.transcript')return {shown:transcripts.get(args.employee)??[]}
  if(command==='session.interrupt')return {ok:true}
  throw Error('Unexpected Contract command '+command)
 }}
 let checkpoint;const ctx={id:'wf-profile-fixture-abcdef012345',client,signal:controller.signal,async checkpoint(state){checkpoint=structuredClone(state)}}
 return {ctx,calls,sessions,receipts,groups,controller,checkpoint:()=>checkpoint}
}
const input=()=>({resume:{name:'original.docx',data:encodeBase64(fixture())},targets:'后端开发；测试开发',engine:'pi'})
test('three independent workers collaborate and produce only role-specific final Word files',async()=>{
 const f=fake(),state=create(input()),result=await run(state,f.ctx)
 assert.equal(result.status,'completed');assert.equal(f.sessions.length,3);assert.equal(result.artifacts.length,2);assert.ok(result.artifacts.every(file=>file.encoding==='base64'&&file.name.endsWith('.docx')))
 for(const file of result.artifacts){const doc=inspectDocument(Buffer.from(file.content,'base64'));assert.ok(doc.units.some(u=>u.text===(file.name.startsWith('resume-02')?TEST_BULLET:OPTIMIZED_BULLET)))}
 const tasks=[...f.calls.filter(c=>c.command==='session.send')];assert.equal(tasks.length,6);assert.ok(tasks.every(t=>!t.args.text.includes('alex@example.com')))
 assert.equal(state.variants[0].layout.pages,1);assert.ok(state.variants.every(v=>v.layout.passed&&v.review.verdict==='pass'))
 const before=f.calls.length;await run(state,f.ctx);assert.equal(f.calls.length,before,'completed workflow never repeats work');assert.ok(!JSON.stringify(describe(state)).includes(state.resume.data))
})
test('accepted mutation with lost response resumes the same task instead of duplicating employee or work',async()=>{
 const f=fake({loseFirstSend:true}),state=create(input());await assert.rejects(run(state,f.ctx),/transport lost/)
 const saved=f.checkpoint(),count=f.receipts.size;retry(saved);const result=await run(saved,f.ctx)
 assert.equal(result.status,'completed');assert.equal(f.sessions.length,3);assert.equal(f.receipts.size,6);assert.ok(count>=1)
 const sends=f.calls.filter(c=>c.command==='session.send'),first=sends[0];assert.equal(sends.filter(s=>s.args.clientMessageId===first.args.clientMessageId).length,2);assert.equal(sends.filter(s=>s.args.clientMessageId===first.args.clientMessageId).every(s=>s.args.text===first.args.text),true)
})
test('a reviewer rejection gives writer specific feedback and cannot release a draft',async()=>{
 let rejected=false;const f=fake({mutate(request,result){if(request.kind==='review'&&!rejected){rejected=true;return {...result,verdict:'revise',issues:[{severity:'blocking',ids:request.payload.patches.map(p=>p.id),reason:'Check responsibility wording against source.'}]}}return result}}),state=create({...input(),targets:'后端开发'}),result=await run(state,f.ctx)
 assert.equal(result.status,'completed');const writers=f.calls.filter(c=>c.command==='session.send'&&JSON.parse(c.args.text.split('\n\n')[1]).kind==='write');assert.equal(writers.length,2);assert.ok(writers[1].args.text.includes('Check responsibility'))
})
test('exhausted quality gate remains failed; an explicit retry creates a new review round only',async()=>{
 let block=true;const f=fake({mutate(request,result){return request.kind==='review'&&block?{...result,verdict:'revise',issues:[{severity:'blocking',ids:request.payload.patches.map(p=>p.id),reason:'Unresolved claim'}]}:result}}),state=create({...input(),targets:'后端开发'})
 await assert.rejects(run(state,f.ctx),{code:'QUALITY_GATE_FAILED'});assert.equal(state.variants.length,0);block=false;retry(state);const result=await run(state,f.ctx);assert.equal(result.status,'completed');assert.ok(Object.keys(state.tasks).some(k=>k.includes('round-3')));assert.equal(f.sessions.length,3)
})
test('permission errors do not create employees; cancellation cannot interrupt another engine task',async()=>{
 const f=fake({failCommands:['group.add']}),state=create(input());await assert.rejects(run(state,f.ctx),/permission/);assert.equal(f.sessions.length,0)
 const called=[];state.tasks={ours:{status:'running',employeeId:'ours',receipt:{messageId:'ours-message'}},other:{status:'running',employeeId:'other',receipt:{messageId:'previous-message'}}}
 await cancel(state,{client:{async invoke(c,a){called.push({c,a});if(c==='session.status')return [{busy:true,currentTask:{messageId:a.employee==='ours'?'ours-message':'unrelated-message'}}]} }})
 assert.deepEqual(called.filter(c=>c.c==='session.interrupt').map(c=>c.a),[{employee:'ours',expectedMessageId:'ours-message'}])
})
