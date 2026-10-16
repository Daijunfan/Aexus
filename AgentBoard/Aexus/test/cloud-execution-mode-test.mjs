// Isolated Core/CLI E2E for the explicit `executionMode` creation contract on
// card.create and session.new. The shared normalization helper is asserted
// directly (pure), then the real source-built daemon runs against a disposable
// AGENTS_COMPANY_HOME with a fake SSH host so no real user state, host or model
// is touched. Cloud-native probes use a stub `claude`; initialization never
// performs a billed turn.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-execution-mode-')),entry=path.join(temp,'daemon.cjs')
// Fake SSH turns the remote host into the local filesystem, plus a stub Claude
// CLI that answers the cloud-native capability/auth probes over that SSH.
const sshBin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-execution-mode-ssh-'))
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
fs.writeFileSync(path.join(sshBin,'claude'),`#!/bin/sh
case "$*" in
  *--version*) echo "2.1.233 Claude Code";;
  *--help*) echo "--input-format stream-json --output-format stream-json";;
  *"auth status --json"*) echo '{"loggedIn":true}';;
  *) exit 2;;
esac
`,{mode:0o755})
const remoteBase=path.join(temp,'remote');fs.mkdirSync(remoteBase)

let f
try{
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
  await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  const modeEntry=path.join(temp,'execution-mode.cjs')
  await build({stdin:{contents:`export {normalizeExecutionMode,deriveExecutionMode,executionSummary} from ${JSON.stringify(path.join(root,'src/shared/execution-mode.ts'))}`,resolveDir:root,sourcefile:'execution-mode.ts',loader:'ts'},outfile:modeEntry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  const {normalizeExecutionMode,deriveExecutionMode,executionSummary}=createRequire(import.meta.url)(modeEntry)

  // ---- shared normalization matrix (pure) ----
  assert.deepEqual(normalizeExecutionMode({}, 'cloud', 'claude'),{kind:'cloud-native-worker',workEnvironment:'team',executionMode:'default'})
  assert.deepEqual(normalizeExecutionMode({}, 'cloud', 'cline'),{kind:'worker',workEnvironment:'team',executionMode:'cloud'})
  assert.deepEqual(normalizeExecutionMode({executionMode:'default'}, 'cloud', 'codex'),{kind:'cloud-native-worker',workEnvironment:'team',executionMode:'default'})
  assert.deepEqual(normalizeExecutionMode({executionMode:'default'}, 'cloud', 'opencode'),{kind:'worker',workEnvironment:'team',executionMode:'cloud'})
  assert.deepEqual(normalizeExecutionMode({executionMode:'local'}, 'cloud', 'codex'),{kind:'worker',workEnvironment:'local',executionMode:'local'})
  assert.deepEqual(normalizeExecutionMode({executionMode:'cloud'}, 'cloud', 'codex'),{kind:'worker',workEnvironment:'team',executionMode:'cloud'})
  assert.throws(()=>normalizeExecutionMode({executionMode:'cloud'}, 'build', 'codex'),/cloud 执行模式需要 Cloud Team/)
  assert.deepEqual(normalizeExecutionMode({kind:'worker',workEnvironment:'team'}, 'cloud', 'codex'),{kind:'worker',workEnvironment:'team',executionMode:'cloud'})
  assert.deepEqual(normalizeExecutionMode({}, 'build', 'codex'),{kind:'worker',workEnvironment:undefined,executionMode:'local'})
  assert.equal(deriveExecutionMode('cloud-native-worker',undefined,'cloud'),'default')
  assert.equal(deriveExecutionMode('worker','team','cloud'),'cloud')
  assert.equal(deriveExecutionMode('worker','local','cloud'),'local')
  assert.equal(deriveExecutionMode('worker',undefined,'build'),'local')
  assert.deepEqual(executionSummary({kind:'cloud-native-worker'},'cloud'),{executionMode:'default',executionOrigin:'cloud-host',executionTarget:'team-cloud'})
  assert.deepEqual(executionSummary({kind:'worker',workEnvironment:'team'},'cloud'),{executionMode:'cloud',executionOrigin:'core-host',executionTarget:'team-cloud'})
  assert.deepEqual(executionSummary({kind:'worker',workEnvironment:'local'},'cloud'),{executionMode:'local',executionOrigin:'core-host',executionTarget:'core-local'})

  f=await fixtureCore({PATH:sshBin+':'+process.env.PATH},entry)
  const {cli,request}=f
  const status=async id=>(await cli('session','status','--employee',id))[0]
  await cli('group','add','Build')
  const host=await cli('host','create','--data',JSON.stringify({name:'Fixture cloud',host:'fixture',os:'linux',defaultDirectory:remoteBase}))
  await cli('group','add','Cloud','--mode','cloud','--host-id',host.id)

  // Build Team, omitted mode -> local.
  const buildDefault=await cli('card','create','--title','BuildDefault','--group','Build','--engine','codex','--model','gpt-6-luna','--effort','low')
  assert.equal(buildDefault.kind,'worker');assert.equal(buildDefault.executionMode,'local')
  const buildStatus=await status(buildDefault.id)
  assert.equal(buildStatus.executionOrigin,'core-host');assert.equal(buildStatus.executionTarget,'core-local')

  // Cloud Team, omitted mode -> cloud-native (claude supports it).
  const cloudDefault=await cli('card','create','--title','CloudDefault','--group','Cloud','--engine','claude','--model','claude-sonnet-4-5')
  assert.equal(cloudDefault.kind,'cloud-native-worker');assert.equal(cloudDefault.workEnvironment,'team');assert.equal(cloudDefault.executionMode,'default')
  const cloudDefaultStatus=await status(cloudDefault.id)
  assert.equal(cloudDefaultStatus.executionMode,'default');assert.equal(cloudDefaultStatus.executionOrigin,'cloud-host');assert.equal(cloudDefaultStatus.executionTarget,'team-cloud')

  // Explicit local -> Core engine + Core-local workspace.
  const cloudLocal=await cli('card','create','--title','CloudLocal','--group','Cloud','--engine','codex','--model','gpt-6-luna','--effort','low','--execution-mode','local')
  assert.equal(cloudLocal.kind,'worker');assert.equal(cloudLocal.workEnvironment,'local');assert.equal(cloudLocal.executionMode,'local')
  const cloudLocalStatus=await status(cloudLocal.id)
  assert.equal(cloudLocalStatus.executionOrigin,'core-host');assert.equal(cloudLocalStatus.executionTarget,'core-local')

  // Explicit cloud -> Core engine + Team cloud workspace over Tunnel.
  const cloudTunnel=await cli('card','create','--title','CloudTunnel','--group','Cloud','--engine','codex','--model','gpt-6-luna','--effort','low','--execution-mode','cloud')
  assert.equal(cloudTunnel.kind,'worker');assert.equal(cloudTunnel.workEnvironment,'team');assert.equal(cloudTunnel.executionMode,'cloud')
  const cloudTunnelStatus=await status(cloudTunnel.id)
  assert.equal(cloudTunnelStatus.executionOrigin,'core-host');assert.equal(cloudTunnelStatus.executionTarget,'team-cloud')

  // Explicit legacy kind/workEnvironment is preserved, never silently upgraded.
  const legacyWorker=await cli('card','create','--title','LegacyWorker','--group','Cloud','--engine','codex','--model','gpt-6-luna','--effort','low','--kind','worker','--work-environment','team')
  assert.equal(legacyWorker.kind,'worker');assert.equal(legacyWorker.workEnvironment,'team');assert.equal(legacyWorker.executionMode,'cloud')

  // Cline/Pi/OpenCode cannot run cloud-native: default resolves to Tunnel, and
  // an explicit cloud-native kind is rejected.
  const clineTunnel=await cli('card','create','--title','ClineTunnel','--group','Cloud','--engine','cline','--execution-mode','default')
  assert.equal(clineTunnel.kind,'worker');assert.equal(clineTunnel.workEnvironment,'team');assert.equal(clineTunnel.executionMode,'cloud')
  await assert.rejects(()=>cli('card','create','--title','ClineNative','--group','Cloud','--engine','cline','--kind','cloud-native-worker'),/kind:worker only/)

  // session.new normalizes through the same contract before authorization.
  const localSession=await cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--group','Cloud','--execution-mode','local','--title','Local session')
  const localSessionSaved=await status(localSession.sessionId)
  assert.equal(localSessionSaved.kind,'worker');assert.equal(localSessionSaved.workEnvironment,'local');assert.equal(localSessionSaved.executionMode,'local')

  const tunnelSession=await cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--group','Cloud','--execution-mode','cloud','--title','Tunnel session')
  const tunnelSessionSaved=await status(tunnelSession.sessionId)
  assert.equal(tunnelSessionSaved.kind,'worker');assert.equal(tunnelSessionSaved.workEnvironment,'team');assert.equal(tunnelSessionSaved.executionMode,'cloud')

  const buildSession=await cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--group','Build','--execution-mode','default','--title','Build default session')
  const buildSessionSaved=await status(buildSession.sessionId)
  assert.equal(buildSessionSaved.kind,'worker');assert.equal(buildSessionSaved.executionMode,'local')

  // Secretary restriction follows the resolved mode.
  const denied=await request(null,'session.new',{engine:'codex',model:'gpt-6-luna',effort:'low',managementRole:'secretary',group:'Cloud',executionMode:'cloud',title:'Cloud secretary'})
  assert.equal(denied.ok,false);assert.match(denied.error,/Secretary 必须在 Core 所在主机本地运行/)
  const localSecretary=await cli('session','new','--engine','codex','--model','gpt-6-luna','--effort','low','--management-role','secretary','--group','Cloud','--execution-mode','local','--title','Local secretary')
  const localSecretarySaved=await status(localSecretary.sessionId)
  assert.equal(localSecretarySaved.managementRole,'secretary');assert.equal(localSecretarySaved.workEnvironment,'local');assert.equal(localSecretarySaved.executionMode,'local')

  // Public readback surfaces the derived mode through topology.
  const topology=await cli('management','topology')
  const node=topology.nodes.find(n=>n.id===cloudDefault.id)
  assert.equal(node.executionMode,'default');assert.equal(node.executionOrigin,'cloud-host');assert.equal(node.executionTarget,'team-cloud')

  console.log('PASS execution-mode contract: shared normalization matrix, Build local default, Cloud default cloud-native with Tunnel fallback, explicit local/cloud, legacy fields preserved, cloud-native engine restriction, session.new mapping + Secretary restriction, public executionMode/origin/target readback')
}finally{
  if(f)await f.close()
  fs.rmSync(sshBin,{recursive:true,force:true,maxRetries:10,retryDelay:100})
  fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
