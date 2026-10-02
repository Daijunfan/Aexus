import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore(),{cli,create,ready,until,control}=f
try{
  await cli('group','add','Build')
  await cli('group','add','Work','--mode','work','--plugin','mininotion')
  const worker=await create('Clean Worker','Work')
  assert.equal((await f.status(worker.id)).initialization.status,'ready')
  assert.equal(worker.permissionMode,'default')
  assert.equal(fs.existsSync(path.join(control,worker.id+'-initializing.json')),false)
  const opened=await cli('session','open',worker.id)
  await cli('session','send',opened.sessionId,'Read the current directory.')
  await until(()=>fs.existsSync(path.join(control,worker.id+'-thread-start.json')),'worker thread')
  const launch=JSON.parse(fs.readFileSync(path.join(control,worker.id+'-thread-start.json'),'utf8'))
  assert.match(launch.developerInstructions,/Work plugin tools/)
  assert.match(launch.developerInstructions,/mininotion/)
  assert.ok(launch.developerInstructions.includes(worker.cwd))
  assert.ok(launch.developerInstructions.includes('.agents-company/plugins/mininotion/API.md'))
  assert.ok(!launch.developerInstructions.includes('private initialization'))
  assert.ok(!launch.developerInstructions.includes('Manager'))
  // Work uses the named, workspace-scoped native permission profile. A null
  // sandbox field is expected when permissions is explicit; it is not Full access.
  assert.equal(launch.permissions,'agents-company-work')
  assert.equal(launch.sandbox,null)
  const buildWorker=await create('Build Worker','Build')
  await cli('session','send','--employee',buildWorker.id,'Read the current directory.')
  await until(()=>fs.existsSync(path.join(control,buildWorker.id+'-thread-start.json')),'Build worker thread')
  const buildLaunch=JSON.parse(fs.readFileSync(path.join(control,buildWorker.id+'-thread-start.json'),'utf8'))
  assert.equal(buildLaunch.permissions,'agents-company-readonly')
  assert.equal(buildLaunch.developerInstructions,null)
  const manager=await cli('card','create','--title','Manager','--group','Build','--management-role','manager','--engine','codex','--model','gpt-6-luna','--effort','low')
  await ready(manager.id)
  assert.ok(fs.existsSync(path.join(control,manager.id+'-initializing.json')))
  const managerLaunch=JSON.parse(fs.readFileSync(path.join(control,manager.id+'-thread-start.json'),'utf8'))
  assert.ok(managerLaunch.developerInstructions?.includes('Manager'))
  await f.stop()
  const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),legacy=JSON.parse(fs.readFileSync(stateFile,'utf8'))
  legacy.fullAccessDefaultApplied=false;legacy.sessions.find(card=>card.id===worker.id).permissionMode='acceptEdits'
  fs.writeFileSync(stateFile,JSON.stringify(legacy));await f.start()
  assert.equal((await cli('session','list')).sessions.find(card=>card.id===worker.id).permissionMode,'acceptEdits')
  console.log('PASS Employee starts ready with the selected safe native permission; upgrades preserve existing lower permissions and no hidden turn; Work gets scoped tool discovery, Build stays prompt-free; Manager still initializes from its guide')
}finally{await f.close()}
