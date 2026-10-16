import { build } from 'esbuild'
import { mkdtempSync,mkdirSync,symlinkSync,existsSync,rmSync,realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
// Focused regression for the legacy Build workspace compatibility fix in
// workspaces.ts: unchanged persisted local Build cards may reopen/read/display
// their stored canonical cwd (even Team root or an external folder), while every
// new bind, explicit rebind, or symlink-swapped path stays strictly inside root.
const temp=mkdtempSync(join(tmpdir(),'agents-company-legacy-workspace-'))
const home=join(temp,'state'),root=join(temp,'external-project'),outside=join(temp,'outside'),otherOutside=join(temp,'other-outside')
for(const dir of [home,root,outside,otherOutside])mkdirSync(dir)
process.env.AGENTS_COMPANY_HOME=home
process.env.AGENTS_COMPANY_BUILTIN_PLUGINS=join(import.meta.dirname,'../build/plugins')
const previousWorkspaces=process.env.AGENTS_COMPANY_WORKSPACES;delete process.env.AGENTS_COMPANY_WORKSPACES
let n=0; const ok=(value,label)=>{assert.ok(value,label);console.log(`PASS  ${label}`);n++}
try {
  await build({entryPoints:{workspaces:'src/main/workspaces.ts'},outdir:join(temp,'lib'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
  const require=createRequire(import.meta.url),{employeeWorkspace,workspaceStatus}=require(join(temp,'lib/workspaces.js'))
  const store={groups:['Engineering'],teamRoots:{Engineering:realpathSync(root)},teamSettings:{Engineering:{mode:'build'}},sessions:[]}
  const nativeRoot={nativeOrigin:'codex',nativeSessions:['native-root-slot']}
  const nativeExternal={nativeOrigin:'codex',nativeSessions:['native-external-slot']}
  store.sessions.push({id:'legacy-root',group:'Engineering',cwd:realpathSync(root),title:'Root Engineer',...nativeRoot})
  store.sessions.push({id:'legacy-external',group:'Engineering',cwd:realpathSync(outside),title:'External Engineer',...nativeExternal})

  // A: preexisting stored root/external legitimate Build record reopens, reads,
  // displays and survives a title rename while retaining native identity + cwd.
  ok(employeeWorkspace(store,'Engineering',realpathSync(root),'legacy-root')===realpathSync(root),'unchanged Build card bound to Team root reopens with its stored cwd')
  ok(employeeWorkspace(store,'Engineering',realpathSync(outside),'legacy-external')===realpathSync(outside),'unchanged Build card bound to an external folder reopens with its stored cwd')
  ok(workspaceStatus(store,{id:'legacy-root',group:'Engineering',cwd:realpathSync(root)}).workspaceError===undefined,'root-bound legacy card reads/display with no workspace error')
  ok(workspaceStatus(store,{id:'legacy-external',group:'Engineering',cwd:realpathSync(outside)}).workspaceError===undefined,'external legacy card reads/display with no workspace error')
  const beforeRoot=store.sessions.find(c=>c.id==='legacy-root')
  store.sessions.find(c=>c.id==='legacy-root').title='Renamed Root Engineer'
  ok(employeeWorkspace(store,'Engineering',beforeRoot.cwd,'legacy-root')===beforeRoot.cwd,'title rename keeps reopen working on the same cwd')
  ok(store.sessions.find(c=>c.id==='legacy-root').cwd===beforeRoot.cwd&&store.sessions.find(c=>c.id==='legacy-root').nativeOrigin===beforeRoot.nativeOrigin&&store.sessions.find(c=>c.id==='legacy-root').nativeSessions===beforeRoot.nativeSessions,'rename retains native identity and cwd')

  // B: NEW binds stay strict — Team root, external folder, and symlink escape are rejected.
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(root),undefined,true),/根目录|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(root),undefined,true,'existing'),/根目录|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(outside),undefined,true),/范围|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(outside),undefined,true,'existing'),/范围|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',join(temp,'brand-new-outside'),undefined,true,'create'),/范围|子文件夹/)
  symlinkSync(outside,join(root,'escape'))
  assert.throws(()=>employeeWorkspace(store,'Engineering','escape/should-not-exist',undefined,true),/范围|子文件夹/)
  ok(!existsSync(join(outside,'should-not-exist')),'new bind cannot escape through a symlinked Team subfolder')

  // C: explicit rebind of the legacy external card is treated as a new request and rejected.
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(outside),'legacy-external',true,'existing'),/范围|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(root),'legacy-external',true,'existing'),/范围|根目录|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',realpathSync(otherOutside),'legacy-external',true,'existing'),/范围|子文件夹/)
  assert.throws(()=>employeeWorkspace(store,'Engineering',join(temp,'brand-new-other-outside'),'legacy-external',true,'create'),/范围|子文件夹/)
  ok(employeeWorkspace(store,'Engineering',realpathSync(outside),'legacy-external')===realpathSync(outside),'legacy external card still reopens unchanged after rejected rebind attempts')

  // D: an old valid child swapped for a symlink resolves away from its stored cwd and is rejected.
  const child=employeeWorkspace(store,'Engineering','legacy-child',undefined,true)
  store.sessions.push({id:'legacy-child',group:'Engineering',cwd:child,nativeOrigin:'claude',nativeSessions:['native-child-slot']})
  ok(employeeWorkspace(store,'Engineering',child,'legacy-child')===child,'valid child opens before the swap')
  rmSync(child,{recursive:true,force:true});symlinkSync(outside,child)
  assert.throws(()=>employeeWorkspace(store,'Engineering',child,'legacy-child'),/范围|子文件夹/)
  ok(true,'a previously valid child replaced by an escaping symlink is rejected on reopen')

  console.log(`PASS=${n} FAIL=0`)
}finally{if(previousWorkspaces===undefined)delete process.env.AGENTS_COMPANY_WORKSPACES;else process.env.AGENTS_COMPANY_WORKSPACES=previousWorkspaces;rmSync(temp,{recursive:true,force:true})}
