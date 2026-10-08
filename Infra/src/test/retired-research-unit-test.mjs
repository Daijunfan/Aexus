import test from 'node:test'
import assert from 'node:assert/strict'
import {stopRetiredResearch} from '../main/retired-research.ts'

test('matching native receipt is the only condition that permits stopping an Agent',async()=>{
 const calls=[],state={workers:[{id:'employee-a'}],tasks:{research:{status:'running',employeeId:'employee-a',receipt:{messageId:'turn-ours'}}}}
 let busy=true
 const call=async(cmd,args)=>{calls.push({cmd,args});if(cmd==='session.status')return [{busy,currentTask:busy?{messageId:'turn-ours'}:undefined}];if(cmd==='session.interrupt'){busy=false;return {interrupted:true}};throw Error('Unexpected '+cmd)}
 assert.deepEqual(await stopRetiredResearch(state,call),{checked:1,stopped:true})
 assert.deepEqual(calls.filter(item=>item.cmd==='session.interrupt'),[{cmd:'session.interrupt',args:{employee:'employee-a',expectedMessageId:'turn-ours'}}])
 assert.equal(state.tasks.research.status,'cancelled')
})
test('a new unrelated turn on the same worker is preserved',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{old:{status:'running',employeeId:'employee-a',receipt:{messageId:'turn-ours'}}}},calls=[]
 await stopRetiredResearch(state,async(cmd)=>{calls.push(cmd);if(cmd==='session.status')return [{busy:true,currentTask:{messageId:'turn-unrelated'}}];throw Error('Must not interrupt other work')})
 assert.deepEqual(calls,['session.status','session.status']);assert.equal(state.tasks.old.status,'cancelled')
})
test('lost receipt is recovered only from one exact native transcript',async()=>{
 const prompt='exact private prompt',state={workers:[{id:'employee-a'}],tasks:{part:{status:'running',employeeId:'employee-a',prompt}}},commands=[]
 let busy=true
 await stopRetiredResearch(state,async(cmd,args)=>{commands.push(cmd);if(cmd==='session.status')return [{busy,currentTask:{messageId:'native-44'}}];if(cmd==='session.transcript')return {items:[{role:'user',text:prompt,outbound:{taskId:'native-44'}}]};if(cmd==='session.interrupt'){assert.equal(args.expectedMessageId,'native-44');busy=false;return {interrupted:true}};throw Error(cmd)})
 assert.equal(state.tasks.part.receipt.messageId,'native-44');assert.ok(commands.includes('session.interrupt'))
})
test('uncertain receipts and unsupported worker identities block destructive cleanup',async()=>{
 for(const task of [{status:'running',employeeId:'employee-a',transportUncertain:true},{status:'running',employeeId:'employee-b',receipt:{messageId:'ours'}}]){
  const state={workers:[{id:'employee-a'}],tasks:{task}}
  await assert.rejects(stopRetiredResearch(state,async cmd=>{if(cmd==='session.status')return [{busy:true,currentTask:{messageId:'current'}}];if(cmd==='session.transcript')return {items:[]};throw Error('Unexpected '+cmd)}),/receipt|identity/)
  assert.equal(task.status,'running')
 }
})
test('two matching transcript receipts are ambiguous and must not interrupt',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{task:{status:'running',employeeId:'employee-a',prompt:'P'}}}
 await assert.rejects(stopRetiredResearch(state,async cmd=>{if(cmd==='session.status')return [{busy:true,currentTask:{messageId:'first'}}];if(cmd==='session.transcript')return {items:[{role:'user',text:'P',outbound:{taskId:'first'}},{role:'user',text:'P',outbound:{taskId:'second'}}]};throw Error('Forbidden interrupt')}),/Multiple matching/)
})
test('waiting approvals cannot be assumed stopped without identifying the task',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{task:{status:'approval',employeeId:'employee-a',receipt:{messageId:'native'}}}}
 await assert.rejects(stopRetiredResearch(state,async cmd=>{if(cmd==='session.status')return [{busy:false,waitingApproval:true}];throw Error('unexpected')}),/uncertain native receipt/)
})
test('idle research Agent sessions are closed only with an empty queue and no background jobs',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{part:{status:'completed',employeeId:'employee-a'}}}
 const calls=[]
 await stopRetiredResearch(state,async(cmd,args)=>{
  calls.push(cmd)
  if(cmd==='session.status')return [{busy:false,sessionId:'session-a'}]
  if(cmd==='session.queue')return []
  if(cmd==='session.background')return {data:[]}
  if(cmd==='session.close')return {closed:true}
  throw Error('Unexpected '+cmd)
 })
 assert.deepEqual(calls,['session.status','session.queue','session.background','session.status','session.close'])
})
test('a research turn queued behind unrelated work is removed by its exact queue ID',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{waiting:{status:'running',employeeId:'employee-a',prompt:'RESEARCH_QUEUE'}}},calls=[]
 await stopRetiredResearch(state,async(cmd,args)=>{
  calls.push({cmd,args})
  if(cmd==='session.status')return [{busy:true,sessionId:'sid',currentTask:{messageId:'unrelated-active'}}]
  if(cmd==='session.transcript')return {items:[]}
  if(cmd==='session.queue')return [{id:'queue-only-ours',text:'RESEARCH_QUEUE'},{id:'queue-other',text:'UNRELATED_QUEUE'}]
  if(cmd==='session.dequeue')return [{id:'queue-other',text:'UNRELATED_QUEUE'}]
  throw Error('Unexpected '+cmd)
 })
 assert.deepEqual(calls.filter(item=>item.cmd==='session.dequeue').map(item=>item.args.messageId),['queue-only-ours'])
 assert.equal(state.tasks.waiting.status,'cancelled')
 assert.equal(calls.some(item=>item.cmd==='session.interrupt'||item.cmd==='session.close'),false)
})
test('queued messages prevent automatic shutdown of a shared Agent session',async()=>{
 const state={workers:[{id:'employee-a'}],tasks:{}},calls=[]
 await stopRetiredResearch(state,async cmd=>{
  calls.push(cmd)
  if(cmd==='session.status')return [{busy:false,sessionId:'session-a'}]
  if(cmd==='session.queue')return [{id:'unrelated-queued-message'}]
  if(cmd==='session.background')return {data:[]}
  throw Error('Must not close a session with queued unrelated work')
 })
 assert.deepEqual(calls,['session.status','session.queue','session.background'])
})

test('queued unsent tasks, completed steps and removed workers do not start Agent calls',async()=>{
 const state={workers:[{id:'employee-a'},{id:'employee-b'}],tasks:{done:{status:'completed',employeeId:'employee-a'},queue:{status:'queued',employeeId:'employee-a'},removed:{status:'running',employeeId:'employee-b',receipt:{messageId:'gone'}}}},commands=[]
 const result=await stopRetiredResearch(state,async(cmd,args)=>{commands.push(cmd);if(cmd==='session.status')return args.employee==='employee-a'?[{busy:true,currentTask:{messageId:'other-work'}}]:[];throw Error(cmd)})
 assert.equal(result.checked,2);assert.equal(state.tasks.done.status,'completed');assert.equal(state.tasks.queue.status,'cancelled');assert.equal(state.tasks.removed.status,'cancelled');assert.deepEqual(commands,['session.status','session.status','session.status','session.status'])
})
