import { build } from 'esbuild'
import { mkdtempSync,mkdirSync,writeFileSync,symlinkSync,existsSync,rmSync,realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const temp=mkdtempSync(join(tmpdir(),'agents-company-workspace-'))
const home=join(temp,'state'),root=join(temp,'external-project'),outside=join(temp,'outside')
for(const dir of [home,root,outside])mkdirSync(dir)
process.env.AGENTS_COMPANY_HOME=home
process.env.AGENTS_COMPANY_BUILTIN_PLUGINS=join(import.meta.dirname,'../build/plugins')
const previousWorkspaces=process.env.AGENTS_COMPANY_WORKSPACES;delete process.env.AGENTS_COMPANY_WORKSPACES
let n=0; const ok=(value,label)=>{assert.ok(value,label);console.log(`PASS  ${label}`);n++}
try {
  await build({entryPoints:{workspaces:'src/main/workspaces.ts',canvas:'src/shared/canvas.ts'},outdir:join(temp,'lib'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
  const require=createRequire(import.meta.url),{teamRoot,employeeWorkspace,workspaceStatus,defaultTeamRoot}=require(join(temp,'lib/workspaces.js'))
  ok(defaultTeamRoot('Planning',{mode:'work',pluginId:'mininotion'})===join(import.meta.dirname,'../PlugIns/mini-notion/workspaces/Planning')&&defaultTeamRoot('Research',{mode:'work',pluginId:'cloud-hosts'})===join(import.meta.dirname,'../PlugIns/cloud-hosts/workspaces/Research'),'production Work roots belong to each plugin source folder and remain separate per Team')
  const store={groups:['Engineering'],teamRoots:{Engineering:realpathSync(root)},teamSettings:{Engineering:{mode:'work',pluginId:'mininotion'}},sessions:[]}
  assert.throws(()=>teamRoot(home));assert.throws(()=>teamRoot('relative'))
  ok(true,'Team root must be an existing absolute external folder')
  assert.throws(()=>employeeWorkspace({...store,teamRoots:{}},'Engineering','alice',undefined,true))
  assert.throws(()=>employeeWorkspace(store,'','alice',undefined,true))
  assert.throws(()=>employeeWorkspace(store,'Engineering',root,undefined,true));ok(true,'Work employee cannot own the plugin root')
  assert.throws(()=>employeeWorkspace(store,'Engineering','../outside/escape',undefined,true))
  assert.throws(()=>employeeWorkspace(store,'Engineering',outside,undefined,true))
  ok(!existsSync(join(outside,'escape')),'missing Team and path traversal are rejected before writing')
  symlinkSync(outside,join(root,'escape'))
  assert.throws(()=>employeeWorkspace(store,'Engineering','escape/should-not-exist',undefined,true))
  ok(!existsSync(join(outside,'should-not-exist')),'a symlink cannot create or use an external employee directory')
  const cwd=employeeWorkspace(store,'Engineering','alice',undefined,true)
  ok(cwd===realpathSync(join(root,'alice')),'employee child folder is created and canonicalized')
  store.sessions.push({id:'a',cwd,group:'Engineering'})
  symlinkSync(cwd,join(root,'alias'))
  assert.throws(()=>employeeWorkspace(store,'Engineering','alias','b',true))
  ok(employeeWorkspace(store,'Engineering','alice/child','b',true).startsWith(cwd+'/'),'nested employee workspaces are supported')
  ok(true,'Work rejects two employees owning the exact same or aliased directory')
  ok(employeeWorkspace({...store,teamSettings:{Engineering:{mode:'build'}}},'Engineering','alice','b')===cwd,'Build employees may share their ordinary project directory')
  ok(employeeWorkspace(store,'Engineering',cwd,'a')===cwd,'the owning employee may reopen its own folder')
  ok(!!workspaceStatus(store,{id:'old',group:'Engineering',cwd:outside}).workspaceError,'legacy invalid workspaces are surfaced without moving files')
  const {planRoom,planOffice,initialBounds,EMPLOYEE_SIZE}=require(join(temp,'lib/canvas.js'))
  const cards=Array.from({length:30},(_,i)=>({id:`c${i}`,group:'Engineering'}))
  const base=initialBounds(0)
  const small=planRoom('Engineering',cards.slice(0,2),base),large=planRoom('Engineering',cards,base)
  ok(large.bounds.width>small.bounds.width&&large.bounds.height>small.bounds.height,'both Team dimensions grow with employee count')
  const intersects=(a,b)=>a.x<b.x+EMPLOYEE_SIZE.width&&a.x+EMPLOYEE_SIZE.width>b.x&&a.y<b.y+EMPLOYEE_SIZE.height&&a.y+EMPLOYEE_SIZE.height>b.y
  ok(large.employees.every((a,i)=>large.employees.slice(i+1).every(b=>!intersects(a.position,b.position))),'30 full-size employees occupy multiple rows without collisions')
  const ring=planRoom('Engineering',cards.slice(0,12),{...base,arrangement:'circle',shape:'ellipse'})
  ok(ring.employees.every((a,i)=>ring.employees.slice(i+1).every(b=>!intersects(a.position,b.position))),'ring layout preserves full-size employee spacing')
  const manual=planRoom('Engineering',[{...cards[0],position:{x:1300,y:900}},...cards.slice(1,4)],base)
  ok(manual.employees.every(e=>e.position.x+190<=manual.bounds.width&&e.position.y+250<=manual.bounds.height)&&manual.bounds.width<1570,'legacy free positions are confined without stretching the enclosing Team or shrinking employees')
  ok(planRoom('Engineering',cards.slice(0,1),base).bounds.height<large.bounds.height,'automatic Team size shrinks after removing employees')
  const all=planOffice({groups:['Engineering','Design'],sessions:cards,rooms:{}})
  ok(all[1].bounds.x>=all[0].bounds.x+all[0].bounds.width,'automatic Team placement prevents growth from crowding adjacent Teams')
  console.log(`PASS=${n} FAIL=0`)
}finally{if(previousWorkspaces===undefined)delete process.env.AGENTS_COMPANY_WORKSPACES;else process.env.AGENTS_COMPANY_WORKSPACES=previousWorkspaces;rmSync(temp,{recursive:true,force:true})}
