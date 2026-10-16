// Cline restricted permission must reach the real ACP approval gate, not just the
// persisted store field. The fake engine process sends actual write/edit and execute
// permission requests over the wire; Full auto-allows, Ask creates an approval whose
// deny/allow both take effect, and acceptEdits auto-allows workspace edits while
// commands still confirm. Deterministic fixture only; no model, SSH or user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cline-permission-'))),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
const f=await fixtureCore({CLINE_BIN:path.join(root,'test/fixtures/process-adapter.cjs')},entry)
const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
const settle=card=>f.until(async()=>!(await f.status(card.id)).busy,'turn settles')
const approvals=async card=>(await f.cli('approval','list',(await f.status(card.id)).sessionId))
const waitApproval=async card=>f.until(async()=>{const list=await approvals(card);return list.length?list:undefined},'approval pending')
const create=async mode=>{const card=await f.cli('card','create','--title','Cline '+mode,'--group','A','--engine','cline','--permission',mode);await f.ready(card.id);return card}
const send=async(card,text)=>{await rpc('session.send',{employee:card.id,text})}
const writeFile=card=>path.join(card.cwd,'approval.txt'),execFile=card=>path.join(card.cwd,'command.txt')
try{
  await f.cli('group','add','A')
  await rpc('engine.configure',{engine:'cline',patch:{apiKey:'fixture-key-not-real'}})

  // Full: both the workspace write and the command run without any approval.
  const full=await create('bypassPermissions')
  await send(full,'WRITE_FIXTURE');await settle(full);assert.equal(fs.readFileSync(writeFile(full),'utf8'),'approved');assert.deepEqual(await approvals(full),[])
  await send(full,'EXEC_FIXTURE');await settle(full);assert.equal(fs.readFileSync(execFile(full),'utf8'),'ran');assert.deepEqual(await approvals(full),[])

  // Ask: write and execute each create a real approval; deny and allow both take effect.
  const ask=await create('default')
  await send(ask,'WRITE_FIXTURE');let pending=await waitApproval(ask);assert.match(pending[0].tool,/^Write:/);assert.equal(pending[0].input.path,writeFile(ask));assert.ok(!fs.existsSync(writeFile(ask)))
  await rpc('approval.respond',{id:(await f.status(ask.id)).sessionId,requestId:pending[0].id,decision:'deny'});await settle(ask);assert.ok(!fs.existsSync(writeFile(ask)))
  await send(ask,'WRITE_FIXTURE');pending=await waitApproval(ask);await rpc('approval.respond',{id:(await f.status(ask.id)).sessionId,requestId:pending[0].id,decision:'allow'});await settle(ask);assert.equal(fs.readFileSync(writeFile(ask),'utf8'),'approved')
  await send(ask,'EXEC_FIXTURE');pending=await waitApproval(ask);assert.match(pending[0].tool,/^Execute:/);assert.equal(pending[0].input.command,'echo permission-exec');assert.ok(!fs.existsSync(execFile(ask)))
  await rpc('approval.respond',{id:(await f.status(ask.id)).sessionId,requestId:pending[0].id,decision:'deny'});await settle(ask);assert.ok(!fs.existsSync(execFile(ask)))
  await send(ask,'EXEC_FIXTURE');pending=await waitApproval(ask);await rpc('approval.respond',{id:(await f.status(ask.id)).sessionId,requestId:pending[0].id,decision:'allow'});await settle(ask);assert.equal(fs.readFileSync(execFile(ask),'utf8'),'ran')

  // acceptEdits: the workspace edit auto-allows, while the command still confirms.
  const edit=await create('acceptEdits')
  await send(edit,'WRITE_FIXTURE');await settle(edit);assert.equal(fs.readFileSync(writeFile(edit),'utf8'),'approved');assert.deepEqual(await approvals(edit),[])
  await send(edit,'EXEC_FIXTURE');pending=await waitApproval(edit);assert.match(pending[0].tool,/^Execute:/);assert.ok(!fs.existsSync(execFile(edit)))
  await rpc('approval.respond',{id:(await f.status(edit.id)).sessionId,requestId:pending[0].id,decision:'deny'});await settle(edit);assert.ok(!fs.existsSync(execFile(edit)))
  await send(edit,'EXEC_FIXTURE');pending=await waitApproval(edit);await rpc('approval.respond',{id:(await f.status(edit.id)).sessionId,requestId:pending[0].id,decision:'allow'});await settle(edit);assert.equal(fs.readFileSync(execFile(edit),'utf8'),'ran')

  console.log('PASS Cline restricted permission reaches the ACP approval gate: Full auto-allows write+execute, Ask deny/allow both effective, acceptEdits auto-allows edit while commands confirm; fixture only')
}finally{await f.close();fs.rmSync(temp,{recursive:true,force:true})}
