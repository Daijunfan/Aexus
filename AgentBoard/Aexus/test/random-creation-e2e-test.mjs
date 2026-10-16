// Real CLI/API -> isolated Core E2E for the `random` managementRole/avatar
// sentinels in card.create and session.new. Bundles the current source daemon
// once (like the other source-built Core suites) and runs against a disposable
// AGENTS_COMPANY_HOME, so no real user state or shared build is touched and no
// model is called: initialization runs the deterministic native fixture.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-random-creation-e2e-')),entry=path.join(temp,'daemon.cjs')
const roles=['employee','manager','governor','secretary']
// Fake SSH/keyscan so a Cloud Team host and its Session/workspace checks resolve against the fixture host without touching any real host.
const sshBin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-random-creation-ssh-'))
fs.writeFileSync(path.join(sshBin,'ssh'),`#!/usr/bin/env python3
import os,sys
if '-G' in sys.argv:
 print('hostname fixture');print('port 22');sys.exit(0)
if 'offline' in sys.argv:sys.exit(255)
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
fs.writeFileSync(path.join(sshBin,'ssh-keyscan'),`#!/bin/sh
printf 'fixture ssh-ed25519 Zml4dHVyZS1rZXk=\\n'
`,{mode:0o755})
const remoteBase=path.join(temp,'remote');fs.mkdirSync(remoteBase)

// CLI payload: --management-role must map to the camelCase field the Core reads.
const parse=(...args)=>JSON.parse(spawnSync(process.execPath,['bin/agents',...args],{cwd:root,env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}).stdout)
const sessionPayload=parse('session','new','--management-role','random','--engine','claude','--group','Eng')
assert.equal(sessionPayload.args.managementRole,'random','session.new must map --management-role')
assert.equal(sessionPayload.args['management-role'],undefined,'session.new must not leak the hyphenated flag')
assert.equal(parse('card','create','--title','X','--group','Eng','--management-role','random').args.managementRole,'random')

let f
try{
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
  await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  const sharedEntry=path.join(temp,'shared.cjs')
  await build({stdin:{contents:`export {avatarDescription} from ${JSON.stringify(path.join(root,'src/shared/avatars.ts'))}`,resolveDir:root,sourcefile:'shared.ts',loader:'ts'},outfile:sharedEntry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  const {avatarDescription}=createRequire(import.meta.url)(sharedEntry)
  f=await fixtureCore({PATH:sshBin+':'+process.env.PATH},entry)
  await f.cli('group','add','A')
  const selectable=(await f.cli('avatar','list')).map(a=>a.id)
  const readBack=async id=>(await f.cli('session','list')).sessions.find(c=>c.id===id)

  // Operator card.create random: concrete role and a concrete selectable avatar with the server-chosen palette.
  const randomCard=await f.cli('card','create','--title','Operator random','--group','A','--management-role','random','--avatar','random','--engine','codex','--model','gpt-6-luna','--effort','low')
  assert.ok(roles.includes(randomCard.managementRole),'operator random role persisted concrete: '+randomCard.managementRole)
  const randomSaved=await readBack(randomCard.id)
  assert.equal(randomSaved.managementRole,randomCard.managementRole)
  assert.ok(selectable.includes(randomSaved.avatar)&&randomSaved.avatar!=='random','operator random avatar persisted a selectable avatar: '+randomSaved.avatar)
  assert.equal(randomSaved.color,avatarDescription(randomSaved.avatar).color,'random appearance keeps the server-chosen matching palette')
  assert.equal(randomSaved.model,'gpt-6-luna','explicit Codex model survives the new default')
  assert.equal(randomSaved.effort,'low','explicit Codex effort survives the new default')

  // Explicit values pass through unchanged.
  const governor=await f.cli('card','create','--title','Explicit governor','--group','A','--management-role','governor','--avatar',selectable[0],'--engine','codex','--model','gpt-6-luna','--effort','low')
  assert.equal((await readBack(governor.id)).managementRole,'governor')

  // Gap 3 regression: a fresh Codex role defaults to gpt-6.1-sol / high when no explicit override.
  const defaulted=await f.cli('card','create','--title','Default codex','--group','A','--engine','codex')
  const defaultedSaved=await readBack(defaulted.id)
  assert.equal(defaultedSaved.model,'gpt-6.1-sol','fresh Codex role defaults to gpt-6.1-sol')
  assert.equal(defaultedSaved.effort,'high','fresh Codex role defaults to high effort')

  // Manager agent random resolves within its own creates (employee), never Secretary.
  const manager=await f.create('Manager','A','manager'),managerToken=await f.token(manager.id)
  for(let i=0;i<3;i++){
    const response=await f.request(managerToken,'card.create',{title:'Manager random '+i,group:'A',managementRole:'random',engine:'codex',model:'gpt-6-luna',effort:'low'})
    assert.ok(response.ok,response.error)
    const saved=await readBack(response.data.id)
    assert.equal(saved.managementRole,'employee','manager random must resolve to employee')
    assert.notEqual(saved.managementRole,'secretary','manager random must never yield Secretary')
  }

  // session.new random resolves and persists a concrete role through the real Core.
  const session=await f.cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--management-role','random','--group','A','--title','Random session')
  const sessionSaved=await readBack(session.sessionId)
  assert.ok(roles.includes(sessionSaved.managementRole),'session.new random role persisted concrete: '+sessionSaved.managementRole)

  // session.new explicit value regression.
  const explicitSession=await f.cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--management-role','manager','--group','A','--title','Explicit manager session')
  assert.equal((await readBack(explicitSession.sessionId)).managementRole,'manager')

  // Gap 5 regression: session.new without an existing card must still enforce the
  // Secretary Core-local rule for Cloud Team workspaces (operator path resolves
  // random early and previously skipped the role boundary check).
  const cloudHostResponse=await f.request(null,'host.create',{name:'Fixture cloud',host:'fixture',os:'linux',defaultDirectory:remoteBase})
  assert.ok(cloudHostResponse.ok,cloudHostResponse.error)
  const cloudHost=cloudHostResponse.data
  await f.cli('group','add','Cloud','--mode','cloud','--host-id',cloudHost.id)
  const cloudDenied=await f.request(null,'session.new',{engine:'codex',model:'gpt-6-luna',effort:'low',managementRole:'secretary',group:'Cloud',title:'Team workspace secretary session'})
  assert.equal(cloudDenied.ok,false,'session.new Cloud Team-workspace Secretary must stay forbidden')
  assert.match(cloudDenied.error,/Secretary 必须在 Core 所在主机本地运行/)
  const localSecretary=await f.cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--management-role','secretary','--group','Cloud','--work-environment','local','--title','Core local secretary session')
  const localSecretarySaved=await readBack(localSecretary.sessionId)
  assert.equal(localSecretarySaved.managementRole,'secretary','session.new Core-local Secretary in a Cloud Team remains allowed')
  assert.equal(localSecretarySaved.workEnvironment,'local')

  console.log('PASS random-creation E2E: CLI maps --management-role; operator card.create persists a concrete role and selectable avatar; manager agent random is employee (never Secretary); session.new persists a concrete random role; explicit values pass through; session.new Cloud Team-workspace Secretary is rejected while a Core-local Secretary is allowed')
}finally{await f?.close();fs.rmSync(sshBin,{recursive:true,force:true,maxRetries:10,retryDelay:100});fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
