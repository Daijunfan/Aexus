// Real authenticated Core + disposable store; old workflow is seeded as history,
// never started through the retired Engine and never runs a paid model.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore(),checks=[]
const call=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.equal(result.ok,true,result.error);return result.data}
const failed=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.equal(result.ok,false,cmd+' unexpectedly succeeded');return result}
try{
 await call('group.add',{name:'Retired Research Fixture',mode:'build'})
 await call('group.add',{name:'A',mode:'build'})
 const owned=await f.create('Retired Research Worker','Retired Research Fixture'),outsider=await f.create('Unrelated Agent','A')
 const id='wf_'+randomUUID(),other='wf_'+randomUUID(),now=Date.now(),prompt='Legacy research task with an exact native receipt'
 const saved=(workflowId,status,tasks)=>({id:workflowId,engineId:'deep-research',engineVersion:'1.5.0',status,revision:1,createdAt:now,updatedAt:now,owner:{principal:{kind:'operator'},requestId:'fixture'},state:{phase:'research',team:'Retired Research Fixture',workers:[{id:owned.id,engine:'codex'}],tasks},summary:{title:'Retired research fixture',phase:'research'},files:[],startKey:'retired-'+workflowId,inputHash:'fixture',answers:{}})
 const directory=path.join(f.env.AGENTS_COMPANY_HOME,'workflows')
 await f.stop()
 for(const record of [saved(id,'waiting',{research:{status:'running',employeeId:owned.id,prompt}}),saved(other,'running',{queued:{status:'queued',employeeId:owned.id}})]){
  const folder=path.join(directory,record.id);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'state.json'),JSON.stringify(record))
 }
 await f.start()
 assert.equal((await call('workflow.list',{engineId:'deep-research',limit:1})).total,2)
 assert.equal((await call('workflow.list',{engineId:'deep-research',limit:1})).hasMore,true)
 assert.equal((await call('workflow.list',{engineId:'deep-research',limit:1,offset:1})).jobs.length,1)
 const brief=await call('workflow.list',{engineId:'deep-research',limit:1,brief:true})
 assert.equal(brief.total,2)
 assert.deepEqual(brief.jobs[0].summary,{title:'Retired research fixture',phase:'research'})
 assert.deepEqual(brief.jobs[0].files,[])
 for(const params of [{offset:-1},{limit:101},{limit:0},{brief:'true'}])await failed('workflow.list',{engineId:'deep-research',...params})
 const catalog=await call('contract.engines')
 assert.ok(catalog.engines.some(engine=>engine.id==='deep-research'&&engine.version==='2.0.0'&&engine.runtime==='runtime.mjs'))
 await failed('workflow.resume',{id,expectedRevision:1,clientRequestId:'retired-cannot-resume'})
 checks.push('Current research runtime is discoverable; retired 1.5 history remains paginated and cannot resume')
 const recovered=await f.until(async()=>{const status=await call('workflow.get',{id:other});return status.status==='cancelled'&&!status.controlPending?status:false},'retire running checkpoint')
 assert.equal(recovered.summary.title,'Retired research fixture')
 checks.push('Bootstrapping a retired running checkpoint never resumes inference; it safely transitions to stopped')
 const held=[owned,outsider]
 for(const card of held)fs.writeFileSync(path.join(f.control,card.id+'.hold-user'),'')
 await call('session.send',{employee:owned.id,text:prompt,clientMessageId:'retired-owned-turn'})
 await call('session.send',{employee:outsider.id,text:'Unrelated active session',clientMessageId:'external-ongoing'})
 await f.received(owned.id,prompt)
 await f.until(async()=>(await f.status(owned.id)).busy&&(await f.status(outsider.id)).busy,'both native turns running')
 const cancelled=await call('workflow.cancel',{id})
 assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.controlPending,false,cancelled.error)
 await f.until(async()=>!(await f.status(owned.id)).busy,'owned Agent stopped')
 assert.equal((await f.status(outsider.id)).busy,true)
 assert.equal((await call('workflow.cancel',{id})).status,'cancelled')
 checks.push('Stop matches the recorded native turn, interrupts it and leaves an unrelated Agent working')
 const agent=await f.token(outsider.id),denied=await f.request(agent,'workflow.delete',{id})
 assert.equal(denied.ok,false)
 const removed=await call('workflow.delete',{id})
 assert.deepEqual(removed,{id,deleted:true,archived:true})
 assert.equal((await call('workflow.list',{engineId:'deep-research'})).total,1)
 assert.equal(fs.existsSync(path.join(f.env.AGENTS_COMPANY_HOME,'workflow-deleted',id,'state.json')),true)
 await failed('workflow.get',{id})
 assert.deepEqual(await call('workflow.delete',{id}),removed)
 const status=await f.status(owned.id);assert.equal(status.id,owned.id)
 assert.equal((await f.status(outsider.id)).busy,true)
 checks.push('Delete archives the state, excludes it from list, preserves employees and retries idempotently')
 await f.stop();await f.start()
 assert.deepEqual(await call('workflow.delete',{id}),removed)
 assert.equal((await call('workflow.list',{engineId:'deep-research'})).total,1)
 fs.rmSync(path.join(f.control,outsider.id+'.hold-user'))
 checks.push('Deleted history remains inaccessible across restarts; Core still runs normally')
 console.log(checks.map(s=>'PASS '+s).join('\n'))
}catch(e){console.error(e.stack);throw e}finally{await f.close()}
