import test from 'node:test'
import assert from 'node:assert/strict'
import {provision,retry,cancel,ask} from '../agents.mjs'

function fixture({lostCreate=false,conflictingRole=false,oldProjection=false}={}){
 const groups=[],sessions=[],calls=[];let lost=false
 const state={requestedEngine:'pi',workers:[],tasks:{}}
 const ctx={id:'wf_contract_public_case_027789defa',signal:new AbortController().signal,async checkpoint(){},client:{async invoke(command,args={}){
  calls.push({command,args:structuredClone(args)})
  if(command==='engine.check')return {ready:true}
  if(command==='group.list')return groups
  if(command==='group.add'){groups.push(args.name);return args.name}
  if(command==='session.list')return {sessions}
  if(command==='card.create'){
   const {profession,...fields}=args,card={...fields,id:'worker_'+sessions.length,[oldProjection?'profession':'role']:conflictingRole?'foreign engine':profession,initialization:{status:'ready'}}
   sessions.push(card)
   if(lostCreate&&!lost){lost=true;throw Object.assign(Error('Response lost after employee creation'),{code:'CONTRACT_TRANSPORT_ERROR'})}
   return card
  }
  if(command==='session.status')return sessions.filter(s=>s.id===args.employee).map(s=>({...s,busy:false}))
  throw Error('Unexpected API '+command)
 }}}
 return {state,ctx,calls,sessions,groups}
}

test('recovers accepted creation through public role field without duplicate employees',async()=>{
 const f=fixture({lostCreate:true});await assert.rejects(provision(f.state,f.ctx),/Response lost/);await provision(f.state,f.ctx)
 assert.equal(f.sessions.length,3);assert.equal(f.state.workers.length,3);assert.equal(f.calls.filter(c=>c.command==='card.create').length,3)
 assert.ok(f.sessions.every(s=>s.managementRole==='employee'&&s.role.startsWith('profile-improvement/'+f.ctx.id+'/')))
})
test('legacy profession projection remains compatible',async()=>{
 const f=fixture({lostCreate:true,oldProjection:true});await assert.rejects(provision(f.state,f.ctx));await provision(f.state,f.ctx);assert.equal(f.sessions.length,3)
})
test('does not adopt a foreign engine employee that shares the requested display name',async()=>{
 const f=fixture({lostCreate:true,conflictingRole:true});await assert.rejects(provision(f.state,f.ctx));await assert.rejects(provision(f.state,f.ctx),{code:'EMPLOYEE_CONFLICT'});assert.equal(f.sessions.length,1)
})
test('stable provenance survives display renaming during a lost creation response',async()=>{
 const f=fixture({lostCreate:true});await assert.rejects(provision(f.state,f.ctx));f.sessions[0].title='Renamed by user';await provision(f.state,f.ctx);assert.equal(f.sessions.length,3);assert.equal(f.state.workers[0].id,f.sessions[0].id)
})
test('existing worker identities are rechecked on resume',async()=>{
 for(const field of ['engine','role','managementRole','group']){const f=fixture();await provision(f.state,f.ctx);f.sessions[0][field]='foreign';await assert.rejects(provision(f.state,f.ctx),{code:'EMPLOYEE_CONFLICT'});assert.equal(f.sessions.length,3)}
 const f=fixture();await provision(f.state,f.ctx);f.sessions.shift();await assert.rejects(provision(f.state,f.ctx),{code:'EMPLOYEE_REMOVED'});assert.equal(f.sessions.length,2)
})
test('display-only rename is allowed but removed team is not recreated',async()=>{
 const f=fixture();await provision(f.state,f.ctx);f.sessions[0].title='New display label';await provision(f.state,f.ctx);f.groups.length=0;await assert.rejects(provision(f.state,f.ctx),{code:'TEAM_REMOVED'});assert.equal(f.sessions.length,3)
})
test('cancellation interrupts only the exact owned native message',async()=>{
 const calls=[],state={tasks:{a:{employeeId:'ours',status:'running',receipt:{messageId:'mine'}},b:{employeeId:'other',status:'running',receipt:{messageId:'old'}}}}
 await cancel(state,{client:{async invoke(command,args){calls.push({command,args});if(command==='session.status')return [{busy:true,currentTask:{messageId:args.employee==='ours'?'mine':'foreign'}}]}}})
 assert.deepEqual(calls.filter(x=>x.command==='session.interrupt'),[{command:'session.interrupt',args:{employee:'ours',expectedMessageId:'mine'}}])
})
test('timeout retry retains exact receipt rather than starting another attempt',()=>{
 const state={tasks:{a:{status:'failed',errorCode:'AGENT_TIMEOUT',receipt:{messageId:'same'},prompt:'unchanged'}},attention:{}}
 retry(state);assert.equal(state.tasks.a.status,'running');assert.equal(state.tasks.a.receipt.messageId,'same');assert.equal(state.tasks.a.prompt,'unchanged');assert.equal(state.attention,null)
})
test('successful repaired JSON remains authoritative during later workflow retry',async()=>{
 const result={value:'accepted'},state={tasks:{'write-repair':{status:'completed',result}}},ctx={client:{invoke(){throw Error('Must not replay a successful repair')}}}
 assert.deepEqual(await ask(state,ctx,'write',{},'write',{},()=>{throw Error('Unexpected validation')}),result)
})

test('cancels an accepted send with lost receipt only through the exact public user message',async()=>{
 const calls=[],state={tasks:{a:{employeeId:'ours',status:'failed',uncertain:true,prompt:'exact-original-task'},b:{employeeId:'peer',status:'failed',uncertain:true,prompt:'other-exact-task'}}}
 await cancel(state,{client:{async invoke(command,args){calls.push({command,args});if(command==='session.transcript')return {shown:[{role:'user',text:args.employee==='ours'?'exact-original-task':'different prompt',outbound:{taskId:'accepted'}}]};if(command==='session.status')return [{busy:true,currentTask:{messageId:'accepted'}}]}}})
 assert.deepEqual(calls.filter(x=>x.command==='session.interrupt').map(x=>x.args),[{employee:'ours',expectedMessageId:'accepted'}])
})
test('one cancellation failure does not prevent checking the other owned workers',async()=>{
 const calls=[],state={tasks:{a:{employeeId:'broken',status:'running',receipt:{messageId:'a'}},b:{employeeId:'valid',status:'running',receipt:{messageId:'b'}}}}
 await assert.rejects(cancel(state,{client:{async invoke(command,args){calls.push({command,args});if(command==='session.status'){if(args.employee==='broken')throw Error('Denied');return [{busy:true,currentTask:{messageId:'b'}}]}}}}),{code:'CANCEL_INCOMPLETE'})
 assert.ok(calls.some(x=>x.command==='session.interrupt'&&x.args.employee==='valid'))
})

test('retry transformation is deterministic; execution establishes the new deadline',()=>{
 const state={tasks:{a:{status:'failed',errorCode:'AGENT_TIMEOUT',receipt:{messageId:'same'},deadline:1}}},now=Date.now
 try{Date.now=()=>{throw Error('retry must not consult clock')};retry(state);assert.equal(state.tasks.a.deadline,undefined);assert.equal(state.tasks.a.receipt.messageId,'same')}finally{Date.now=now}
})
