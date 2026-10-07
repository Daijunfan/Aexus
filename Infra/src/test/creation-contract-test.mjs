import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore(),{cli,create}=f
try{
  await cli('group','add','Original')
  const preferred=await cli('card','create','--title','Default Codex','--group','Original','--engine','codex')
  assert.equal(preferred.model,'gpt-6.1-sol');assert.equal(preferred.effort,'high')
  await cli('card','remove',preferred.id)
  const employee=await create('First','Original'),root=(await cli('session','list')).teamRoots.Original
  const session=await cli('session','open',employee.id)
  const original=(await cli('session','list')).sessions.find(card=>card.id===employee.id)
  for(const engine of ['claude','cline','pi']){
    for(const [cmd,args] of [['card.update',{id:employee.id,patch:{engine}}],['config.engine',{id:employee.id,engine}],['config.engine',{id:session.sessionId,engine}]]){
      const response=await f.request(null,cmd,args);assert.equal(response.ok,false);assert.match(response.error,/引擎创建后固定/)
    }
  }
  for(const role of ['manager','governor']){
    const supervisor=await create(role,'Original',role),token=await f.token(supervisor.id),response=await f.request(token,'card.update',{id:employee.id,patch:{engine:'claude'}})
    assert.equal(response.ok,false);assert.match(response.error,/引擎创建后固定|Forbidden: card.update/)
  }
  await cli('card','update',employee.id,'--engine','codex') // An unchanged form value is allowed.
  const unchanged=(await cli('session','list')).sessions.find(card=>card.id===employee.id)
  for(const key of ['engine','threadId','nativeSessions','cwd','title'])assert.deepEqual(unchanged[key],original[key])
  assert.equal((await cli('session','status','--employee',employee.id))[0].sessionId,session.sessionId)
  await cli('card','rename',employee.id,'Display name')
  await cli('session','rename',session.sessionId,'Another display name')
  await cli('card','update',employee.id,'--title','Final name')
  let saved=(await cli('session','list')).sessions.find(card=>card.id===employee.id)
  assert.equal(saved.title,'Final name');assert.equal(saved.cwd,employee.cwd)
  assert.equal((await cli('session','snapshot',session.sessionId)).title,'Final name')
  assert.equal(fs.existsSync(path.join(employee.cwd,'.agents-company/employees',employee.id,'AGENTS.md')),false)
  assert.ok(fs.existsSync((await cli('api','docs')).path),'shared documentation replaces per-employee handbook copies')
  assert.ok(fs.existsSync(employee.cwd))
  await assert.rejects(()=>cli('card','update',employee.id,'--cwd','elsewhere'))
  await assert.rejects(()=>cli('card','move',employee.id,'Elsewhere'))
  await assert.rejects(()=>cli('card','move',employee.id,'Original','--cwd','elsewhere'))
  await assert.rejects(()=>cli('group','root','Original',f.temp))
  await assert.rejects(()=>cli('group','configure','Original','--mode','work','--plugin','mininotion'))
  await cli('group','rename','Original','Renamed')
  const state=await cli('session','list');saved=state.sessions.find(card=>card.id===employee.id)
  assert.equal(saved.group,'Renamed');assert.equal(saved.cwd,employee.cwd);assert.equal(state.teamRoots.Renamed,root)
  await cli('card','remove',employee.id)
  await cli('group','remove','Renamed')
  const defaults=await cli('session','list')
  assert.equal(defaults.lastEmployeeTemplate.engine,'codex')
  assert.equal(defaults.lastEmployeeTemplate.model,'gpt-6-luna')
  assert.equal(defaults.lastTeamTemplate.settings.mode,'build')
  console.log('PASS CLI names can change while employee engine, Team, folder and Team root remain fixed; no model calls')
}finally{await f.close()}
