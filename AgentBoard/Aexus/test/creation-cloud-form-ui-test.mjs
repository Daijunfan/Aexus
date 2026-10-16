// Isolated renderer + Core regression for cloud Team creation through the actual
// TeamForm (not crafted CLI arguments): generate under a user-selected remote
// parent, bind an existing directory, and edit-rename preserving the fixed
// remote directory. Deterministic fake-SSH host only; no model calls or real hosts.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const root=path.resolve(import.meta.dirname,'..')
// A fake `ssh` turns the remote host into the local filesystem: the Tunnel's
// bridge.py invokes `ssh` for every connection, and this shim runs the final
// argument through /bin/sh, so remote directories are ordinary local paths.
const sshBin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloud-form-ssh-'))
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
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cloud-form-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,PATH:sshBin+':'+process.env.PATH,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
delete env.ELECTRON_RUN_AS_NODE
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(response.ok,response.error);return response.data}
try{
  await page.locator('.infinite-canvas').waitFor()
  const remoteBase=path.join(temp,'remote');fs.mkdirSync(remoteBase)
  const host=await cli('host','create','--data',JSON.stringify({name:'Fixture cloud',host:'fixture',os:'linux',defaultDirectory:remoteBase}))
  const cloudParent=path.join(remoteBase,'cloud-parent');fs.mkdirSync(cloudParent)
  // Open the create form in a clean cloud state regardless of the last-team template.
  const openCloud=async()=>{await page.locator('.add-team').click();await page.locator('.team-environment-options [data-environment="local"]').click();await page.locator('.team-environment-options [data-mode="cloud"]').click();await page.locator('select[name="cloud-host-id"]').waitFor();await page.locator('select[name="cloud-host-id"]').selectOption(host.id)}

  // ---- cloud generate: the form must send the selected parent and no remote.directory ----
  await openCloud()
  await expect(page.locator('input[name="remote-directory"]')).toHaveValue(remoteBase)
  await page.getByRole('button',{name:'Browse directories'}).click()
  await page.getByRole('button',{name:/cloud-parent/}).click()
  await page.getByRole('button',{name:'Use this folder as parent'}).click()
  await expect(page.locator('input[name="remote-directory"]')).toHaveValue(cloudParent)
  await page.locator('.team-form input[name="team-name"]').fill('CloudUI')
  await page.locator('.save-team').click()
  await expect(page.locator('.team-form')).toHaveCount(0)
  const genRoot=path.join(cloudParent,'cloudui')
  const afterGen=await cli('session','list')
  assert.equal(afterGen.teamRoots.CloudUI,genRoot,'cloud generate via form resolves <selected parent>/<team>')
  assert.equal(afterGen.teamSettings.CloudUI.remote.directory,genRoot)
  assert.equal(afterGen.teamSettings.CloudUI.mode,'cloud')
  assert.ok(fs.existsSync(genRoot),'cloud generate via form created the remote folder')

  // ---- a following generate form remembers the user-chosen parent, not the just-generated Team folder ----
  await page.locator('.add-team').click()
  await page.locator('select[name="cloud-host-id"]').waitFor()
  await expect(page.locator('select[name="cloud-host-id"]')).toHaveValue(host.id)
  await expect(page.locator('input[name="remote-directory"]')).toHaveValue(cloudParent)
  await expect(page.locator('[data-team-directory-mode="default"]')).toHaveAttribute('aria-pressed','true')
  await page.locator('.team-form input[name="team-name"]').fill('CloudUI2')
  await page.locator('.save-team').click()
  await expect(page.locator('.team-form')).toHaveCount(0)
  const afterGen2=await cli('session','list')
  assert.equal(afterGen2.teamRoots.CloudUI2,path.join(cloudParent,'cloudui2'),'the remembered parent yields a sibling folder, never a nested one')

  // ---- cloud bind: the form keeps the chosen directory, never a generate payload ----
  await openCloud()
  await page.locator('[data-team-directory-mode="bind"]').click()
  await expect(page.locator('input[name="remote-directory"]')).toHaveValue(remoteBase)
  await page.locator('.team-form input[name="team-name"]').fill('CloudBindUI')
  await page.locator('.save-team').click()
  await expect(page.locator('.team-form')).toHaveCount(0)
  const afterBind=await cli('session','list')
  assert.equal(afterBind.teamRoots.CloudBindUI,remoteBase,'cloud bind via form keeps the existing directory')
  assert.equal(afterBind.teamSettings.CloudBindUI.mode,'cloud')

  // ---- a following form keeps bind mode; a generate template must never reset it ----
  await page.locator('.add-team').click()
  await page.locator('select[name="cloud-host-id"]').waitFor()
  await expect(page.locator('[data-team-directory-mode="bind"]')).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('input[name="remote-directory"]')).toHaveValue(remoteBase)
  await page.locator('.panel-close').click()

  // ---- editing a cloud Team only renames; host and remote directory stay fixed ----
  await cli('view','open','team','--name','CloudUI')
  await expect(page.locator('.team-form input[name="team-name"]')).toBeEditable()
  await page.locator('.team-form input[name="team-name"]').fill('CloudUI Renamed')
  await page.locator('.save-team').click()
  await expect(page.locator('.team-form')).toHaveCount(0)
  const afterRename=await cli('session','list')
  assert.equal(afterRename.teamRoots['CloudUI Renamed'],genRoot,'renaming a cloud Team keeps its remote directory')
  assert.equal(afterRename.teamSettings['CloudUI Renamed'].remote.directory,genRoot)

  console.log('PASS cloud Team form: generate under a chosen remote parent, bind an existing directory, and edit rename keep the remote directory')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(sshBin,{recursive:true,force:true})}
