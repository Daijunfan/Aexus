import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

// Public conversations stay pristine; every role performs the shared native identity/index initialization.
const f=await fixtureCore(),{cli,create,ready,until,control}=f
const read=(employee,name)=>JSON.parse(fs.readFileSync(path.join(control,employee.id+'-'+name+'.json'),'utf8'))
try{
 await cli('group','add','Build')
 await cli('group','add','Work','--mode','work','--plugin','mininotion')
 const worker=await create('Clean Worker','Work'),buildWorker=await create('Build Worker','Build')
 let commonInstructions
 for(const [employee,profile] of [[worker,'agents-company-work'],[buildWorker,'agents-company-readonly']]){
  assert.equal((await f.status(employee.id)).initialization.status,'ready')
  assert.equal(employee.permissionMode,'default')
  assert.ok(fs.existsSync(path.join(control,employee.id+'-initializing.json')))
  const initial=read(employee,'initializing')
  assert.ok(initial.documentationTools);assert.match(initial.text,/identity/);assert.match(initial.text,/index/)
  const before=(await cli('session','transcript','--employee',employee.id)).items
  assert.deepEqual(before,[],'initialization must not leak into the public conversation')
  assert.equal((await f.status(employee.id)).lastReply,undefined)
  await cli('session','send','--employee',employee.id,'Read the current directory.')
  await until(()=>fs.existsSync(path.join(control,employee.id+'-work.json')),'ordinary work dispatch')
  await until(async()=>!(await f.status(employee.id)).busy,'ordinary work finishes')
  const work=read(employee,'work'),launch=read(employee,'thread-start')
  assert.equal(work.thread,initial.thread,'work resumes the initialized native identity')
  assert.equal(launch.permissions,profile);assert.equal(launch.sandbox,null)
  assert.match(launch.developerInstructions,/agents_company_documentation/)
  if(commonInstructions===undefined)commonInstructions=launch.developerInstructions
  else assert.equal(launch.developerInstructions,commonInstructions,'Build and Work share the same router prompt')
  const [context,body]=work.text.split('\n\n[Current message]\n')
  assert.ok(context.startsWith('[Aexus role]\n'+JSON.stringify({employeeId:employee.id,managementRole:'employee'})+'\n\n[Aexus message source]\n{"sourceView":null}\n'));assert.equal(body,'Read the current directory.');assert.ok(!context.includes('[Aexus private initialization]'))
  const history=(await cli('session','transcript','--employee',employee.id)).items
  assert.equal(history.filter(item=>item.role==='user').length,1)
  assert.ok(!JSON.stringify(history).includes('PRIVATE_INIT_READING_COMMENTARY'))
 }
 const manager=await cli('card','create','--title','Manager','--group','Build','--management-role','manager','--engine','codex','--model','gpt-6-luna','--effort','low')
 await ready(manager.id);assert.ok(fs.existsSync(path.join(control,manager.id+'-initializing.json')))
 assert.equal(read(manager,'thread-start').developerInstructions,commonInstructions)
 assert.deepEqual((await cli('session','transcript','--employee',manager.id)).items,[])
 await f.stop()
 const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),legacy=JSON.parse(fs.readFileSync(stateFile,'utf8'))
 legacy.fullAccessDefaultApplied=false;legacy.sessions.find(card=>card.id===worker.id).permissionMode='acceptEdits'
 fs.writeFileSync(stateFile,JSON.stringify(legacy));await f.start()
 assert.equal((await cli('session','list')).sessions.find(card=>card.id===worker.id).permissionMode,'acceptEdits')
 console.log('PASS shared native initialization with pristine public history, same-thread work, scoped Build/Work permissions, role metadata and preserved upgrade preferences; deterministic fixtures only')
}finally{await f.close()}
