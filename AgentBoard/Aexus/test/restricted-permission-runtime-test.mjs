import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

// Restricted permission modes must reach the native Codex launch request and its
// approval gate, not just the persisted store field. Deterministic fixture only;
// no real relay, no model inference, no user state.
const f=await fixtureCore(),{cli,ready,until,control,status}=f
const read=(employee,name)=>JSON.parse(fs.readFileSync(path.join(control,employee.id+'-'+name+'.json'),'utf8'))
const threadStart=employee=>read(employee,'thread-start')
const createWithPermission=async(title,permission)=>{
  const card=await cli('card','create','--title',title,'--group','Build','--management-role','employee','--engine','codex','--model','gpt-6-luna','--effort','low','--permission',permission)
  await ready(card.id);return card
}
const dispatch=async employee=>{
  await cli('session','send','--employee',employee.id,'Read the current directory.')
  await until(()=>fs.existsSync(path.join(control,employee.id+'-work.json')),'ordinary work dispatch')
  await until(async()=>!(await status(employee.id)).busy,'ordinary work finishes')
}
try{
  await cli('group','add','Build')
  const ask=await createWithPermission('Ask Worker','default')
  const edit=await createWithPermission('Edit Worker','acceptEdits')
  const full=await createWithPermission('Full Worker','bypassPermissions')
  for(const employee of [ask,edit,full])await dispatch(employee)

  // Ask (default) reaches the read-only permission profile; its approval gate stays on-request.
  assert.equal(threadStart(ask).permissions,'agents-company-readonly')
  assert.equal(threadStart(ask).sandbox,null)
  assert.equal(threadStart(ask).approvalPolicy,'on-request')
  // acceptEdits reaches workspace-write and keeps the approval gate on-request.
  assert.equal(threadStart(edit).sandbox,'workspace-write')
  assert.equal(threadStart(edit).permissions,null)
  assert.equal(threadStart(edit).approvalPolicy,'on-request')
  // Full reaches danger-full-access and turns the approval gate off.
  assert.equal(threadStart(full).sandbox,'danger-full-access')
  assert.equal(threadStart(full).permissions,null)
  assert.equal(threadStart(full).approvalPolicy,'never')

  // Stop and recover: the persisted acceptEdits must still become workspace-write
  // at the native launch, not merely survive as a store field.
  await f.stop();await f.start()
  await cli('session','send','--employee',edit.id,'Continue in this directory.')
  await until(()=>{try{return threadStart(edit).resumed}catch{return false}},'resumed thread-start after recovery')
  await until(async()=>!(await status(edit.id)).busy,'recovery work finishes')
  assert.equal(threadStart(edit).resumed,true)
  assert.equal(threadStart(edit).sandbox,'workspace-write')
  assert.equal(threadStart(edit).approvalPolicy,'on-request')
  console.log('PASS restricted permission modes reach the native Codex launch request and approval gate; recover preserves acceptEdits at runtime')
}finally{await f.close()}
