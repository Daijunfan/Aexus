// Isolated Core regression for the unified Team/Employee creation contract:
// A generate-vs-bind directory modes (local and cloud), B strict subdirectory
// binding, C Secretary on a Core-local workspace of a cloud Team, D Full-access
// default. Deterministic fixtures only; no model calls or real hosts.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..')
// A fake `ssh` turns the remote host into the local filesystem: the Tunnel's
// bridge.py invokes `ssh` for every connection, and this shim runs the final
// argument through /bin/sh, so remote directories are ordinary local paths.
const sshBin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-creation-ssh-'))
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
// Run the Core from the current source instead of the packaged daemon.
const coreTemp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-creation-core-')))
const entry=path.join(coreTemp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(coreTemp,'node_modules'),'dir')
await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})

const f=await fixtureCore({PATH:sshBin+':'+process.env.PATH},process.env.AGENTS_COMPANY_TEST_CORE_ENTRY??entry)
const {cli}=f
try{
  // ---- D: Full access is the shipped default and the creation fallback ----
  assert.equal((await cli('settings','get')).defaultPermissionMode,'bypassPermissions','shipped default permission is Full access')

  // ---- A: local Build generate under a user-selected parent ----
  const localParent=path.join(f.temp,'chosen-parent');fs.mkdirSync(localParent)
  await cli('group','add','LocalGen','--mode','build','--parent',localParent)
  const localState=await cli('session','list')
  assert.equal(localState.teamRoots.LocalGen,path.join(localParent,'localgen'),'local generate uses <parent>/<team>')
  assert.ok(fs.existsSync(path.join(localParent,'localgen')),'local generate creates the folder')

  // ---- A: local Build bind still works ----
  const boundDir=path.join(f.temp,'bound-team');fs.mkdirSync(boundDir)
  await cli('group','add','LocalBind','--mode','build','--directory-mode','bind','--root',boundDir)
  assert.equal((await cli('session','list')).teamRoots.LocalBind,fs.realpathSync(boundDir),'local bind keeps the selected folder')

  // ---- A: cloud generate + bind through the fake SSH host ----
  const remoteBase=path.join(f.temp,'remote');fs.mkdirSync(remoteBase)
  const host=await cli('host','create','--data',JSON.stringify({name:'Fixture cloud',host:'fixture',os:'linux',defaultDirectory:remoteBase}))
  const cloudParent=path.join(f.temp,'cloud-parent');fs.mkdirSync(cloudParent)
  await cli('group','add','CloudGen','--mode','cloud','--host-id',host.id,'--directory-mode','default','--parent',cloudParent)
  const cloudGen=await cli('session','list')
  assert.equal(cloudGen.teamSettings.CloudGen.mode,'cloud')
  assert.equal(cloudGen.teamSettings.CloudGen.remote.directory,path.join(cloudParent,'cloudgen'),'cloud generate resolves <parent>/<team>')
  assert.ok(fs.existsSync(path.join(cloudParent,'cloudgen')),'cloud generate creates the remote folder')

  await cli('group','add','CloudBind','--mode','cloud','--host-id',host.id,'--directory-mode','bind','--remote-dir',remoteBase)
  assert.equal((await cli('session','list')).teamSettings.CloudBind.remote.directory,remoteBase,'cloud bind keeps the existing directory')

  // ---- B: employee bind must be a strict subdirectory, never the root or outside ----
  const outside=path.join(f.temp,'outside');fs.mkdirSync(outside)
  await assert.rejects(()=>cli('card','create','--title','Escape','--group','LocalGen','--engine','codex','--model','gpt-6-luna','--effort','low','--directory-mode','bind','--cwd',outside),/Team 根目录下的子文件夹|超出所属 Team 的范围/,'local Build employee cannot bind an external folder')
  await assert.rejects(()=>cli('card','create','--title','RootBind','--group','CloudBind','--engine','codex','--model','gpt-6-luna','--effort','low','--directory-mode','bind','--cwd',remoteBase),/Team 根目录下的子文件夹/,'cloud employee cannot bind the Team root itself')

  // ---- C: Secretary on a Core-local workspace of a cloud Team is creatable ----
  const secretary=await cli('card','create','--title','Secretary','--group','CloudBind','--engine','codex','--model','gpt-6-luna','--effort','low','--management-role','secretary','--work-environment','local')
  assert.equal(secretary.managementRole,'secretary')
  assert.equal(secretary.workEnvironment,'local')
  assert.ok(path.isAbsolute(secretary.cwd),'Secretary gets an absolute Core-host workspace')
  assert.ok(!secretary.remote,'Secretary runs on the Core host, not the cloud')
  assert.ok(fs.existsSync(secretary.cwd),'Secretary workspace is created locally')

  // ---- D: fresh employee inherits Full access; a legacy restricted value is preserved ----
  const dWorker=await cli('card','create','--title','D Worker','--group','LocalGen','--engine','codex','--model','gpt-6-luna','--effort','low')
  assert.equal(dWorker.permissionMode,'bypassPermissions','new employee without --permission inherits Full access')
  await f.stop()
  const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')
  const legacy=JSON.parse(fs.readFileSync(stateFile,'utf8'))
  legacy.fullAccessDefaultApplied=false
  legacy.sessions.find(card=>card.id===dWorker.id).permissionMode='acceptEdits'
  fs.writeFileSync(stateFile,JSON.stringify(legacy))
  await f.start()
  assert.equal((await cli('session','list')).sessions.find(card=>card.id===dWorker.id).permissionMode,'acceptEdits','upgrade preserves an existing restricted engine permission')

  console.log('PASS creation modes: local/cloud generate+bind, strict subdirectory binding, Core-local Secretary on a cloud Team, Full access default with preserved legacy permission')
}finally{
  fs.rmSync(coreTemp,{recursive:true,force:true})
  fs.rmSync(sshBin,{recursive:true,force:true})
  await f.close()
}
